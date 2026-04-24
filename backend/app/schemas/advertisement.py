from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from app.schemas.enums import AdTypeEnum, AdStatusEnum

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
    trial_location: Optional[List[Dict[str, Any]]] = None
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


class BotConfigUpdate(BaseModel):
    bot_name: Optional[str] = None
    voice_id: Optional[str] = None
    first_message: Optional[str] = None
    conversation_style: Optional[str] = None
    compliance_notes: Optional[str] = None
    language: Optional[str] = None
    allowed_origins: Optional[List[str]] = None
    additional_params: Optional[Dict[str, Any]] = None
    pause_schedule: Optional[Any] = None
    meta_campaign_id: Optional[str] = None
