"""
M2: Core Configuration
Owner: Backend Dev 1

Central config loaded from environment variables.
"""

import os
from pydantic_settings import BaseSettings
from typing import Optional

# Resolve .env regardless of which directory the server is started from.
# Checks: backend/.env → project-root/.env → one further up.
_HERE = os.path.dirname(os.path.abspath(__file__))          # .../backend/app/core
_ENV_CANDIDATES = (
    os.path.join(_HERE, "..", "..", ".env"),                 # backend/.env
    os.path.join(_HERE, "..", "..", "..", ".env"),           # project-root/.env
    os.path.join(_HERE, "..", "..", "..", "..", ".env"),     # one above root
)
_ENV_FILE = next((p for p in _ENV_CANDIDATES if os.path.exists(p)), ".env")


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Marketing Analytics Platform"
    DEBUG: bool = False
    SECRET_KEY: str = "CHANGE-ME-in-production-use-openssl-rand-hex-32"

    # JWT
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60   # 1 hour

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./marketing_platform.db"

    # Anthropic (direct API)
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: str = "claude-sonnet-4-20250514"

    # AWS Bedrock
    USE_BEDROCK: bool = False
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "us-east-1"
    BEDROCK_MODEL: str = "us.anthropic.claude-sonnet-4-6"

    # Chat widget model (Haiku — lightweight, fast, stays within Bedrock)
    CHAT_MODEL: str = "us.anthropic.claude-haiku-3-5-20241022"

    # ElevenLabs
    ELEVENLABS_API_KEY: Optional[str] = None
    ELEVENLABS_VOICE_ID: str = "EXAVITQu4vr4xnSDxMaL"  # Default: Rachel

    # File storage
    UPLOAD_DIR: str = "./uploads"
    OUTPUT_DIR: str = "./outputs"
    STATIC_DIR: str = "./static"
    STATIC_URL: str = "/static"

    class Config:
        env_file = _ENV_FILE
        extra   = "ignore"   # ignore VITE_* and other frontend-only vars in .env


settings = Settings()