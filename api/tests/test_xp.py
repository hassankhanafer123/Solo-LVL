"""Mirror of lib/xp.test.ts."""

import math

import pytest

from app.logic.xp import (
    TITLE_BONUS,
    apply_xp_gain,
    decide_weekly_level_up,
    title_for_level,
    xp_to_next,
)


def _gain(profile: dict, raw: int):
    return apply_xp_gain(
        level=profile["level"],
        total_xp=profile["total_xp"],
        xp_in_level=profile["xp_in_level"],
        xp_to_next_value=profile["xp_to_next"],
        unallocated_points=profile["unallocated_points"],
        title=profile["title"],
        raw_xp=raw,
    )


BASE = {
    "level": 1,
    "total_xp": 0,
    "xp_in_level": 0,
    "xp_to_next": 150,
    "unallocated_points": 0,
    "title": "Novice",
}


class TestXpToNext:
    def test_150_at_level_1(self):
        assert xp_to_next(1) == 150

    def test_scales_by_1_15(self):
        assert xp_to_next(2) == math.ceil(150 * 1.15)
        assert xp_to_next(3) == math.ceil(150 * 1.15 ** 2)
        assert xp_to_next(10) == math.ceil(150 * 1.15 ** 9)


class TestTitleForLevel:
    def test_novice_below_10(self):
        assert title_for_level(1) == "Novice"
        assert title_for_level(9) == "Novice"

    def test_thresholds(self):
        assert title_for_level(10) == "Awakened"
        assert title_for_level(24) == "Awakened"
        assert title_for_level(25) == "Elite Hunter"
        assert title_for_level(49) == "Elite Hunter"
        assert title_for_level(50) == "Necromancer"
        assert title_for_level(99) == "Necromancer"
        assert title_for_level(100) == "Shadow Monarch"
        assert title_for_level(150) == "Shadow Monarch"


class TestTitleBonus:
    def test_plus_5_pct_per_tier(self):
        assert TITLE_BONUS["Novice"] == 1.0
        assert TITLE_BONUS["Awakened"] == 1.05
        assert TITLE_BONUS["Elite Hunter"] == 1.10
        assert TITLE_BONUS["Necromancer"] == 1.15
        assert TITLE_BONUS["Shadow Monarch"] == 1.20


class TestApplyXpGain:
    def test_adds_within_level(self):
        r = _gain(BASE, 30)
        assert r.level == 1
        assert r.xp_in_level == 30
        assert r.total_xp == 30
        assert r.unallocated_points == 0
        assert r.levels_gained == 0

    def test_levels_up_once(self):
        r = _gain(BASE, 150)
        assert r.level == 2
        assert r.xp_in_level == 0
        assert r.xp_to_next == math.ceil(150 * 1.15)
        assert r.unallocated_points == 5
        assert r.levels_gained == 1

    def test_levels_up_multiple(self):
        r = _gain(BASE, 1000)
        assert r.level > 2
        assert r.unallocated_points == r.levels_gained * 5
        assert r.total_xp == 1000

    def test_title_bonus_applied(self):
        monarch = {**BASE, "level": 100, "title": "Shadow Monarch", "xp_to_next": 1_000_000}
        r = _gain(monarch, 100)
        assert r.total_xp == 120
        assert r.xp_in_level == 120

    def test_unlocks_title_on_level_up(self):
        near10 = {**BASE, "level": 9, "xp_in_level": 0, "xp_to_next": xp_to_next(9), "title": "Novice"}
        r = _gain(near10, xp_to_next(9))
        assert r.level == 10
        assert r.title == "Awakened"
        assert r.title_unlocked == "Awakened"

    def test_final_title_across_multiple_thresholds(self):
        near10 = {**BASE, "level": 9, "xp_in_level": 0, "xp_to_next": xp_to_next(9), "title": "Novice"}
        r = _gain(near10, 999_999)
        assert r.level > 10
        assert r.title == title_for_level(r.level)
        assert r.title_unlocked is not None
        assert r.title_unlocked == r.title

    def test_no_title_unlocked_when_no_cross(self):
        r = _gain(BASE, 50)
        assert r.level == 1
        assert r.title == "Novice"
        assert r.title_unlocked is None

    def test_rejects_negative(self):
        with pytest.raises(ValueError):
            _gain(BASE, -10)

    def test_zero_is_noop(self):
        r = _gain(BASE, 0)
        assert r.level == 1
        assert r.xp_in_level == 0
        assert r.levels_gained == 0


class TestDecideWeeklyLevelUp:
    def test_85_pct_levels(self):
        r = decide_weekly_level_up(5, 0.85)
        assert r.leveled_up is True
        assert r.new_level == 6

    def test_84_pct_no_level(self):
        r = decide_weekly_level_up(5, 0.84)
        assert r.leveled_up is False
        assert r.new_level == 5

    def test_100_pct_levels(self):
        r = decide_weekly_level_up(3, 1.0)
        assert r.leveled_up is True
        assert r.new_level == 4

    def test_0_pct_no_level(self):
        r = decide_weekly_level_up(7, 0.0)
        assert r.leveled_up is False
        assert r.new_level == 7
