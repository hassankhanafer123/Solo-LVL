"""XP / level / title math — port of lib/xp.ts."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal, Optional

Title = Literal["Novice", "Awakened", "Elite Hunter", "Necromancer", "Shadow Monarch"]

TITLE_BONUS: dict[str, float] = {
    "Novice": 1.0,
    "Awakened": 1.05,
    "Elite Hunter": 1.10,
    "Necromancer": 1.15,
    "Shadow Monarch": 1.20,
}

# Ordered highest-threshold first so the first match wins.
_TITLE_THRESHOLDS: tuple[tuple[int, str], ...] = (
    (100, "Shadow Monarch"),
    (50, "Necromancer"),
    (25, "Elite Hunter"),
    (10, "Awakened"),
    (1, "Novice"),
)


def xp_to_next(level: int) -> int:
    if level < 1:
        raise ValueError("level must be >= 1")
    return math.ceil(150 * (1.15 ** (level - 1)))


def title_for_level(level: int) -> str:
    for threshold, title in _TITLE_THRESHOLDS:
        if level >= threshold:
            return title
    return "Novice"  # unreachable: threshold 1 covers all positive levels


@dataclass
class WeeklyLevelResult:
    leveled_up: bool
    new_level: int


def decide_weekly_level_up(level: int, completion_pct: float) -> WeeklyLevelResult:
    """Leveling v2: a week with >=85% completion grants one level."""
    if completion_pct >= 0.85:
        return WeeklyLevelResult(leveled_up=True, new_level=level + 1)
    return WeeklyLevelResult(leveled_up=False, new_level=level)


@dataclass
class XpResult:
    level: int
    total_xp: int
    xp_in_level: int
    xp_to_next: int
    unallocated_points: int
    title: str
    levels_gained: int
    title_unlocked: Optional[str]


def apply_xp_gain(
    *,
    level: int,
    total_xp: int,
    xp_in_level: int,
    xp_to_next_value: int,
    unallocated_points: int,
    title: str,
    raw_xp: int,
) -> XpResult:
    if raw_xp < 0:
        raise ValueError("raw_xp must be >= 0")
    if raw_xp == 0:
        return XpResult(
            level=level,
            total_xp=total_xp,
            xp_in_level=xp_in_level,
            xp_to_next=xp_to_next_value,
            unallocated_points=unallocated_points,
            title=title,
            levels_gained=0,
            title_unlocked=None,
        )

    bonus = TITLE_BONUS[title]
    xp = math.floor(raw_xp * bonus)

    cur_level = level
    cur_xp_in_level = xp_in_level + xp
    threshold = xp_to_next_value
    points_gained = 0
    levels_gained = 0
    start_title = title

    while cur_xp_in_level >= threshold:
        cur_xp_in_level -= threshold
        cur_level += 1
        levels_gained += 1
        points_gained += 5
        threshold = xp_to_next(cur_level)

    new_title = title_for_level(cur_level)
    title_unlocked = new_title if new_title != start_title else None

    return XpResult(
        level=cur_level,
        total_xp=total_xp + xp,
        xp_in_level=cur_xp_in_level,
        xp_to_next=threshold,
        unallocated_points=unallocated_points + points_gained,
        title=new_title,
        levels_gained=levels_gained,
        title_unlocked=title_unlocked,
    )
