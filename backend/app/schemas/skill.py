from pydantic import BaseModel
from typing import Optional, Dict
from datetime import datetime


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
