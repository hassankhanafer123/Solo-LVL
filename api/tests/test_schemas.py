import pytest
from pydantic import ValidationError

from app.schemas import PlanRowInput, PlanWeekBody, SetProgressBody, SetUsernameBody


def _row(name="Run", sort=0):
    return PlanRowInput(
        id=None, name=name, completion_type="checkbox", target_value=None,
        primary_stat="STR", is_required=True, cadence="daily", sort_order=sort,
    )


def test_plan_rejects_more_than_50_rows():
    rows = [_row(sort=i) for i in range(51)]
    with pytest.raises(ValidationError):
        PlanWeekBody(rows=rows)


def test_plan_row_rejects_absurd_name_and_target():
    with pytest.raises(ValidationError):
        _row(name="x" * 81)
    with pytest.raises(ValidationError):
        PlanRowInput(id=None, name="Run", completion_type="count",
                     target_value=10_000_001, primary_stat="STR",
                     is_required=True, cadence="daily", sort_order=0)


def test_progress_value_capped():
    with pytest.raises(ValidationError):
        SetProgressBody(actualValue=10_000_001)
    assert SetProgressBody(actualValue=-5).actualValue == -5  # clamped later by service


def test_username_length_capped():
    with pytest.raises(ValidationError):
        SetUsernameBody(username="x" * 65)
