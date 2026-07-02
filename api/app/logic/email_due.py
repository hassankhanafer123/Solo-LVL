"""Reminder-due decision — port of lib/email/due.ts."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .time_utils import get_current_week_start, local_date_iso, local_hour


@dataclass
class DueResult:
    daily: bool
    weekly: bool
    local_date: str
    week_start: str


def reminder_due(
    *,
    now: datetime,
    timezone: str,
    send_hour: int,
    reset_hour: int,
    email_enabled: bool,
) -> DueResult:
    local_date = local_date_iso(now, timezone)
    week_start = get_current_week_start(now, timezone, reset_hour)
    at_send_hour = email_enabled and local_hour(now, timezone) == send_hour
    return DueResult(
        daily=at_send_hour,
        weekly=at_send_hour and local_date == week_start,
        local_date=local_date,
        week_start=week_start,
    )
