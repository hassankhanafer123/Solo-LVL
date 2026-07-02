"""Weekly completion fraction — port of lib/tracker/weekly.ts."""

from __future__ import annotations


def compute_weekly_completion(
    *,
    daily_template_count: int,
    weekly_template_count: int,
    completed_daily: int,
    completed_weekly: int,
) -> float:
    """Fraction 0..1 of the week's pool completed.

    Pool = daily_templates * 7 + weekly_templates.
    """
    total = daily_template_count * 7 + weekly_template_count
    if total == 0:
        return 0.0
    return (completed_daily + completed_weekly) / total
