from pydantic import BaseModel, Field, computed_field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime


class SurveyAnswerItem(BaseModel):
    question_id: str
    question_text: str
    selected_option: str
    is_eligible: Optional[bool] = None


class SurveyResponseCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=256)
    age: int = Field(..., ge=1, le=120)
    sex: str = Field(..., pattern="^(male|female|other|prefer_not_to_say)$")
    phone: str = Field(..., min_length=5, max_length=32)
    answers: List[SurveyAnswerItem] = []
    is_eligible: Optional[bool] = None


class CallTranscriptOut(BaseModel):
    speaker: str
    text: str
    turn_index: Optional[int] = None
    timestamp_ms: Optional[int] = None

    class Config:
        from_attributes = True


class VoiceSessionOut(BaseModel):
    id: str
    elevenlabs_conversation_id: Optional[str] = None
    status: str
    phone: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    transcripts: List[CallTranscriptOut] = []
    call_analysis: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class SurveyResponseOut(BaseModel):
    id: str
    advertisement_id: str
    full_name: str
    age: int
    sex: str
    phone: str
    answers: List[Dict[str, Any]]
    is_eligible: Optional[bool] = None
    created_at: datetime
    voice_sessions: List[VoiceSessionOut] = []

    class Config:
        from_attributes = True


class SlotInfo(BaseModel):
    time: str      # "HH:MM"
    label: str     # "9:00 AM"
    available: bool


class AvailableSlotsResponse(BaseModel):
    date: str
    duration_minutes: int
    slots: List[SlotInfo]


class AppointmentCreate(BaseModel):
    patient_name: str
    patient_phone: str
    slot_datetime: datetime
    survey_response_id: Optional[str] = None
    notes: Optional[str] = None


class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    advertisement_id: str
    survey_response_id: Optional[str] = None
    voice_session_id:   Optional[str] = None
    chat_session_id:    Optional[str] = None
    patient_name: str
    patient_phone: str
    slot_datetime: datetime
    duration_minutes: int
    status: str
    notes: Optional[str] = None
    created_at: datetime

    @computed_field
    @property
    def source(self) -> str:
        if self.voice_session_id:
            return "voicebot"
        if self.survey_response_id:
            return "survey"
        if self.chat_session_id:
            return "chatbot"
        return "chatbot"
