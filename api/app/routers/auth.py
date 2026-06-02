from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import SESSION_COOKIE, get_current_user
from app.core.security import (
    generate_session_token,
    hash_session_token,
    verify_password,
)
from app.db import get_db
from app.models.user import User

router = APIRouter()


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
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)) -> UserResponse:
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )

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
