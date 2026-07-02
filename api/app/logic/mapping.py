"""DB-row -> API-shape mappers — port of lib/tracker/map.ts.

Inputs are plain dicts (as returned by supabase-py) rather than typed rows, so
the mappers tolerate daily instances (with is_required/is_penalty) and weekly
instances (without) the same way the TS `'field' in i` checks did.
"""

from __future__ import annotations


def to_tracker_quest(i: dict, cadence: str) -> dict:
    is_penalty = i.get("is_penalty", False)
    is_required = i.get("is_required", True)
    return {
        "instanceId": i["id"],
        "templateId": i.get("template_id"),
        "name": i["name"],
        "stat": i["primary_stat"],
        "completionType": i["completion_type"],
        "targetValue": i.get("target_value"),
        "actualValue": i["actual_value"],
        "baseXp": i["base_xp"],
        "xpAwarded": i["xp_awarded"],
        "isRequired": is_required,
        "isPenalty": is_penalty,
        "completed": i["completed"],
        "cadence": cadence,
    }


def to_tracker_profile(p: dict) -> dict:
    return {
        "displayName": p["display_name"],
        "username": p.get("username"),
        "level": p["level"],
        "title": p["title"],
        "xpInLevel": p["xp_in_level"],
        "xpToNext": p["xp_to_next"],
        "totalXp": p["total_xp"],
        "streakCurrent": p["streak_current"],
        "streakBest": p["streak_best"],
        "stats": {
            "INT": p["stat_int"],
            "STR": p["stat_str"],
            "DIS": p["stat_dis"],
        },
    }
