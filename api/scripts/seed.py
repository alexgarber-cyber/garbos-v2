"""Seed the single application user from env (idempotent)."""

from sqlalchemy import select

from app.config import settings
from app.core.security import hash_password
from app.db import SessionLocal
from app.models.user import User


def main() -> None:
    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.email == settings.seed_user_email))
        if existing is not None:
            print(f"User already exists: {existing.email} (id={existing.id})")
            return

        user = User(
            email=settings.seed_user_email,
            password_hash=hash_password(settings.seed_user_password),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"Created user: {user.email} (id={user.id})")


if __name__ == "__main__":
    main()
