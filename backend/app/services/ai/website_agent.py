"""
Website Agent - Static Landing Page Generator
Owner: AI Dev
Dependencies: M8 (Advertisements), M1 (BrandKit, Company)

Architecture:
  - Python injects brand colors into a fixed CSS template (no CSS from Claude)
  - Claude ONLY writes the <body> HTML using pre-defined CSS classes
  - Voicebot / chatbot interaction UI sections are CSS-class driven
  - Minimal JS for chat widget is injected by Python if chatbot type is present

Output: saved to outputs/<company_id>/<ad_id>/website/index.html
Stored:  ad.output_url = "/outputs/<company_id>/<ad_id>/website/index.html"
"""

import json
import logging
import os
from typing import List, Optional

from app.core.bedrock import get_async_client, get_model, is_configured
from app.core.config import settings
from app.models.models import Advertisement, BrandKit, Company

logger = logging.getLogger(__name__)

_BODY_SYSTEM_PROMPT = """You are an expert marketing copywriter and HTML developer.

Write the BODY CONTENT for a landing page.
Output ONLY the inner HTML — starting with <nav> and ending with </footer>.
Do NOT output DOCTYPE, <html>, <head>, <style>, or <script> tags.

The stylesheet is already defined. Use ONLY these CSS classes (no inline styles, no custom classes):

NAV:          .logo  .nav-cta
HERO:         .hero  .hero-badge  .hero-headline  .hero-sub  .benefit-chips  .chip
              .btn.btn-primary  .btn.btn-outline
SECTION:      .section  .section-title  .section-sub
CARDS:        .card-grid  .card  .card-icon  .card-title  .card-desc
CHECKLIST:    .checklist  .checklist-item
CTA:          .cta-section  .cta-inner  .cta-title  .cta-sub
FOOTER:       footer  .trust-bar  .trust-item  .footer-copy

VOICEBOT UI (use when ad type includes voicebot):
  .interaction-section  .interaction-section__title  .interaction-section__sub
  .interaction-cards
  .interaction-card  .interaction-card.featured     ← featured = highlighted with accent border
  .interaction-card__icon  .interaction-card__title  .interaction-card__desc
  .interaction-card__btn   .interaction-card__meta
  .mic-btn  (the animated microphone button inside the voicebot card)

CHATBOT UI (use when ad type includes chatbot):
  .chat-widget  .chat-widget__header  .chat-avatar  .chat-agent-info
  .chat-agent-name  .chat-agent-status
  .chat-messages  .chat-bubble  .chat-bubble.bot  .chat-bubble.user
  .chat-footer  .chat-input  .chat-send-btn  (id="chat-input" on the <input>)

Fill every section with real campaign content. Use emoji icons inside .card-icon and .interaction-card__icon.
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

        ad_types = [t.lower() for t in (ad.ad_type or [])]
        css      = self._build_css(brand_kit)
        body     = await self._generate_body(ad, brand_kit, company)
        html     = self._wrap_html(ad.title, css, body, ad_types)

        index_path = os.path.join(output_dir, "index.html")
        with open(index_path, "w", encoding="utf-8") as f:
            f.write(html)

        return f"/outputs/{self.company_id}/{ad.id}/website/index.html"

    # ── CSS (brand colors injected, interaction UI included) ─────────────────

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

    /* ── NAV ── */
    nav {{ background: var(--secondary); padding: 16px 48px; display: flex; align-items: center; justify-content: space-between; }}
    .logo {{ color: #fff; font-size: 1.05rem; font-weight: 700; display: flex; align-items: center; gap: 10px; text-decoration: none; }}
    .logo img {{ height: 36px; object-fit: contain; }}
    .nav-cta {{ background: var(--accent); color: #fff; padding: 9px 22px; border-radius: 50px; font-size: 0.88rem; font-weight: 600; text-decoration: none; border: none; cursor: pointer; transition: opacity 0.2s; }}
    .nav-cta:hover {{ opacity: 0.88; }}

    /* ── HERO ── */
    .hero {{ background: linear-gradient(140deg, var(--primary) 0%, var(--secondary) 100%); color: #fff; padding: 80px 48px; text-align: center; }}
    .hero-badge {{ display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22); border-radius: 50px; padding: 5px 16px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; margin-bottom: 24px; }}
    .hero-headline {{ font-size: clamp(2rem, 5vw, 3.25rem); font-weight: 800; line-height: 1.15; letter-spacing: -0.02em; margin-bottom: 18px; }}
    .hero-headline span {{ color: var(--accent); }}
    .hero-sub {{ font-size: 1.05rem; color: rgba(255,255,255,0.78); max-width: 560px; margin: 0 auto 32px; }}
    .benefit-chips {{ display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-bottom: 36px; }}
    .chip {{ display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 50px; padding: 5px 14px; font-size: 0.8rem; color: rgba(255,255,255,0.9); }}
    .chip::before {{ content: '✓'; color: var(--accent); font-weight: 700; }}

    /* ── BUTTONS ── */
    .btn {{ display: inline-block; padding: 13px 34px; border-radius: 50px; font-size: 0.97rem; font-weight: 700; text-decoration: none; border: none; cursor: pointer; transition: opacity 0.18s, transform 0.1s; }}
    .btn:hover {{ opacity: 0.88; transform: translateY(-1px); }}
    .btn-primary {{ background: var(--accent); color: #fff; }}
    .btn-outline {{ background: transparent; color: #fff; border: 2px solid rgba(255,255,255,0.45); }}
    .btn-dark {{ background: var(--secondary); color: #fff; }}

    /* ── SECTIONS ── */
    .section {{ padding: 72px 48px; max-width: 1100px; margin: 0 auto; }}
    .section-title {{ font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 700; text-align: center; color: var(--primary); margin-bottom: 10px; }}
    .section-sub {{ text-align: center; color: var(--muted); font-size: 1rem; max-width: 540px; margin: 0 auto 44px; }}

    /* ── CARDS ── */
    .card-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 20px; }}
    .card {{ background: var(--white); border: 1px solid var(--border); border-radius: 14px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); transition: box-shadow 0.2s; }}
    .card:hover {{ box-shadow: 0 4px 16px rgba(0,0,0,0.1); }}
    .card-icon {{ width: 44px; height: 44px; border-radius: 10px; background: rgba(16,185,129,0.1); display: flex; align-items: center; justify-content: center; font-size: 1.25rem; margin-bottom: 14px; }}
    .card-title {{ font-size: 0.95rem; font-weight: 700; color: var(--text); margin-bottom: 6px; }}
    .card-desc {{ font-size: 0.85rem; color: var(--muted); line-height: 1.6; }}

    /* ── CHECKLIST ── */
    .checklist {{ list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }}
    .checklist-item {{ background: var(--white); border: 1px solid var(--border); border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; gap: 10px; font-size: 0.9rem; font-weight: 500; color: var(--text); }}
    .checklist-item::before {{ content: '✓'; color: var(--accent); font-weight: 700; font-size: 1rem; flex-shrink: 0; }}

    /* ── CTA ── */
    .cta-section {{ background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); color: #fff; text-align: center; padding: 80px 48px; }}
    .cta-inner {{ max-width: 640px; margin: 0 auto; }}
    .cta-title {{ font-size: clamp(1.75rem, 4vw, 2.5rem); font-weight: 800; line-height: 1.18; margin-bottom: 14px; }}
    .cta-sub {{ font-size: 1.05rem; color: rgba(255,255,255,0.75); margin-bottom: 32px; }}

    /* ── FOOTER ── */
    footer {{ background: var(--secondary); padding: 28px 48px; }}
    .trust-bar {{ display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; margin-bottom: 18px; }}
    .trust-item {{ display: flex; align-items: center; gap: 7px; font-size: 0.82rem; color: rgba(255,255,255,0.6); }}
    .trust-item strong {{ color: rgba(255,255,255,0.9); }}
    .footer-copy {{ text-align: center; font-size: 0.75rem; color: rgba(255,255,255,0.38); }}

    /* ── VOICEBOT INTERACTION SECTION ── */
    .interaction-section {{ background: var(--bg); padding: 72px 48px; text-align: center; }}
    .interaction-section__title {{ font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 800; color: var(--text); margin-bottom: 10px; }}
    .interaction-section__sub {{ color: var(--muted); font-size: 1rem; max-width: 500px; margin: 0 auto 44px; }}
    .interaction-cards {{ display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; max-width: 760px; margin: 0 auto 28px; }}
    .interaction-card {{ background: var(--white); border: 2px solid var(--border); border-radius: 18px; padding: 36px 28px; width: 300px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; transition: box-shadow 0.2s, border-color 0.2s; }}
    .interaction-card:hover {{ box-shadow: 0 6px 24px rgba(0,0,0,0.1); }}
    .interaction-card.featured {{ border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }}
    .interaction-card__icon {{ width: 64px; height: 64px; border-radius: 50%; background: rgba(16,185,129,0.1); display: flex; align-items: center; justify-content: center; font-size: 1.75rem; margin-bottom: 4px; }}
    .interaction-card.featured .interaction-card__icon {{ background: rgba(16,185,129,0.15); }}
    .interaction-card__title {{ font-size: 1.1rem; font-weight: 700; color: var(--text); }}
    .interaction-card__desc {{ font-size: 0.86rem; color: var(--muted); line-height: 1.6; }}
    .interaction-card__btn {{ width: 100%; padding: 12px 20px; border-radius: 50px; font-size: 0.92rem; font-weight: 700; border: none; cursor: pointer; margin-top: 4px; transition: opacity 0.2s; text-decoration: none; display: inline-block; color: #fff; }}
    .interaction-card.featured .interaction-card__btn {{ background: var(--accent); }}
    .interaction-card:not(.featured) .interaction-card__btn {{ background: var(--secondary); }}
    .interaction-card__meta {{ font-size: 0.75rem; color: var(--muted); }}
    .interaction-note {{ font-size: 0.8rem; color: var(--muted); max-width: 520px; margin: 0 auto; }}

    /* Mic pulse animation */
    .mic-btn {{ width: 64px; height: 64px; border-radius: 50%; background: var(--accent); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.6rem; color: #fff; position: relative; margin: 0 auto; transition: transform 0.1s; }}
    .mic-btn::after {{ content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 2px solid var(--accent); opacity: 0; animation: mic-pulse 2s ease-out infinite; }}
    @keyframes mic-pulse {{ 0% {{ transform: scale(1); opacity: 0.6; }} 100% {{ transform: scale(1.5); opacity: 0; }} }}

    /* ── CHATBOT WIDGET ── */
    .chat-widget {{ background: var(--white); border: 1px solid var(--border); border-radius: 18px; overflow: hidden; max-width: 480px; margin: 0 auto; box-shadow: 0 8px 32px rgba(0,0,0,0.12); }}
    .chat-widget__header {{ background: linear-gradient(135deg, var(--primary), var(--secondary)); padding: 16px 20px; display: flex; align-items: center; gap: 12px; }}
    .chat-avatar {{ width: 40px; height: 40px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; }}
    .chat-agent-name {{ color: #fff; font-size: 0.95rem; font-weight: 700; }}
    .chat-agent-status {{ color: rgba(255,255,255,0.7); font-size: 0.75rem; display: flex; align-items: center; gap: 4px; }}
    .chat-agent-status::before {{ content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); display: inline-block; }}
    .chat-messages {{ height: 240px; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: #f8fafc; }}
    .chat-bubble {{ max-width: 80%; padding: 10px 14px; border-radius: 16px; font-size: 0.88rem; line-height: 1.5; }}
    .chat-bubble.bot {{ background: var(--white); border: 1px solid var(--border); color: var(--text); align-self: flex-start; border-bottom-left-radius: 4px; }}
    .chat-bubble.user {{ background: var(--accent); color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }}
    .chat-footer {{ padding: 12px 14px; border-top: 1px solid var(--border); display: flex; gap: 8px; background: var(--white); }}
    .chat-input {{ flex: 1; border: 1px solid var(--border); border-radius: 50px; padding: 9px 16px; font-size: 0.88rem; font-family: inherit; outline: none; color: var(--text); background: #f8fafc; }}
    .chat-input:focus {{ border-color: var(--accent); background: var(--white); }}
    .chat-send-btn {{ background: var(--accent); color: #fff; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; transition: opacity 0.2s; }}
    .chat-send-btn:hover {{ opacity: 0.85; }}

    /* ── RESPONSIVE ── */
    @media (max-width: 768px) {{
      nav {{ padding: 14px 20px; }}
      .hero {{ padding: 52px 20px; }}
      .section {{ padding: 52px 20px; }}
      .cta-section {{ padding: 52px 20px; }}
      .interaction-section {{ padding: 52px 20px; }}
      footer {{ padding: 24px 20px; }}
      .interaction-cards {{ flex-direction: column; align-items: center; }}
    }}
"""

    # ── HTML wrapper (injects chat JS if chatbot type) ───────────────────────

    def _wrap_html(self, title: str, css: str, body: str, ad_types: List[str]) -> str:
        chat_script = ""
        if "chatbot" in ad_types:
            chat_script = """
<script>
  (function() {
    var input = document.getElementById('chat-input');
    var btn   = document.querySelector('.chat-send-btn');
    var box   = document.querySelector('.chat-messages');
    if (!input || !btn || !box) return;

    function addMsg(text, cls) {
      var b = document.createElement('div');
      b.className = 'chat-bubble ' + cls;
      b.textContent = text;
      box.appendChild(b);
      box.scrollTop = box.scrollHeight;
    }

    var replies = [
      "Thanks for reaching out! How can I help you today?",
      "That's a great question. Let me look into that for you.",
      "I'm here to help! Could you tell me a bit more?",
      "Absolutely, I can assist with that.",
      "Thanks for the information. Our team will follow up shortly."
    ];
    var ri = 0;

    function send() {
      var val = input.value.trim();
      if (!val) return;
      addMsg(val, 'user');
      input.value = '';
      setTimeout(function() {
        addMsg(replies[ri % replies.length], 'bot');
        ri++;
      }, 700);
    }

    btn.addEventListener('click', send);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') send(); });
  })();
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
{chat_script}
</body>
</html>"""

    # ── Body prompt ───────────────────────────────────────────────────────────

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

        ad_types    = [t.lower() for t in (ad.ad_type or [])]
        strategy    = ad.strategy_json or {}
        messaging   = strategy.get("messaging", {}) or {}
        core_msg    = messaging.get("core_message", ad.title) if isinstance(messaging, dict) else ad.title
        cta_text    = messaging.get("cta", "Get Started")     if isinstance(messaging, dict) else "Get Started"
        key_phrases = messaging.get("key_phrases", [])        if isinstance(messaging, dict) else []
        exec_sum    = strategy.get("executive_summary", "")
        target_aud  = strategy.get("target_audience", {})
        primary_aud = target_aud.get("primary", "") if isinstance(target_aud, dict) else str(target_aud)
        kpis        = strategy.get("kpis", [])

        website_reqs = ad.website_reqs or {}
        must_have    = website_reqs.get("must_have",  []) if isinstance(website_reqs, dict) else []
        must_avoid   = website_reqs.get("must_avoid", []) if isinstance(website_reqs, dict) else []

        bot_config   = ad.bot_config or {}
        bot_name     = bot_config.get("name", "Assistant") if isinstance(bot_config, dict) else "Assistant"
        bot_welcome  = bot_config.get("welcome_message", f"Hi! I'm {bot_name}. How can I help you today?") if isinstance(bot_config, dict) else f"Hi! I'm {bot_name}."

        logo_html = f'<img src="{logo_url}" alt="{company_name}" />' if logo_url else company_name

        # Build ad-type-specific instructions
        type_instructions = []
        if "voicebot" in ad_types:
            type_instructions.append(f"""
VOICEBOT SECTION (required — place after hero):
Add a <section class="interaction-section"> with:
- .interaction-section__title: "How would you like to connect with {bot_name}?"
- .interaction-section__sub: short subtitle
- .interaction-cards with TWO .interaction-card divs:
  Card 1 (class="interaction-card featured"):
    - .interaction-card__icon: 🎤
    - .interaction-card__title: "Talk to {bot_name} Now"
    - .interaction-card__desc: "Speak with {bot_name} right now through your browser — no phone needed."
    - <button class="interaction-card__btn">Start Voice Call →</button>
    - .interaction-card__meta: "Uses your microphone · Instant · Free"
  Card 2 (class="interaction-card"):
    - .interaction-card__icon: 📞
    - .interaction-card__title: "Request a Callback"
    - .interaction-card__desc: "Prefer your phone? Enter your number and {bot_name} will call you within 2 minutes."
    - <button class="interaction-card__btn">Request a Call →</button>
    - .interaction-card__meta: "Phone call · Free"
- <p class="interaction-note"> with a privacy/consent note
""")
        if "chatbot" in ad_types:
            type_instructions.append(f"""
CHATBOT SECTION (required — place after hero or features):
Add a <div style="background:#fff; padding: 72px 48px;"> containing a .section with:
- .section-title: "Chat with {bot_name}"
- .section-sub: "Get instant answers — {bot_name} is available 24/7"
- A .chat-widget div:
    .chat-widget__header:
      .chat-avatar: 🤖
      .chat-agent-info > .chat-agent-name ("{bot_name}") + .chat-agent-status ("Online · Ready to help")
    .chat-messages:
      One .chat-bubble.bot with: "{bot_welcome}"
      One .chat-bubble.bot with a follow-up question relevant to the campaign
    .chat-footer:
      <input id="chat-input" class="chat-input" type="text" placeholder="Type your message…" />
      <button class="chat-send-btn">➤</button>
""")

        type_block = "\n".join(type_instructions) if type_instructions else ""

        return f"""## Campaign
- Company: {company_name} ({industry})
- Title: {ad.title}
- Ad types: {", ".join(ad_types)}
- Core message: {core_msg}
- CTA text: {cta_text}
- Target audience: {primary_aud}
- Brand tone: {adjectives}
- Key phrases: {", ".join(key_phrases) if key_phrases else "N/A"}

## Strategy Summary
{exec_sum or "Use the campaign title and audience to craft compelling copy."}

## KPIs / Benefits (use as benefit chips and card content)
{json.dumps(kpis, indent=2) if kpis else "Derive 3-4 benefits from the campaign context."}

## Website Requirements
{json.dumps(must_have, indent=2) if must_have else "Standard landing page sections."}

## Must Avoid
{json.dumps(must_avoid, indent=2) if must_avoid else "Nothing flagged."}

## Brand DOs / DON'Ts
DOs: {dos or "N/A"}
DON'Ts: {donts or "N/A"}

## Logo HTML (use inside .logo)
{logo_html}

{type_block}

---
Write the full body HTML for this landing page.
Page order: <nav> → hero → [voicebot/chatbot sections if applicable] → features/cards → cta-section → footer
Start with <nav>, end with </footer>. Use only the CSS classes listed in your instructions.
"""

    # ── Claude call ───────────────────────────────────────────────────────────

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

    # ── Mock (no API key) ─────────────────────────────────────────────────────

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

        voicebot_section = ""
        if "voicebot" in ad_types:
            voicebot_section = f"""
<section class="interaction-section">
  <h2 class="interaction-section__title">How would you like to connect with {bot_name}?</h2>
  <p class="interaction-section__sub">Choose your preferred way — instant voice or a scheduled callback.</p>
  <div class="interaction-cards">
    <div class="interaction-card featured">
      <div class="interaction-card__icon">🎤</div>
      <p class="interaction-card__title">Talk to {bot_name} Now</p>
      <p class="interaction-card__desc">{bot_name} will speak with you right now through your browser — no phone needed.</p>
      <button class="interaction-card__btn">Start Voice Call →</button>
      <p class="interaction-card__meta">Uses your microphone · Instant · Free</p>
    </div>
    <div class="interaction-card">
      <div class="interaction-card__icon">📞</div>
      <p class="interaction-card__title">Request a Callback</p>
      <p class="interaction-card__desc">Prefer your phone? Enter your number and {bot_name} will call you within 2 minutes.</p>
      <button class="interaction-card__btn">Request a Call →</button>
      <p class="interaction-card__meta">Phone call · Free</p>
    </div>
  </div>
  <p class="interaction-note">{bot_name} is an AI assistant. Your responses are confidential.</p>
</section>"""

        chatbot_section = ""
        if "chatbot" in ad_types:
            chatbot_section = f"""
<div style="background:#fff; padding: 72px 48px;">
  <div class="section">
    <h2 class="section-title">Chat with {bot_name}</h2>
    <p class="section-sub">Get instant answers — {bot_name} is available 24/7.</p>
    <div class="chat-widget">
      <div class="chat-widget__header">
        <div class="chat-avatar">🤖</div>
        <div class="chat-agent-info">
          <p class="chat-agent-name">{bot_name}</p>
          <p class="chat-agent-status">Online · Ready to help</p>
        </div>
      </div>
      <div class="chat-messages">
        <div class="chat-bubble bot">Hi! I'm {bot_name}. How can I help you today?</div>
        <div class="chat-bubble bot">Feel free to ask me anything about {title}.</div>
      </div>
      <div class="chat-footer">
        <input id="chat-input" class="chat-input" type="text" placeholder="Type your message…" />
        <button class="chat-send-btn">&#10148;</button>
      </div>
    </div>
  </div>
</div>"""

        return f"""<nav>
  <a href="#" class="logo">{logo_html}</a>
  <a href="#cta" class="nav-cta">Get Started &rarr;</a>
</nav>

<section class="hero">
  <div class="hero-badge">&#9650; Campaign</div>
  <h1 class="hero-headline">{title}</h1>
  <p class="hero-sub">A professionally crafted campaign powered by AI — tailored to your brand and marketing strategy.</p>
  <div class="benefit-chips">
    <span class="chip">Free &amp; Instant</span>
    <span class="chip">AI-Powered</span>
    <span class="chip">Brand Aligned</span>
    <span class="chip">Responsive</span>
  </div>
  <a href="#cta" class="btn btn-primary">Get Started &rarr;</a>
</section>

{voicebot_section}
{chatbot_section}

<div style="background:#fff; padding: 0 48px;">
  <div class="section">
    <h2 class="section-title">Why Choose Us</h2>
    <p class="section-sub">Built on data-driven insights tailored to your audience.</p>
    <div class="card-grid">
      <div class="card"><div class="card-icon">&#128200;</div><p class="card-title">Expert Strategy</p><p class="card-desc">Data-driven insights for your specific audience and goals.</p></div>
      <div class="card"><div class="card-icon">&#9989;</div><p class="card-title">Compliance Ready</p><p class="card-desc">Every campaign reviewed by our AI ethics layer.</p></div>
      <div class="card"><div class="card-icon">&#9889;</div><p class="card-title">Fast Results</p><p class="card-desc">From brief to live campaign in minutes, not weeks.</p></div>
    </div>
  </div>
</div>

<div id="cta" class="cta-section">
  <div class="cta-inner">
    <h2 class="cta-title">Ready to get started?</h2>
    <p class="cta-sub">Join us and take your marketing to the next level.</p>
    <a href="#" class="btn btn-primary">Get Started &rarr;</a>
  </div>
</div>

<footer>
  <div class="trust-bar">
    <span class="trust-item"><strong>{company_name}</strong> &mdash; Powered by AI</span>
    <span class="trust-item"><strong>Brand Aligned</strong> &mdash; Your identity, preserved</span>
  </div>
  <p class="footer-copy">&copy; {company_name} &middot; {title}</p>
</footer>"""
