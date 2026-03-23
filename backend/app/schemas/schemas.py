"""
M1: API Schemas (Pydantic)
Owner: Backend Dev 1
Dependencies: models.py

Request/Response schemas for all API endpoints.
Each schema group corresponds to a specific module.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
from enum import Enum


# ─── Enums (mirror DB enums for API layer) ────────────────────────────────────

class UserRoleEnum(str, Enum):
    admin = "admin"
    reviewer = "reviewer"
    ethics_reviewer = "ethics_reviewer"
    publisher = "publisher"

class AdTypeEnum(str, Enum):
    website = "website"
    ads = "ads"
    voicebot = "voicebot"
    chatbot = "chatbot"

class AdStatusEnum(str, Enum):
    draft = "draft"
    strategy_created = "strategy_created"
    under_review = "under_review"
    ethics_review = "ethics_review"
    approved = "approved"
    published = "published"
    paused = "paused"
    optimizing = "optimizing"

class DocumentTypeEnum(str, Enum):
    usp = "usp"
    compliance = "compliance"
    policy = "policy"
    marketing_goal = "marketing_goal"
    ethical_guideline = "ethical_guideline"
    reference = "reference"
    protocol = "protocol"
    input = "input"


# ─── Auth Schemas ─────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    company: str
    role: UserRoleEnum

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRoleEnum
    company_id: str
    company_name: str
    user_id: str


# ─── Onboarding Schemas ──────────────────────────────────────────────────────

class OnboardingRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=256)
    industry: Optional[str] = None
    logo_url: Optional[str] = None
    admin_email: EmailStr
    admin_password: str = Field(..., min_length=8)
    admin_name: str

class OnboardingResponse(BaseModel):
    company_id: str
    admin_user_id: str
    message: str = "Company onboarded successfully"

class LogoUploadResponse(BaseModel):
    logo_url: str


# ─── User Schemas ─────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str
    role: UserRoleEnum

class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRoleEnum
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Company Document Schemas ─────────────────────────────────────────────────
# Global company-level documents. Shown in My Company page.

class DocumentCreate(BaseModel):
    doc_type: DocumentTypeEnum
    title: str
    content: Optional[str] = None

class DocumentOut(BaseModel):
    id: str
    doc_type: str
    title: str
    content: Optional[str] = None
    file_path: Optional[str] = None
    priority: int
    version: int
    updated_at: datetime

    class Config:
        from_attributes = True

class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    priority: Optional[int] = None


# ─── Advertisement Document Schemas ──────────────────────────────────────────
# Campaign-specific protocol documents. Never shown on My Company page.
# doc_type is a plain string (freeform) — not constrained to DocumentTypeEnum.

class AdvertisementDocumentOut(BaseModel):
    id: str
    advertisement_id: str
    doc_type: str
    title: str
    file_path: Optional[str] = None
    priority: int
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Brand Kit Schemas ────────────────────────────────────────────────────────

class BrandKitCreate(BaseModel):
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    primary_font: Optional[str] = None
    secondary_font: Optional[str] = None
    adjectives: Optional[str] = None
    dos: Optional[str] = None
    donts: Optional[str] = None
    preset_name: Optional[str] = None

class BrandKitOut(BaseModel):
    id: str
    company_id: str
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    primary_font: Optional[str] = None
    secondary_font: Optional[str] = None
    adjectives: Optional[str] = None
    dos: Optional[str] = None
    donts: Optional[str] = None
    preset_name: Optional[str] = None
    pdf_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class BrandKitUpdate(BaseModel):
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    primary_font: Optional[str] = None
    secondary_font: Optional[str] = None
    adjectives: Optional[str] = None
    dos: Optional[str] = None
    donts: Optional[str] = None
    preset_name: Optional[str] = None


# ─── Advertisement Schemas ────────────────────────────────────────────────────

class AdvertisementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    ad_type: List[AdTypeEnum]
    budget: Optional[float] = None
    platforms: Optional[List[str]] = None
    target_audience: Optional[Dict[str, Any]] = None

class AdvertisementOut(BaseModel):
    id: str
    title: str
    ad_type: List[str]
    status: AdStatusEnum
    budget: Optional[float] = None
    platforms: Optional[List[str]] = None
    strategy_json: Optional[Dict[str, Any]] = None
    review_notes: Optional[str] = None
    website_reqs: Optional[Dict[str, Any]] = None
    ad_details: Optional[Dict[str, Any]] = None
    output_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class AdvertisementUpdate(BaseModel):
    title: Optional[str] = None
    budget: Optional[float] = None
    platforms: Optional[List[str]] = None
    target_audience: Optional[Dict[str, Any]] = None
    status: Optional[AdStatusEnum] = None


# ─── Review Schemas ───────────────────────────────────────────────────────────

class ReviewCreate(BaseModel):
    review_type: Literal["strategy", "ethics", "performance"]
    status: Literal["pending", "approved", "rejected", "revision"] = "pending"
    comments: Optional[str] = None
    suggestions: Optional[Dict[str, Any]] = None
    edited_strategy: Optional[Dict[str, Any]] = None

class ReviewOut(BaseModel):
    id: str
    advertisement_id: str
    reviewer_id: str
    review_type: str
    status: str
    comments: Optional[str] = None
    suggestions: Optional[Dict[str, Any]] = None
    edited_strategy: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Analytics Schemas ────────────────────────────────────────────────────────

class AnalyticsOut(BaseModel):
    id: str
    advertisement_id: str
    recorded_at: datetime
    user_retention: Optional[float] = None
    click_rate: Optional[float] = None
    follow_through: Optional[float] = None
    views: Optional[int] = None
    likes: Optional[int] = None
    demographics: Optional[Dict[str, Any]] = None
    impressions: Optional[int] = None
    conversions: Optional[int] = None
    cost_per_click: Optional[float] = None

    class Config:
        from_attributes = True


# ─── Optimizer Schemas ────────────────────────────────────────────────────────

class OptimizerSuggestion(BaseModel):
    advertisement_id: str
    suggestions: Dict[str, Any]
    context: Optional[Dict[str, Any]] = None

class OptimizerDecision(BaseModel):
    decision: Literal["accepted", "rejected", "partial"]
    applied_changes: Optional[Dict[str, Any]] = None


# ─── Skill / Training Schemas ────────────────────────────────────────────────

class TrainingRequest(BaseModel):
    """Triggered after onboarding to initialize Curator + Reviewer skills."""
    company_id: str

class TrainingStatus(BaseModel):
    company_id: str
    curator_ready: bool
    reviewer_ready: bool
    skill_versions: Dict[str, int]

class SkillOut(BaseModel):
    id: str
    skill_type: str
    version: int
    lessons_learnt: Optional[str] = None
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Bot Config Schemas ──────────────────────────────────────────────────────

class BotConfigUpdate(BaseModel):
    conversation_style: Optional[str] = None
    voice: Optional[str] = None
    language: Optional[str] = None
    additional_params: Optional[Dict[str, Any]] = None