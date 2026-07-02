"""Template diff for plan reconciliation — port of lib/tracker/plan-reconcile.ts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass
class TemplateDiff:
    to_insert: list[dict]      # rows with id is None (brand-new tasks)
    to_update_ids: list[str]   # ids present in both existing-active and desired
    to_deactivate_ids: list[str]  # existing active ids absent from desired


def diff_templates(
    existing_active_ids: Sequence[str], desired: Sequence[dict]
) -> TemplateDiff:
    """Pure diff between currently-active template ids and desired plan rows.

    Each desired row is a dict with at least an "id" key (str or None).
    Desired rows carrying an id not in existing_active_ids are stale and ignored.
    """
    to_insert = [r for r in desired if r.get("id") is None]
    desired_ids = {r["id"] for r in desired if r.get("id") is not None}
    to_update_ids = [i for i in existing_active_ids if i in desired_ids]
    to_deactivate_ids = [i for i in existing_active_ids if i not in desired_ids]
    return TemplateDiff(
        to_insert=to_insert,
        to_update_ids=to_update_ids,
        to_deactivate_ids=to_deactivate_ids,
    )
