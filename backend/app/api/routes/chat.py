"""
Chat API — real-time AI chat for landing page widgets.

Flow (matches architecture diagram):
  POST /api/chat  { projectId, message, history }
    → origin check (allowed_origins in bot_config)
    → load Advertisement from DB (in-memory TTL cache)
    → build system prompt (campaign context + rules)
    → call Anthropic / Bedrock LLM
    → return { reply }

No auth required — the widget is embedded in a public landing page.
"""

import json
import logging
import time
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bedrock import get_async_client, get_model, is_configured
from app.db.database import get_db
from app.models.models import Advertisement

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])

# ── In-memory project cache ────────────────────────────────────────────────────
# Avoids a DB round-trip on every message for the same campaign.
_cache: dict = {}
_CACHE_TTL = 300  # seconds


async def _load_project(ad_id: str, db: AsyncSession):
    now = time.monotonic()
    entry = _cache.get(ad_id)
    if entry and (now - entry["ts"]) < _CACHE_TTL:
        return entry["ad"]

    result = await db.execute(select(Advertisement).where(Advertisement.id == ad_id))
    ad = result.scalar_one_or_none()
    if ad:
        _cache[ad_id] = {"ad": ad, "ts": now}
    return ad


# ── Schemas ────────────────────────────────────────────────────────────────────
class HistoryMessage(BaseModel):
    role: str      # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    projectId: str
    message: str
    history: List[HistoryMessage] = []


class ChatResponse(BaseModel):
    reply: str


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
    ]

    if target:
        lines += ["", f"Target audience context: {json.dumps(target)}"]

    if compliance:
        lines += ["", f"Compliance requirements: {compliance}"]

    # Include key messages / FAQs from reviewer requirements if present
    if isinstance(ad.website_reqs, dict):
        for key in ("faqs", "key_messages", "talking_points"):
            val = ad.website_reqs.get(key)
            if val:
                lines += ["", f"Key information ({key}): {json.dumps(val)}"]
                break

    return "\n".join(lines)


# ── Mock fallback (when no LLM is configured) ──────────────────────────────────
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
    # 1. Load project (DB + in-memory cache)
    ad = await _load_project(body.projectId, db)
    if ad is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # 2. Origin validation — optional; only enforced when allowed_origins is configured
    bot_config      = ad.bot_config or {}
    allowed_origins = bot_config.get("allowed_origins") if isinstance(bot_config, dict) else None
    if allowed_origins:
        origin = request.headers.get("origin", "")
        if origin not in allowed_origins:
            raise HTTPException(status_code=403, detail="Forbidden")

    # 3. Build messages for the LLM
    messages = [{"role": m.role, "content": m.content} for m in body.history]
    messages.append({"role": "user", "content": body.message})

    # 4. Call LLM or return mock response
    if not is_configured():
        global _mock_idx
        reply = _MOCK_REPLIES[_mock_idx % len(_MOCK_REPLIES)]
        _mock_idx += 1
        return ChatResponse(reply=reply)

    try:
        client = get_async_client()
        response = await client.messages.create(
            model=get_model(),
            max_tokens=512,
            system=_build_system_prompt(ad),
            messages=messages,
        )
        reply = response.content[0].text.strip()
    except Exception as exc:
        logger.error("Chat LLM error for project %s: %s", body.projectId, exc)
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable")

    return ChatResponse(reply=reply)
