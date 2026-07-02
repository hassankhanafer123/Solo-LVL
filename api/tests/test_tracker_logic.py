"""Mirror of the lib/tracker/*.test.ts suites (complete, locked-xp, map,
plan-reconcile, progress, weekly)."""

from app.logic.complete import decide_completion
from app.logic.locked_xp import category_xp, compute_locked_xp
from app.logic.mapping import to_tracker_profile, to_tracker_quest
from app.logic.plan_reconcile import diff_templates
from app.logic.progress import decide_streak
from app.logic.weekly import compute_weekly_completion

PROFILE = dict(
    level=1, total_xp=0, xp_in_level=0, xp_to_next=100, unallocated_points=0, title="Novice"
)


# --- complete.test.ts ---
class TestDecideCompletion:
    def test_full_when_target_met(self):
        d = decide_completion(
            actual_value=100, target_value=100, base_xp=50, completed=False, **PROFILE
        )
        assert d.already_complete is False
        assert d.xp_award == 50
        assert d.xp_result.total_xp == 50
        assert d.xp_result.level == PROFILE["level"]
        assert d.xp_result.levels_gained == 0

    def test_partial_below_target(self):
        d = decide_completion(
            actual_value=50, target_value=100, base_xp=50, completed=False, **PROFILE
        )
        assert d.xp_award == 25

    def test_idempotent_when_complete(self):
        d = decide_completion(
            actual_value=100, target_value=100, base_xp=50, completed=True, **PROFILE
        )
        assert d.already_complete is True
        assert d.xp_award == 0
        assert d.xp_result is None

    def test_checkbox(self):
        d = decide_completion(
            actual_value=1, target_value=None, base_xp=25, completed=False, **PROFILE
        )
        assert d.xp_award == 25


# --- locked-xp.test.ts ---
class TestComputeLockedXp:
    def test_checkbox(self):
        assert compute_locked_xp(completion_type="checkbox", target_value=None, cadence="daily") == 25

    def test_count_100(self):
        assert compute_locked_xp(completion_type="count", target_value=100, cadence="daily") == 50

    def test_count_5_floor_15(self):
        assert compute_locked_xp(completion_type="count", target_value=5, cadence="daily") == 15

    def test_timer_90(self):
        assert compute_locked_xp(completion_type="timer", target_value=90, cadence="daily") == 77

    def test_weekly_count_70(self):
        assert compute_locked_xp(completion_type="count", target_value=70, cadence="weekly") == 53


class TestCategoryXp:
    def test_int(self):
        assert category_xp("INT") == 10

    def test_str(self):
        assert category_xp("STR") == 10

    def test_dis(self):
        assert category_xp("DIS") == 20


# --- map.test.ts ---
class TestMappers:
    def test_daily_instance(self):
        inst = {
            "id": "i1", "template_id": "t1", "name": "Push-ups", "completion_type": "count",
            "target_value": 100, "actual_value": 40, "primary_stat": "STR", "base_xp": 50,
            "xp_awarded": 0, "is_required": True, "is_penalty": False, "completed": False,
        }
        q = to_tracker_quest(inst, "daily")
        assert q["instanceId"] == "i1"
        assert q["templateId"] == "t1"
        assert q["name"] == "Push-ups"
        assert q["stat"] == "STR"
        assert q["completionType"] == "count"
        assert q["targetValue"] == 100
        assert q["actualValue"] == 40
        assert q["baseXp"] == 50
        assert q["isRequired"] is True
        assert q["isPenalty"] is False
        assert q["completed"] is False
        assert q["cadence"] == "daily"

    def test_profile(self):
        p = {
            "display_name": "Hassan", "level": 14, "title": "Awakened", "xp_in_level": 420,
            "xp_to_next": 1000, "total_xp": 5000, "stat_int": 51, "stat_str": 42, "stat_dis": 36,
            "streak_current": 23, "streak_best": 30, "username": None,
        }
        out = to_tracker_profile(p)
        assert out["displayName"] == "Hassan"
        assert out["level"] == 14
        assert out["stats"] == {"INT": 51, "STR": 42, "DIS": 36}
        assert out["streakCurrent"] == 23
        assert out["streakBest"] == 30


# --- plan-reconcile.test.ts ---
def _row(id_, name="q"):
    return {
        "id": id_, "name": name, "completion_type": "checkbox", "target_value": None,
        "primary_stat": "INT", "is_required": True, "cadence": "daily", "sort_order": 0,
    }


class TestDiffTemplates:
    def test_all_new_insert_only(self):
        d = diff_templates([], [_row(None), _row(None)])
        assert len(d.to_insert) == 2
        assert d.to_update_ids == []
        assert d.to_deactivate_ids == []

    def test_rename_update(self):
        d = diff_templates(["a"], [_row("a", "renamed")])
        assert d.to_insert == []
        assert d.to_update_ids == ["a"]
        assert d.to_deactivate_ids == []

    def test_remove_deactivate(self):
        d = diff_templates(["a", "b"], [_row("a")])
        assert d.to_insert == []
        assert d.to_update_ids == ["a"]
        assert d.to_deactivate_ids == ["b"]

    def test_mix(self):
        d = diff_templates(["a", "b"], [_row("a"), _row(None), _row(None)])
        assert len(d.to_insert) == 2
        assert d.to_update_ids == ["a"]
        assert d.to_deactivate_ids == ["b"]

    def test_stale_id_ignored(self):
        d = diff_templates(["a"], [_row("a"), _row("ghost")])
        assert d.to_insert == []
        assert d.to_update_ids == ["a"]
        assert d.to_deactivate_ids == []


# --- progress.test.ts ---
class TestDecideStreak:
    def test_starts_at_1(self):
        r = decide_streak(current=0, best=0, yesterday_cleared=False)
        assert (r.current, r.best) == (1, 1)

    def test_increments_when_yesterday_cleared(self):
        r = decide_streak(current=5, best=9, yesterday_cleared=True)
        assert (r.current, r.best) == (6, 9)

    def test_raises_best(self):
        r = decide_streak(current=9, best=9, yesterday_cleared=True)
        assert (r.current, r.best) == (10, 10)

    def test_resets_on_gap(self):
        r = decide_streak(current=5, best=9, yesterday_cleared=False)
        assert (r.current, r.best) == (1, 9)


# --- weekly.test.ts ---
class TestComputeWeeklyCompletion:
    def test_typical_mixed(self):
        r = compute_weekly_completion(
            daily_template_count=2, weekly_template_count=2, completed_daily=12, completed_weekly=2
        )
        assert r == 0.875

    def test_zero_pool(self):
        r = compute_weekly_completion(
            daily_template_count=0, weekly_template_count=0, completed_daily=0, completed_weekly=0
        )
        assert r == 0

    def test_full(self):
        r = compute_weekly_completion(
            daily_template_count=3, weekly_template_count=1, completed_daily=21, completed_weekly=1
        )
        assert r == 1
