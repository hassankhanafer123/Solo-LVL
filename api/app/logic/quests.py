"""Quest instance building + XP math — port of lib/quests.ts."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Callable, Optional, Sequence

from .types import QuestTemplate


def build_instances_from_template(
    templates: Sequence[QuestTemplate],
    daily_log_id: str,
    user_id: str,
) -> list[dict]:
    """Snapshot active templates into insertable quest_instance rows (no id)."""
    active = [t for t in templates if t.active]
    active.sort(key=lambda t: t.sort_order)
    return [
        {
            "user_id": user_id,
            "daily_log_id": daily_log_id,
            "template_id": t.id,
            "name": t.name,
            "completion_type": t.completion_type,
            "target_value": t.target_value,
            "actual_value": 0,
            "primary_stat": t.primary_stat,
            "base_xp": t.base_xp,
            "xp_awarded": 0,
            "is_required": t.is_required,
            "is_penalty": False,
            "completed": False,
            "completed_at": None,
            "timer_started_at": None,
        }
        for t in active
    ]


def compute_partial_xp(*, actual: int, target: Optional[int], base_xp: int) -> int:
    if target is None:
        return base_xp if actual >= 1 else 0
    if actual >= target:
        return base_xp
    if actual <= 0:
        return 0
    return math.floor((actual / target) * base_xp)


def pick_penalty_target(
    templates: Sequence[QuestTemplate],
    rng: Callable[[], float] = random.random,
) -> Optional[QuestTemplate]:
    candidates = [t for t in templates if t.active and t.is_required]
    if not candidates:
        return None
    idx = math.floor(rng() * len(candidates))
    return candidates[min(idx, len(candidates) - 1)]


def build_penalty_instance(
    source: QuestTemplate,
    daily_log_id: str,
    user_id: str,
) -> dict:
    new_target = (
        None if source.target_value is None else math.ceil(source.target_value * 1.5)
    )
    return {
        "user_id": user_id,
        "daily_log_id": daily_log_id,
        "template_id": None,
        "name": f"{source.name} (Penalty +50%)",
        "completion_type": source.completion_type,
        "target_value": new_target,
        "actual_value": 0,
        "primary_stat": source.primary_stat,
        "base_xp": math.ceil(source.base_xp * 1.5),
        "xp_awarded": 0,
        "is_required": True,
        "is_penalty": True,
        "completed": False,
        "completed_at": None,
        "timer_started_at": None,
    }


@dataclass
class DailyClearResult:
    status: str  # 'cleared' | 'pending'
    required_remaining: int


def evaluate_daily_clear(instances: Sequence[dict]) -> DailyClearResult:
    """Each instance is a dict with at least `is_required` and `completed`."""
    required = [i for i in instances if i.get("is_required")]
    remaining = len([i for i in required if not i.get("completed")])
    return DailyClearResult(
        status="cleared" if remaining == 0 else "pending",
        required_remaining=remaining,
    )
