"""
Meta Marketing API Service
Handles publishing campaigns to Meta (Facebook/Instagram) via the Marketing API v21.0.

Full pipeline per distribute call:
  1. Upload image file → image_hash
  2. Create Campaign (OUTCOME_AWARENESS, starts PAUSED)
  3. Create Ad Set  (daily budget, geo targeting)
  4. Create Ad Creative (image + headline + body + CTA link)
  5. Create Ad (links ad set + creative, starts PAUSED)

Docs: https://developers.facebook.com/docs/marketing-apis
"""

import asyncio
import json
import base64
import logging
from pathlib import Path
from typing import Optional

import requests

logger = logging.getLogger(__name__)

META_API_VERSION = "v21.0"
META_BASE_URL = f"https://graph.facebook.com/{META_API_VERSION}"

# CTA text → Meta CTA type mapping
CTA_MAP = {
    "LEARN MORE":   "LEARN_MORE",
    "SIGN UP":      "SIGN_UP",
    "CONTACT US":   "CONTACT_US",
    "GET STARTED":  "GET_STARTED",
    "APPLY NOW":    "APPLY_NOW",
    "BOOK NOW":     "BOOK_NOW",
    "REGISTER":     "SIGN_UP",
    "JOIN NOW":     "SIGN_UP",
}


class MetaAdsService:
    def __init__(self, access_token: str, ad_account_id: str):
        self.access_token = access_token
        # Normalise: ensure the "act_" prefix is present
        self.ad_account_id = (
            ad_account_id if ad_account_id.startswith("act_")
            else f"act_{ad_account_id}"
        )

    async def close(self):
        pass

    # ─── OAuth helpers (static — no ad account needed) ────────────────────────

    @staticmethod
    def exchange_code_for_token(code: str, app_id: str, app_secret: str, redirect_uri: str) -> str:
        """Exchange an OAuth authorisation code for a short-lived user access token (2 hr)."""
        resp = requests.get(
            f"{META_BASE_URL}/oauth/access_token",
            params={
                "client_id": app_id,
                "client_secret": app_secret,
                "redirect_uri": redirect_uri,
                "code": code,
            },
            timeout=30,
        )
        body = resp.json()
        if "error" in body:
            err = body.get("error", {})
            msg = err.get("message") if isinstance(err, dict) else str(err)
            raise RuntimeError(f"Code exchange failed: {msg}")
        return body["access_token"]

    @staticmethod
    def exchange_for_long_lived_token(short_lived_token: str, app_id: str, app_secret: str) -> tuple:
        """
        Exchange a short-lived token for a long-lived user access token (~60 days).
        Returns (access_token, expires_in_seconds).
        Long-lived tokens auto-renew when used within the 60-day window.
        """
        resp = requests.get(
            f"{META_BASE_URL}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": app_id,
                "client_secret": app_secret,
                "fb_exchange_token": short_lived_token,
            },
            timeout=30,
        )
        body = resp.json()
        if "error" in body:
            err = body.get("error", {})
            msg = err.get("message") if isinstance(err, dict) else str(err)
            raise RuntimeError(f"Long-lived token exchange failed: {msg}")
        return body["access_token"], int(body.get("expires_in") or 5183944)  # default ~60 days

    @staticmethod
    def fetch_me(access_token: str) -> dict:
        """Fetch basic profile info (id, name) for the token owner."""
        resp = requests.get(
            f"{META_BASE_URL}/me",
            params={"fields": "id,name", "access_token": access_token},
            timeout=30,
        )
        body = resp.json()
        if "error" in body:
            raise RuntimeError(body["error"].get("message"))
        return body

    @staticmethod
    def fetch_ad_accounts(access_token: str) -> list:
        """List all ad accounts accessible to this user."""
        resp = requests.get(
            f"{META_BASE_URL}/me/adaccounts",
            params={
                "fields": "id,name,account_id,currency,account_status",
                "access_token": access_token,
            },
            timeout=30,
        )
        body = resp.json()
        if "error" in body:
            raise RuntimeError(body["error"].get("message"))
        return body.get("data", [])

    @staticmethod
    def fetch_pages(access_token: str) -> list:
        """
        List Facebook pages accessible to this user.
        Combines two sources:
          1. /me/accounts — pages where the user has a personal page role
          2. /me/businesses → owned_pages — pages owned by the user's Business Manager(s)
        Deduplicates by page ID.
        """
        pages: dict[str, dict] = {}

        # Source 1: personal page roles
        resp = requests.get(
            f"{META_BASE_URL}/me/accounts",
            params={"fields": "id,name,category", "access_token": access_token},
            timeout=30,
        )
        body = resp.json()
        if "error" in body:
            raise RuntimeError(body["error"].get("message"))
        for p in body.get("data", []):
            pages[p["id"]] = p

        # Source 2: Business Manager-owned pages
        biz_resp = requests.get(
            f"{META_BASE_URL}/me/businesses",
            params={"fields": "id,name,owned_pages{id,name,category}", "access_token": access_token},
            timeout=30,
        )
        biz_body = biz_resp.json()
        for biz in biz_body.get("data", []):
            op = biz.get("owned_pages")
            pages_data = op.get("data", []) if isinstance(op, dict) else []
            for p in pages_data:
                pages.setdefault(p["id"], p)

        return list(pages.values())

    # ─── Low-level helpers ─────────────────────────────────────────────────────

    def _url(self, path: str) -> str:
        return f"{META_BASE_URL}/{path}"

    def _raise_if_error(self, body: dict) -> None:
        if "error" in body:
            err = body["error"]
            logger.error("Meta API full error response: %s", body)
            raise RuntimeError(
                f"Meta API error {err.get('code')} ({err.get('error_subcode', '')}): "
                f"{err.get('message', 'Unknown error')} | "
                f"{err.get('error_user_msg', '')} | fbtrace: {err.get('fbtrace_id', '')}"
            )

    async def _post(self, path: str, data: dict) -> dict:
        """Form-encoded POST via requests in a thread pool."""
        payload = {**data, "access_token": self.access_token}
        url = self._url(path)

        def _sync_post() -> dict:
            resp = requests.post(url, data=payload, timeout=60)
            return resp.json()

        body = await asyncio.to_thread(_sync_post)
        self._raise_if_error(body)
        return body

    async def _get(self, path: str, params: Optional[dict] = None) -> dict:
        """GET request via requests in a thread pool."""
        all_params = {**(params or {}), "access_token": self.access_token}
        url = self._url(path)

        def _sync_get() -> dict:
            resp = requests.get(url, params=all_params, timeout=60)
            return resp.json()

        body = await asyncio.to_thread(_sync_get)
        self._raise_if_error(body)
        return body

    async def _delete_req(self, path: str) -> dict:
        """DELETE request via requests in a thread pool."""
        url = self._url(path)

        def _sync_delete() -> dict:
            resp = requests.delete(url, params={"access_token": self.access_token}, timeout=30)
            return resp.json()

        body = await asyncio.to_thread(_sync_delete)
        self._raise_if_error(body)
        return body

    # ─── Step 1: Upload image ──────────────────────────────────────────────────

    async def upload_image(self, disk_path: str) -> str:
        """Upload an image by base64 and return its image_hash."""
        path = Path(disk_path)
        if not path.exists():
            raise FileNotFoundError(f"Ad image not found on disk: {disk_path}")

        image_b64 = base64.b64encode(path.read_bytes()).decode()
        result = await self._post(
            f"{self.ad_account_id}/adimages",
            {"bytes": image_b64},
        )
        # Response: {"images": {"<filename>": {"hash": "...", ...}}}
        imgs = result.get("images") or {}
        images_dict = imgs if isinstance(imgs, dict) else {}
        for _fname, img_data in images_dict.items():
            return img_data["hash"]
        raise RuntimeError("Meta did not return an image hash")

    # ─── Step 2: Create Campaign ───────────────────────────────────────────────

    async def create_campaign(self, name: str) -> str:
        """Create a campaign (OUTCOME_TRAFFIC, ACTIVE) and return its ID."""
        result = await self._post(
            f"{self.ad_account_id}/campaigns",
            {
                "name": name,
                "objective": "OUTCOME_TRAFFIC",
                "status": "ACTIVE",
                # Required: JSON-encoded empty array for non-special campaigns
                "special_ad_categories": "[]",
                # Required when not using campaign budget optimisation (CBO)
                "is_adset_budget_sharing_enabled": "false",
            },
        )
        return result["id"]

    # ─── Step 3: Create Ad Set ─────────────────────────────────────────────────

    async def create_adset(
        self,
        campaign_id: str,
        name: str,
        daily_budget_cents: int,
        targeting_countries: list[str],
        page_id: str,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
    ) -> str:
        """Create an ad set (ACTIVE) and return its ID."""
        targeting = {
            "geo_locations": {"countries": targeting_countries or ["AU"]},
            "age_min": 18,
            "age_max": 65,
        }
        data: dict = {
            "name": name,
            "campaign_id": campaign_id,
            # Budget in account currency cents (USD → cents)
            "daily_budget": str(daily_budget_cents),
            "billing_event": "IMPRESSIONS",
            "optimization_goal": "LINK_CLICKS",
            "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
            "destination_type": "WEBSITE",
            "targeting": json.dumps(targeting),
            # Links this ad set to the Facebook Page — eliminates the manual
            # "which page?" prompt in Meta Ads Manager when activating.
            "promoted_object": json.dumps({"page_id": page_id}),
            "status": "ACTIVE",
        }
        if start_time:
            data["start_time"] = start_time
        if end_time:
            data["end_time"] = end_time

        result = await self._post(f"{self.ad_account_id}/adsets", data)
        return result["id"]

    # ─── Step 4: Create Ad Creative ───────────────────────────────────────────

    async def fetch_instagram_actor_id(self, page_id: str) -> Optional[str]:
        """
        Return the Instagram actor ID connected to a Facebook Page, or None.
        Used to pre-fill the Instagram placement so Meta Ads Manager doesn't
        ask for it manually when activating the campaign.
        """
        try:
            body = await self._get(
                page_id,
                params={"fields": "instagram_accounts{id}"},
            )
            ig = body.get("instagram_accounts")
            accounts = ig.get("data", []) if isinstance(ig, dict) else []
            if accounts:
                return accounts[0]["id"]
        except Exception as exc:
            logger.debug("Could not fetch Instagram actor for page %s: %s", page_id, exc)
        return None

    async def create_creative(
        self,
        name: str,
        page_id: str,
        image_hash: str,
        headline: str,
        body: str,
        cta_type: str,
        link_url: str,
        instagram_actor_id: Optional[str] = None,
        display_url: Optional[str] = None,
        addon_type: Optional[str] = None,   # "whatsapp" | "phone" | None
        addon_phone: Optional[str] = None,  # E.164 phone number
    ) -> str:
        """
        Create an ad creative and return its ID.

        addon_type controls the CTA / browser add-on:
          - "whatsapp" → WHATSAPP_MESSAGE CTA that opens wa.me/{number}
          - "phone"    → CALL_NOW CTA with a tel: link
          - None/""   → standard CTA (cta_type from caller)
        display_url, if provided, appears as the URL shown on the ad face
        (the 'caption' field) — separate from the click destination.
        """
        link_data: dict = {
            "image_hash": image_hash,
            "link": link_url,
            "message": body or "Learn more about this opportunity.",
            "name": headline,
        }

        # Display URL shown on the ad (e.g. "yourstudy.com")
        if display_url:
            link_data["caption"] = display_url

        # CTA / browser add-on
        if addon_type == "whatsapp" and addon_phone:
            raw = addon_phone.replace(" ", "").replace("-", "")
            wa_number = raw.lstrip("+")
            link_data["call_to_action"] = {
                "type": "WHATSAPP_MESSAGE",
                "value": {
                    "link": f"https://wa.me/{wa_number}",
                    "whatsapp_number": raw if raw.startswith("+") else f"+{wa_number}",
                },
            }
        elif addon_type == "phone" and addon_phone:
            raw = addon_phone.replace(" ", "").replace("-", "")
            link_data["call_to_action"] = {
                "type": "CALL_NOW",
                "value": {"link": f"tel:{raw}"},
            }
        else:
            link_data["call_to_action"] = {
                "type": cta_type,
                "value": {"link": link_url},
            }

        object_story_spec: dict = {
            "page_id": page_id,
            "link_data": link_data,
        }
        if instagram_actor_id:
            object_story_spec["instagram_actor_id"] = instagram_actor_id

        result = await self._post(
            f"{self.ad_account_id}/adcreatives",
            {
                "name": name,
                "object_story_spec": json.dumps(object_story_spec),
            },
        )
        return result["id"]

    # ─── Step 5: Create Ad ────────────────────────────────────────────────────

    async def create_ad(self, name: str, adset_id: str, creative_id: str) -> str:
        """Create the ad (ACTIVE) and return its ID."""
        result = await self._post(
            f"{self.ad_account_id}/ads",
            {
                "name": name,
                "adset_id": adset_id,
                "creative": json.dumps({"creative_id": creative_id}),
                "status": "ACTIVE",
            },
        )
        return result["id"]

    # ─── Ad Management ────────────────────────────────────────────────────────

    async def get_ads(self, campaign_id: str) -> list:
        """
        List all ads in a Meta campaign with their current status and creative details.
        Returns id, name, status, created_time, and creative (image_hash, headline, body, cta, link).
        """
        body = await self._get(
            f"{campaign_id}/ads",
            params={
                "fields": (
                    "id,name,status,created_time,"
                    "creative{id,name,image_hash,"
                    "object_story_spec{link_data{message,name,call_to_action{type},link}}}"
                ),
            },
        )
        return body.get("data", [])

    async def update_ad_status(self, meta_ad_id: str, status: str) -> dict:
        """
        Enable or pause an ad.
        status must be "ACTIVE" or "PAUSED".
        """
        if status not in ("ACTIVE", "PAUSED"):
            raise ValueError(f"Invalid ad status: {status!r}. Use ACTIVE or PAUSED.")
        return await self._post(meta_ad_id, {"status": status})

    async def update_adset_budget(self, adset_id: str, daily_budget_usd: float) -> dict:
        """Update the daily budget on an ad set. Meta expects the value in cents (integer)."""
        daily_budget_cents = int(round(daily_budget_usd * 100))
        return await self._post(adset_id, {"daily_budget": str(daily_budget_cents)})

    async def delete_ad(self, meta_ad_id: str) -> dict:
        """Permanently delete a Meta ad."""
        return await self._delete_req(meta_ad_id)

    async def update_ad_creative(
        self,
        meta_ad_id: str,
        page_id: str,
        image_hash: str,
        headline: str,
        body: str,
        cta_type: str,
        link_url: str,
        ad_name: str = "Updated Ad",
    ) -> dict:
        """
        Update an ad's headline / body text.
        Meta does not support in-place creative edits, so this:
          1. Creates a new ad creative with the updated copy.
          2. Points the ad to the new creative.
        Returns the updated ad object.
        """
        new_creative_id = await self.create_creative(
            name=f"{ad_name} – Updated Creative",
            page_id=page_id,
            image_hash=image_hash,
            headline=headline,
            body=body,
            cta_type=cta_type,
            link_url=link_url,
        )
        return await self._post(
            meta_ad_id,
            {"creative": json.dumps({"creative_id": new_creative_id})},
        )

    # ─── Insights ──────────────────────────────────────────────────────────────

    async def get_insights(
        self,
        campaign_id: str,
        date_preset: str = "last_30d",
        time_increment: int = 1,
    ) -> list:
        """
        Fetch daily performance insights for a campaign.
        date_preset: last_7d | last_14d | last_30d | last_90d | this_month | last_month
        time_increment: 1 = daily breakdown, "monthly" = monthly.
        Returns list of {date_start, date_stop, impressions, clicks, spend, reach, cpm, cpc, actions}.
        """
        body = await self._get(
            f"{campaign_id}/insights",
            params={
                "fields": "impressions,clicks,spend,reach,cpm,cpc,actions,date_start,date_stop",
                "date_preset": date_preset,
                "time_increment": str(time_increment),
                "limit": "90",
            },
        )
        return body.get("data", [])

    # ─── Orchestrator ─────────────────────────────────────────────────────────

    async def publish_campaign(
        self,
        campaign_name: str,
        page_id: str,
        creatives: list[dict],
        selected_indices: list[int],
        daily_budget_usd: float,
        destination_url: str,
        targeting_countries: list[str],
        backend_root: str,
        display_url: Optional[str] = None,
        addon_type: Optional[str] = None,
        addon_phone: Optional[str] = None,
        existing_campaign_id: Optional[str] = None,
    ) -> dict:
        """
        Full pipeline: images → campaign → ad set → creatives → ads.

        If existing_campaign_id is provided, reuses that campaign (preserving analytics
        history) but always creates a fresh adset — archived adsets cannot contain
        new active ads on Meta.

        All ads start ACTIVE and begin serving immediately.
        Returns campaign_id, adset_id, ad_ids, and a direct link to the Ads Manager.
        """
        to_publish = (
            [creatives[i] for i in selected_indices if i < len(creatives)]
            if selected_indices
            else creatives[:1]
        )
        if not to_publish:
            raise ValueError("No creatives available to publish")

        # Meta expects budget in account currency subunits (cents for USD).
        # Minimum enforced at 100 cents ($1.00).
        daily_budget_cents = max(100, int(daily_budget_usd * 100))

        if existing_campaign_id:
            logger.info("STEP 1: Reusing existing campaign %s", existing_campaign_id)
            campaign_id = existing_campaign_id
        else:
            logger.info("STEP 1: Creating campaign...")
            campaign_id = await self.create_campaign(campaign_name)
            logger.info("STEP 1 OK: campaign %s", campaign_id)

        # Fetch the Instagram actor connected to this page (best-effort — no hard failure).
        # Pre-filling this eliminates the manual Instagram-selection prompt in Ads Manager.
        logger.info("STEP 1b: Fetching Instagram actor for page %s...", page_id)
        instagram_actor_id = await self.fetch_instagram_actor_id(page_id)
        if instagram_actor_id:
            logger.info("STEP 1b OK: instagram_actor_id %s", instagram_actor_id)
        else:
            logger.info("STEP 1b: No connected Instagram account found — skipping Instagram placement")

        logger.info("STEP 2: Creating adset...")
        adset_id = await self.create_adset(
            campaign_id=campaign_id,
            name=f"{campaign_name} – Ad Set",
            daily_budget_cents=daily_budget_cents,
            targeting_countries=targeting_countries,
            page_id=page_id,
        )
        logger.info("STEP 2 OK: adset %s", adset_id)

        ad_ids = []
        for idx, creative in enumerate(to_publish):
            # Resolve image_url (/outputs/…) → absolute disk path
            image_url: str = creative.get("image_url", "")
            disk_path = str(Path(backend_root) / image_url.lstrip("/"))

            logger.info("STEP 3: Uploading image %s...", disk_path)
            image_hash = await self.upload_image(disk_path)
            logger.info("STEP 3 OK: image_hash %s", image_hash)

            cta_text = (creative.get("cta") or "Book Now").upper().strip()
            cta_type = CTA_MAP.get(cta_text, "BOOK_NOW")

            logger.info("STEP 4: Creating creative %d...", idx + 1)
            creative_id = await self.create_creative(
                name=f"{campaign_name} – Creative {idx + 1}",
                page_id=page_id,
                image_hash=image_hash,
                headline=creative.get("headline") or campaign_name,
                body=creative.get("body") or "",
                cta_type=cta_type,
                link_url=destination_url,
                instagram_actor_id=instagram_actor_id,
                display_url=display_url,
                addon_type=addon_type,
                addon_phone=addon_phone,
            )

            logger.info("STEP 4 OK: creative %s", creative_id)

            logger.info("STEP 5: Creating ad %d...", idx + 1)
            ad_id = await self.create_ad(
                name=f"{campaign_name} – Ad {idx + 1}",
                adset_id=adset_id,
                creative_id=creative_id,
            )
            ad_ids.append(ad_id)
            logger.info("STEP 5 OK: ad %s", ad_id)

        account_num = self.ad_account_id.replace("act_", "")
        ads_manager_url = (
            f"https://adsmanager.facebook.com/adsmanager/manage/campaigns"
            f"?act={account_num}&selected_campaign_ids={campaign_id}"
        )

        return {
            "campaign_id": campaign_id,
            "adset_id": adset_id,
            "ad_ids": ad_ids,
            "ads_manager_url": ads_manager_url,
            "status": "active",
            "note": "All ads created in ACTIVE state and begin serving immediately.",
        }
