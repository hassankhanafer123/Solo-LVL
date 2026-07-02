"""Pydantic request/response models.

Response shapes use the camelCase keys the React app already consumes
(TrackerSnapshot etc.). The planWeek request mirrors the existing
PlanRowInput, which is snake_case in lib/tracker/plan-reconcile.ts — kept
identical so the frontend contract is unchanged.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

StatKind = Literal["INT", "STR", "DIS"]
CompletionType = Literal["checkbox", "count", "timer"]
Cadence = Literal["daily", "weekly"]


# ---------- responses (camelCase, matches lib/tracker/types.ts) ----------
class Stats(BaseModel):
    INT: int
    STR: int
    DIS: int


class TrackerProfile(BaseModel):
    displayName: str
    username: Optional[str]
    level: int
    title: str
    xpInLevel: int
    xpToNext: int
    totalXp: int
    streakCurrent: int
    streakBest: int
    stats: Stats


class TrackerQuest(BaseModel):
    instanceId: str
    templateId: Optional[str]
    name: str
    stat: StatKind
    completionType: CompletionType
    targetValue: Optional[int]
    actualValue: int
    baseXp: int
    xpAwarded: int
    isRequired: bool
    isPenalty: bool
    completed: bool
    cadence: Cadence


class TrackerSnapshot(BaseModel):
    profile: TrackerProfile
    dailyQuests: list[TrackerQuest]
    weeklyQuests: list[TrackerQuest]
    weekStart: str
    today: str
    weeklyCompletionPct: float
    weeklyCompleted: int
    weeklyTotal: int


class LeaderboardEntry(BaseModel):
    username: str
    level: int
    totalXp: int
    rank: int


class LeaderboardView(BaseModel):
    entries: list[LeaderboardEntry]
    myUsername: Optional[str]
    optedIn: bool


class SetUsernameResult(BaseModel):
    ok: bool
    error: Optional[str] = None


# ---------- requests ----------
class SetUsernameBody(BaseModel):
    username: str


class SetProgressBody(BaseModel):
    actualValue: int


class PlanRowInput(BaseModel):
    """Identical to PlanRowInput in lib/tracker/plan-reconcile.ts (snake_case)."""

    id: Optional[str]
    name: str
    completion_type: CompletionType
    target_value: Optional[int]
    primary_stat: StatKind
    is_required: bool
    cadence: Cadence
    sort_order: int


class PlanWeekBody(BaseModel):
    rows: list[PlanRowInput]
