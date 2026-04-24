"""
Main Application Entry Point
Registers all route modules and initializes the database.
"""

import asyncio
import os
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from app.db.database import init_db
from app.api.routes import auth, onboarding, users, documents, analytics, brand_kit, company
from app.api.routes import chat, survey_responses
from app.api.routes import platform_connections
from app.api.routes import bookings
from app.api.routes.advertisements import routers as _ad_routers
from app.core.config import settings
from app.services.meta_scheduler import run_pause_scheduler


async def _security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    # HSTS only makes sense when served over HTTPS — skip if no HTTPS configured.
    if not settings.DEBUG and os.getenv("ENABLE_HSTS", "false").lower() == "true":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # Hosted landing pages, the website preview, and document file endpoints
    # may be framed (PDF/text preview in an <iframe>) — skip X-Frame-Options.
    _path = request.url.path
    _frameable = (
        _path.startswith("/static/pages/") or
        _path.endswith("/website") or
        _path.endswith("/file")          # /{ad_id}/documents/{doc_id}/file and company doc files
    )
    if not _frameable:
        response.headers["X-Frame-Options"] = "DENY"
    return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — create DB tables and ensure storage directories exist
    await init_db()
    os.makedirs(os.path.join(settings.STATIC_DIR, "logos"), exist_ok=True)
    os.makedirs(os.path.join(settings.STATIC_DIR, "pages"), exist_ok=True)
    os.makedirs(os.path.join(settings.UPLOAD_DIR, "logos"), exist_ok=True)
    os.makedirs(os.path.join(settings.UPLOAD_DIR, "docs"), exist_ok=True)
    os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
    scheduler_task = asyncio.create_task(run_pause_scheduler())
    yield
    # Shutdown — cancel background scheduler gracefully
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Marketing Analytics Platform",
    description="AI-powered marketing automation with human-in-the-loop governance",
    version="1.0.0",
    lifespan=lifespan,
    # Hide API docs in production
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

app.middleware("http")(_security_headers)

# CORS — open to all origins.
# Real security is enforced by JWT on every request; CORS is browser-level only.
# allow_credentials must be False when allow_origins=["*"] (Starlette constraint).
# The frontend uses Authorization: Bearer <token>, not cookies, so credentials
# mode is never 'include' — False is correct here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Static file serving — logos and brand assets under ./static/
os.makedirs(settings.STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=settings.STATIC_DIR), name="static")

# Upload file serving — documents and logos under ./uploads/
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Output file serving — generated creatives under ./outputs/
os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
app.mount("/outputs", StaticFiles(directory=settings.OUTPUT_DIR), name="outputs")

# ─── Register Route Modules ──────────────────────────────────────────────────

app.include_router(auth.router,           prefix="/api")
app.include_router(onboarding.router,     prefix="/api")
app.include_router(users.router,          prefix="/api")
app.include_router(documents.router,      prefix="/api")
for _r in _ad_routers:
    app.include_router(_r, prefix="/api")
app.include_router(analytics.router,      prefix="/api")
app.include_router(brand_kit.router,      prefix="/api")
app.include_router(company.router,        prefix="/api")
app.include_router(chat.router,             prefix="/api")
app.include_router(bookings.router,         prefix="/api")
app.include_router(survey_responses.router, prefix="/api")
app.include_router(platform_connections.router,  prefix="/api")


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}


