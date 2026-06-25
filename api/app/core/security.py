import hashlib
import secrets

from passlib.context import CryptContext

_pwd = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd.verify(password, password_hash)


def generate_session_token() -> str:
    """Raw token stored in the cookie (never persisted)."""
    return secrets.token_urlsafe(32)


def hash_session_token(raw_token: str) -> str:
    """SHA-256 of the token; this is what we persist and compare against.

    The token is high-entropy random, so a fast hash is appropriate here.
    """
    return hashlib.sha256(raw_token.encode()).hexdigest()


def generate_api_token() -> str:
    """Raw personal API token returned once at generation time (never persisted)."""
    return secrets.token_hex(32)


def hash_api_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()
