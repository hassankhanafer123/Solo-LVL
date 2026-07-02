"""Pydantic request/response models.

Response shapes use the camelCase keys the React app already consumes
(TrackerSnapshot etc.). The planWeek request mirrors the existing
PlanRowInput, which is snake_case in lib/tracker/plan-reconcile.ts — kept
identical so the frontend contract is unchanged.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

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


# ---------- social (party / duels / feed) ----------
class PartyInfo(BaseModel):
    id: str
    name: str
    code: str
    combinedXp: int


class PartyMemberEntry(BaseModel):
    userId: str
    username: Optional[str]
    level: int
    totalXp: int
    weeklyXp: int
    duelWins: int
    isLeader: bool


class FeedEventView(BaseModel):
    id: str
    kind: str
    username: Optional[str]
    payload: dict
    createdAt: str


class DuelEntry(BaseModel):
    id: str
    status: str
    challengerId: str
    opponentId: str
    challengerUsername: Optional[str]
    opponentUsername: Optional[str]
    challengerScore: int
    opponentScore: int
    endsAt: Optional[str]
    winnerId: Optional[str]


class PartyView(BaseModel):
    party: Optional[PartyInfo]
    members: list[PartyMemberEntry]
    feed: list[FeedEventView]
    duels: list[DuelEntry]
    myUserId: str
    myUsername: Optional[str] = None


class PartyActionResult(BaseModel):
    ok: bool
    error: Optional[str] = None
    view: Optional[PartyView] = None


class ActiveDuelSummary(BaseModel):
    id: str
    opponentUsername: Optional[str]
    myScore: int
    opponentScore: int
    endsAt: Optional[str]


class TrackerSnapshot(BaseModel):
    profile: TrackerProfile
    dailyQuests: list[TrackerQuest]
    weeklyQuests: list[TrackerQuest]
    weekStart: str
    today: str
    weeklyCompletionPct: float
    weeklyCompleted: int
    weeklyTotal: int
    activeDuel: Optional[ActiveDuelSummary] = None


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
    username: str = Field(max_length=64)  # real rule (3–20) enforced in service + DB


class SetProgressBody(BaseModel):
    # Negative values are clamped to 0 by the service (existing behaviour);
    # the cap guards the int4 column and absurd payloads.
    actualValue: int = Field(ge=-1_000_000, le=10_000_000)


class PlanRowInput(BaseModel):
    """Identical to PlanRowInput in lib/tracker/plan-reconcile.ts (snake_case)."""

    id: Optional[str]
    name: str = Field(min_length=1, max_length=80)
    completion_type: CompletionType
    target_value: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    primary_stat: StatKind
    is_required: bool
    cadence: Cadence
    sort_order: int = Field(ge=0, le=500)


class PlanWeekBody(BaseModel):
    rows: list[PlanRowInput] = Field(max_length=50)


class CreatePartyBody(BaseModel):
    name: str = Field(min_length=3, max_length=24)


class JoinPartyBody(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class ChallengeBody(BaseModel):
    opponentId: str = Field(max_length=64)
