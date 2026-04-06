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

_is_postgres = settings.DATABASE_URL.startswith("postgresql")
_connect_args = {"ssl": "require"} if _is_postgres else {}
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


async def _add_column_if_missing(conn, sql: str) -> None:
    """Run an ALTER TABLE ADD COLUMN, ignoring errors if the column already exists."""
    try:
        await conn.execute(__import__("sqlalchemy").text(sql))
    except Exception:
        pass  # column already exists or DB doesn't support IF NOT EXISTS


async def init_db():
    """Create all tables and apply lightweight column migrations.

    Explicit model import ensures Base.metadata is fully populated
    regardless of which routes happen to be loaded first.

    create_all handles fresh databases for both SQLite and PostgreSQL.
    The ALTER TABLE migrations below only apply when upgrading an existing
    PostgreSQL database that predates certain column additions.
    """
    import app.models.models  # noqa: F401 — registers all ORM classes on Base.metadata

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)

        if not _is_postgres:
            # SQLite: create_all creates new tables but does NOT alter existing ones.
            # Add missing columns via try/except (SQLite has no IF NOT EXISTS for ALTER TABLE).
            _sql = __import__("sqlalchemy").text

            _sqlite_cols = [
                "ALTER TABLE chat_sessions ADD COLUMN updated_at DATETIME;",
                "ALTER TABLE advertisement_documents ADD COLUMN content TEXT;",
                "ALTER TABLE advertisements ADD COLUMN campaign_category VARCHAR(64);",
                "ALTER TABLE advertisements ADD COLUMN questionnaire JSON;",
                "ALTER TABLE advertisements ADD COLUMN duration VARCHAR(128);",
                "ALTER TABLE advertisements ADD COLUMN trial_location JSON;",
                "ALTER TABLE advertisements ADD COLUMN patients_required INTEGER;",
                "ALTER TABLE advertisements ADD COLUMN trial_start_date DATE;",
                "ALTER TABLE advertisements ADD COLUMN trial_end_date DATE;",
                "ALTER TABLE advertisements ADD COLUMN hosted_url VARCHAR(1024);",
                "ALTER TABLE companies ADD COLUMN locations JSON;",
            ]
            for stmt in _sqlite_cols:
                try:
                    await conn.execute(_sql(stmt))
                except Exception:
                    pass  # column already exists

            # Migrate old role names to new ones.
            await conn.execute(_sql("UPDATE users SET role = 'STUDY_COORDINATOR' WHERE role = 'ADMIN';"))
            await conn.execute(_sql("UPDATE users SET role = 'PROJECT_MANAGER' WHERE role = 'REVIEWER';"))
            await conn.execute(_sql("UPDATE users SET role = 'ETHICS_MANAGER' WHERE role = 'ETHICS_REVIEWER';"))
            return

        # ── PostgreSQL upgrade migrations ─────────────────────────────────────
        _sql = __import__("sqlalchemy").text

        await _add_column_if_missing(conn,
            "ALTER TABLE advertisement_documents ADD COLUMN IF NOT EXISTS content TEXT;")
        await _add_column_if_missing(conn,
            "ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS campaign_category VARCHAR(64);")
        await _add_column_if_missing(conn,
            "ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS questionnaire JSON;")
        await _add_column_if_missing(conn,
            "ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS duration VARCHAR(128);")
        await _add_column_if_missing(conn,
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS locations JSON;")
        await _add_column_if_missing(conn,
            "ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS trial_location JSON;")
        await _add_column_if_missing(conn,
            "ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS patients_required INTEGER;")
        await _add_column_if_missing(conn,
            "ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS trial_start_date DATE;")
        await _add_column_if_missing(conn,
            "ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS trial_end_date DATE;")
        await _add_column_if_missing(conn,
            "ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS hosted_url VARCHAR(1024);")

        # chat_sessions unique index (safe to re-run — uses IF NOT EXISTS)
        try:
            await conn.execute(_sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_session "
                "ON chat_sessions (campaign_id, session_id);"
            ))
        except Exception:
            pass

        # Deduplicate skill_configs before adding unique constraint.
        try:
            await conn.execute(_sql("""
                DELETE FROM skill_configs
                WHERE id NOT IN (
                    SELECT DISTINCT ON (company_id, skill_type) id
                    FROM skill_configs
                    ORDER BY company_id, skill_type, version DESC, updated_at DESC
                );
            """))
        except Exception:
            pass

        # Unique constraint for ON CONFLICT upsert in trainer.py
        try:
            await conn.execute(_sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_skill_configs_company_skill "
                "ON skill_configs (company_id, skill_type);"
            ))
        except Exception:
            pass

        # Migrate userrole enum values (PostgreSQL enums only).
        for new_role in ("STUDY_COORDINATOR", "PROJECT_MANAGER", "ETHICS_MANAGER"):
            try:
                await conn.execute(_sql(
                    f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{new_role}';"
                ))
            except Exception:
                pass

        # Migrate old role names to new ones.
        await conn.execute(_sql(
            "UPDATE users SET role = 'STUDY_COORDINATOR' WHERE role = 'ADMIN';"
        ))
        await conn.execute(_sql(
            "UPDATE users SET role = 'PROJECT_MANAGER' WHERE role = 'REVIEWER';"
        ))
        await conn.execute(_sql(
            "UPDATE users SET role = 'ETHICS_MANAGER' WHERE role = 'ETHICS_REVIEWER';"
        ))
