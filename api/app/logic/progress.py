"""Streak transition — port of lib/tracker/progress.ts."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class StreakResult:
    current: int
    best: int


def decide_streak(*, current: int, best: int, yesterday_cleared: bool) -> StreakResult:
    """Streak transition for the moment today's required quests all clear."""
    new_current = current + 1 if yesterday_cleared else 1
    return StreakResult(current=new_current, best=max(new_current, best))
