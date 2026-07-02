from unittest.mock import MagicMock

from app.social_service import SocialService, _rpc_error_message


def test_rpc_error_message_maps_known_errors():
    assert _rpc_error_message(Exception("already in a party")) == "You're already in a party."
    assert _rpc_error_message(Exception("party is full")) == "That party is full (max 8)."
    assert _rpc_error_message(Exception("invalid code")) == "No party with that code."
    assert "Could not" in _rpc_error_message(Exception("boom"))


def test_weekly_score_sums_daily_and_weekly_xp():
    svc = SocialService(db=MagicMock(), admin=MagicMock(), uid="u1")
    qi = svc.adm.table.return_value.select.return_value
    qi.eq.return_value.eq.return_value.gte.return_value.lte.return_value.execute.return_value.data = [
        {"xp_awarded": 30}, {"xp_awarded": 20},
    ]
    qi.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"xp_awarded": 25},
    ]
    assert svc.weekly_score("u1", "2026-06-08") == 75
