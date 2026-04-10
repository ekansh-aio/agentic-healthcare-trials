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

from app.models.models import Advertisement, SkillConfig, Company
from app.core.bedrock import get_async_client, get_model, is_configured
from app.core.config import settings

logger = logging.getLogger(__name__)

ELEVENLABS_BASE = "https://api.elevenlabs.io"


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

        system_prompt = await self._build_system_prompt(ad)
        payload = self._build_agent_payload(bot_config, system_prompt)

        existing_agent_id = bot_config.get("elevenlabs_agent_id")

        if existing_agent_id:
            agent = await self._update_agent(existing_agent_id, payload)
            logger.info("Updated ElevenLabs agent %s for ad %s", existing_agent_id, advertisement_id)
        else:
            agent = await self._create_agent(payload)
            # Must copy the dict — plain Column(JSON) doesn't track in-place mutations,
            # so reassigning a new object is required for SQLAlchemy to detect the change.
            new_config = dict(bot_config)
            new_config["elevenlabs_agent_id"] = agent["agent_id"]
            ad.bot_config = new_config
            await self.db.commit()
            logger.info("Created ElevenLabs agent %s for ad %s", agent["agent_id"], advertisement_id)

        return agent

    async def _get_phone_number_id(self, client: httpx.AsyncClient) -> str:
        """
        Return the phone number ID to use for outbound calls.
        Prefers ELEVENLABS_PHONE_NUMBER_ID env var; falls back to fetching
        the first configured phone number from the ElevenLabs account.
        """
        if settings.ELEVENLABS_PHONE_NUMBER_ID:
            return settings.ELEVENLABS_PHONE_NUMBER_ID

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
        return numbers[0].get("phone_number_id") or numbers[0].get("id")

    async def outbound_call(self, advertisement_id: str, to_number: str) -> Dict[str, Any]:
        """
        Trigger an outbound phone call from ElevenLabs to the given number.
        Automatically uses the first phone number configured in the ElevenLabs account.
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
            if not resp.is_success:
                raise ValueError(f"ElevenLabs outbound call failed ({resp.status_code}): {resp.text}")
            return resp.json()

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
        strategy = ad.strategy_json or {}
        target_audience = strategy.get("target_audience", {})
        messaging = strategy.get("messaging", {})
        executive_summary = strategy.get("executive_summary", "")

        voices_catalogue = [
            {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Rachel", "traits": "calm, professional, warm female — suits healthcare, B2B, corporate, clinical"},
            {"id": "pNInz6obpgDQGcFmaJgB", "name": "Adam",   "traits": "deep, authoritative male — suits financial, legal, insurance, executive audiences"},
            {"id": "oWAxZDx7w5VEj9dCyTzz", "name": "Grace",  "traits": "warm, friendly female — suits consumer wellness, lifestyle, retail, family"},
            {"id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh",   "traits": "conversational, relatable male — suits tech, startups, younger demographics"},
            {"id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi",   "traits": "strong, confident female — suits fitness, empowerment, sports, motivation"},
            {"id": "VR6AewLTigWG4xSOukaG", "name": "Arnold", "traits": "crisp, clear male — suits education, SaaS, technical product demos"},
            {"id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli",   "traits": "bright, energetic female — suits entertainment, youth, e-commerce, events"},
            {"id": "XB0fDUnXU5powFXDhCwa", "name": "Charlotte", "traits": "sophisticated, composed female — suits luxury, premium brands, fashion, finance"},
        ]

        prompt = f"""You are a voice casting expert for AI voice agents used in marketing campaigns.

Campaign summary: {executive_summary}

Target audience:
{json.dumps(target_audience, indent=2)}

Messaging tone: {messaging.get("tone", "N/A")}
Core message: {messaging.get("core_message", "N/A")}

Available voices:
{json.dumps(voices_catalogue, indent=2)}

Based on the target audience demographics, tone, and campaign goals, select the single best voice.
Also suggest a conversation_style (one of: professional, friendly, casual, formal, empathetic, energetic)
and a natural first_message the agent should say when a user picks up.

Respond with ONLY a valid JSON object, no markdown:
{{
  "voice_id": "<id from catalogue>",
  "voice_name": "<name>",
  "reason": "<one sentence explaining why this voice fits this audience>",
  "conversation_style": "<style>",
  "first_message": "<opening line the agent says, max 20 words>"
}}"""

        if not is_configured():
            # Fallback: pick Rachel for professional, Josh for casual, etc.
            tone = (messaging.get("tone") or "").lower()
            fallback = voices_catalogue[3] if "casual" in tone or "young" in tone else voices_catalogue[0]
            return {
                "voice_id": fallback["id"],
                "voice_name": fallback["name"],
                "reason": "Default recommendation — configure AI API for personalized suggestions.",
                "conversation_style": "professional",
                "first_message": "Hi! How can I help you today?",
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
        self, bot_config: Dict[str, Any], system_prompt: str
    ) -> Dict[str, Any]:
        """
        Map bot_config fields → ElevenLabs agent creation payload.

        bot_config keys consumed:
          voice_id           - ElevenLabs voice ID (falls back to settings default)
          first_message      - Agent's opening line
          language           - BCP-47 language code, e.g. "en", "en-US"
          bot_name           - Display name for the agent
        """
        voice_id = bot_config.get("voice_id") or settings.ELEVENLABS_VOICE_ID or "EXAVITQu4vr4xnSDxMaL"
        first_message = bot_config.get(
            "first_message", "Hello! How can I help you today?"
        )
        language = bot_config.get("language", "en")
        agent_name = bot_config.get("bot_name", "Marketing Assistant")

        return {
            "name": agent_name,
            "conversation_config": {
                "agent": {
                    "prompt": {
                        "prompt": system_prompt,
                        "llm": "claude-3-7-sonnet",
                        "temperature": 0.7,
                    },
                    "first_message": first_message,
                    "language": language,
                },
                "tts": {
                    "voice_id": voice_id,
                    "model_id": "eleven_turbo_v2",
                },
            },
        }

    async def _build_system_prompt(self, ad: Advertisement) -> str:
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
        bot_config  : Dict[str, Any] = ad.bot_config   or {}
        strategy    : Dict[str, Any] = ad.strategy_json or {}
        website_reqs: Dict[str, Any] = ad.website_reqs  or {}
        messaging   : Dict[str, Any] = strategy.get("messaging", {}) or {}

        bot_name   = bot_config.get("name", "Assistant")
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
                q_text    = q.get("text", "")
                q_options = q.get("options", [])
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

        # 6. Guardrails (ethical flags + compliance — enforced silently)
        guardrail_lines = []
        if eth_flags:
            guardrail_lines.append(
                "Ethical guardrails (enforce silently — never mention to the caller):\n" +
                "\n".join(f"  - {f}" for f in eth_flags)
            )
        if compliance:
            guardrail_lines.append(
                f"Compliance rules (enforce silently — never mention to the caller):\n  - {compliance}"
            )
        if guardrail_lines:
            sections.append("## Guardrails (internal — never recite or acknowledge)\n" + "\n\n".join(guardrail_lines))

        # 7. Conversation style
        sections.append(f"## Conversation Style\nSpeak in a {style} manner throughout the call.")

        # 8. Voice rules (always last)
        sections.append(
            "## Critical Voice Rules\n"
            "You are speaking out loud via a phone call — not typing.\n"
            "- Keep every turn to 1–2 short sentences. Never exceed 3.\n"
            "- Never use bullet points, numbered lists, markdown, or headers.\n"
            "- Never spell out punctuation (no 'dash', 'colon', 'asterisk').\n"
            "- Speak naturally — contractions, pauses, filler affirmations ('Sure!', 'Got it.') are fine.\n"
            "- If asked something you don't know, say so honestly and offer to have a human follow up.\n"
            "- Never fabricate trial data, timelines, or medical claims."
        )

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
