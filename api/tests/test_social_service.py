from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.logic.social import duel_ends_at
from app.logic.types import QuestTemplate
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


# ---------------------------------------------------------------------------
# Router-style fake admin: table(name) returns one shared mock per table so
# tests can assert what was written. Chains are only as deep as the real code.
# ---------------------------------------------------------------------------
def _tables_admin():
    tables: dict[str, MagicMock] = {}

    def table(name):
        if name not in tables:
            tables[name] = MagicMock()
        return tables[name]

    admin = MagicMock()
    admin.table.side_effect = table
    return admin, tables


def _svc_with_tables(uid="me"):
    admin, tables = _tables_admin()
    svc = SocialService(db=MagicMock(), admin=admin, uid=uid)
    return svc, tables


def _expired_duel(**over):
    d = {
        "id": "d1", "party_id": "p1", "challenger_id": "me", "opponent_id": "them",
        "status": "active", "week_start": "2026-06-08",
        "ends_at": "2026-06-15T08:00:00+00:00", "winner_id": None,
        "penalty_applied": False,
    }
    d.update(over)
    return d


def _template(**over):
    fields = dict(
        id="t1", user_id="me", week_plan_id="wp1", name="Run",
        completion_type="checkbox", target_value=None, primary_stat="STR",
        base_xp=30, is_required=True, sort_order=0, active=True, cadence="daily",
    )
    fields.update(over)
    return QuestTemplate(**fields)


# ---- resolve_expired_duels -------------------------------------------------

def _wire_resolution(tables, expired, claim_wins=True, duel_wins=3):
    duel = tables.setdefault("duel", MagicMock())
    duel.select.return_value.eq.return_value.lt.return_value.execute.return_value.data = expired
    duel.update.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
        [expired[0]] if (expired and claim_wins) else []
    )
    profile = tables.setdefault("profile", MagicMock())
    profile.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "duel_wins": duel_wins, "username": "winner",
    }


def test_resolution_winner_gets_finish_wincount_and_feed_event():
    svc, tables = _svc_with_tables()
    svc.weekly_score = lambda uid, ws: {"me": 120, "them": 80}[uid]
    _wire_resolution(tables, [_expired_duel()])

    svc.resolve_expired_duels()

    tables["duel"].update.assert_any_call(
        {"status": "finished", "winner_id": "me", "penalty_applied": False}
    )
    tables["profile"].update.assert_called_once_with({"duel_wins": 4})
    event = tables["activity_event"].insert.call_args[0][0]
    assert event["kind"] == "duel_won"
    assert event["user_id"] == "me"
    assert event["party_id"] == "p1"


def test_resolution_draw_marks_applied_no_win_no_event():
    svc, tables = _svc_with_tables()
    svc.weekly_score = lambda uid, ws: 100
    _wire_resolution(tables, [_expired_duel()])

    svc.resolve_expired_duels()

    tables["duel"].update.assert_any_call(
        {"status": "finished", "winner_id": None, "penalty_applied": True}
    )
    tables["profile"].update.assert_not_called()
    assert "activity_event" not in tables or not tables["activity_event"].insert.called


def test_resolution_lost_race_skips_side_effects():
    svc, tables = _svc_with_tables()
    svc.weekly_score = lambda uid, ws: {"me": 120, "them": 80}[uid]
    _wire_resolution(tables, [_expired_duel()], claim_wins=False)

    svc.resolve_expired_duels()

    tables["profile"].update.assert_not_called()
    assert "activity_event" not in tables or not tables["activity_event"].insert.called


# ---- apply_pending_penalty ---------------------------------------------------

def _wire_penalty(tables, rows, claim_wins=True):
    duel = tables.setdefault("duel", MagicMock())
    duel.select.return_value.eq.return_value.eq.return_value.or_.return_value.execute.return_value.data = rows
    duel.update.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
        [{"id": "d1"}] if claim_wins else []
    )


def test_penalty_applied_to_loser():
    svc, tables = _svc_with_tables(uid="me")
    _wire_penalty(tables, [{"id": "d1", "winner_id": "them"}])

    inserted = svc.apply_pending_penalty("log1", [_template()])

    assert inserted is True
    inst = tables["quest_instance"].insert.call_args[0][0]
    assert inst["is_penalty"] is True
    assert "(Duel Penalty +50%)" in inst["name"]
    assert inst["user_id"] == "me"
    assert inst["daily_log_id"] == "log1"
    assert inst["base_xp"] == 45  # ceil(30 * 1.5)


def test_penalty_never_applied_to_winner():
    svc, tables = _svc_with_tables(uid="me")
    _wire_penalty(tables, [{"id": "d1", "winner_id": "me"}])

    inserted = svc.apply_pending_penalty("log1", [_template()])

    assert inserted is False
    tables["duel"].update.assert_not_called()  # no claim attempted
    assert "quest_instance" not in tables or not tables["quest_instance"].insert.called


def test_penalty_skipped_but_claimed_when_no_required_templates():
    svc, tables = _svc_with_tables(uid="me")
    _wire_penalty(tables, [{"id": "d1", "winner_id": "them"}])

    inserted = svc.apply_pending_penalty("log1", [])

    assert inserted is False
    tables["duel"].update.assert_called_once_with({"penalty_applied": True})
    assert "quest_instance" not in tables or not tables["quest_instance"].insert.called


# ---- accept ---------------------------------------------------------------------

def test_accept_uses_challengers_week_and_timezone(monkeypatch):
    import app.social_service as mod

    fixed_now = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(mod, "_now", lambda: fixed_now)

    svc, tables = _svc_with_tables(uid="opp")
    svc.emit = MagicMock()
    svc.get_party_view = MagicMock(return_value={"stub": True})

    duel = tables.setdefault("duel", MagicMock())
    duel.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"id": "d1", "party_id": "p1", "challenger_id": "chal", "opponent_id": "opp"}
    ]
    profile = tables.setdefault("profile", MagicMock())
    profile.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "timezone": "America/New_York", "reset_hour_local": 4,
    }

    out = svc.accept("d1")

    payload = tables["duel"].update.call_args[0][0]
    assert payload["status"] == "active"
    assert payload["week_start"] == "2026-06-08"
    assert payload["ends_at"] == duel_ends_at("2026-06-08", "America/New_York", 4).isoformat()
    svc.emit.assert_called_once_with("duel_started", {"duelId": "d1"}, party_id="p1")
    assert out == {"stub": True}


# ---- challenge guards ---------------------------------------------------------

def test_challenge_guards():
    # (a) not in a party
    svc, tables = _svc_with_tables(uid="me")
    pm = tables.setdefault("party_member", MagicMock())
    pm.select.return_value.eq.return_value.execute.return_value.data = []
    out = svc.challenge("them")
    assert out == {"ok": False, "error": "Join a party first.", "view": None}

    # (b) opponent not a party-mate
    svc, tables = _svc_with_tables(uid="me")
    pm = tables.setdefault("party_member", MagicMock())
    pm.select.return_value.eq.return_value.execute.return_value.data = [{"party_id": "p1"}]
    pm.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    out = svc.challenge("stranger")
    assert out["ok"] is False
    assert "party member" in out["error"]

    # (c) open-pair unique index violation -> friendly error
    svc, tables = _svc_with_tables(uid="me")
    pm = tables.setdefault("party_member", MagicMock())
    pm.select.return_value.eq.return_value.execute.return_value.data = [{"party_id": "p1"}]
    pm.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"user_id": "them"}
    ]
    duel = tables.setdefault("duel", MagicMock())
    duel.insert.side_effect = Exception("duplicate key value violates unique constraint")
    out = svc.challenge("them")
    assert out["ok"] is False
    assert "open duel" in out["error"]
