"""Build app/seed_cache: model responses for the bundled sample cases.

The seed cache ships with the app, so sample runs (and the wizard's sample intake) cost nothing
on a fresh deployment. Re-run this after changing prompts, models or sample text:

    python -m eval.seed_samples          # from the appealpilot/ folder, needs NEBIUS_API_KEY

Calls already in the local response cache are reused, so re-seeding only pays for what changed.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.llm import SEED_DIR, router  # noqa: E402
from app.pipeline import run_appeal, run_intake  # noqa: E402
from app.samples import SAMPLES, get_sample  # noqa: E402


async def main() -> None:
    await router.resolve()
    if not router.live:
        print("Set NEBIUS_API_KEY (and unset APPEALPILOT_DEMO) to seed real model responses.")
        return
    start = router.guard.spent
    for s in SAMPLES:
        case = get_sample(s["id"])
        await run_intake(case["denial"], case["policy"])  # the wizard's preview call
        score = None
        async for ev in run_appeal(case["denial"], case["policy"], case["records"], case["notes"]):
            if ev["type"] == "error":
                raise SystemExit(f"{s['id']}: {ev['message']}")
            if ev["type"] == "stage" and ev["status"] == "done" and ev["stage"] in ("review", "rescore"):
                score = ev["data"].get("score")
        print(f"{s['id']:<22} final score {score}")

    # Read every response the sample runs used (local cache first, then the old seed), then
    # replace the seed folder with exactly that set, so stale entries don't accumulate.
    keep = {}
    for key in sorted(router.guard.touched):
        for d in (router.guard.dir, SEED_DIR):
            f = d / f"{key}.json"
            if f.exists():
                keep[key] = f.read_bytes()
                break
    SEED_DIR.mkdir(exist_ok=True)
    for old in SEED_DIR.glob("*.json"):
        old.unlink()
    for key, data in keep.items():
        (SEED_DIR / f"{key}.json").write_bytes(data)
    print(f"Seeded {len(keep)} responses into {SEED_DIR} · spent ${router.guard.spent - start:.4f} this run")


if __name__ == "__main__":
    asyncio.run(main())
