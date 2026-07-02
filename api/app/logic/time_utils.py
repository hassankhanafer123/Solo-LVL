"""Timezone-aware date helpers — port of lib/time.ts.

The TS version used date-fns-tz; here we use the stdlib zoneinfo. Behaviour is
matched against the original vitest cases in tests/test_time.py, including the
reset-hour week anchoring and DST handling for America/New_York.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo


def local_hour(d: datetime, tz: str) -> int:
    return d.astimezone(ZoneInfo(tz)).hour


def local_date_iso(d: datetime, tz: str) -> str:
    return d.astimezone(ZoneInfo(tz)).strftime("%Y-%m-%d")


def is_same_local_date(a: datetime, b: datetime, tz: str) -> bool:
    return local_date_iso(a, tz) == local_date_iso(b, tz)


def yesterday_local(iso_date: str) -> str:
    d = date.fromisoformat(iso_date) - timedelta(days=1)
    return d.strftime("%Y-%m-%d")


def get_current_week_start(now: datetime, tz: str, reset_hour: int) -> str:
    """Monday (YYYY-MM-DD) of the user's logical local week.

    Before `reset_hour` local time, the active week still counts as the
    previous day's bucket. Mirrors lib/time.ts getCurrentWeekStart.
    """
    local_date = local_date_iso(now, tz)
    local_h = local_hour(now, tz)
    effective = yesterday_local(local_date) if local_h < reset_hour else local_date

    d = date.fromisoformat(effective)
    # Python's weekday(): Mon=0 .. Sun=6 — exactly "days since Monday".
    monday = d - timedelta(days=d.weekday())
    return monday.strftime("%Y-%m-%d")


def days_of_week(week_start_iso: str) -> list[str]:
    start = date.fromisoformat(week_start_iso)
    return [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
