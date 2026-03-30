"""
M1: Database Configuration
Owner: Backend Dev 1
Dependencies: None

SQLAlchemy async setup with SQLite (swap to PostgreSQL for production).
"""

from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

_connect_args = {"ssl": "require"} if settings.DATABASE_URL.startswith("postgresql") else {}
engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG, connect_args=_connect_args)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency injection for FastAPI routes."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db():
    """Create all tables and apply lightweight column migrations.

    Explicit model import ensures Base.metadata is fully populated
    regardless of which routes happen to be loaded first.
    """
    import app.models.models  # noqa: F401 — registers all ORM classes on Base.metadata

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add content column to advertisement_documents if it was created before
        # this column was added to the model.
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE advertisement_documents "
                "ADD COLUMN IF NOT EXISTS content TEXT;"
            )
        )
        # Add campaign_category and questionnaire columns to advertisements
        # (added for recruitment/survey/hiring/clinical-trial questionnaire feature).
        _sql = __import__("sqlalchemy").text
        await conn.execute(_sql(
            "ALTER TABLE advertisements "
            "ADD COLUMN IF NOT EXISTS campaign_category VARCHAR(64);"
        ))
        await conn.execute(_sql(
            "ALTER TABLE advertisements "
            "ADD COLUMN IF NOT EXISTS questionnaire JSON;"
        ))
        await conn.execute(_sql(
            "ALTER TABLE advertisements "
            "ADD COLUMN IF NOT EXISTS duration VARCHAR(128);"
        ))
        # Deduplicate skill_configs before adding unique constraint.
        # Keeps the row with the highest version (latest training) per company+skill_type.
        await conn.execute(_sql("""
            DELETE FROM skill_configs
            WHERE id NOT IN (
                SELECT DISTINCT ON (company_id, skill_type) id
                FROM skill_configs
                ORDER BY company_id, skill_type, version DESC, updated_at DESC
            );
        """))
        # Add unique constraint required for ON CONFLICT upsert in trainer.py
        await conn.execute(_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_skill_configs_company_skill "
            "ON skill_configs (company_id, skill_type);"
        ))
        # Add locations column to companies if missing
        await conn.execute(_sql(
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS locations JSON;"
        ))
        # Add trial_location column to advertisements if missing
        await conn.execute(_sql(
            "ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS trial_location JSON;"
        ))
        # Migrate userrole enum: add new role values if they don't exist.
        # The DB was originally created with ADMIN/REVIEWER/ETHICS_REVIEWER/PUBLISHER.
        # The codebase now uses STUDY_COORDINATOR/PROJECT_MANAGER/ETHICS_MANAGER/PUBLISHER.
        for new_role in ("STUDY_COORDINATOR", "PROJECT_MANAGER", "ETHICS_MANAGER"):
            await conn.execute(_sql(
                f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{new_role}';"
            ))
        # Migrate existing users from old role names to new role names.
        await conn.execute(_sql(
            "UPDATE users SET role = 'STUDY_COORDINATOR' WHERE role = 'ADMIN';"
        ))
        await conn.execute(_sql(
            "UPDATE users SET role = 'PROJECT_MANAGER' WHERE role = 'REVIEWER';"
        ))
        await conn.execute(_sql(
            "UPDATE users SET role = 'ETHICS_MANAGER' WHERE role = 'ETHICS_REVIEWER';"
        ))
