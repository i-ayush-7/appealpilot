"""Tiered Nemotron router on Nebius Token Factory.

Every model call goes through `Router.call(tier, stage, ...)`. The router:
  * maps a tier (nano / super / ultra) to a concrete Nemotron model id,
    auto-discovered from Token Factory's /v1/models when not pinned via env,
  * records latency, token usage and cost for each call (the "routing trace"),
  * computes what the same call would have cost on Ultra, so the UI can show
    the savings from routing,
  * falls back to canned outputs in demo mode (no API key).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import random
import re
import time
from dataclasses import asdict, dataclass

from pathlib import Path

from openai import AsyncOpenAI

from .config import settings
from . import mock

TIER_ORDER = ["nano", "super", "ultra"]
# Model ids containing these are not general text-chat models.
_SKIP = ("embed", "reward", "guard", "safety", "retriever", "rerank", "parse", "vl", "omni")


@dataclass
class CallTrace:
    stage: str
    tier: str
    model: str
    latency_ms: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    ultra_cost_usd: float  # same tokens priced at the Ultra tier
    fallback: str = ""     # set when the requested tier was unavailable
    cached: bool = False   # replayed from the response cache (no credits spent)


class LLMError(RuntimeError):
    pass


class CreditGuard:
    """Protects the Token Factory balance.

    * Response cache: identical requests (same model, prompts and params) are replayed from
      disk, so re-running a sample case or a judge clicking around costs nothing.
    * Spend cap: estimated spend is persisted across restarts; live calls stop at MAX_SPEND_USD.
    """

    def __init__(self) -> None:
        self.dir = Path(settings.cache_dir)
        if not self.dir.is_absolute():
            self.dir = Path(__file__).resolve().parent.parent / self.dir
        self.dir.mkdir(parents=True, exist_ok=True)
        self.ledger = self.dir / "spend.json"
        try:
            self.spent = float(json.loads(self.ledger.read_text())["usd"])
        except Exception:
            self.spent = 0.0

    @staticmethod
    def key(*parts) -> str:
        return hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest()[:32]

    def get(self, key: str) -> dict | None:
        if not settings.cache:
            return None
        try:
            return json.loads((self.dir / f"{key}.json").read_text(encoding="utf-8"))
        except Exception:
            return None

    def put(self, key: str, value: dict) -> None:
        if settings.cache:
            (self.dir / f"{key}.json").write_text(json.dumps(value), encoding="utf-8")

    def check(self) -> None:
        if self.spent >= settings.max_spend_usd:
            raise LLMError(
                f"Spend cap reached (${self.spent:.2f} of ${settings.max_spend_usd:.2f}). "
                "Raise MAX_SPEND_USD in .env to continue."
            )

    def charge(self, usd: float) -> None:
        self.spent += usd
        self.ledger.write_text(json.dumps({"usd": round(self.spent, 6)}))


def _strip_think(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S)
    # Unterminated reasoning block: keep whatever follows the last closing tag.
    if "</think>" in text:
        text = text.split("</think>")[-1]
    return text.strip()


def parse_json(text: str) -> dict:
    """Extract the first JSON object from a model reply (tolerates fences and prose)."""
    text = _strip_think(text)
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise LLMError(f"Model returned malformed JSON: {exc}") from exc
    raise LLMError("Model reply did not contain a JSON object")


class Router:
    def __init__(self) -> None:
        self.live = settings.live
        self.client = (
            AsyncOpenAI(api_key=settings.api_key, base_url=settings.base_url, timeout=settings.request_timeout)
            if self.live
            else None
        )
        self.tiers = settings.tiers
        self.models: dict[str, str] = {}
        self.force_tier: str | None = None  # eval baseline: send every call to one tier
        self.guard = CreditGuard()
        self._resolved = False
        self._lock = asyncio.Lock()

    # ---------- model discovery ----------
    async def resolve(self) -> dict[str, str]:
        async with self._lock:
            if self._resolved:
                return self.models
            available: list[str] = []
            if self.live:
                try:
                    listing = await self.client.models.list()
                    available = [m.id for m in listing.data]
                except Exception:  # discovery is best-effort; env pins still work
                    available = []
            nemotron = [m for m in available if "nemotron" in m.lower() and not any(s in m.lower() for s in _SKIP)]
            for name, tier in self.tiers.items():
                if tier.model:
                    self.models[name] = tier.model
                    continue
                pick = ""
                for pattern in tier.match:
                    hits = sorted(m for m in nemotron if pattern in m.lower())
                    if hits:
                        pick = hits[-1]  # highest version sorts last
                        break
                if pick:
                    self.models[name] = pick
            if not self.live:
                self.models = {
                    "nano": "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
                    "super": "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B",
                    "ultra": "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B",
                }
            self.available = available
            self._resolved = True
            return self.models

    async def warm_up(self) -> None:
        """Ping each model with a 1-token request so the first real run doesn't hit a cold start.
        Costs well under $0.0001 per startup."""
        await self.resolve()
        if not self.live:
            return

        async def ping(model):
            try:
                await self.client.chat.completions.create(
                    model=model, messages=[{"role": "user", "content": "hi"}], max_tokens=1
                )
            except Exception:
                pass

        await asyncio.gather(*(ping(m) for m in set(self.models.values())))

    def _model_for(self, tier: str) -> tuple[str, str, str]:
        """Return (model id, effective tier, fallback note)."""
        if tier in self.models:
            return self.models[tier], tier, ""
        # Nearest available tier: prefer stronger, then weaker.
        idx = TIER_ORDER.index(tier)
        for alt in TIER_ORDER[idx + 1 :] + TIER_ORDER[:idx][::-1]:
            if alt in self.models:
                return self.models[alt], alt, f"{tier} unavailable → {alt}"
        raise LLMError(
            "No Nemotron model could be resolved. Set MODEL_NANO / MODEL_SUPER / MODEL_ULTRA "
            "to model ids from your Token Factory model list."
        )

    def _cost(self, tier: str, tin: int, tout: int) -> float:
        t = self.tiers[tier]
        return (tin * t.price_in + tout * t.price_out) / 1_000_000

    # ---------- the one entry point ----------
    async def call(
        self,
        tier: str,
        stage: str,
        system: str,
        user: str,
        *,
        json_mode: bool = False,
        reasoning: bool = False,
        max_tokens: int = 2048,
        temperature: float = 0.3,
    ) -> tuple[str, CallTrace]:
        await self.resolve()
        model, eff_tier, fallback = self._model_for(self.force_tier or tier)
        started = time.perf_counter()
        cached = False

        if not self.live:
            text = mock.response(stage)
            await asyncio.sleep({"nano": 0.4, "super": 1.1, "ultra": 1.8}[eff_tier] * random.uniform(0.8, 1.2))
            tin, tout = max(1, len(system + user) // 4), max(1, len(text) // 4)
        else:
            key = self.guard.key(model, system, user, json_mode, reasoning, max_tokens, temperature)
            hit = self.guard.get(key)
            if hit:
                text, tin, tout, cached = hit["text"], hit["tin"], hit["tout"], True
            else:
                self.guard.check()
                text, tin, tout = await self._chat(model, system, user, json_mode, reasoning, max_tokens, temperature)
                self.guard.charge(self._cost(eff_tier, tin, tout))
                if _strip_think(text):
                    self.guard.put(key, {"text": text, "tin": tin, "tout": tout})

        latency = int((time.perf_counter() - started) * 1000)
        trace = CallTrace(
            stage=stage,
            tier=eff_tier,
            model=model,
            latency_ms=latency,
            tokens_in=tin,
            tokens_out=tout,
            cost_usd=round(self._cost(eff_tier, tin, tout), 6),
            ultra_cost_usd=round(self._cost("ultra", tin, tout), 6),
            fallback=fallback,
            cached=cached,
        )
        return _strip_think(text), trace

    async def _chat(self, model, system, user, json_mode, reasoning, max_tokens, temperature):
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        kwargs = dict(model=model, messages=messages, max_tokens=max_tokens, temperature=temperature)
        extras = {"chat_template_kwargs": {"enable_thinking": reasoning}}
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        # Not every deployment accepts every option, so degrade gracefully.
        attempts = [dict(kwargs, extra_body=extras), kwargs, {k: v for k, v in kwargs.items() if k != "response_format"}]
        last_exc = None
        for attempt in attempts:
            try:
                resp = await self.client.chat.completions.create(**attempt)
                text = resp.choices[0].message.content or ""
                usage = resp.usage
                tin = usage.prompt_tokens if usage else len(system + user) // 4
                tout = usage.completion_tokens if usage else len(text) // 4
                return text, tin, tout
            except Exception as exc:  # BadRequest on unsupported params -> try next shape
                last_exc = exc
                status = getattr(exc, "status_code", None)
                if status == 402:
                    raise LLMError(
                        "Nebius Token Factory says this account is out of credits (402 Payment Required). "
                        "Add credits or raise the project budget in Token Factory, then try again."
                    ) from exc
                if status == 401:
                    raise LLMError("Nebius Token Factory rejected the API key (401). Check NEBIUS_API_KEY in .env.") from exc
                if status not in (400, 422):
                    break
        raise LLMError(f"{model}: {last_exc}")

    async def call_json(self, tier: str, stage: str, system: str, user: str, **kw) -> tuple[dict, CallTrace]:
        text, trace = await self.call(tier, stage, system, user, json_mode=True, **kw)
        try:
            return parse_json(text), trace
        except LLMError:
            # One repair attempt on the cheapest tier.
            fixed, _ = await self.call(
                "nano", stage, "Return ONLY valid JSON. No prose, no code fences.",
                f"Fix this into a single valid JSON object:\n\n{text}", json_mode=True,
            )
            return parse_json(fixed), trace


router = Router()


def trace_dict(t: CallTrace) -> dict:
    return asdict(t)
