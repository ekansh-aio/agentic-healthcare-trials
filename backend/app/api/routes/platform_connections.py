"""
Platform Connections — OAuth & stored credentials for social ad platforms.

Meta OAuth flow (popup-based, zero friction for the publisher):
  1. GET  /api/platform-connections/meta/oauth-url   → Facebook dialog URL
  2. GET  /api/platform-connections/meta/callback    → exchanges code → long-lived token,
                                                        stores in DB, closes popup via postMessage
  3. GET  /api/platform-connections/                 → list connections for this company
  4. GET  /api/platform-connections/meta/accounts    → ad accounts + pages (uses stored token)
  5. PATCH /api/platform-connections/meta            → save selected ad_account_id / page_id
  6. DELETE /api/platform-connections/meta           → disconnect

Token strategy:
  • Short-lived (2 hr) from OAuth → exchanged immediately for long-lived (~60 days).
  • Long-lived tokens auto-renew when used within their window.
  • `token_expires_at` is stored; frontend shows "Reconnect" warning when < 7 days remain.
  • Re-connecting via OAuth replaces the stored token (upsert).
"""

import logging
from datetime import datetime, timezone, timedelta

from jose import jwt as pyjwt
from jose.exceptions import JWTError
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_db
from app.models.models import PlatformConnection, User, UserRole
from app.core.security import require_roles

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/platform-connections", tags=["Platform Connections"])

# ─── Popup close HTML ─────────────────────────────────────────────────────────

def _popup_html(msg_type: str, message: str, extra: str = "") -> str:
    return f"""<!DOCTYPE html>
<html>
<head><title>Connecting…</title>
<style>body{{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb}}.box{{text-align:center;padding:32px;border-radius:12px;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.08)}}</style>
</head>
<body>
<div class="box">
  <p style="font-size:1.1rem;color:#111">{message}</p>
  <p style="font-size:.85rem;color:#888;margin-top:8px">This window will close automatically.</p>
</div>
<script>
  try {{
    window.opener && window.opener.postMessage(
      {{type: '{msg_type}', platform: 'meta'{extra}}}, '*'
    );
  }} catch(e) {{}}
  setTimeout(() => window.close(), 1200);
</script>
</body>
</html>"""


# ─── 1. OAuth URL ─────────────────────────────────────────────────────────────

@router.get("/meta/oauth-url")
async def get_meta_oauth_url(
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
):
    """Return the Facebook OAuth dialog URL. Opens in a popup on the frontend."""
    if not settings.META_APP_ID:
        raise HTTPException(
            status_code=503,
            detail="Meta app credentials are not configured on this server. "
                   "Set META_APP_ID and META_APP_SECRET in your .env file.",
        )

    # Encode user identity in a short-lived state token (10 min) for CSRF protection.
    # The callback is unauthenticated (it's a redirect from Facebook), so we carry
    # the user's company/user IDs through the state parameter instead of a session.
    state = pyjwt.encode(
        {
            "user_id": user.id,
            "company_id": user.company_id,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    scopes = ",".join([
        "ads_management",
        "ads_read",
        "pages_manage_ads",
        "pages_read_engagement",
        "pages_show_list",
        "business_management",
    ])

    url = (
        f"https://www.facebook.com/v21.0/dialog/oauth"
        f"?client_id={settings.META_APP_ID}"
        f"&redirect_uri={settings.META_OAUTH_REDIRECT_URI}"
        f"&scope={scopes}"
        f"&state={state}"
        f"&response_type=code"
    )
    return {"url": url}


# ─── 2. OAuth Callback ────────────────────────────────────────────────────────

@router.get("/meta/callback", response_class=HTMLResponse)
async def meta_oauth_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Facebook redirects here after the user grants permissions.
    Exchanges code → short-lived → long-lived token, upserts PlatformConnection,
    then returns HTML that sends a postMessage to the parent window and closes.
    """
    if error:
        msg = error_description or error
        return HTMLResponse(_popup_html("meta_oauth_error", f"Connection denied: {msg}"))

    if not code or not state:
        return HTMLResponse(_popup_html("meta_oauth_error", "Missing code or state parameter"))

    # Decode state JWT to recover user identity
    try:
        payload = pyjwt.decode(state, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id: str = payload["user_id"]
        company_id: str = payload["company_id"]
    except (JWTError, Exception):
        return HTMLResponse(_popup_html("meta_oauth_error", "Invalid or expired state — please try again"))

    try:
        from app.services.meta_ads_service import MetaAdsService

        # Step 1: code → short-lived user access token (2 hr)
        short_lived = MetaAdsService.exchange_code_for_token(
            code=code,
            app_id=settings.META_APP_ID,
            app_secret=settings.META_APP_SECRET,
            redirect_uri=settings.META_OAUTH_REDIRECT_URI,
        )

        # Step 2: short-lived → long-lived (~60 days, auto-renews on active use)
        long_lived, expires_in = MetaAdsService.exchange_for_long_lived_token(
            short_lived_token=short_lived,
            app_id=settings.META_APP_ID,
            app_secret=settings.META_APP_SECRET,
        )

        token_expires_at = (
            datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=expires_in)
        )

        # Step 3: fetch Meta user info
        meta_user = MetaAdsService.fetch_me(long_lived)
        meta_user_id = meta_user.get("id")

        # Upsert: one connection record per company per platform
        result = await db.execute(
            select(PlatformConnection).where(
                PlatformConnection.company_id == company_id,
                PlatformConnection.platform == "meta",
            )
        )
        conn = result.scalar_one_or_none()

        if conn:
            # Reconnect — update token but preserve selected ad_account / page
            conn.access_token = long_lived
            conn.token_expires_at = token_expires_at
            conn.meta_user_id = meta_user_id
            conn.user_id = user_id
        else:
            conn = PlatformConnection(
                company_id=company_id,
                user_id=user_id,
                platform="meta",
                access_token=long_lived,
                token_expires_at=token_expires_at,
                meta_user_id=meta_user_id,
            )
            db.add(conn)

        await db.commit()

    except Exception as exc:
        logger.error("Meta OAuth callback failed: %s", exc, exc_info=True)
        err_msg = str(exc)[:120]
        return HTMLResponse(_popup_html("meta_oauth_error", f"Connection failed: {err_msg}"))

    return HTMLResponse(_popup_html("meta_oauth_success", "Connected successfully!"))


# ─── 3. List connections ──────────────────────────────────────────────────────

@router.get("/")
async def list_connections(
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """Return all platform connections for this company."""
    result = await db.execute(
        select(PlatformConnection).where(PlatformConnection.company_id == user.company_id)
    )
    connections = result.scalars().all()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    return [
        {
            "id": c.id,
            "platform": c.platform,
            "meta_user_id": c.meta_user_id,
            "ad_account_id": c.ad_account_id,
            "ad_account_name": c.ad_account_name,
            "page_id": c.page_id,
            "page_name": c.page_name,
            "token_expires_at": c.token_expires_at.isoformat() if c.token_expires_at else None,
            "expires_soon": bool(
                c.token_expires_at and (c.token_expires_at - now).days < 7
            ),
        }
        for c in connections
    ]


# ─── 4. Fetch Meta ad accounts + pages ───────────────────────────────────────

@router.get("/meta/accounts")
async def list_meta_accounts(
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """
    Use the stored long-lived token to list the user's ad accounts and pages.
    Called once after connecting so the publisher can pick the right ones.
    """
    result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.company_id == user.company_id,
            PlatformConnection.platform == "meta",
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Meta account not connected")

    from app.services.meta_ads_service import MetaAdsService
    try:
        ad_accounts = MetaAdsService.fetch_ad_accounts(conn.access_token)
        pages = MetaAdsService.fetch_pages(conn.access_token)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"ad_accounts": ad_accounts, "pages": pages}


# ─── 5. Save selected ad account / page ──────────────────────────────────────

@router.patch("/meta")
async def update_meta_connection(
    body: dict,
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """Persist the publisher's selected ad account and/or page for Meta."""
    result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.company_id == user.company_id,
            PlatformConnection.platform == "meta",
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Meta account not connected")

    if "ad_account_id" in body:
        conn.ad_account_id = body["ad_account_id"]
    if "ad_account_name" in body:
        conn.ad_account_name = body["ad_account_name"]
    if "page_id" in body:
        conn.page_id = body["page_id"]
    if "page_name" in body:
        conn.page_name = body["page_name"]

    await db.commit()
    return {"ok": True}


# ─── 6. Disconnect ────────────────────────────────────────────────────────────

@router.delete("/meta")
async def disconnect_meta(
    user: User = Depends(require_roles([UserRole.PUBLISHER])),
    db: AsyncSession = Depends(get_db),
):
    """Remove the Meta connection for this company."""
    result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.company_id == user.company_id,
            PlatformConnection.platform == "meta",
        )
    )
    conn = result.scalar_one_or_none()
    if conn:
        await db.delete(conn)
        await db.commit()
    return {"ok": True}
