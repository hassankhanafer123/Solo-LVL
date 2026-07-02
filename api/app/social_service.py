"""Party / duel / feed operations.

Membership changes run as the USER (SECURITY DEFINER RPCs need auth.uid()).
Everything else — member stats, duels, feed events — uses the admin client
with explicit party/user filters, because profile RLS is self-only and feed
events must be unforgeable (clients have no write grants on social tables).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from supabase import Client

from .logic.quests import build_penalty_instance, pick_penalty_target
from .logic.social import decide_duel_winner, duel_ends_at
from .logic.time_utils import days_of_week, get_current_week_start
from .logic.types import QuestTemplate


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _rpc_error_message(exc: Exception) -> str:
    msg = str(exc)
    if "already in a party" in msg:
        return "You're already in a party."
    if "party is full" in msg:
        return "That party is full (max 8)."
    if "invalid code" in msg:
        return "No party with that code."
    return "Could not update your party — try again."


class SocialService:
    def __init__(self, db: Client | None, admin: Client, uid: str):
        self.db = db      # user-scoped; only needed for the RPC calls
        self.adm = admin
        self.uid = uid

    # ---- membership ------------------------------------------------------
    def my_party_id(self) -> Optional[str]:
        rows = (
            self.adm.table("party_member").select("party_id")
            .eq("user_id", self.uid).execute().data
        ) or []
        return rows[0]["party_id"] if rows else None

    def create_party(self, name: str) -> dict:
        try:
            self.db.rpc("create_party", {"p_name": name}).execute()
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": _rpc_error_message(exc), "view": None}
        return {"ok": True, "error": None, "view": self.get_party_view()}

    def join_party(self, code: str) -> dict:
        try:
            self.db.rpc("join_party", {"p_code": code}).execute()
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": _rpc_error_message(exc), "view": None}
        return {"ok": True, "error": None, "view": self.get_party_view()}

    def leave_party(self) -> dict:
        self.db.rpc("leave_party", {}).execute()
        return self.get_party_view()

    # ---- feed --------------------------------------------------------------
    def emit(self, kind: str, payload: dict, party_id: Optional[str] = None) -> None:
        pid = party_id or self.my_party_id()
        if not pid:
            return
        self.adm.table("activity_event").insert({
            "party_id": pid, "user_id": self.uid, "kind": kind, "payload": payload,
        }).execute()

    def retract_quest_event(self, instance_id: str) -> None:
        pid = self.my_party_id()
        if not pid:
            return
        self.adm.table("activity_event").delete() \
            .eq("party_id", pid).eq("user_id", self.uid) \
            .eq("kind", "quest_complete") \
            .eq("payload->>instanceId", instance_id).execute()

    # ---- scoring -----------------------------------------------------------
    def weekly_score(self, user_id: str, week_start: str) -> int:
        days = days_of_week(week_start)
        daily = (
            self.adm.table("quest_instance")
            .select("xp_awarded, daily_log!inner(quest_date)")
            .eq("user_id", user_id).eq("completed", True)
            .gte("daily_log.quest_date", days[0])
            .lte("daily_log.quest_date", days[-1])
            .execute().data
        ) or []
        weekly = (
            self.adm.table("weekly_quest_instance")
            .select("xp_awarded, weekly_log!inner(week_start_date)")
            .eq("user_id", user_id).eq("completed", True)
            .eq("weekly_log.week_start_date", week_start)
            .execute().data
        ) or []
        return sum(r["xp_awarded"] for r in daily) + sum(r["xp_awarded"] for r in weekly)

    # ---- duels ---------------------------------------------------------------
    def challenge(self, opponent_id: str) -> dict:
        pid = self.my_party_id()
        if not pid:
            return {"ok": False, "error": "Join a party first.", "view": None}
        mate = (
            self.adm.table("party_member").select("user_id")
            .eq("party_id", pid).eq("user_id", opponent_id).execute().data
        )
        if not mate or opponent_id == self.uid:
            return {"ok": False, "error": "You can only duel a party member.", "view": None}
        try:
            self.adm.table("duel").insert({
                "party_id": pid, "challenger_id": self.uid,
                "opponent_id": opponent_id, "status": "pending",
            }).execute()
        except Exception:  # noqa: BLE001 — unique open-pair index
            return {"ok": False, "error": "You already have an open duel with them.", "view": None}
        return {"ok": True, "error": None, "view": self.get_party_view()}

    def accept(self, duel_id: str) -> dict:
        rows = (
            self.adm.table("duel").select("*").eq("id", duel_id)
            .eq("opponent_id", self.uid).eq("status", "pending").execute().data
        ) or []
        if rows:
            d = rows[0]
            ch = (
                self.adm.table("profile").select("timezone, reset_hour_local")
                .eq("user_id", d["challenger_id"]).single().execute().data
            )
            week_start = get_current_week_start(_now(), ch["timezone"], ch["reset_hour_local"])
            ends = duel_ends_at(week_start, ch["timezone"], ch["reset_hour_local"])
            self.adm.table("duel").update({
                "status": "active", "accepted_at": _now().isoformat(),
                "week_start": week_start, "ends_at": ends.isoformat(),
            }).eq("id", duel_id).eq("status", "pending").execute()
            self.emit("duel_started", {"duelId": duel_id}, party_id=d["party_id"])
        return self.get_party_view()

    def decline(self, duel_id: str) -> dict:
        self.adm.table("duel").update({"status": "declined"}) \
            .eq("id", duel_id).eq("opponent_id", self.uid) \
            .eq("status", "pending").execute()
        return self.get_party_view()

    def resolve_expired_duels(self) -> None:
        """Lazy, idempotent resolution — called from snapshot + party reads."""
        expired = (
            self.adm.table("duel").select("*").eq("status", "active")
            .lt("ends_at", _now().isoformat()).execute().data
        ) or []
        for d in expired:
            c_score = self.weekly_score(d["challenger_id"], d["week_start"])
            o_score = self.weekly_score(d["opponent_id"], d["week_start"])
            winner_side = decide_duel_winner(c_score, o_score)
            winner_id = (
                d["challenger_id"] if winner_side == "challenger"
                else d["opponent_id"] if winner_side == "opponent" else None
            )
            updated = (
                self.adm.table("duel").update({
                    "status": "finished", "winner_id": winner_id,
                    # draws/voids need no penalty pass
                    "penalty_applied": winner_id is None,
                }).eq("id", d["id"]).eq("status", "active").execute().data
            )
            if not updated or winner_id is None:
                continue  # another worker resolved it, or a draw
            prof = (
                self.adm.table("profile").select("duel_wins, username")
                .eq("user_id", winner_id).single().execute().data
            )
            self.adm.table("profile").update(
                {"duel_wins": prof["duel_wins"] + 1}
            ).eq("user_id", winner_id).execute()
            self.adm.table("activity_event").insert({
                "party_id": d["party_id"], "user_id": winner_id, "kind": "duel_won",
                "payload": {"duelId": d["id"], "score": max(c_score, o_score),
                            "loserScore": min(c_score, o_score)},
            }).execute()

    def apply_pending_penalty(
        self, daily_log_id: str, templates: list[QuestTemplate]
    ) -> bool:
        """If I lost a finished duel whose penalty hasn't been applied, add one
        +50% penalty quest to today's log. Returns True if one was inserted.
        Called from TrackerService.get_today_snapshot after instances exist.
        """
        rows = (
            self.adm.table("duel").select("id, winner_id")
            .eq("status", "finished").eq("penalty_applied", False)
            .or_(f"challenger_id.eq.{self.uid},opponent_id.eq.{self.uid}")
            .execute().data
        ) or []
        losses = [d for d in rows if d["winner_id"] and d["winner_id"] != self.uid]
        inserted = False
        for d in losses:
            claimed = (
                self.adm.table("duel").update({"penalty_applied": True})
                .eq("id", d["id"]).eq("penalty_applied", False).execute().data
            )
            if not claimed:
                continue
            source = pick_penalty_target(templates)
            if not source:
                continue
            inst = build_penalty_instance(source, daily_log_id, self.uid)
            inst["name"] = inst["name"].replace("(Penalty +50%)", "(Duel Penalty +50%)")
            self.adm.table("quest_instance").insert(inst).execute()
            inserted = True
        return inserted

    # ---- views -----------------------------------------------------------------
    def active_duel_summary(self) -> Optional[dict]:
        self.resolve_expired_duels()
        rows = (
            self.adm.table("duel").select("*").eq("status", "active")
            .or_(f"challenger_id.eq.{self.uid},opponent_id.eq.{self.uid}")
            .limit(1).execute().data
        ) or []
        if not rows:
            return None
        d = rows[0]
        i_am_challenger = d["challenger_id"] == self.uid
        opp_id = d["opponent_id"] if i_am_challenger else d["challenger_id"]
        opp = (
            self.adm.table("profile").select("username")
            .eq("user_id", opp_id).single().execute().data
        )
        my = self.weekly_score(self.uid, d["week_start"])
        their = self.weekly_score(opp_id, d["week_start"])
        return {
            "id": d["id"], "opponentUsername": opp.get("username"),
            "myScore": my, "opponentScore": their, "endsAt": d["ends_at"],
        }

    def get_party_view(self) -> dict:
        pid = self.my_party_id()
        if not pid:
            return {"party": None, "members": [], "feed": [], "duels": [],
                    "myUserId": self.uid}
        self.resolve_expired_duels()

        party = self.adm.table("party").select("*").eq("id", pid).single().execute().data
        member_rows = (
            self.adm.table("party_member").select("user_id, role")
            .eq("party_id", pid).execute().data
        ) or []
        ids = [m["user_id"] for m in member_rows]
        profiles = (
            self.adm.table("profile")
            .select("user_id, username, level, total_xp, duel_wins, timezone, reset_hour_local")
            .in_("user_id", ids).execute().data
        ) or []
        pmap = {p["user_id"]: p for p in profiles}
        roles = {m["user_id"]: m["role"] for m in member_rows}

        members = []
        for uid in ids:
            p = pmap.get(uid) or {}
            week_start = get_current_week_start(
                _now(), p.get("timezone", "America/New_York"),
                p.get("reset_hour_local", 4),
            )
            members.append({
                "userId": uid, "username": p.get("username"),
                "level": p.get("level", 1), "totalXp": int(p.get("total_xp", 0)),
                "weeklyXp": self.weekly_score(uid, week_start),
                "duelWins": p.get("duel_wins", 0),
                "isLeader": roles.get(uid) == "leader",
            })
        members.sort(key=lambda m: m["weeklyXp"], reverse=True)

        events = (
            self.adm.table("activity_event").select("*").eq("party_id", pid)
            .order("created_at", desc=True).limit(50).execute().data
        ) or []
        feed = [{
            "id": e["id"], "kind": e["kind"],
            "username": (pmap.get(e["user_id"]) or {}).get("username"),
            "payload": e["payload"] or {}, "createdAt": e["created_at"],
        } for e in events]

        duel_rows = (
            self.adm.table("duel").select("*").eq("party_id", pid)
            .in_("status", ["pending", "active", "finished"])
            .order("created_at", desc=True).limit(10).execute().data
        ) or []
        duels = []
        for d in duel_rows:
            c_score = o_score = 0
            if d["status"] in ("active", "finished") and d.get("week_start"):
                c_score = self.weekly_score(d["challenger_id"], d["week_start"])
                o_score = self.weekly_score(d["opponent_id"], d["week_start"])
            duels.append({
                "id": d["id"], "status": d["status"],
                "challengerId": d["challenger_id"], "opponentId": d["opponent_id"],
                "challengerUsername": (pmap.get(d["challenger_id"]) or {}).get("username"),
                "opponentUsername": (pmap.get(d["opponent_id"]) or {}).get("username"),
                "challengerScore": c_score, "opponentScore": o_score,
                "endsAt": d.get("ends_at"), "winnerId": d.get("winner_id"),
            })

        combined = sum(m["totalXp"] for m in members)
        return {
            "party": {"id": party["id"], "name": party["name"],
                      "code": party["code"], "combinedXp": combined},
            "members": members, "feed": feed, "duels": duels, "myUserId": self.uid,
        }
