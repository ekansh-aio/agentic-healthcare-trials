"""
M2: Auth Routes
Owner: Backend Dev 1
Dependencies: security.py, models.py, schemas.py

POST /auth/login — Role-based sign-in
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.models.models import User, Company
from app.schemas.schemas import LoginRequest, TokenResponse
from app.core.security import verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Role-based user sign-in.
    Verifies email, password, company name, and role.
    All failures return a generic 401 to avoid leaking information.
    Returns JWT token with role, company_id, and company_name.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Verify email + password first
    if not user or not verify_password(body.password, user.hashed_pw):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    # Verify claimed role matches the role stored in DB
    if user.role.value != body.role.value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Verify claimed company name matches the company in DB
    company_result = await db.execute(
        select(Company).where(Company.id == user.company_id)
    )
    company = company_result.scalar_one_or_none()

    if not company or company.name.lower() != body.company.strip().lower():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_access_token(
        user_id=user.id,
        role=user.role.value,
        company_id=user.company_id,
    )

    return TokenResponse(
        access_token=token,
        role=user.role.value,
        company_id=user.company_id,
        company_name=company.name,
        user_id=user.id,
    )