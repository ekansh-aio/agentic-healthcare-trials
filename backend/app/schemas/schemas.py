"""
M1: API Schemas (Pydantic)
Owner: Backend Dev 1
Dependencies: models.py

Request/Response schemas for all API endpoints.
Each schema group corresponds to a specific module.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, date
from enum import Enum


# ─── Enums (mirror DB enums for API layer) ────────────────────────────────────

class UserRoleEnum(str, Enum):
    study_coordinator = "study_coordinator"
    project_manager = "project_manager"
    ethics_manager = "ethics_manager"
    publisher = "publisher"

class AdTypeEnum(str, Enum):
    website = "website"
    ads = "ads"
    voicebot = "voicebot"
    chatbot = "chatbot"

class AdStatusEnum(str, Enum):
    draft = "draft"
    generating = "generating"
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
    company_industry: Optional[str] = None
    user_id: str
    full_name: str = ""
    email: str = ""
    onboarded: bool = False


# ─── Password Change Schemas ─────────────────────────────────────────────────

class ConfirmPasswordChangeRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8)


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

class UserUpdateSelf(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=256)

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
    pdf_path: Optional[str] = None

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
    pdf_path: Optional[str] = None


# ─── Advertisement Schemas ────────────────────────────────────────────────────

QUESTIONNAIRE_CAMPAIGN_CATEGORIES = {"recruitment", "survey", "hiring", "clinical_trial", "research"}

class AdvertisementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    ad_type: List[AdTypeEnum]
    campaign_category: Optional[str] = None
    budget: Optional[float] = None
    duration: Optional[str] = None
    trial_start_date: Optional[date] = None
    trial_end_date: Optional[date] = None
    platforms: Optional[List[str]] = None
    target_audience: Optional[Dict[str, Any]] = None
    trial_location: Optional[List[Dict[str, Any]]] = None  # [{ country, city }]
    patients_required: Optional[int] = None
    special_instructions: Optional[str] = None

class AdvertisementOut(BaseModel):
    id: str
    title: str
    ad_type: List[str]
    campaign_category: Optional[str] = None
    status: AdStatusEnum
    budget: Optional[float] = None
    duration: Optional[str] = None
    platforms: Optional[List[str]] = None
    strategy_json: Optional[Dict[str, Any]] = None
    review_notes: Optional[str] = None
    website_reqs: Optional[Dict[str, Any]] = None
    ad_details: Optional[Dict[str, Any]] = None
    output_url: Optional[str] = None
    hosted_url: Optional[str] = None
    output_files: Optional[List[Dict[str, Any]]] = None
    bot_config: Optional[Dict[str, Any]] = None
    questionnaire: Optional[Dict[str, Any]] = None
    trial_location: Optional[List[Dict[str, Any]]] = None
    patients_required: Optional[int] = None
    trial_start_date: Optional[date] = None
    trial_end_date: Optional[date] = None
    special_instructions: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class AdvertisementUpdate(BaseModel):
    title: Optional[str] = None
    budget: Optional[float] = None
    duration: Optional[str] = None
    trial_start_date: Optional[date] = None
    trial_end_date: Optional[date] = None
    platforms: Optional[List[str]] = None
    target_audience: Optional[Dict[str, Any]] = None
    status: Optional[AdStatusEnum] = None
    trial_location: Optional[List[Dict[str, Any]]] = None
    patients_required: Optional[int] = None

class QuestionnaireUpdate(BaseModel):
    questionnaire: Dict[str, Any]


# ─── Chunked Upload Schemas ───────────────────────────────────────────────────

class StartUploadRequest(BaseModel):
    doc_type:     str
    title:        str
    filename:     str
    content_type: str
    total_chunks: int

class ChunkUploadRequest(BaseModel):
    upload_id:   str
    chunk_index: int
    data:        str   # base64-encoded chunk bytes

class FinalizeUploadRequest(BaseModel):
    upload_id: str


# ─── S3 Pre-signed Upload Schemas ────────────────────────────────────────────

class PresignRequest(BaseModel):
    doc_type:     str
    title:        str
    filename:     str
    content_type: str
    file_size:    int   # bytes — used for validation before generating URL

class PresignResponse(BaseModel):
    method:        str                   # "s3" | "direct"
    upload_url:    Optional[str] = None  # pre-signed PUT URL (S3 only)
    s3_key:        Optional[str] = None  # key to pass back to /confirm (S3 only)
    content_type:  Optional[str] = None  # effective MIME type — must match the PUT header exactly

class ConfirmUploadRequest(BaseModel):
    s3_key:       str
    doc_type:     str
    title:        str
    filename:     str
    content_type: str


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
    spend: Optional[float] = None
    reach: Optional[int] = None
    cpm: Optional[float] = None
    date_label: Optional[str] = None
    source: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Optimizer Schemas ────────────────────────────────────────────────────────

class OptimizerSuggestion(BaseModel):
    advertisement_id: str
    status: str = "done"
    suggestions: Optional[Dict[str, Any]] = None
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
    bot_name: Optional[str] = None
    voice_id: Optional[str] = None
    first_message: Optional[str] = None
    conversation_style: Optional[str] = None
    compliance_notes: Optional[str] = None
    language: Optional[str] = None
    allowed_origins: Optional[List[str]] = None   # restrict chat to these origins
    additional_params: Optional[Dict[str, Any]] = None
    pause_schedule: Optional[Any] = None
    meta_campaign_id: Optional[str] = None


# ─── Reviewer Action Schemas ──────────────────────────────────────────────────

class MinorEditRequest(BaseModel):
    field: str        # dot-path e.g. "executive_summary" or "messaging.core_message"
    old_value: str
    new_value: str

class RewriteStrategyRequest(BaseModel):
    instructions: str

class RewriteQuestionRequest(BaseModel):
    question: dict
    instruction: str


# ─── Survey Response Schemas ──────────────────────────────────────────────────

class SurveyAnswerItem(BaseModel):
    question_id:   str
    question_text: str
    selected_option: str
    is_eligible:   Optional[bool] = None

class SurveyResponseCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=256)
    age:       int = Field(..., ge=1, le=120)
    sex:       str = Field(..., pattern="^(male|female|other|prefer_not_to_say)$")
    phone:     str = Field(..., min_length=5, max_length=32)
    answers:   List[SurveyAnswerItem] = []
    is_eligible: Optional[bool] = None

class CallTranscriptOut(BaseModel):
    speaker:      str
    text:         str
    turn_index:   Optional[int] = None
    timestamp_ms: Optional[int] = None

    class Config:
        from_attributes = True

class VoiceSessionOut(BaseModel):
    id:                         str
    elevenlabs_conversation_id: Optional[str] = None
    status:                     str
    phone:                      Optional[str] = None
    started_at:                 datetime
    ended_at:                   Optional[datetime] = None
    duration_seconds:           Optional[int] = None
    transcripts:                List[CallTranscriptOut] = []

    class Config:
        from_attributes = True

class SurveyResponseOut(BaseModel):
    id:               str
    advertisement_id: str
    full_name:        str
    age:              int
    sex:              str
    phone:            str
    answers:          List[Dict[str, Any]]
    is_eligible:      Optional[bool] = None
    created_at:       datetime
    voice_sessions:   List[VoiceSessionOut] = []

    class Config:
        from_attributes = True