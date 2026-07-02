from app.email.templates import morning_email_html, weekly_email_html


def test_morning_has_username_tasks_and_button():
    html = morning_email_html(
        username="Hassan", tasks=[{"name": "Push-ups", "stat": "STR"}], app_url="https://x.app"
    )
    assert "Good morning, Hassan" in html
    assert "Push-ups" in html
    assert "STR" in html
    assert "https://x.app" in html
    assert "DayMaxing" in html


def test_morning_empty_tasks_message():
    html = morning_email_html(username="H", tasks=[], app_url="https://x.app")
    assert "No tasks set for today" in html


def test_weekly_has_username_and_button():
    html = weekly_email_html(username="Hassan", app_url="https://x.app")
    assert "Plan your week" in html
    assert "Hassan" in html
    assert "https://x.app" in html
