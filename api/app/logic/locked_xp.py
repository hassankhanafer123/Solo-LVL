"""Locked base-XP computation — port of lib/tracker/locked-xp.ts."""

from __future__ import annotations

from typing import Optional

from .types import CompletionType, StatKind


def compute_locked_xp(
    *, completion_type: CompletionType, target_value: Optional[int], cadence: str
) -> int:
    """Auto base XP from type/target/cadence. Client-sent base_xp is ignored.

    - checkbox -> 25
    - count    -> max(15, round(target * 0.5))
    - timer    -> max(15, round(target * 0.85))
    - weekly cadence multiplies the base by 1.5 (rounded)
    """
    target = target_value or 0
    if completion_type == "checkbox":
        base = 25
    elif completion_type == "count":
        base = max(15, _round_half_up(target * 0.5))
    elif completion_type == "timer":
        base = max(15, _round_half_up(target * 0.85))
    else:  # pragma: no cover - exhaustive over CompletionType
        raise ValueError(f"unknown completion_type {completion_type!r}")

    if cadence == "weekly":
        base = _round_half_up(base * 1.5)
    return base


def category_xp(stat: StatKind) -> int:
    return 20 if stat == "DIS" else 10  # INT 10, STR 10, DIS 20


def _round_half_up(x: float) -> int:
    """Match JavaScript Math.round (round half toward +Infinity)."""
    import math

    return math.floor(x + 0.5)
