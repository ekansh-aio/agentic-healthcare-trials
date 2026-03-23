"""
M3: Company Documents Routes
Owner: Backend Dev 2
Dependencies: M1, M2

CRUD for company documents — USP, Compliances, Policies, Marketing Goals, etc.
Used by Admin (My Company) and Ethics Reviewer (Document Updation).
"""

import os
import mimetypes
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.db.database import get_db
from app.models.models import User, UserRole, CompanyDocument
from app.schemas.schemas import DocumentCreate, DocumentOut, DocumentUpdate
from app.core.security import require_roles, get_current_user, decode_token
from app.services.storage import file_storage

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
    user: User = Depends(require_roles([UserRole.ADMIN, UserRole.ETHICS_REVIEWER])),
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
    user: User = Depends(require_roles([UserRole.ADMIN, UserRole.ETHICS_REVIEWER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a document with a file attachment.
    Accepts PDF, DOCX, DOC, TXT, MD.
    File is saved via the storage service — swap to Azure Blob by updating
    app/services/storage.py only.
    """
    if file.content_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Accepted: PDF, DOCX, DOC, TXT, MD.",
        )

    file_path = await file_storage.save(
        file=file,
        subfolder=f"docs/{user.company_id}",
        filename=file.filename,
    )

    doc = CompanyDocument(
        company_id=user.company_id,
        doc_type=doc_type,
        title=title,
        file_path=file_path,
    )
    db.add(doc)
    await db.flush()
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
    # Strip the leading "/uploads/" and join against the absolute uploads root.
    relative = doc.file_path.lstrip("/").removeprefix("uploads/")
    disk_path = os.path.join(_UPLOADS_ROOT, relative)

    if not os.path.exists(disk_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    media_type, _ = mimetypes.guess_type(disk_path)
    media_type = media_type or "application/octet-stream"

    return FileResponse(
        path=disk_path,
        media_type=media_type,
    )


@router.patch("/{doc_id}", response_model=DocumentOut)
async def update_document(
    doc_id: str,
    body: DocumentUpdate,
    user: User = Depends(require_roles([UserRole.ADMIN, UserRole.ETHICS_REVIEWER])),
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
    user: User = Depends(require_roles([UserRole.ADMIN])),
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