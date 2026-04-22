"""
Appointment Booking Routes

GET  /api/advertisements/{ad_id}/appointments/slots?date=YYYY-MM-DD
  — Returns available time slots for a date (public, no auth).

POST /api/advertisements/{ad_id}/appointments
  — Books a slot (public, no auth). Returns 409 on conflict.

GET  /api/advertisements/{ad_id}/appointments
  — Lists all appointments for a campaign (study coordinator auth required).
"""

import logging
from datetime import datetime, date, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.models.models import Advertisement, Appointment, User, UserRole
from app.schemas.schemas import AppointmentCreate, AppointmentOut, AvailableSlotsResponse, SlotInfo
from app.core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["appointments"])


def _slot_duration(ad: Advertisement) -> int:
    """Return slot size in minutes from strategy_json, bot_config, or default 30."""
    strategy = ad.strategy_json or {}
    if isinstance(strategy, dict):
        val = strategy.get("first_visit_duration")
        if val and isinstance(val, (int, float)) and val > 0:
            return int(val)
    bot_cfg = ad.bot_config or {}
    if isinstance(bot_cfg, dict):
        val = bot_cfg.get("slot_duration_minutes")
        if val and isinstance(val, (int, float)) and val > 0:
            return int(val)
    return 30


def _generate_slots(duration: int) -> List[dict]:
    """Generate HH:MM + label pairs from 9:00 AM to 5:00 PM."""
    slots = []
    start = 9 * 60   # 9:00 AM in minutes
    end   = 17 * 60  # 5:00 PM in minutes
    t = start
    while t + duration <= end:
        h, m = divmod(t, 60)
        time_str = f"{h:02d}:{m:02d}"
        period = "AM" if h < 12 else "PM"
        display_h = h if h <= 12 else h - 12
        if display_h == 0:
            display_h = 12
        label = f"{display_h}:{m:02d} {period}"
        slots.append({"time": time_str, "label": label})
        t += duration
    return slots


@router.get("/advertisements/{ad_id}/appointments/slots", response_model=AvailableSlotsResponse)
async def get_slots(
    ad_id: str,
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
):
    try:
        # Validate ad exists
        ad = await db.get(Advertisement, ad_id)
        if not ad:
            raise HTTPException(status_code=404, detail="Campaign not found")

        # Parse requested date
        try:
            req_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        duration = _slot_duration(ad)
        all_slots = _generate_slots(duration)

        # Find already-booked confirmed slots on this date
        day_start = datetime(req_date.year, req_date.month, req_date.day, 0, 0, 0)
        day_end   = day_start + timedelta(days=1)

        try:
            result = await db.execute(
                select(Appointment).where(
                    Appointment.advertisement_id == ad_id,
                    Appointment.status == "confirmed",
                    Appointment.slot_datetime >= day_start,
                    Appointment.slot_datetime < day_end,
                )
            )
            booked_times = {
                appt.slot_datetime.strftime("%H:%M")
                for appt in result.scalars().all()
            }
        except Exception as e:
            # If appointments table doesn't exist yet, treat all slots as available
            logger.warning(f"Could not query appointments (table may not exist): {e}")
            booked_times = set()

        # Mark past slots as unavailable
        now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

        slot_list = []
        for s in all_slots:
            slot_dt = datetime(req_date.year, req_date.month, req_date.day,
                               *map(int, s["time"].split(":")))
            available = (s["time"] not in booked_times) and (slot_dt > now_utc)
            slot_list.append(SlotInfo(time=s["time"], label=s["label"], available=available))

        return AvailableSlotsResponse(date=date, duration_minutes=duration, slots=slot_list)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching slots for ad {ad_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch appointment slots: {str(e)}")


@router.post("/advertisements/{ad_id}/appointments", response_model=AppointmentOut, status_code=201)
async def book_appointment(
    ad_id: str,
    body: AppointmentCreate,
    db: AsyncSession = Depends(get_db),
):
    try:
        ad = await db.get(Advertisement, ad_id)
        if not ad:
            raise HTTPException(status_code=404, detail="Campaign not found")

        duration = _slot_duration(ad)
        slot_dt = body.slot_datetime.replace(tzinfo=None)  # store naive UTC

        # Check conflict
        try:
            result = await db.execute(
                select(Appointment).where(
                    Appointment.advertisement_id == ad_id,
                    Appointment.status == "confirmed",
                    Appointment.slot_datetime == slot_dt,
                )
            )
            if result.scalars().first():
                raise HTTPException(status_code=409, detail="This slot has already been booked. Please choose another.")
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Could not check for booking conflicts: {e}")
            # Continue with booking anyway if table doesn't exist

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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error booking appointment for ad {ad_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to book appointment: {str(e)}")


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
