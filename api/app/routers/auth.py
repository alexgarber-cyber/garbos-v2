import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import SESSION_COOKIE, get_current_user
from app.core.security import (
    generate_api_token,
    generate_session_token,
    hash_api_token,
    hash_session_token,
    verify_password,
)
from app.db import get_db
from app.models.user import User

router = APIRouter()

# In-memory brute-force guard for /login. Single worker + single user (uvicorn
# runs one worker, per CLAUDE.md), so a process-local sliding window is
# sufficient — no extra dependency or shared store needed. Keyed by client IP;
# successful logins clear the bucket.
_LOGIN_MAX_ATTEMPTS = 10
_LOGIN_WINDOW_SECONDS = 15 * 60
_login_failures: dict[str, list[float]] = {}


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _check_login_rate(ip: str) -> None:
    now = time.monotonic()
    cutoff = now - _LOGIN_WINDOW_SECONDS
    recent = [t for t in _login_failures.get(ip, []) if t > cutoff]
    _login_failures[ip] = recent
    if len(recent) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again later.",
        )


def _record_login_failure(ip: str) -> None:
    _login_failures.setdefault(ip, []).append(time.monotonic())


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str


class OkResponse(BaseModel):
    ok: bool


def _set_session_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=raw_token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.session_ttl_hours * 3600,
        path="/",
    )


@router.post("/login", response_model=UserResponse)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> UserResponse:
    ip = _client_ip(request)
    _check_login_rate(ip)

    user = db.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        _record_login_failure(ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )

    _login_failures.pop(ip, None)
    raw_token = generate_session_token()
    user.session_token_hash = hash_session_token(raw_token)
    user.session_expires_at = datetime.now(timezone.utc) + timedelta(
        hours=settings.session_ttl_hours
    )
    db.commit()

    _set_session_cookie(response, raw_token)
    return UserResponse(id=user.id, email=user.email)


@router.post("/logout", response_model=OkResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> OkResponse:
    # Logout must always succeed — even for an expired/invalid session, since
    # that is precisely when a user needs to clear it. So this does NOT depend
    # on get_current_user. Best-effort: revoke the server-side token if the
    # cookie still maps to a user, but always delete the cookie.
    raw = request.cookies.get(SESSION_COOKIE)
    if raw:
        token_hash = hash_session_token(raw)
        user = db.scalar(select(User).where(User.session_token_hash == token_hash))
        if user is not None:
            user.session_token_hash = None
            user.session_expires_at = None
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return OkResponse(ok=True)


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse(id=user.id, email=user.email)


class TokenStatusResponse(BaseModel):
    has_token: bool
    prefix: str | None


class TokenCreateResponse(BaseModel):
    token: str
    prefix: str


@router.get("/token", response_model=TokenStatusResponse)
def get_token_status(
    user: User = Depends(get_current_user),
) -> TokenStatusResponse:
    return TokenStatusResponse(has_token=user.api_token_hash is not None, prefix=user.api_token_prefix)


@router.post("/token", response_model=TokenCreateResponse)
def create_token(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenCreateResponse:
    raw = generate_api_token()
    user.api_token_hash = hash_api_token(raw)
    user.api_token_prefix = raw[:8]
    db.commit()
    return TokenCreateResponse(token=raw, prefix=raw[:8])


@router.delete("/token", response_model=OkResponse)
def revoke_token(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OkResponse:
    user.api_token_hash = None
    user.api_token_prefix = None
    db.commit()
    return OkResponse(ok=True)
