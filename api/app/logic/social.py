"""Pure duel logic — no I/O. Scoring queries live in social_service.py."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Literal, Optional
from zoneinfo import ZoneInfo


def duel_ends_at(week_start_iso: str, tz: str, reset_hour: int) -> datetime:
    """A duel over the week starting `week_start_iso` ends when that week
    rolls over: the following Monday at the owner's reset hour, local time,
    expressed in UTC. Mirrors get_current_week_start's reset-hour anchoring.
    """
    next_monday = date.fromisoformat(week_start_iso) + timedelta(days=7)
    local = datetime(
        next_monday.year, next_monday.month, next_monday.day,
        reset_hour, 0, tzinfo=ZoneInfo(tz),
    )
    return local.astimezone(ZoneInfo("UTC"))


def decide_duel_winner(
    challenger_score: int, opponent_score: int
) -> Optional[Literal["challenger", "opponent"]]:
    if challenger_score > opponent_score:
        return "challenger"
    if opponent_score > challenger_score:
        return "opponent"
    return None  # draw
