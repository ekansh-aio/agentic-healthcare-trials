"""
M8: Advertisement Routes
Owner: Backend Dev 2
Dependencies: M1, M2, M5 (Curator), M6 (Reviewer)

Full advertisement lifecycle: create → curate → review → ethics → publish → optimize

Protocol documents (campaign-specific) are stored separately from company documents:
  - Table: advertisement_documents
  - Path:  uploads/docs/<company_id>/<advertisement_id>/<filename>
  - Priority: 10 (higher than company documents default of 0)
  - The curator loads both company docs and protocol docs, protocol docs win on priority.
"""

import asyncio
import base64
import json
import logging
import os
import mimetypes
import shutil
import tempfile
import uuid as uuid_mod
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, field_validator
from app.db.database import get_db
from app.models.models import (
    User, UserRole, Advertisement, AdStatus, Review,
    CompanyDocument, AdvertisementDocument, BrandKit, Company,
)
from app.schemas.schemas import (
    AdvertisementCreate, AdvertisementOut, AdvertisementUpdate,
    ReviewCreate, ReviewOut, OptimizerDecision, BotConfigUpdate,
    AdvertisementDocumentOut, MinorEditRequest, RewriteStrategyRequest,
    QuestionnaireUpdate, RewriteQuestionRequest,
    StartUploadRequest, ChunkUploadRequest, FinalizeUploadRequest,
    PresignRequest, PresignResponse, ConfirmUploadRequest,
)
from app.core.security import require_roles, get_current_user
from app.services.ai.curator import CuratorService
from app.services.ai.reviewer import ReviewerService
from app.services.ai.voicebot_agent import VoicebotAgentService
from app.services.storage import file_storage
from app.services.storage.extractor import extract_text, url_to_disk_path, BACKEND_ROOT

router = APIRouter(prefix="/advertisements", tags=["Advertisements"])
logger = logging.getLogger(__name__)

# ── Chunked-upload session storage ───────────────────────────────────────────
# Sessions are stored as temp files so they survive uvicorn --reload restarts
# and work correctly with multiple workers (shared filesystem).
# Each session gets a directory: <SESSIONS_DIR>/<upload_id>/
#   meta.json   — session metadata (ad_id, company_id, doc_type, …)
#   chunk_N.bin — raw bytes for chunk N (written as chunks arrive)

_SESSIONS_DIR = os.path.join(tempfile.gettempdir(), "ad_upload_sessions")
os.makedirs(_SESSIONS_DIR, exist_ok=True)


def _session_dir(upload_id: str) -> str:
    return os.path.join(_SESSIONS_DIR, upload_id)


def _load_session_meta(upload_id: str) -> Dict[str, Any] | None:
    meta_path = os.path.join(_session_dir(upload_id), "meta.json")
    try:
        with open(meta_path, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _delete_session(upload_id: str) -> None:
    try:
        shutil.rmtree(_session_dir(upload_id), ignore_errors=True)
    except Exception:
        pass

ALLOWED_PROTOCOL_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
}


# ─── CRUD ─────────────────────────────────────────────────────────────────────

@router.post("/", response_model=AdvertisementOut)
async def create_advertisement(
    body: AdvertisementCreate,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    ad = Advertisement(
        company_id=user.company_id,
        title=body.title,
        ad_type=body.ad_type,
        campaign_category=body.campaign_category,
        budget=body.budget,
        duration=body.duration,
        platforms=body.platforms,
        target_audience=body.target_audience,
        trial_location=body.trial_location,
        patients_required=body.patients_required,
        trial_start_date=body.trial_start_date,
        trial_end_date=body.trial_end_date,
        special_instructions=body.special_instructions,
        status=AdStatus.DRAFT,
    )
    db.add(ad)
    await db.flush()
    return ad


@router.get("/", response_model=List[AdvertisementOut])
async def list_advertisements(
    status: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Advertisement).where(Advertisement.company_id == user.company_id)
    if status:
        query = query.where(Advertisement.status == status)
    result = await db.execute(query.order_by(Advertisement.created_at.desc()))
    return result.scalars().all()


@router.get("/optimizer-changes")
async def list_optimizer_changes(
    user: User = Depends(require_roles([UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """Return all pending optimizer-change reviews grouped by advertisement."""
    result = await db.execute(
        select(Review)
        .join(Advertisement, Review.advertisement_id == Advertisement.id)
        .where(
            Advertisement.company_id == user.company_id,
            Review.review_type == "optimizer",
            Review.status == "pending",
        )
        .order_by(Review.advertisement_id)
    )
    reviews = result.scalars().all()

    ad_ids = list({r.advertisement_id for r in reviews})
    ads_result = await db.execute(select(Advertisement).where(Advertisement.id.in_(ad_ids)))
    ad_map = {a.id: a for a in ads_result.scalars().all()}

    grouped = {}
    for r in reviews:
        ad = ad_map.get(r.advertisement_id)
        if r.advertisement_id not in grouped:
            grouped[r.advertisement_id] = {
                "ad_id":    r.advertisement_id,
                "ad_title": ad.title if ad else r.advertisement_id,
                "changes":  [],
            }
        grouped[r.advertisement_id]["changes"].append({
            "review_id":   r.id,
            "comments":    r.comments,
            "suggestions": r.suggestions or {},
            "created_at":  r.created_at.isoformat() if hasattr(r, "created_at") and r.created_at else None,
        })

    return list(grouped.values())


@router.get("/{ad_id}", response_model=AdvertisementOut)
async def get_advertisement(
    ad_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    return ad


@router.patch("/{ad_id}", response_model=AdvertisementOut)
async def update_advertisement(
    ad_id: str,
    body: AdvertisementUpdate,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ad, field, value)
    return ad


# ─── Questionnaire ────────────────────────────────────────────────────────────

@router.post("/{ad_id}/generate-questionnaire", response_model=AdvertisementOut)
async def generate_questionnaire(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PROJECT_MANAGER, UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """Use Claude to auto-generate an MCQ eligibility questionnaire from campaign context."""
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    company_docs_result = await db.execute(
        select(CompanyDocument).where(CompanyDocument.company_id == user.company_id)
    )
    protocol_docs_result = await db.execute(
        select(AdvertisementDocument).where(
            AdvertisementDocument.advertisement_id == ad_id,
            AdvertisementDocument.company_id == user.company_id,
        )
    )
    all_docs = sorted(
        list(company_docs_result.scalars().all()) + list(protocol_docs_result.scalars().all()),
        key=lambda d: d.priority, reverse=True,
    )

    curator = CuratorService(db, user.company_id)
    try:
        questionnaire = await curator.generate_questionnaire(ad, all_docs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Questionnaire generation failed for ad %s: %s", ad_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Questionnaire generation failed: {e}")

    ad.questionnaire = questionnaire
    flag_modified(ad, "questionnaire")
    return ad


@router.patch("/{ad_id}/questionnaire", response_model=AdvertisementOut)
async def update_questionnaire(
    ad_id: str,
    body: QuestionnaireUpdate,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PROJECT_MANAGER, UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """Save or replace the questionnaire for a campaign."""
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    ad.questionnaire = body.questionnaire
    flag_modified(ad, "questionnaire")
    return ad


@router.post("/{ad_id}/questionnaire/rewrite-question")
async def rewrite_question(
    ad_id: str,
    body: RewriteQuestionRequest,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PROJECT_MANAGER, UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """Rewrite a single MCQ question using Claude based on a user instruction."""
    curator = CuratorService(db, user.company_id)
    updated = await curator.rewrite_question(body.question, body.instruction)
    return {"question": updated}


# ─── Protocol Documents ───────────────────────────────────────────────────────

@router.post("/{ad_id}/documents", response_model=AdvertisementDocumentOut)
async def upload_protocol_document(
    ad_id: str,
    doc_type: str = Form(...),
    title: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a campaign-specific protocol document.
    Stored separately from company documents — never appears on My Company page.
    Saved to uploads/docs/<company_id>/<ad_id>/<filename>.
    Created with priority=10 so the curator treats these as higher-priority
    context than generic company documents (priority=0).
    """
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    if file.content_type not in ALLOWED_PROTOCOL_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Accepted: PDF, DOCX, DOC, TXT, MD.",
        )

    file_path = await file_storage.save(
        file=file,
        subfolder=f"docs/{user.company_id}/{ad_id}",
        filename=file.filename,
    )

    disk_path = url_to_disk_path(file_path, BACKEND_ROOT)
    content   = extract_text(disk_path)

    doc = AdvertisementDocument(
        company_id=user.company_id,
        advertisement_id=ad_id,
        doc_type=doc_type,
        title=title,
        content=content,
        file_path=file_path,
        priority=10,
    )
    db.add(doc)
    await db.flush()
    return doc


# ─── Chunked upload (WAF body-size workaround) ────────────────────────────────
# CloudFront WAF blocks request bodies > 8 KB (SizeRestrictions_BODY rule).
# These three endpoints split a file upload into small JSON requests that each
# stay well under the limit.  The original multipart endpoint is kept for
# direct/internal use.

@router.post("/{ad_id}/documents/start")
async def start_document_upload(
    ad_id: str,
    req: StartUploadRequest,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """Begin a chunked upload session. Returns an upload_id for subsequent calls."""
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Advertisement not found")

    # Accept application/octet-stream as a fallback for browsers that can't
    # detect the MIME type (e.g. .md files on some browsers).
    effective_content_type = req.content_type
    if effective_content_type == "application/octet-stream":
        # Try to infer from filename extension
        ext = req.filename.rsplit(".", 1)[-1].lower() if "." in req.filename else ""
        ext_map = {
            "pdf":  "application/pdf",
            "doc":  "application/msword",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "txt":  "text/plain",
            "md":   "text/markdown",
        }
        effective_content_type = ext_map.get(ext, req.content_type)

    if effective_content_type not in ALLOWED_PROTOCOL_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Accepted: PDF, DOCX, DOC, TXT, MD.",
        )

    upload_id = str(uuid_mod.uuid4())
    sess_dir = _session_dir(upload_id)
    os.makedirs(sess_dir, exist_ok=True)
    meta = {
        "ad_id":        ad_id,
        "company_id":   user.company_id,
        "doc_type":     req.doc_type,
        "title":        req.title,
        "filename":     req.filename,
        "content_type": effective_content_type,
        "total_chunks": req.total_chunks,
    }
    with open(os.path.join(sess_dir, "meta.json"), "w") as f:
        json.dump(meta, f)
    return {"upload_id": upload_id}


@router.post("/{ad_id}/documents/chunk")
async def upload_document_chunk(
    ad_id: str,
    req:   ChunkUploadRequest,
    user:  User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
):
    """Receive one base64-encoded chunk for an in-progress upload."""
    session = _load_session_meta(req.upload_id)
    if not session or session["ad_id"] != ad_id or session["company_id"] != user.company_id:
        raise HTTPException(status_code=404, detail="Upload session not found")

    try:
        chunk_bytes = base64.b64decode(req.data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 chunk data")

    chunk_path = os.path.join(_session_dir(req.upload_id), f"chunk_{req.chunk_index}.bin")
    with open(chunk_path, "wb") as f:
        f.write(chunk_bytes)

    return {"received": req.chunk_index}


@router.post("/{ad_id}/documents/finalize", response_model=AdvertisementDocumentOut)
async def finalize_document_upload(
    ad_id: str,
    req:   FinalizeUploadRequest,
    user:  User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db:    AsyncSession = Depends(get_db),
):
    """Assemble all chunks and create the AdvertisementDocument record."""
    session = _load_session_meta(req.upload_id)
    if not session or session["ad_id"] != ad_id or session["company_id"] != user.company_id:
        raise HTTPException(status_code=404, detail="Upload session not found")

    expected = session["total_chunks"]
    sess_dir = _session_dir(req.upload_id)
    missing = [i for i in range(expected) if not os.path.exists(os.path.join(sess_dir, f"chunk_{i}.bin"))]
    if missing:
        raise HTTPException(status_code=400, detail="Incomplete upload — missing chunks")

    parts = []
    for i in range(expected):
        with open(os.path.join(sess_dir, f"chunk_{i}.bin"), "rb") as f:
            parts.append(f.read())
    file_bytes = b"".join(parts)
    _delete_session(req.upload_id)

    file_path = await file_storage.save_bytes(
        data=file_bytes,
        subfolder=f"docs/{user.company_id}/{ad_id}",
        filename=session["filename"],
    )

    disk_path = url_to_disk_path(file_path, BACKEND_ROOT)
    content   = extract_text(disk_path)

    doc = AdvertisementDocument(
        company_id=user.company_id,
        advertisement_id=ad_id,
        doc_type=session["doc_type"],
        title=session["title"],
        content=content,
        file_path=file_path,
        priority=10,
    )
    db.add(doc)
    await db.flush()
    return doc


# ─── S3 Pre-signed Upload (WAF-safe large-file upload) ────────────────────────
# Flow:  frontend → POST /presign  (gets S3 PUT URL, small JSON body)
#        frontend → PUT <s3_url>   (direct to S3, bypasses CloudFront WAF)
#        frontend → POST /confirm  (backend downloads from S3, saves to EFS)
#
# Falls back to "direct" (multipart) when S3_UPLOAD_BUCKET is not configured
# so localhost dev continues to work without any AWS setup.

def _s3_client():
    """Return a boto3 S3 client using the configured AWS credentials/region."""
    import boto3
    from botocore.config import Config as _BotocoreConfig
    from app.core.config import settings as _s
    kwargs: dict = {
        "region_name": _s.AWS_REGION,
        # SigV4 is required for pre-signed URLs on SSE-encrypted buckets
        # and for any bucket outside us-east-1 classic endpoint
        "config": _BotocoreConfig(signature_version="s3v4"),
    }
    if _s.AWS_ACCESS_KEY_ID:
        kwargs["aws_access_key_id"] = _s.AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = _s.AWS_SECRET_ACCESS_KEY
    return boto3.client("s3", **kwargs)


MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB hard cap


@router.post("/{ad_id}/documents/presign", response_model=PresignResponse)
async def get_document_presign_url(
    ad_id: str,
    req:   PresignRequest,
    user:  User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db:    AsyncSession = Depends(get_db),
):
    """
    Return a pre-signed S3 PUT URL so the browser can upload directly to S3,
    bypassing CloudFront WAF body-size restrictions.

    If S3 is not configured (S3_UPLOAD_BUCKET unset) returns {"method": "direct"}
    and the frontend falls back to the regular multipart endpoint.
    """
    from app.core.config import settings as _s

    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Advertisement not found")

    if req.file_size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB)")

    # Validate MIME type (infer from extension if browser reports octet-stream)
    effective_ct = req.content_type
    if effective_ct == "application/octet-stream":
        ext = req.filename.rsplit(".", 1)[-1].lower() if "." in req.filename else ""
        ext_map = {
            "pdf":  "application/pdf",
            "doc":  "application/msword",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "txt":  "text/plain",
            "md":   "text/markdown",
        }
        effective_ct = ext_map.get(ext, req.content_type)

    if effective_ct not in ALLOWED_PROTOCOL_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Accepted: PDF, DOCX, DOC, TXT, MD.",
        )

    if not _s.S3_UPLOAD_BUCKET:
        # Localhost / no S3 — tell frontend to use direct multipart upload
        return PresignResponse(method="direct")

    s3_key = f"{_s.S3_UPLOAD_PREFIX}/{user.company_id}/{ad_id}/{uuid_mod.uuid4()}_{req.filename}"
    try:
        client = _s3_client()
        upload_url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": _s.S3_UPLOAD_BUCKET,
                "Key":    s3_key,
                "ContentType": effective_ct,
            },
            ExpiresIn=3600,
        )
    except Exception as e:
        logger.error("Failed to generate S3 pre-signed URL: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not generate upload URL")

    return PresignResponse(method="s3", upload_url=upload_url, s3_key=s3_key, content_type=effective_ct)


@router.post("/{ad_id}/documents/confirm", response_model=AdvertisementDocumentOut)
async def confirm_s3_document_upload(
    ad_id: str,
    req:   ConfirmUploadRequest,
    user:  User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db:    AsyncSession = Depends(get_db),
):
    """
    Called after the browser has PUT the file to S3.
    Downloads the file from S3, extracts text, saves to EFS, creates DB record.
    Deletes the temporary S3 object when done.
    """
    from app.core.config import settings as _s

    if not _s.S3_UPLOAD_BUCKET:
        raise HTTPException(status_code=400, detail="S3 upload not configured on this server")

    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Advertisement not found")

    # Security: ensure the S3 key belongs to this company/ad
    expected_prefix = f"{_s.S3_UPLOAD_PREFIX}/{user.company_id}/{ad_id}/"
    if not req.s3_key.startswith(expected_prefix):
        raise HTTPException(status_code=400, detail="Invalid upload key")

    try:
        client = _s3_client()
        s3_obj = client.get_object(Bucket=_s.S3_UPLOAD_BUCKET, Key=req.s3_key)
        file_bytes = s3_obj["Body"].read()
    except Exception as e:
        logger.error("Failed to download from S3 key %s: %s", req.s3_key, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not retrieve uploaded file")

    # Save to EFS
    file_path = await file_storage.save_bytes(
        data=file_bytes,
        subfolder=f"docs/{user.company_id}/{ad_id}",
        filename=req.filename,
    )

    # Extract text for AI context
    from app.services.storage.extractor import extract_text, url_to_disk_path, BACKEND_ROOT
    disk_path = url_to_disk_path(file_path, BACKEND_ROOT)
    content   = extract_text(disk_path)

    doc = AdvertisementDocument(
        company_id=user.company_id,
        advertisement_id=ad_id,
        doc_type=req.doc_type,
        title=req.title,
        content=content,
        file_path=file_path,
        priority=10,
    )
    db.add(doc)
    await db.flush()

    # Clean up the temporary S3 object (best-effort)
    try:
        client.delete_object(Bucket=_s.S3_UPLOAD_BUCKET, Key=req.s3_key)
    except Exception:
        pass  # non-fatal — lifecycle policy will clean up eventually

    return doc


@router.get("/{ad_id}/documents", response_model=List[AdvertisementDocumentOut])
async def list_protocol_documents(
    ad_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all protocol documents for an advertisement."""
    result = await db.execute(
        select(AdvertisementDocument).where(
            AdvertisementDocument.advertisement_id == ad_id,
            AdvertisementDocument.company_id == user.company_id,
        )
    )
    return result.scalars().all()


# ─── Background LLM workers ──────────────────────────────────────────────────
# These run after the HTTP response is sent so CloudFront / WAF timeouts never
# interrupt them. Each worker opens its own DB session.

async def _bg_generate_strategy(ad_id: str, company_id: str) -> None:
    """Background task: run Curator + Questionnaire, update ad when done."""
    from app.db.database import async_session_factory
    try:
        async with async_session_factory() as db:
            result = await db.execute(
                select(Advertisement).where(Advertisement.id == ad_id)
            )
            ad = result.scalar_one_or_none()
            if not ad:
                return

            company_docs_result = await db.execute(
                select(CompanyDocument).where(CompanyDocument.company_id == company_id)
            )
            protocol_docs_result = await db.execute(
                select(AdvertisementDocument).where(
                    AdvertisementDocument.advertisement_id == ad_id,
                    AdvertisementDocument.company_id == company_id,
                )
            )
            all_docs = sorted(
                list(company_docs_result.scalars().all()) + list(protocol_docs_result.scalars().all()),
                key=lambda d: d.priority, reverse=True,
            )

            curator = CuratorService(db, company_id)
            strategy, questionnaire = await asyncio.gather(
                curator.generate_strategy(ad, all_docs),
                curator.generate_questionnaire(ad, all_docs),
            )

            if strategy.get("parse_error"):
                # Strategy JSON could not be parsed — reset to DRAFT so user can retry
                logger.error("Strategy parse error for ad %s: %s", ad_id, strategy.get("raw_response", "")[:200])
                ad.status = AdStatus.DRAFT
                await db.commit()
                return

            ad.strategy_json  = strategy
            ad.questionnaire  = questionnaire
            ad.status         = AdStatus.STRATEGY_CREATED
            flag_modified(ad, "strategy_json")
            flag_modified(ad, "questionnaire")

            # Auto voice recommendation for voicebot campaigns
            if "voicebot" in (ad.ad_type if isinstance(ad.ad_type, list) else []):
                await db.flush()
                try:
                    vb_svc = VoicebotAgentService(db)
                    rec = await vb_svc.recommend_voice(ad_id)
                    cfg = dict(ad.bot_config if isinstance(ad.bot_config, dict) else {})
                    cfg.setdefault("voice_id",           rec["voice_id"])
                    cfg.setdefault("conversation_style", rec["conversation_style"])
                    cfg.setdefault("first_message",      rec["first_message"])
                    cfg["_voice_rec"] = {"voice_name": rec["voice_name"], "reason": rec["reason"]}
                    ad.bot_config = cfg
                    flag_modified(ad, "bot_config")
                except Exception:
                    pass

            await db.commit()
    except Exception as e:
        logger.error("Background strategy generation failed for ad %s: %s", ad_id, e, exc_info=True)
        # Reset to DRAFT so user can retry
        try:
            from app.db.database import async_session_factory as _sf
            async with _sf() as db2:
                result = await db2.execute(select(Advertisement).where(Advertisement.id == ad_id))
                ad = result.scalar_one_or_none()
                if ad and ad.status == AdStatus.GENERATING:
                    ad.status = AdStatus.DRAFT
                    await db2.commit()
        except Exception:
            pass


async def _bg_generate_creatives(ad_id: str, company_id: str) -> None:
    """Background task: generate ad creatives."""
    from app.db.database import async_session_factory
    from app.services.ai.creative import CreativeService
    try:
        async with async_session_factory() as db:
            result = await db.execute(select(Advertisement).where(Advertisement.id == ad_id))
            ad = result.scalar_one_or_none()
            if not ad:
                return
            svc = CreativeService(company_id=company_id)
            creatives = await svc.generate_creatives(ad)
            ad.output_files = creatives
            flag_modified(ad, "output_files")
            await db.commit()
    except Exception as e:
        logger.error("Background creative generation failed for ad %s: %s", ad_id, e, exc_info=True)


async def _bg_submit_for_review(ad_id: str, company_id: str) -> None:
    """Background task: run Reviewer pre-analysis and move ad to UNDER_REVIEW."""
    from app.db.database import async_session_factory
    try:
        async with async_session_factory() as db:
            result = await db.execute(select(Advertisement).where(Advertisement.id == ad_id))
            ad = result.scalar_one_or_none()
            if not ad:
                return
            reviewer_svc = ReviewerService(db, company_id)
            review_output = await reviewer_svc.pre_review(ad)
            ad.website_reqs = review_output.get("website_requirements")
            ad.ad_details   = review_output.get("ad_details")
            flag_modified(ad, "website_reqs")
            flag_modified(ad, "ad_details")
            if ad.status != AdStatus.STRATEGY_CREATED:
                logger.warning(
                    "Skipping UNDER_REVIEW transition for ad %s — state is '%s', expected STRATEGY_CREATED",
                    ad_id, ad.status.value,
                )
                await db.commit()
                return
            ad.status = AdStatus.UNDER_REVIEW
            await db.commit()
    except Exception as e:
        logger.error("Background submit-for-review failed for ad %s: %s", ad_id, e, exc_info=True)


async def _bg_generate_website(ad_id: str, company_id: str) -> None:
    """Background task: generate landing page website."""
    from app.db.database import async_session_factory
    from app.services.ai.website_agent import WebsiteAgentService
    try:
        async with async_session_factory() as db:
            result = await db.execute(select(Advertisement).where(Advertisement.id == ad_id))
            ad = result.scalar_one_or_none()
            if not ad:
                return
            brand_kit_result = await db.execute(
                select(BrandKit).where(BrandKit.company_id == company_id)
            )
            brand_kit = brand_kit_result.scalar_one_or_none()
            company_result = await db.execute(
                select(Company).where(Company.id == company_id)
            )
            company = company_result.scalar_one_or_none()
            svc = WebsiteAgentService(company_id=company_id)
            url = await svc.generate_website(ad, brand_kit, company)
            ad.output_url = url
            # The URL is deterministic (/outputs/{company}/{ad}/website/index.html)
            # so regenerating produces the same value and SQLAlchemy would skip the
            # UPDATE, meaning onupdate=_now never fires on updated_at and the
            # frontend poll times out. Force the UPDATE by explicitly touching updated_at.
            ad.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            await db.commit()
    except Exception as e:
        logger.error("Background website generation failed for ad %s: %s", ad_id, e, exc_info=True)
        # Touch updated_at so the frontend poll can detect that the task finished
        # (even on failure) rather than timing out after 5 minutes.
        try:
            from app.db.database import async_session_factory as _sf
            async with _sf() as db2:
                r2 = await db2.execute(select(Advertisement).where(Advertisement.id == ad_id))
                ad2 = r2.scalar_one_or_none()
                if ad2:
                    ad2.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    await db2.commit()
        except Exception as touch_err:
            logger.error("Failed to touch updated_at after website gen failure for ad %s: %s", ad_id, touch_err)


# ─── AI Strategy Generation (Curator) ────────────────────────────────────────

@router.post("/{ad_id}/generate-strategy", response_model=AdvertisementOut)
async def generate_strategy(
    ad_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """
    Kick off async strategy generation. Returns immediately with status=generating.
    The LLM work runs in the background so CloudFront timeouts never apply.
    Frontend polls GET /{ad_id} until status != generating.
    """
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    if ad.status not in (AdStatus.DRAFT, AdStatus.STRATEGY_CREATED):
        raise HTTPException(
            status_code=400,
            detail=f"Strategy can only be generated from DRAFT or STRATEGY_CREATED, not '{ad.status.value}'",
        )

    ad.status = AdStatus.GENERATING
    await db.flush()
    background_tasks.add_task(_bg_generate_strategy, ad_id, user.company_id)
    return ad


# ─── Review Workflow ──────────────────────────────────────────────────────────

@router.post("/{ad_id}/submit-for-review", response_model=AdvertisementOut)
async def submit_for_review(
    ad_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """Kick off async reviewer pre-analysis. Returns immediately."""
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    if ad.status != AdStatus.STRATEGY_CREATED:
        raise HTTPException(
            status_code=400,
            detail=f"Campaign can only be submitted for review from STRATEGY_CREATED, not '{ad.status.value}'",
        )

    background_tasks.add_task(_bg_submit_for_review, ad_id, user.company_id)
    return ad


@router.post("/{ad_id}/reviews", response_model=ReviewOut)
async def create_review(
    ad_id: str,
    body: ReviewCreate,
    user: User = Depends(require_roles([UserRole.PROJECT_MANAGER, UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    review = Review(
        advertisement_id=ad_id,
        reviewer_id=user.id,
        review_type=body.review_type,
        status=body.status,
        comments=body.comments,
        suggestions=body.suggestions,
        edited_strategy=body.edited_strategy,
    )
    db.add(review)

    ad_result = await db.execute(select(Advertisement).where(Advertisement.id == ad_id))
    ad = ad_result.scalar_one_or_none()
    if ad:
        if body.status == "approved":
            if body.review_type == "strategy":
                if ad.status != AdStatus.UNDER_REVIEW:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Strategy review approval requires UNDER_REVIEW state, not '{ad.status.value}'",
                    )
                ad.status = AdStatus.ETHICS_REVIEW
            elif body.review_type == "ethics":
                if ad.status != AdStatus.ETHICS_REVIEW:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Ethics review approval requires ETHICS_REVIEW state, not '{ad.status.value}'",
                    )
                ad.status = AdStatus.APPROVED
        elif body.status in ("revision", "rejected"):
            if ad.status not in (AdStatus.UNDER_REVIEW, AdStatus.ETHICS_REVIEW):
                raise HTTPException(
                    status_code=400,
                    detail=f"Revision/rejection requires UNDER_REVIEW or ETHICS_REVIEW state, not '{ad.status.value}'",
                )
            ad.status = AdStatus.UNDER_REVIEW

    await db.flush()
    return review


@router.get("/{ad_id}/reviews", response_model=List[ReviewOut])
async def list_reviews(
    ad_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Review)
        .join(Advertisement, Review.advertisement_id == Advertisement.id)
        .where(
            Review.advertisement_id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    return result.scalars().all()


# ─── Publishing ───────────────────────────────────────────────────────────────

@router.post("/{ad_id}/publish", response_model=AdvertisementOut)
async def publish_advertisement(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    if ad.status != AdStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Advertisement must be approved before publishing")

    # Verify an ethics review was formally completed before allowing publish
    ethics_result = await db.execute(
        select(Review).where(
            Review.advertisement_id == ad_id,
            Review.review_type == "ethics",
            Review.status == "approved",
        )
    )
    if not ethics_result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Ethics review must be completed and approved before publishing",
        )

    ad.status = AdStatus.PUBLISHED
    return ad


# ─── Meta Ads Distribution ────────────────────────────────────────────────────

@router.post("/{ad_id}/distribute")
async def distribute_to_meta(
    ad_id: str,
    body: dict,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Publish the campaign's generated ad creatives to Meta (Facebook/Instagram)
    via the Marketing API.

    Credentials (access_token, ad_account_id, page_id) are read from the stored
    PlatformConnection for this company — connect once via OAuth in Platform Settings.

    Expected body:
      platform          : "meta"
      config:
        destination_url    : URL the ad clicks lead to
        daily_budget       : daily budget in USD  (e.g. 10.0)
        targeting_countries: comma-separated ISO country codes  (e.g. "US,GB")
        selected_creatives : list of creative indexes to publish

    All created ads start ACTIVE and begin serving immediately.
    They can be paused from the Manage Ads tab at any time.
    """
    from app.services.meta_ads_service import MetaAdsService
    from app.models.models import PlatformConnection

    platform = (body.get("platform") or "").lower()
    if platform != "meta":
        raise HTTPException(status_code=400, detail=f"Unsupported platform: {platform}")

    cfg = body.get("config") or {}

    destination_url    = (cfg.get("destination_url") or "").strip()
    daily_budget_str   = str(cfg.get("daily_budget") or "10").strip()
    countries_str      = (cfg.get("targeting_countries") or "US").strip()
    selected_creatives = cfg.get("selected_creatives") or []
    display_url        = (cfg.get("display_url")  or "").strip() or None
    addon_type         = (cfg.get("addon_type")   or "").strip() or None
    addon_phone        = (cfg.get("addon_phone")  or "").strip() or None
    # "phone" add-on always routes to the provisioned voicebot number —
    # resolved from bot_config below after the ad is loaded.

    # ── Load stored platform connection ──────────────────────────────────────
    conn_result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.company_id == user.company_id,
            PlatformConnection.platform == "meta",
        )
    )
    conn = conn_result.scalar_one_or_none()

    # Allow manual override in config for backwards-compatibility / testing
    access_token  = (cfg.get("access_token")  or "").strip() or (conn.access_token  if conn else "")
    ad_account_id = (cfg.get("ad_account_id") or "").strip() or (conn.ad_account_id if conn else "")
    page_id       = (cfg.get("page_id")       or "").strip() or (conn.page_id       if conn else "")

    # ── Validate required fields ──────────────────────────────────────────────
    missing = [
        name for name, val in [
            ("access_token",    access_token),
            ("ad_account_id",   ad_account_id),
            ("page_id",         page_id),
            ("destination_url", destination_url),
        ] if not val
    ]
    if missing:
        detail = f"Missing required Meta config fields: {', '.join(missing)}"
        if not conn:
            detail += ". Connect your Meta account in Platform Settings first."
        elif not conn.ad_account_id or not conn.page_id:
            detail += ". Select an Ad Account and Facebook Page in Platform Settings."
        raise HTTPException(status_code=422, detail=detail)

    try:
        daily_budget = float(daily_budget_str)
    except ValueError:
        raise HTTPException(status_code=422, detail="daily_budget must be a number")

    targeting_countries = [c.strip().upper() for c in countries_str.split(",") if c.strip()]

    # ── Load advertisement ────────────────────────────────────────────────────
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    if ad.status not in (AdStatus.APPROVED, AdStatus.PUBLISHED):
        raise HTTPException(
            status_code=400,
            detail="Campaign must be approved or published before distributing to Meta",
        )
    if not ad.output_files:
        raise HTTPException(
            status_code=400,
            detail="No ad creatives found. Generate creatives first.",
        )

    # For "phone" add-on, use the voicebot number stored during agent provisioning.
    # No manual number entry required — the CTA always points at the voice agent.
    if addon_type == "phone" and not addon_phone:
        bc = ad.bot_config if isinstance(ad.bot_config, dict) else {}
        addon_phone = bc.get("voice_phone_number") or None
        if not addon_phone:
            raise HTTPException(
                status_code=422,
                detail=(
                    "No voicebot phone number found. "
                    "Provision the voice agent first so its number can be used for the ad CTA."
                ),
            )

    # ── Publish to Meta ───────────────────────────────────────────────────────
    # Reuse the existing campaign ID so analytics history is preserved, but always
    # create a fresh adset — archived adsets cannot contain new active ads.
    existing_bot = ad.bot_config if isinstance(ad.bot_config, dict) else {}
    existing_campaign_id = existing_bot.get("meta_campaign_id") or None

    svc = MetaAdsService(access_token=access_token, ad_account_id=ad_account_id)
    try:
        meta_result = await svc.publish_campaign(
            campaign_name=ad.title,
            page_id=page_id,
            creatives=ad.output_files,
            selected_indices=[int(i) for i in selected_creatives],
            daily_budget_usd=daily_budget,
            destination_url=destination_url,
            targeting_countries=targeting_countries,
            backend_root=str(BACKEND_ROOT),
            display_url=display_url,
            addon_type=addon_type,
            addon_phone=addon_phone,
            existing_campaign_id=existing_campaign_id,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Meta distribute failed for ad %s: %s", ad_id, exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc))
    finally:
        await svc.close()

    # ── Persist the Ads Manager URL on the ad ────────────────────────────────
    from sqlalchemy.orm.attributes import flag_modified
    existing_meta = dict(ad.bot_config if isinstance(ad.bot_config, dict) else {})
    existing_meta["meta_campaign_id"] = meta_result["campaign_id"]
    existing_meta["meta_adset_id"]    = meta_result["adset_id"]
    existing_meta["meta_ad_ids"]      = meta_result["ad_ids"]
    existing_meta["meta_manager_url"] = meta_result["ads_manager_url"]
    ad.bot_config = existing_meta
    flag_modified(ad, "bot_config")
    await db.commit()

    return meta_result


# ─── Creative Generation ──────────────────────────────────────────────────────

@router.post("/{ad_id}/generate-creatives", response_model=AdvertisementOut)
async def generate_creatives(
    ad_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PUBLISHER, UserRole.PROJECT_MANAGER, UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Kick off async creative generation. Returns immediately.
    Frontend polls GET /{ad_id} for output_files to appear.
    """
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    if ad.status not in (AdStatus.APPROVED, AdStatus.PUBLISHED, AdStatus.UNDER_REVIEW, AdStatus.STRATEGY_CREATED):
        raise HTTPException(
            status_code=400,
            detail="Creatives can only be generated after strategy creation.",
        )

    background_tasks.add_task(_bg_generate_creatives, ad_id, user.company_id)

    # Queue optimizer-change review — auto-deploys to Meta when ethics manager approves.
    if user.role == UserRole.PUBLISHER:
        db.add(Review(
            advertisement_id=ad_id,
            reviewer_id=user.id,
            review_type="optimizer",
            status="pending",
            comments="Optimizer regenerated ad creatives.",
            suggestions={"action": "regenerate_creative"},
        ))
        await db.flush()

    return ad


# ─── Meta Ad Management ───────────────────────────────────────────────────────

def _get_meta_conn_and_ids(ad, conn):
    """
    Extract Meta campaign_id, ad_ids, access_token, ad_account_id, page_id from an ad.
    Raises HTTPException if anything required is missing.
    """
    bot = ad.bot_config if isinstance(ad.bot_config, dict) else {}
    campaign_id = bot.get("meta_campaign_id")
    ad_ids = bot.get("meta_ad_ids", [])

    if not campaign_id:
        raise HTTPException(
            status_code=400,
            detail="No Meta campaign found for this advertisement. Distribute it to Meta first.",
        )
    if not conn:
        raise HTTPException(
            status_code=400,
            detail="Meta account not connected. Connect it in Platform Settings.",
        )
    if not conn.ad_account_id or not conn.page_id:
        raise HTTPException(
            status_code=400,
            detail="Select an Ad Account and Facebook Page in Platform Settings.",
        )
    return campaign_id, ad_ids, conn.access_token, conn.ad_account_id, conn.page_id


@router.get("/{ad_id}/meta-ads")
async def list_meta_ads(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    List all Meta ads for this campaign, fetched live from the Meta API.
    Returns id, name, status (ACTIVE/PAUSED/DELETED), and creative details (headline, body, image_hash, link).
    """
    from app.services.meta_ads_service import MetaAdsService
    from app.models.models import PlatformConnection

    ad_result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = ad_result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    conn_result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.company_id == user.company_id,
            PlatformConnection.platform == "meta",
        )
    )
    conn = conn_result.scalar_one_or_none()
    campaign_id, _, access_token, ad_account_id, _ = _get_meta_conn_and_ids(ad, conn)

    svc = MetaAdsService(access_token=access_token, ad_account_id=ad_account_id)
    try:
        ads = await svc.get_ads(campaign_id)
    except Exception as exc:
        logger.error("Meta get_ads failed for ad %s: %s", ad_id, exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc))
    finally:
        await svc.close()

    bc_list = ad.bot_config if isinstance(ad.bot_config, dict) else {}
    return {
        "campaign_id": campaign_id,
        "adset_id": bc_list.get("meta_adset_id"),
        "ads": ads,
    }


@router.patch("/{ad_id}/meta-ads/{meta_ad_id}")
async def update_meta_ad(
    ad_id: str,
    meta_ad_id: str,
    body: dict,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Update a Meta ad.

    To toggle status:
      {"status": "ACTIVE" | "PAUSED"}

    To update creative copy (all fields required when editing creative):
      {"headline": "...", "body": "...", "cta_type": "LEARN_MORE",
       "link_url": "https://...", "image_hash": "...", "page_id": "..."}

    page_id and image_hash are returned by GET /meta-ads and do not need to be re-fetched manually.
    """
    from app.services.meta_ads_service import MetaAdsService
    from app.models.models import PlatformConnection

    ad_result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = ad_result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    conn_result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.company_id == user.company_id,
            PlatformConnection.platform == "meta",
        )
    )
    conn = conn_result.scalar_one_or_none()
    _, _, access_token, ad_account_id, page_id_default = _get_meta_conn_and_ids(ad, conn)

    bot        = ad.bot_config if isinstance(ad.bot_config, dict) else {}
    adset_id   = bot.get("meta_adset_id")
    campaign_id_stored = bot.get("meta_campaign_id")

    svc = MetaAdsService(access_token=access_token, ad_account_id=ad_account_id)
    try:
        status = (body.get("status") or "").upper()
        if status in ("ACTIVE", "PAUSED"):
            result = await svc.update_ad_status(meta_ad_id, status)
            # When activating an ad, the parent ad set AND campaign must also be
            # ACTIVE — otherwise Meta won't deliver even if the ad itself is ACTIVE.
            if status == "ACTIVE":
                if adset_id:
                    try:
                        await svc.update_ad_status(adset_id, "ACTIVE")
                    except Exception as e:
                        logger.warning("Could not activate ad set %s: %s", adset_id, e)
                if campaign_id_stored:
                    try:
                        await svc.update_ad_status(campaign_id_stored, "ACTIVE")
                    except Exception as e:
                        logger.warning("Could not activate campaign %s: %s", campaign_id_stored, e)
        elif body.get("headline") or body.get("body"):
            # Creative text update — requires image_hash + page_id
            image_hash = body.get("image_hash", "")
            if not image_hash:
                raise HTTPException(status_code=422, detail="image_hash is required when updating creative text.")
            result = await svc.update_ad_creative(
                meta_ad_id=meta_ad_id,
                page_id=body.get("page_id") or page_id_default,
                image_hash=image_hash,
                headline=body.get("headline", ""),
                body=body.get("body", ""),
                cta_type=(body.get("cta_type") or "BOOK_NOW").upper(),
                link_url=body.get("link_url", ""),
                ad_name=ad.title,
            )
        else:
            raise HTTPException(status_code=422, detail="Provide status (ACTIVE|PAUSED) or creative fields (headline, body).")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Meta update_ad failed for meta_ad %s: %s", meta_ad_id, exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc))
    finally:
        await svc.close()

    return result


@router.post("/{ad_id}/meta-budget")
async def update_meta_budget(
    ad_id: str,
    body: dict,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Update the daily budget on the campaign's Meta ad set.
    Body: {"daily_budget_usd": 2.50}
    Also persists the new budget value to the local advertisement record.
    """
    from app.services.meta_ads_service import MetaAdsService
    from app.models.models import PlatformConnection

    daily_budget_usd = body.get("daily_budget_usd")
    if daily_budget_usd is None:
        raise HTTPException(status_code=422, detail="daily_budget_usd is required")
    try:
        daily_budget_usd = float(daily_budget_usd)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="daily_budget_usd must be a number")
    if daily_budget_usd <= 0:
        raise HTTPException(status_code=422, detail="daily_budget_usd must be positive")

    ad_result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = ad_result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    conn_result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.company_id == user.company_id,
            PlatformConnection.platform == "meta",
        )
    )
    conn = conn_result.scalar_one_or_none()
    _, _, access_token, ad_account_id, _ = _get_meta_conn_and_ids(ad, conn)

    bc_budget = ad.bot_config if isinstance(ad.bot_config, dict) else {}
    adset_id = bc_budget.get("meta_adset_id")
    if not adset_id:
        raise HTTPException(status_code=400, detail="No Meta ad set found for this campaign. Upload to Meta first.")

    svc = MetaAdsService(access_token=access_token, ad_account_id=ad_account_id)
    try:
        result = await svc.update_adset_budget(adset_id, daily_budget_usd)
    except Exception as exc:
        logger.error("Meta update_adset_budget failed for adset %s: %s", adset_id, exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc))
    finally:
        await svc.close()

    # Persist locally so the UI reflects the new budget
    ad.budget = daily_budget_usd
    await db.flush()

    return {"adset_id": adset_id, "daily_budget_usd": daily_budget_usd, "meta_result": result}


@router.delete("/{ad_id}/meta-ads/{meta_ad_id}", status_code=204)
async def delete_meta_ad(
    ad_id: str,
    meta_ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a Meta ad. Also removes it from the campaign's stored meta_ad_ids list.
    """
    from app.services.meta_ads_service import MetaAdsService
    from app.models.models import PlatformConnection
    from sqlalchemy.orm.attributes import flag_modified

    ad_result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = ad_result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    conn_result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.company_id == user.company_id,
            PlatformConnection.platform == "meta",
        )
    )
    conn = conn_result.scalar_one_or_none()
    _, _, access_token, ad_account_id, _ = _get_meta_conn_and_ids(ad, conn)

    svc = MetaAdsService(access_token=access_token, ad_account_id=ad_account_id)
    try:
        await svc.delete_ad(meta_ad_id)
    except Exception as exc:
        logger.error("Meta delete_ad failed for meta_ad %s: %s", meta_ad_id, exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc))
    finally:
        await svc.close()

    # Remove from stored ad_ids list
    bot = dict(ad.bot_config if isinstance(ad.bot_config, dict) else {})
    existing_ids = bot.get("meta_ad_ids", [])
    bot["meta_ad_ids"] = [i for i in existing_ids if i != meta_ad_id]
    ad.bot_config = bot
    flag_modified(ad, "bot_config")
    await db.commit()


@router.get("/{ad_id}/meta-insights")
async def get_meta_insights(
    ad_id: str,
    date_preset: str = "last_30d",
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch daily performance insights from Meta and persist them in AdAnalytics.
    Each day's row is upserted by (advertisement_id, date_label, source='meta').
    Returns the structured daily data directly for charting.

    date_preset: last_7d | last_14d | last_30d | last_90d
    """
    from app.services.meta_ads_service import MetaAdsService
    from app.models.models import PlatformConnection, AdAnalytics
    from sqlalchemy.orm.attributes import flag_modified

    ad_result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = ad_result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    conn_result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.company_id == user.company_id,
            PlatformConnection.platform == "meta",
        )
    )
    conn = conn_result.scalar_one_or_none()
    campaign_id, _, access_token, ad_account_id, _ = _get_meta_conn_and_ids(ad, conn)

    svc = MetaAdsService(access_token=access_token, ad_account_id=ad_account_id)
    try:
        raw_rows = await svc.get_insights(campaign_id, date_preset=date_preset)
    except Exception as exc:
        logger.error("Meta get_insights failed for ad %s: %s", ad_id, exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc))
    finally:
        await svc.close()

    # Parse and upsert daily rows into AdAnalytics
    result_rows = []
    for row in raw_rows:
        date_label = row.get("date_start", "")
        impressions = int(row.get("impressions", 0) or 0)
        clicks      = int(row.get("clicks", 0) or 0)
        spend       = float(row.get("spend", 0) or 0)
        reach       = int(row.get("reach", 0) or 0)
        cpm         = float(row.get("cpm", 0) or 0)
        cpc         = float(row.get("cpc", 0) or 0)
        # Count link click actions as conversions
        actions = row.get("actions") or []
        actions = actions if isinstance(actions, list) else []
        conversions = sum(
            int(a.get("value", 0) or 0)
            for a in actions
            if isinstance(a, dict) and a.get("action_type") in ("offsite_conversion.fb_pixel_lead", "link_click")
        )
        click_rate = round(clicks / impressions * 100, 4) if impressions else 0.0

        # Upsert: find existing row by date_label + source
        existing_result = await db.execute(
            select(AdAnalytics).where(
                AdAnalytics.advertisement_id == ad_id,
                AdAnalytics.date_label == date_label,
                AdAnalytics.source == "meta",
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            existing.impressions = impressions
            existing.views       = impressions
            existing.click_rate  = click_rate
            existing.conversions = conversions
            existing.spend       = spend
            existing.reach       = reach
            existing.cpm         = cpm
            existing.cost_per_click = cpc
        else:
            entry = AdAnalytics(
                advertisement_id=ad_id,
                date_label=date_label,
                source="meta",
                impressions=impressions,
                views=impressions,
                click_rate=click_rate,
                conversions=conversions,
                spend=spend,
                reach=reach,
                cpm=cpm,
                cost_per_click=cpc,
            )
            db.add(entry)

        result_rows.append({
            "date": date_label,
            "impressions": impressions,
            "clicks": clicks,
            "spend": spend,
            "reach": reach,
            "cpm": cpm,
            "cpc": cpc,
            "conversions": conversions,
            "click_rate": click_rate,
        })

    await db.commit()
    return {"date_preset": date_preset, "rows": result_rows, "campaign_id": campaign_id}


@router.get("/{ad_id}/schedule-suggestions")
async def get_schedule_suggestions(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Use Claude to suggest optimal ad scheduling (best times to run/pause, days, budget pacing)
    based on the campaign's strategy, target audience, and available performance data.
    """
    import json as _json
    from app.core.bedrock import get_async_client, get_model

    ad_result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = ad_result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    from app.models.models import AdAnalytics as _AdAnalytics
    analytics_result = await db.execute(
        select(_AdAnalytics)
        .where(_AdAnalytics.advertisement_id == ad_id)
        .order_by(_AdAnalytics.recorded_at.desc())
        .limit(30)
    )
    analytics = analytics_result.scalars().all()

    strategy = ad.strategy_json if isinstance(ad.strategy_json, dict) else {}
    kpis     = strategy.get("kpis", [])
    audience = ad.target_audience if isinstance(ad.target_audience, dict) else {}
    recent_perf = [
        {
            "date": a.date_label,
            "impressions": a.impressions,
            "clicks": a.views,
            "ctr": a.click_rate,
            "spend": a.spend,
        }
        for a in analytics if a.source == "meta"
    ][:10]

    prompt = f"""You are a Meta advertising strategy expert specialising in healthcare clinical trial recruitment.

Campaign: {ad.title}
Target Audience: {_json.dumps(audience)}
Strategy KPIs: {_json.dumps(kpis)}
Trial Duration: {ad.duration or "not set"}
Budget: ${ad.budget or "not set"}/total

Recent performance (last {len(recent_perf)} days of Meta data):
{_json.dumps(recent_perf, indent=2) if recent_perf else "No Meta data available yet — use healthcare audience best practices."}

Based on this context, provide concrete scheduling recommendations in JSON with this structure:
{{
  "best_days": ["Monday", "Tuesday", ...],
  "best_hours": ["9am-11am", "7pm-9pm", ...],
  "pause_periods": ["Saturday afternoon", "Sunday morning", ...],
  "budget_pacing": "Front-load budget in first 2 weeks to build audience momentum",
  "headline_tips": ["Use urgency language Mon-Wed", "..."],
  "reasoning": "2-3 sentence explanation",
  "confidence": "high|medium|low"
}}

Return ONLY valid JSON, no markdown or explanation."""

    client = get_async_client()
    try:
        msg = await client.messages.create(
            model=get_model(),
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        suggestions = _json.loads(raw)
    except Exception as exc:
        logger.warning("Schedule suggestions Claude call failed: %s", exc)
        # Sensible healthcare fallback
        suggestions = {
            "best_days": ["Monday", "Tuesday", "Wednesday", "Thursday"],
            "best_hours": ["9am–11am", "12pm–1pm", "7pm–9pm"],
            "pause_periods": ["Saturday night", "Sunday morning"],
            "budget_pacing": "Distribute budget evenly across weekdays; reduce by 40% on weekends.",
            "headline_tips": ["Lead with patient benefit on Mon–Wed", "Use urgency copy Thu–Fri"],
            "reasoning": "Healthcare audiences engage highest on weekday mornings and evenings. Weekend engagement drops significantly for clinical trial ads.",
            "confidence": "medium",
        }

    return {"ad_id": ad_id, "suggestions": suggestions}


# ─── Bot Configuration ────────────────────────────────────────────────────────

async def _user_from_query_token_ads(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Auth via ?token= for browser-opened URLs (same as documents.py pattern)."""
    from app.core.security import decode_token
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


@router.get("/{ad_id}/documents/{doc_id}/file")
async def serve_protocol_document_file(
    ad_id: str,
    doc_id: str,
    user: User = Depends(_user_from_query_token_ads),
    db: AsyncSession = Depends(get_db),
):
    """Stream a campaign protocol document file. Auth via ?token= query param."""
    result = await db.execute(
        select(AdvertisementDocument).where(
            AdvertisementDocument.id == doc_id,
            AdvertisementDocument.advertisement_id == ad_id,
            AdvertisementDocument.company_id == user.company_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.file_path:
        raise HTTPException(status_code=404, detail="No file attached to this document")

    relative = doc.file_path.lstrip("/").removeprefix("uploads/")
    disk_path = os.path.normpath(os.path.join(BACKEND_ROOT, "uploads", relative))

    if not os.path.exists(disk_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    media_type, _ = mimetypes.guess_type(disk_path)
    return FileResponse(path=disk_path, media_type=media_type or "application/octet-stream")


@router.get("/{ad_id}/website")
async def serve_website(
    ad_id: str,
    download: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """
    Serve the generated HTML landing page — public, no auth required.
    The page contains no secrets or PII; it is safe to share as a Meta Ads redirect URL.
    ?download=true → Content-Disposition: attachment (triggers browser download).
    """
    from fastapi.responses import HTMLResponse, Response
    import os as _os

    result = await db.execute(
        select(Advertisement).where(Advertisement.id == ad_id)
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    if not ad.output_url:
        raise HTTPException(status_code=404, detail="No website has been generated for this campaign yet")

    # output_url is "/outputs/<company_id>/<ad_id>/website/index.html"
    # Strip the leading "/outputs/" and resolve against OUTPUT_DIR
    from app.core.config import settings as _s
    relative  = ad.output_url.lstrip("/").removeprefix("outputs/")
    disk_path = _os.path.join(_s.OUTPUT_DIR, relative)

    if not _os.path.exists(disk_path):
        raise HTTPException(status_code=404, detail="Website file not found on disk")

    with open(disk_path, "r", encoding="utf-8") as f:
        html_content = f.read()

    if download:
        return Response(
            content=html_content,
            media_type="text/html",
            headers={"Content-Disposition": 'attachment; filename="landing-page.html"'},
        )
    return HTMLResponse(content=html_content)


@router.post("/{ad_id}/generate-website", response_model=AdvertisementOut)
async def generate_website(
    ad_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.PUBLISHER, UserRole.PROJECT_MANAGER, UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Kick off async website generation. Returns immediately.
    Frontend polls GET /{ad_id} for output_url to appear.
    """
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    if ad.status not in (AdStatus.APPROVED, AdStatus.PUBLISHED, AdStatus.UNDER_REVIEW, AdStatus.STRATEGY_CREATED):
        raise HTTPException(
            status_code=400,
            detail="Website can only be generated after strategy creation.",
        )

    background_tasks.add_task(_bg_generate_website, ad_id, user.company_id)

    # Queue optimizer-change review — auto-deploys (re-hosts website) when ethics manager approves.
    if user.role == UserRole.PUBLISHER:
        db.add(Review(
            advertisement_id=ad_id,
            reviewer_id=user.id,
            review_type="optimizer",
            status="pending",
            comments="Optimizer regenerated website content.",
            suggestions={"action": "regenerate_website"},
        ))
        await db.flush()

    return ad


# ─── Host Landing Page ────────────────────────────────────────────────────────

@router.post("/{ad_id}/host-page", response_model=AdvertisementOut)
async def host_page(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Copy the generated website HTML into static/pages/<ad_id>/index.html so it is
    publicly accessible at /static/pages/<ad_id>/index.html without auth.

    Requires the landing page to have been generated first (output_url must be set).
    """
    from app.core.config import settings
    import shutil

    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    if not ad.output_url:
        raise HTTPException(
            status_code=400,
            detail="Landing page has not been generated yet. Generate the website first.",
        )

    # Source: outputs/<company_id>/<ad_id>/website/index.html
    src = os.path.join(settings.OUTPUT_DIR, user.company_id, ad_id, "website", "index.html")
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail="Generated website file not found on disk.")

    # Destination: static/pages/<ad_id>/index.html
    dest_dir = os.path.join(settings.STATIC_DIR, "pages", ad_id)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, "index.html")
    shutil.copy2(src, dest)

    hosted_url = f"/static/pages/{ad_id}/index.html"
    ad.hosted_url = hosted_url
    await db.commit()
    await db.refresh(ad)
    return ad


# ─── Reviewer: Minor Edit ─────────────────────────────────────────────────────

@router.post("/{ad_id}/minor-edit", response_model=AdvertisementOut)
async def minor_edit_strategy(
    ad_id: str,
    body: MinorEditRequest,
    user: User = Depends(require_roles([UserRole.PUBLISHER, UserRole.PROJECT_MANAGER, UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Patch a single field in strategy_json and record an audit-trail system review.
    field is a dot-path, e.g. "executive_summary" or "messaging.core_message".
    """
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    if not ad.strategy_json:
        raise HTTPException(status_code=400, detail="No strategy to edit")

    # Apply the dot-path patch
    strategy = dict(ad.strategy_json if isinstance(ad.strategy_json, dict) else {})
    keys = body.field.split(".")
    node = strategy
    for key in keys[:-1]:
        if key not in node or not isinstance(node[key], dict):
            node[key] = {}
        node = node[key]
    node[keys[-1]] = body.new_value
    ad.strategy_json = strategy
    flag_modified(ad, "strategy_json")

    # Audit review
    audit = Review(
        advertisement_id=ad_id,
        reviewer_id=user.id,
        review_type="system",
        status="pending",
        comments=f"{body.field} changed from '{body.old_value[:120]}' to '{body.new_value[:120]}'",
    )
    db.add(audit)

    # If a publisher changes creative/website fields via the optimizer,
    # queue an optimizer-change review for the ethics dashboard.
    # Campaign stays PUBLISHED; new content auto-deploys when ethics manager approves.
    creative_fields = {"caption", "content_note", "ad_caption", "hashtags"}
    if user.role == UserRole.PUBLISHER and body.field in creative_fields:
        db.add(Review(
            advertisement_id=ad_id,
            reviewer_id=user.id,
            review_type="optimizer",
            status="pending",
            comments=f"field:{body.field}",
            suggestions={"field": body.field, "new_value": body.new_value, "old_value": body.old_value},
        ))

    await db.flush()
    return ad


# ─── Reviewer: AI Re-Strategy ─────────────────────────────────────────────────

async def _bg_rewrite_strategy(
    ad_id: str,
    company_id: str,
    reviewer_id: str,
    instructions: str,
    restore_status: AdStatus,
) -> None:
    """
    Background task: rewrite strategy with Curator, then restore the campaign to
    exactly the status it had before the rewrite so no role hand-off is needed.
    On failure, also restores original status so the campaign is not stuck in OPTIMIZING.
    """
    from app.db.database import async_session_factory
    try:
        async with async_session_factory() as db:
            result = await db.execute(select(Advertisement).where(Advertisement.id == ad_id))
            ad = result.scalar_one_or_none()
            if not ad:
                return

            company_docs_result = await db.execute(
                select(CompanyDocument).where(CompanyDocument.company_id == company_id)
            )
            protocol_docs_result = await db.execute(
                select(AdvertisementDocument).where(
                    AdvertisementDocument.advertisement_id == ad_id,
                    AdvertisementDocument.company_id == company_id,
                )
            )
            all_docs = sorted(
                list(company_docs_result.scalars().all()) + list(protocol_docs_result.scalars().all()),
                key=lambda d: d.priority, reverse=True,
            )

            # Step 1: regenerate strategy
            curator = CuratorService(db, company_id)
            strategy = await curator.generate_strategy(ad, all_docs, extra_instructions=instructions)
            ad.strategy_json = strategy
            flag_modified(ad, "strategy_json")

            preview = instructions[:120] + ("…" if len(instructions) > 120 else "")
            db.add(Review(
                advertisement_id=ad_id,
                reviewer_id=reviewer_id,
                review_type="system",
                status="pending",
                comments=f"AI Re-Strategy completed: '{preview}'",
            ))

            # Restore campaign to exactly the state it was in before the rewrite
            # (STRATEGY_CREATED, UNDER_REVIEW, or ETHICS_REVIEW). This keeps the
            # campaign in the same role's queue without any extra hand-offs.
            ad.status = restore_status

            await db.commit()
    except Exception as e:
        logger.error("Background rewrite-strategy failed for ad %s: %s", ad_id, e, exc_info=True)
        # Restore original status so the campaign isn't stuck in OPTIMIZING
        try:
            from app.db.database import async_session_factory as _sf
            async with _sf() as db2:
                result = await db2.execute(select(Advertisement).where(Advertisement.id == ad_id))
                ad = result.scalar_one_or_none()
                if ad and ad.status == AdStatus.OPTIMIZING:
                    ad.status = restore_status
                    await db2.commit()
        except Exception:
            pass


@router.post("/{ad_id}/rewrite-strategy", response_model=AdvertisementOut)
async def rewrite_strategy(
    ad_id: str,
    body: RewriteStrategyRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_roles([UserRole.PROJECT_MANAGER, UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Kick off async strategy rewrite. Returns immediately with status=optimizing.
    Frontend polls GET /{ad_id} until status returns to its previous value.
    """
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    _rewritable = (AdStatus.STRATEGY_CREATED, AdStatus.UNDER_REVIEW, AdStatus.ETHICS_REVIEW)
    if ad.status not in _rewritable:
        raise HTTPException(
            status_code=400,
            detail=f"Strategy can only be rewritten from STRATEGY_CREATED, UNDER_REVIEW, or ETHICS_REVIEW, not '{ad.status.value}'",
        )

    background_tasks.add_task(
        _bg_rewrite_strategy,
        ad_id,
        user.company_id,
        user.id,
        body.instructions,
        ad.status,
    )
    return ad


@router.delete("/{ad_id}", status_code=204)
async def delete_advertisement(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently delete a campaign and all its associated data:
      - Database record (cascades to reviews, documents, etc.)
      - ElevenLabs voice agent (if provisioned)
      - Generated output files on disk  (outputs/<company_id>/<ad_id>/)
      - Uploaded protocol documents     (uploads/docs/<company_id>/<ad_id>/)

    Note: externally-deployed websites (Vercel, Netlify, etc.) cannot be
    torn down automatically because deployment project IDs are not stored.
    The Publisher must manually remove those deployments from the platform.
    """
    import shutil

    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    # ── 1. Delete ElevenLabs voice agent (best-effort) ────────────────────────
    # TODO: verify ElevenLabs agent deletion is confirmed end-to-end in staging
    # REVIEW: should a failed agent deletion block the overall delete or stay non-fatal?
    bot_config = ad.bot_config if isinstance(ad.bot_config, dict) else {}
    if bot_config.get("elevenlabs_agent_id"):
        try:
            svc = VoicebotAgentService(db)
            await svc.delete_agent(ad_id)
            logger.info("Deleted ElevenLabs agent for ad %s", ad_id)
        except Exception as exc:
            # Non-fatal: log and continue — don't block deletion
            logger.warning("Could not delete ElevenLabs agent for ad %s: %s", ad_id, exc)

    # ── 2. Delete generated output files from disk ────────────────────────────
    # TODO: test cleanup when outputs/ is mounted as a Docker volume (see docker-compose.yml)
    # REVIEW: consider moving to async background task if file count is large
    outputs_dir = os.path.normpath(
        os.path.join(BACKEND_ROOT, "outputs", user.company_id, ad_id)
    )
    if os.path.isdir(outputs_dir):
        try:
            shutil.rmtree(outputs_dir)
            logger.info("Deleted output files at %s", outputs_dir)
        except Exception as exc:
            logger.warning("Could not delete output files for ad %s: %s", ad_id, exc)

    # ── 3. Delete uploaded protocol documents from disk ───────────────────────
    # TODO: test cleanup when uploads/ is mounted as a Docker volume (see docker-compose.yml)
    # REVIEW: confirm cascade also removes AdvertisementDocument DB rows (FK cascade must be set)
    docs_dir = os.path.normpath(
        os.path.join(BACKEND_ROOT, "uploads", "docs", user.company_id, ad_id)
    )
    if os.path.isdir(docs_dir):
        try:
            shutil.rmtree(docs_dir)
            logger.info("Deleted protocol docs at %s", docs_dir)
        except Exception as exc:
            logger.warning("Could not delete protocol docs for ad %s: %s", ad_id, exc)

    # ── 4. Delete DB record (cascades to reviews, documents, etc.) ────────────
    # TODO: add a soft-delete / archive option before hard-delete for audit trail retention
    # REVIEW: ensure all FK relationships have cascade="all, delete-orphan" in models.py
    # REVIEW: externally-deployed sites (Vercel/Netlify) are NOT taken down — store
    #         deployment project ID at publish time to enable programmatic teardown
    await db.delete(ad)
    await db.commit()


@router.patch("/{ad_id}/bot-config", response_model=AdvertisementOut)
async def update_bot_config(
    ad_id: str,
    body: BotConfigUpdate,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Advertisement).where(Advertisement.id == ad_id)
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    merged = dict(ad.bot_config if isinstance(ad.bot_config, dict) else {})
    merged.update(body.model_dump(exclude_unset=True))
    ad.bot_config = merged
    flag_modified(ad, "bot_config")
    await db.commit()
    return ad


# ─── Voice Agent Routes ───────────────────────────────────────────────────────

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


@router.post("/{ad_id}/voice-call/request")
async def request_voice_call(
    ad_id: str,
    body: VoiceCallRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger an outbound phone call to the user's cell via ElevenLabs.
    No auth required — embedded in published landing pages.

    Body: { "phone_number": "+15551234567", "action": "call_now" }
    """
    phone = body.phone_number
    if not phone:
        raise HTTPException(status_code=422, detail="phone_number is required")

    svc = VoicebotAgentService(db)
    try:
        result = await svc.outbound_call(ad_id, phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {e}")

    return {"status": "calling", "to": phone, "detail": result}


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
    ad = result.scalar_one_or_none()
    if not ad:
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
    No auth required — this endpoint is embedded in published landing pages.
    The signed URL expires after a short window set by ElevenLabs.
    """
    svc = VoicebotAgentService(db)
    try:
        signed_url = await svc.get_signed_url(ad_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {e}")
    return {"signed_url": signed_url}


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


@router.delete("/{ad_id}/voice-agent")
async def delete_voice_agent(
    ad_id: str,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """Delete the ElevenLabs agent for this campaign. Use when ending/archiving a voicebot."""
    svc = VoicebotAgentService(db)
    try:
        await svc.delete_agent(ad_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "deleted"}


# ─── Optimizer Changes (Ethics Review) ───────────────────────────────────────



@router.post("/{ad_id}/optimizer-changes/approve")
async def approve_optimizer_changes(
    ad_id: str,
    body: dict,
    user: User = Depends(require_roles([UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """
    Approve a set of optimizer changes for a campaign.
    Body: {"review_ids": ["id1", "id2", ...]}  — or omit to approve all pending.

    For each approved review, auto-deploys the change:
      - field update (caption/hashtags/etc) → already in strategy_json, no extra deploy needed
      - regenerate_website → triggers re-host of the already-generated HTML
      - regenerate_creative → triggers re-upload to Meta (if campaign is distributed)
    Marks each review as "approved".
    """
    review_ids = body.get("review_ids") or []

    ad_result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = ad_result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    # Load pending optimizer reviews
    q = select(Review).where(
        Review.advertisement_id == ad_id,
        Review.review_type == "optimizer",
        Review.status == "pending",
    )
    if review_ids:
        q = q.where(Review.id.in_(review_ids))
    reviews_result = await db.execute(q)
    pending = reviews_result.scalars().all()

    if not pending:
        raise HTTPException(status_code=404, detail="No pending optimizer changes found")

    deployed = []
    for review in pending:
        sugg_approve = review.suggestions if isinstance(review.suggestions, dict) else {}
        action = sugg_approve.get("action")
        field  = sugg_approve.get("field")

        if action == "regenerate_website":
            # Re-host the already-generated website HTML
            import shutil as _shutil
            from app.core.config import settings as _settings
            src = os.path.join(_settings.OUTPUT_DIR, user.company_id, ad_id, "website", "index.html")
            if os.path.exists(src):
                dest_dir = os.path.join(_settings.STATIC_DIR, "pages", ad_id)
                os.makedirs(dest_dir, exist_ok=True)
                _shutil.copy2(src, os.path.join(dest_dir, "index.html"))
                ad.hosted_url = f"/static/pages/{ad_id}/index.html"
                deployed.append("website re-hosted")
            else:
                deployed.append("website: no generated file found")

        elif action == "regenerate_creative":
            # Re-upload creatives to Meta for each existing Meta ad
            bot = ad.bot_config if isinstance(ad.bot_config, dict) else {}
            campaign_id = bot.get("meta_campaign_id")
            if campaign_id and ad.output_files:
                from app.models.models import PlatformConnection
                conn_result = await db.execute(
                    select(PlatformConnection).where(
                        PlatformConnection.company_id == user.company_id,
                        PlatformConnection.platform == "meta",
                    )
                )
                conn = conn_result.scalar_one_or_none()
                if conn:
                    background_tasks.add_task(
                        _bg_generate_creatives, ad_id, user.company_id
                    )
                    deployed.append("creatives queued for regeneration")
            else:
                deployed.append("creatives: no Meta campaign or no output files")

        elif field:
            new_val = sugg_approve.get("new_value")
            if new_val is not None:
                # The field was already written to strategy_json by /minor-edit when
                # the Publisher applied the suggestion. Re-write here to ensure it
                # persists even if the Review was created by a path that skipped it.
                strategy = dict(ad.strategy_json if isinstance(ad.strategy_json, dict) else {})
                keys = field.split(".")
                node = strategy
                for key in keys[:-1]:
                    node = node.setdefault(key, {})
                node[keys[-1]] = new_val
                ad.strategy_json = strategy
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(ad, "strategy_json")
                deployed.append(f"field '{field}' confirmed in strategy")
            else:
                deployed.append(f"field '{field}' — no new_value in suggestion")

        review.status = "approved"

    await db.flush()
    return {"approved": len(pending), "deployed": deployed}


@router.post("/{ad_id}/optimizer-changes/reject")
async def reject_optimizer_changes(
    ad_id: str,
    body: dict,
    user: User = Depends(require_roles([UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Reject a set of optimizer changes. Marks reviews as 'rejected' and reverts
    the staged field back to old_value in strategy_json (if available).
    Body: {"review_ids": ["id1", ...]}  — or omit to reject all pending.
    """
    review_ids = body.get("review_ids") or []

    ad_result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id,
            Advertisement.company_id == user.company_id,
        )
    )
    ad = ad_result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    q = select(Review).where(
        Review.advertisement_id == ad_id,
        Review.review_type == "optimizer",
        Review.status == "pending",
    )
    if review_ids:
        q = q.where(Review.id.in_(review_ids))
    reviews_result = await db.execute(q)
    pending = reviews_result.scalars().all()

    if not pending:
        raise HTTPException(status_code=404, detail="No pending optimizer changes found")

    strategy = dict(ad.strategy_json if isinstance(ad.strategy_json, dict) else {})
    modified = False
    for review in pending:
        sugg = review.suggestions if isinstance(review.suggestions, dict) else {}
        field     = sugg.get("field")
        old_value = sugg.get("old_value")
        if field and old_value is not None:
            keys = field.split(".")
            node = strategy
            for key in keys[:-1]:
                node = node.setdefault(key, {})
            node[keys[-1]] = old_value
            modified = True
        review.status = "rejected"

    if modified:
        ad.strategy_json = strategy
        flag_modified(ad, "strategy_json")

    await db.flush()
    return {"rejected": len(pending)}