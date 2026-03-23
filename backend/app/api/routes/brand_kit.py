"""
Brand Kit Routes
Owner: Backend Dev 2
Dependencies: M1, M2

POST /onboarding/logo  — Upload company logo, returns stored URL
POST /brand-kit/       — Create brand kit during onboarding (Admin only)
GET  /brand-kit/       — Fetch company brand kit
PATCH /brand-kit/      — Update brand kit (editable from settings)
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.models.models import User, UserRole, BrandKit
from app.schemas.schemas import BrandKitCreate, BrandKitOut, BrandKitUpdate, LogoUploadResponse
from app.core.security import require_roles, get_current_user
from app.services.storage import file_storage

router = APIRouter(tags=["Brand Kit"])

ALLOWED_LOGO_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/svg+xml"}


# ─── Logo Upload ──────────────────────────────────────────────────────────────

@router.post("/onboarding/logo", response_model=LogoUploadResponse)
async def upload_logo(
    file: UploadFile = File(...),
    user: User = Depends(require_roles([UserRole.ADMIN])),
):
    """
    Upload company logo after registration.
    Accepts JPEG, PNG, SVG. Returns the stored URL.
    File is saved via the storage service (currently local, swap to Azure Blob
    by updating app/services/storage.py only).
    """
    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Accepted: JPEG, PNG, SVG.",
        )

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "png"
    filename = f"{user.company_id}_{uuid.uuid4().hex}.{ext}"

    logo_url = await file_storage.save(
        file=file,
        subfolder="logos",
        filename=filename,
    )

    return LogoUploadResponse(logo_url=logo_url)


# ─── Brand Kit CRUD ───────────────────────────────────────────────────────────

@router.post("/brand-kit/", response_model=BrandKitOut)
async def create_brand_kit(
    body: BrandKitCreate,
    user: User = Depends(require_roles([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db),
):
    """
    Create brand kit for the company during onboarding.
    If one already exists, raises 409 — use PATCH to update.
    """
    existing = await db.execute(
        select(BrandKit).where(BrandKit.company_id == user.company_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Brand kit already exists. Use PATCH /brand-kit/ to update.",
        )

    brand_kit = BrandKit(
        company_id=user.company_id,
        primary_color=body.primary_color,
        secondary_color=body.secondary_color,
        accent_color=body.accent_color,
        primary_font=body.primary_font,
        secondary_font=body.secondary_font,
        adjectives=body.adjectives,
        dos=body.dos,
        donts=body.donts,
        preset_name=body.preset_name,
    )
    db.add(brand_kit)
    await db.flush()
    return brand_kit


@router.get("/brand-kit/", response_model=BrandKitOut)
async def get_brand_kit(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch the company brand kit."""
    result = await db.execute(
        select(BrandKit).where(BrandKit.company_id == user.company_id)
    )
    brand_kit = result.scalar_one_or_none()
    if not brand_kit:
        raise HTTPException(status_code=404, detail="Brand kit not found")
    return brand_kit


@router.patch("/brand-kit/", response_model=BrandKitOut)
async def update_brand_kit(
    body: BrandKitUpdate,
    user: User = Depends(require_roles([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db),
):
    """Update brand kit — callable from onboarding or settings page."""
    result = await db.execute(
        select(BrandKit).where(BrandKit.company_id == user.company_id)
    )
    brand_kit = result.scalar_one_or_none()
    if not brand_kit:
        raise HTTPException(status_code=404, detail="Brand kit not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(brand_kit, field, value)
    return brand_kit