"""AppealPilot web server: static UI + a streaming appeal endpoint."""

from __future__ import annotations

import asyncio
import io
import json
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import settings
from .llm import LLMError, router, trace_dict
from .pipeline import run_appeal, run_intake
from .samples import SAMPLES, get_sample, sample_summary

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
MAX_UPLOAD = 15 * 1024 * 1024

app = FastAPI(title="AppealPilot", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.middleware("http")
async def _revalidate_static(request: Request, call_next):
    """Browsers revalidate assets (cheap 304s via ETag), so a redeploy never serves stale CSS/JS."""
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.on_event("startup")
async def _warm_up():
    import asyncio

    asyncio.create_task(router.warm_up())


class AppealRequest(BaseModel):
    denial: str = Field(min_length=40, max_length=40_000)
    policy: str = Field(default="", max_length=400_000)
    records: str = Field(default="", max_length=200_000)
    notes: str = Field(default="", max_length=8_000)


PAGES = {
    "/": "landing.html",
    "/app": "dashboard.html",
    "/app/new": "new.html",
    "/app/case": "case.html",
    "/app/rights": "rights.html",
    "/app/technology": "technology.html",
}


def _page(name: str):
    async def handler():
        return FileResponse(STATIC / "pages" / name, headers={"Cache-Control": "no-cache"})
    return handler


for _path, _name in PAGES.items():
    app.add_api_route(_path, _page(_name), methods=["GET"], include_in_schema=False)


@app.get("/api/health")
async def health():
    models = await router.resolve()
    return {"ok": True, "live": router.live, "models": models,
            "spent_usd": round(router.guard.spent, 4), "cap_usd": settings.max_spend_usd}


@app.get("/api/samples")
async def samples():
    return [sample_summary(s) for s in SAMPLES]


@app.get("/api/samples/{sample_id}")
async def sample(sample_id: str):
    s = get_sample(sample_id)
    if not s:
        raise HTTPException(404, "Unknown sample")
    return s


@app.post("/api/extract")
async def extract(file: UploadFile = File(...)):
    """Turn an uploaded PDF or text file into plain text for the input boxes."""
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "File too large (15 MB max)")
    name = (file.filename or "").lower()
    if name.endswith(".pdf") or data[:4] == b"%PDF":
        from pypdf import PdfReader

        try:
            reader = PdfReader(io.BytesIO(data))
            text = "\n\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception as exc:
            raise HTTPException(422, f"Could not read PDF: {exc}") from exc
        if not text.strip():
            raise HTTPException(422, "This PDF has no text layer (it may be a scan). Paste the text instead.")
    else:
        text = data.decode("utf-8", errors="replace")
    return {"filename": file.filename, "text": text.strip(), "chars": len(text)}


_buckets: dict[tuple[str, str], deque] = defaultdict(deque)
_live_runs = asyncio.Semaphore(max(1, settings.max_concurrent_runs))


def _client_ip(request: Request) -> str:
    """The visitor's address. X-Forwarded-For is client-controlled, so it is only used when
    TRUST_PROXY names what our own proxy controls: "cloudflare" (CF-Connecting-IP, e.g. Render),
    or the X-Forwarded-For entry it sets ("first" or "last")."""
    if settings.trust_proxy == "cloudflare":  # Cloudflare overwrites this header, so visitors can't forge it
        cf = request.headers.get("cf-connecting-ip", "").strip()
        if cf:
            return cf
    fwd = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    if fwd and settings.trust_proxy == "first":
        return fwd[0]
    if fwd and settings.trust_proxy == "last":
        return fwd[-1]
    return request.client.host if request.client else "unknown"


@app.get("/api/whoami")
async def whoami(request: Request):
    """Echo the caller's own IP as the rate limiter sees it (used to verify proxy settings)."""
    seen = {h: request.headers.get(h) for h in ("x-forwarded-for", "true-client-ip", "cf-connecting-ip", "x-real-ip") if request.headers.get(h)}
    return {"ip": _client_ip(request), "trust_proxy": settings.trust_proxy or "off", "headers": seen}


def _rate_limit(request: Request, kind: str, per_hour: int, message: str) -> None:
    """Sliding one-hour window per visitor and endpoint, so a public demo can't drain credits."""
    if not router.live or per_hour <= 0:
        return
    key = (kind, _client_ip(request))
    now, q = time.time(), _buckets[key]
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= per_hour:
        raise HTTPException(429, message)
    q.append(now)
    if len(_buckets) > 50_000:  # drop idle visitors so memory stays bounded
        for k in [k for k, v in _buckets.items() if not v or now - v[-1] > 3600]:
            _buckets.pop(k, None)


def _is_sample(denial: str) -> bool:
    return any(get_sample(s["id"])["denial"] == denial for s in SAMPLES)


class IntakeRequest(BaseModel):
    denial: str = Field(min_length=40, max_length=40_000)
    policy: str = Field(default="", max_length=400_000)


@app.post("/api/intake")
async def intake(req: IntakeRequest, request: Request):
    """Nano-only preview for the wizard. Costs ~$0.0001 and is reused (cached) by the full run."""
    if not _is_sample(req.denial):
        _rate_limit(request, "intake", settings.intakes_per_hour, "Too many letters read this hour. Please try again later.")
    try:
        data, trace = await run_intake(req.denial, req.policy)
    except LLMError as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Intake failed: {exc}") from exc
    return {"intake": data, "trace": trace_dict(trace), "live": router.live}


@app.post("/api/appeal")
async def appeal(req: AppealRequest, request: Request):
    sample = _is_sample(req.denial)
    if not sample:  # sample cases replay from the bundled cache
        _rate_limit(request, "appeal", settings.runs_per_hour,
                    "You've reached the hourly limit for live appeals in this demo. The sample cases still work.")

    async def stream():
        if sample or not router.live:
            async for event in run_appeal(req.denial, req.policy, req.records, req.notes):
                yield f"data: {json.dumps(event)}\n\n"
            return
        # Live runs queue behind a small concurrency cap; give up politely if the queue is long.
        try:
            await asyncio.wait_for(_live_runs.acquire(), timeout=45)
        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'error', 'message': 'The live demo is busy right now. Try again in a minute, or open a sample case.'})}\n\n"
            return
        try:
            async for event in run_appeal(req.denial, req.policy, req.records, req.notes):
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            _live_runs.release()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
