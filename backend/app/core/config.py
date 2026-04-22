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
    JWT_EXPIRE_MINUTES: int = 1440   # 24 hours — proactively refreshed by frontend

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./marketing_platform.db"

    # Anthropic (direct API)
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: str = "claude-sonnet-4-20250514"
    # Opus 4.6 — used exclusively for ad strategy generation (curator)
    ANTHROPIC_CURATOR_MODEL: str = "claude-opus-4-6"

    # AWS Bedrock
    USE_BEDROCK: bool = False
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "us-east-1"
    BEDROCK_MODEL: str = "us.anthropic.claude-sonnet-4-6"
    # Opus 4.6 Bedrock ID — used exclusively for ad strategy generation (curator)
    BEDROCK_CURATOR_MODEL: str = "us.anthropic.claude-opus-4-6-v1"

    # Chat widget model (Haiku — lightweight, fast, stays within Bedrock)
    CHAT_MODEL: str = "us.anthropic.claude-haiku-3-5-20241022"

    # Azure AI Foundry / Azure OpenAI
    # Set AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY to use Azure Foundry.
    # Leave blank to fall back to standard OpenAI (OPENAI_API_KEY).
    AZURE_OPENAI_ENDPOINT: Optional[str] = None
    AZURE_OPENAI_API_KEY: Optional[str] = None
    AZURE_OPENAI_API_VERSION: str = "2025-04-01-preview"
    # Azure OpenAI Chat (GPT-5) — separate resource from image gen if needed
    # If blank, falls back to AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY
    AZURE_CHAT_ENDPOINT: Optional[str] = None
    AZURE_CHAT_API_KEY: Optional[str] = None
    AZURE_CHAT_DEPLOYMENT: str = "gpt-5"
    # Standard OpenAI fallback
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_IMAGE_MODEL: str = "gpt-image-1.5"

    # Meta for Developers – OAuth credentials for Facebook/Instagram ad publishing
    # Register your app at https://developers.facebook.com and add the Marketing API product.
    META_APP_ID: Optional[str] = None
    META_APP_SECRET: Optional[str] = None
    META_OAUTH_REDIRECT_URI: str = "http://localhost:8000/api/platform-connections/meta/callback"

    # ElevenLabs
    ELEVENLABS_API_KEY: Optional[str] = None
    ELEVENLABS_VOICE_ID: str = "EXAVITQu4vr4xnSDxMaL"  # Default: Rachel
    ELEVENLABS_PHONE_NUMBER_ID: Optional[str] = None  # Phone number ID for outbound calls
    # TTS model for conversational AI agents — eleven_v3 is the latest model
    # with enhanced support for audio expression tags and natural disfluencies
    ELEVENLABS_TTS_MODEL: str = "eleven_v3_conversational"
    ELEVENLABS_WEBHOOK_SECRET: Optional[str] = None   # HMAC secret set on the ElevenLabs agent

    # Public-facing base URL — used to register post-call webhook with ElevenLabs.
    # Example: https://api.yourdomain.com  (no trailing slash)
    APP_PUBLIC_URL: Optional[str] = None

    # Email (SMTP) — leave blank to log OTP to console instead of sending
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""          # defaults to SMTP_USER if blank

    # File storage
    UPLOAD_DIR: str = "./uploads"
    OUTPUT_DIR: str = "./outputs"
    STATIC_DIR: str = "./static"
    STATIC_URL: str = "/static"

    # S3 — optional. When set, protocol document uploads use S3 pre-signed URLs
    # so files bypass CloudFront WAF body-size limits entirely.
    # Leave blank for local/dev — falls back to direct multipart upload.
    S3_UPLOAD_BUCKET: Optional[str] = None
    S3_UPLOAD_PREFIX: str = "ad-documents"  # key prefix inside the bucket

    class Config:
        env_file = _ENV_FILE
        extra   = "ignore"   # ignore VITE_* and other frontend-only vars in .env


settings = Settings()