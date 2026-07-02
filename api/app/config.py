"""Runtime settings, loaded from environment / .env.

Each field reads from its bare name (e.g. SUPABASE_URL) or the Next.js name
(NEXT_PUBLIC_SUPABASE_URL) via AliasChoices, so a single .env can serve both
apps. We deliberately do NOT mutate os.environ — doing so let an empty bridge
value shadow the real .env value (env vars outrank the .env file in
pydantic-settings).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str = Field(
        validation_alias=AliasChoices("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
    )
    supabase_anon_key: str = Field(
        validation_alias=AliasChoices("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
    )
    supabase_service_role_key: str = Field(
        default="", validation_alias=AliasChoices("SUPABASE_SERVICE_ROLE_KEY")
    )
    # Optional: only needed if the project signs JWTs with HS256 (legacy). New
    # projects use asymmetric (ES256) keys verified via JWKS — no secret needed.
    supabase_jwt_secret: str = Field(
        default="", validation_alias=AliasChoices("SUPABASE_JWT_SECRET")
    )
    cors_origins: str = Field(
        default="http://localhost:3000", validation_alias=AliasChoices("CORS_ORIGINS")
    )
    # Per-client request cap (slowapi syntax). Generous by default because the
    # optimistic UI fires several writes per interaction and users may share an
    # IP behind NAT. Tune via the RATE_LIMIT env var.
    rate_limit: str = Field(default="300/minute", validation_alias=AliasChoices("RATE_LIMIT"))

    # Email reminder cron (port of the old Next.js cron route).
    resend_api_key: str = Field(default="", validation_alias=AliasChoices("RESEND_API_KEY"))
    email_from: str = Field(
        default="DayMaxing <onboarding@resend.dev>", validation_alias=AliasChoices("EMAIL_FROM")
    )
    app_url: str = Field(default="http://localhost:3000", validation_alias=AliasChoices("APP_URL"))
    cron_secret: str = Field(default="", validation_alias=AliasChoices("CRON_SECRET"))
    sentry_dsn: str = Field(default="", validation_alias=AliasChoices("SENTRY_DSN"))

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
