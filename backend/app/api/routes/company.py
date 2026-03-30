"""
Company profile routes.

GET  /company/profile   — Return company info (name, industry, locations)
PATCH /company/locations — Update operating locations
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel

from app.db.database import get_db
from app.models.models import User, Company, UserRole
from app.core.security import require_roles

router = APIRouter(prefix="/company", tags=["Company"])


class LocationEntry(BaseModel):
    country: str
    cities: List[str] = []


class CompanyProfile(BaseModel):
    id: str
    name: str
    industry: Optional[str]
    locations: List[LocationEntry] = []


class LocationsUpdate(BaseModel):
    locations: List[LocationEntry]


@router.get("/profile", response_model=CompanyProfile)
async def get_profile(
    user: User = Depends(require_roles([
        UserRole.STUDY_COORDINATOR, UserRole.PROJECT_MANAGER,
        UserRole.ETHICS_MANAGER, UserRole.PUBLISHER,
    ])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Company).where(Company.id == user.company_id))
    company = result.scalar_one()
    return CompanyProfile(
        id=company.id,
        name=company.name,
        industry=company.industry,
        locations=[LocationEntry(**loc) for loc in (company.locations or [])],
    )


@router.patch("/locations", response_model=CompanyProfile)
async def update_locations(
    body: LocationsUpdate,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Company).where(Company.id == user.company_id))
    company = result.scalar_one()
    company.locations = [loc.model_dump() for loc in body.locations]
    await db.flush()
    return CompanyProfile(
        id=company.id,
        name=company.name,
        industry=company.industry,
        locations=body.locations,
    )
