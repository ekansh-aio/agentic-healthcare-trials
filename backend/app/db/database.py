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

if _is_postgres:
    _connect_args = {"ssl": "require"}
    _pool_kwargs  = {"pool_size": 10, "max_overflow": 20}
else:
    # SQLite on EFS: single-writer safe settings.
    # - timeout=30: retry busy-locked DB for up to 30s before raising
    # - check_same_thread=False: required for async (aiosqlite uses threads)
    # - journal_mode=DELETE (default): safe on NFS/EFS; WAL uses shm which
    #   breaks on network filesystems
    _connect_args = {"timeout": 30, "check_same_thread": False}
    _pool_kwargs  = {}

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args=_connect_args,
    **_pool_kwargs,
)

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


async def _run_migration(conn, sql: str) -> None:
    """Run a migration statement in a savepoint so a failure never aborts the outer transaction."""
    _text = __import__("sqlalchemy").text
    try:
        await conn.execute(_text("SAVEPOINT _mig"))
        await conn.execute(_text(sql))
        await conn.execute(_text("RELEASE SAVEPOINT _mig"))
    except Exception:
        try:
            await conn.execute(_text("ROLLBACK TO SAVEPOINT _mig"))
        except Exception:
            pass


# Keep old name as alias so nothing else breaks.
_add_column_if_missing = _run_migration




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
                "ALTER TABLE company_documents ADD COLUMN priority INTEGER DEFAULT 0;",
                "ALTER TABLE company_documents ADD COLUMN version INTEGER DEFAULT 1;",
                "ALTER TABLE advertisements ADD COLUMN campaign_category VARCHAR(64);",
                "ALTER TABLE advertisements ADD COLUMN special_instructions TEXT;",
                "ALTER TABLE advertisements ADD COLUMN questionnaire JSON;",
                "ALTER TABLE advertisements ADD COLUMN duration VARCHAR(128);",
                "ALTER TABLE advertisements ADD COLUMN trial_location JSON;",
                "ALTER TABLE advertisements ADD COLUMN patients_required INTEGER;",
                "ALTER TABLE advertisements ADD COLUMN trial_start_date DATE;",
                "ALTER TABLE advertisements ADD COLUMN trial_end_date DATE;",
                "ALTER TABLE advertisements ADD COLUMN hosted_url VARCHAR(1024);",
                "ALTER TABLE companies ADD COLUMN locations JSON;",
                # platform_connections: new table handled by create_all; these cover
                # any columns added after the initial table creation on existing DBs.
                "ALTER TABLE platform_connections ADD COLUMN meta_user_id VARCHAR(128);",
                "ALTER TABLE platform_connections ADD COLUMN ad_account_name VARCHAR(256);",
                "ALTER TABLE platform_connections ADD COLUMN page_name VARCHAR(256);",
                # ad_analytics: Meta-sourced insight columns
                "ALTER TABLE ad_analytics ADD COLUMN spend REAL;",
                "ALTER TABLE ad_analytics ADD COLUMN reach INTEGER;",
                "ALTER TABLE ad_analytics ADD COLUMN cpm REAL;",
                "ALTER TABLE ad_analytics ADD COLUMN date_label VARCHAR(32);",
                "ALTER TABLE ad_analytics ADD COLUMN source VARCHAR(16) DEFAULT 'local';",
                "ALTER TABLE optimizer_logs ADD COLUMN status VARCHAR(16) DEFAULT 'done';",
                "ALTER TABLE optimizer_logs ADD COLUMN context JSON;",
                "ALTER TABLE optimizer_logs ADD COLUMN human_decision VARCHAR(32);",
                "ALTER TABLE optimizer_logs ADD COLUMN applied_changes JSON;",
                # Voice session outbound call tracking
                "ALTER TABLE voice_sessions ADD COLUMN phone VARCHAR(32);",
                "ALTER TABLE voice_sessions ADD COLUMN survey_response_id VARCHAR;",
                # Conversation analysis results
                "ALTER TABLE voice_sessions ADD COLUMN call_analysis JSON;",
                "ALTER TABLE chat_sessions ADD COLUMN chat_analysis JSON;",
                "ALTER TABLE advertisements ADD COLUMN booking_config JSON;",
                # Appointment booking source tracking
                "ALTER TABLE appointments ADD COLUMN voice_session_id VARCHAR;",
                "ALTER TABLE appointments ADD COLUMN chat_session_id VARCHAR;",
            ]
            for stmt in _sqlite_cols:
                try:
                    await conn.execute(_sql(stmt))
                except Exception:
                    pass  # column already exists

            # Normalise role column to enum member NAMES (what SQLAlchemy stores).
            await conn.execute(_sql("UPDATE users SET role = 'STUDY_COORDINATOR' WHERE role IN ('ADMIN', 'study_coordinator');"))
            await conn.execute(_sql("UPDATE users SET role = 'PROJECT_MANAGER'   WHERE role IN ('REVIEWER', 'project_manager');"))
            await conn.execute(_sql("UPDATE users SET role = 'ETHICS_MANAGER'    WHERE role IN ('ETHICS_REVIEWER', 'ethics_manager');"))
            await conn.execute(_sql("UPDATE users SET role = 'PUBLISHER'         WHERE role = 'publisher';"))

            # Mark as onboarded any company that has at least one user but
            # onboarded=0 — these were locked out due to training failures.
            await conn.execute(_sql(
                "UPDATE companies SET onboarded = 1 WHERE onboarded = 0 "
                "AND id IN (SELECT DISTINCT company_id FROM users);"
            ))
            return

        # ── PostgreSQL upgrade migrations ─────────────────────────────────────
        _sql = __import__("sqlalchemy").text

        await _add_column_if_missing(conn,
            "ALTER TABLE advertisement_documents ADD COLUMN IF NOT EXISTS content TEXT;")
        await _add_column_if_missing(conn,
            "ALTER TABLE company_documents ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;")
        await _add_column_if_missing(conn,
            "ALTER TABLE company_documents ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;")
        await _add_column_if_missing(conn,
            "ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS campaign_category VARCHAR(64);")
        await _add_column_if_missing(conn,
            "ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS special_instructions TEXT;")
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
        await _add_column_if_missing(conn,
            "ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS meta_user_id VARCHAR(128);")
        await _add_column_if_missing(conn,
            "ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS ad_account_name VARCHAR(256);")
        await _add_column_if_missing(conn,
            "ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS page_name VARCHAR(256);")
        await _add_column_if_missing(conn,
            "ALTER TABLE ad_analytics ADD COLUMN IF NOT EXISTS spend FLOAT;")
        await _add_column_if_missing(conn,
            "ALTER TABLE ad_analytics ADD COLUMN IF NOT EXISTS reach INTEGER;")
        await _add_column_if_missing(conn,
            "ALTER TABLE ad_analytics ADD COLUMN IF NOT EXISTS cpm FLOAT;")
        await _add_column_if_missing(conn,
            "ALTER TABLE ad_analytics ADD COLUMN IF NOT EXISTS date_label VARCHAR(32);")
        await _add_column_if_missing(conn,
            "ALTER TABLE ad_analytics ADD COLUMN IF NOT EXISTS source VARCHAR(16) DEFAULT 'local';")
        await _add_column_if_missing(conn,
            "ALTER TABLE optimizer_logs ADD COLUMN IF NOT EXISTS status VARCHAR(16) DEFAULT 'done';")
        await _add_column_if_missing(conn,
            "ALTER TABLE optimizer_logs ADD COLUMN IF NOT EXISTS context JSON;")
        await _add_column_if_missing(conn,
            "ALTER TABLE optimizer_logs ADD COLUMN IF NOT EXISTS human_decision VARCHAR(32);")
        await _add_column_if_missing(conn,
            "ALTER TABLE optimizer_logs ADD COLUMN IF NOT EXISTS applied_changes JSON;")
        await _add_column_if_missing(conn,
            "ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS phone VARCHAR(32);")
        await _add_column_if_missing(conn,
            "ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS survey_response_id VARCHAR;")
        await _add_column_if_missing(conn,
            "ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS call_analysis JSON;")
        await _add_column_if_missing(conn,
            "ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS chat_analysis JSON;")
        await _add_column_if_missing(conn,
            "ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS booking_config JSON;")
        await _add_column_if_missing(conn,
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS voice_session_id VARCHAR;")

        # chat_sessions.campaign_id — added after initial table creation.
        await _run_migration(conn,
            "ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS campaign_id VARCHAR;")
        # Add FK constraint separately (IF NOT EXISTS on constraints needs PG15+, use DO block).
        await _run_migration(conn, """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'chat_sessions'::regclass
                      AND conname = 'chat_sessions_campaign_id_fkey'
                ) THEN
                    ALTER TABLE chat_sessions
                        ADD CONSTRAINT chat_sessions_campaign_id_fkey
                        FOREIGN KEY (campaign_id) REFERENCES advertisements(id) ON DELETE CASCADE;
                END IF;
            END $$;
        """)
        # Remove sessions that have no campaign_id (legacy rows before this column existed).
        await _run_migration(conn, "DELETE FROM chat_sessions WHERE campaign_id IS NULL;")

        # Recreate platform_connections FKs with ON DELETE CASCADE so that
        # deleting a company or user automatically removes their connections.
        await _run_migration(conn, """
            DO $$
            DECLARE _cn text;
            BEGIN
                SELECT conname INTO _cn FROM pg_constraint
                WHERE conrelid = 'platform_connections'::regclass AND contype = 'f'
                  AND confrelid = 'companies'::regclass;
                IF _cn IS NOT NULL AND _cn != 'platform_connections_company_id_fkey' THEN
                    EXECUTE 'ALTER TABLE platform_connections DROP CONSTRAINT ' || quote_ident(_cn);
                END IF;
            END $$;
        """)
        await _run_migration(conn, """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'platform_connections'::regclass
                      AND conname = 'platform_connections_company_id_fkey'
                ) THEN
                    ALTER TABLE platform_connections
                        ADD CONSTRAINT platform_connections_company_id_fkey
                        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
                END IF;
            END $$;
        """)
        await _run_migration(conn, """
            DO $$
            DECLARE _cn text;
            BEGIN
                SELECT conname INTO _cn FROM pg_constraint
                WHERE conrelid = 'platform_connections'::regclass AND contype = 'f'
                  AND confrelid = 'users'::regclass;
                IF _cn IS NOT NULL AND _cn != 'platform_connections_user_id_fkey' THEN
                    EXECUTE 'ALTER TABLE platform_connections DROP CONSTRAINT ' || quote_ident(_cn);
                END IF;
            END $$;
        """)
        await _run_migration(conn, """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'platform_connections'::regclass
                      AND conname = 'platform_connections_user_id_fkey'
                ) THEN
                    ALTER TABLE platform_connections
                        ADD CONSTRAINT platform_connections_user_id_fkey
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
                END IF;
            END $$;
        """)

        # chat_sessions unique index
        await _run_migration(conn,
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_session "
            "ON chat_sessions (campaign_id, session_id);")

        # Deduplicate skill_configs before adding unique constraint.
        await _run_migration(conn, """
            DELETE FROM skill_configs
            WHERE id NOT IN (
                SELECT DISTINCT ON (company_id, skill_type) id
                FROM skill_configs
                ORDER BY company_id, skill_type, version DESC, updated_at DESC
            );
        """)

        # Unique constraint for ON CONFLICT upsert in trainer.py
        await _run_migration(conn,
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_skill_configs_company_skill "
            "ON skill_configs (company_id, skill_type);")

        # Migrate userrole enum values (PostgreSQL enums only).
        # ALTER TYPE ... ADD VALUE cannot run inside a transaction block — use AUTOCOMMIT.
        async with engine.connect() as _ac:
            await _ac.execution_options(isolation_level="AUTOCOMMIT")
            for new_role in ("STUDY_COORDINATOR", "PROJECT_MANAGER", "ETHICS_MANAGER", "PUBLISHER"):
                try:
                    await _ac.execute(_sql(
                        f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{new_role}';"
                    ))
                except Exception:
                    pass  # value already exists
            # Add GENERATING to adstatus enum if it doesn't exist yet
            try:
                await _ac.execute(_sql("ALTER TYPE adstatus ADD VALUE IF NOT EXISTS 'generating';"))
            except Exception:
                pass

        # Normalise role column to enum member NAMES (what SQLAlchemy stores).
        await _run_migration(conn, "UPDATE users SET role = 'STUDY_COORDINATOR' WHERE role IN ('ADMIN', 'study_coordinator');")
        await _run_migration(conn, "UPDATE users SET role = 'PROJECT_MANAGER'   WHERE role IN ('REVIEWER', 'project_manager');")
        await _run_migration(conn, "UPDATE users SET role = 'ETHICS_MANAGER'    WHERE role IN ('ETHICS_REVIEWER', 'ethics_manager');")
        await _run_migration(conn, "UPDATE users SET role = 'PUBLISHER'         WHERE role = 'publisher';")
