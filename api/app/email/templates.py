"""HTML email templates — port of lib/email/templates.tsx (React Email -> HTML)."""

from __future__ import annotations

from html import escape

_BG = "#0a0a0f"
_CARD = "#13131c"
_BORDER = "#262635"
_TEXT = "#e6e6f0"
_MUTED = "#8a8aa0"
_ACCENT = "#7c5cff"
_STAT_COLOR = {"INT": "#4f9dff", "STR": "#ff6b6b", "DIS": "#7c5cff"}

_MAIN = (
    f"background-color:{_BG};font-family:-apple-system,BlinkMacSystemFont,"
    "'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;padding:32px 0;"
)
_CONTAINER = (
    f"background-color:{_CARD};border:1px solid {_BORDER};border-radius:14px;"
    "margin:0 auto;max-width:480px;padding:36px 32px;"
)
_BRAND = (
    f"color:{_ACCENT};font-size:13px;font-weight:700;letter-spacing:2px;"
    "text-transform:uppercase;margin:0 0 20px;"
)
_HEADING = f"color:{_TEXT};font-size:24px;font-weight:700;margin:0 0 8px;"
_LEAD = f"color:{_MUTED};font-size:15px;line-height:22px;margin:0 0 24px;"
_TASK_ROW = f"border-bottom:1px solid {_BORDER};padding:12px 0;"
_TASK_NAME = f"color:{_TEXT};font-size:15px;margin:0;"
_BUTTON = (
    f"background-color:{_ACCENT};border-radius:10px;color:#fff;display:inline-block;"
    "font-size:15px;font-weight:600;padding:12px 28px;text-decoration:none;"
)


def _stat_badge(stat: str) -> str:
    c = _STAT_COLOR.get(stat, _ACCENT)
    style = (
        f"background-color:{c}22;border:1px solid {c};border-radius:6px;color:{c};"
        "display:inline-block;font-size:11px;font-weight:700;letter-spacing:1px;"
        "margin-left:8px;padding:2px 7px;"
    )
    return f'<span style="{style}">{escape(stat)}</span>'


def _shell(preview: str, inner: str) -> str:
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        f'<div style="display:none;max-height:0;overflow:hidden">{escape(preview)}</div>'
        f'</head><body style="{_MAIN}"><div style="{_CONTAINER}">{inner}</div></body></html>'
    )


def morning_email_html(*, username: str, tasks: list[dict], app_url: str) -> str:
    u = escape(username)
    if not tasks:
        rows = (
            f'<p style="{_TASK_NAME}color:{_MUTED}">'
            "No tasks set for today — open the app to plan your day.</p>"
        )
    else:
        rows = "".join(
            f'<div style="{_TASK_ROW}"><p style="{_TASK_NAME}">'
            f'{escape(t["name"])}{_stat_badge(t["stat"])}</p></div>'
            for t in tasks
        )
    inner = (
        f'<p style="{_BRAND}">DayMaxing</p>'
        f'<h1 style="{_HEADING}">Good morning, {u}</h1>'
        f"<p style=\"{_LEAD}\">Here's today's run:</p>"
        f"<div>{rows}</div>"
        f'<div style="padding-top:28px">'
        f'<a href="{escape(app_url)}" style="{_BUTTON}">Open DayMaxing</a></div>'
    )
    return _shell(f"Here's today's run, {username}.", inner)


def weekly_email_html(*, username: str, app_url: str) -> str:
    u = escape(username)
    inner = (
        f'<p style="{_BRAND}">DayMaxing</p>'
        f'<h1 style="{_HEADING}">Plan your week</h1>'
        f'<p style="{_LEAD}">New week, {u}. Open DayMaxing and set this week\'s '
        "tasks so your daily runs are ready to go.</p>"
        f'<div style="padding-top:8px">'
        f'<a href="{escape(app_url)}" style="{_BUTTON}">Plan this week</a></div>'
    )
    return _shell("Plan your week on DayMaxing", inner)
