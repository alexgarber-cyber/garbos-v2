from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Placeholder values shipped in .env.example / the committed defaults. They are
# fine for local dev but MUST be overridden in any non-development deployment —
# this repo is public, so these strings are effectively known to everyone.
_DEFAULT_SEED_PASSWORD = "changeme-please"
_DEFAULT_DB_CREDENTIALS = "garbos:garbos@"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://garbos:garbos@db:5432/garbos"
    environment: str = "development"

    # Auth / cookies
    cookie_secure: bool = False
    session_ttl_hours: int = 720
    web_origin: str = "http://localhost:3000"

    # Single-user seed
    seed_user_email: str = "alex@garbos.local"
    seed_user_password: str = "changeme-please"

    # IMAP polling (inbound/outbound email logging)
    imap_enabled: bool = False  # master switch; poller no-ops when off or creds blank
    imap_host: str = ""
    imap_port: int = 993
    imap_user: str = ""
    imap_password: str = ""
    imap_mailbox: str = "INBOX"
    imap_poll_interval_minutes: int = 5

    @model_validator(mode="after")
    def _reject_default_secrets_outside_dev(self) -> "Settings":
        """Refuse to boot a non-dev deployment that still uses the public defaults."""
        if self.environment == "development":
            return self
        insecure: list[str] = []
        if self.seed_user_password == _DEFAULT_SEED_PASSWORD:
            insecure.append("SEED_USER_PASSWORD is still the public default")
        if _DEFAULT_DB_CREDENTIALS in self.database_url:
            insecure.append("DATABASE_URL still uses the default garbos:garbos credentials")
        if insecure:
            raise ValueError(
                "Refusing to start with insecure defaults in environment="
                f"{self.environment!r}: " + "; ".join(insecure) + ". "
                "Set strong unique values in the server .env."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
