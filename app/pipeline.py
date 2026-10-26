"""The AppealPilot pipeline. Each stage is routed to the cheapest Nemotron tier that can do it well:

  1. intake    Nano   extract facts + classify the denial (fast, structured)
  2. retrieve  local  BM25 over the policy, keeps prompts small
  3. evidence  Super  build arguments with citations + evidence checklist
  4. draft     Super  write the appeal letter
  5. review    Ultra  adversarial insurer-side review with reasoning (score + fixes)
  6. revise    Super  apply the reviewer's fixes      (only if score < threshold)
  7. rescore   Ultra  confirm the revision            (only if revised)

`run_appeal` is an async generator of events the API streams to the browser.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from typing import AsyncIterator

from . import prompts
from .config import settings
from .llm import LLMError, router, trace_dict
from .retrieval import rank, split_clauses

MAX_RECORDS = 14_000  # chars of medical records sent downstream
_EMPLOYER = re.compile(r"\b(ERISA|employer|group\s*(plan|#|no\.?|number)?|Group:|summary plan description|LLC|Inc\.)", re.I)
_DATE_FORMATS = ("%B %d, %Y", "%b %d, %Y", "%m/%d/%Y", "%Y-%m-%d", "%d %B %Y", "%m-%d-%Y", "%b. %d, %Y")


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    s = re.sub(r"(\d)(st|nd|rd|th)", r"\1", s.strip())
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def deadline_info(intake: dict) -> dict:
    sent = _parse_date(intake.get("denial_date"))
    days = intake.get("appeal_window_days")
    if not sent or not isinstance(days, int):
        return {"deadline": None, "days_left": None}
    due = sent + timedelta(days=days)
    return {"deadline": due.isoformat(), "days_left": (due - date.today()).days}


def _event(kind: str, **data) -> dict:
    return {"type": kind, **data}


def applicable_laws(hooks: list, intake: dict, denial: str) -> list:
    """Drop laws whose trigger conditions the facts don't meet. Models over-cite these two."""
    emergency = intake.get("category") == "out_of_network" or re.search(r"\bemergenc|\bER\b|ambulance", denial, re.I)
    kept = []
    for h in hooks:
        name = str(h.get("name", "")) if isinstance(h, dict) else str(h)
        if re.search(r"ERISA", name, re.I) and intake.get("plan_type") != "employer":
            continue
        if re.search(r"No Surprises", name, re.I) and not emergency:
            continue
        kept.append(h)
    return kept


async def run_intake(denial: str, policy: str = ""):
    """Nano intake. Shared by the wizard preview and the full pipeline, so the second call is a cache hit."""
    intake, t = await router.call_json(
        "nano", "intake", prompts.INTAKE_SYSTEM, f"DENIAL LETTER:\n{denial}", max_tokens=1200, temperature=0.0
    )
    intake.update(deadline_info(intake))
    # Plan type decides which laws apply (e.g. ERISA), so don't let the model guess it.
    if intake.get("plan_type") == "employer" and not _EMPLOYER.search(denial + "\n" + policy[:5000]):
        intake["plan_type"] = "unknown"
    return intake, t


async def run_appeal(denial: str, policy: str, records: str, notes: str) -> AsyncIterator[dict]:
    traces = []

    def traced(t):
        traces.append(t)
        return _event("trace", **trace_dict(t))

    models = await router.resolve()
    yield _event("meta", live=router.live, models=models)

    try:
        # 1. Intake — Nano
        yield _event("stage", stage="intake", status="running")
        intake, t = await run_intake(denial, policy)
        yield traced(t)
        yield _event("stage", stage="intake", status="done", data=intake)

        # 2. Retrieve — local, no model call
        yield _event("stage", stage="retrieve", status="running")
        queries = [
            str(intake.get("service") or ""),
            str(intake.get("denial_reason_quoted") or ""),
            str(intake.get("category") or "").replace("_", " "),
            notes[:500],
        ]
        clauses = [
            {"id": c.id, "title": c.title, "text": c.text, "score": round(s, 2)}
            for c, s in rank(split_clauses(policy), queries)
        ]
        yield _event("stage", stage="retrieve", status="done", data={"clauses": clauses})

        records = records[:MAX_RECORDS]
        case = prompts.case_block(intake, clauses, records, notes)

        # 3. Evidence — Super
        yield _event("stage", stage="evidence", status="running")
        evidence, t = await router.call_json("super", "evidence", prompts.EVIDENCE_SYSTEM, case, max_tokens=2500)
        yield traced(t)
        evidence["legal_hooks"] = applicable_laws(evidence.get("legal_hooks") or [], intake, denial)
        yield _event("stage", stage="evidence", status="done", data=evidence)

        # 4. Draft — Super
        yield _event("stage", stage="draft", status="running")
        letter, t = await router.call(
            "super", "draft", prompts.DRAFT_SYSTEM,
            f"{case}\n\nCASE PLAN (JSON):\n{json.dumps(evidence, indent=2)}", max_tokens=2500, temperature=0.4,
        )
        yield traced(t)
        yield _event("stage", stage="draft", status="done", data={"letter": letter})

        # 5. Review — Ultra, with reasoning on
        review_input = f"{case}\n\nAPPEAL LETTER:\n{letter}"
        yield _event("stage", stage="review", status="running")
        review, t = await router.call_json(
            "ultra", "review", prompts.REVIEW_SYSTEM, review_input, reasoning=True, max_tokens=6000, temperature=0.2
        )
        yield traced(t)
        yield _event("stage", stage="review", status="done", data=review)

        # 6-7. Revise + rescore when the reviewer isn't convinced, or found anything that must not ship
        score = int(review.get("score") or 0)
        must_fix = review.get("factual_errors") or any(
            str(w.get("severity", "")).lower() == "high" for w in review.get("weaknesses") or []
        )
        if score < settings.revise_threshold or must_fix:
            yield _event("stage", stage="revise", status="running")
            letter, t = await router.call(
                "super", "revise", prompts.REVISE_SYSTEM,
                f"{case}\n\nCURRENT LETTER:\n{letter}\n\nREVIEWER FEEDBACK (JSON):\n{json.dumps(review, indent=2)}",
                max_tokens=2800, temperature=0.3,
            )
            yield traced(t)
            yield _event("stage", stage="revise", status="done", data={"letter": letter})

            yield _event("stage", stage="rescore", status="running")
            rescore, t = await router.call_json(
                "ultra", "rescore", prompts.REVIEW_SYSTEM, f"{case}\n\nAPPEAL LETTER:\n{letter}",
                reasoning=True, max_tokens=6000, temperature=0.2,
            )
            yield traced(t)
            rescore["previous_score"] = score
            yield _event("stage", stage="rescore", status="done", data=rescore)
        else:
            yield _event("stage", stage="revise", status="skipped")
            yield _event("stage", stage="rescore", status="skipped")

    except LLMError as exc:
        yield _event("error", message=str(exc))
        return
    except Exception as exc:  # surface anything unexpected to the UI instead of a dead stream
        yield _event("error", message=f"{type(exc).__name__}: {exc}")
        return

    cost = sum(t.cost_usd for t in traces)
    ultra_cost = sum(t.ultra_cost_usd for t in traces)
    yield _event(
        "done",
        letter=letter,
        total_cost_usd=round(cost, 6),
        all_ultra_cost_usd=round(ultra_cost, 6),
        savings_pct=round(100 * (1 - cost / ultra_cost), 1) if ultra_cost else 0,
        total_latency_ms=sum(t.latency_ms for t in traces),
        calls=len(traces),
    )
