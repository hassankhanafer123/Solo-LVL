"""Port of app/actions/tracker.ts — the 10 server actions as plain methods.

Each method mirrors the corresponding TypeScript action 1:1: same query order,
same writes, same use of the pure logic in app/logic/. The only structural
change is auth (a validated Bearer token + user-scoped client, injected by the
caller) instead of the Next.js cookie session.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Optional

from supabase import Client

from .logic.locked_xp import category_xp
from .logic.mapping import to_tracker_profile, to_tracker_quest
from .logic.plan import clone_templates_for_new_week
from .logic.plan_reconcile import diff_templates
from .logic.progress import decide_streak
from .logic.quests import build_instances_from_template, compute_partial_xp, evaluate_daily_clear
from .logic.time_utils import days_of_week, get_current_week_start, local_date_iso, yesterday_local
from .logic.types import QuestTemplate
from .logic.weekly import compute_weekly_completion
from .logic.xp import decide_weekly_level_up, title_for_level, xp_to_next

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,20}$")
STAT_COL = {"INT": "stat_int", "STR": "stat_str", "DIS": "stat_dis"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rows_to_templates(rows: list[dict]) -> list[QuestTemplate]:
    return [
        QuestTemplate(
            id=r["id"],
            user_id=r["user_id"],
            week_plan_id=r["week_plan_id"],
            name=r["name"],
            completion_type=r["completion_type"],
            target_value=r.get("target_value"),
            primary_stat=r["primary_stat"],
            base_xp=r["base_xp"],
            is_required=r["is_required"],
            sort_order=r["sort_order"],
            active=r["active"],
            cadence=r["cadence"],
        )
        for r in rows
    ]


class TrackerService:
    def __init__(self, client: Client, user_id: str):
        self.db = client
        self.uid = user_id

    # ---- small query helpers -------------------------------------------
    def _data(self, q) -> Any:
        return q.execute().data

    def _count(self, q) -> int:
        return q.execute().count or 0

    def _maybe(self, q) -> Any:
        # supabase-py returns None (not a response) from maybe_single() when
        # zero rows match — guard so callers get None instead of crashing.
        res = q.execute()
        return res.data if res is not None else None

    # ---- setUsername ---------------------------------------------------
    def set_username(self, raw: str) -> dict:
        name = raw.strip()
        if not USERNAME_RE.match(name):
            return {"ok": False, "error": "Use 3–20 letters, numbers, or underscores."}
        try:
            self.db.table("profile").update({"username": name}).eq("user_id", self.uid).execute()
        except Exception as exc:  # noqa: BLE001
            code = getattr(exc, "code", None)
            if code == "23505":
                return {"ok": False, "error": "That username is taken."}
            return {"ok": False, "error": "Could not save username."}
        return {"ok": True}

    # ---- getTodaySnapshot ----------------------------------------------
    def get_today_snapshot(self) -> dict:
        db, uid = self.db, self.uid
        profile = db.table("profile").select("*").eq("user_id", uid).single().execute().data

        now = datetime.now(timezone.utc)
        tz = profile["timezone"]
        today = local_date_iso(now, tz)
        week_start = get_current_week_start(now, tz, profile["reset_hour_local"])

        week_plan = self._maybe(
            db.table("week_plan").select("id").eq("user_id", uid)
            .eq("week_start_date", week_start).maybe_single()
        )

        if not week_plan:
            week_plan = (
                db.table("week_plan").insert({"user_id": uid, "week_start_date": week_start})
                .execute().data[0]
            )
            prior = self._maybe(
                db.table("week_plan").select("id, week_start_date").eq("user_id", uid)
                .lt("week_start_date", week_start).order("week_start_date", desc=True)
                .limit(1).maybe_single()
            )
            if prior:
                self._evaluate_prior_week_levelup(profile, prior, uid)
                # Carry-forward: clone prior week's active templates.
                prior_full = self._data(
                    db.table("quest_template").select("*")
                    .eq("week_plan_id", prior["id"]).eq("active", True)
                ) or []
                clones = clone_templates_for_new_week(
                    _rows_to_templates(prior_full), week_plan["id"], uid
                )
                if clones:
                    db.table("quest_template").insert(clones).execute()

        templates = _rows_to_templates(
            self._data(
                db.table("quest_template").select("*")
                .eq("week_plan_id", week_plan["id"]).eq("active", True).order("sort_order")
            ) or []
        )

        db.table("daily_log").upsert(
            {"user_id": uid, "quest_date": today},
            on_conflict="user_id,quest_date", ignore_duplicates=True,
        ).execute()
        daily_log = (
            db.table("daily_log").select("id").eq("user_id", uid)
            .eq("quest_date", today).single().execute().data
        )

        daily_templates = [t for t in templates if t.cadence == "daily"]
        daily_to_insert = build_instances_from_template(daily_templates, daily_log["id"], uid)
        for row in daily_to_insert:
            row["base_xp"] = category_xp(row["primary_stat"])
        if daily_to_insert:
            db.table("quest_instance").upsert(
                daily_to_insert, on_conflict="daily_log_id,template_id", ignore_duplicates=True
            ).execute()

        db.table("weekly_log").upsert(
            {"user_id": uid, "week_start_date": week_start},
            on_conflict="user_id,week_start_date", ignore_duplicates=True,
        ).execute()
        weekly_log = (
            db.table("weekly_log").select("id").eq("user_id", uid)
            .eq("week_start_date", week_start).single().execute().data
        )

        weekly_templates = [t for t in templates if t.cadence == "weekly"]
        weekly_to_insert = [
            {
                "user_id": uid, "weekly_log_id": weekly_log["id"], "template_id": t.id,
                "name": t.name, "completion_type": t.completion_type, "target_value": t.target_value,
                "actual_value": 0, "primary_stat": t.primary_stat, "base_xp": category_xp(t.primary_stat),
                "xp_awarded": 0, "completed": False, "completed_at": None,
            }
            for t in weekly_templates
        ]
        if weekly_to_insert:
            db.table("weekly_quest_instance").upsert(
                weekly_to_insert, on_conflict="weekly_log_id,template_id", ignore_duplicates=True
            ).execute()

        daily_rows = self._data(
            db.table("quest_instance").select("*").eq("daily_log_id", daily_log["id"])
        ) or []
        weekly_rows = self._data(
            db.table("weekly_quest_instance").select("*").eq("weekly_log_id", weekly_log["id"])
        ) or []

        # Current-week completion percentage.
        current_daily_template_count = len(daily_templates)
        current_weekly_template_count = len(weekly_templates)

        current_week_days = days_of_week(week_start)
        current_week_daily_logs = self._data(
            db.table("daily_log").select("id").eq("user_id", uid).in_("quest_date", current_week_days)
        ) or []
        current_daily_log_ids = [r["id"] for r in current_week_daily_logs]
        current_completed_daily = 0
        if current_daily_log_ids:
            current_completed_daily = self._count(
                db.table("quest_instance").select("id", count="exact", head=True)
                .in_("daily_log_id", current_daily_log_ids).eq("completed", True)
            )

        current_completed_weekly = len([r for r in weekly_rows if r["completed"]])

        weekly_total = current_daily_template_count * 7 + current_weekly_template_count
        weekly_completed = current_completed_daily + current_completed_weekly
        weekly_completion_pct = compute_weekly_completion(
            daily_template_count=current_daily_template_count,
            weekly_template_count=current_weekly_template_count,
            completed_daily=current_completed_daily,
            completed_weekly=current_completed_weekly,
        )

        return {
            "profile": to_tracker_profile(profile),
            "dailyQuests": [to_tracker_quest(r, "daily") for r in daily_rows],
            "weeklyQuests": [to_tracker_quest(r, "weekly") for r in weekly_rows],
            "weekStart": week_start,
            "today": today,
            "weeklyCompletionPct": weekly_completion_pct,
            "weeklyCompleted": weekly_completed,
            "weeklyTotal": weekly_total,
        }

    def _evaluate_prior_week_levelup(self, profile: dict, prior: dict, uid: str) -> None:
        db = self.db
        prior_templates = self._data(
            db.table("quest_template").select("id, cadence")
            .eq("week_plan_id", prior["id"]).eq("active", True)
        ) or []
        prior_daily = len([t for t in prior_templates if t["cadence"] == "daily"])
        prior_weekly = len([t for t in prior_templates if t["cadence"] == "weekly"])

        prior_days = days_of_week(prior["week_start_date"])
        prior_daily_logs = self._data(
            db.table("daily_log").select("id").eq("user_id", uid).in_("quest_date", prior_days)
        ) or []
        prior_daily_log_ids = [r["id"] for r in prior_daily_logs]
        prior_completed_daily = 0
        if prior_daily_log_ids:
            prior_completed_daily = self._count(
                db.table("quest_instance").select("id", count="exact", head=True)
                .in_("daily_log_id", prior_daily_log_ids).eq("completed", True)
            )

        prior_weekly_log = self._maybe(
            db.table("weekly_log").select("id").eq("user_id", uid)
            .eq("week_start_date", prior["week_start_date"]).maybe_single()
        )
        prior_completed_weekly = 0
        if prior_weekly_log:
            prior_completed_weekly = self._count(
                db.table("weekly_quest_instance").select("id", count="exact", head=True)
                .eq("weekly_log_id", prior_weekly_log["id"]).eq("completed", True)
            )

        prior_pct = compute_weekly_completion(
            daily_template_count=prior_daily,
            weekly_template_count=prior_weekly,
            completed_daily=prior_completed_daily,
            completed_weekly=prior_completed_weekly,
        )
        decision = decide_weekly_level_up(profile["level"], prior_pct)
        if decision.leveled_up:
            new_level = decision.new_level
            new_xp_to_next = xp_to_next(new_level)
            new_title = title_for_level(new_level)
            db.table("profile").update({
                "level": new_level, "xp_in_level": 0,
                "xp_to_next": new_xp_to_next, "title": new_title,
            }).eq("user_id", uid).execute()
            db.table("level_up_event").insert({
                "user_id": uid, "from_level": profile["level"], "to_level": new_level,
                "points_granted": 0, "title_unlocked": new_title,
            }).execute()
            profile["level"] = new_level
            profile["xp_in_level"] = 0
            profile["xp_to_next"] = new_xp_to_next
            profile["title"] = new_title

    # ---- setQuestProgress ----------------------------------------------
    def set_quest_progress(self, instance_id: str, actual_value: int) -> dict:
        db, uid = self.db, self.uid
        i = (
            db.table("quest_instance").select("*").eq("id", instance_id)
            .eq("user_id", uid).single().execute().data
        )
        actual = max(0, actual_value)
        xp_awarded = (
            i["xp_awarded"] if i["completed"]
            else compute_partial_xp(actual=actual, target=i.get("target_value"), base_xp=i["base_xp"])
        )
        db.table("quest_instance").update(
            {"actual_value": actual, "xp_awarded": xp_awarded}
        ).eq("id", instance_id).eq("user_id", uid).execute()

        reached = i.get("target_value") is not None and actual >= i["target_value"]
        if reached and not i["completed"]:
            return self.complete_quest(instance_id)
        if not reached and i["completed"]:
            return self.uncomplete_quest(instance_id)
        return self.get_today_snapshot()

    # ---- completeQuest -------------------------------------------------
    def complete_quest(self, instance_id: str) -> dict:
        db, uid = self.db, self.uid
        i = (
            db.table("quest_instance").select("*").eq("id", instance_id)
            .eq("user_id", uid).single().execute().data
        )
        if i["completed"]:
            return self.get_today_snapshot()

        p = db.table("profile").select("*").eq("user_id", uid).single().execute().data
        xp = category_xp(i["primary_stat"])
        stat_col = STAT_COL[i["primary_stat"]]

        db.table("quest_instance").update(
            {"completed": True, "completed_at": _now_iso(), "xp_awarded": xp}
        ).eq("id", instance_id).eq("user_id", uid).eq("completed", False).execute()

        db.table("profile").update({
            "total_xp": p["total_xp"] + xp,
            "xp_in_level": p["xp_in_level"] + xp,
            stat_col: p[stat_col] + xp,
        }).eq("user_id", uid).execute()

        self._maybe_advance_streak(uid, i["daily_log_id"], p)
        return self.get_today_snapshot()

    # ---- uncompleteQuest -----------------------------------------------
    def uncomplete_quest(self, instance_id: str) -> dict:
        self.db.table("quest_instance").update(
            {"completed": False, "completed_at": None}
        ).eq("id", instance_id).eq("user_id", self.uid).execute()
        return self.get_today_snapshot()

    def _maybe_advance_streak(self, uid: str, daily_log_id: str, p: dict) -> None:
        db = self.db
        rows = self._data(
            db.table("quest_instance").select("is_required, completed").eq("daily_log_id", daily_log_id)
        ) or []
        clear = evaluate_daily_clear(rows)
        if clear.status != "cleared":
            return

        log = (
            db.table("daily_log").select("quest_date, status").eq("id", daily_log_id)
            .single().execute().data
        )
        if log["status"] == "cleared":
            return

        y_log = self._maybe(
            db.table("daily_log").select("status").eq("user_id", uid)
            .eq("quest_date", yesterday_local(log["quest_date"])).maybe_single()
        )
        streak = decide_streak(
            current=p["streak_current"], best=p["streak_best"],
            yesterday_cleared=(y_log or {}).get("status") == "cleared",
        )
        db.table("daily_log").update(
            {"status": "cleared", "cleared_at": _now_iso()}
        ).eq("id", daily_log_id).execute()
        db.table("profile").update(
            {"streak_current": streak.current, "streak_best": streak.best}
        ).eq("user_id", uid).execute()

    # ---- setWeeklyProgress ---------------------------------------------
    def set_weekly_progress(self, weekly_instance_id: str, actual_value: int) -> dict:
        db, uid = self.db, self.uid
        i = (
            db.table("weekly_quest_instance").select("*").eq("id", weekly_instance_id)
            .eq("user_id", uid).single().execute().data
        )
        actual = max(0, actual_value)
        reached = i.get("target_value") is not None and actual >= i["target_value"]

        if reached and not i["completed"]:
            p = db.table("profile").select("*").eq("user_id", uid).single().execute().data
            xp = category_xp(i["primary_stat"])
            db.table("weekly_quest_instance").update({
                "actual_value": actual, "completed": True, "completed_at": _now_iso(), "xp_awarded": xp,
            }).eq("id", weekly_instance_id).eq("user_id", uid).eq("completed", False).execute()
            db.table("profile").update({
                "total_xp": p["total_xp"] + xp,
                "xp_in_level": p["xp_in_level"] + xp,
                "stat_dis": p["stat_dis"] + xp,
            }).eq("user_id", uid).execute()
        else:
            db.table("weekly_quest_instance").update(
                {"actual_value": actual}
            ).eq("id", weekly_instance_id).eq("user_id", uid).execute()
        return self.get_today_snapshot()

    # ---- leaderboard ---------------------------------------------------
    def get_leaderboard(self) -> dict:
        db, uid = self.db, self.uid
        me = (
            db.table("profile").select("username, leaderboard_opt_in")
            .eq("user_id", uid).single().execute().data
        )
        rows = db.rpc("get_leaderboard").execute().data or []
        entries = [
            {
                "username": r["username"], "level": r["level"],
                "totalXp": int(r["total_xp"]), "rank": int(r["rank"]),
            }
            for r in rows
        ]
        return {
            "entries": entries,
            "myUsername": me.get("username"),
            "optedIn": bool(me.get("leaderboard_opt_in")),
        }

    def join_leaderboard(self) -> dict:
        self.db.table("profile").update({"leaderboard_opt_in": True}).eq("user_id", self.uid).execute()
        return self.get_leaderboard()

    def leave_leaderboard(self) -> dict:
        self.db.table("profile").update({"leaderboard_opt_in": False}).eq("user_id", self.uid).execute()
        return self.get_leaderboard()

    # ---- planWeek ------------------------------------------------------
    def plan_week(self, rows: list[dict]) -> dict:
        db, uid = self.db, self.uid

        snap = self.get_today_snapshot()
        week_start, today = snap["weekStart"], snap["today"]
        week_plan = self._maybe(
            db.table("week_plan").select("id").eq("user_id", uid)
            .eq("week_start_date", week_start).maybe_single()
        )
        if not week_plan:
            self.get_today_snapshot()
            week_plan = (
                db.table("week_plan").select("id").eq("user_id", uid)
                .eq("week_start_date", week_start).single().execute().data
            )
        week_plan_id = week_plan["id"]

        # 1. Fixed category XP per desired row (client base_xp ignored).
        desired = {r["id"]: r for r in rows if r.get("id") is not None}

        # 2. Diff existing active templates against desired.
        active_rows = self._data(
            db.table("quest_template").select("*").eq("week_plan_id", week_plan_id)
            .eq("user_id", uid).eq("active", True)
        ) or []
        existing_active_ids = [t["id"] for t in active_rows]
        diff = diff_templates(existing_active_ids, rows)

        # 3a. Update kept templates in place.
        for tid in diff.to_update_ids:
            r = desired.get(tid)
            if not r:
                continue
            db.table("quest_template").update({
                "name": r["name"], "completion_type": r["completion_type"],
                "target_value": r.get("target_value"), "primary_stat": r["primary_stat"],
                "base_xp": category_xp(r["primary_stat"]), "is_required": r["is_required"],
                "sort_order": r["sort_order"], "cadence": r["cadence"], "active": True,
            }).eq("id", tid).eq("user_id", uid).execute()

        # 3b. Insert brand-new templates.
        insert_rows = [
            {
                "user_id": uid, "week_plan_id": week_plan_id, "name": r["name"],
                "completion_type": r["completion_type"], "target_value": r.get("target_value"),
                "primary_stat": r["primary_stat"], "base_xp": category_xp(r["primary_stat"]),
                "is_required": r["is_required"], "sort_order": r["sort_order"],
                "active": True, "cadence": r["cadence"],
            }
            for r in diff.to_insert
        ]
        if insert_rows:
            db.table("quest_template").insert(insert_rows).execute()

        # 3c. Deactivate removed templates.
        if diff.to_deactivate_ids:
            db.table("quest_template").update({"active": False}).in_(
                "id", diff.to_deactivate_ids
            ).eq("user_id", uid).execute()

        # 4. Re-read current active templates.
        post = _rows_to_templates(
            self._data(
                db.table("quest_template").select("*").eq("week_plan_id", week_plan_id)
                .eq("user_id", uid).eq("active", True).order("sort_order")
            ) or []
        )
        daily_templates = [t for t in post if t.cadence == "daily"]
        weekly_templates = [t for t in post if t.cadence == "weekly"]

        self._reconcile_daily(daily_templates, today)
        self._reconcile_weekly(weekly_templates, week_start)

        return self.get_today_snapshot()

    def _reconcile_daily(self, daily_templates: list[QuestTemplate], today: str) -> None:
        db, uid = self.db, self.uid
        daily_log = (
            db.table("daily_log").select("id").eq("user_id", uid)
            .eq("quest_date", today).single().execute().data
        )
        if not daily_log:
            return
        instances = self._data(
            db.table("quest_instance").select("*").eq("daily_log_id", daily_log["id"]).eq("user_id", uid)
        ) or []
        active_daily_ids = {t.id for t in daily_templates}
        by_template = {i["template_id"]: i for i in instances if i.get("template_id") is not None}

        for t in daily_templates:
            inst = by_template.get(t.id)
            if not inst:
                db.table("quest_instance").insert({
                    "user_id": uid, "daily_log_id": daily_log["id"], "template_id": t.id, "name": t.name,
                    "completion_type": t.completion_type, "target_value": t.target_value, "actual_value": 0,
                    "primary_stat": t.primary_stat, "base_xp": category_xp(t.primary_stat), "xp_awarded": 0,
                    "is_required": t.is_required, "is_penalty": False, "completed": False,
                    "completed_at": None, "timer_started_at": None,
                }).execute()
            elif not inst["completed"]:
                db.table("quest_instance").update({
                    "name": t.name, "completion_type": t.completion_type, "target_value": t.target_value,
                    "base_xp": category_xp(t.primary_stat), "primary_stat": t.primary_stat,
                    "is_required": t.is_required,
                }).eq("id", inst["id"]).eq("user_id", uid).execute()

        to_delete = [
            i for i in instances
            if not i["completed"] and not i["is_penalty"]
            and (i.get("template_id") is None or i["template_id"] not in active_daily_ids)
        ]
        for i in to_delete:
            db.table("quest_instance").delete().eq("id", i["id"]).eq("user_id", uid).execute()

    def _reconcile_weekly(self, weekly_templates: list[QuestTemplate], week_start: str) -> None:
        db, uid = self.db, self.uid
        weekly_log = (
            db.table("weekly_log").select("id").eq("user_id", uid)
            .eq("week_start_date", week_start).single().execute().data
        )
        if not weekly_log:
            return
        w_instances = self._data(
            db.table("weekly_quest_instance").select("*").eq("weekly_log_id", weekly_log["id"]).eq("user_id", uid)
        ) or []
        active_weekly_ids = {t.id for t in weekly_templates}
        w_by_template = {i["template_id"]: i for i in w_instances if i.get("template_id") is not None}

        for t in weekly_templates:
            inst = w_by_template.get(t.id)
            if not inst:
                db.table("weekly_quest_instance").insert({
                    "user_id": uid, "weekly_log_id": weekly_log["id"], "template_id": t.id, "name": t.name,
                    "completion_type": t.completion_type, "target_value": t.target_value, "actual_value": 0,
                    "primary_stat": t.primary_stat, "base_xp": category_xp(t.primary_stat), "xp_awarded": 0,
                    "completed": False, "completed_at": None,
                }).execute()
            elif not inst["completed"]:
                db.table("weekly_quest_instance").update({
                    "name": t.name, "completion_type": t.completion_type, "target_value": t.target_value,
                    "base_xp": category_xp(t.primary_stat), "primary_stat": t.primary_stat,
                }).eq("id", inst["id"]).eq("user_id", uid).execute()

        w_to_delete = [
            i for i in w_instances
            if not i["completed"]
            and (i.get("template_id") is None or i["template_id"] not in active_weekly_ids)
        ]
        for i in w_to_delete:
            db.table("weekly_quest_instance").delete().eq("id", i["id"]).eq("user_id", uid).execute()
