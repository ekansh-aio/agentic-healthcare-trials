from pydantic import BaseModel
from typing import Optional, Dict, Any, Literal
from datetime import datetime


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


class MinorEditRequest(BaseModel):
    field: str        # dot-path e.g. "executive_summary" or "messaging.core_message"
    old_value: str
    new_value: str


class RewriteStrategyRequest(BaseModel):
    instructions: str


class RewriteQuestionRequest(BaseModel):
    question: dict
    instruction: str
