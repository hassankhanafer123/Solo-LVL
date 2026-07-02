"""Completion XP decision — port of lib/tracker/complete.ts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .quests import compute_partial_xp
from .xp import XpResult


@dataclass
class CompletionDecision:
    already_complete: bool
    xp_award: int
    xp_result: Optional[XpResult]


def decide_completion(
    *,
    actual_value: int,
    target_value: Optional[int],
    base_xp: int,
    completed: bool,
    level: int,
    total_xp: int,
    xp_in_level: int,
    xp_to_next: int,
    unallocated_points: int,
    title: str,
) -> CompletionDecision:
    """Decide XP to award for completing an instance and the resulting profile."""
    if completed:
        return CompletionDecision(already_complete=True, xp_award=0, xp_result=None)

    xp_award = compute_partial_xp(
        actual=actual_value, target=target_value, base_xp=base_xp
    )
    xp_result = XpResult(
        level=level,
        total_xp=total_xp + xp_award,
        xp_in_level=xp_in_level + xp_award,
        xp_to_next=xp_to_next,
        unallocated_points=unallocated_points,
        title=title,
        levels_gained=0,
        title_unlocked=None,
    )
    return CompletionDecision(
        already_complete=False, xp_award=xp_award, xp_result=xp_result
    )
