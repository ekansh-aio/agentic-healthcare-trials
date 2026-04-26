from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.schemas.enums import DocumentTypeEnum


# ─── Company Documents ────────────────────────────────────────────────────────

class DocumentCreate(BaseModel):
    doc_type: DocumentTypeEnum
    title: str
    content: Optional[str] = None


class DocumentOut(BaseModel):
    id: str
    doc_type: str
    title: str
    content: Optional[str] = None
    file_path: Optional[str] = None
    priority: int
    version: int
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    priority: Optional[int] = None


# ─── Advertisement Documents ──────────────────────────────────────────────────

class AdvertisementDocumentOut(BaseModel):
    id: str
    advertisement_id: str
    doc_type: str
    title: str
    file_path: Optional[str] = None
    priority: int
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Chunked Upload ───────────────────────────────────────────────────────────

class StartUploadRequest(BaseModel):
    doc_type: str
    title: str
    filename: str
    content_type: str
    total_chunks: int


class ChunkUploadRequest(BaseModel):
    upload_id: str
    chunk_index: int
    data: str   # base64-encoded chunk bytes


class FinalizeUploadRequest(BaseModel):
    upload_id: str


# ─── S3 Pre-signed Upload ─────────────────────────────────────────────────────

class PresignRequest(BaseModel):
    doc_type: str
    title: str
    filename: str
    content_type: str
    file_size: int


class PresignResponse(BaseModel):
    method: str                   # "s3" | "direct"
    upload_url: Optional[str] = None
    s3_key: Optional[str] = None
    content_type: Optional[str] = None


class ConfirmUploadRequest(BaseModel):
    s3_key: str
    doc_type: str
    title: str
    filename: str
    content_type: str
