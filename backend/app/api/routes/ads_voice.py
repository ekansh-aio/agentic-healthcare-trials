"""
Voice agent routes: provision, status, outbound calls, transcripts, conversations,
and bulk calling campaigns.
"""

import csv
import io
import logging
import re
from datetime import datetime, date, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, field_validator
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import require_roles
from app.db.database import get_db
from app.models.models import Advertisement, User, UserRole
from app.models.survey import Appointment
from app.models.voice import CallCampaign, CallRecord, VoiceSession
from app.services.ai.voicebot_agent import VoicebotAgentService
from app.services.voice.campaign_worker import start_worker
from app.api.routes.bookings import _booking_config, _campaign_window, _generate_slots

router = APIRouter(prefix="/advertisements", tags=["Voice Agent"])
logger = logging.getLogger(__name__)


# ── Voicebot booking webhook ──────────────────────────────────────────────────

class VoiceCheckSlotsRequest(BaseModel):
    date: str   # YYYY-MM-DD or natural language


class VoiceBookRequest(BaseModel):
    candidate_name:          str
    date:                    str   # YYYY-MM-DD  (must be exact — agent already ran check_available_slots)
    time:                    str   # HH:MM or H:MM AM/PM — agent may include AM/PM
    candidate_phone:         Optional[str] = None
    candidate_email:         Optional[str] = None
    elevenlabs_conversation_id: Optional[str] = None   # passed by ElevenLabs as system.conversation_id
    notes:                   Optional[str] = None


def _parse_date(raw: str) -> Optional[date]:
    """Parse ISO date or common natural-language phrases to a date object."""
    s = raw.strip()
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        pass

    today = date.today()
    s_lower = s.lower()
    if s_lower == "today":
        return today
    if s_lower == "tomorrow":
        return today + timedelta(days=1)

    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for i, day_name in enumerate(weekdays):
        if day_name in s_lower:
            days_ahead = (i - today.weekday()) % 7 or 7
            return today + timedelta(days=days_ahead)

    return None


async def _available_slots_for_date(
    ad: Advertisement,
    req_date: date,
    ad_id: str,
    db: AsyncSession,
) -> list[dict]:
    """Return list of available slot dicts for req_date. Empty if date is out-of-window."""
    win_start, win_end = _campaign_window(ad)
    if req_date < win_start or req_date > win_end:
        return []

    bc       = _booking_config(ad)
    duration = bc["slot_duration_minutes"]
    capacity = bc["max_per_slot"]
    all_slots = _generate_slots(duration)

    day_start = datetime(req_date.year, req_date.month, req_date.day)
    day_end   = day_start + timedelta(days=1)

    count_rows = await db.execute(
        select(Appointment.slot_datetime, func.count(Appointment.id).label("cnt"))
        .where(
            Appointment.advertisement_id == ad_id,
            Appointment.status == "confirmed",
            Appointment.slot_datetime >= day_start,
            Appointment.slot_datetime < day_end,
        )
        .group_by(Appointment.slot_datetime)
    )
    booked: dict = {row.slot_datetime.strftime("%H:%M"): row.cnt for row in count_rows.all()}

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    available = []
    for s in all_slots:
        slot_dt = datetime(req_date.year, req_date.month, req_date.day,
                           *map(int, s["time"].split(":")))
        if slot_dt > now_utc and booked.get(s["time"], 0) < capacity:
            available.append(s)
    return available


@router.post("/{ad_id}/voice-agent/check-slots")
async def voice_check_slots(
    ad_id: str,
    body: VoiceCheckSlotsRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Webhook called by ElevenLabs to check available slots for a given date.
    Returns a spoken-friendly list of times the agent can read to the caller.
    """
    ad = await db.get(Advertisement, ad_id)
    if not ad:
        return {"message": "Sorry, I couldn't find the campaign details. Please call us back."}

    req_date = _parse_date(body.date)
    if req_date is None:
        return {"message": "I didn't catch that date. Could you say it as day, month, and year?"}

    win_start, win_end = _campaign_window(ad)

    if req_date < win_start:
        friendly_start = win_start.strftime("%d %B %Y").lstrip("0")
        return {"message": f"Our bookings open from {friendly_start}. Would that date work for you, or would you prefer a different one?"}

    if req_date > win_end:
        friendly_end = win_end.strftime("%d %B %Y").lstrip("0")
        return {"message": f"Unfortunately our booking window closes on {friendly_end}. Could you choose an earlier date?"}

    available = await _available_slots_for_date(ad, req_date, ad_id, db)

    if not available:
        # No slots on this date — suggest the next date with availability
        next_date = req_date + timedelta(days=1)
        while next_date <= win_end:
            slots = await _available_slots_for_date(ad, next_date, ad_id, db)
            if slots:
                friendly_next = next_date.strftime("%A %d %B").lstrip("0")
                labels = ", ".join(s["label"] for s in slots[:4])
                suffix = " and more" if len(slots) > 4 else ""
                return {
                    "message": (
                        f"There are no available slots on that date. "
                        f"The next available day is {friendly_next} with times like {labels}{suffix}. "
                        f"Would any of those work for you?"
                    ),
                    "available_slots": [s["time"] for s in slots],
                    "suggested_date": next_date.isoformat(),
                }
            next_date += timedelta(days=1)
        return {"message": "I'm sorry, there are no more available slots in our booking window. The team will be in touch to arrange an alternative."}

    friendly_date = req_date.strftime("%A %d %B").lstrip("0")
    labels = ", ".join(s["label"] for s in available[:5])
    suffix = f", and {len(available) - 5} more" if len(available) > 5 else ""
    return {
        "message": (
            f"On {friendly_date} we have the following times available: {labels}{suffix}. "
            f"Which of those would suit you best?"
        ),
        "available_slots": [s["time"] for s in available],
        "date": req_date.isoformat(),
    }


@router.post("/{ad_id}/voice-agent/book-slot")
async def voice_book_slot(
    ad_id: str,
    body: VoiceBookRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Webhook called by ElevenLabs after the caller has confirmed a specific slot.
    The agent must have already called check_available_slots and presented real
    options — this endpoint books the exact date + time the caller chose.
    """
    ad = await db.get(Advertisement, ad_id)
    if not ad:
        return {"message": "Sorry, I couldn't find the campaign details. Please call us back to book manually."}

    req_date = _parse_date(body.date)
    if req_date is None:
        return {"message": "I didn't catch the date. Could you confirm the date you'd like?"}

    # Parse HH:MM or H:MM AM/PM from the LLM — agents often include AM/PM
    time_match = re.match(r"^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$", body.time.strip(), re.IGNORECASE)
    if not time_match:
        return {"message": "I didn't catch the time. Could you confirm the exact time you'd like?"}
    hour, minute, period = int(time_match.group(1)), int(time_match.group(2)), (time_match.group(3) or "").lower()
    if period == "pm" and hour < 12:
        hour += 12
    elif period == "am" and hour == 12:
        hour = 0
    slot_dt = datetime(req_date.year, req_date.month, req_date.day, hour, minute)

    win_start, win_end = _campaign_window(ad)
    if req_date < win_start or req_date > win_end:
        return {"message": f"That date is outside our booking window. Please choose a date between {win_start} and {win_end}."}

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    if slot_dt <= now_utc:
        return {"message": "That time has already passed. Let me check what's still available — what date were you thinking?"}

    bc       = _booking_config(ad)
    duration = bc["slot_duration_minutes"]
    capacity = bc["max_per_slot"]

    # Confirm slot is still available (another caller may have taken it)
    count_result = await db.execute(
        select(func.count(Appointment.id))
        .where(
            Appointment.advertisement_id == ad_id,
            Appointment.status == "confirmed",
            Appointment.slot_datetime == slot_dt,
        )
    )
    if count_result.scalar_one() >= capacity:
        # Slot just filled — offer alternatives on the same date
        available = await _available_slots_for_date(ad, req_date, ad_id, db)
        if available:
            labels = ", ".join(s["label"] for s in available[:3])
            return {
                "message": (
                    f"Oh no, that slot just got taken! But we still have {labels} available on the same day. "
                    f"Would any of those work for you?"
                ),
                "available_slots": [s["time"] for s in available],
            }
        return {"message": "That slot just got taken and there are no more slots on that day. Could we try a different date?"}

    # Resolve voice_session_id from elevenlabs_conversation_id so source="voicebot" is correct
    voice_session_id: Optional[str] = None
    if body.elevenlabs_conversation_id:
        vs_row = await db.execute(
            select(VoiceSession.id).where(
                VoiceSession.elevenlabs_conversation_id == body.elevenlabs_conversation_id
            )
        )
        vs = vs_row.scalar_one_or_none()
        if vs:
            voice_session_id = vs

    patient_phone = body.candidate_phone or "unknown"
    appt = Appointment(
        advertisement_id=ad_id,
        patient_name=body.candidate_name,
        patient_phone=patient_phone,
        slot_datetime=slot_dt,
        duration_minutes=duration,
        status="confirmed",
        voice_session_id=voice_session_id,
        notes=body.notes,
    )
    db.add(appt)
    await db.commit()
    await db.refresh(appt)

    friendly_dt = slot_dt.strftime("%A %d %B at %I:%M %p").lstrip("0").replace(" 0", " ")
    logger.info("Voice booking created: ad=%s appointment=%s slot=%s patient=%s voice_session=%s",
                ad_id, appt.id, slot_dt, body.candidate_name, voice_session_id)
    return {
        "message": (
            f"You're all booked in! Your screening appointment is confirmed for {friendly_dt}. "
            f"The team will be in touch to confirm everything. Is there anything else I can help you with?"
        ),
        "appointment_id":   appt.id,
        "slot_datetime":    slot_dt.isoformat(),
        "duration_minutes": duration,
    }


class VoiceCallRequest(BaseModel):
    phone_number: str
    action: str = "call_now"

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("phone_number is required")
        if not v.startswith("+"):
            raise ValueError("phone_number must include country code (e.g. +1...)")
        digits = v[1:].replace(" ", "").replace("-", "")
        if not digits.isdigit() or len(digits) < 7:
            raise ValueError("phone_number is not a valid phone number")
        return v


@router.post("/{ad_id}/voice-agent")
async def provision_voice_agent(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Provision (create or update) the ElevenLabs conversational AI agent for this campaign.
    Must be called after bot_config is set. Stores the agent_id back in bot_config.
    """
    svc = VoicebotAgentService(db)
    try:
        agent = await svc.provision_agent(ad_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {e}")
    return {"status": "provisioned", "agent_id": agent.get("agent_id"), "agent": agent}


@router.get("/{ad_id}/voice-recommendation")
async def get_voice_recommendation(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """
    Use Claude to analyze the campaign's target audience and recommend
    the best ElevenLabs voice profile + conversation style + opening message.
    """
    svc = VoicebotAgentService(db)
    try:
        recommendation = await svc.recommend_voice(ad_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendation error: {e}")
    return recommendation


@router.get("/{ad_id}/voice-agent/status")
async def get_voice_agent_status(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """Return ElevenLabs agent info for this campaign (name, voice, provisioned status)."""
    svc = VoicebotAgentService(db)
    try:
        status = await svc.get_agent_status(ad_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return status


@router.post("/{ad_id}/voice-call/request")
async def request_voice_call(
    ad_id: str,
    body: VoiceCallRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger an outbound phone call to the user's cell via ElevenLabs.
    No auth required — embedded in published landing pages.
    """
    svc = VoicebotAgentService(db)
    try:
        result = await svc.outbound_call(ad_id, body.phone_number)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {e}")
    return {"status": "calling", "to": body.phone_number, "detail": result}


@router.post("/{ad_id}/sync-voice-transcripts")
async def sync_voice_transcripts(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PROJECT_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Manually pull all completed call transcripts from ElevenLabs for this campaign
    and store them in the database, linked to participants by phone number.
    """
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Advertisement not found")

    svc = VoicebotAgentService(db)
    try:
        summary = await svc.sync_all_transcripts(ad_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs sync failed: {e}")
    return summary


@router.get("/{ad_id}/voice-session/token")
async def get_voice_session_token(
    ad_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Return a short-lived signed WebSocket URL for the ElevenLabs browser SDK.
    No auth required — embedded in published landing pages.
    """
    svc = VoicebotAgentService(db)
    try:
        signed_url = await svc.get_signed_url(ad_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {e}")
    return {"signed_url": signed_url}


@router.get("/voice-profiles/australian")
async def list_australian_voices(
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
) -> Dict[str, Any]:
    """
    Return all voices available in the ElevenLabs account (pre-made + cloned + generated).
    Used by the publisher panel voice picker.

    Each entry includes:
      voice_id, name, gender, age, description, use_case, preview_url, labels
    """
    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY or ""}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.elevenlabs.io/v1/voices",
                headers=headers,
                params={"show_legacy": "false"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {exc.response.text}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch voices: {exc}")

    # Only expose these curated Australian/Australian-accent voices in the picker.
    ALLOWED_VOICE_NAMES = {
        "Arabella",
        "Ivy- Asian Accent",
        "Sam from Down Under!",
        "Kailey - Sales with Sass",
        "Australian Social Media",
        "Jason - Narration & Podcast",
        "Krystal",
        "Conversational and Real",
        "Ben",
        "Paul - Australian Professional Presenter",
        "Hitch",
        "Matilda",
    }

    all_voices: List[Dict[str, Any]] = data.get("voices", [])

    voices = [
        {
            "voice_id":    v.get("voice_id", "") or "",
            "name":        v.get("name", "") or "",
            "preview_url": v.get("preview_url", "") or "",
            "gender":      (v.get("labels") or {}).get("gender", "") or "",
            "age":         (v.get("labels") or {}).get("age", "") or "",
            "description": (v.get("labels") or {}).get("description", "") or v.get("description", "") or "",
            "use_case":    (v.get("labels") or {}).get("use_case", "") or "",
            "accent":      (v.get("labels") or {}).get("accent", "") or "",
            "labels":      v.get("labels") or {},
        }
        for v in all_voices
        if (v.get("name", "") or "") in ALLOWED_VOICE_NAMES
    ]

    # Sort: females first, then alphabetically by name
    voices.sort(key=lambda v: (0 if v["gender"].lower() == "female" else 1, v["name"].lower()))

    return {"voices": voices, "total": len(voices)}


@router.get("/{ad_id}/voice-conversations")
async def list_voice_conversations(
    ad_id: str,
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """List past voice call sessions for this campaign, fetched from ElevenLabs."""
    svc = VoicebotAgentService(db)
    try:
        result = await svc.list_conversations(ad_id, page_size=page_size)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result


@router.get("/voice-conversations/{conversation_id}/transcript")
async def get_voice_transcript(
    conversation_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """Fetch the full transcript and metadata for a single voice conversation."""
    svc = VoicebotAgentService(db)
    try:
        transcript = await svc.get_conversation_transcript(conversation_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {e}")
    return transcript


@router.post("/voice-conversations/{conversation_id}/analyze")
async def analyze_voice_conversation(
    conversation_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """Fetch transcript from ElevenLabs and run Claude AI analysis on the conversation."""
    svc = VoicebotAgentService(db)
    try:
        analysis = await svc.get_conversation_analysis(conversation_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Analysis failed: {e}")
    return analysis


@router.get("/voice-conversations/{conversation_id}/audio")
async def get_voice_recording(
    conversation_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """Stream the audio recording for a voice conversation from ElevenLabs."""
    svc = VoicebotAgentService(db)
    try:
        audio_bytes = await svc.get_conversation_audio(conversation_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {e}")
    return Response(content=audio_bytes, media_type="audio/mpeg")


@router.delete("/{ad_id}/voice-agent")
async def delete_voice_agent(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """Delete the ElevenLabs agent for this campaign."""
    svc = VoicebotAgentService(db)
    try:
        await svc.delete_agent(ad_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "deleted"}


# ── Bulk Calling Campaigns ────────────────────────────────────────────────────

_E164_RE = re.compile(r"^\+\d{7,15}$")


def _clean_phone(raw: str) -> Optional[str]:
    """Strip common formatting and validate E.164. Returns None if invalid."""
    s = raw.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if not s.startswith("+"):
        s = "+" + s
    return s if _E164_RE.match(s) else None


def _campaign_dict(c: CallCampaign) -> Dict[str, Any]:
    return {
        "id":            c.id,
        "name":          c.name,
        "status":        c.status,
        "total":         c.total,
        "completed":     c.completed,
        "failed_count":  c.failed_count,
        "concurrency":   c.concurrency,
        "per_minute":    c.per_minute,
        "created_at":    c.created_at.isoformat() if c.created_at else None,
        "started_at":    c.started_at.isoformat()  if c.started_at  else None,
        "finished_at":   c.finished_at.isoformat() if c.finished_at else None,
    }


def _parse_upload_rows(content: bytes, filename: str) -> tuple[list[tuple[str, Optional[str]]], int]:
    """
    Parse a CSV, XLSX, or XLS file and return (records, skipped_count).
    Raises HTTPException on format errors.
    """
    fname = (filename or "").lower()

    if fname.endswith(".xlsx"):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            ws = wb.active
            rows_iter = ws.iter_rows(values_only=True)
            header = [str(c).lower().strip() if c is not None else "" for c in next(rows_iter, [])]
        except Exception:
            raise HTTPException(status_code=400, detail="Could not parse XLSX file")
    elif fname.endswith(".xls"):
        try:
            import xlrd
            wb = xlrd.open_workbook(file_contents=content)
            ws = wb.sheet_by_index(0)
            header = [str(ws.cell_value(0, c)).lower().strip() for c in range(ws.ncols)]
            rows_iter = (
                tuple(ws.cell_value(r, c) for c in range(ws.ncols))
                for r in range(1, ws.nrows)
            )
        except Exception:
            raise HTTPException(status_code=400, detail="Could not parse XLS file")
    else:
        # CSV (default)
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="File must be UTF-8 encoded CSV")
        reader = csv.DictReader(io.StringIO(text))
        header = [f.lower().strip() for f in (reader.fieldnames or [])]
        if "phone" not in header:
            raise HTTPException(status_code=400, detail="File must contain a 'phone' column")
        fieldnames_raw = reader.fieldnames or []
        phone_col = next(f for f in fieldnames_raw if f.lower().strip() == "phone")
        name_col  = next((f for f in fieldnames_raw if f.lower().strip() == "name"), None)
        records_data: list[tuple[str, Optional[str]]] = []
        skipped = 0
        for row in reader:
            if len(records_data) >= 5000:
                raise HTTPException(status_code=400, detail="File exceeds 5 000 row limit")
            phone = _clean_phone(row.get(phone_col, ""))
            if not phone:
                skipped += 1
                continue
            contact = row.get(name_col, "").strip() if name_col else None
            records_data.append((phone, contact or None))
        return records_data, skipped

    # Shared path for XLSX / XLS
    if "phone" not in header:
        raise HTTPException(status_code=400, detail="File must contain a 'phone' column")
    phone_idx = header.index("phone")
    name_idx  = header.index("name") if "name" in header else None

    records_data = []
    skipped = 0
    for row in rows_iter:
        if len(records_data) >= 5000:
            raise HTTPException(status_code=400, detail="File exceeds 5 000 row limit")
        raw_phone = str(row[phone_idx]) if phone_idx < len(row) and row[phone_idx] is not None else ""
        # Excel sometimes stores numbers as floats (e.g. 61412345678.0) — strip the .0
        if raw_phone.endswith(".0"):
            raw_phone = raw_phone[:-2]
        phone = _clean_phone(raw_phone)
        if not phone:
            skipped += 1
            continue
        contact = str(row[name_idx]).strip() if name_idx is not None and name_idx < len(row) and row[name_idx] else None
        records_data.append((phone, contact or None))
    return records_data, skipped


@router.post("/{ad_id}/voice-campaigns")
async def create_voice_campaign(
    ad_id: str,
    name: str = Form(...),
    concurrency: int = Form(2),
    per_minute: int = Form(20),
    file: UploadFile = File(...),
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a CSV, XLSX, or XLS file of phone numbers and create a bulk calling campaign.
    File must have a 'phone' column (E.164 format). Optional 'name' column.
    Campaign starts in 'queued' status — call /start to begin dialling.
    """
    # Verify ad belongs to user's company
    ad_row = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    if not ad_row.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Advertisement not found")

    # Validate settings
    if not (1 <= concurrency <= 10):
        raise HTTPException(status_code=400, detail="concurrency must be 1–10")
    if not (1 <= per_minute <= 60):
        raise HTTPException(status_code=400, detail="per_minute must be 1–60")

    fname = file.filename or ""
    if not any(fname.lower().endswith(ext) for ext in (".csv", ".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="File must be a .csv, .xlsx, or .xls file")

    content = await file.read()
    records_data, skipped = _parse_upload_rows(content, fname)

    if not records_data:
        raise HTTPException(status_code=400, detail="No valid E.164 phone numbers found in file")

    campaign = CallCampaign(
        advertisement_id=ad_id,
        name=name.strip(),
        status="queued",
        total=len(records_data),
        concurrency=concurrency,
        per_minute=per_minute,
    )
    db.add(campaign)
    await db.flush()  # populate campaign.id

    for phone, contact_name in records_data:
        db.add(CallRecord(
            campaign_id=campaign.id,
            advertisement_id=ad_id,
            phone_e164=phone,
            contact_name=contact_name,
        ))
    await db.commit()
    await db.refresh(campaign)

    return {
        "campaign": _campaign_dict(campaign),
        "skipped": skipped,
        "message": f"Campaign created with {len(records_data)} numbers ({skipped} skipped).",
    }


@router.post("/{ad_id}/voice-campaigns/{campaign_id}/start")
async def start_voice_campaign(
    ad_id: str,
    campaign_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """Start or resume a queued/paused campaign."""
    campaign = await _get_campaign(db, ad_id, campaign_id, user)
    if campaign.status not in ("queued", "paused"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot start a campaign with status '{campaign.status}'",
        )
    campaign.status = "running"
    campaign.started_at = campaign.started_at or datetime.utcnow()
    await db.commit()
    start_worker(campaign_id)
    return {"status": "running", "campaign_id": campaign_id}


@router.post("/{ad_id}/voice-campaigns/{campaign_id}/pause")
async def pause_voice_campaign(
    ad_id: str,
    campaign_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """Pause a running campaign. In-flight dials complete; no new dials start."""
    campaign = await _get_campaign(db, ad_id, campaign_id, user)
    if campaign.status != "running":
        raise HTTPException(status_code=400, detail="Campaign is not running")
    campaign.status = "paused"
    await db.commit()
    return {"status": "paused", "campaign_id": campaign_id}


@router.post("/{ad_id}/voice-campaigns/{campaign_id}/cancel")
async def cancel_voice_campaign(
    ad_id: str,
    campaign_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a campaign. Pending records are left as-is (not dialled)."""
    campaign = await _get_campaign(db, ad_id, campaign_id, user)
    if campaign.status in ("done", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Campaign already {campaign.status}")
    campaign.status = "cancelled"
    campaign.finished_at = datetime.utcnow()
    await db.commit()
    return {"status": "cancelled", "campaign_id": campaign_id}


@router.get("/{ad_id}/voice-campaigns")
async def list_voice_campaigns(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """List all bulk calling campaigns for this advertisement."""
    result = await db.execute(
        select(CallCampaign)
        .where(CallCampaign.advertisement_id == ad_id)
        .order_by(CallCampaign.created_at.desc())
    )
    campaigns = result.scalars().all()
    return {"campaigns": [_campaign_dict(c) for c in campaigns]}


@router.get("/{ad_id}/voice-campaigns/{campaign_id}")
async def get_voice_campaign(
    ad_id: str,
    campaign_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """Get status and counters for a single campaign."""
    campaign = await _get_campaign(db, ad_id, campaign_id, user)
    return {"campaign": _campaign_dict(campaign)}


@router.get("/{ad_id}/voice-campaigns/{campaign_id}/records")
async def get_campaign_records(
    ad_id: str,
    campaign_id: str,
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """Paginated list of call records within a campaign, optionally filtered by status."""
    await _get_campaign(db, ad_id, campaign_id, user)  # ownership check

    q = select(CallRecord).where(CallRecord.campaign_id == campaign_id)
    if status:
        q = q.where(CallRecord.status == status)
    q = q.order_by(CallRecord.created_at).offset(offset).limit(limit)
    result = await db.execute(q)
    records = result.scalars().all()

    return {
        "records": [
            {
                "id":              r.id,
                "phone_e164":      r.phone_e164,
                "contact_name":    r.contact_name,
                "status":          r.status,
                "attempts":        r.attempts,
                "conversation_id": r.conversation_id,
                "last_error":      r.last_error,
                "called_at":       r.called_at.isoformat() if r.called_at else None,
            }
            for r in records
        ]
    }


async def _get_campaign(
    db: AsyncSession,
    ad_id: str,
    campaign_id: str,
    user: User,
) -> CallCampaign:
    """Fetch a campaign and verify it belongs to ad_id (which belongs to user's company)."""
    result = await db.execute(
        select(CallCampaign)
        .join(Advertisement, Advertisement.id == CallCampaign.advertisement_id)
        .where(
            CallCampaign.id == campaign_id,
            CallCampaign.advertisement_id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign
