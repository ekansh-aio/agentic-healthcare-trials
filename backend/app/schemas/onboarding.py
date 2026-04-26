from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class OnboardingRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=256)
    industry: Optional[str] = None
    logo_url: Optional[str] = None
    admin_email: EmailStr
    admin_password: str = Field(..., min_length=8)
    admin_name: str


class OnboardingResponse(BaseModel):
    company_id: str
    admin_user_id: str
    message: str = "Company onboarded successfully"


class LogoUploadResponse(BaseModel):
    logo_url: str
