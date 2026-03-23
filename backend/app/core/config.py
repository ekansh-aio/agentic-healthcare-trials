"""
M2: Core Configuration
Owner: Backend Dev 1

Central config loaded from environment variables.
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Marketing Analytics Platform"
    DEBUG: bool = True
    SECRET_KEY: str = "CHANGE-ME-in-production-use-openssl-rand-hex-32"

    # JWT
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480   # 8 hours

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./marketing_platform.db"

    # Anthropic
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: str = "claude-sonnet-4-20250514"

    # File storage
    UPLOAD_DIR: str = "./uploads"
    OUTPUT_DIR: str = "./outputs"
    STATIC_DIR: str = "./static"
    STATIC_URL: str = "http://localhost:8000/static"

    class Config:
        env_file = ".env"


settings = Settings()