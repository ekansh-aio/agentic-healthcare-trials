"""
M7/M15: Analytics & Optimizer Routes
Owner: Backend Dev 2 / AI Dev
Dependencies: M1, M2, M7 (Optimizer Service)

GET  /analytics/{ad_id}                  — Performance data for an advertisement
POST /analytics/{ad_id}/optimize         — Trigger optimizer suggestions
POST /analytics/{ad_id}/regenerate-item  — Regenerate a single optimization item via its prompt
POST /analytics/{ad_id}/decision         — Human accepts/rejects optimizer suggestions
"""

import json
import logging
import re
import traceback

from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.db.database import get_db
from app.models.models import (
    User, UserRole, Advertisement, AdAnalytics, OptimizerLog, Review
)
from app.schemas.schemas import AnalyticsOut, OptimizerSuggestion, OptimizerDecision
from app.core.security import require_roles, get_current_user
from app.core.bedrock import get_async_client, get_model, is_configured
from app.services.optimization.optimizer import OptimizerService

router = APIRouter(prefix="/analytics", tags=["Analytics & Optimization"])


@router.get("/{ad_id}", response_model=List[AnalyticsOut])
async def get_analytics(
    ad_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve performance metrics for an advertisement."""
    result = await db.execute(
        select(AdAnalytics)
        .where(AdAnalytics.advertisement_id == ad_id)
        .order_by(AdAnalytics.recorded_at.desc())
    )
    return result.scalars().all()


@router.post("/{ad_id}/optimize", response_model=OptimizerSuggestion)
async def trigger_optimization(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PUBLISHER, UserRole.PROJECT_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger the Optimizer Automation module.
    
    Analyzes performance data with weighted factors:
    - Websites: user retention, click rate, follow-through rate, call duration
    - Ads: click rate, views, demographics, likes
    
    Uses Reviewer context for situational awareness.
    Returns suggestions for human-in-the-loop review.
    """
    # Get ad
    ad_result = await db.execute(select(Advertisement).where(Advertisement.id == ad_id))
    ad = ad_result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    # Get analytics data
    analytics_result = await db.execute(
        select(AdAnalytics).where(AdAnalytics.advertisement_id == ad_id)
    )
    analytics = analytics_result.scalars().all()

    # Get reviewer context
    review_result = await db.execute(
        select(Review).where(Review.advertisement_id == ad_id)
    )
    reviews = review_result.scalars().all()

    optimizer = OptimizerService(db, user.company_id)
    try:
        suggestions = await optimizer.generate_suggestions(ad, analytics, reviews)
    except Exception as exc:
        logger.error("Optimizer generate_suggestions failed for ad %s: %s\n%s", ad_id, exc, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Optimizer failed: {exc}")

    # Log the suggestion (non-fatal — don't let a DB write kill the response)
    try:
        log = OptimizerLog(
            advertisement_id=ad_id,
            suggestions=suggestions["suggestions"],
            context=suggestions.get("context"),
        )
        db.add(log)
        await db.flush()
    except Exception as exc:
        logger.error("Failed to persist optimizer log for ad %s: %s", ad_id, exc)

    return OptimizerSuggestion(
        advertisement_id=ad_id,
        suggestions=suggestions["suggestions"],
        context=suggestions.get("context"),
    )


class RegenerateItemRequest(BaseModel):
    prompt: str
    item_type: Optional[str] = "general"  # "cost" | "website" | "advertisement"


@router.post("/{ad_id}/regenerate-item")
async def regenerate_optimizer_item(
    ad_id: str,
    body: RegenerateItemRequest,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PUBLISHER, UserRole.PROJECT_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Regenerate a single optimization item using its stored AI prompt.
    Returns a new { what, why, prompt } object.
    """
    if not is_configured():
        return {
            "what":   "Regenerated suggestion (Bedrock not configured)",
            "why":    f"Prompt used: {body.prompt[:120]}…",
            "prompt": body.prompt,
        }

    system_prompt = (
        "You are a marketing optimization AI. "
        "Given a prompt, return a single optimization suggestion as a JSON object with exactly three keys: "
        "'what' (the specific change to make), "
        "'why' (data-driven reason), and "
        "'prompt' (an improved self-contained prompt for future regeneration). "
        "Output ONLY a raw JSON object — no markdown, no code fences. "
        "Your entire response must start with { and end with }."
    )

    client = get_async_client()
    response = await client.messages.create(
        model=get_model(),
        max_tokens=800,
        system=system_prompt,
        messages=[{"role": "user", "content": body.prompt}],
    )
    text = response.content[0].text.strip()

    for extractor in [
        lambda t: json.loads(t),
        lambda t: json.loads(
            re.sub(r"^```[a-zA-Z]*\s*", "", re.sub(r"\s*```\s*$", "", t)).strip()
        ),
        lambda t: json.loads(re.search(r"\{[\s\S]*\}", t).group(0)),
    ]:
        try:
            result = extractor(text)
            # Ensure all three keys exist
            return {
                "what":   result.get("what",   ""),
                "why":    result.get("why",    ""),
                "prompt": result.get("prompt", body.prompt),
            }
        except Exception:
            continue

    return {"what": text, "why": "Raw AI response", "prompt": body.prompt}


@router.post("/{ad_id}/decision")
async def submit_optimizer_decision(
    ad_id: str,
    body: OptimizerDecision,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PUBLISHER, UserRole.PROJECT_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Human-in-the-loop decision on optimizer suggestions.
    Accepts, rejects, or partially applies changes.
    """
    # Get latest optimizer log
    result = await db.execute(
        select(OptimizerLog)
        .where(OptimizerLog.advertisement_id == ad_id)
        .order_by(OptimizerLog.created_at.desc())
    )
    log = result.scalars().first()
    if not log:
        raise HTTPException(status_code=404, detail="No optimizer suggestions found")

    log.human_decision = body.decision
    log.applied_changes = body.applied_changes

    # If accepted, trigger reinforcement learning
    if body.decision in ("accepted", "partial"):
        from app.services.optimization.reinforcement import ReinforcementService
        rl_service = ReinforcementService(db, user.company_id)
        await rl_service.record_outcome(ad_id, log, body.decision)

    return {"detail": f"Decision '{body.decision}' recorded", "log_id": log.id}
