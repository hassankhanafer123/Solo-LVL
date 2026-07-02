"""Supabase client factories.

Two flavours, mirroring lib/supabase/server.ts and lib/supabase/admin.ts:

- `user_client(jwt)` — anon-key client with the caller's access token attached
  so Row Level Security applies per-user (the same guarantee the Next.js
  server actions got from the SSR cookie session).
- `admin_client()` — service-role client that bypasses RLS. Only for trusted
  server-side jobs (e.g. the email cron); never exposed to the request path.
"""

from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from .config import get_settings


def user_client(jwt: str) -> Client:
    s = get_settings()
    client = create_client(s.supabase_url, s.supabase_anon_key)
    # Attach the user's JWT so PostgREST runs queries as that user (RLS).
    client.postgrest.auth(jwt)
    return client


@lru_cache
def admin_client() -> Client:
    s = get_settings()
    if not s.supabase_service_role_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured")
    return create_client(s.supabase_url, s.supabase_service_role_key)
