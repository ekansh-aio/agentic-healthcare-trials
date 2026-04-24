from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.models.base import _uuid, _now


class VoiceSession(Base):
    """Tracks each browser-initiated ElevenLabs voice call session."""
    __tablename__ = "voice_sessions"

    id                         = Column(String, primary_key=True, default=_uuid)
    advertisement_id           = Column(String, ForeignKey("advertisements.id"), nullable=False)
    elevenlabs_conversation_id = Column(String(256), nullable=True, unique=True)
    status                     = Column(String(32), default="active")   # active | ended | failed
    started_at                 = Column(DateTime, default=_now)
    ended_at                   = Column(DateTime, nullable=True)
    duration_seconds           = Column(Integer, nullable=True)
    caller_metadata            = Column(JSON, nullable=True)
    phone                      = Column(String(32), nullable=True)
    survey_response_id         = Column(String, ForeignKey("survey_responses.id"), nullable=True)

    advertisement   = relationship("Advertisement", back_populates="voice_sessions")
    transcripts     = relationship("CallTranscript", back_populates="session", cascade="all, delete-orphan")
    survey_response = relationship("SurveyResponse", back_populates="voice_sessions", foreign_keys=[survey_response_id])
    booking         = relationship("Appointment", back_populates="voice_session", uselist=False)


class CallTranscript(Base):
    """Speaker turns fetched from ElevenLabs after a session ends."""
    __tablename__ = "call_transcripts"

    id           = Column(String, primary_key=True, default=_uuid)
    session_id   = Column(String, ForeignKey("voice_sessions.id"), nullable=False)
    speaker      = Column(String(16), nullable=False)   # "agent" | "user"
    text         = Column(Text, nullable=False)
    turn_index   = Column(Integer, nullable=True)
    timestamp_ms = Column(Integer, nullable=True)
    created_at   = Column(DateTime, default=_now)

    session = relationship("VoiceSession", back_populates="transcripts")


class ChatSession(Base):
    """Per-visitor conversation history scoped to a single campaign."""
    __tablename__ = "chat_sessions"
    __table_args__ = (
        UniqueConstraint("campaign_id", "session_id", name="uq_chat_session"),
    )

    id          = Column(String, primary_key=True, default=_uuid)
    campaign_id = Column(String, ForeignKey("advertisements.id"), nullable=False)
    session_id  = Column(String, nullable=False)
    messages    = Column(JSON, default=list)
    created_at  = Column(DateTime, default=_now)
    updated_at  = Column(DateTime, default=_now, onupdate=_now)

    advertisement = relationship("Advertisement", back_populates="chat_sessions")
