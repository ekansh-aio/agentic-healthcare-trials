"""
Main Application Entry Point
Registers all route modules and initializes the database.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from app.db.database import init_db
from app.api.routes import auth, onboarding, users, advertisements, documents, analytics, brand_kit
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — create DB tables and ensure storage directories exist
    await init_db()
    os.makedirs(os.path.join(settings.STATIC_DIR, "logos"), exist_ok=True)
    os.makedirs(os.path.join(settings.UPLOAD_DIR, "logos"), exist_ok=True)
    os.makedirs(os.path.join(settings.UPLOAD_DIR, "docs"), exist_ok=True)
    yield
    # Shutdown (cleanup if needed)


app = FastAPI(
    title="Marketing Analytics Platform",
    description="AI-powered marketing automation with human-in-the-loop governance",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving — logos and brand assets under ./static/
os.makedirs(settings.STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=settings.STATIC_DIR), name="static")

# Upload file serving — documents and logos under ./uploads/
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# ─── Register Route Modules ──────────────────────────────────────────────────

app.include_router(auth.router,           prefix="/api")
app.include_router(onboarding.router,     prefix="/api")
app.include_router(users.router,          prefix="/api")
app.include_router(documents.router,      prefix="/api")
app.include_router(advertisements.router, prefix="/api")
app.include_router(analytics.router,      prefix="/api")
app.include_router(brand_kit.router,      prefix="/api")


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}