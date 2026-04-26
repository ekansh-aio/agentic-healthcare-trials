"""
Re-exports every schema so existing imports like
    from app.schemas.schemas import AdvertisementOut, LoginRequest
continue to work without changes.
"""

from app.schemas.enums import (  # noqa: F401
    UserRoleEnum, AdTypeEnum, AdStatusEnum, DocumentTypeEnum,
)
from app.schemas.auth import (  # noqa: F401
    LoginRequest, TokenResponse, ConfirmPasswordChangeRequest,
)
from app.schemas.onboarding import (  # noqa: F401
    OnboardingRequest, OnboardingResponse, LogoUploadResponse,
)
from app.schemas.user import UserUpdateSelf, UserCreate, UserOut  # noqa: F401
from app.schemas.document import (  # noqa: F401
    DocumentCreate, DocumentOut, DocumentUpdate,
    AdvertisementDocumentOut,
    StartUploadRequest, ChunkUploadRequest, FinalizeUploadRequest,
    PresignRequest, PresignResponse, ConfirmUploadRequest,
)
from app.schemas.brand_kit import BrandKitCreate, BrandKitOut, BrandKitUpdate  # noqa: F401
from app.schemas.advertisement import (  # noqa: F401
    QUESTIONNAIRE_CAMPAIGN_CATEGORIES,
    AdvertisementCreate, AdvertisementOut, AdvertisementUpdate,
    QuestionnaireUpdate, BotConfigUpdate, BookingConfig,
)
from app.schemas.review import (  # noqa: F401
    ReviewCreate, ReviewOut,
    MinorEditRequest, RewriteStrategyRequest, RewriteQuestionRequest,
)
from app.schemas.analytics import (  # noqa: F401
    AnalyticsOut, OptimizerSuggestion, OptimizerDecision,
)
from app.schemas.skill import TrainingRequest, TrainingStatus, SkillOut  # noqa: F401
from app.schemas.survey import (  # noqa: F401
    SurveyAnswerItem, SurveyResponseCreate,
    CallTranscriptOut, VoiceSessionOut, SurveyResponseOut,
    SlotInfo, AvailableSlotsResponse,
    AppointmentCreate, AppointmentOut,
)
