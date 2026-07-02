"""Mirror of lib/plan.test.ts."""

from dataclasses import replace

from app.logic.plan import clone_templates_for_new_week, template_input_to_row
from app.logic.types import QuestTemplate

BASE = QuestTemplate(
    id="old-id-1",
    user_id="user-1",
    week_plan_id="old-week",
    name="Study",
    completion_type="timer",
    target_value=90,
    primary_stat="INT",
    base_xp=75,
    is_required=True,
    sort_order=1,
    active=True,
    cadence="daily",
)


class TestCloneTemplatesForNewWeek:
    def test_strips_id_rewires_keys(self):
        out = clone_templates_for_new_week([BASE], "new-week", "user-1")
        assert len(out) == 1
        assert "id" not in out[0]
        assert out[0]["week_plan_id"] == "new-week"
        assert out[0]["user_id"] == "user-1"

    def test_preserves_fields(self):
        out = clone_templates_for_new_week([BASE], "new-week", "user-1")
        assert out[0]["name"] == "Study"
        assert out[0]["cadence"] == "daily"
        assert out[0]["target_value"] == 90
        assert out[0]["sort_order"] == 1

    def test_resets_active(self):
        out = clone_templates_for_new_week([replace(BASE, active=False)], "new-week", "user-1")
        assert out[0]["active"] is True

    def test_clones_weekly(self):
        weekly = replace(
            BASE, id="old-id-2", name="Meditate", cadence="weekly", primary_stat="DIS", target_value=70
        )
        out = clone_templates_for_new_week([weekly], "new-week", "user-1")
        assert out[0]["cadence"] == "weekly"
        assert out[0]["target_value"] == 70

    def test_empty(self):
        assert clone_templates_for_new_week([], "new-week", "user-1") == []


class TestTemplateInputToRow:
    def test_shapes_row(self):
        row = template_input_to_row(
            name="New quest",
            completion_type="count",
            target_value=50,
            primary_stat="STR",
            base_xp=25,
            is_required=False,
            sort_order=5,
            cadence="daily",
            week_plan_id="wp-1",
            user_id="user-1",
        )
        assert row["week_plan_id"] == "wp-1"
        assert row["user_id"] == "user-1"
        assert row["active"] is True
        assert row["name"] == "New quest"
