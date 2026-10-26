"""Runtime configuration, read from environment variables (or a local .env file)."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class TierConfig:
    name: str            # nano | super | ultra
    model: str           # explicit model id ("" = auto-resolve from /v1/models)
    match: tuple         # substrings used to auto-resolve the model id
    price_in: float      # USD per 1M input tokens (used for the cost trace)
    price_out: float     # USD per 1M output tokens


@dataclass(frozen=True)
class Settings:
    api_key: str = field(default_factory=lambda: os.getenv("NEBIUS_API_KEY", ""))
    base_url: str = field(
        default_factory=lambda: os.getenv("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1/")
    )
    # Force demo mode even when a key is present (canned model outputs, no API calls).
    demo_mode: bool = field(default_factory=lambda: os.getenv("APPEALPILOT_DEMO", "").lower() in ("1", "true", "yes"))
    # Reviewer score below which the draft is revised and re-scored.
    revise_threshold: int = field(default_factory=lambda: int(os.getenv("REVISE_THRESHOLD", "85")))
    request_timeout: float = field(default_factory=lambda: _float("REQUEST_TIMEOUT", 180))
    # Credit protection: hard cap on estimated spend (persisted), response cache, per-IP rate limit.
    max_spend_usd: float = field(default_factory=lambda: _float("MAX_SPEND_USD", 5.0))
    cache: bool = field(default_factory=lambda: os.getenv("LLM_CACHE", "1").lower() not in ("0", "false", "no"))
    cache_dir: str = field(default_factory=lambda: os.getenv("CACHE_DIR", ".cache"))
    runs_per_hour: int = field(default_factory=lambda: int(os.getenv("RUNS_PER_HOUR", "6")))
    daily_spend_usd: float = field(default_factory=lambda: _float("DAILY_SPEND_USD", 1.5))
    intakes_per_hour: int = field(default_factory=lambda: int(os.getenv("INTAKES_PER_HOUR", "30")))
    max_concurrent_runs: int = field(default_factory=lambda: int(os.getenv("MAX_CONCURRENT_RUNS", "2")))
    # Only trust X-Forwarded-For when deployed behind a proxy that sets it (the last hop is the real client).
    trust_proxy: bool = field(default_factory=lambda: os.getenv("TRUST_PROXY", "").lower() in ("1", "true", "yes"))

    @property
    def tiers(self) -> dict:
        return {
            "nano": TierConfig(
                "nano",
                os.getenv("MODEL_NANO", ""),
                ("nemotron-3-nano", "nemotron-nano", "nano"),
                _float("PRICE_NANO_IN", 0.06), _float("PRICE_NANO_OUT", 0.24),
            ),
            "super": TierConfig(
                "super",
                os.getenv("MODEL_SUPER", ""),
                ("nemotron-3-super", "nemotron-super", "super"),
                _float("PRICE_SUPER_IN", 0.30), _float("PRICE_SUPER_OUT", 0.90),
            ),
            "ultra": TierConfig(
                "ultra",
                os.getenv("MODEL_ULTRA", ""),
                ("nemotron-3-ultra", "nemotron-ultra", "ultra"),
                _float("PRICE_ULTRA_IN", 1.00), _float("PRICE_ULTRA_OUT", 3.00),
            ),
        }

    @property
    def live(self) -> bool:
        return bool(self.api_key) and not self.demo_mode


settings = Settings()
