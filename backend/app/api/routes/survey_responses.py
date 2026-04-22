"""
Survey Responses Routes
Handles submission (public, no auth) and retrieval (study coordinator only).

POST /api/advertisements/{ad_id}/survey-responses
  — Called by the public landing page / chatbot after questionnaire completion.
  — No auth required.

GET /api/advertisements/{ad_id}/survey-responses
  — Returns all responses for a campaign.
  — Study Coordinator (company-scoped) only.

GET /api/advertisements/{ad_id}/survey-responses/{response_id}
  — Returns a single response with full details including voice call transcript.
  — Study Coordinator (company-scoped) only.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.db.database import get_db
from app.models.models import Advertisement, SurveyResponse, VoiceSession, CallTranscript, User, UserRole
from app.schemas.schemas import SurveyResponseCreate, SurveyResponseOut
from app.core.security import get_current_user

router = APIRouter(tags=["Survey Responses"])
logger = logging.getLogger(__name__)


# ── Public campaign info (title + questionnaire only — no auth) ───────────────
class PublicCampaignOut(BaseModel):
    id: str
    title: str
    questionnaire: Optional[dict] = None

    class Config:
        from_attributes = True


@router.get("/advertisements/{ad_id}/public", response_model=PublicCampaignOut)
async def get_public_campaign(
    ad_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Advertisement).where(Advertisement.id == ad_id)
    )
    ad = result.scalar_one_or_none()
    if ad is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return ad


# ── Submit survey response (public — no auth) ──────────────────────────────────
@router.post(
    "/advertisements/{ad_id}/survey-responses",
    response_model=SurveyResponseOut,
    status_code=201,
)
async def submit_survey_response(
    ad_id: str,
    body: SurveyResponseCreate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Advertisement).where(Advertisement.id == ad_id)
    )
    ad = result.scalar_one_or_none()
    if ad is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    response = SurveyResponse(
        advertisement_id=ad_id,
        full_name=body.full_name,
        age=body.age,
        sex=body.sex,
        phone=body.phone,
        answers=[a.model_dump() for a in body.answers],
        is_eligible=body.is_eligible,
    )
    db.add(response)
    await db.commit()
    await db.refresh(response)

    refreshed = await db.execute(
        select(SurveyResponse)
        .where(SurveyResponse.id == response.id)
        .options(selectinload(SurveyResponse.voice_sessions))
    )
    return refreshed.scalar_one()


# ── List responses (study coordinator, company-scoped) ─────────────────────────
@router.get(
    "/advertisements/{ad_id}/survey-responses",
    response_model=List[SurveyResponseOut],
)
async def list_survey_responses(
    ad_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ad = await _get_campaign_for_user(ad_id, current_user, db)
    if ad is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    result = await db.execute(
        select(SurveyResponse)
        .where(SurveyResponse.advertisement_id == ad_id)
        .options(
            selectinload(SurveyResponse.voice_sessions).selectinload(VoiceSession.transcripts)
        )
        .order_by(SurveyResponse.created_at.desc())
    )
    return result.scalars().all()


# ── Get single response (with voice transcript) ────────────────────────────────
@router.get(
    "/advertisements/{ad_id}/survey-responses/{response_id}",
    response_model=SurveyResponseOut,
)
async def get_survey_response(
    ad_id: str,
    response_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ad = await _get_campaign_for_user(ad_id, current_user, db)
    if ad is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    result = await db.execute(
        select(SurveyResponse)
        .where(
            SurveyResponse.id == response_id,
            SurveyResponse.advertisement_id == ad_id,
        )
        .options(
            selectinload(SurveyResponse.voice_sessions).selectinload(VoiceSession.transcripts)
        )
    )
    response = result.scalar_one_or_none()
    if response is None:
        raise HTTPException(status_code=404, detail="Response not found")
    return response


# ── Helper ─────────────────────────────────────────────────────────────────────
async def _get_campaign_for_user(
    ad_id: str, user: User, db: AsyncSession
):
    """Return the Advertisement if it belongs to the user's company, else None."""
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    return result.scalar_one_or_none()
