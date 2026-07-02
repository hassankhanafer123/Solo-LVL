"""Resend email send — port of lib/email/send.ts."""

from __future__ import annotations

import resend

from ..config import get_settings


def send_email(*, to: str, subject: str, html: str) -> dict:
    s = get_settings()
    resend.api_key = s.resend_api_key
    return resend.Emails.send(
        {"from": s.email_from, "to": to, "subject": subject, "html": html}
    )
