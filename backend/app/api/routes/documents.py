"""
M3: Company Documents Routes
Owner: Backend Dev 2
Dependencies: M1, M2

CRUD for company documents — USP, Compliances, Policies, Marketing Goals, etc.
Used by Study Coordinator (My Company) and Ethics Manager (Document Updation).
"""

import asyncio
import os
import mimetypes
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.db.database import get_db, async_session_factory
from app.models.models import User, UserRole, CompanyDocument
from app.schemas.schemas import DocumentCreate, DocumentOut, DocumentUpdate
from app.core.security import require_roles, get_current_user, decode_token
from app.services.storage import file_storage
from app.services.storage.extractor import extract_text, url_to_disk_path, BACKEND_ROOT

logger = logging.getLogger(__name__)


async def _background_train(company_id: str) -> None:
    """Re-train curator + reviewer skills after a company doc is uploaded."""
    async with async_session_factory() as db:
        try:
            from app.services.training.trainer import TrainingService
            await TrainingService(db).train_company_skills(company_id)
        except Exception as exc:
            logger.error("Background training failed for company %s: %s", company_id, exc)

router = APIRouter(prefix="/documents", tags=["Company Documents"])

# Absolute path to <backend_root>/uploads/ — mirrors the logic in storage.py
# so file serving always resolves to the same directory as file saving.
_BACKEND_ROOT = os.path.dirname(
    os.path.dirname(
        os.path.dirname(
            os.path.dirname(os.path.abspath(__file__))
        )
    )
)
_UPLOADS_ROOT = os.path.join(_BACKEND_ROOT, "uploads")

ALLOWED_DOC_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
}
ALLOWED_DOC_EXTENSIONS = {".pdf", ".doc", ".docx", ".txt", ".md"}


def _is_allowed_doc(file: UploadFile) -> bool:
    """Accept by content-type (ignoring charset param) OR by file extension."""
    base_ct = (file.content_type or "").split(";")[0].strip()
    ext = os.path.splitext(file.filename or "")[1].lower()
    return base_ct in ALLOWED_DOC_TYPES or ext in ALLOWED_DOC_EXTENSIONS


async def _user_from_query_token(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Auth dependency for the file-serve route, which is called directly by the
    browser (iframe src / anchor href) and cannot send an Authorization header.
    Validates the JWT from ?token= instead.

    When storage is migrated to Azure Blob Storage, serve_document_file will
    simply redirect to the blob SAS URL and this dependency can be removed.
    """
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


@router.get("/", response_model=List[DocumentOut])
async def list_documents(
    doc_type: str = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(CompanyDocument).where(CompanyDocument.company_id == user.company_id)
    if doc_type:
        query = query.where(CompanyDocument.doc_type == doc_type)
    result = await db.execute(query.order_by(CompanyDocument.priority.desc()))
    return result.scalars().all()


@router.post("/", response_model=DocumentOut)
async def create_document(
    body: DocumentCreate,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    doc = CompanyDocument(
        company_id=user.company_id,
        doc_type=body.doc_type,
        title=body.title,
        content=body.content,
    )
    db.add(doc)
    await db.flush()
    return doc


@router.post("/upload", response_model=DocumentOut)
async def upload_document(
    doc_type: str = Form(...),
    title: str = Form(...),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a document with a file attachment.
    Accepts PDF, DOCX, DOC, TXT, MD.
    Text is extracted immediately and stored in the content field so the
    Curator + Reviewer skills receive actual document text.
    Re-trains AI skills in the background after saving.
    """
    if not _is_allowed_doc(file):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Accepted: PDF, DOCX, DOC, TXT, MD.",
        )

    file_path = await file_storage.save(
        file=file,
        subfolder=f"docs/{user.company_id}",
        filename=file.filename,
    )

    disk_path = url_to_disk_path(file_path, BACKEND_ROOT)
    content   = await asyncio.to_thread(extract_text, disk_path)

    doc = CompanyDocument(
        company_id=user.company_id,
        doc_type=doc_type,
        title=title,
        content=content,
        file_path=file_path,
    )
    db.add(doc)
    await db.flush()

    background_tasks.add_task(_background_train, user.company_id)
    return doc


@router.get("/{doc_id}/file")
async def serve_document_file(
    doc_id: str,
    user: User = Depends(_user_from_query_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Stream the raw file back to the browser.
    Auth is via ?token= query param so iframe/anchor can load it directly.

    TODO (Azure migration): replace FileResponse with RedirectResponse to the
    blob SAS URL. Remove _user_from_query_token and validate via SAS instead.
    """
    result = await db.execute(
        select(CompanyDocument).where(
            CompanyDocument.id == doc_id,
            CompanyDocument.company_id == user.company_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.file_path:
        raise HTTPException(status_code=404, detail="No file attached to this document")

    # file_path stored as "/uploads/docs/<company_id>/filename.ext"
    # Use exact prefix removal (not lstrip) then resolve and boundary-check
    # to prevent path traversal attacks (e.g. ../../etc/passwd).
    stored = doc.file_path
    if stored.startswith("/uploads/"):
        relative = stored[len("/uploads/"):]
    elif stored.startswith("uploads/"):
        relative = stored[len("uploads/"):]
    else:
        raise HTTPException(status_code=400, detail="Invalid file path")

    uploads_base = Path(_UPLOADS_ROOT).resolve()
    disk_path = (uploads_base / relative).resolve()

    if not str(disk_path).startswith(str(uploads_base) + os.sep):
        raise HTTPException(status_code=403, detail="Access denied")

    if not disk_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    media_type, _ = mimetypes.guess_type(str(disk_path))
    media_type = media_type or "application/octet-stream"

    return FileResponse(
        path=str(disk_path),
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{disk_path.name}"'},
    )


@router.patch("/{doc_id}", response_model=DocumentOut)
async def update_document(
    doc_id: str,
    body: DocumentUpdate,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR, UserRole.ETHICS_MANAGER])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CompanyDocument).where(
            CompanyDocument.id == doc_id,
            CompanyDocument.company_id == user.company_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    doc.version += 1
    return doc


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    user: User = Depends(require_roles([UserRole.STUDY_COORDINATOR])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CompanyDocument).where(
            CompanyDocument.id == doc_id,
            CompanyDocument.company_id == user.company_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(doc)
    return {"detail": "Document deleted"}