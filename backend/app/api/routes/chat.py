"""
Chat API — real-time AI chat for landing page widgets.

Flow:
  POST /api/chat  { campaignId, sessionId?, message }
    → origin check (allowed_origins in bot_config)
    → load Advertisement from DB (in-memory TTL cache)
    → find or create ChatSession for (campaignId, sessionId)
    → build system prompt strictly from THIS campaign's data
    → call Claude Haiku via Bedrock or Anthropic API
    → persist updated message history to ChatSession
    → return { reply, sessionId }

Key isolation guarantee:
  A session is tied to a single campaign_id at creation.
  Any request that sends a sessionId belonging to a different campaign
  is treated as a new session — the session is never shared or readable
  across campaign boundaries.

No auth required — the widget is embedded in a public landing page.
"""

import json
import logging
import time
import uuid as _uuid_mod
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bedrock import get_async_client, is_configured
from app.core.config import settings
from app.db.database import get_db
from app.models.models import Advertisement, ChatSession

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])

# ── In-memory advertisement cache ─────────────────────────────────────────────
_ad_cache: dict = {}
_CACHE_TTL = 300  # seconds


async def _load_ad(ad_id: str, db: AsyncSession) -> Optional[Advertisement]:
    now = time.monotonic()
    entry = _ad_cache.get(ad_id)
    if entry and (now - entry["ts"]) < _CACHE_TTL:
        return entry["ad"]

    result = await db.execute(select(Advertisement).where(Advertisement.id == ad_id))
    ad = result.scalar_one_or_none()
    if ad:
        _ad_cache[ad_id] = {"ad": ad, "ts": now}
    return ad


# ── Schemas ────────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    campaignId: str
    sessionId: Optional[str] = None   # omit on first message; server creates and returns one
    message: str


class ChatResponse(BaseModel):
    reply: str
    sessionId: str   # always returned so the widget can persist it


# ── System prompt ──────────────────────────────────────────────────────────────
def _build_system_prompt(ad: Advertisement) -> str:
    bot_config = ad.bot_config or {}
    bot_name   = bot_config.get("name", "Assistant") if isinstance(bot_config, dict) else "Assistant"
    style      = bot_config.get("conversation_style", "friendly and professional") if isinstance(bot_config, dict) else "friendly and professional"
    compliance = bot_config.get("compliance_notes", "") if isinstance(bot_config, dict) else ""

    strategy = ad.strategy_json or {}
    target   = strategy.get("target_audience", {}) if isinstance(strategy, dict) else {}

    lines = [
        f"You are {bot_name}, an AI assistant for a clinical trial recruitment campaign.",
        f'Campaign: "{ad.title}"',
        f"Conversation style: {style}.",
        "",
        "Your role is to help visitors understand the trial, answer questions about eligibility,",
        "and guide interested participants to connect with the research team.",
        "Be warm, concise, and empathetic. Always refer complex medical questions to the trial team.",
        "Never provide medical advice. Never guarantee eligibility.",
        "Keep replies under 3 sentences unless a longer answer is clearly needed.",
        "",
        "IMPORTANT: You only know about this specific campaign. Do not reference or speculate",
        "about other trials, campaigns, or studies.",
    ]

    if target:
        lines += ["", f"Target audience context: {json.dumps(target)}"]

    if compliance:
        lines += ["", f"Compliance requirements: {compliance}"]

    if isinstance(ad.website_reqs, dict):
        for key in ("faqs", "key_messages", "talking_points"):
            val = ad.website_reqs.get(key)
            if val:
                lines += ["", f"Key information ({key}): {json.dumps(val)}"]
                break

    return "\n".join(lines)


# ── Session helpers ────────────────────────────────────────────────────────────
async def _get_or_create_session(
    campaign_id: str,
    session_id: Optional[str],
    db: AsyncSession,
) -> ChatSession:
    """
    Return the ChatSession for (campaign_id, session_id).

    If session_id is None, or the session_id doesn't exist for THIS campaign
    (not just doesn't exist at all), create a fresh session.  This prevents
    a visitor from passing a session_id from Campaign B while talking to Campaign A.
    """
    if session_id:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.campaign_id == campaign_id,
                ChatSession.session_id  == session_id,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            return existing
        # session_id not found for this campaign → treat as new (no cross-campaign leak)

    new_session_id = session_id or str(_uuid_mod.uuid4())
    session = ChatSession(
        campaign_id=campaign_id,
        session_id=new_session_id,
        messages=[],
    )
    db.add(session)
    await db.flush()   # get PK without committing (commit happens in get_db on success)
    return session


# ── Mock fallback (when no AI backend is configured) ──────────────────────────
_MOCK_REPLIES = [
    "Thanks for reaching out! Our research team will be happy to help — please use the contact options on this page.",
    "That's a great question. Could you tell me a bit more so I can point you in the right direction?",
    "Our coordinators are best placed to answer that. Shall I help you get connected with the team?",
    "I want to make sure you get accurate information — let me note that for our coordinators.",
    "Happy to help! The trial team can discuss the specifics with you directly.",
]
_mock_idx = 0


# ── Endpoint ───────────────────────────────────────────────────────────────────
@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: Request,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    # 1. Load advertisement (cached)
    ad = await _load_ad(body.campaignId, db)
    if ad is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # 2. Origin validation — enforced when allowed_origins is configured
    bot_config      = ad.bot_config or {}
    allowed_origins = bot_config.get("allowed_origins") if isinstance(bot_config, dict) else None
    if allowed_origins:
        origin = request.headers.get("origin", "")
        if origin not in allowed_origins:
            raise HTTPException(status_code=403, detail="Forbidden")

    # 3. Load or create campaign-scoped session
    session = await _get_or_create_session(body.campaignId, body.sessionId, db)

    # 4. Build message list from persisted history + new user message
    history: list = session.messages or []
    messages = [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": body.message})

    # 5. Call Haiku or return mock response
    if not is_configured():
        global _mock_idx
        reply = _MOCK_REPLIES[_mock_idx % len(_MOCK_REPLIES)]
        _mock_idx += 1
    else:
        try:
            client   = get_async_client()
            response = await client.messages.create(
                model=settings.CHAT_MODEL,
                max_tokens=512,
                system=_build_system_prompt(ad),
                messages=messages,
            )
            reply = response.content[0].text.strip()
        except Exception as exc:
            logger.error("Chat LLM error for campaign %s: %s", body.campaignId, exc)
            raise HTTPException(status_code=502, detail="AI service temporarily unavailable")

    # 6. Persist updated history (SQLAlchemy JSON column requires reassignment to detect mutation)
    updated = history + [
        {"role": "user",      "content": body.message},
        {"role": "assistant", "content": reply},
    ]
    session.messages = updated

    return ChatResponse(reply=reply, sessionId=session.session_id)
