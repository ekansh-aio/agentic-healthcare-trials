"""
M8: Advertisement Routes
Owner: Backend Dev 2
Dependencies: M1, M2, M5 (Curator), M6 (Reviewer)

Full advertisement lifecycle: create → curate → review → ethics → publish → optimize

Protocol documents (campaign-specific) are stored separately from company documents:
  - Table: advertisement_documents
  - Path:  uploads/docs/<company_id>/<advertisement_id>/<filename>
  - Priority: 10 (higher than company documents default of 0)
  - The curator loads both company docs and protocol docs, protocol docs win on priority.
"""

import os
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.db.database import get_db
from app.models.models import (
    User, UserRole, Advertisement, AdStatus, Review,
    CompanyDocument, AdvertisementDocument, BrandKit, Company,
)
from app.schemas.schemas import (
    AdvertisementCreate, AdvertisementOut, AdvertisementUpdate,
    ReviewCreate, ReviewOut, OptimizerDecision, BotConfigUpdate,
    AdvertisementDocumentOut,
)
from app.core.security import require_roles, get_current_user
from app.services.ai.curator import CuratorService
from app.services.ai.reviewer import ReviewerService
from app.services.storage import file_storage
from app.services.storage.extractor import extract_text, url_to_disk_path, BACKEND_ROOT

router = APIRouter(prefix="/advertisements", tags=["Advertisements"])

ALLOWED_PROTOCOL_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
}


# ─── CRUD ─────────────────────────────────────────────────────────────────────

@router.post("/", response_model=AdvertisementOut)
async def create_advertisement(
    body: AdvertisementCreate,
    user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    ad = Advertisement(
        company_id=user.company_id,
        title=body.title,
        ad_type=body.ad_type,
        budget=body.budget,
        platforms=body.platforms,
        target_audience=body.target_audience,
        status=AdStatus.DRAFT,
    )
    db.add(ad)
    await db.flush()
    return ad


@router.get("/", response_model=List[AdvertisementOut])
async def list_advertisements(
    status: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Advertisement).where(Advertisement.company_id == user.company_id)
    if status:
        query = query.where(Advertisement.status == status)
    result = await db.execute(query.order_by(Advertisement.updated_at.desc()))
    return result.scalars().all()


@router.get("/{ad_id}", response_model=AdvertisementOut)
async def get_advertisement(
    ad_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    return ad


@router.patch("/{ad_id}", response_model=AdvertisementOut)
async def update_advertisement(
    ad_id: str,
    body: AdvertisementUpdate,
    user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PUBLISHER, UserRole.REVIEWER])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ad, field, value)
    return ad


# ─── Protocol Documents ───────────────────────────────────────────────────────

@router.post("/{ad_id}/documents", response_model=AdvertisementDocumentOut)
async def upload_protocol_document(
    ad_id: str,
    doc_type: str = Form(...),
    title: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a campaign-specific protocol document.
    Stored separately from company documents — never appears on My Company page.
    Saved to uploads/docs/<company_id>/<ad_id>/<filename>.
    Created with priority=10 so the curator treats these as higher-priority
    context than generic company documents (priority=0).
    """
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    if file.content_type not in ALLOWED_PROTOCOL_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Accepted: PDF, DOCX, DOC, TXT, MD.",
        )

    file_path = await file_storage.save(
        file=file,
        subfolder=f"docs/{user.company_id}/{ad_id}",
        filename=file.filename,
    )

    disk_path = url_to_disk_path(file_path, BACKEND_ROOT)
    content   = extract_text(disk_path)

    doc = AdvertisementDocument(
        company_id=user.company_id,
        advertisement_id=ad_id,
        doc_type=doc_type,
        title=title,
        content=content,
        file_path=file_path,
        priority=10,
    )
    db.add(doc)
    await db.flush()
    return doc


@router.get("/{ad_id}/documents", response_model=List[AdvertisementDocumentOut])
async def list_protocol_documents(
    ad_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all protocol documents for an advertisement."""
    result = await db.execute(
        select(AdvertisementDocument).where(
            AdvertisementDocument.advertisement_id == ad_id,
            AdvertisementDocument.company_id == user.company_id,
        )
    )
    return result.scalars().all()


# ─── AI Strategy Generation (Curator) ────────────────────────────────────────

@router.post("/{ad_id}/generate-strategy", response_model=AdvertisementOut)
async def generate_strategy(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger the Curator agent to generate a marketing strategy.
    RAG context = company documents (priority 0) + protocol documents (priority 10).
    Protocol documents win on priority so campaign-specific context takes precedence.
    """
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    # Load company-level documents (baseline context)
    company_docs_result = await db.execute(
        select(CompanyDocument).where(CompanyDocument.company_id == user.company_id)
    )
    company_docs = company_docs_result.scalars().all()

    # Load campaign-specific protocol documents (high-priority context)
    protocol_docs_result = await db.execute(
        select(AdvertisementDocument).where(
            AdvertisementDocument.advertisement_id == ad_id,
            AdvertisementDocument.company_id == user.company_id,
        )
    )
    protocol_docs = protocol_docs_result.scalars().all()

    # Merge and sort by priority descending so curator sees highest-priority docs first
    all_docs = sorted(
        list(company_docs) + list(protocol_docs),
        key=lambda d: d.priority,
        reverse=True,
    )

    curator = CuratorService(db, user.company_id)
    try:
        strategy = await curator.generate_strategy(ad, all_docs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    ad.strategy_json = strategy
    ad.status = AdStatus.STRATEGY_CREATED

    return ad


# ─── Review Workflow ──────────────────────────────────────────────────────────

@router.post("/{ad_id}/submit-for-review", response_model=AdvertisementOut)
async def submit_for_review(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """Move ad to reviewer queue. Reviewer AI pre-processes the strategy."""
    result = await db.execute(
        select(Advertisement).where(Advertisement.id == ad_id)
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    reviewer_svc = ReviewerService(db, user.company_id)
    review_output = await reviewer_svc.pre_review(ad)

    ad.website_reqs = review_output.get("website_requirements")
    ad.ad_details = review_output.get("ad_details")
    ad.status = AdStatus.UNDER_REVIEW

    return ad


@router.post("/{ad_id}/reviews", response_model=ReviewOut)
async def create_review(
    ad_id: str,
    body: ReviewCreate,
    user: User = Depends(require_roles([UserRole.REVIEWER, UserRole.ETHICS_REVIEWER])),
    db: AsyncSession = Depends(get_db),
):
    review = Review(
        advertisement_id=ad_id,
        reviewer_id=user.id,
        review_type=body.review_type,
        status=body.status,
        comments=body.comments,
        suggestions=body.suggestions,
        edited_strategy=body.edited_strategy,
    )
    db.add(review)

    ad_result = await db.execute(select(Advertisement).where(Advertisement.id == ad_id))
    ad = ad_result.scalar_one_or_none()
    if ad and body.status == "approved":
        ad.status = AdStatus.APPROVED
    elif ad and body.review_type == "ethics":
        ad.status = AdStatus.ETHICS_REVIEW

    await db.flush()
    return review


@router.get("/{ad_id}/reviews", response_model=List[ReviewOut])
async def list_reviews(
    ad_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Review).where(Review.advertisement_id == ad_id)
    )
    return result.scalars().all()


# ─── Publishing ───────────────────────────────────────────────────────────────

@router.post("/{ad_id}/publish", response_model=AdvertisementOut)
async def publish_advertisement(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    if ad.status != AdStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Advertisement must be approved before publishing")

    ad.status = AdStatus.PUBLISHED
    return ad


# ─── Creative Generation ──────────────────────────────────────────────────────

@router.post("/{ad_id}/generate-creatives", response_model=AdvertisementOut)
async def generate_creatives(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate ad copy + images.
    - Claude writes headlines, body copy, CTAs, and image prompts per format.
    - Amazon Titan Image Generator v2 produces the actual images.
    - Images saved to outputs/<company_id>/<ad_id>/ and served via /outputs/.
    - Output stored in ad.output_files as a list of creative dicts.

    Available for approved and published campaigns.
    """
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    if ad.status not in (AdStatus.APPROVED, AdStatus.PUBLISHED):
        raise HTTPException(
            status_code=400,
            detail="Creatives can only be generated for approved or published campaigns.",
        )

    from app.services.ai.creative import CreativeService
    svc = CreativeService(company_id=user.company_id)
    try:
        creatives = await svc.generate_creatives(ad)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    ad.output_files = creatives
    return ad


# ─── Bot Configuration ────────────────────────────────────────────────────────

async def _user_from_query_token_ads(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Auth via ?token= for browser-opened URLs (same as documents.py pattern)."""
    from app.core.security import decode_token
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


@router.get("/{ad_id}/website")
async def serve_website(
    ad_id: str,
    download: bool = False,
    user: User = Depends(_user_from_query_token_ads),
    db: AsyncSession = Depends(get_db),
):
    """
    Serve the generated HTML landing page.
    ?download=true → Content-Disposition: attachment (triggers browser download).
    Accessible via the existing /api proxy — no separate /outputs proxy needed.
    """
    from fastapi.responses import HTMLResponse, Response
    import os as _os

    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    if not ad.output_url:
        raise HTTPException(status_code=404, detail="No website has been generated for this campaign yet")

    # output_url is "/outputs/<company_id>/<ad_id>/website/index.html"
    # Strip the leading "/outputs/" and resolve against OUTPUT_DIR
    from app.core.config import settings as _s
    relative  = ad.output_url.lstrip("/").removeprefix("outputs/")
    disk_path = _os.path.join(_s.OUTPUT_DIR, relative)

    if not _os.path.exists(disk_path):
        raise HTTPException(status_code=404, detail="Website file not found on disk")

    with open(disk_path, "r", encoding="utf-8") as f:
        html_content = f.read()

    if download:
        return Response(
            content=html_content,
            media_type="text/html",
            headers={"Content-Disposition": 'attachment; filename="landing-page.html"'},
        )
    return HTMLResponse(content=html_content)


@router.post("/{ad_id}/generate-website", response_model=AdvertisementOut)
async def generate_website(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.ADMIN, UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a static HTML landing page from the campaign's marketing strategy,
    reviewer website requirements, and company brand kit.

    Available once the campaign is approved or published.
    Saved to outputs/<company_id>/<ad_id>/website/index.html.
    URL stored in ad.output_url.
    """
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    if ad.status not in (AdStatus.APPROVED, AdStatus.PUBLISHED):
        raise HTTPException(
            status_code=400,
            detail="Website can only be generated for approved or published campaigns.",
        )

    brand_kit_result = await db.execute(
        select(BrandKit).where(BrandKit.company_id == user.company_id)
    )
    brand_kit = brand_kit_result.scalar_one_or_none()

    company_result = await db.execute(
        select(Company).where(Company.id == user.company_id)
    )
    company = company_result.scalar_one_or_none()

    from app.services.ai.website_agent import WebsiteAgentService
    svc = WebsiteAgentService(company_id=user.company_id)
    try:
        url = await svc.generate_website(ad, brand_kit, company)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    ad.output_url = url
    return ad


@router.delete("/{ad_id}", status_code=204)
async def delete_advertisement(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a campaign and all its related data. Admin only."""
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    await db.delete(ad)


@router.patch("/{ad_id}/bot-config", response_model=AdvertisementOut)
async def update_bot_config(
    ad_id: str,
    body: BotConfigUpdate,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Advertisement).where(Advertisement.id == ad_id)
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    ad.bot_config = body.model_dump(exclude_unset=True)
    return ad