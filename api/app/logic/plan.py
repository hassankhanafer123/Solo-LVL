"""Week-plan template cloning + shaping — port of lib/plan.ts."""

from __future__ import annotations

from typing import Sequence

from .types import QuestTemplate


def clone_templates_for_new_week(
    prev_templates: Sequence[QuestTemplate],
    new_week_plan_id: str,
    new_user_id: str,
) -> list[dict]:
    """Strip per-week identity (id, week_plan_id), reset active=True, keep order."""
    return [
        {
            "user_id": new_user_id,
            "week_plan_id": new_week_plan_id,
            "name": t.name,
            "completion_type": t.completion_type,
            "target_value": t.target_value,
            "primary_stat": t.primary_stat,
            "base_xp": t.base_xp,
            "is_required": t.is_required,
            "sort_order": t.sort_order,
            "active": True,
            "cadence": t.cadence,
        }
        for t in prev_templates
    ]


def template_input_to_row(
    *,
    name: str,
    completion_type: str,
    target_value: int | None,
    primary_stat: str,
    base_xp: int,
    is_required: bool,
    sort_order: int,
    cadence: str,
    week_plan_id: str,
    user_id: str,
) -> dict:
    return {
        "user_id": user_id,
        "week_plan_id": week_plan_id,
        "name": name,
        "completion_type": completion_type,
        "target_value": target_value,
        "primary_stat": primary_stat,
        "base_xp": base_xp,
        "is_required": is_required,
        "sort_order": sort_order,
        "active": True,
        "cadence": cadence,
    }
