from pydantic import BaseModel
from typing import Optional, Dict, Any, Literal
from datetime import datetime


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


class OptimizerSuggestion(BaseModel):
    advertisement_id: str
    status: str = "done"
    suggestions: Optional[Dict[str, Any]] = None
    context: Optional[Dict[str, Any]] = None


class OptimizerDecision(BaseModel):
    decision: Literal["accepted", "rejected", "partial"]
    applied_changes: Optional[Dict[str, Any]] = None
