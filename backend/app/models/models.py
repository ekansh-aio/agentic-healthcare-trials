"""
M1: Database Models
Owner: Backend Dev 1
Dependencies: database.py

All SQLAlchemy ORM models for the platform.
Each class maps to a table and is independently testable.
"""

import uuid
import enum
from datetime import datetime, timezone

def _now():
    # Return naive UTC datetime — DB columns are DateTime (no timezone).
    # Using datetime.now(utc).replace(tzinfo=None) avoids the deprecation
    # warning from utcnow() while keeping the value naive for SQLAlchemy.
    return datetime.now(timezone.utc).replace(tzinfo=None)
from sqlalchemy import (
    Column, String, Text, DateTime, Date, ForeignKey, Enum, Boolean,
    Integer, Float, JSON, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.db.database import Base


# ─── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    STUDY_COORDINATOR = "study_coordinator"
    PROJECT_MANAGER = "project_manager"
    ETHICS_MANAGER = "ethics_manager"
    PUBLISHER = "publisher"


class AdType(str, enum.Enum):
    WEBSITE = "website"
    ADS = "ads"
    VOICEBOT = "voicebot"
    CHATBOT = "chatbot"


class AdStatus(str, enum.Enum):
    DRAFT = "draft"
    STRATEGY_CREATED = "strategy_created"
    UNDER_REVIEW = "under_review"
    ETHICS_REVIEW = "ethics_review"
    APPROVED = "approved"
    PUBLISHED = "published"
    PAUSED = "paused"
    OPTIMIZING = "optimizing"


class DocumentType(str, enum.Enum):
    USP = "usp"
    COMPLIANCE = "compliance"
    POLICY = "policy"
    MARKETING_GOAL = "marketing_goal"
    ETHICAL_GUIDELINE = "ethical_guideline"
    REFERENCE = "reference"
    PROTOCOL = "protocol"
    INPUT = "input"


# ─── Helper ───────────────────────────────────────────────────────────────────

def _uuid():
    return str(uuid.uuid4())


# ─── Company ──────────────────────────────────────────────────────────────────

class Company(Base):
    __tablename__ = "companies"

    id         = Column(String, primary_key=True, default=_uuid)
    name       = Column(String(256), nullable=False)
    logo_url   = Column(String(512), nullable=True)
    industry   = Column(String(128), nullable=True)
    locations  = Column(JSON, nullable=True)   # [{ country, cities: [] }]
    created_at = Column(DateTime, default=_now)
    onboarded  = Column(Boolean, default=False)

    users              = relationship("User", back_populates="company", cascade="all, delete-orphan")
    documents          = relationship("CompanyDocument", back_populates="company", cascade="all, delete-orphan")
    advertisements     = relationship("Advertisement", back_populates="company", cascade="all, delete-orphan")
    skills             = relationship("SkillConfig", back_populates="company", cascade="all, delete-orphan")
    reinforcement_logs = relationship("ReinforcementLog", back_populates="company", cascade="all, delete-orphan")
    brand_kit          = relationship("BrandKit", back_populates="company", uselist=False, cascade="all, delete-orphan")


# ─── User ─────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id         = Column(String, primary_key=True, default=_uuid)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    email      = Column(String(256), unique=True, nullable=False)
    hashed_pw  = Column(String(512), nullable=False)
    full_name  = Column(String(256), nullable=False)
    role       = Column(Enum(UserRole), nullable=False)
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_now)

    company = relationship("Company", back_populates="users")
    reviews = relationship("Review", back_populates="reviewer", cascade="all, delete-orphan")


# ─── Company Documents ────────────────────────────────────────────────────────
# Global company-level documents: USP, compliance, policies, guidelines.
# Shown in My Company page. Used by curator as baseline RAG context.
# NOT linked to any specific advertisement.

class CompanyDocument(Base):
    __tablename__ = "company_documents"

    id         = Column(String, primary_key=True, default=_uuid)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    doc_type   = Column(Enum(DocumentType), nullable=False)
    title      = Column(String(512), nullable=False)
    content    = Column(Text, nullable=True)
    file_path  = Column(String(1024), nullable=True)
    priority   = Column(Integer, default=0)
    version    = Column(Integer, default=1)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    company = relationship("Company", back_populates="documents")


# ─── Advertisement Documents ──────────────────────────────────────────────────
# Campaign-specific protocol documents: product descriptions, briefs, KPIs, etc.
# Scoped to a single advertisement. Never shown on My Company page.
# Loaded by the curator alongside CompanyDocuments, but with higher priority
# so campaign-specific context wins over generic company context.
# Stored at uploads/docs/<company_id>/<advertisement_id>/<filename>.

class AdvertisementDocument(Base):
    __tablename__ = "advertisement_documents"

    id               = Column(String, primary_key=True, default=_uuid)
    company_id       = Column(String, ForeignKey("companies.id"), nullable=False)
    advertisement_id = Column(String, ForeignKey("advertisements.id"), nullable=False)
    doc_type         = Column(String(64), nullable=False)   # plain string — campaign types are freeform
    title            = Column(String(512), nullable=False)
    content          = Column(Text, nullable=True)          # extracted text from uploaded file
    file_path        = Column(String(1024), nullable=True)
    priority         = Column(Integer, default=10)          # higher than CompanyDocument default of 0
    created_at       = Column(DateTime, default=_now)

    advertisement = relationship("Advertisement", back_populates="protocol_docs")


# ─── Brand Kit ────────────────────────────────────────────────────────────────

class BrandKit(Base):
    """
    One-to-one with Company.
    Stores visual identity and tone data collected during onboarding.
    Editable later from the company settings page.
    """
    __tablename__ = "brand_kits"

    id              = Column(String, primary_key=True, default=_uuid)
    company_id      = Column(String, ForeignKey("companies.id"), nullable=False, unique=True)
    primary_color   = Column(String(16), nullable=True)
    secondary_color = Column(String(16), nullable=True)
    accent_color    = Column(String(16), nullable=True)
    primary_font    = Column(String(128), nullable=True)
    secondary_font  = Column(String(128), nullable=True)
    adjectives      = Column(Text, nullable=True)
    dos             = Column(Text, nullable=True)
    donts           = Column(Text, nullable=True)
    preset_name     = Column(String(128), nullable=True)
    pdf_path        = Column(String(1024), nullable=True)
    created_at      = Column(DateTime, default=_now)
    updated_at      = Column(DateTime, default=_now, onupdate=_now)

    company = relationship("Company", back_populates="brand_kit")


# ─── Skill Configuration ─────────────────────────────────────────────────────

class SkillConfig(Base):
    __tablename__ = "skill_configs"
    __table_args__ = (UniqueConstraint("company_id", "skill_type", name="uq_skill_configs_company_skill"),)

    id             = Column(String, primary_key=True, default=_uuid)
    company_id     = Column(String, ForeignKey("companies.id"), nullable=False)
    skill_type     = Column(String(64), nullable=False)
    skill_md       = Column(Text, nullable=False)
    version        = Column(Integer, default=1)
    lessons_learnt = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=_now)
    updated_at     = Column(DateTime, default=_now, onupdate=_now)

    company = relationship("Company", back_populates="skills")


# ─── Advertisement (Campaign) ────────────────────────────────────────────────

class Advertisement(Base):
    __tablename__ = "advertisements"

    id                = Column(String, primary_key=True, default=_uuid)
    company_id        = Column(String, ForeignKey("companies.id"), nullable=False)
    title             = Column(String(512), nullable=False)
    ad_type           = Column(JSON, nullable=False)
    campaign_category = Column(String(64), nullable=True)   # inferred by AI from title/context
    duration          = Column(String(128), nullable=True)  # human-readable computed label
    trial_start_date  = Column(Date, nullable=True)
    trial_end_date    = Column(Date, nullable=True)
    status            = Column(Enum(AdStatus), default=AdStatus.DRAFT)
    budget            = Column(Float, nullable=True)
    platforms         = Column(JSON, nullable=True)
    target_audience   = Column(JSON, nullable=True)
    strategy_json     = Column(JSON, nullable=True)
    review_notes      = Column(Text, nullable=True)
    website_reqs      = Column(JSON, nullable=True)
    ad_details        = Column(JSON, nullable=True)
    output_url        = Column(String(1024), nullable=True)
    output_files      = Column(JSON, nullable=True)
    bot_config        = Column(JSON, nullable=True)
    questionnaire     = Column(JSON, nullable=True)         # {questions: [{id, text, type, options, required}]}
    trial_location    = Column(JSON, nullable=True)         # [{ country, city }]
    patients_required = Column(Integer, nullable=True)      # total patients needed for trial
    created_at        = Column(DateTime, default=_now)
    updated_at        = Column(DateTime, default=_now, onupdate=_now)

    company            = relationship("Company", back_populates="advertisements")
    protocol_docs      = relationship("AdvertisementDocument", back_populates="advertisement", cascade="all, delete-orphan")
    reviews            = relationship("Review", back_populates="advertisement", cascade="all, delete-orphan")
    analytics          = relationship("AdAnalytics", back_populates="advertisement", cascade="all, delete-orphan")
    optimizer_logs     = relationship("OptimizerLog", back_populates="advertisement", cascade="all, delete-orphan")
    reinforcement_logs = relationship("ReinforcementLog", back_populates="advertisement")
    voice_sessions     = relationship("VoiceSession", back_populates="advertisement", cascade="all, delete-orphan")


# ─── Review ───────────────────────────────────────────────────────────────────

class Review(Base):
    __tablename__ = "reviews"

    id               = Column(String, primary_key=True, default=_uuid)
    advertisement_id = Column(String, ForeignKey("advertisements.id"), nullable=False)
    reviewer_id      = Column(String, ForeignKey("users.id"), nullable=False)
    review_type      = Column(String(32), nullable=False)
    status           = Column(String(32), default="pending")
    comments         = Column(Text, nullable=True)
    suggestions      = Column(JSON, nullable=True)
    edited_strategy  = Column(JSON, nullable=True)
    created_at       = Column(DateTime, default=_now)

    advertisement = relationship("Advertisement", back_populates="reviews")
    reviewer      = relationship("User", back_populates="reviews")


# ─── Ad Analytics ─────────────────────────────────────────────────────────────

class AdAnalytics(Base):
    __tablename__ = "ad_analytics"

    id               = Column(String, primary_key=True, default=_uuid)
    advertisement_id = Column(String, ForeignKey("advertisements.id"), nullable=False)
    recorded_at      = Column(DateTime, default=_now)
    user_retention   = Column(Float, nullable=True)
    click_rate       = Column(Float, nullable=True)
    follow_through   = Column(Float, nullable=True)
    call_duration    = Column(Float, nullable=True)
    views            = Column(Integer, nullable=True)
    likes            = Column(Integer, nullable=True)
    demographics     = Column(JSON, nullable=True)
    impressions      = Column(Integer, nullable=True)
    conversions      = Column(Integer, nullable=True)
    cost_per_click   = Column(Float, nullable=True)

    advertisement = relationship("Advertisement", back_populates="analytics")


# ─── Optimizer Logs ───────────────────────────────────────────────────────────

class OptimizerLog(Base):
    __tablename__ = "optimizer_logs"

    id               = Column(String, primary_key=True, default=_uuid)
    advertisement_id = Column(String, ForeignKey("advertisements.id"), nullable=False)
    suggestions      = Column(JSON, nullable=False)
    context          = Column(JSON, nullable=True)
    human_decision   = Column(String(32), nullable=True)
    applied_changes  = Column(JSON, nullable=True)
    created_at       = Column(DateTime, default=_now)

    advertisement = relationship("Advertisement", back_populates="optimizer_logs")


# ─── Reinforcement Learning Log ───────────────────────────────────────────────

class ReinforcementLog(Base):
    __tablename__ = "reinforcement_logs"

    id               = Column(String, primary_key=True, default=_uuid)
    company_id       = Column(String, ForeignKey("companies.id"), nullable=False)
    advertisement_id = Column(String, ForeignKey("advertisements.id"), nullable=True)
    source_type      = Column(String(64), nullable=False)
    raw_data         = Column(JSON, nullable=False)
    formalized_doc   = Column(Text, nullable=True)
    applied_to_skill = Column(Boolean, default=False)
    created_at       = Column(DateTime, default=_now)

    company       = relationship("Company", back_populates="reinforcement_logs")
    advertisement = relationship("Advertisement", back_populates="reinforcement_logs")


# ─── Voice Sessions ───────────────────────────────────────────────────────────
# Tracks each browser-initiated ElevenLabs voice call session.
# Sessions are created by the frontend after connecting via the signed WebSocket URL.

class VoiceSession(Base):
    __tablename__ = "voice_sessions"

    id                          = Column(String, primary_key=True, default=_uuid)
    advertisement_id            = Column(String, ForeignKey("advertisements.id"), nullable=False)
    elevenlabs_conversation_id  = Column(String(256), nullable=True, unique=True)
    status                      = Column(String(32), default="active")   # active | ended | failed
    started_at                  = Column(DateTime, default=_now)
    ended_at                    = Column(DateTime, nullable=True)
    duration_seconds            = Column(Integer, nullable=True)
    caller_metadata             = Column(JSON, nullable=True)            # browser, location, etc.

    advertisement = relationship("Advertisement", back_populates="voice_sessions")
    transcripts   = relationship("CallTranscript", back_populates="session", cascade="all, delete-orphan")


# ─── Call Transcripts ─────────────────────────────────────────────────────────
# Stores speaker turns fetched from ElevenLabs after a session ends.

class CallTranscript(Base):
    __tablename__ = "call_transcripts"

    id              = Column(String, primary_key=True, default=_uuid)
    session_id      = Column(String, ForeignKey("voice_sessions.id"), nullable=False)
    speaker         = Column(String(16), nullable=False)   # "agent" | "user"
    text            = Column(Text, nullable=False)
    turn_index      = Column(Integer, nullable=True)
    timestamp_ms    = Column(Integer, nullable=True)       # ms from call start
    created_at      = Column(DateTime, default=_now)

    session = relationship("VoiceSession", back_populates="transcripts")