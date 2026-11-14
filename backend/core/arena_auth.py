"""Signed, session-scoped identity tokens for OneContext Arena."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from typing import Literal

from fastapi import Header, HTTPException, status


TokenRole = Literal["host", "member"]


@dataclass(frozen=True)
class ArenaIdentity:
    user_id: str
    session_id: str
    role: TokenRole
    expires_at: int


def _secret() -> bytes:
    value = os.getenv("AUTH_SECRET") or os.getenv("ARENA_AUTH_SECRET") or "onecontext-arena-dev-secret-key-32b"
    return value.encode("utf-8")


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def issue_arena_token(user_id: str, session_id: str, role: TokenRole, ttl_seconds: int = 86_400) -> str:
    """Issue a compact HMAC-signed token; it is not a general application login."""
    now = int(time.time())
    payload = {"user_id": user_id, "session_id": session_id, "role": role, "iat": now, "exp": now + ttl_seconds}
    body = _encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = _encode(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())
    return f"{body}.{signature}"


def verify_arena_token(token: str) -> ArenaIdentity:
    try:
        body, presented_signature = token.split(".", 1)
        expected_signature = _encode(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(presented_signature, expected_signature):
            raise ValueError("signature mismatch")
        payload = json.loads(_decode(body))
        if payload.get("role") not in {"host", "member"} or not all(payload.get(k) for k in ("user_id", "session_id", "exp")):
            raise ValueError("invalid claims")
        if int(payload["exp"]) <= int(time.time()):
            raise ValueError("expired")
        return ArenaIdentity(
            user_id=str(payload["user_id"]),
            session_id=str(payload["session_id"]),
            role=payload["role"],
            expires_at=int(payload["exp"]),
        )
    except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError, KeyError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired Arena token.") from exc


def require_arena_identity(authorization: str | None = Header(default=None)) -> ArenaIdentity:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Arena bearer token is required.")
    return verify_arena_token(authorization.removeprefix("Bearer ").strip())


def authorize_session(identity: ArenaIdentity, session_id: str, host_only: bool = False) -> ArenaIdentity:
    if identity.session_id != session_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Arena token is not valid for this session.")
    if host_only and identity.role != "host":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Arena host role is required.")
    return identity
