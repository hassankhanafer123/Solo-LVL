"""Email reminder cron — port of app/api/cron/reminders/route.ts.

Iterates all profiles, decides who is due this hour, dedupes via email_log,
sends morning/weekly emails via Resend, and records each attempt. Uses the
service-role (admin) client because it operates across all users.
"""

from __future__ import annotations

from datetime import datetime, timezone

from .config import get_settings
from .db import admin_client
from .email.send import send_email
from .email.templates import morning_email_html, weekly_email_html
from .logic.email_due import reminder_due


def _email_map(admin) -> dict[str, str | None]:
    """All auth users' emails. Paginates — GoTrue defaults to 50/page."""
    out: dict[str, str | None] = {}
    page_num = 1
    while True:
        page = admin.auth.admin.list_users(page=page_num, per_page=1000)
        users = page if isinstance(page, list) else getattr(page, "users", [])
        if not users:
            break
        for u in users:
            out[u.id] = getattr(u, "email", None)
        if len(users) < 1000:
            break
        page_num += 1
    return out


def _claim(admin, user_id: str, local_date: str, kind: str) -> bool:
    """Insert the email_log row BEFORE sending (status='pending').

    The (user_id, quest_date, kind) unique index makes this a race-safe
    claim: if another run already inserted the row, ignore_duplicates makes
    the upsert return no data and we skip. Requires the 'pending' enum value
    from migration 0008.
    """
    res = (
        admin.table("email_log").upsert(
            {"user_id": user_id, "quest_date": local_date, "kind": kind,
             "status": "pending", "error": None},
            on_conflict="user_id,quest_date,kind", ignore_duplicates=True,
        ).execute()
    )
    return bool(res and res.data)


def _daily_tasks(admin, user_id: str, week_start: str) -> list[dict]:
    wp = (
        admin.table("week_plan").select("id")
        .eq("user_id", user_id).eq("week_start_date", week_start).maybe_single().execute()
    )
    if not (wp and wp.data):
        return []
    rows = (
        admin.table("quest_template").select("name, primary_stat")
        .eq("week_plan_id", wp.data["id"]).eq("active", True).eq("cadence", "daily")
        .order("sort_order").execute().data
    ) or []
    return [{"name": r["name"], "stat": r["primary_stat"]} for r in rows]


def run_reminders(now: datetime | None = None, admin=None) -> dict:
    s = get_settings()
    admin = admin or admin_client()
    now = now or datetime.now(timezone.utc)
    emails = _email_map(admin)
    profiles = (
        admin.table("profile").select(
            "user_id, username, timezone, email_send_hour_local, "
            "reset_hour_local, email_enabled, email_target"
        ).execute().data
    ) or []

    daily_sent = weekly_sent = skipped = 0
    errors: list[str] = []

    for p in profiles:
        # One user's bad data (e.g. a garbage timezone written directly to the
        # DB) must never break the run for everyone else.
        try:
            due = reminder_due(
                now=now,
                timezone=p["timezone"],
                send_hour=p["email_send_hour_local"],
                reset_hour=p["reset_hour_local"],
                email_enabled=p["email_enabled"],
            )
            if not due.daily and not due.weekly:
                skipped += 1
                continue
            # email_target is client-writable history; only the auth email is
            # verified. Never send anywhere else (abuse vector otherwise).
            recipient = emails.get(p["user_id"])
            if not recipient:
                skipped += 1
                continue
            username = p.get("username") or "Hunter"

            for kind in (k for k in ("daily", "weekly") if getattr(due, k)):
                if not _claim(admin, p["user_id"], due.local_date, kind):
                    skipped += 1
                    continue
                status, error = "sent", None
                try:
                    if kind == "daily":
                        html = morning_email_html(
                            username=username,
                            tasks=_daily_tasks(admin, p["user_id"], due.week_start),
                            app_url=s.app_url,
                        )
                        subject = f"Good morning, {username} — today's run"
                    else:
                        html = weekly_email_html(username=username, app_url=s.app_url)
                        subject = "Plan your week on DayMaxing"
                    send_email(to=recipient, subject=subject, html=html)
                except Exception as exc:  # noqa: BLE001
                    status, error = "failed", str(exc)
                    errors.append(f"{kind}:{p['user_id']}:{error}")
                else:
                    if kind == "daily":
                        daily_sent += 1
                    else:
                        weekly_sent += 1
                admin.table("email_log").update(
                    {"status": status, "error": error}
                ).eq("user_id", p["user_id"]).eq("quest_date", due.local_date) \
                 .eq("kind", kind).execute()
        except Exception as exc:  # noqa: BLE001
            errors.append(f"user:{p.get('user_id')}:{exc}")

    return {"dailySent": daily_sent, "weeklySent": weekly_sent, "skipped": skipped, "errors": errors}
