"""FastAPI app — exposes the 10 tracker actions as REST endpoints.

Route map (was: Next.js server actions in app/actions/tracker.ts):

  GET  /api/snapshot                          -> getTodaySnapshot
  POST /api/username                          -> setUsername
  POST /api/quests/{id}/progress             -> setQuestProgress
  POST /api/quests/{id}/complete             -> completeQuest
  POST /api/quests/{id}/uncomplete           -> uncompleteQuest
  POST /api/weekly/{id}/progress             -> setWeeklyProgress
  GET  /api/leaderboard                       -> getLeaderboard
  POST /api/leaderboard/join                  -> joinLeaderboard
  POST /api/leaderboard/leave                 -> leaveLeaderboard
  POST /api/plan                              -> planWeek
"""

from __future__ import annotations

import logging

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from .auth import AuthContext, require_user
from .config import get_settings
from .schemas import (
    LeaderboardView,
    PlanWeekBody,
    SetProgressBody,
    SetUsernameBody,
    SetUsernameResult,
    TrackerSnapshot,
)
from .tracker_service import TrackerService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uvicorn.error")

_settings = get_settings()

# Error tracking — only active when a DSN is configured (off in dev/CI).
if _settings.sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(dsn=_settings.sentry_dsn, traces_sample_rate=0.1)

app = FastAPI(title="Solo Leveling Life API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Rate limiting -------------------------------------------------------
def _client_key(request: Request) -> str:
    # On Fly, Fly-Client-IP is set by the edge proxy and can't be spoofed.
    # X-Forwarded-For is appended-to (leftmost hop is client-controlled), so
    # it is only a last resort for non-Fly deployments behind one proxy.
    fly_ip = request.headers.get("fly-client-ip")
    if fly_ip:
        return fly_ip.strip()
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_client_key, default_limits=[_settings.rate_limit])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# --- Don't leak internals on unhandled errors ---------------------------
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


def _svc(ctx: AuthContext) -> TrackerService:
    return TrackerService(ctx.client, ctx.user_id)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/internal/cron/reminders")
def cron_reminders(authorization: str | None = Header(default=None)):
    """Triggered hourly by a scheduler (GitHub Actions). Guarded by CRON_SECRET."""
    import hmac

    from .cron_service import run_reminders

    secret = _settings.cron_secret
    # Constant-time compare to avoid leaking the secret via response timing.
    if not secret or not hmac.compare_digest(authorization or "", f"Bearer {secret}"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return run_reminders()


@app.get("/api/snapshot", response_model=TrackerSnapshot)
def get_snapshot(ctx: AuthContext = Depends(require_user)):
    return _svc(ctx).get_today_snapshot()


@app.post("/api/username", response_model=SetUsernameResult)
def set_username(body: SetUsernameBody, ctx: AuthContext = Depends(require_user)):
    return _svc(ctx).set_username(body.username)


@app.post("/api/quests/{instance_id}/progress", response_model=TrackerSnapshot)
def set_quest_progress(
    instance_id: str, body: SetProgressBody, ctx: AuthContext = Depends(require_user)
):
    return _svc(ctx).set_quest_progress(instance_id, body.actualValue)


@app.post("/api/quests/{instance_id}/complete", response_model=TrackerSnapshot)
def complete_quest(instance_id: str, ctx: AuthContext = Depends(require_user)):
    return _svc(ctx).complete_quest(instance_id)


@app.post("/api/quests/{instance_id}/uncomplete", response_model=TrackerSnapshot)
def uncomplete_quest(instance_id: str, ctx: AuthContext = Depends(require_user)):
    return _svc(ctx).uncomplete_quest(instance_id)


@app.post("/api/weekly/{weekly_instance_id}/progress", response_model=TrackerSnapshot)
def set_weekly_progress(
    weekly_instance_id: str, body: SetProgressBody, ctx: AuthContext = Depends(require_user)
):
    return _svc(ctx).set_weekly_progress(weekly_instance_id, body.actualValue)


@app.get("/api/leaderboard", response_model=LeaderboardView)
def get_leaderboard(ctx: AuthContext = Depends(require_user)):
    return _svc(ctx).get_leaderboard()


@app.post("/api/leaderboard/join", response_model=LeaderboardView)
def join_leaderboard(ctx: AuthContext = Depends(require_user)):
    return _svc(ctx).join_leaderboard()


@app.post("/api/leaderboard/leave", response_model=LeaderboardView)
def leave_leaderboard(ctx: AuthContext = Depends(require_user)):
    return _svc(ctx).leave_leaderboard()


@app.post("/api/plan", response_model=TrackerSnapshot)
def plan_week(body: PlanWeekBody, ctx: AuthContext = Depends(require_user)):
    rows = [r.model_dump() for r in body.rows]
    return _svc(ctx).plan_week(rows)
