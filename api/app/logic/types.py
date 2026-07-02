"""Domain types — port of lib/types.ts.

The TS file used `zod` for the input schemas; here the row/record shapes are
plain dataclasses and the validated inputs live as Pydantic models in
app/schemas.py. The literal sets below mirror the TS `as const` unions.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

STATS = ("INT", "STR", "DIS")
StatKind = Literal["INT", "STR", "DIS"]

COMPLETION_TYPES = ("checkbox", "count", "timer")
CompletionType = Literal["checkbox", "count", "timer"]

DAILY_STATUSES = ("pending", "cleared", "missed")
DailyStatus = Literal["pending", "cleared", "missed"]

CADENCES = ("daily", "weekly")
Cadence = Literal["daily", "weekly"]


@dataclass
class Profile:
    user_id: str
    display_name: str
    level: int
    total_xp: int
    xp_in_level: int
    xp_to_next: int
    stat_int: int
    stat_str: int
    stat_dis: int
    unallocated_points: int
    title: str
    streak_current: int
    streak_best: int
    reset_hour_local: int
    email_target: Optional[str]
    email_enabled: bool
    email_send_hour_local: int
    timezone: str
    username: Optional[str]
    leaderboard_opt_in: bool


@dataclass
class QuestTemplate:
    id: str
    user_id: str
    week_plan_id: str
    name: str
    completion_type: CompletionType
    target_value: Optional[int]
    primary_stat: StatKind
    base_xp: int
    is_required: bool
    sort_order: int
    active: bool
    cadence: Cadence


@dataclass
class QuestInstance:
    id: str
    user_id: str
    daily_log_id: str
    template_id: Optional[str]
    name: str
    completion_type: CompletionType
    target_value: Optional[int]
    actual_value: int
    primary_stat: StatKind
    base_xp: int
    xp_awarded: int
    is_required: bool
    is_penalty: bool
    completed: bool
    completed_at: Optional[str]
    timer_started_at: Optional[str]


@dataclass
class WeeklyQuestInstance:
    id: str
    user_id: str
    weekly_log_id: str
    template_id: Optional[str]
    name: str
    completion_type: CompletionType
    target_value: Optional[int]
    actual_value: int
    primary_stat: StatKind
    base_xp: int
    xp_awarded: int
    completed: bool
    completed_at: Optional[str]
