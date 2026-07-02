"""Auth bridge — validate the Supabase access token sent by the React app.

The frontend keeps Supabase magic-link login. After sign-in it holds an access
token (JWT); it sends that as `Authorization: Bearer <token>`. We validate the
token and hand back a user-scoped DB client so RLS applies. This replaces the
cookie-session `requireUser()` from tracker.ts.

Validation is done LOCALLY by verifying the JWT signature against the project's
JWKS (Supabase uses ES256 asymmetric keys) — no network round-trip per request.
If local verification can't be done (e.g. a legacy HS256 project with no secret
configured), we fall back to a network `get_user` call so auth still works.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient
from supabase import Client, create_client

from .config import get_settings
from .db import user_client

logger = logging.getLogger("uvicorn.error")

# Audience Supabase stamps on user access tokens.
_AUDIENCE = "authenticated"
_ASYMMETRIC_ALGS = ("ES256", "RS256", "EdDSA")

_jwks_client: PyJWKClient | None = None


def _jwks() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        s = get_settings()
        # PyJWKClient caches fetched signing keys internally.
        _jwks_client = PyJWKClient(f"{s.supabase_url}/auth/v1/.well-known/jwks.json")
    return _jwks_client


@dataclass
class AuthContext:
    user_id: str
    client: Client


def _extract_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
        )
    return authorization.split(" ", 1)[1].strip()


def _verify_local(token: str) -> str | None:
    """Verify the JWT signature locally. Returns the user id (sub) or None."""
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")
        if alg in _ASYMMETRIC_ALGS:
            signing_key = _jwks().get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token, signing_key.key, algorithms=[alg], audience=_AUDIENCE
            )
            return claims.get("sub")
        if alg == "HS256":
            secret = get_settings().supabase_jwt_secret
            if secret:
                claims = jwt.decode(
                    token, secret, algorithms=["HS256"], audience=_AUDIENCE
                )
                return claims.get("sub")
        return None
    except Exception as exc:  # noqa: BLE001 - invalid signature/expiry/etc.
        logger.info("local JWT verification failed: %r", exc)
        return None


def _verify_remote(token: str) -> str | None:
    """Network fallback: ask Supabase to validate the token."""
    try:
        s = get_settings()
        resp = create_client(s.supabase_url, s.supabase_anon_key).auth.get_user(token)
        user = getattr(resp, "user", None)
        return user.id if user and getattr(user, "id", None) else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("remote token validation failed: %r", exc)
        return None


def require_user(authorization: str | None = Header(default=None)) -> AuthContext:
    """FastAPI dependency: returns the authenticated user + a scoped client."""
    token = _extract_bearer(authorization)
    user_id = _verify_local(token) or _verify_remote(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )
    # The token is still forwarded to PostgREST so RLS applies per-user.
    return AuthContext(user_id=user_id, client=user_client(token))


AuthDep = Depends(require_user)
