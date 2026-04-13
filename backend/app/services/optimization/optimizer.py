"""
M7: Optimizer Service — v2 (Deterministic + Structured)
Owner: AI Dev
Dependencies: M1, M6

Two deterministic optimization categories:
  1. Cost Optimization  — marginal resource allocation + traffic window analysis
  2. Content Optimization — creative suggestions for website and advertisement

Each suggestion item has:
  - what:   the specific change to make
  - why:    data-driven reason referencing actual metrics
  - prompt: self-contained AI prompt to regenerate or refine this item
"""

import json
import re
from typing import Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Advertisement, AdAnalytics, Review
from app.core.bedrock import get_async_client, get_model, is_configured


class OptimizerService:
    def __init__(self, db: AsyncSession, company_id: str):
        self.db = db
        self.company_id = company_id

    async def generate_suggestions(
        self,
        advertisement: Advertisement,
        analytics: List[AdAnalytics],
        reviews: List[Review],
    ) -> Dict[str, Any]:
        """
        Produce deterministic, structured optimization suggestions.

        1. Compute cost signals (marginal returns, traffic windows)
        2. Compute content signals (engagement level vs benchmark, creative weaknesses)
        3. Call Claude with tightly constrained inputs and required output schema
        4. Return cost_optimization, website_optimization, advertisement_optimization
        """
        cost_analysis    = self._analyze_cost(advertisement, analytics)
        content_signals  = self._analyze_content_signals(advertisement, analytics)
        reviewer_context = self._extract_reviewer_context(reviews)

        # Use deterministic mock when:
        #   • AI backend is not configured
        #   • No analytics rows to analyze (AI would have nothing concrete to cite)
        no_data = cost_analysis.get("status") == "no_data"

        if not is_configured() or no_data:
            suggestions = self._deterministic_mock(cost_analysis, content_signals)
        else:
            try:
                suggestions = await self._generate_ai_suggestions(
                    advertisement, cost_analysis, content_signals, reviewer_context
                )
                # If all JSON extractors failed the response will be {"raw_response": ...}.
                # Rather than surface that to the user, fall back to the deterministic mock.
                if "raw_response" in suggestions and "cost_optimization" not in suggestions:
                    logger.warning(
                        "Optimizer AI returned unparseable output for ad %s — "
                        "falling back to deterministic mock. Raw snippet: %.200s",
                        advertisement.id,
                        suggestions.get("raw_response", ""),
                    )
                    suggestions = self._deterministic_mock(cost_analysis, content_signals)
            except Exception as exc:
                logger.warning(
                    "Optimizer AI call failed for ad %s (%s) — falling back to deterministic mock",
                    advertisement.id, exc,
                )
                suggestions = self._deterministic_mock(cost_analysis, content_signals)

        return {
            "suggestions": suggestions,
            "context": {
                "cost_analysis":    cost_analysis,
                "content_signals":  content_signals,
                "reviewer_context": reviewer_context,
            },
        }

    # ── Deterministic cost analysis ───────────────────────────────────────────

    def _analyze_cost(
        self, ad: Advertisement, analytics: List[AdAnalytics]
    ) -> Dict[str, Any]:
        """
        Derive marginal return and traffic window signals from stored analytics rows.
        All computations are deterministic — same data always yields same output.
        """
        if not analytics:
            return {"status": "no_data"}

        rows = sorted(
            analytics,
            key=lambda a: str(getattr(a, "date_label", "") or getattr(a, "recorded_at", "") or ""),
        )

        spends      = [float(getattr(a, "spend",       0) or 0) for a in rows]
        clicks      = [float(getattr(a, "clicks",      0) or 0) for a in rows]
        impressions = [float(getattr(a, "impressions", 0) or 0) for a in rows]
        cpms        = [float(getattr(a, "cpm",         0) or 0) for a in rows]
        date_labels = [getattr(a, "date_label", None)           for a in rows]

        ctrs = [c / i if i > 0 else 0.0 for c, i in zip(clicks, impressions)]

        total_spend  = sum(spends)
        total_clicks = sum(clicks)
        total_imps   = sum(impressions)
        avg_ctr_pct  = round((total_clicks / total_imps * 100) if total_imps else 0.0, 4)
        avg_cpm      = round(sum(cpms) / len(cpms) if cpms else 0.0, 2)
        avg_spend_day = round(total_spend / len(rows) if rows else 0.0, 2)

        # Marginal return: split rows into first/second half and compare CTR
        mid = max(len(rows) // 2, 1)
        early_ctr = sum(ctrs[:mid]) / mid
        late_ctr  = sum(ctrs[mid:]) / (len(rows) - mid) if len(rows) > mid else early_ctr

        ctr_trend = (
            "declining"  if late_ctr < early_ctr * 0.90 else
            "improving"  if late_ctr > early_ctr * 1.10 else
            "stable"
        )
        early_spend = sum(spends[:mid]) / mid
        late_spend  = sum(spends[mid:]) / (len(rows) - mid) if len(rows) > mid else early_spend
        spend_trend = (
            "increasing" if late_spend > early_spend * 1.10 else
            "decreasing" if late_spend < early_spend * 0.90 else
            "stable"
        )

        # Budget signal from marginal analysis
        if ctr_trend == "declining" and spend_trend in ("increasing", "stable"):
            budget_signal = "reduce_and_redistribute"
            budget_rationale = (
                f"CTR declined {round((1 - late_ctr / early_ctr) * 100 if early_ctr else 0, 1)}% "
                f"while spend held steady — diminishing marginal returns detected."
            )
        elif ctr_trend == "improving" and spend_trend in ("decreasing", "stable"):
            budget_signal = "increase_on_winners"
            budget_rationale = (
                f"CTR improved {round((late_ctr / early_ctr - 1) * 100 if early_ctr else 0, 1)}% "
                f"while spend was stable — scale budget on top-performing windows."
            )
        else:
            budget_signal = "rebalance"
            budget_rationale = (
                f"CTR is {ctr_trend} while spend is {spend_trend}. "
                f"Rebalance spend toward top-CTR windows."
            )

        # Traffic windows: rank days by CTR
        day_perf = [
            {"date": date_labels[i], "ctr": ctrs[i], "spend": spends[i], "clicks": clicks[i]}
            for i in range(len(rows))
            if date_labels[i]
        ]
        day_perf.sort(key=lambda x: x["ctr"], reverse=True)
        top_windows = day_perf[:3]
        low_windows = day_perf[-3:] if len(day_perf) >= 6 else []

        return {
            "status":            "analyzed",
            "data_points":       len(rows),
            "total_spend":       round(total_spend, 2),
            "total_clicks":      int(total_clicks),
            "total_impressions": int(total_imps),
            "avg_ctr_pct":       avg_ctr_pct,
            "avg_cpm":           avg_cpm,
            "avg_spend_per_day": avg_spend_day,
            "ctr_trend":         ctr_trend,
            "spend_trend":       spend_trend,
            "budget_signal":     budget_signal,
            "budget_rationale":  budget_rationale,
            "top_traffic_windows": top_windows,
            "low_traffic_windows": low_windows,
        }

    # ── Content signal analysis ───────────────────────────────────────────────

    def _analyze_content_signals(
        self, ad: Advertisement, analytics: List[AdAnalytics]
    ) -> Dict[str, Any]:
        """
        Compute engagement level vs industry benchmark and identify the primary
        creative weakness. Used to guide deterministic content optimization prompts.
        """
        is_website = "website" in (ad.ad_type or [])

        if not analytics:
            engagement_level = "unknown"
            ctr_benchmark    = "unknown"
            primary_weakness = "insufficient data — optimise creative proactively"
        else:
            total_clicks = sum(float(getattr(a, "clicks",      0) or 0) for a in analytics)
            total_imps   = sum(float(getattr(a, "impressions", 0) or 0) for a in analytics)
            ctr = total_clicks / total_imps if total_imps else 0.0

            # Industry benchmarks for awareness/traffic ads
            if ctr < 0.005:
                engagement_level = "very_low"
                ctr_benchmark    = f"{round(ctr * 100, 3)}% (industry avg ~0.9%)"
                primary_weakness = "headline / visual hook — very low CTR means the creative is not stopping the scroll"
            elif ctr < 0.009:
                engagement_level = "below_avg"
                ctr_benchmark    = f"{round(ctr * 100, 3)}% (below avg 0.9%)"
                primary_weakness = "caption clarity and CTA — below-average CTR suggests copy or call-to-action is not compelling"
            elif ctr < 0.020:
                engagement_level = "average"
                ctr_benchmark    = f"{round(ctr * 100, 3)}% (at avg)"
                primary_weakness = "conversion path — CTR is acceptable, optimise landing page and hashtags for discoverability"
            else:
                engagement_level = "above_avg"
                ctr_benchmark    = f"{round(ctr * 100, 3)}% (above avg)"
                primary_weakness = "scale and fatigue prevention — strong CTR; prevent creative fatigue as frequency rises"

        current_creative = {}
        if ad.strategy_json:
            s = ad.strategy_json
            current_creative = {
                "title":    ad.title,
                "caption":  s.get("caption") or s.get("body") or "",
                "hashtags": s.get("hashtags", []),
                "cta":      s.get("cta", ""),
                "colors":   s.get("brand_colors", []),
                "font":     s.get("font_style", ""),
                "audience": s.get("target_audience", ""),
                "goal":     s.get("goal", ""),
            }

        return {
            "is_website":       is_website,
            "engagement_level": engagement_level,
            "ctr_benchmark":    ctr_benchmark,
            "primary_weakness": primary_weakness,
            "current_creative": current_creative,
        }

    # ── Reviewer context ──────────────────────────────────────────────────────

    def _extract_reviewer_context(self, reviews: List[Review]) -> Dict[str, Any]:
        context: Dict[str, Any] = {
            "total_reviews":    len(reviews),
            "revision_requests": [],
            "ethical_concerns":  [],
            "human_suggestions": [],
        }
        for r in reviews:
            if r.status == "revision":
                context["revision_requests"].append(r.comments)
            if r.review_type == "ethics":
                context["ethical_concerns"].append(r.comments)
            if r.suggestions:
                context["human_suggestions"].append(r.suggestions)
        return context

    # ── AI suggestion generation ──────────────────────────────────────────────

    async def _generate_ai_suggestions(
        self,
        ad: Advertisement,
        cost_analysis: Dict,
        content_signals: Dict,
        reviewer_context: Dict,
    ) -> Dict[str, Any]:
        """
        Call Claude with tightly constrained inputs and a strict output schema.
        Every suggestion item is grounded in the pre-computed signals — no free-form
        invention allowed. Falls back to deterministic mock when Bedrock is absent.
        """
        if not is_configured():
            return self._deterministic_mock(cost_analysis, content_signals)

        system_prompt = (
            "You are a precision marketing optimization engine. "
            "You receive pre-computed analytics signals and return ONLY a structured JSON object. "
            "Do NOT invent data. Reference the exact numbers provided in every 'why' field. "
            "Output ONLY a raw JSON object — no markdown, no code fences, no commentary. "
            "Your entire response must start with { and end with }."
        )

        ca = cost_analysis
        cs = content_signals
        cc = cs.get("current_creative", {})

        top_w = ca.get("top_traffic_windows", [])
        low_w = ca.get("low_traffic_windows", [])

        window_summary = ""
        if top_w:
            window_summary += "Top-CTR windows: " + ", ".join(
                f"{w['date']} (CTR {round(w['ctr'] * 100, 3)}%, spend ${round(w['spend'], 2)})"
                for w in top_w
            ) + ". "
        if low_w:
            window_summary += "Lowest-CTR windows: " + ", ".join(
                f"{w['date']} (CTR {round(w['ctr'] * 100, 3)}%, spend ${round(w['spend'], 2)})"
                for w in low_w
            ) + "."

        creative_ctx = (
            f"Title: '{cc.get('title', ad.title)}' | "
            f"Caption (first 120 chars): '{cc.get('caption', '')[:120]}' | "
            f"Hashtags: {cc.get('hashtags', [])} | "
            f"CTA: '{cc.get('cta', '')}' | "
            f"Colors: {cc.get('colors', [])} | "
            f"Font: '{cc.get('font', '')}' | "
            f"Audience: '{cc.get('audience', '')}' | "
            f"Goal: '{cc.get('goal', '')}'"
        )

        reviewer_notes = (
            f"Revision requests: {reviewer_context.get('revision_requests', [])} | "
            f"Ethical concerns: {reviewer_context.get('ethical_concerns', [])} | "
            f"Human suggestions: {reviewer_context.get('human_suggestions', [])}"
        )

        user_message = f"""## Ad: {ad.title}
Ad type: {ad.ad_type}
Engagement level: {cs.get('engagement_level')} | CTR: {cs.get('ctr_benchmark')}
Primary creative weakness: {cs.get('primary_weakness')}
Current creative: {creative_ctx}

## Cost Signals
Total spend: ${ca.get('total_spend', 0)} over {ca.get('data_points', 0)} days
Avg daily spend: ${ca.get('avg_spend_per_day', 0)} | Avg CPM: ${ca.get('avg_cpm', 0)}
CTR trend: {ca.get('ctr_trend')} | Spend trend: {ca.get('spend_trend')}
Budget signal: {ca.get('budget_signal')}
Rationale: {ca.get('budget_rationale')}
{window_summary}

## Reviewer Notes
{reviewer_notes}

Return EXACTLY this JSON shape — no extra keys, no deviations:
{{
  "cost_optimization": {{
    "overall_assessment": "<1-2 sentence summary using the signals above>",
    "items": [
      {{
        "what": "<specific, actionable budget/scheduling change>",
        "why": "<data-driven reason — must reference actual numbers from signals>",
        "prompt": "<self-contained AI prompt to implement or further refine this change>"
      }}
    ],
    "budget_distribution": {{
      "increase_days": ["<day or date>"],
      "reduce_days": ["<day or date>"],
      "reallocation_pct": "<percentage to shift, e.g. 25%>"
    }},
    "traffic_windows": [
      {{
        "window": "<date or period>",
        "recommended_action": "<increase|reduce|pause>",
        "reasoning": "<why, citing CTR/spend numbers>"
      }}
    ]
  }},
  "website_optimization": [
    {{
      "what": "<specific creative change for website: caption text, hashtag set, color hex, font name, title copy>",
      "why": "<data-driven reason referencing CTR/engagement numbers>",
      "prompt": "<complete AI prompt to generate the revised element>"
    }}
  ],
  "advertisement_optimization": [
    {{
      "what": "<specific creative change for ad: headline, body copy, image style, CTA phrase, hashtags, colors>",
      "why": "<data-driven reason referencing CTR/engagement numbers>",
      "prompt": "<complete AI prompt to generate the revised element>"
    }}
  ]
}}

Rules:
- cost_optimization.items: exactly 2-3 items, each grounded in cost signals above.
- website_optimization: exactly 3-4 items covering different creative elements (caption, hashtags, colors/font, title).
- advertisement_optimization: exactly 3-4 items covering different elements (headline, body, image style, CTA).
- Every "why" must cite a specific metric (CTR %, spend $, trend direction).
- Every "prompt" must be self-contained — include context so an AI can execute it without this conversation.
- Use current creative context to make "what" and "prompt" specific, not generic.
"""

        client   = get_async_client()
        response = await client.messages.create(
            model=get_model(),
            max_tokens=8000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        text = response.content[0].text.strip()

        def _extract(t: str) -> dict:
            # 1. Direct parse
            try:
                return json.loads(t)
            except Exception:
                pass
            # 2. Strip markdown code fences then parse
            try:
                cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", t)
                cleaned = re.sub(r"\s*```\s*$", "", cleaned).strip()
                return json.loads(cleaned)
            except Exception:
                pass
            # 3. Extract outermost {...} block (handles preamble/suffix text)
            try:
                start = t.index("{")
                end   = t.rindex("}") + 1
                return json.loads(t[start:end])
            except Exception:
                pass
            return {"raw_response": t}

        return _extract(text)

    # ── Deterministic mock (no Bedrock) ───────────────────────────────────────

    def _deterministic_mock(
        self, cost_analysis: Dict, content_signals: Dict
    ) -> Dict[str, Any]:
        """
        Fallback when Bedrock is not configured.
        Derives all suggestions from the pre-computed signals — no random strings.
        """
        ca = cost_analysis
        cs = content_signals
        cc = cs.get("current_creative", {})

        budget_signal    = ca.get("budget_signal",    "rebalance")
        ctr_trend        = ca.get("ctr_trend",        "stable")
        spend_trend      = ca.get("spend_trend",      "stable")
        budget_rationale = ca.get("budget_rationale", "No analytics data yet.")
        avg_cpm          = ca.get("avg_cpm",          0)
        avg_ctr          = ca.get("avg_ctr_pct",      0)
        total_spend      = ca.get("total_spend",      0)
        data_points      = ca.get("data_points",      0)
        top_w            = ca.get("top_traffic_windows", [])
        low_w            = ca.get("low_traffic_windows", [])

        engagement    = cs.get("engagement_level", "unknown")
        weakness      = cs.get("primary_weakness", "creative quality")
        ctr_benchmark = cs.get("ctr_benchmark",   "N/A")

        title    = cc.get("title",    "this campaign")
        caption  = cc.get("caption",  "")
        hashtags = cc.get("hashtags", [])
        cta      = cc.get("cta",      "Learn More")
        colors   = cc.get("colors",   [])
        font     = cc.get("font",     "not specified")
        audience = cc.get("audience", "general audience")
        goal     = cc.get("goal",     "healthcare trial")

        # ── Cost items ────────────────────────────────────────────────────────
        action_verb = "Reduce and redistribute" if budget_signal == "reduce_and_redistribute" else (
                      "Scale up"                if budget_signal == "increase_on_winners"     else
                      "Rebalance")

        no_analytics = (data_points == 0)

        cost_items = [
            {
                "what": (
                    "Set an initial daily budget and publish to Meta to start collecting data"
                    if no_analytics else
                    f"{action_verb} daily budget based on {ctr_trend} CTR trend"
                ),
                "why": (
                    "No performance data yet — launching the campaign will give you "
                    "real CTR and spend signals to optimise from."
                    if no_analytics else
                    budget_rationale
                ),
                "prompt": (
                    f"A new Meta ad campaign for '{goal}' targeting '{audience}' has not run yet. "
                    f"Recommend a starting daily budget range and bidding strategy for an awareness/traffic "
                    f"campaign. Assume a target CPA under $50 and suggest an initial test budget "
                    f"to generate statistically meaningful CTR data (minimum impressions threshold)."
                    if no_analytics else
                    f"A Meta ad campaign for '{goal}' has a {ctr_trend} CTR trend "
                    f"with avg CTR {avg_ctr}% and avg CPM ${avg_cpm} over {data_points} days "
                    f"(total spend ${total_spend}). "
                    f"Using marginal resource allocation principles, recommend a specific daily "
                    f"budget reallocation strategy with exact percentages per day-of-week."
                ),
            }
        ]

        if top_w:
            tw = top_w[0]
            cost_items.append({
                "what": (
                    f"Concentrate 60–70% of weekly budget around {tw['date']} "
                    f"and similar high-CTR windows"
                ),
                "why": (
                    f"CTR on {tw['date']} was {round(tw['ctr'] * 100, 3)}% "
                    f"vs campaign avg {avg_ctr}% — highest marginal return per dollar spent"
                ),
                "prompt": (
                    f"A Meta ad for '{goal}' achieves its highest CTR ({round(tw['ctr'] * 100, 3)}%) "
                    f"on {tw['date']} vs campaign avg {avg_ctr}%. "
                    f"Generate a day-parting budget schedule that concentrates spend on "
                    f"similar high-performance windows while reducing spend on days below "
                    f"{round(avg_ctr * 0.8, 3)}% CTR. Return a 7-day schedule with % allocations."
                ),
            })

        if low_w:
            lw = low_w[0]
            cost_items.append({
                "what": (
                    f"Pause or reduce spend on {lw['date']} "
                    f"(CTR {round(lw['ctr'] * 100, 3)}%) — below marginal return threshold"
                ),
                "why": (
                    f"Spend on {lw['date']} returned only {round(lw['ctr'] * 100, 3)}% CTR "
                    f"against a campaign avg of {avg_ctr}% — "
                    f"marginal return is negative relative to opportunity cost"
                ),
                "prompt": (
                    f"Analyse whether running ads on days with CTR {round(lw['ctr'] * 100, 3)}% "
                    f"is viable when campaign avg CTR is {avg_ctr}% and avg CPM is ${avg_cpm}. "
                    f"Propose a threshold rule (CTR floor %) below which budget should be paused, "
                    f"and suggest where that budget should be reallocated."
                ),
            })

        # ── Content items ─────────────────────────────────────────────────────
        if engagement in ("very_low", "below_avg"):
            website_items = [
                {
                    "what": f"Rewrite page headline to immediately address '{audience}' pain point",
                    "why":  f"CTR {ctr_benchmark} signals the headline is not stopping the scroll — primary weakness: {weakness}",
                    "prompt": (
                        f"Rewrite the headline for a '{goal}' landing page targeting '{audience}'. "
                        f"Current headline: '{title}'. "
                        f"CTR is {ctr_benchmark} — write 3 alternatives that lead with the core "
                        f"benefit and create immediate relevance for the target audience. "
                        f"Each headline must be under 10 words."
                    ),
                },
                {
                    "what": f"Add 6–8 targeted hashtags mixing broad healthcare + niche trial-specific tags",
                    "why":  f"Current hashtags {hashtags} may not be reaching the full '{audience}' segment — discoverability gap",
                    "prompt": (
                        f"For a '{goal}' campaign targeting '{audience}', current hashtags: {hashtags}. "
                        f"Suggest 8 high-engagement hashtags for Meta (mix: 3 broad healthcare, "
                        f"3 niche trial/condition-specific, 2 campaign-branded). "
                        f"Rank by expected reach and include a one-line rationale for each."
                    ),
                },
                {
                    "what": f"Shift primary CTA color to high-contrast accent — currently {colors or 'not set'}",
                    "why":  f"Below-average CTR ({ctr_benchmark}) suggests the CTA button is not visually prominent enough",
                    "prompt": (
                        f"Current brand colors: {colors}. "
                        f"Suggest a CTA button color (hex) that creates strong contrast against "
                        f"the primary background color while remaining accessible (WCAG AA). "
                        f"Also suggest revised surrounding copy to reinforce urgency for a '{goal}' campaign."
                    ),
                },
                {
                    "what": f"Rewrite caption to front-load the value proposition in the first sentence",
                    "why":  f"CTR {ctr_benchmark} — users are not reading through to the CTA; front-loading value increases click intent",
                    "prompt": (
                        f"Rewrite this caption for a '{goal}' website targeting '{audience}': "
                        f"'{caption[:200] or '(no caption set)'}'. "
                        f"The new version must: (1) open with the strongest benefit, "
                        f"(2) keep under 150 words, (3) end with '{cta}' as the call-to-action. "
                        f"Return 2 variants."
                    ),
                },
            ]
            ad_items = [
                {
                    "what": "Rewrite ad headline to be benefit-first and under 40 characters",
                    "why":  f"CTR {ctr_benchmark} is below industry average — headline must communicate the benefit in the first read",
                    "prompt": (
                        f"Rewrite the Meta ad headline for a '{goal}' campaign. "
                        f"Current headline: '{title}'. Audience: '{audience}'. "
                        f"Write 3 benefit-first alternatives, each under 40 characters, "
                        f"avoiding medical jargon that may trigger ad policy flags."
                    ),
                },
                {
                    "what": "Shorten body copy to 2 sentences: problem → solution → CTA",
                    "why":  f"Below-average CTR ({ctr_benchmark}) — long copy loses attention before the CTA; 2-sentence structure increases read-through",
                    "prompt": (
                        f"Condense this Meta ad caption to exactly 2 sentences for a '{goal}' ad: "
                        f"'{caption[:200] or '(no caption set)'}'. "
                        f"Sentence 1: relatable problem for '{audience}'. "
                        f"Sentence 2: solution + CTA '{cta}'. "
                        f"Return 2 variants."
                    ),
                },
                {
                    "what": "Use high-contrast image: warm tones, clear human focal point, minimal text overlay",
                    "why":  f"Primary creative weakness is '{weakness}' — image composition is the fastest lever to improve scroll-stop rate",
                    "prompt": (
                        f"Describe the ideal image for a Meta ad with goal '{goal}', "
                        f"targeting '{audience}'. "
                        f"Specify: color temperature, main subject, background, "
                        f"facial expression if applicable, text overlay (yes/no and style), "
                        f"and overall emotional tone. Be specific enough for a designer or image AI."
                    ),
                },
                {
                    "what": f"Update CTA from '{cta}' to a more action-specific phrase with urgency",
                    "why":  f"Generic CTAs underperform on Meta — specificity increases CTR; current level {ctr_benchmark}",
                    "prompt": (
                        f"Improve the CTA for a '{goal}' Meta ad currently using '{cta}'. "
                        f"Audience: '{audience}'. "
                        f"Suggest 3 more specific and urgent alternatives that comply with "
                        f"healthcare advertising guidelines. Include a brief rationale for each."
                    ),
                },
            ]

        else:
            # At or above average — focus on scaling and fatigue prevention
            website_items = [
                {
                    "what": "A/B test 2 headline variants: urgency angle vs social-proof angle",
                    "why":  f"CTR {ctr_benchmark} is solid — systematic A/B testing is the safest way to push performance further before scaling",
                    "prompt": (
                        f"Generate 2 A/B test headline variants for a '{goal}' landing page "
                        f"targeting '{audience}'. Current headline: '{title}'. "
                        f"Variant A: urgency/scarcity angle. "
                        f"Variant B: social proof / outcome data angle. "
                        f"Each under 10 words."
                    ),
                },
                {
                    "what": "Add 3–5 trending niche hashtags to sustain organic reach momentum",
                    "why":  f"CTR {ctr_benchmark} is above average — expanding the hashtag strategy with niche tags can compound organic reach",
                    "prompt": (
                        f"Suggest 5 trending (2025–2026) niche hashtags for a '{goal}' campaign "
                        f"targeting '{audience}' on Meta. "
                        f"Current hashtags: {hashtags}. "
                        f"Focus on engaged-community tags (10K–500K posts), not just high-volume."
                    ),
                },
                {
                    "what": "Introduce a seasonal color palette variation to prevent creative fatigue",
                    "why":  f"Strong CTR ({ctr_benchmark}) is at risk of declining as ad frequency rises — a fresh palette maintains attention",
                    "prompt": (
                        f"Suggest a seasonal color palette variation for a campaign currently using "
                        f"{colors or 'default colors'}. "
                        f"The variation should feel fresh but maintain brand recognition. "
                        f"Provide: primary (#hex), secondary (#hex), accent (#hex), "
                        f"and a one-sentence rationale for the seasonal shift."
                    ),
                },
                {
                    "what": "Test a story-driven caption opening with a patient/participant perspective",
                    "why":  f"Above-average CTR ({ctr_benchmark}) — narrative hooks can improve post-click conversion by building empathy",
                    "prompt": (
                        f"Write a story-driven caption variant for a '{goal}' website page "
                        f"targeting '{audience}'. "
                        f"Open from the perspective of someone in the '{audience}' segment, "
                        f"transition to the trial/study opportunity, and end with '{cta}'. "
                        f"Keep under 180 words. Return 2 variants."
                    ),
                },
            ]
            ad_items = [
                {
                    "what": "Test a social-proof headline variant citing participant numbers or study outcomes",
                    "why":  f"CTR {ctr_benchmark} — strong engagement; social proof can convert existing attention into trust for higher click-through",
                    "prompt": (
                        f"Write a social-proof Meta ad headline for a '{goal}' campaign "
                        f"targeting '{audience}'. Current headline: '{title}'. "
                        f"The variant should cite a trust signal (participant count, study duration, "
                        f"institutional affiliation). Under 40 characters. "
                        f"Return 3 options compliant with healthcare ad policies."
                    ),
                },
                {
                    "what": "Test clinical vs lifestyle image style with Meta dynamic creative",
                    "why":  f"CTR {ctr_benchmark} is above average — image style testing can find the highest-converting visual approach before scaling budget",
                    "prompt": (
                        f"Describe two contrasting image styles for a '{goal}' Meta ad targeting '{audience}'. "
                        f"Style 1 — Clinical/professional: composition, lighting, subject, background. "
                        f"Style 2 — Lifestyle/relatable: composition, lighting, subject, background. "
                        f"For each, specify the emotional tone and expected audience response."
                    ),
                },
                {
                    "what": f"Add urgency element to CTA: change '{cta}' to a time-bounded phrase",
                    "why":  f"Good CTR ({ctr_benchmark}) — adding urgency to the CTA can increase registration conversion without changing the creative",
                    "prompt": (
                        f"Rewrite the CTA for a '{goal}' Meta ad, adding an urgency or scarcity element. "
                        f"Current CTA: '{cta}'. Audience: '{audience}'. "
                        f"Provide 3 alternatives that are truthful and compliant with healthcare "
                        f"advertising guidelines (no false urgency)."
                    ),
                },
                {
                    "what": "Create a campaign-branded hashtag for recall and community building",
                    "why":  f"Strong CTR ({ctr_benchmark}) creates an opportunity to build brand recall with a consistent campaign hashtag that scales",
                    "prompt": (
                        f"Create a campaign-branded hashtag for a '{goal}' campaign "
                        f"targeting '{audience}'. "
                        f"The hashtag should be unique, memorable, and appropriate for Meta. "
                        f"Suggest 3 options with: hashtag text, expected discoverability (niche/medium/broad), "
                        f"and a one-line rationale."
                    ),
                },
            ]

        # ── Assemble output ───────────────────────────────────────────────────
        increase_days = [w["date"] for w in top_w]
        reduce_days   = [w["date"] for w in low_w]
        realloc_pct   = "25–30%" if budget_signal != "rebalance" else "10–15%"

        return {
            "cost_optimization": {
                "overall_assessment": (
                    f"Campaign has spent ${total_spend} across {data_points} days "
                    f"with a {ctr_trend} CTR trend. {budget_rationale}"
                ),
                "items": cost_items,
                "budget_distribution": {
                    "increase_days": increase_days,
                    "reduce_days":   reduce_days,
                    "reallocation_pct": realloc_pct,
                },
                "traffic_windows": [
                    {
                        "window":              w["date"],
                        "recommended_action":  "increase",
                        "reasoning":           f"CTR {round(w['ctr'] * 100, 3)}% vs avg {avg_ctr}%",
                    }
                    for w in top_w
                ] + [
                    {
                        "window":              w["date"],
                        "recommended_action":  "reduce",
                        "reasoning":           f"CTR {round(w['ctr'] * 100, 3)}% — below marginal return threshold",
                    }
                    for w in low_w
                ],
            },
            "website_optimization":      website_items,
            "advertisement_optimization": ad_items,
        }
