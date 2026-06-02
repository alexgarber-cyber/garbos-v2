from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
