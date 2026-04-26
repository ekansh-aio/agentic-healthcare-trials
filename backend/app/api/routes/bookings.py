"""
Appointment Booking Routes

GET  /api/advertisements/{ad_id}/appointments/slots?date=YYYY-MM-DD
  — Returns available time slots for a date (public, no auth).

  Slot availability rules (all three must pass):
    1. Date must be within the campaign's trial_start_date … trial_end_date window.
       If dates are not set, defaults to today … today+30 days.
    2. Slot time must be between 09:00 and 17:00 and not in the past.
    3. Number of confirmed bookings for that slot must be < max_per_slot.
       max_per_slot comes from booking_config.max_per_slot (default 3).

POST /api/advertisements/{ad_id}/appointments
  — Books a slot (public, no auth). Returns 409 if slot is at capacity.

GET  /api/advertisements/{ad_id}/appointments
  — Lists all appointments for a campaign (study coordinator / PM auth required).

PATCH /api/advertisements/{ad_id}/appointments/{appointment_id}
  — Cancel or update an appointment (study coordinator auth required).

GET  /api/advertisements/{ad_id}/booking-config
  — Return current booking_config merged with campaign dates (study coordinator).

PATCH /api/advertisements/{ad_id}/booking-config
  — Update slot_duration_minutes and/or max_per_slot (study coordinator).
"""

import logging
from datetime import datetime, date, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.database import get_db
from app.models.models import Advertisement, Appointment, User, UserRole
from app.schemas.schemas import AppointmentCreate, AppointmentOut, AvailableSlotsResponse, SlotInfo
from app.core.security import get_current_user, require_roles

logger = logging.getLogger(__name__)

router = APIRouter(tags=["appointments"])

# ── Defaults ──────────────────────────────────────────────────────────────────
DEFAULT_SLOT_DURATION = 30   # minutes
DEFAULT_MAX_PER_SLOT  = 3    # confirmed bookings before a slot becomes full
DAY_START_HOUR        = 9    # 09:00
DAY_END_HOUR          = 17   # 17:00 (last slot must finish by this time)
DEFAULT_BOOKING_DAYS  = 30   # days ahead when no end date is set


# ── Helpers ───────────────────────────────────────────────────────────────────

def _booking_config(ad: Advertisement) -> dict:
    """Return resolved booking config with defaults filled in."""
    bc = ad.booking_config if isinstance(ad.booking_config, dict) else {}
    return {
        "slot_duration_minutes": int(bc.get("slot_duration_minutes") or DEFAULT_SLOT_DURATION),
        "max_per_slot":          int(bc.get("max_per_slot")          or DEFAULT_MAX_PER_SLOT),
    }


def _campaign_window(ad: Advertisement) -> tuple[date, date]:
    """
    Return (window_start, window_end) as date objects.
    Falls back to today … today+30 when either date is missing.
    """
    today = date.today()
    start = ad.trial_start_date if ad.trial_start_date else today
    end   = ad.trial_end_date   if ad.trial_end_date   else today + timedelta(days=DEFAULT_BOOKING_DAYS)
    # Clamp start so we never show past-only windows
    if start < today:
        start = today
    return start, end


def _generate_slots(duration: int) -> List[dict]:
    """Generate {time: 'HH:MM', label: 'H:MM AM/PM'} from 09:00 to 17:00."""
    slots = []
    t = DAY_START_HOUR * 60
    end = DAY_END_HOUR * 60
    while t + duration <= end:
        h, m = divmod(t, 60)
        period   = "AM" if h < 12 else "PM"
        display_h = h if 1 <= h <= 12 else (12 if h == 0 else h - 12)
        slots.append({
            "time":  f"{h:02d}:{m:02d}",
            "label": f"{display_h}:{m:02d} {period}",
        })
        t += duration
    return slots


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/advertisements/{ad_id}/appointments/slots", response_model=AvailableSlotsResponse)
async def get_slots(
    ad_id: str,
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
):
    ad = await db.get(Advertisement, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Campaign not found")

    try:
        req_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    # Rule 1 — date must be within the campaign booking window
    win_start, win_end = _campaign_window(ad)
    if req_date < win_start or req_date > win_end:
        # Return an empty slot list rather than a 400 — the frontend can
        # show "no availability" without crashing.
        bc = _booking_config(ad)
        return AvailableSlotsResponse(date=date, duration_minutes=bc["slot_duration_minutes"], slots=[])

    bc       = _booking_config(ad)
    duration = bc["slot_duration_minutes"]
    capacity = bc["max_per_slot"]
    all_slots = _generate_slots(duration)

    # Fetch confirmed booking counts per slot time for the requested date
    day_start = datetime(req_date.year, req_date.month, req_date.day, 0, 0, 0)
    day_end   = day_start + timedelta(days=1)

    count_result = await db.execute(
        select(Appointment.slot_datetime, func.count(Appointment.id).label("cnt"))
        .where(
            Appointment.advertisement_id == ad_id,
            Appointment.status == "confirmed",
            Appointment.slot_datetime >= day_start,
            Appointment.slot_datetime < day_end,
        )
        .group_by(Appointment.slot_datetime)
    )
    booking_counts: dict[str, int] = {
        row.slot_datetime.strftime("%H:%M"): row.cnt
        for row in count_result.all()
    }

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    slot_list = []
    for s in all_slots:
        slot_dt = datetime(req_date.year, req_date.month, req_date.day,
                           *map(int, s["time"].split(":")))
        # Rule 2 — slot must not be in the past
        past = slot_dt <= now_utc
        # Rule 3 — slot must not be at capacity
        booked = booking_counts.get(s["time"], 0)
        full   = booked >= capacity

        slot_list.append(SlotInfo(
            time=s["time"],
            label=s["label"],
            available=not past and not full,
        ))

    return AvailableSlotsResponse(date=date, duration_minutes=duration, slots=slot_list)


@router.post("/advertisements/{ad_id}/appointments", response_model=AppointmentOut, status_code=201)
async def book_appointment(
    ad_id: str,
    body: AppointmentCreate,
    db: AsyncSession = Depends(get_db),
):
    ad = await db.get(Advertisement, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Campaign not found")

    slot_dt = body.slot_datetime.replace(tzinfo=None)  # store naive UTC

    # Rule 1 — date must be within booking window
    win_start, win_end = _campaign_window(ad)
    req_date = slot_dt.date()
    if req_date < win_start or req_date > win_end:
        raise HTTPException(
            status_code=400,
            detail=f"Slot date {req_date} is outside the campaign booking window "
                   f"({win_start} to {win_end}).",
        )

    # Rule 2 — slot must not be in the past
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    if slot_dt <= now_utc:
        raise HTTPException(status_code=400, detail="Cannot book a slot in the past.")

    bc       = _booking_config(ad)
    duration = bc["slot_duration_minutes"]
    capacity = bc["max_per_slot"]

    # Rule 3 — slot must not be at capacity
    count_result = await db.execute(
        select(func.count(Appointment.id))
        .where(
            Appointment.advertisement_id == ad_id,
            Appointment.status == "confirmed",
            Appointment.slot_datetime == slot_dt,
        )
    )
    current_count = count_result.scalar_one()
    if current_count >= capacity:
        raise HTTPException(
            status_code=409,
            detail="This slot is fully booked. Please choose another time.",
        )

    appt = Appointment(
        advertisement_id=ad_id,
        survey_response_id=body.survey_response_id,
        patient_name=body.patient_name,
        patient_phone=body.patient_phone,
        slot_datetime=slot_dt,
        duration_minutes=duration,
        status="confirmed",
        notes=body.notes,
    )
    db.add(appt)
    await db.commit()
    await db.refresh(appt)
    return appt


@router.get("/advertisements/{ad_id}/appointments", response_model=List[AppointmentOut])
async def list_appointments(
    ad_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.STUDY_COORDINATOR, UserRole.PROJECT_MANAGER):
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(Appointment)
        .where(Appointment.advertisement_id == ad_id)
        .order_by(Appointment.slot_datetime)
    )
    return result.scalars().all()


class AppointmentPatch(BaseModel):
    status: Optional[str] = Field(None, pattern="^(confirmed|cancelled)$")
    notes:  Optional[str] = None


@router.patch("/advertisements/{ad_id}/appointments/{appointment_id}", response_model=AppointmentOut)
async def update_appointment(
    ad_id: str,
    appointment_id: str,
    body: AppointmentPatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PROJECT_MANAGER])),
):
    result = await db.execute(
        select(Appointment).where(
            Appointment.id == appointment_id,
            Appointment.advertisement_id == ad_id,
        )
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(appt, field, value)
    await db.commit()
    await db.refresh(appt)
    return appt


# ── Booking config management ─────────────────────────────────────────────────

class BookingConfigOut(BaseModel):
    slot_duration_minutes: int
    max_per_slot: int
    window_start: Optional[str] = None   # ISO date or null
    window_end:   Optional[str] = None


class BookingConfigPatch(BaseModel):
    slot_duration_minutes: Optional[int] = Field(None, ge=5, le=480)
    max_per_slot:          Optional[int] = Field(None, ge=1, le=500)


@router.get("/advertisements/{ad_id}/booking-config", response_model=BookingConfigOut)
async def get_booking_config(
    ad_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PROJECT_MANAGER])),
):
    ad = await db.get(Advertisement, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Campaign not found")

    bc = _booking_config(ad)
    win_start, win_end = _campaign_window(ad)
    return BookingConfigOut(
        slot_duration_minutes=bc["slot_duration_minutes"],
        max_per_slot=bc["max_per_slot"],
        window_start=str(win_start),
        window_end=str(win_end),
    )


@router.patch("/advertisements/{ad_id}/booking-config", response_model=BookingConfigOut)
async def update_booking_config(
    ad_id: str,
    body: BookingConfigPatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
):
    ad = await db.get(Advertisement, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Campaign not found")

    existing = ad.booking_config if isinstance(ad.booking_config, dict) else {}
    updated  = {**existing}
    if body.slot_duration_minutes is not None:
        updated["slot_duration_minutes"] = body.slot_duration_minutes
    if body.max_per_slot is not None:
        updated["max_per_slot"] = body.max_per_slot
    updated.setdefault("slot_duration_minutes", DEFAULT_SLOT_DURATION)
    updated.setdefault("max_per_slot", DEFAULT_MAX_PER_SLOT)

    ad.booking_config = updated
    await db.commit()

    win_start, win_end = _campaign_window(ad)
    return BookingConfigOut(
        slot_duration_minutes=updated["slot_duration_minutes"],
        max_per_slot=updated["max_per_slot"],
        window_start=str(win_start),
        window_end=str(win_end),
    )
