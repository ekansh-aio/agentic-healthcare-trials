from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class BrandKitCreate(BaseModel):
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    primary_font: Optional[str] = None
    secondary_font: Optional[str] = None
    adjectives: Optional[str] = None
    dos: Optional[str] = None
    donts: Optional[str] = None
    preset_name: Optional[str] = None
    pdf_path: Optional[str] = None


class BrandKitOut(BaseModel):
    id: str
    company_id: str
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    primary_font: Optional[str] = None
    secondary_font: Optional[str] = None
    adjectives: Optional[str] = None
    dos: Optional[str] = None
    donts: Optional[str] = None
    preset_name: Optional[str] = None
    pdf_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BrandKitUpdate(BaseModel):
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    primary_font: Optional[str] = None
    secondary_font: Optional[str] = None
    adjectives: Optional[str] = None
    dos: Optional[str] = None
    donts: Optional[str] = None
    preset_name: Optional[str] = None
    pdf_path: Optional[str] = None
