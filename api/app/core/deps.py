from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_api_token, hash_session_token
from app.db import get_db
from app.models.user import User

SESSION_COOKIE = "session"


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    # 1. Session cookie (browser / web UI path)
    raw = request.cookies.get(SESSION_COOKIE)
    if raw:
        token_hash = hash_session_token(raw)
        user = db.scalar(select(User).where(User.session_token_hash == token_hash))
        if user is None or user.session_expires_at is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
        if user.session_expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
        return user

    # 2. Bearer token (extension / non-browser clients)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        raw_token = auth_header[7:]
        token_hash = hash_api_token(raw_token)
        user = db.scalar(select(User).where(User.api_token_hash == token_hash))
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API token")
        return user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
