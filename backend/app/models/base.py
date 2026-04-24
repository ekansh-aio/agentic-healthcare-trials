import uuid
import enum
from datetime import datetime, timezone


def _now():
    # Naive UTC datetime — DB columns are DateTime (no timezone).
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _uuid():
    return str(uuid.uuid4())


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
    GENERATING = "generating"
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
