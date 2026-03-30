"""
Website Agent - Static Landing Page Generator
Owner: AI Dev

Architecture:
  - Python injects brand colors into a fixed CSS template (Claude writes no CSS)
  - Claude writes ONLY the <body> HTML using pre-defined CSS classes
  - Survey section is AI-generated from eligibility/website_reqs criteria
  - Survey JS + chat widget JS injected by Python (always correct, never truncated)
  - Voicebot / chatbot interaction section is hidden; JS reveals it after survey submit

Page order: nav → hero → survey → [interaction hidden] → features → cta → footer
"""

import json
import logging
import os
from typing import List, Optional

from app.core.bedrock import get_async_client, get_model, is_configured
from app.core.config import settings
from app.models.models import Advertisement, BrandKit, Company

logger = logging.getLogger(__name__)

# ── System prompt ──────────────────────────────────────────────────────────────
_BODY_SYSTEM_PROMPT = """You are an expert clinical-trial / healthcare marketing copywriter and HTML developer.

Write the BODY CONTENT for a campaign landing page.
Output ONLY the inner HTML — starting with <nav> and ending with </footer>.
Do NOT output DOCTYPE, <html>, <head>, <style>, or <script> tags.
No inline styles. No custom CSS classes. Use ONLY the classes listed below.

━━ AVAILABLE CSS CLASSES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NAV:        .logo  .nav-cta
HERO:       .hero  .hero-badge  .hero-headline  .hero-sub
            .benefit-chips  .chip  .btn.btn-primary  .btn.btn-outline
SECTION:    .section  .section-title  .section-sub
CARDS:      .card-grid  .card  .card-icon  .card-title  .card-desc
CHECKLIST:  .checklist  .checklist-item
CTA:        .cta-section  .cta-inner  .cta-title  .cta-sub
FOOTER:     footer  .trust-bar  .trust-item  .footer-copy

SURVEY (always include):
  Wrapper:    <section class="survey-section" id="survey-section">
  Card:       .survey-card
  Header:     .survey-header  .survey-title  .survey-sub
  Progress:   <div class="survey-progress-bar"><div class="survey-progress-fill" id="survey-progress"></div></div>
              <p class="survey-step-count" id="survey-step-count">Question 1 of N</p>
  Steps:      <div class="survey-step" data-step="N" data-eligible="COMMA,SEPARATED,ELIGIBLE,VALUES">
                <p class="survey-question">Question text?</p>
                <div class="option-grid">
                  <button class="option-btn" data-value="VALUE">Label</button>
                  ...
                </div>
              </div>
              (make first step have class "survey-step active")
  Result:     <div class="survey-result" id="survey-result">
                <div class="result-card eligible" id="result-eligible">...</div>
                <div class="result-card ineligible" id="result-ineligible">...</div>
              </div>
  Nav:        <div class="survey-nav">
                <button class="btn-survey-prev" id="survey-prev">← Back</button>
                <button class="btn-survey-next" id="survey-next">Next →</button>
                <button class="btn-survey-submit" id="survey-submit">See My Result →</button>
              </div>

INTERACTION (voicebot — place AFTER survey with id="interaction-reveal"):
  <section class="interaction-section" id="interaction-reveal">
  .interaction-section__title  .interaction-section__sub  .interaction-cards
  .interaction-card  .interaction-card.featured
  .interaction-card__icon  .interaction-card__title  .interaction-card__desc
  .interaction-card__btn  .interaction-card__meta
  IMPORTANT: The "Start Voice Call" button MUST have id="voice-call-btn".
  The "Request a Callback" button MUST have id="callback-btn".
  These IDs are required for the voice JS to wire up correctly.

CHATBOT: The chat widget floats in the bottom-right corner — the system injects it automatically.
  Do NOT add any chat HTML to the page body.
  Instead place this reveal anchor immediately after the survey section:
    <section class="cta-section" id="interaction-reveal">
      <div class="cta-inner">
        <h2 class="cta-title">Chat with [Bot Name] Now</h2>
        <p class="cta-sub">Click the chat button in the bottom-right corner — [Bot Name] is ready to help.</p>
      </div>
    </section>
  (id="interaction-reveal" is required so JS can scroll to it and open the chat panel.)

━━ RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Generate 4–6 survey questions based on the eligibility criteria provided.
2. Each question must have 2–4 answer options. Mark eligible answers in data-eligible.
3. result-eligible: encouraging message + "Connect with us below"
4. result-ineligible: empathetic message + a .consent-box with:
   <label class="consent-label"><input type="checkbox" class="consent-checkbox" id="consent-check" /> "You don't meet the criteria for this trial, but you might qualify for our upcoming trials. May we retain your details to notify you?"</label>
   <button class="consent-submit" id="consent-submit">Yes, Keep Me Updated</button>
   <p class="consent-thanks" id="consent-thanks">✓ Thank you! We'll be in touch when a matching trial opens.</p>
5. The interaction section (voicebot/chatbot) must have id="interaction-reveal" — JS hides it initially and reveals it after survey.
6. Use emoji icons in .card-icon and .interaction-card__icon.
7. Fill ALL content with real campaign copy — no placeholder text.
"""


class WebsiteAgentService:
    def __init__(self, company_id: str):
        self.company_id = company_id

    async def generate_website(
        self,
        ad: Advertisement,
        brand_kit: Optional[BrandKit],
        company: Optional[Company],
    ) -> str:
        output_dir = os.path.join(settings.OUTPUT_DIR, self.company_id, ad.id, "website")
        os.makedirs(output_dir, exist_ok=True)

        ad_types    = [t.lower() for t in (ad.ad_type or [])]
        bot_config  = ad.bot_config or {}
        bot_name    = bot_config.get("name", "Assistant") if isinstance(bot_config, dict) else "Assistant"
        bot_welcome = bot_config.get("welcome_message", f"Hi! I'm {bot_name}. How can I help you today?") if isinstance(bot_config, dict) else f"Hi! I'm {bot_name}."
        css         = self._build_css(brand_kit)
        body        = await self._generate_body(ad, brand_kit, company)
        html        = self._wrap_html(ad.title, css, body, ad_types, bot_name, bot_welcome, ad_id=ad.id)

        index_path = os.path.join(output_dir, "index.html")
        with open(index_path, "w", encoding="utf-8") as f:
            f.write(html)

        return f"/outputs/{self.company_id}/{ad.id}/website/index.html"

    # ── CSS template (brand colors injected, never written by Claude) ─────────

    def _build_css(self, brand_kit: Optional[BrandKit]) -> str:
        primary   = (brand_kit.primary_color   if brand_kit else None) or "#1e3a5f"
        secondary = (brand_kit.secondary_color if brand_kit else None) or "#0f172a"
        accent    = (brand_kit.accent_color    if brand_kit else None) or "#10b981"
        font      = (brand_kit.primary_font    if brand_kit else None) or "Inter"
        font_url  = font.replace(" ", "+")

        return f"""
    @import url('https://fonts.googleapis.com/css2?family={font_url}:wght@400;500;600;700;800&display=swap');

    :root {{
      --primary:   {primary};
      --secondary: {secondary};
      --accent:    {accent};
      --bg:        #f0f4f8;
      --white:     #ffffff;
      --text:      #1e293b;
      --muted:     #64748b;
      --border:    #e2e8f0;
    }}

    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: '{font}', system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; -webkit-font-smoothing: antialiased; }}

    /* NAV */
    nav {{ background: var(--secondary); padding: 16px 48px; display: flex; align-items: center; justify-content: space-between; }}
    .logo {{ color: #fff; font-size: 1.05rem; font-weight: 700; display: flex; align-items: center; gap: 10px; text-decoration: none; }}
    .logo img {{ height: 36px; object-fit: contain; }}
    .nav-cta {{ background: var(--accent); color: #fff; padding: 9px 22px; border-radius: 50px; font-size: 0.88rem; font-weight: 600; text-decoration: none; border: none; cursor: pointer; transition: opacity 0.2s; }}
    .nav-cta:hover {{ opacity: 0.88; }}

    /* HERO */
    .hero {{ background: linear-gradient(140deg, var(--primary) 0%, var(--secondary) 100%); color: #fff; padding: 80px 48px; text-align: center; }}
    .hero-badge {{ display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22); border-radius: 50px; padding: 5px 16px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; margin-bottom: 24px; }}
    .hero-headline {{ font-size: clamp(2rem, 5vw, 3.25rem); font-weight: 800; line-height: 1.15; letter-spacing: -0.02em; margin-bottom: 18px; }}
    .hero-headline span {{ color: var(--accent); }}
    .hero-sub {{ font-size: 1.05rem; color: rgba(255,255,255,0.78); max-width: 560px; margin: 0 auto 32px; }}
    .benefit-chips {{ display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-bottom: 36px; }}
    .chip {{ display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 50px; padding: 5px 14px; font-size: 0.8rem; color: rgba(255,255,255,0.9); }}
    .chip::before {{ content: '✓'; color: var(--accent); font-weight: 700; }}

    /* BUTTONS */
    .btn {{ display: inline-block; padding: 13px 34px; border-radius: 50px; font-size: 0.97rem; font-weight: 700; text-decoration: none; border: none; cursor: pointer; transition: opacity 0.18s, transform 0.1s; }}
    .btn:hover {{ opacity: 0.88; transform: translateY(-1px); }}
    .btn-primary {{ background: var(--accent); color: #fff; }}
    .btn-outline {{ background: transparent; color: #fff; border: 2px solid rgba(255,255,255,0.45); }}
    .btn-dark {{ background: var(--secondary); color: #fff; }}

    /* SECTIONS */
    .section {{ padding: 72px 48px; max-width: 1100px; margin: 0 auto; }}
    .section-title {{ font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 700; text-align: center; color: var(--primary); margin-bottom: 10px; }}
    .section-sub {{ text-align: center; color: var(--muted); font-size: 1rem; max-width: 540px; margin: 0 auto 44px; }}

    /* CARDS */
    .card-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 20px; }}
    .card {{ background: var(--white); border: 1px solid var(--border); border-radius: 14px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); transition: box-shadow 0.2s; }}
    .card:hover {{ box-shadow: 0 4px 16px rgba(0,0,0,0.1); }}
    .card-icon {{ width: 44px; height: 44px; border-radius: 10px; background: rgba(16,185,129,0.1); display: flex; align-items: center; justify-content: center; font-size: 1.25rem; margin-bottom: 14px; }}
    .card-title {{ font-size: 0.95rem; font-weight: 700; color: var(--text); margin-bottom: 6px; }}
    .card-desc {{ font-size: 0.85rem; color: var(--muted); line-height: 1.6; }}

    /* CHECKLIST */
    .checklist {{ list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }}
    .checklist-item {{ background: var(--white); border: 1px solid var(--border); border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; gap: 10px; font-size: 0.9rem; font-weight: 500; color: var(--text); }}
    .checklist-item::before {{ content: '✓'; color: var(--accent); font-weight: 700; font-size: 1rem; flex-shrink: 0; }}

    /* CTA */
    .cta-section {{ background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); color: #fff; text-align: center; padding: 80px 48px; }}
    .cta-inner {{ max-width: 640px; margin: 0 auto; }}
    .cta-title {{ font-size: clamp(1.75rem, 4vw, 2.5rem); font-weight: 800; line-height: 1.18; margin-bottom: 14px; }}
    .cta-sub {{ font-size: 1.05rem; color: rgba(255,255,255,0.75); margin-bottom: 32px; }}

    /* FOOTER */
    footer {{ background: var(--secondary); padding: 28px 48px; }}
    .trust-bar {{ display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; margin-bottom: 18px; }}
    .trust-item {{ display: flex; align-items: center; gap: 7px; font-size: 0.82rem; color: rgba(255,255,255,0.6); }}
    .trust-item strong {{ color: rgba(255,255,255,0.9); }}
    .footer-copy {{ text-align: center; font-size: 0.75rem; color: rgba(255,255,255,0.38); }}

    /* ═══ SURVEY ═══════════════════════════════════════════════════════════ */
    .survey-section {{ background: var(--white); padding: 72px 48px; }}
    .survey-card {{ max-width: 680px; margin: 0 auto; background: var(--white); border: 1px solid var(--border); border-radius: 20px; padding: 44px 48px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }}
    .survey-header {{ margin-bottom: 32px; }}
    .survey-title {{ font-size: 1.6rem; font-weight: 800; color: var(--primary); margin-bottom: 8px; text-align: center; }}
    .survey-sub {{ color: var(--muted); text-align: center; font-size: 0.95rem; margin-bottom: 24px; }}
    .survey-progress-bar {{ height: 6px; background: var(--border); border-radius: 50px; overflow: hidden; margin-bottom: 10px; }}
    .survey-progress-fill {{ height: 100%; background: var(--accent); border-radius: 50px; width: 0%; transition: width 0.4s ease; }}
    .survey-step-count {{ font-size: 0.78rem; color: var(--muted); text-align: right; font-weight: 500; }}
    .survey-step {{ display: none; }}
    .survey-step.active {{ display: block; }}
    .survey-question {{ font-size: 1.1rem; font-weight: 700; color: var(--text); margin-bottom: 20px; line-height: 1.45; }}
    .option-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }}
    .option-btn {{ padding: 14px 18px; border: 2px solid var(--border); border-radius: 12px; background: var(--white); font-size: 0.9rem; font-weight: 500; color: var(--text); cursor: pointer; text-align: left; transition: border-color 0.15s, background 0.15s; font-family: inherit; }}
    .option-btn:hover {{ border-color: var(--accent); background: rgba(16,185,129,0.04); }}
    .option-btn.selected {{ border-color: var(--accent); background: rgba(16,185,129,0.08); color: var(--primary); font-weight: 700; }}
    .survey-nav {{ display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border); }}
    .btn-survey-prev {{ background: transparent; border: 1.5px solid var(--border); color: var(--muted); padding: 10px 24px; border-radius: 50px; font-size: 0.9rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: border-color 0.15s; }}
    .btn-survey-prev:hover {{ border-color: var(--primary); color: var(--primary); }}
    .btn-survey-next, .btn-survey-submit {{ background: var(--accent); color: #fff; padding: 11px 28px; border-radius: 50px; font-size: 0.9rem; font-weight: 700; border: none; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }}
    .btn-survey-next:hover, .btn-survey-submit:hover {{ opacity: 0.88; }}
    .btn-survey-next:disabled, .btn-survey-submit:disabled {{ opacity: 0.4; cursor: not-allowed; }}
    .survey-result {{ display: none; text-align: center; padding: 8px 0; }}
    .result-card {{ border-radius: 16px; padding: 32px 28px; display: none; }}
    .result-card.eligible {{ background: rgba(16,185,129,0.08); border: 2px solid var(--accent); }}
    .result-card.ineligible {{ background: rgba(245,158,11,0.08); border: 2px solid #f59e0b; }}
    .result-icon {{ font-size: 2.5rem; margin-bottom: 12px; }}
    .result-card h3 {{ font-size: 1.25rem; font-weight: 800; margin-bottom: 8px; color: var(--text); }}
    .result-card p {{ font-size: 0.95rem; color: var(--muted); line-height: 1.6; }}
    .result-card.eligible .result-icon::before {{ content: '✅'; }}
    .result-card.ineligible .result-icon::before {{ content: '💛'; }}
    .consent-box {{ margin-top: 20px; background: rgba(245,158,11,0.06); border: 1.5px solid #f59e0b; border-radius: 12px; padding: 18px 20px; text-align: left; }}
    .consent-label {{ display: flex; align-items: flex-start; gap: 12px; cursor: pointer; font-size: 0.9rem; color: var(--text); line-height: 1.5; }}
    .consent-checkbox {{ width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; flex-shrink: 0; margin-top: 2px; }}
    .consent-submit {{ display: none; margin-top: 14px; width: 100%; padding: 11px; border-radius: 50px; background: var(--accent); color: #fff; font-size: 0.9rem; font-weight: 700; border: none; cursor: pointer; font-family: inherit; transition: opacity 0.2s; }}
    .consent-submit:hover {{ opacity: 0.88; }}
    .consent-thanks {{ display: none; margin-top: 14px; text-align: center; font-size: 0.88rem; color: var(--accent); font-weight: 600; }}

    /* ═══ VOICEBOT ═══════════════════════════════════════════════════════════ */
    .interaction-section {{ background: var(--bg); padding: 72px 48px; text-align: center; }}
    .interaction-section__title {{ font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 800; color: var(--text); margin-bottom: 10px; }}
    .interaction-section__sub {{ color: var(--muted); font-size: 1rem; max-width: 500px; margin: 0 auto 44px; }}
    .interaction-cards {{ display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; max-width: 760px; margin: 0 auto 28px; }}
    .interaction-card {{ background: var(--white); border: 2px solid var(--border); border-radius: 18px; padding: 36px 28px; width: 300px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; transition: box-shadow 0.2s, border-color 0.2s; }}
    .interaction-card:hover {{ box-shadow: 0 6px 24px rgba(0,0,0,0.1); }}
    .interaction-card.featured {{ border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }}
    .interaction-card__icon {{ width: 64px; height: 64px; border-radius: 50%; background: rgba(16,185,129,0.12); display: flex; align-items: center; justify-content: center; font-size: 1.75rem; margin-bottom: 4px; }}
    .interaction-card__title {{ font-size: 1.1rem; font-weight: 700; color: var(--text); }}
    .interaction-card__desc {{ font-size: 0.86rem; color: var(--muted); line-height: 1.6; }}
    .interaction-card__btn {{ width: 100%; padding: 12px 20px; border-radius: 50px; font-size: 0.92rem; font-weight: 700; border: none; cursor: pointer; margin-top: 4px; transition: opacity 0.2s; text-decoration: none; display: inline-block; color: #fff; font-family: inherit; }}
    .interaction-card.featured .interaction-card__btn {{ background: var(--accent); }}
    .interaction-card:not(.featured) .interaction-card__btn {{ background: var(--secondary); }}
    .interaction-card__meta {{ font-size: 0.75rem; color: var(--muted); }}
    .interaction-note {{ font-size: 0.8rem; color: var(--muted); max-width: 520px; margin: 0 auto; }}
    .mic-btn {{ width: 64px; height: 64px; border-radius: 50%; background: var(--accent); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.6rem; color: #fff; position: relative; margin: 0 auto; }}
    .mic-btn::after {{ content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 2px solid var(--accent); opacity: 0; animation: mic-pulse 2s ease-out infinite; }}
    @keyframes mic-pulse {{ 0% {{ transform: scale(1); opacity: 0.6; }} 100% {{ transform: scale(1.5); opacity: 0; }} }}

    /* ═══ CHATBOT — floating widget ════════════════════════════════════════ */
    #chat-float {{ position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }}
    .chat-toggle-btn {{ width: 58px; height: 58px; border-radius: 50%; background: var(--accent); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; box-shadow: 0 4px 20px rgba(0,0,0,0.22); transition: transform 0.2s; flex-shrink: 0; }}
    .chat-toggle-btn:hover {{ transform: scale(1.08); }}
    .chat-unread {{ position: absolute; top: 0; right: 0; width: 16px; height: 16px; background: #ef4444; border-radius: 50%; border: 2px solid #fff; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; color: #fff; font-weight: 700; }}
    .chat-panel {{ background: var(--white); border-radius: 18px; box-shadow: 0 8px 40px rgba(0,0,0,0.18); width: 340px; overflow: hidden; flex-direction: column; display: none; transform-origin: bottom right; }}
    .chat-panel.open {{ display: flex; animation: chat-pop 0.22s ease; }}
    @keyframes chat-pop {{ from {{ opacity: 0; transform: scale(0.88); }} to {{ opacity: 1; transform: scale(1); }} }}
    .chat-panel__header {{ background: linear-gradient(135deg, var(--primary), var(--secondary)); padding: 14px 16px; display: flex; align-items: center; gap: 10px; }}
    .chat-avatar {{ width: 38px; height: 38px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; }}
    .chat-agent-info {{ flex: 1; }}
    .chat-agent-name {{ color: #fff; font-size: 0.92rem; font-weight: 700; }}
    .chat-agent-status {{ color: rgba(255,255,255,0.7); font-size: 0.72rem; display: flex; align-items: center; gap: 4px; }}
    .chat-agent-status::before {{ content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); display: inline-block; }}
    .chat-close-btn {{ background: rgba(255,255,255,0.15); border: none; color: #fff; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s; }}
    .chat-close-btn:hover {{ background: rgba(255,255,255,0.28); }}
    .chat-messages {{ height: 260px; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; background: #f8fafc; }}
    .chat-bubble {{ max-width: 82%; padding: 9px 13px; border-radius: 14px; font-size: 0.86rem; line-height: 1.5; }}
    .chat-bubble.bot {{ background: var(--white); border: 1px solid var(--border); color: var(--text); align-self: flex-start; border-bottom-left-radius: 3px; }}
    .chat-bubble.user {{ background: var(--accent); color: #fff; align-self: flex-end; border-bottom-right-radius: 3px; }}
    .chat-footer {{ padding: 10px 12px; border-top: 1px solid var(--border); display: flex; gap: 8px; background: var(--white); }}
    .chat-input {{ flex: 1; border: 1px solid var(--border); border-radius: 50px; padding: 8px 14px; font-size: 0.86rem; font-family: inherit; outline: none; color: var(--text); background: #f8fafc; }}
    .chat-input:focus {{ border-color: var(--accent); background: var(--white); }}
    .chat-send-btn {{ background: var(--accent); color: #fff; border: none; border-radius: 50%; width: 34px; height: 34px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; flex-shrink: 0; transition: opacity 0.2s; font-family: inherit; }}
    .chat-send-btn:hover {{ opacity: 0.85; }}

    /* RESPONSIVE */
    @media (max-width: 768px) {{
      nav {{ padding: 14px 20px; }}
      .hero {{ padding: 52px 20px; }}
      .section {{ padding: 52px 20px; }}
      .cta-section {{ padding: 52px 20px; }}
      .survey-section {{ padding: 40px 16px; }}
      .survey-card {{ padding: 28px 20px; }}
      .interaction-section {{ padding: 52px 20px; }}
      #chat-float {{ bottom: 16px; right: 16px; }}
      .chat-panel {{ width: 300px; }}
      footer {{ padding: 24px 20px; }}
      .interaction-cards {{ flex-direction: column; align-items: center; }}
    }}
"""

    # ── HTML wrapper ───────────────────────────────────────────────────────────

    def _wrap_html(
        self,
        title: str,
        css: str,
        body: str,
        ad_types: List[str],
        bot_name: str = "Assistant",
        bot_welcome: str = "Hi! How can I help you today?",
        ad_id: str = "",
    ) -> str:
        has_chat     = "chatbot"  in ad_types
        has_voice    = "voicebot" in ad_types
        has_interact = has_chat or has_voice

        survey_js = """
<script>
/* ── Survey engine ─────────────────────────────────────────────────────── */
(function () {
  var steps    = Array.from(document.querySelectorAll('.survey-step'));
  var current  = 0;
  var answers  = {};
  var progress = document.getElementById('survey-progress');
  var counter  = document.getElementById('survey-step-count');
  var btnPrev  = document.getElementById('survey-prev');
  var btnNext  = document.getElementById('survey-next');
  var btnSub   = document.getElementById('survey-submit');
  var result   = document.getElementById('survey-result');

  if (!steps.length) return;

  function setProgress() {
    var pct = (current / steps.length) * 100;
    if (progress) progress.style.width = pct + '%';
    if (counter)  counter.textContent  = 'Question ' + (current + 1) + ' of ' + steps.length;
  }

  function show(idx) {
    steps.forEach(function (s, i) { s.classList.toggle('active', i === idx); });
    if (btnPrev) btnPrev.style.display = idx > 0 ? 'inline-block' : 'none';
    var last = idx === steps.length - 1;
    if (btnNext) btnNext.style.display = last ? 'none' : 'inline-block';
    if (btnSub)  btnSub.style.display  = last ? 'inline-block' : 'none';
    setProgress();
  }

  /* Answer selection */
  document.querySelectorAll('.option-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var step = btn.closest('.survey-step');
      step.querySelectorAll('.option-btn').forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      var idx = steps.indexOf(step);
      var eligible = (step.dataset.eligible || '').split(',').map(function (v) { return v.trim().toLowerCase(); });
      answers[idx] = { value: btn.dataset.value, ok: eligible.includes(btn.dataset.value.toLowerCase()) };
    });
  });

  /* Shake animation on no-answer-next */
  function shake(el) {
    el.style.animation = 'none';
    el.offsetHeight; /* reflow */
    el.style.animation = 'survey-shake 0.4s ease';
  }

  if (btnNext) btnNext.addEventListener('click', function () {
    if (!answers[current]) { shake(steps[current]); return; }
    current++;
    show(current);
  });

  if (btnPrev) btnPrev.addEventListener('click', function () {
    current--;
    show(current);
  });

  if (btnSub) btnSub.addEventListener('click', function () {
    if (!answers[current]) { shake(steps[current]); return; }
    /* Score */
    var total   = steps.length;
    var okCount = Object.values(answers).filter(function (a) { return a.ok; }).length;
    var pass    = okCount >= Math.ceil(total * 0.6);

    /* Hide questions + nav, show result */
    steps.forEach(function (s) { s.style.display = 'none'; });
    var nav = document.querySelector('.survey-nav');
    if (nav) nav.style.display = 'none';
    if (progress && progress.parentElement) progress.style.width = '100%';
    if (counter) counter.textContent = 'Complete';

    var elEl = document.getElementById('result-eligible');
    var inEl = document.getElementById('result-ineligible');
    if (elEl) elEl.style.display = pass ? 'block' : 'none';
    if (inEl) inEl.style.display = pass ? 'none'  : 'block';
    if (result) result.style.display = 'block';

    /* Always reveal interaction section after 1.8s */
    setTimeout(function () {
      var ia = document.getElementById('interaction-reveal');
      if (ia) {
        ia.style.display = '';
        ia.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 1800);
  });

  /* Consent checkbox — show submit button when ticked */
  var consentCheck  = document.getElementById('consent-check');
  var consentSubmit = document.getElementById('consent-submit');
  var consentThanks = document.getElementById('consent-thanks');
  if (consentCheck && consentSubmit) {
    consentCheck.addEventListener('change', function () {
      consentSubmit.style.display = this.checked ? 'block' : 'none';
    });
    consentSubmit.addEventListener('click', function () {
      consentSubmit.style.display = 'none';
      consentCheck.disabled = true;
      if (consentThanks) consentThanks.style.display = 'block';
    });
  }

  show(0);
})();
</script>
<style>
  @keyframes survey-shake {
    0%,100% { transform: translateX(0); }
    20%,60%  { transform: translateX(-8px); }
    40%,80%  { transform: translateX(8px); }
  }
</style>"""

        # Floating chat widget (Python-injected, always correct)
        chat_float_html = ""
        chat_js = ""
        if has_chat:
            chat_float_html = f"""
<div id="chat-float">
  <div class="chat-panel" id="chat-panel">
    <div class="chat-panel__header">
      <div class="chat-avatar">🤖</div>
      <div class="chat-agent-info">
        <p class="chat-agent-name">{bot_name}</p>
        <p class="chat-agent-status">Online &middot; Ready to help</p>
      </div>
      <button class="chat-close-btn" id="chat-close" aria-label="Close chat">&#10005;</button>
    </div>
    <div class="chat-messages" id="chat-messages">
      <div class="chat-bubble bot">{bot_welcome}</div>
    </div>
    <div class="chat-footer">
      <input id="chat-input" class="chat-input" type="text" placeholder="Type your message&hellip;" autocomplete="off" />
      <button class="chat-send-btn" id="chat-send" aria-label="Send">&#10148;</button>
    </div>
  </div>
  <button class="chat-toggle-btn" id="chat-toggle" aria-label="Open chat" style="position:relative;">
    💬
    <span class="chat-unread" id="chat-unread">1</span>
  </button>
</div>"""

            chat_js = f"""
<script>
/* ── Floating chat widget ──────────────────────────────────────────────── */
(function () {{
  var panel   = document.getElementById('chat-panel');
  var toggle  = document.getElementById('chat-toggle');
  var close   = document.getElementById('chat-close');
  var input   = document.getElementById('chat-input');
  var send    = document.getElementById('chat-send');
  var box     = document.getElementById('chat-messages');
  var unread  = document.getElementById('chat-unread');
  if (!panel || !toggle) return;

  var AD_ID    = '{ad_id}';
  var API_BASE = window.location.origin;
  var history  = [];
  var sending  = false;

  function openChat() {{
    panel.classList.add('open');
    if (unread) unread.style.display = 'none';
    if (input)  input.focus();
  }}
  function closeChat() {{ panel.classList.remove('open'); }}

  toggle.addEventListener('click', function () {{
    panel.classList.contains('open') ? closeChat() : openChat();
  }});
  if (close) close.addEventListener('click', closeChat);

  function addMsg(text, cls) {{
    var b = document.createElement('div');
    b.className = 'chat-bubble ' + cls;
    b.textContent = text;
    box.appendChild(b);
    box.scrollTop = box.scrollHeight;
    return b;
  }}

  function setInput(disabled) {{
    sending        = disabled;
    input.disabled = disabled;
    send.disabled  = disabled;
  }}

  async function sendMsg() {{
    var val = (input.value || '').trim();
    if (!val || sending) return;
    addMsg(val, 'user');
    input.value = '';
    setInput(true);

    var typing = addMsg('\u2026', 'bot');

    try {{
      var resp = await fetch(API_BASE + '/api/chat', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify({{ projectId: AD_ID, message: val, history: history }})
      }});
      var data  = resp.ok ? await resp.json() : null;
      var reply = (data && data.reply) ? data.reply : "I\u2019m sorry, I couldn\u2019t process that. Please try again.";
      box.removeChild(typing);
      history.push({{ role: 'user', content: val }});
      history.push({{ role: 'assistant', content: reply }});
      addMsg(reply, 'bot');
    }} catch (e) {{
      box.removeChild(typing);
      addMsg("I\u2019m sorry, something went wrong. Please try again.", 'bot');
    }}

    setInput(false);
    input.focus();
  }}

  if (send)  send.addEventListener('click', sendMsg);
  if (input) input.addEventListener('keydown', function (e) {{ if (e.key === 'Enter') sendMsg(); }});

  /* Auto-open after survey reveal */
  var observer = new MutationObserver(function (mutations) {{
    mutations.forEach(function (m) {{
      if (m.type === 'attributes' && m.attributeName === 'style') {{
        var ia = document.getElementById('interaction-reveal');
        if (ia && ia.style.display !== 'none') {{
          setTimeout(openChat, 600);
          observer.disconnect();
        }}
      }}
    }});
  }});
  var ia = document.getElementById('interaction-reveal');
  if (ia) observer.observe(ia, {{ attributes: true }});
  else setTimeout(openChat, 3000);
}})();
</script>"""

        # Hide interaction section initially (JS reveals it post-survey)
        if has_interact:
            body = body.replace(
                'id="interaction-reveal"',
                'id="interaction-reveal" style="display:none"',
                1,
            )

        # ElevenLabs voice call JS (Python-injected, only when voicebot is active)
        # Uses dynamic ESM import via esm.sh — no UMD globals needed, works in all modern browsers.
        voice_js = ""
        if has_voice and ad_id:
            voice_js = f"""
<script type="module">
/* ── ElevenLabs Voice Call ─────────────────────────────────────────────── */
(async function () {{
  var voiceBtn    = document.getElementById('voice-call-btn');
  var callbackBtn = document.getElementById('callback-btn');
  if (!voiceBtn) return;

  var AD_ID    = '{ad_id}';
  var API_BASE = window.location.origin;
  var conversation = null;

  function setBtn(text, disabled) {{
    voiceBtn.textContent   = text;
    voiceBtn.disabled      = disabled;
    voiceBtn.style.opacity = disabled ? '0.6' : '1';
  }}

  async function startCall() {{
    setBtn('Connecting\u2026', true);
    try {{
      /* 1. Fetch signed WebSocket URL from our backend (no auth needed) */
      var resp = await fetch(API_BASE + '/api/advertisements/' + AD_ID + '/voice-session/token');
      if (!resp.ok) throw new Error('Session token failed — is the voice agent provisioned? (HTTP ' + resp.status + ')');
      var data = await resp.json();
      if (!data.signed_url) throw new Error('No signed URL returned from server');

      /* 2. Load ElevenLabs SDK via ESM (esm.sh handles all dependencies automatically) */
      var {{ Conversation }} = await import('https://esm.sh/@11labs/client');

      /* 3. Request microphone permission explicitly so errors are clear */
      await navigator.mediaDevices.getUserMedia({{ audio: true }});

      /* 4. Start WebSocket voice session — audio never touches our servers */
      conversation = await Conversation.startSession({{
        signedUrl: data.signed_url,
        onConnect: function () {{
          setBtn('\u23F9 End Call', false);
        }},
        onDisconnect: function () {{
          setBtn('Start Voice Call \u2192', false);
          conversation = null;
        }},
        onError: function (err) {{
          console.error('[ElevenLabs]', err);
          setBtn('Start Voice Call \u2192', false);
          conversation = null;
        }},
      }});
    }} catch (e) {{
      setBtn('Start Voice Call \u2192', false);
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {{
        alert('Microphone access denied.\nPlease allow microphone access in your browser and try again.');
      }} else {{
        alert('Could not start call:\n' + e.message);
      }}
    }}
  }}

  voiceBtn.addEventListener('click', function () {{
    if (conversation) {{
      conversation.endSession();
      return;
    }}
    startCall();
  }});

  /* ── Callback request form (inline modal) ─────────────────────────── */
  if (callbackBtn) {{
    var modal = document.createElement('div');
    modal.innerHTML = '<div id="cb-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;align-items:center;justify-content:center"><div style="background:#fff;border-radius:18px;padding:36px 32px;max-width:420px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,0.22);text-align:center"><h3 style="font-size:1.2rem;font-weight:800;margin-bottom:8px">Request a Callback</h3><p style="color:#64748b;font-size:0.9rem;margin-bottom:20px">Enter your phone number and we\'ll call you back shortly.</p><input id="cb-phone" type="tel" placeholder="+1 (555) 000-0000" style="width:100%;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px 16px;font-size:0.95rem;margin-bottom:14px;font-family:inherit;outline:none" /><button id="cb-submit" style="width:100%;background:var(--accent,#10b981);color:#fff;border:none;border-radius:50px;padding:13px;font-size:0.95rem;font-weight:700;cursor:pointer;font-family:inherit">Request Callback</button><p id="cb-thanks" style="display:none;margin-top:14px;color:#10b981;font-weight:600">&#10003; Got it! We\'ll call you back shortly.</p><button id="cb-close" style="margin-top:16px;background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:0.85rem;font-family:inherit">Cancel</button></div></div>';
    document.body.appendChild(modal);

    var cbModal  = document.getElementById('cb-modal');
    var cbPhone  = document.getElementById('cb-phone');
    var cbSubmit = document.getElementById('cb-submit');
    var cbThanks = document.getElementById('cb-thanks');
    var cbClose  = document.getElementById('cb-close');

    callbackBtn.addEventListener('click', function () {{ cbModal.style.display = 'flex'; cbPhone.focus(); }});
    if (cbClose)  cbClose.addEventListener('click',  function () {{ cbModal.style.display = 'none'; }});
    if (cbSubmit) cbSubmit.addEventListener('click', function () {{
      var phone = (cbPhone && cbPhone.value || '').trim();
      if (!phone) {{ cbPhone.style.borderColor = '#ef4444'; return; }}
      cbPhone.style.borderColor = '#e2e8f0';
      cbSubmit.style.display = 'none';
      if (cbThanks) cbThanks.style.display = 'block';
    }});
  }}
}})();
</script>"""

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <style>{css}
  </style>
</head>
<body>
{body}
{chat_float_html}
{survey_js}
{chat_js}
{voice_js}
</body>
</html>"""

    # ── Body prompt ────────────────────────────────────────────────────────────

    def _build_body_prompt(
        self,
        ad: Advertisement,
        brand_kit: Optional[BrandKit],
        company: Optional[Company],
    ) -> str:
        company_name = company.name      if company  else "Our Company"
        logo_url     = company.logo_url  if company  else None
        industry     = company.industry  if company  else ""
        adjectives   = (brand_kit.adjectives if brand_kit else None) or "professional, trustworthy"
        dos          = (brand_kit.dos        if brand_kit else None) or ""
        donts        = (brand_kit.donts      if brand_kit else None) or ""

        ad_types     = [t.lower() for t in (ad.ad_type or [])]
        strategy     = ad.strategy_json or {}
        messaging    = strategy.get("messaging", {}) or {}
        core_msg     = messaging.get("core_message", ad.title) if isinstance(messaging, dict) else ad.title
        cta_text     = messaging.get("cta", "Get Started")     if isinstance(messaging, dict) else "Get Started"
        key_phrases  = messaging.get("key_phrases", [])        if isinstance(messaging, dict) else []
        exec_sum     = strategy.get("executive_summary", "")
        target_aud   = strategy.get("target_audience", {})
        primary_aud  = target_aud.get("primary", "") if isinstance(target_aud, dict) else str(target_aud)
        kpis         = strategy.get("kpis", [])

        website_reqs  = ad.website_reqs or {}
        must_have     = website_reqs.get("must_have",    []) if isinstance(website_reqs, dict) else []
        must_avoid    = website_reqs.get("must_avoid",   []) if isinstance(website_reqs, dict) else []
        accessibility = website_reqs.get("accessibility",[]) if isinstance(website_reqs, dict) else []

        bot_config   = ad.bot_config or {}
        bot_name     = bot_config.get("name", "Assistant")     if isinstance(bot_config, dict) else "Assistant"
        bot_welcome  = bot_config.get("welcome_message", f"Hi! I'm {bot_name}. How can I help you today?") if isinstance(bot_config, dict) else f"Hi! I'm {bot_name}."

        logo_html = f'<img src="{logo_url}" alt="{company_name}" />' if logo_url else company_name

        # Interaction section instructions
        interaction_block = ""
        if "voicebot" in ad_types:
            interaction_block = f"""
VOICEBOT SECTION — add immediately after the survey section:
<section class="interaction-section" id="interaction-reveal">
  Title: "How would you like to speak with {bot_name}?"
  Sub: short subtitle
  Two .interaction-card divs inside .interaction-cards:
    Card 1 (featured): icon=🎤, title="Talk to {bot_name} Now",
      desc="Speak with {bot_name} right now through your browser — no phone needed.",
      btn text="Start Voice Call →", meta="Uses your microphone · Instant · Free"
    Card 2: icon=📞, title="Request a Callback",
      desc="Prefer your phone? Enter your number and {bot_name} will call you back.",
      btn text="Request a Call →", meta="Phone call · Free"
  Add <p class="interaction-note"> with privacy/consent note.
IMPORTANT: the id="interaction-reveal" attribute is required on the <section> tag.
"""
        elif "chatbot" in ad_types:
            interaction_block = f"""
CHATBOT SECTION — the chat widget floats bottom-right (system-injected). Do NOT add chat HTML.
Place this reveal anchor immediately after the survey section:
  <section class="cta-section" id="interaction-reveal">
    <div class="cta-inner">
      <h2 class="cta-title">Chat with {bot_name} Now</h2>
      <p class="cta-sub">Click the chat button in the bottom-right corner — {bot_name} is ready to help.</p>
    </div>
  </section>
The id="interaction-reveal" is required — JS scrolls to it and opens the floating chat panel automatically.
"""

        return f"""## Campaign Details
- Company: {company_name} ({industry})
- Title: {ad.title}
- Ad types: {", ".join(ad_types)}
- Core message: {core_msg}
- CTA: {cta_text}
- Target audience: {primary_aud}
- Tone: {adjectives}
- Key phrases: {", ".join(key_phrases) if key_phrases else "N/A"}

## Strategy Summary
{exec_sum or "Craft compelling copy from the campaign title and audience."}

## Benefits / KPIs (use as chips and card content)
{json.dumps(kpis, indent=2) if kpis else "Derive 3–4 benefits from context."}

## Eligibility Criteria (use to generate survey questions)
{json.dumps(must_have, indent=2) if must_have else "Generate relevant eligibility questions from the campaign context."}

## Must Avoid
{json.dumps(must_avoid, indent=2) if must_avoid else "Nothing flagged."}

## Brand DOs / DON'Ts
DOs: {dos or "N/A"}
DON'Ts: {donts or "N/A"}

## Logo HTML
{logo_html}

{interaction_block}

---
Page order (strict):
1. <nav>
2. .hero  (headline, benefit chips, CTA button)
3. #survey-section  (4–6 eligibility questions generated from criteria above)
4. {('Voicebot/chatbot section with id="interaction-reveal"') if (interaction_block) else 'Features section (.card-grid)'}
5. Features section with .card-grid (why join / what to expect)
6. .cta-section
7. <footer>

Start output with <nav>. End with </footer>. No inline styles. No custom classes.
"""

    # ── Claude call ────────────────────────────────────────────────────────────

    async def _generate_body(
        self,
        ad: Advertisement,
        brand_kit: Optional[BrandKit],
        company: Optional[Company],
    ) -> str:
        if not is_configured():
            return self._mock_body(ad, brand_kit, company)

        prompt = self._build_body_prompt(ad, brand_kit, company)
        client = get_async_client()

        response = await client.messages.create(
            model=get_model(),
            max_tokens=8192,
            system=_BODY_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        body = response.content[0].text.strip()
        if body.startswith("```"):
            body = body.split("\n", 1)[1] if "\n" in body else body[3:]
        if body.endswith("```"):
            body = body.rsplit("```", 1)[0]
        return body.strip()

    # ── Mock (when no API key configured) ────────────────────────────────────

    def _mock_body(
        self,
        ad: Advertisement,
        brand_kit: Optional[BrandKit],
        company: Optional[Company],
    ) -> str:
        company_name = company.name     if company  else "Our Company"
        logo_url     = company.logo_url if company  else None
        title        = ad.title
        ad_types     = [t.lower() for t in (ad.ad_type or [])]
        bot_config   = ad.bot_config or {}
        bot_name     = bot_config.get("name", "Assistant") if isinstance(bot_config, dict) else "Assistant"
        logo_html    = f'<img src="{logo_url}" alt="{company_name}" />' if logo_url else company_name

        interaction_html = ""
        if "voicebot" in ad_types:
            interaction_html = f"""
<section class="interaction-section" id="interaction-reveal">
  <h2 class="interaction-section__title">How would you like to speak with {bot_name}?</h2>
  <p class="interaction-section__sub">Choose your preferred way to connect with our AI coordinator.</p>
  <div class="interaction-cards">
    <div class="interaction-card featured">
      <div class="interaction-card__icon">🎤</div>
      <p class="interaction-card__title">Talk to {bot_name} Now</p>
      <p class="interaction-card__desc">{bot_name} will speak with you right now through your browser — no phone needed.</p>
      <button class="interaction-card__btn" id="voice-call-btn">Start Voice Call →</button>
      <p class="interaction-card__meta">Uses your microphone · Instant · Free</p>
    </div>
    <div class="interaction-card">
      <div class="interaction-card__icon">📞</div>
      <p class="interaction-card__title">Request a Callback</p>
      <p class="interaction-card__desc">Prefer your phone? Enter your number and {bot_name} will call you within 2 minutes.</p>
      <button class="interaction-card__btn" id="callback-btn">Request a Call →</button>
      <p class="interaction-card__meta">Phone call · Free</p>
    </div>
  </div>
  <p class="interaction-note">{bot_name} is an AI assistant. Your responses are confidential and used only to assess eligibility.</p>
</section>"""
        elif "chatbot" in ad_types:
            interaction_html = f"""
<section class="cta-section" id="interaction-reveal">
  <div class="cta-inner">
    <h2 class="cta-title">Chat with {bot_name} Now</h2>
    <p class="cta-sub">Click the chat button in the bottom-right corner &mdash; {bot_name} is ready to help you right now.</p>
  </div>
</section>"""

        return f"""<nav>
  <a href="#" class="logo">{logo_html}</a>
  <a href="#survey-section" class="nav-cta">Check Eligibility</a>
</nav>

<section class="hero">
  <div class="hero-badge">&#9650; Campaign</div>
  <h1 class="hero-headline">{title}</h1>
  <p class="hero-sub">A professionally crafted campaign powered by AI — tailored to your brand and marketing strategy.</p>
  <div class="benefit-chips">
    <span class="chip">Free &amp; Instant</span>
    <span class="chip">AI-Powered</span>
    <span class="chip">Brand Aligned</span>
  </div>
  <a href="#survey-section" class="btn btn-primary">Check Your Eligibility &rarr;</a>
</section>

<section class="survey-section" id="survey-section">
  <div class="survey-card">
    <div class="survey-header">
      <h2 class="survey-title">Check Your Eligibility</h2>
      <p class="survey-sub">Answer a few quick questions. Takes about 2 minutes.</p>
      <div class="survey-progress-bar"><div class="survey-progress-fill" id="survey-progress"></div></div>
      <p class="survey-step-count" id="survey-step-count">Question 1 of 3</p>
    </div>

    <div class="survey-step active" data-step="1" data-eligible="yes">
      <p class="survey-question">Are you 18 years of age or older?</p>
      <div class="option-grid">
        <button class="option-btn" data-value="yes">Yes</button>
        <button class="option-btn" data-value="no">No, I'm under 18</button>
      </div>
    </div>

    <div class="survey-step" data-step="2" data-eligible="yes">
      <p class="survey-question">Have you been diagnosed with a relevant condition in the past 12 months?</p>
      <div class="option-grid">
        <button class="option-btn" data-value="yes">Yes</button>
        <button class="option-btn" data-value="no">No</button>
        <button class="option-btn" data-value="unsure">I'm not sure</button>
      </div>
    </div>

    <div class="survey-step" data-step="3" data-eligible="yes,maybe">
      <p class="survey-question">Are you available for follow-up appointments over the next 6 months?</p>
      <div class="option-grid">
        <button class="option-btn" data-value="yes">Yes, fully available</button>
        <button class="option-btn" data-value="maybe">Possibly, schedule dependent</button>
        <button class="option-btn" data-value="no">No, not available</button>
      </div>
    </div>

    <div class="survey-result" id="survey-result">
      <div class="result-card eligible" id="result-eligible">
        <div class="result-icon"></div>
        <h3>You may be eligible!</h3>
        <p>Based on your responses, you appear to meet the initial criteria. Connect with us below — our team will be in touch shortly.</p>
      </div>
      <div class="result-card ineligible" id="result-ineligible">
        <div class="result-icon"></div>
        <h3>Not quite a match right now</h3>
        <p>You may not meet all the current criteria, but other opportunities may be coming soon.</p>
        <div class="consent-box">
          <label class="consent-label">
            <input type="checkbox" class="consent-checkbox" id="consent-check" />
            You don't meet the criteria for this trial, but you might qualify for our upcoming trials. May we retain your details to notify you?
          </label>
          <button class="consent-submit" id="consent-submit">Yes, Keep Me Updated</button>
          <p class="consent-thanks" id="consent-thanks">&#10003; Thank you! We'll be in touch when a matching trial opens.</p>
        </div>
      </div>
    </div>

    <div class="survey-nav">
      <button class="btn-survey-prev" id="survey-prev">&#8592; Back</button>
      <button class="btn-survey-next" id="survey-next">Next &rarr;</button>
      <button class="btn-survey-submit" id="survey-submit">See My Result &rarr;</button>
    </div>
  </div>
</section>

{interaction_html}

<div style="background:#fff;">
  <div class="section">
    <h2 class="section-title">Why Participate</h2>
    <p class="section-sub">Here's what you can expect when you join.</p>
    <div class="card-grid">
      <div class="card"><div class="card-icon">&#128200;</div><p class="card-title">Expert Care</p><p class="card-desc">Access to leading specialists throughout the study.</p></div>
      <div class="card"><div class="card-icon">&#9989;</div><p class="card-title">No Cost</p><p class="card-desc">All study-related visits and treatments are provided free of charge.</p></div>
      <div class="card"><div class="card-icon">&#9889;</div><p class="card-title">Fast Results</p><p class="card-desc">Receive preliminary feedback quickly after assessment.</p></div>
    </div>
  </div>
</div>

<div id="cta" class="cta-section">
  <div class="cta-inner">
    <h2 class="cta-title">Ready to take the next step?</h2>
    <p class="cta-sub">Complete the eligibility check above and our team will be in touch.</p>
    <a href="#survey-section" class="btn btn-primary">Check Eligibility &rarr;</a>
  </div>
</div>

<footer>
  <div class="trust-bar">
    <span class="trust-item"><strong>{company_name}</strong> &mdash; Powered by AI</span>
    <span class="trust-item"><strong>Privacy Protected</strong> &mdash; Your data is confidential</span>
    <span class="trust-item"><strong>Ethics Approved</strong></span>
  </div>
  <p class="footer-copy">&copy; {company_name} &middot; {title}</p>
</footer>"""
