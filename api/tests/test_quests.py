"""Mirror of lib/quests.test.ts."""

from dataclasses import replace

from app.logic.quests import (
    build_instances_from_template,
    build_penalty_instance,
    compute_partial_xp,
    evaluate_daily_clear,
    pick_penalty_target,
)
from app.logic.types import QuestTemplate

TMPL = QuestTemplate(
    id="t1",
    user_id="u1",
    week_plan_id="wp1",
    name="Push-ups",
    completion_type="count",
    target_value=100,
    primary_stat="STR",
    base_xp=50,
    is_required=True,
    sort_order=1,
    active=True,
    cadence="daily",
)


def tmpl(**over) -> QuestTemplate:
    return replace(TMPL, **over)


class TestBuildInstances:
    def test_snapshots_fields(self):
        out = build_instances_from_template([tmpl()], "d1", "u1")
        assert len(out) == 1
        assert out[0]["user_id"] == "u1"
        assert out[0]["daily_log_id"] == "d1"
        assert out[0]["template_id"] == "t1"
        assert out[0]["name"] == "Push-ups"
        assert out[0]["target_value"] == 100
        assert out[0]["base_xp"] == 50
        assert out[0]["is_required"] is True
        assert out[0]["is_penalty"] is False
        assert out[0]["completed"] is False
        assert out[0]["actual_value"] == 0

    def test_skips_inactive(self):
        out = build_instances_from_template([tmpl(active=False)], "d1", "u1")
        assert out == []

    def test_preserves_sort_order(self):
        out = build_instances_from_template(
            [tmpl(id="a", sort_order=2), tmpl(id="b", sort_order=1)], "d1", "u1"
        )
        assert out[0]["template_id"] == "b"
        assert out[1]["template_id"] == "a"


class TestComputePartialXp:
    def test_full_when_met(self):
        assert compute_partial_xp(actual=100, target=100, base_xp=50) == 50
        assert compute_partial_xp(actual=120, target=100, base_xp=50) == 50

    def test_proportional(self):
        assert compute_partial_xp(actual=50, target=100, base_xp=50) == 25
        assert compute_partial_xp(actual=33, target=100, base_xp=50) == 16

    def test_zero(self):
        assert compute_partial_xp(actual=0, target=100, base_xp=50) == 0

    def test_checkbox(self):
        assert compute_partial_xp(actual=1, target=None, base_xp=25) == 25
        assert compute_partial_xp(actual=0, target=None, base_xp=25) == 0


class TestPickPenaltyTarget:
    def test_chooses_required_active(self):
        ts = [
            tmpl(id="a", is_required=True),
            tmpl(id="b", is_required=False),
            tmpl(id="c", is_required=True),
        ]
        picked = pick_penalty_target(ts, lambda: 0)
        assert picked.id in ("a", "c")

    def test_none_when_no_required(self):
        assert pick_penalty_target([tmpl(is_required=False)], lambda: 0) is None

    def test_rng_deterministic(self):
        ts = [tmpl(id="a"), tmpl(id="b"), tmpl(id="c")]
        assert pick_penalty_target(ts, lambda: 0).id == "a"
        assert pick_penalty_target(ts, lambda: 0.5).id == "b"
        assert pick_penalty_target(ts, lambda: 0.99).id == "c"


class TestBuildPenaltyInstance:
    def test_multiplies_target(self):
        p = build_penalty_instance(tmpl(target_value=100), "d1", "u1")
        assert p["target_value"] == 150
        assert p["is_penalty"] is True
        assert p["is_required"] is True
        assert p["template_id"] is None
        assert p["name"] == "Push-ups (Penalty +50%)"

    def test_checkbox_null_target(self):
        p = build_penalty_instance(
            tmpl(completion_type="checkbox", target_value=None), "d1", "u1"
        )
        assert p["target_value"] is None


class TestEvaluateDailyClear:
    def test_cleared_when_all_required_done(self):
        r = evaluate_daily_clear(
            [
                {"is_required": True, "completed": True},
                {"is_required": False, "completed": False},
            ]
        )
        assert r.status == "cleared"
        assert r.required_remaining == 0

    def test_pending_when_some_incomplete(self):
        r = evaluate_daily_clear(
            [
                {"is_required": True, "completed": True},
                {"is_required": True, "completed": False},
            ]
        )
        assert r.status == "pending"
        assert r.required_remaining == 1

    def test_empty_vacuously_cleared(self):
        r = evaluate_daily_clear([])
        assert r.status == "cleared"
        assert r.required_remaining == 0
