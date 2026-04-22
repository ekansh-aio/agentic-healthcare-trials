"""
M5: Curator Service (Marketing Skill Template Agent)
Owner: AI Dev
Dependencies: M1, M4 (Training)

Takes input documents + company context, generates marketing strategy.
Uses the company-customized Curator SKILL.md as its system prompt.
Calls Claude API to produce strategy JSON.
"""

import json
import os
import re
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import Advertisement, CompanyDocument, SkillConfig, DocumentType
from app.core.bedrock import get_async_client, get_model, get_curator_model, is_configured

_SKILLS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "skills", "templates")
)


class CuratorService:
    def __init__(self, db: AsyncSession, company_id: str):
        self.db = db
        self.company_id = company_id

    async def generate_strategy(
        self,
        advertisement: Advertisement,
        company_docs: List[CompanyDocument],
        extra_instructions: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate a marketing strategy using the Curator skill.

        Flow:
        1. Load the company's customized Curator SKILL.md
        2. Build context from input documents + reference documents
        3. Call Claude API with the skill as system prompt
        4. Parse and return strategy JSON
        """
        # Step 1: Load customized skill
        skill_md = await self._load_skill("curator")

        # Step 2: Build document context
        context = self._build_context(advertisement, company_docs, extra_instructions=extra_instructions)

        # Step 3: Call Claude API
        strategy = await self._call_claude(skill_md, context)

        return strategy

    async def _load_skill(self, skill_type: str) -> str:
        """
        Load the company-specific SKILL.md from DB.
        Falls back to the generic template if training hasn't been run yet.
        """
        result = await self.db.execute(
            select(SkillConfig).where(
                SkillConfig.company_id == self.company_id,
                SkillConfig.skill_type == skill_type,
            ).order_by(SkillConfig.version.desc())
        )
        skill = result.scalars().first()
        if skill:
            return skill.skill_md

        # Fall back to the generic template so generation still works
        # before training is run. Log a warning so it's visible in server logs.
        template_path = os.path.join(_SKILLS_DIR, f"{skill_type}_template.md")
        if os.path.exists(template_path):
            import logging
            logging.getLogger(__name__).warning(
                "No trained '%s' skill for company %s — using generic template. "
                "Run POST /api/onboarding/train to customise.",
                skill_type, self.company_id,
            )
            with open(template_path, "r") as f:
                return f.read()

        raise ValueError(
            f"Skill '{skill_type}' not found and template is missing. "
            "Run POST /api/onboarding/train first."
        )

    def _build_context(
        self,
        ad: Advertisement,
        docs: list,
        extra_instructions: Optional[str] = None,
    ) -> str:
        """
        Build the user message with all relevant context.

        Doc priority convention:
          priority > 0  → campaign-specific protocol docs (AdvertisementDocument)
          priority == 0 → company-level docs (CompanyDocument)
            - doc_type == REFERENCE → lessons learned (highest importance)
            - doc_type == INPUT     → input briefs
            - everything else       → company context
        """
        sections = []

        # Advertisement parameters
        sections.append(f"""## Advertisement Brief
- Title: {ad.title}
- Type: {", ".join(ad.ad_type)}
- Budget: {ad.budget or 'Not specified'}
- Platforms: {json.dumps(ad.platforms) if ad.platforms else 'Not specified'}
- Target Audience: {json.dumps(ad.target_audience) if ad.target_audience else 'Not specified'}
""")

        # Campaign-specific protocol documents (priority > 0)
        protocol_docs = [d for d in docs if d.priority > 0]
        if protocol_docs:
            sections.append("## Campaign Protocol Documents (HIGH PRIORITY — Campaign-Specific Context)")
            for doc in protocol_docs:
                doc_type_label = doc.doc_type if isinstance(doc.doc_type, str) else doc.doc_type.value
                content = getattr(doc, 'content', None) or '[See attached file]'
                sections.append(f"### [{doc_type_label}] {doc.title}\n{content}")

        # Company-level: Reference / lessons learned
        ref_docs = [d for d in docs if d.priority == 0 and d.doc_type == DocumentType.REFERENCE]
        if ref_docs:
            sections.append("## Reference Documents (HIGH PRIORITY — Lessons Learned)")
            for doc in ref_docs:
                sections.append(f"### {doc.title}\n{doc.content or '[See file]'}")

        # Company-level: Input briefs
        input_docs = [d for d in docs if d.priority == 0 and d.doc_type == DocumentType.INPUT]
        if input_docs:
            sections.append("## Input Documents")
            for doc in input_docs:
                sections.append(f"### {doc.title}\n{doc.content or '[See file]'}")

        # Company-level: Everything else (USP, compliance, policy, etc.)
        other_docs = [
            d for d in docs
            if d.priority == 0 and d.doc_type not in (DocumentType.REFERENCE, DocumentType.INPUT)
        ]
        if other_docs:
            sections.append("## Company Context Documents")
            for doc in other_docs:
                doc_type_label = doc.doc_type if isinstance(doc.doc_type, str) else doc.doc_type.value
                sections.append(f"### [{doc_type_label}] {doc.title}\n{doc.content or '[See file]'}")

        if extra_instructions:
            sections.append(f"## Reviewer Instructions (MUST follow)\n{extra_instructions}")

        sections.append("""
## Instructions
Based on all the above context, generate a comprehensive marketing strategy
as a JSON object following the format defined in your skill instructions.
Respond ONLY with the JSON object, no additional text.
""")

        return "\n\n".join(sections)

    @staticmethod
    def _extract_json(text: str) -> Dict[str, Any]:
        """
        Multi-stage JSON extractor for LLM output.
        Stage 1: direct parse
        Stage 2: strip markdown fences then parse
        Stage 3: grab outermost { ... } block then parse
        Raises json.JSONDecodeError if all stages fail.
        """
        # Stage 1: raw
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Stage 2: strip markdown fences
        try:
            clean = re.sub(r"^```[a-zA-Z]*\s*", "", text.strip())
            clean = re.sub(r"\s*```\s*$", "", clean).strip()
            return json.loads(clean)
        except json.JSONDecodeError:
            pass

        # Stage 3: extract outermost JSON object
        try:
            start = text.index("{")
            end   = text.rindex("}") + 1
            return json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            pass

        raise json.JSONDecodeError("Could not extract JSON from LLM response", text, 0)

    async def _call_claude(self, system_prompt: str, user_message: str) -> Dict[str, Any]:
        """Call Claude Opus 4.6 (direct API or Bedrock) with the skill as system prompt.
        Uses get_curator_model() so strategy generation always runs on Opus 4.6."""
        if not is_configured():
            return self._mock_strategy()

        client   = get_async_client()
        response = await client.messages.create(
            model=get_curator_model(),
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        text = response.content[0].text

        try:
            return self._extract_json(text)
        except json.JSONDecodeError:
            return {"raw_response": text, "parse_error": True}

    async def generate_questionnaire(
        self,
        advertisement: Advertisement,
        docs: list,
    ) -> Dict[str, Any]:
        """
        Generate an MCQ eligibility/screening questionnaire using Claude.
        Returns {"questions": [{id, text, type, options, required}]}
        """
        if not is_configured():
            return self._mock_questionnaire(advertisement.title)

        # Build focused context
        doc_titles = ", ".join(d.title for d in docs if d.priority > 0) or "none"
        strategy_summary = ""
        if advertisement.strategy_json:
            es = advertisement.strategy_json.get("executive_summary", "")
            if es:
                strategy_summary = f"\nCampaign Strategy Summary: {es[:400]}"

        doc_contents = []
        for d in docs:
            if d.priority > 0:
                content = getattr(d, "content", None) or ""
                if content:
                    doc_contents.append(f"[{d.title}]: {content[:600]}")
        doc_block = "\n".join(doc_contents) if doc_contents else "No protocol documents provided."

        user_message = f"""You are generating a screening/eligibility questionnaire for the following campaign.

Campaign Title: {advertisement.title}
Ad Types: {", ".join(advertisement.ad_type)}
Protocol Documents: {doc_titles}

{doc_block}{strategy_summary}

Generate 6–8 multiple-choice questions that screen or assess respondents for eligibility, suitability, or relevant experience for this campaign. Each question must have exactly 4 answer options. Questions should be specific to the campaign context — not generic.

For each question you MUST include a "correct_option" field: the 0-based index (0–3) of the answer that indicates the respondent IS eligible or suitable. This is the answer that passes the screening criterion for that question.

Return ONLY a JSON object in this exact format:
{{
  "questions": [
    {{
      "id": "q1",
      "text": "Question text here?",
      "type": "multiple_choice",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_option": 0,
      "required": true
    }}
  ]
}}"""

        client = get_async_client()
        response = await client.messages.create(
            model=get_model(),
            max_tokens=2048,
            system="You are an expert at creating screening questionnaires for campaigns. Always respond with valid JSON only. Always include correct_option (0-based index of the eligibility-passing answer) for every question.",
            messages=[{"role": "user", "content": user_message}],
        )
        text = response.content[0].text
        try:
            return self._extract_json(text)
        except json.JSONDecodeError:
            return {"questions": [], "parse_error": True}

    async def rewrite_question(
        self,
        question: Dict[str, Any],
        instruction: str,
    ) -> Dict[str, Any]:
        """
        Rewrite a single MCQ question based on a user instruction.
        Returns the updated question dict (same shape, same id).
        """
        if not is_configured():
            return {**question, "text": f"[Rewritten] {question.get('text', '')}", "options": question.get("options", [])}

        prompt = f"""Rewrite the following multiple-choice question based on the instruction provided.
Keep the same JSON structure with exactly 4 answer options and a correct_option index (0-3) if present.

Current question:
{json.dumps(question, indent=2)}

Instruction: {instruction}

Return ONLY the updated question JSON object (no array, no extra text):
{{
  "id": "{question.get('id', 'q1')}",
  "text": "...",
  "type": "multiple_choice",
  "options": ["...", "...", "...", "..."],
  "correct_option": <0-3 index of the eligibility-passing answer>,
  "required": {str(question.get('required', True)).lower()}
}}"""

        client = get_async_client()
        response = await client.messages.create(
            model=get_model(),
            max_tokens=512,
            system="You rewrite screening questionnaire questions. Always respond with valid JSON only.",
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text
        try:
            updated = self._extract_json(text)
            updated["id"] = question.get("id", updated.get("id", "q1"))
            return updated
        except json.JSONDecodeError:
            return question

    def _mock_questionnaire(self, title: str) -> Dict[str, Any]:
        """Dev mock questionnaire when no API key is configured."""
        return {
            "questions": [
                {"id": "q1", "text": f"What is your primary reason for interest in '{title}'?", "type": "multiple_choice", "options": ["Career growth", "Research interest", "Financial benefit", "Personal need"], "correct_option": 1, "required": True},
                {"id": "q2", "text": "What is your highest level of relevant experience?", "type": "multiple_choice", "options": ["No experience", "1–2 years", "3–5 years", "5+ years"], "correct_option": 2, "required": True},
                {"id": "q3", "text": "Are you currently available for the full duration of this campaign?", "type": "multiple_choice", "options": ["Yes, fully available", "Partially available", "Available after 1 month", "Not sure yet"], "correct_option": 0, "required": True},
                {"id": "q4", "text": "How did you hear about this campaign?", "type": "multiple_choice", "options": ["Online advertisement", "Referral", "Social media", "Direct outreach"], "correct_option": 0, "required": False},
            ]
        }

    def _mock_strategy(self) -> Dict[str, Any]:
        """Development mock — returned when no API key is configured."""
        return {
            "executive_summary": "Mock strategy for development testing",
            "target_audience": {
                "primary": "Professionals aged 25-45",
                "demographics": {"age": "25-45", "income": "mid-to-high"},
            },
            "messaging": {
                "core_message": "Elevate your experience",
                "tone": "Professional yet approachable",
                "key_phrases": ["innovation", "reliability", "growth"],
                "cta": "Get Started Today",
            },
            "channels": [
                {"platform": "Google Ads", "strategy": "Search + Display", "budget_allocation": 0.4},
                {"platform": "Instagram", "strategy": "Stories + Reels", "budget_allocation": 0.3},
                {"platform": "LinkedIn", "strategy": "Sponsored Content", "budget_allocation": 0.3},
            ],
            "content_plan": {
                "website": {"pages": ["Home", "About", "Services", "Contact"], "design_direction": "Modern minimal"},
                "ads": {"formats": ["Banner", "Video", "Carousel"], "copy_variants": 3},
            },
            "kpis": [
                {"metric": "CTR",             "target": "≥ 2%",   "context": "paid search & display"},
                {"metric": "Conversion Rate", "target": "≥ 5%",   "context": "landing page"},
                {"metric": "CPA",             "target": "< $50",  "context": "per acquisition"},
                {"metric": "ROAS",            "target": "3×",     "context": "across all channels"},
            ],
            "budget_breakdown": {"creative": 0.3, "media_buy": 0.5, "tools": 0.1, "contingency": 0.1},
            "social_content": {
                "Meta/Instagram": {
                    "caption": "Ready to elevate your experience? Our latest campaign brings innovation and reliability straight to you. Discover what sets us apart — tap the link in bio to learn more.",
                    "hashtags": "#innovation #healthcare #wellness #growth #reliability #campaign #health #lifestyle #brandnew #explore",
                    "launch_schedule": {
                        "recommended_window": "Week 1 of Q2 2025",
                        "best_days": "Tue, Thu",
                        "best_time": "7:00–9:00 AM local",
                        "rationale": "Health-conscious audience most engaged during morning routine on weekdays",
                    },
                },
                "LinkedIn": {
                    "caption": "We're proud to announce our latest initiative focused on innovation and professional growth. Explore how our approach is reshaping the industry — and why it matters for your team.",
                    "hashtags": "#innovation #professionaldev #healthcare #leadership #growth #B2B #industrynews",
                    "launch_schedule": {
                        "recommended_window": "Week 2 of Q2 2025",
                        "best_days": "Mon, Wed",
                        "best_time": "8:00–10:00 AM local",
                        "rationale": "B2B professionals peak engagement during work-start hours mid-week",
                    },
                },
                "Google Ads": {
                    "caption": "Elevate your experience with a trusted, innovative solution. Get started today and see results that matter.",
                    "hashtags": "",
                    "launch_schedule": {
                        "recommended_window": "Week 1 of Q2 2025",
                        "best_days": "Mon–Fri",
                        "best_time": "9:00 AM–12:00 PM local",
                        "rationale": "Search intent highest during morning work hours across all weekdays",
                    },
                },
            },
        }