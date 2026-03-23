"""
M1: Database Models
Owner: Backend Dev 1
Dependencies: database.py

All SQLAlchemy ORM models for the platform.
Each class maps to a table and is independently testable.
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, DateTime, ForeignKey, Enum, Boolean,
    Integer, Float, JSON,
)
from sqlalchemy.orm import relationship
from app.db.database import Base


# ─── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    REVIEWER = "reviewer"
    ETHICS_REVIEWER = "ethics_reviewer"
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
    created_at = Column(DateTime, default=datetime.utcnow)
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
    created_at = Column(DateTime, default=datetime.utcnow)

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
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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
    file_path        = Column(String(1024), nullable=True)
    priority         = Column(Integer, default=10)          # higher than CompanyDocument default of 0
    created_at       = Column(DateTime, default=datetime.utcnow)

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
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="brand_kit")


# ─── Skill Configuration ─────────────────────────────────────────────────────

class SkillConfig(Base):
    __tablename__ = "skill_configs"

    id             = Column(String, primary_key=True, default=_uuid)
    company_id     = Column(String, ForeignKey("companies.id"), nullable=False)
    skill_type     = Column(String(64), nullable=False)
    skill_md       = Column(Text, nullable=False)
    version        = Column(Integer, default=1)
    lessons_learnt = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="skills")


# ─── Advertisement (Campaign) ────────────────────────────────────────────────

class Advertisement(Base):
    __tablename__ = "advertisements"

    id              = Column(String, primary_key=True, default=_uuid)
    company_id      = Column(String, ForeignKey("companies.id"), nullable=False)
    title           = Column(String(512), nullable=False)
    ad_type         = Column(JSON, nullable=False)
    status          = Column(Enum(AdStatus), default=AdStatus.DRAFT)
    budget          = Column(Float, nullable=True)
    platforms       = Column(JSON, nullable=True)
    target_audience = Column(JSON, nullable=True)
    strategy_json   = Column(JSON, nullable=True)
    review_notes    = Column(Text, nullable=True)
    website_reqs    = Column(JSON, nullable=True)
    ad_details      = Column(JSON, nullable=True)
    output_url      = Column(String(1024), nullable=True)
    output_files    = Column(JSON, nullable=True)
    bot_config      = Column(JSON, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company            = relationship("Company", back_populates="advertisements")
    protocol_docs      = relationship("AdvertisementDocument", back_populates="advertisement", cascade="all, delete-orphan")
    reviews            = relationship("Review", back_populates="advertisement", cascade="all, delete-orphan")
    analytics          = relationship("AdAnalytics", back_populates="advertisement", cascade="all, delete-orphan")
    optimizer_logs     = relationship("OptimizerLog", back_populates="advertisement", cascade="all, delete-orphan")
    reinforcement_logs = relationship("ReinforcementLog", back_populates="advertisement")


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
    created_at       = Column(DateTime, default=datetime.utcnow)

    advertisement = relationship("Advertisement", back_populates="reviews")
    reviewer      = relationship("User", back_populates="reviews")


# ─── Ad Analytics ─────────────────────────────────────────────────────────────

class AdAnalytics(Base):
    __tablename__ = "ad_analytics"

    id               = Column(String, primary_key=True, default=_uuid)
    advertisement_id = Column(String, ForeignKey("advertisements.id"), nullable=False)
    recorded_at      = Column(DateTime, default=datetime.utcnow)
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
    created_at       = Column(DateTime, default=datetime.utcnow)

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
    created_at       = Column(DateTime, default=datetime.utcnow)

    company       = relationship("Company", back_populates="reinforcement_logs")
    advertisement = relationship("Advertisement", back_populates="reinforcement_logs")