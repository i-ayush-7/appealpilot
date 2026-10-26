"""Routed vs. all-Ultra benchmark.

Runs every sample case through the pipeline twice:
  * routed     Nano / Super / Ultra as designed
  * all-ultra  every call forced to Nemotron Ultra
then scores both final letters with the same independent Ultra judge
(the insurer-side review prompt, temperature 0) and writes eval/results.md.

    python -m eval.run_eval            # from the appealpilot/ folder, needs NEBIUS_API_KEY
"""

from __future__ import annotations

import asyncio
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import prompts  # noqa: E402
from app.llm import router  # noqa: E402
from app.pipeline import run_appeal  # noqa: E402
from app.samples import SAMPLES, get_sample  # noqa: E402

OUT = Path(__file__).resolve().parent / "results.md"


async def run_case(case: dict, force: str | None) -> dict:
    router.force_tier = force
    cost = latency = 0
    letter = ""
    async for ev in run_appeal(case["denial"], case["policy"], case["records"], case["notes"]):
        if ev["type"] == "trace":
            cost += ev["cost_usd"]
            latency += ev["latency_ms"]
        elif ev["type"] == "error":
            raise RuntimeError(ev["message"])
        elif ev["type"] == "done":
            letter = ev["letter"]
    router.force_tier = None
    return {"cost": cost, "latency_ms": latency, "letter": letter}


async def judge(case: dict, letter: str) -> int:
    judge_input = (
        f"DENIAL LETTER:\n{case['denial']}\n\nPOLICY:\n{case['policy']}\n\n"
        f"MEDICAL RECORDS:\n{case['records']}\n\nAPPEAL LETTER:\n{letter}"
    )
    review, _ = await router.call_json(
        "ultra", "judge", prompts.REVIEW_SYSTEM, judge_input, reasoning=True, max_tokens=6000, temperature=0.0
    )
    return int(review.get("score") or 0)


async def main() -> None:
    await router.resolve()
    if not router.live:
        print("Set NEBIUS_API_KEY to run the benchmark (demo mode has canned outputs).")
        return
    rows = []
    for s in SAMPLES:
        case = get_sample(s["id"])
        print(f"→ {s['id']}")
        routed = await run_case(case, None)
        ultra = await run_case(case, "ultra")
        routed["score"], ultra["score"] = await judge(case, routed["letter"]), await judge(case, ultra["letter"])
        rows.append((s["id"], routed, ultra))
        print(f"   routed  score {routed['score']:>3}  ${routed['cost']:.4f}  {routed['latency_ms'] / 1000:.1f}s")
        print(f"   ultra   score {ultra['score']:>3}  ${ultra['cost']:.4f}  {ultra['latency_ms'] / 1000:.1f}s")

    def avg(key, which):
        return statistics.mean(r[which][key] for r in rows)

    lines = [
        "# Routed vs. all-Ultra",
        "",
        f"Models: `{router.models}`",
        "",
        "| Case | Routed score | All-Ultra score | Routed cost | All-Ultra cost | Routed time | All-Ultra time |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for cid, r, u in rows:
        lines.append(
            f"| {cid} | {r['score']} | {u['score']} | ${r['cost']:.4f} | ${u['cost']:.4f} | "
            f"{r['latency_ms'] / 1000:.1f}s | {u['latency_ms'] / 1000:.1f}s |"
        )
    r_cost, u_cost = avg("cost", 1), avg("cost", 2)
    lines += [
        f"| **Average** | **{avg('score', 1):.0f}** | **{avg('score', 2):.0f}** | **${r_cost:.4f}** | **${u_cost:.4f}** | "
        f"**{avg('latency_ms', 1) / 1000:.1f}s** | **{avg('latency_ms', 2) / 1000:.1f}s** |",
        "",
        f"Routing cost {100 * (1 - r_cost / u_cost):.0f}% less than sending every call to Ultra.",
        "Scores come from an independent Ultra judge using the insurer-side review rubric (0-100).",
    ]
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
