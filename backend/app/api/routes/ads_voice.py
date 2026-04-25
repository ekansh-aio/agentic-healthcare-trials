"""
Voice agent routes: provision, status, outbound calls, transcripts, conversations.
"""

import logging
from typing import Any, Dict, List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import require_roles
from app.db.database import get_db
from app.models.models import Advertisement, User, UserRole
from app.services.ai.voicebot_agent import VoicebotAgentService

router = APIRouter(prefix="/advertisements", tags=["Voice Agent"])
logger = logging.getLogger(__name__)


class VoiceCallRequest(BaseModel):
    phone_number: str
    action: str = "call_now"

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("phone_number is required")
        if not v.startswith("+"):
            raise ValueError("phone_number must include country code (e.g. +1...)")
        digits = v[1:].replace(" ", "").replace("-", "")
        if not digits.isdigit() or len(digits) < 7:
            raise ValueError("phone_number is not a valid phone number")
        return v


@router.post("/{ad_id}/voice-agent")
async def provision_voice_agent(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Provision (create or update) the ElevenLabs conversational AI agent for this campaign.
    Must be called after bot_config is set. Stores the agent_id back in bot_config.
    """
    svc = VoicebotAgentService(db)
    try:
        agent = await svc.provision_agent(ad_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {e}")
    return {"status": "provisioned", "agent_id": agent.get("agent_id"), "agent": agent}


@router.get("/{ad_id}/voice-recommendation")
async def get_voice_recommendation(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """
    Use Claude to analyze the campaign's target audience and recommend
    the best ElevenLabs voice profile + conversation style + opening message.
    """
    svc = VoicebotAgentService(db)
    try:
        recommendation = await svc.recommend_voice(ad_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendation error: {e}")
    return recommendation


@router.get("/{ad_id}/voice-agent/status")
async def get_voice_agent_status(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """Return ElevenLabs agent info for this campaign (name, voice, provisioned status)."""
    svc = VoicebotAgentService(db)
    try:
        status = await svc.get_agent_status(ad_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return status


@router.post("/{ad_id}/voice-call/request")
async def request_voice_call(
    ad_id: str,
    body: VoiceCallRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger an outbound phone call to the user's cell via ElevenLabs.
    No auth required — embedded in published landing pages.
    """
    svc = VoicebotAgentService(db)
    try:
        result = await svc.outbound_call(ad_id, body.phone_number)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {e}")
    return {"status": "calling", "to": body.phone_number, "detail": result}


@router.post("/{ad_id}/sync-voice-transcripts")
async def sync_voice_transcripts(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PROJECT_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Manually pull all completed call transcripts from ElevenLabs for this campaign
    and store them in the database, linked to participants by phone number.
    """
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Advertisement not found")

    svc = VoicebotAgentService(db)
    try:
        summary = await svc.sync_all_transcripts(ad_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs sync failed: {e}")
    return summary


@router.get("/{ad_id}/voice-session/token")
async def get_voice_session_token(
    ad_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Return a short-lived signed WebSocket URL for the ElevenLabs browser SDK.
    No auth required — embedded in published landing pages.
    """
    svc = VoicebotAgentService(db)
    try:
        signed_url = await svc.get_signed_url(ad_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {e}")
    return {"signed_url": signed_url}


@router.get("/voice-profiles/australian")
async def list_australian_voices(
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Return all Australian-accent voices available in the ElevenLabs account.
    Used by the publisher panel voice picker.

    Each entry includes:
      voice_id, name, gender, age, description, use_case, preview_url, labels
    """
    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY or ""}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.elevenlabs.io/v1/voices",
                headers=headers,
                params={"show_legacy": "false"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {exc.response.text}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch voices: {exc}")

    all_voices: List[Dict[str, Any]] = data.get("voices", [])

    australian = [
        {
            "voice_id":    v.get("voice_id", ""),
            "name":        v.get("name", ""),
            "preview_url": v.get("preview_url", ""),
            "gender":      v.get("labels", {}).get("gender", ""),
            "age":         v.get("labels", {}).get("age", ""),
            "description": v.get("labels", {}).get("description", ""),
            "use_case":    v.get("labels", {}).get("use_case", ""),
            "accent":      v.get("labels", {}).get("accent", ""),
            "labels":      v.get("labels", {}),
        }
        for v in all_voices
        if "australian" in str(v.get("labels", {}).get("accent", "")).lower()
    ]

    # Sort: females first (warmer for healthcare), then alphabetically
    australian.sort(key=lambda v: (0 if v["gender"].lower() == "female" else 1, v["name"]))

    return {"voices": australian, "total": len(australian)}


@router.get("/{ad_id}/voice-conversations")
async def list_voice_conversations(
    ad_id: str,
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """List past voice call sessions for this campaign, fetched from ElevenLabs."""
    svc = VoicebotAgentService(db)
    try:
        result = await svc.list_conversations(ad_id, page_size=page_size)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result


@router.get("/voice-conversations/{conversation_id}/transcript")
async def get_voice_transcript(
    conversation_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """Fetch the full transcript and metadata for a single voice conversation."""
    svc = VoicebotAgentService(db)
    try:
        transcript = await svc.get_conversation_transcript(conversation_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {e}")
    return transcript


@router.delete("/{ad_id}/voice-agent")
async def delete_voice_agent(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """Delete the ElevenLabs agent for this campaign."""
    svc = VoicebotAgentService(db)
    try:
        await svc.delete_agent(ad_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "deleted"}
