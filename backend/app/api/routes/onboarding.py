"""
M3: Onboarding Routes
Owner: Backend Dev 2
Dependencies: M1 (models), M2 (auth), M4 (training service)

POST /onboarding/             — Register company + admin (one-time)
POST /onboarding/documents    — Upload company documents
POST /onboarding/train        — Trigger AI training (skill initialization)

File storage note:
  Document files are saved via app/services/storage.py (currently local disk).
  To migrate to Azure Blob Storage, update storage.py only — no changes needed here.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select

from app.db.database import get_db
from app.models.models import Company, User, CompanyDocument, UserRole
from app.schemas.schemas import (
    OnboardingRequest, OnboardingResponse, TrainingStatus, DocumentOut,
)
from app.core.security import hash_password, require_roles
from app.services.storage import file_storage
from app.services.training.trainer import TrainingService

router = APIRouter(prefix="/onboarding", tags=["Onboarding"])


@router.post("/", response_model=OnboardingResponse)
async def onboard_company(body: OnboardingRequest, db: AsyncSession = Depends(get_db)):
    """
    One-time company onboarding.
    Creates the company record and registers the ADMIN user.
    Returns 409 with detail "company_exists" or "email_exists" for duplicates
    so the frontend can show a targeted message.
    """
    # Check duplicate company name
    existing = await db.execute(select(Company).where(Company.name == body.company_name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="company_exists")

    # Check duplicate email
    existing_user = await db.execute(select(User).where(User.email == body.admin_email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="email_exists")

    # Create company
    company = Company(
        name=body.company_name,
        industry=body.industry,
        logo_url=body.logo_url,
    )
    db.add(company)
    await db.flush()

    # Create admin user
    admin = User(
        company_id=company.id,
        email=body.admin_email,
        hashed_pw=hash_password(body.admin_password),
        full_name=body.admin_name,
        role=UserRole.ADMIN,
    )
    db.add(admin)

    try:
        await db.flush()
    except IntegrityError:
        # Safety net for race condition between the check above and the insert
        await db.rollback()
        raise HTTPException(status_code=409, detail="email_exists")

    company.onboarded = True

    return OnboardingResponse(company_id=company.id, admin_user_id=admin.id)


@router.post("/documents", response_model=DocumentOut)
async def upload_document(
    doc_type: str = Form(...),
    title: str = Form(...),
    content: str = Form(None),
    file: UploadFile = File(None),
    user: User = Depends(require_roles([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload company-specific documents during or after onboarding.
    Supports: USP, Compliances, Policies, Marketing Goals, Ethical Guidelines, etc.
    File is saved via the storage service — swap to Azure Blob by updating
    app/services/storage.py only.
    """
    file_path = None
    if file:
        file_path = await file_storage.save(
            file=file,
            subfolder=f"docs/{user.company_id}",
            filename=file.filename,
        )

    doc = CompanyDocument(
        company_id=user.company_id,
        doc_type=doc_type,
        title=title,
        content=content,
        file_path=file_path,
    )
    db.add(doc)
    await db.flush()

    return doc


@router.post("/train", response_model=TrainingStatus)
async def trigger_training(
    user: User = Depends(require_roles([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger AI Training (skill-creator):
    1. Read skill.md templates for Curator and Reviewer
    2. Fill placeholders with company-specific data from onboarding
    3. Generate customized skill.md files

    TODO: Not yet fully implemented — skill templates must exist at
    /skills/templates/trainer_template.md before this endpoint will work.
    """
    trainer = TrainingService(db)
    status = await trainer.train_company_skills(user.company_id)
    return status