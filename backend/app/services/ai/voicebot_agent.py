"""
ElevenLabs Voicebot Agent Service
Owner: AI Dev
Dependencies: M1 (models), M4 (SkillConfig)

Manages ElevenLabs Conversational AI agents for voicebot campaigns.
Each voicebot advertisement gets its own provisioned ElevenLabs agent.

Flow:
1. Publisher configures bot (voice, style, language, first message) via bot_config
2. provision_agent() creates/updates an ElevenLabs agent with system prompt from SKILL.md
3. Frontend calls get_signed_url() to get a short-lived WebSocket URL
4. Browser connects via ElevenLabs JS SDK — voice session runs fully in-browser
5. list_conversations() / get_conversation_transcript() fetch call history from ElevenLabs
"""

import httpx
import json
import logging
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import Advertisement, SkillConfig, Company, VoiceSession, CallTranscript, SurveyResponse
from app.core.bedrock import get_async_client, get_model, is_configured
from app.core.config import settings

logger = logging.getLogger(__name__)

ELEVENLABS_BASE = "https://api.elevenlabs.io"

# ── Australian conversational voice profiles ──────────────────────────────────
# All campaigns run Australian-accented voices on eleven_multilingual_v2.
# Profiles are ordered by warmth/suitability for healthcare/clinical trial calls.
#
# Voice settings per profile are tuned for clear turn detection and interruption handling:
#   stability       0.55 — more predictable pauses for better VAD detection
#   similarity_boost 0.80 — stays true to the voice character
#   style           0.35 — less expressive to reduce trailing audio artifacts
#   use_speaker_boost False — prevents volume bias in VAD interruption detection
#
# To find new voice IDs: ElevenLabs dashboard → Voice Library → filter "Australian"

AUSTRALIAN_VOICES = [
    {
        "id":     "XrExE9yKIg1WjnnlVkGX",
        "name":   "Matilda",
        "gender": "female",
        "style":  "warm",
        "traits": "Warm, bright, genuinely friendly. Sounds like a trusted friend — ideal for wellness, healthcare, empathetic outreach.",
        "settings": {"stability": 0.55, "similarity_boost": 0.82, "style": 0.35, "use_speaker_boost": False},
    },
    {
        "id":     "IKne3meq5aSn9XLyUdCD",
        "name":   "Charlie",
        "gender": "male",
        "style":  "casual",
        "traits": "Relaxed, conversational, approachable male. Sounds like a mate having a chat — ideal for younger audiences and casual campaigns.",
        "settings": {"stability": 0.55, "similarity_boost": 0.80, "style": 0.35, "use_speaker_boost": False},
    },
    {
        "id":     "FGY2WhTYpPnrIDTdsKH5",
        "name":   "Laura",
        "gender": "female",
        "style":  "upbeat",
        "traits": "Bright, upbeat, energetic. Sounds enthusiastic without being pushy — suits study recruitment with an optimistic angle.",
        "settings": {"stability": 0.55, "similarity_boost": 0.80, "style": 0.35, "use_speaker_boost": False},
    },
    {
        "id":     "iP95p4xoKVk53GoZ742B",
        "name":   "Chris",
        "gender": "male",
        "style":  "professional",
        "traits": "Clear, measured, professional male. Calm authority without sounding stiff — suits clinical and compliance-sensitive calls.",
        "settings": {"stability": 0.55, "similarity_boost": 0.82, "style": 0.35, "use_speaker_boost": False},
    },
    {
        "id":     "pFZP5JQG7iQjIQuC4Bku",
        "name":   "Aimee",
        "gender": "female",
        "style":  "friendly",
        "traits": "Clear, natural, youthful Australian female. Confident and personable — great for general outreach and study recruitment.",
        "settings": {"stability": 0.55, "similarity_boost": 0.82, "style": 0.35, "use_speaker_boost": False},
    },
]

# Style → voice lookup for recommend_voice
_STYLE_MAP = {
    "warm":         "Matilda",
    "casual":       "Charlie",
    "friendly":     "Aimee",
    "empathetic":   "Matilda",
    "upbeat":       "Laura",
    "energetic":    "Laura",
    "professional": "Chris",
    "formal":       "Chris",
    "clinical":     "Chris",
}

def _voice_by_name(name: str) -> Dict[str, Any]:
    for v in AUSTRALIAN_VOICES:
        if v["name"] == name:
            return v
    return AUSTRALIAN_VOICES[0]  # default: Matilda


def _voice_for_style(style: str) -> Dict[str, Any]:
    """Pick the best Australian voice for a given conversation style."""
    name = _STYLE_MAP.get((style or "").lower(), "Matilda")
    return _voice_by_name(name)


def _voice_for_country(country: str, prefer_gender: str = "female") -> Dict[str, Any]:
    """All campaigns use Australian voices. Gender preference applied where possible."""
    for v in AUSTRALIAN_VOICES:
        if v["gender"] == prefer_gender:
            return v
    return AUSTRALIAN_VOICES[0]


def _normalise_phone(phone: str) -> str:
    """Strip spaces/dashes/parens; keep leading +. Returns empty string if blank."""
    if not phone:
        return ""
    import re
    return re.sub(r"[\s\-().]+", "", phone)


class VoicebotAgentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self._headers = {
            "xi-api-key": settings.ELEVENLABS_API_KEY or "",
            "Content-Type": "application/json",
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────────

    async def provision_agent(self, advertisement_id: str) -> Dict[str, Any]:
        """
        Create or update the ElevenLabs agent for this voicebot campaign.
        Stores agent_id back into Advertisement.bot_config.
        Returns the agent object from ElevenLabs.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}

        # Fetch company name for first_message
        company_result = await self.db.execute(
            select(Company).where(Company.id == ad.company_id)
        )
        company = company_result.scalar_one_or_none()
        company_name = company.name if company else "our organization"

        system_prompt = await self._build_system_prompt(ad)
        payload = self._build_agent_payload(
            bot_config, system_prompt,
            trial_location=ad.trial_location,
            advertisement_id=advertisement_id,
            company_name=company_name,
            campaign_category=ad.campaign_category,
        )

        existing_agent_id = bot_config.get("elevenlabs_agent_id")

        if existing_agent_id:
            agent = await self._update_agent(existing_agent_id, payload)
            logger.info("Updated ElevenLabs agent %s for ad %s", existing_agent_id, advertisement_id)
        else:
            agent = await self._create_agent(payload)
            new_config = dict(bot_config)
            new_config["elevenlabs_agent_id"] = agent["agent_id"]
            ad.bot_config = new_config
            await self.db.commit()
            logger.info("Created ElevenLabs agent %s for ad %s", agent["agent_id"], advertisement_id)

        # Fetch and persist the actual E.164 phone number so the distribute form
        # can auto-fill it when setting the Meta ad CTA to "Phone call".
        if not bot_config.get("voice_phone_number"):
            try:
                async with httpx.AsyncClient() as _client:
                    details = await self._get_phone_number_details(_client)
                    if details.get("phone_number"):
                        refreshed = dict(ad.bot_config or {})
                        refreshed["voice_phone_number"] = details["phone_number"]
                        ad.bot_config = refreshed
                        await self.db.commit()
                        logger.info(
                            "Stored voice_phone_number %s for ad %s",
                            details["phone_number"], advertisement_id,
                        )
            except Exception as exc:
                logger.warning("Could not fetch ElevenLabs phone number for ad %s: %s", advertisement_id, exc)

        return agent

    async def _get_phone_number_details(self, client: httpx.AsyncClient) -> Dict[str, str]:
        """
        Return the phone number ID and actual E.164 number for outbound calls.
        Prefers ELEVENLABS_PHONE_NUMBER_ID env var; falls back to fetching
        the first configured phone number from the ElevenLabs account.
        Returns {"phone_number_id": "...", "phone_number": "+1234567890"}
        """
        resp = await client.get(
            f"{ELEVENLABS_BASE}/v1/convai/phone-numbers",
            headers=self._headers,
            timeout=15.0,
        )
        if not resp.is_success:
            raise ValueError(
                f"Could not fetch phone numbers from ElevenLabs ({resp.status_code}): {resp.text}"
            )
        data = resp.json()
        # API returns either a list or {"phone_numbers": [...]}
        numbers = data if isinstance(data, list) else data.get("phone_numbers", [])
        if not numbers:
            raise ValueError(
                "No phone numbers are configured in your ElevenLabs account. "
                "Go to ElevenLabs > Conversational AI > Phone Numbers and add one."
            )
        # If env var is set, find matching entry; otherwise use first
        target = numbers[0]
        if settings.ELEVENLABS_PHONE_NUMBER_ID:
            match = next(
                (n for n in numbers
                 if n.get("phone_number_id") == settings.ELEVENLABS_PHONE_NUMBER_ID
                 or n.get("id") == settings.ELEVENLABS_PHONE_NUMBER_ID),
                None,
            )
            if match:
                target = match

        return {
            "phone_number_id": target.get("phone_number_id") or target.get("id", ""),
            "phone_number":    target.get("phone_number", ""),
        }

    async def _get_phone_number_id(self, client: httpx.AsyncClient) -> str:
        """Return just the phone number ID (backwards-compat wrapper)."""
        details = await self._get_phone_number_details(client)
        return details["phone_number_id"]

    async def outbound_call(self, advertisement_id: str, to_number: str) -> Dict[str, Any]:
        """
        Trigger an outbound phone call from ElevenLabs to the given number.
        Creates a VoiceSession record immediately so the post-call webhook can
        find it by conversation_id and link the transcript to this participant.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}
        agent_id = bot_config.get("elevenlabs_agent_id")
        if not agent_id:
            raise ValueError(
                "No ElevenLabs agent provisioned for this campaign. "
                "Provision the agent first from the publisher dashboard."
            )

        async with httpx.AsyncClient() as client:
            phone_number_id = await self._get_phone_number_id(client)
            resp = await client.post(
                f"{ELEVENLABS_BASE}/v1/convai/twilio/outbound-call",
                headers=self._headers,
                json={
                    "agent_id": agent_id,
                    "agent_phone_number_id": phone_number_id,
                    "to_number": to_number,
                },
                timeout=30.0,
            )
            logger.info(
                "ElevenLabs outbound-call response status=%s body=%s",
                resp.status_code, resp.text[:500],
            )
            if not resp.is_success:
                raise ValueError(f"ElevenLabs outbound call failed ({resp.status_code}): {resp.text}")
            result = resp.json()

        # Validate the response actually confirms a call was initiated.
        conversation_id = (
            result.get("conversation_id")
            or result.get("callSid")
            or result.get("call_sid")
        )
        if not conversation_id:
            logger.error(
                "ElevenLabs outbound-call returned 200 but no conversation_id. "
                "Full response: %s", result
            )
            raise ValueError(
                "Call request was accepted but ElevenLabs did not return a conversation ID. "
                "Ensure your ElevenLabs account has a Twilio phone number configured under "
                "Conversational AI → Phone Numbers."
            )

        # Persist a VoiceSession so the post-call webhook can attach the transcript.
        session = VoiceSession(
            advertisement_id=advertisement_id,
            elevenlabs_conversation_id=conversation_id,
            phone=to_number,
            status="active",
            caller_metadata={"type": "outbound", "to": to_number},
        )
        self.db.add(session)

        # Try to link immediately to an existing SurveyResponse with the same phone.
        norm = _normalise_phone(to_number)
        if norm:
            sr_result = await self.db.execute(
                select(SurveyResponse).where(
                    SurveyResponse.advertisement_id == advertisement_id,
                    SurveyResponse.phone == norm,
                )
            )
            survey_resp = sr_result.scalars().first()
            if survey_resp:
                session.survey_response_id = survey_resp.id

        await self.db.commit()
        logger.info("Outbound call initiated to %s for ad %s, conversation_id=%s",
                    to_number, advertisement_id, conversation_id)
        return result

    async def get_signed_url(self, advertisement_id: str) -> str:
        """
        Return a short-lived signed WebSocket URL for the ElevenLabs browser SDK.
        The browser client uses this to start a voice session directly with ElevenLabs,
        so audio never passes through our servers.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}
        agent_id = bot_config.get("elevenlabs_agent_id")

        if not agent_id:
            raise ValueError(
                "No ElevenLabs agent provisioned for this campaign. "
                "Call POST /voice-agent first."
            )

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ELEVENLABS_BASE}/v1/convai/conversation/get-signed-url",
                headers=self._headers,
                params={"agent_id": agent_id},
                timeout=15.0,
            )
            resp.raise_for_status()
            return resp.json()["signed_url"]

    async def delete_agent(self, advertisement_id: str) -> bool:
        """
        Delete the ElevenLabs agent when a campaign is ended or deleted.
        Clears elevenlabs_agent_id from bot_config.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}
        agent_id = bot_config.get("elevenlabs_agent_id")

        if not agent_id:
            return True  # Nothing to delete

        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{ELEVENLABS_BASE}/v1/convai/agents/{agent_id}",
                headers=self._headers,
                timeout=15.0,
            )
            # 404 means already gone — treat as success
            if resp.status_code not in (200, 204, 404):
                resp.raise_for_status()

        new_config = {k: v for k, v in bot_config.items() if k != "elevenlabs_agent_id"}
        ad.bot_config = new_config
        await self.db.commit()
        logger.info("Deleted ElevenLabs agent %s for ad %s", agent_id, advertisement_id)
        return True

    async def list_conversations(
        self, advertisement_id: str, page_size: int = 20
    ) -> Dict[str, Any]:
        """
        Fetch past call conversations for this agent from ElevenLabs.
        Returns the raw ElevenLabs paginated response.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}
        agent_id = bot_config.get("elevenlabs_agent_id")

        if not agent_id:
            return {"conversations": [], "total_count": 0}

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ELEVENLABS_BASE}/v1/convai/conversations",
                headers=self._headers,
                params={"agent_id": agent_id, "page_size": page_size},
                timeout=15.0,
            )
            resp.raise_for_status()
            return resp.json()

    async def get_conversation_transcript(self, conversation_id: str) -> Dict[str, Any]:
        """
        Fetch the full transcript and metadata for a single conversation.
        Returns speaker turns, timestamps, and call outcome.
        """
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ELEVENLABS_BASE}/v1/convai/conversations/{conversation_id}",
                headers=self._headers,
                timeout=15.0,
            )
            resp.raise_for_status()
            return resp.json()

    async def get_conversation_analysis(self, conversation_id: str) -> dict:
        """
        Fetch transcript from ElevenLabs, run Claude analysis, and persist
        to the matching VoiceSession (by elevenlabs_conversation_id) if one exists.
        """
        from app.services.ai.conversation_analyzer import ConversationAnalysisService, _format_voice_transcript

        detail = await self.get_conversation_transcript(conversation_id)
        transcript_turns = detail.get("transcript") or []
        metadata = detail.get("metadata") or {}
        duration = metadata.get("call_duration_secs") or metadata.get("duration_seconds")

        if not transcript_turns:
            raise ValueError("No transcript available for this conversation")

        class _Turn:
            def __init__(self, role, text, idx):
                self.speaker = "agent" if role == "agent" else "user"
                self.text = text
                self.turn_index = idx

        turns = [_Turn(t.get("role", "user"), t.get("message", ""), i) for i, t in enumerate(transcript_turns)]
        transcript_text = _format_voice_transcript(turns, int(duration) if duration else None)

        svc = ConversationAnalysisService(self.db)
        analysis = await svc._call_claude(transcript_text)

        result = await self.db.execute(
            select(VoiceSession).where(VoiceSession.elevenlabs_conversation_id == conversation_id)
        )
        session = result.scalar_one_or_none()
        if session:
            session.call_analysis = analysis
            await self.db.commit()

        return analysis

    async def get_conversation_audio(self, conversation_id: str) -> bytes:
        """Fetch the audio recording for a conversation from ElevenLabs."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ELEVENLABS_BASE}/v1/convai/conversations/{conversation_id}/audio",
                headers=self._headers,
                timeout=30.0,
            )
            resp.raise_for_status()
            return resp.content

    async def sync_all_transcripts(self, advertisement_id: str) -> Dict[str, Any]:
        """
        Pull all completed conversations for this campaign from ElevenLabs,
        store transcripts in CallTranscript, and link sessions to SurveyResponse
        by phone number.  Called manually from the Participants tab.
        Returns {"synced": N, "skipped": M}.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}
        agent_id = bot_config.get("elevenlabs_agent_id")
        if not agent_id:
            return {"synced": 0, "skipped": 0, "error": "No ElevenLabs agent provisioned"}

        # Fetch conversation list from ElevenLabs (up to 100 most recent)
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ELEVENLABS_BASE}/v1/convai/conversations",
                headers=self._headers,
                params={"agent_id": agent_id, "page_size": 100},
                timeout=15.0,
            )
            resp.raise_for_status()
            conversations = resp.json().get("conversations", [])

        synced = 0
        skipped = 0
        for conv in conversations:
            conv_id = conv.get("conversation_id")
            if not conv_id:
                continue

            # Skip if we already have transcripts for this session
            existing = await self.db.execute(
                select(VoiceSession).where(VoiceSession.elevenlabs_conversation_id == conv_id)
            )
            session = existing.scalar_one_or_none()
            if session:
                transcript_check = await self.db.execute(
                    select(CallTranscript).where(CallTranscript.session_id == session.id).limit(1)
                )
                if transcript_check.scalar_one_or_none() is not None:
                    skipped += 1
                    continue

            # Fetch full conversation detail
            try:
                async with httpx.AsyncClient() as client:
                    detail_resp = await client.get(
                        f"{ELEVENLABS_BASE}/v1/convai/conversations/{conv_id}",
                        headers=self._headers,
                        timeout=15.0,
                    )
                    detail_resp.raise_for_status()
                    detail = detail_resp.json()
            except Exception as exc:
                logger.warning("Could not fetch conversation %s: %s", conv_id, exc)
                skipped += 1
                continue

            transcript_turns = detail.get("transcript") or []
            metadata = detail.get("metadata") or {}

            # Extract phone number — outbound calls have phone_number_to
            phone_call = metadata.get("phone_call") or {}
            phone_to = (
                phone_call.get("called_number")
                or phone_call.get("to")
                or metadata.get("phone_number_to")
                or metadata.get("to_number")
            )

            duration = metadata.get("call_duration_secs") or metadata.get("duration_seconds")
            try:
                duration = int(duration) if duration is not None else None
            except (TypeError, ValueError):
                duration = None

            status_raw = (detail.get("status") or conv.get("status") or "ended").lower()
            call_status = "failed" if status_raw in ("failed", "error") else "ended"

            # Ensure the VoiceSession is scoped to this advertisement
            if session is None:
                session = VoiceSession(
                    advertisement_id=advertisement_id,
                    elevenlabs_conversation_id=conv_id,
                    phone=_normalise_phone(phone_to) if phone_to else None,
                    status=call_status,
                    caller_metadata={"type": "outbound", "source": "manual_sync"},
                )
                self.db.add(session)
                await self.db.flush()

            await self.store_transcript_from_webhook(
                conversation_id=conv_id,
                transcript_turns=transcript_turns,
                phone_to=_normalise_phone(phone_to) if phone_to else None,
                duration_seconds=duration,
                status=call_status,
            )
            synced += 1

        logger.info("Manual transcript sync for ad %s: synced=%d skipped=%d", advertisement_id, synced, skipped)
        return {"synced": synced, "skipped": skipped}

    async def store_transcript_from_webhook(
        self,
        conversation_id: str,
        transcript_turns: list,
        phone_to: Optional[str],
        duration_seconds: Optional[int],
        status: str = "ended",
    ) -> VoiceSession:
        """
        Upsert a VoiceSession + CallTranscript rows from a webhook payload.
        Matches the VoiceSession by elevenlabs_conversation_id.
        Matches SurveyResponse by phone_to if no link exists yet.
        Returns the VoiceSession.
        """
        from datetime import datetime, timezone as _tz

        # Find existing session (created at call-start) or create one.
        res = await self.db.execute(
            select(VoiceSession).where(VoiceSession.elevenlabs_conversation_id == conversation_id)
        )
        session = res.scalar_one_or_none()

        if session is None:
            # Webhook arrived before or without our session record — create it now.
            session = VoiceSession(
                elevenlabs_conversation_id=conversation_id,
                advertisement_id="",   # filled below if we can find the agent mapping
                phone=phone_to,
                status=status,
                caller_metadata={"type": "outbound", "to": phone_to},
            )
            self.db.add(session)

        session.status = status
        session.ended_at = datetime.now(_tz.utc).replace(tzinfo=None)
        if duration_seconds is not None:
            session.duration_seconds = duration_seconds
        if phone_to and not session.phone:
            session.phone = phone_to

        # Delete stale transcripts before re-inserting (idempotent).
        from sqlalchemy import delete as _delete
        await self.db.execute(
            _delete(CallTranscript).where(CallTranscript.session_id == session.id)
        )
        await self.db.flush()   # make sure the delete is visible before inserts

        for idx, turn in enumerate(transcript_turns):
            role = turn.get("role", "").lower()
            speaker = "agent" if role in ("agent", "assistant") else "user"
            text = turn.get("message") or turn.get("text") or ""
            ts = turn.get("time_in_call_secs")
            ts_ms = int(ts * 1000) if ts is not None else None
            self.db.add(CallTranscript(
                session_id=session.id,
                speaker=speaker,
                text=text,
                turn_index=idx,
                timestamp_ms=ts_ms,
            ))

        # Link to SurveyResponse if not already linked.
        if not session.survey_response_id and phone_to and session.advertisement_id:
            norm = _normalise_phone(phone_to)
            sr_res = await self.db.execute(
                select(SurveyResponse).where(
                    SurveyResponse.advertisement_id == session.advertisement_id,
                    SurveyResponse.phone == norm,
                )
            )
            sr = sr_res.scalars().first()
            if sr:
                session.survey_response_id = sr.id

        await self.db.commit()
        logger.info("Stored transcript for conversation %s (%d turns)", conversation_id, len(transcript_turns))
        return session

    async def get_agent_status(self, advertisement_id: str) -> Dict[str, Any]:
        """
        Return current agent info from ElevenLabs (name, voice, status).
        Used by the Publisher UI to show provisioning status.
        """
        ad = await self._get_advertisement(advertisement_id)
        bot_config: Dict[str, Any] = ad.bot_config or {}
        agent_id = bot_config.get("elevenlabs_agent_id")

        if not agent_id:
            return {"provisioned": False}

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{ELEVENLABS_BASE}/v1/convai/agents/{agent_id}",
                headers=self._headers,
                timeout=15.0,
            )
            if resp.status_code == 404:
                return {"provisioned": False}
            resp.raise_for_status()
            data = resp.json()
            data["provisioned"] = True
            return data

    async def recommend_voice(self, advertisement_id: str) -> Dict[str, Any]:
        """
        Analyze the campaign's target audience and strategy using Claude,
        then recommend the best ElevenLabs voice profile.

        Returns:
            {
                "voice_id": str,
                "voice_name": str,
                "reason": str,          # 1-sentence explanation
                "conversation_style": str,
                "first_message": str,
            }
        """
        ad = await self._get_advertisement(advertisement_id)
        strategy = ad.strategy_json if isinstance(ad.strategy_json, dict) else {}
        target_audience = strategy.get("target_audience", {})
        messaging = strategy.get("messaging", {}) or {}
        executive_summary = strategy.get("executive_summary", "")

        # Fetch company name for first_message template
        company_result = await self.db.execute(
            select(Company).where(Company.id == ad.company_id)
        )
        company = company_result.scalar_one_or_none()
        company_name = company.name if company else "our organization"
        campaign_category = ad.campaign_category or "a health condition"

        voices_catalogue = [
            {"id": v["id"], "name": v["name"], "traits": v["traits"]}
            for v in AUSTRALIAN_VOICES
        ]

        prompt = f"""You are a voice casting expert for AI voice agents used in Australian clinical trial recruitment campaigns.

Campaign summary: {executive_summary}

Target audience:
{json.dumps(target_audience, indent=2)}

Messaging tone: {messaging.get("tone", "N/A")}
Core message: {messaging.get("core_message", "N/A")}

Available voices (all Australian accents):
{json.dumps(voices_catalogue, indent=2)}

Select the single best voice for this campaign.
Also suggest a conversation_style (one of: warm, friendly, casual, professional, empathetic, upbeat)
and a natural, human-like first_message the agent says when the person picks up.

The first_message must follow this exact standardized format:
- Start with: "Hi. This is [Bot name] from [company name]."
- Express gratitude: "Thanks a lot for expressing interest in our study."
- Engage warmly: "How are you doing today?"
- Keep it natural and conversational - no special audio tags needed
- Example: "Hi. This is Matilda from {company_name}. Thanks a lot for expressing interest in our study. How are you doing today?"

Respond with ONLY a valid JSON object, no markdown:
{{
  "voice_id": "<id from catalogue>",
  "voice_name": "<name>",
  "reason": "<one sentence explaining why this voice fits this audience>",
  "conversation_style": "<style>",
  "first_message": "<opening line with bracket audio tags and disfluencies>"
}}"""

        if not is_configured():
            tone = (messaging.get("tone") or "").lower()
            fallback = AUSTRALIAN_VOICES[1] if "casual" in tone or "young" in tone else AUSTRALIAN_VOICES[0]
            return {
                "voice_id": fallback["id"],
                "voice_name": fallback["name"],
                "reason": "Default recommendation — configure AI API for personalized suggestions.",
                "conversation_style": fallback["style"],
                "first_message": f"Hi. This is {fallback['name']} from {company_name}. Thanks a lot for expressing interest in our study. How are you doing today?",
            }

        client = get_async_client()
        response = await client.messages.create(
            model=get_model(),
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        # Strip markdown fences if Claude wrapped it
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]

        return json.loads(raw.strip())

    # ──────────────────────────────────────────────────────────────────────────
    # ElevenLabs REST helpers
    # ──────────────────────────────────────────────────────────────────────────

    async def _create_agent(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{ELEVENLABS_BASE}/v1/convai/agents/create",
                headers=self._headers,
                json=payload,
                timeout=30.0,
            )
            if not resp.is_success:
                raise ValueError(f"ElevenLabs {resp.status_code}: {resp.text}")
            return resp.json()

    async def _update_agent(self, agent_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"{ELEVENLABS_BASE}/v1/convai/agents/{agent_id}",
                headers=self._headers,
                json=payload,
                timeout=30.0,
            )
            if not resp.is_success:
                raise ValueError(f"ElevenLabs {resp.status_code}: {resp.text}")
            return resp.json()

    # ──────────────────────────────────────────────────────────────────────────
    # Payload builders
    # ──────────────────────────────────────────────────────────────────────────

    def _build_agent_payload(
        self,
        bot_config: Dict[str, Any],
        system_prompt: str,
        trial_location: Optional[list] = None,
        advertisement_id: Optional[str] = None,
        company_name: Optional[str] = None,
        campaign_category: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Map bot_config fields → ElevenLabs agent creation payload.

        bot_config keys consumed:
          voice_id           - ElevenLabs voice ID (overrides accent auto-select)
          first_message      - Agent's opening line
          language           - BCP-47 language code, e.g. "en", "en-US"
          bot_name           - Display name for the agent

        If voice_id is not set, the voice is auto-selected from the country in
        trial_location[0] so the accent matches the campaign's target region.
        """
        # Voice selection priority:
        #   1. bot_config.voice_id — publisher explicitly chose a voice
        #   2. Country-based accent matching from trial_location
        #   3. settings.ELEVENLABS_VOICE_ID — global fallback (last resort only)
        # Voice selection — always Australian profiles, style-matched to conversation_style
        conversation_style = bot_config.get("conversation_style", "warm")
        publisher_voice_id = bot_config.get("voice_id")

        if publisher_voice_id:
            # Publisher pinned a specific voice — find its profile for settings
            selected_profile = next(
                (v for v in AUSTRALIAN_VOICES if v["id"] == publisher_voice_id),
                AUSTRALIAN_VOICES[0],
            )
        else:
            # Auto-select by conversation style
            selected_profile = _voice_for_style(conversation_style)

        voice_id       = selected_profile["id"]
        voice_settings = selected_profile["settings"]
        logger.info("Voice selected: %s (%s) style=%s", selected_profile["name"], voice_id, conversation_style)

        voice_name = selected_profile["name"]

        # Build compliance-focused opening message
        org_name = company_name or "our organization"
        condition = campaign_category or "a health condition"

        default_first_message = (
            f"Hi. This is {voice_name} from {org_name}. "
            f"Thanks a lot for expressing interest in our study. "
            f"How are you doing today?"
        )
        first_message = bot_config.get("first_message") or default_first_message
        language = bot_config.get("language", "en")
        agent_name = bot_config.get("bot_name") or voice_name

        public_url = (settings.APP_PUBLIC_URL or "").rstrip("/")
        base = f"{public_url}/api/advertisements/{advertisement_id or ''}/voice-agent"

        # Tool 1 — check available slots for a date before presenting options to the caller
        check_slots_tool = {
            "type": "webhook",
            "name": "check_available_slots",
            "description": (
                "Check which appointment slots are available on a given date. "
                "Call this as soon as the caller mentions a preferred date — "
                "BEFORE asking them to pick a time. Use the returned list to "
                "present real options conversationally."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "The date the caller prefers. Use YYYY-MM-DD if known, or natural language like 'next Monday' or 'tomorrow'.",
                    },
                },
                "required": ["date"],
            },
            "url": f"{base}/check-slots",
            "method": "POST",
        }

        # Tool 2 — book the exact slot the caller confirmed
        booking_tool = {
            "type": "webhook",
            "name": "book_appointment",
            "description": (
                "Book the specific slot the caller has explicitly confirmed. "
                "Only call this AFTER check_available_slots has been called, "
                "the available times have been presented to the caller, and "
                "the caller has said which time they want."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "candidate_name":             {"type": "string", "description": "Full name of the candidate"},
                    "date":                       {"type": "string", "description": "Confirmed appointment date in YYYY-MM-DD format"},
                    "time":                       {"type": "string", "description": "Confirmed slot time in HH:MM 24-hour format, e.g. '10:00'"},
                    "candidate_phone":            {"type": "string", "description": "Candidate's phone number"},
                    "candidate_email":            {"type": "string", "description": "Candidate's email address if provided"},
                    "elevenlabs_conversation_id": {"type": "string", "description": "The current ElevenLabs conversation ID (use system.conversation_id)"},
                    "notes":                      {"type": "string", "description": "Any extra context from the conversation"},
                },
                "required": ["candidate_name", "date", "time"],
            },
            "url": f"{base}/book-slot",
            "method": "POST",
        }

        tools = [check_slots_tool, booking_tool] if public_url else []

        payload: Dict[str, Any] = {
            "name": agent_name,
            "conversation_config": {
                "agent": {
                    "prompt": {
                        "prompt": system_prompt,
                        "llm": "claude-3-7-sonnet",
                        "temperature": 0.7,
                        "tools": tools,
                    },
                    "first_message": first_message,
                    "language": language,
                },
                "tts": {
                    "voice_id":     voice_id,
                    "model_id":     settings.ELEVENLABS_TTS_MODEL,
                    # eleven_flash_v2 is already ~75ms — no streaming optimisation needed.
                    # Setting this > 0 with flash causes audio to start before turn detection
                    # settles, producing overlap with the user's speech.
                    "optimize_streaming_latency": 0,
                    "voice_settings": voice_settings,
                },
                "asr": {
                    "quality": "high",
                    "user_input_audio_format": "pcm_16000",
                },
                "turn_detection": {
                    "type":               "server_vad",
                    "threshold":          settings.ELEVENLABS_VAD_THRESHOLD,
                    "prefix_padding_ms":  settings.ELEVENLABS_PREFIX_PADDING_MS,
                    "silence_duration_ms": settings.ELEVENLABS_SILENCE_MS,
                },
                "conversation": {
                    "max_duration_seconds": 1800,
                },
            },
        }

        return payload

    async def _build_system_prompt(self, ad: Advertisement, allow_audio_tags: bool = False) -> str:
        """
        Build the ElevenLabs agent system prompt with full campaign context.

        Sections injected (matching the agreed context table):
          - Identity & tone
          - Trial facts (title, category, location, dates, duration, summary)
          - Target audience & messaging (for guidance only — not to recite)
          - Eligibility criteria (inclusion / exclusion)
          - Screening questionnaire (agent walks through conversationally)
          - Approved FAQs (may quote verbatim)
          - Ethical / compliance guardrails (enforced silently)
          - Voice rules
        """
        company_result = await self.db.execute(
            select(Company).where(Company.id == ad.company_id)
        )
        company = company_result.scalar_one_or_none()
        company_name = company.name     if company else "our company"
        industry     = company.industry if company else "our industry"

        skill_result = await self.db.execute(
            select(SkillConfig).where(
                SkillConfig.company_id == ad.company_id,
                SkillConfig.skill_type == "voicebot",
            )
        )
        skill = skill_result.scalar_one_or_none()

        # ── Pull campaign fields ──────────────────────────────────────────────
        bot_config  : Dict[str, Any] = ad.bot_config   if isinstance(ad.bot_config,   dict) else {}
        strategy    : Dict[str, Any] = ad.strategy_json if isinstance(ad.strategy_json, dict) else {}
        website_reqs: Dict[str, Any] = ad.website_reqs  if isinstance(ad.website_reqs,  dict) else {}
        messaging   : Dict[str, Any] = strategy.get("messaging") or {}
        messaging = messaging if isinstance(messaging, dict) else {}

        publisher_voice_id = bot_config.get("voice_id")
        _voice_profile = (
            next((v for v in AUSTRALIAN_VOICES if v["id"] == publisher_voice_id), AUSTRALIAN_VOICES[0])
            if publisher_voice_id
            else _voice_for_style(bot_config.get("conversation_style", "warm"))
        )
        bot_name   = bot_config.get("bot_name") or bot_config.get("name") or _voice_profile["name"]
        style      = bot_config.get("conversation_style", "professional and helpful")
        compliance = bot_config.get("compliance_notes", "")
        first_msg  = bot_config.get("first_message", "")

        exec_summary = strategy.get("executive_summary", "")
        target_aud   = strategy.get("target_audience", {})
        tone         = messaging.get("tone", "")
        core_message = messaging.get("core_message", "")

        must_have  = website_reqs.get("must_have",    [])
        must_avoid = website_reqs.get("must_avoid",   [])
        faqs       = website_reqs.get("faqs",         [])
        eth_flags  = website_reqs.get("ethical_flags",[])

        # trial_location is [{country, city}]
        locations = ad.trial_location or []
        loc_str = ", ".join(
            f"{l.get('city', '')}, {l.get('country', '')}".strip(", ")
            for l in locations if isinstance(l, dict)
        ) if locations else ""

        start_date = str(ad.trial_start_date) if ad.trial_start_date else ""
        end_date   = str(ad.trial_end_date)   if ad.trial_end_date   else ""
        duration   = ad.duration or ""

        # questionnaire: {questions: [{id, text, type, options, required}]}
        questionnaire = ad.questionnaire or {}
        questions = questionnaire.get("questions", []) if isinstance(questionnaire, dict) else []

        # ── Base identity (skill.md overrides the default identity block only) ─
        if skill and skill.skill_md:
            identity_block = skill.skill_md
        else:
            identity_block = (
                f"You are {bot_name}, a voice assistant representing {company_name} "
                f"in the {industry} sector. "
                f"You are calling because the person expressed interest in the \"{ad.title}\" campaign. "
                "Your goal is to answer their questions, walk them through the eligibility screening, "
                "and if they qualify, encourage them to take the next step."
            )

        # ── Build the prompt sections ─────────────────────────────────────────
        sections: list[str] = [identity_block]

        # 1. Trial facts
        facts_lines = [f"- Trial name: {ad.title}"]
        if ad.campaign_category:
            facts_lines.append(f"- Category: {ad.campaign_category}")
        if exec_summary:
            facts_lines.append(f"- About this trial: {exec_summary}")
        if loc_str:
            facts_lines.append(f"- Location(s): {loc_str}")
        if start_date:
            facts_lines.append(f"- Enrolment opens: {start_date}")
        if end_date:
            facts_lines.append(f"- Enrolment closes: {end_date}")
        if duration:
            facts_lines.append(f"- Trial duration: {duration}")
        sections.append("## Trial Facts\n" + "\n".join(facts_lines))

        # 2. Audience & messaging — guidance only, never recite
        guidance_lines = []
        if target_aud:
            guidance_lines.append(
                f"The person you're speaking with likely matches this profile: "
                f"{json.dumps(target_aud) if isinstance(target_aud, dict) else target_aud}. "
                "Use this to tailor your language — do NOT read this description aloud."
            )
        if tone:
            guidance_lines.append(f"Speak in a {tone} tone — do NOT mention this instruction.")
        if core_message:
            guidance_lines.append(
                f"The underlying message to convey is: \"{core_message}\" — "
                "weave this in naturally, never quote it verbatim."
            )
        if guidance_lines:
            sections.append("## Audience & Tone Guidance (internal — never recite)\n" + "\n".join(guidance_lines))

        # 3. Eligibility criteria
        if must_have or must_avoid:
            elig_lines = []
            if must_have:
                elig_lines.append(
                    "Inclusion criteria (share these conversationally when asked):\n" +
                    "\n".join(f"  - {c}" for c in must_have)
                )
            if must_avoid:
                elig_lines.append(
                    "Exclusion criteria (mention gently only if directly relevant):\n" +
                    "\n".join(f"  - {c}" for c in must_avoid)
                )
            sections.append("## Eligibility Criteria\n" + "\n\n".join(elig_lines))

        # 4. Screening questionnaire
        if questions:
            q_lines = [
                "Walk through these screening questions one at a time, conversationally — "
                "do NOT read them as a list. Wait for the answer before asking the next question. "
                "If the caller answers in a way that makes them ineligible, be empathetic and honest.\n"
            ]
            for i, q in enumerate(questions, 1):
                if not isinstance(q, dict):
                    continue
                q_text    = q.get("text", "")
                q_options = q.get("options", [])
                q_options = q_options if isinstance(q_options, list) else []
                q_req     = q.get("required", True)
                line = f"Q{i}: {q_text}"
                if q_options:
                    line += f" (options: {', '.join(str(o) for o in q_options)})"
                if not q_req:
                    line += " [optional]"
                q_lines.append(line)
            q_lines.append(
                "\nAfter all questions are answered, summarise eligibility warmly. "
                "If eligible, say the team will follow up. "
                "If not, thank them sincerely and let them know other trials may suit them."
            )
            sections.append("## Screening Questions\n" + "\n".join(q_lines))

        # 5. Approved FAQs
        if faqs:
            faq_lines = ["You may quote these answers verbatim when the caller asks:"]
            for faq in faqs:
                if isinstance(faq, dict):
                    faq_lines.append(f"Q: {faq.get('question', '')}\nA: {faq.get('answer', '')}")
                else:
                    faq_lines.append(str(faq))
            sections.append("## Approved FAQs\n" + "\n\n".join(faq_lines))

        # 6. Guardrails — permanent rules first, then publisher eth_flags
        # Permanent rules are hardcoded and cannot be removed by campaign configuration.
        permanent_rules = (
            "## Campaign Privacy Rules (permanent — never override, never mention to caller)\n"
            "The following must be enforced on every call with no exceptions:\n\n"
            "- BUDGET: Never reveal the campaign budget, media spend, or any financial figures.\n"
            "  If asked, respond warmly: \"That's not something I'm able to share — "
            "the team would be happy to help if you have more questions.\"\n\n"
            "- PARTICIPANT NUMBERS: Never reveal how many participants are being recruited, "
            "enrollment targets, quotas, sample sizes, or headcount goals.\n"
            "  If asked, respond warmly: \"I don't have that detail on hand — "
            "you're welcome to reach out to the research team directly.\"\n\n"
            "- Never provide medical advice, diagnoses, or guaranteed eligibility outcomes.\n"
            "- Never pressure or incentivise the caller to enrol."
        )
        sections.append(permanent_rules)

        publisher_guardrail_lines = []
        if eth_flags:
            publisher_guardrail_lines.append(
                "Ethical guardrails (enforce silently — never mention to the caller):\n" +
                "\n".join(f"  - {f}" for f in eth_flags)
            )
        if compliance:
            publisher_guardrail_lines.append(
                f"Compliance rules (enforce silently — never mention to the caller):\n  - {compliance}"
            )
        if publisher_guardrail_lines:
            sections.append("## Additional Guardrails (internal — never recite or acknowledge)\n" + "\n\n".join(publisher_guardrail_lines))

        # 7. Conversation style
        sections.append(f"## Conversation Style\nSpeak in a {style} manner throughout the call.")

        # 8. Booking flow instructions
        public_url = (settings.APP_PUBLIC_URL or "").rstrip("/")
        if public_url:
            sections.append(
                "## Booking Flow (follow this sequence exactly after eligibility is confirmed)\n"
                "As soon as you have determined the caller is likely eligible — do NOT wait for them to ask.\n"
                "Proactively offer to book a screening appointment immediately after confirming eligibility.\n"
                "\n"
                "Step 1 — Warmly confirm eligibility:\n"
                "  \"That's great news! <break time=\"0.4s\" /> Based on what you've told me, "
                "you sound like a wonderful fit for this study.\"\n"
                "\n"
                "Step 2 — Offer to book on the spot:\n"
                "  \"I can actually lock in a screening appointment for you right now — "
                "it only takes a moment. <break time=\"0.5s\" /> Would that work for you?\"\n"
                "\n"
                "Step 3 — Collect name and phone first (one question at a time):\n"
                "  a) Full name (\"Could I grab your full name for the booking?\")\n"
                "  b) Phone number (\"And the best number to reach you on?\") — skip if already known from outbound call\n"
                "\n"
                "Step 4 — Find a mutually suitable slot (back-and-forth until confirmed):\n"
                "  a) Ask for a preferred date: \"What date works best for you?\"\n"
                "  b) Immediately call check_available_slots with that date.\n"
                "     - If the tool returns available times, read them naturally:\n"
                "       e.g. \"On Tuesday the 3rd we have nine, ten, and eleven in the morning, "
                "and two and three in the afternoon. Which of those suits you?\"\n"
                "     - If the tool says no slots that day, read the suggestion it returns "
                "and ask if the alternative day works.\n"
                "     - If the caller says none of those times work, ask what day they'd prefer next "
                "and call check_available_slots again.\n"
                "  c) Repeat until the caller confirms a specific time. Never guess or invent times.\n"
                "\n"
                "Step 5 — Confirm the booking:\n"
                "  Repeat the chosen date and time back to the caller once for confirmation, "
                "then call book_appointment with candidate_name, date (YYYY-MM-DD), time (HH:MM 24h), "
                "candidate_phone, and any notes.\n"
                "  Read the tool's confirmation response naturally.\n"
                "\n"
                "Step 6 — Close warmly:\n"
                "  \"You're all set! <break time=\"0.3s\" /> The team will be in touch very soon "
                "to confirm everything. <break time=\"0.4s\" /> Is there anything else I can help you with today?\"\n"
                "\n"
                "RULES:\n"
                "- Always call check_available_slots before presenting any times — never invent slots.\n"
                "- Never call book_appointment until the caller has explicitly confirmed a specific time.\n"
                "- If the caller says a time doesn't work, offer to check another date — keep going.\n"
                "- If the caller is not eligible, do NOT offer booking. Thank them sincerely and "
                "let them know other studies may be a better fit."
            )

        # 8. Voice rules + ElevenLabs audio tags (always last)
        locations = ad.trial_location or []
        loc_country = ""
        if locations and isinstance(locations[0], dict):
            loc_country = locations[0].get("country", "")

        # Map country name → adjective for the accent instruction
        _country_adj = {
            "australia": "Australian", "new zealand": "New Zealand",
            "united kingdom": "British", "ireland": "Irish",
            "united states": "American", "canada": "Canadian",
            "india": "Indian", "germany": "German",
            "france": "French", "spain": "Spanish",
        }
        accent_adj = _country_adj.get(loc_country.lower(), loc_country)
        accent_note = (
            f"You have a natural {accent_adj} accent. "
            f"Use locally natural expressions, rhythm, and warmth — speak exactly as a {accent_adj} local would. "
            "Never sound robotic or overly formal."
        ) if accent_adj else "Speak with a warm, natural, conversational tone."

        base_voice_rules = (
            "## Voice & Delivery Rules\n"
            "You are speaking live on a phone call — not typing. Every word you say will be spoken aloud.\n"
            f"{accent_note}\n"
            "- Keep turns short and conversational. 2–3 sentences max. Let the caller breathe.\n"
            "- No bullet points, lists, markdown, headers, or punctuation names.\n"
            "- Contractions always: 'you're', 'it's', 'we've', 'that's'. Never the formal equivalents.\n"
            "- Never fabricate trial data, dates, or medical claims.\n"
            "- If you don't know something, say so warmly and offer a human follow-up.\n"
            "\n"
            "## Audio Expression & Human-Like Delivery — READ THIS CAREFULLY\n"
            "Your goal is to sound indistinguishable from a real Australian person on the phone.\n"
            "━━ NATURAL CONVERSATIONAL STYLE ━━\n"
            "Speak naturally and conversationally. Use vocal disfluencies to sound human.\n"
            "\n"
            "━━ VOCAL DISFLUENCIES & FILLER WORDS (the model voices these naturally) ━━\n"
            "These make you sound like a real person, not a script-reader. Sprinkle them in:\n"
            "\n"
            "  THINKING / HESITATION:\n"
            "  • 'So...'           — trailing thought, natural transition\n"
            "  • 'um,'  'uh,'      — genuine mid-sentence thinking pause\n"
            "  • 'I mean,'         — self-correction or clarification\n"
            "  • 'right,'          — soft acknowledgement before moving on\n"
            "  • 'you know,'       — casual connection with the listener\n"
            "\n"
            "  WARMTH & ACTIVE LISTENING:\n"
            "  • 'Mmm,'            — 'I hear you', warm and present\n"
            "  • 'Ah,'             — realisation or gentle surprise\n"
            "  • 'Oh,'             — natural reaction, soft\n"
            "  • 'Oh wow,'         — positive surprise, use sparingly\n"
            "  • 'Yeah, yeah,'     — active listening, flowing agreement\n"
            "  • 'Oh, I hear ya.'  — genuine empathy for frustration or struggle\n"
            "\n"
            "  ENCOURAGEMENT (Australian-natural):\n"
            "  • 'That's great!'   — genuine positive reaction\n"
            "  • 'Brilliant!'      — enthusiastic but not over the top\n"
            "  • 'Good on ya!'     — warm affirmation, use max once per call\n"
            "  • 'No worries at all.' — reassurance after a concern\n"
            "  • 'Look,'           — soft Aussie emphasis opener before making a point\n"
        )

        if allow_audio_tags:
            audio_rules = (
                "\n"
                "━━ FUSION DELIVERY — TWO-STAGE TTS ━━\n"
                "Your response is rendered in two stages by different TTS engines:\n"
                "  Stage 1 — Opener (approx. your first sentence, ~8–18 words):\n"
                "    Rendered by ultra-low-latency flash TTS.  NO audio tags of any kind.\n"
                "    Keep it plain, warm, and conversational — disfluencies only.\n"
                "  Stage 2 — Continuation (everything after the opener):\n"
                "    Rendered by expressive v3 TTS.  Square-bracket audio tags ARE supported here.\n"
                "\n"
                "  Supported tags (continuation only, max 1–2 per response):\n"
                "    [laugh]          — genuine warm laugh\n"
                "    [chuckle]        — quiet, natural chuckle\n"
                "    [sigh]           — empathetic or relieved sigh\n"
                "    [gasp]           — soft surprised reaction\n"
                "    [clears throat]  — pause/reset mid-thought\n"
                "\n"
                "  ✗ NEVER put audio tags in your first sentence (opener)\n"
                "  ✗ NEVER use XML tags (<break>, <emphasis>) anywhere — not supported\n"
                "  ✗ Use tags sparingly — only where the emotion is genuinely natural\n"
                "  ✗ NEVER sound like you're reading from a script — vary your sentence rhythm\n"
                "\n"
                "━━ EXAMPLE RESPONSES WITH FUSION TAGS ━━\n"
                "\n"
                "Warm reaction to eligibility:\n"
                "\"Oh, that's brilliant! [chuckle] Based on everything you've told me, "
                "you sound like a really wonderful fit for this study. No worries at all.\"\n"
                "                  ↑ opener ends ↑  ↑ continuation — tags OK here ↑\n"
                "\n"
                "Empathy moment:\n"
                "\"Mmm, yeah, those 3am wake-ups are genuinely exhausting. [sigh] "
                "That's actually exactly who this study is designed to help — "
                "you know, you're in the right place.\"\n"
                "\n"
                "Ineligibility — empathetic:\n"
                "\"Thank you so much for your time, genuinely. [sigh] "
                "Unfortunately, um, this particular study isn't quite the right match — "
                "but look, there may be other trials that suit you better.\"\n"
                "\n"
                "Opening (no tags — this IS the opener):\n"
                "\"Hi. This is {bot_name} from {company_name}. "
                "Thanks a lot for expressing interest in our study. How are you doing today?\"\n"
            ).format(bot_name=bot_name, company_name=company_name)
        else:
            audio_rules = (
                "\n"
                "━━ HARD RULES ━━\n"
                "  ✗ NEVER use square brackets or any special audio tags — they will be spoken literally\n"
                "  ✗ NEVER use XML tags like <break>, <emphasis>, <prosody>\n"
                "  ✗ Use natural filler words — every response needs at least one\n"
                "  ✗ NEVER sound like you're reading from a script — vary your sentence rhythm\n"
                "\n"
                "━━ EXAMPLE RESPONSES — model your delivery on these exactly ━━\n"
                "\n"
                "Opening:\n"
                "\"Hi. This is {bot_name} from {company_name}. "
                "Thanks a lot for expressing interest in our study. How are you doing today?\"\n"
                "\n"
                "Describing the study:\n"
                "\"So... this trial is focused on, uh, a treatment that's actually been getting quite a bit of "
                "attention lately. You've probably seen a thing or two about it in the media. "
                "Basically, it's designed to help with — right — managing blood sugar and weight.\"\n"
                "\n"
                "Empathy moment:\n"
                "\"Mmm, yeah... those 3am wake-ups are genuinely exhausting, I imagine. "
                "That's actually exactly who this study is designed to help, so — you know — "
                "you're in the right place.\"\n"
                "\n"
                "Warm reaction to good news:\n"
                "\"Oh, that's brilliant! Based on everything you've told me, you sound like a really "
                "wonderful fit. The team will be in touch very soon — no worries at all.\"\n"
                "\n"
                "Ineligibility — empathetic:\n"
                "\"Thank you so much for your time, genuinely. Unfortunately, "
                "um, this particular study isn't quite the right match — but look, there may be other trials "
                "that suit you better, and the team can help point you in the right direction.\"\n"
            ).format(bot_name=bot_name, company_name=company_name)

        sections.append(base_voice_rules + audio_rules)

        return "\n\n".join(sections)

    # ──────────────────────────────────────────────────────────────────────────
    # DB helpers
    # ──────────────────────────────────────────────────────────────────────────

    async def _get_advertisement(self, advertisement_id: str) -> Advertisement:
        result = await self.db.execute(
            select(Advertisement).where(Advertisement.id == advertisement_id)
        )
        ad = result.scalar_one_or_none()
        if not ad:
            raise ValueError(f"Advertisement {advertisement_id} not found")
        return ad
