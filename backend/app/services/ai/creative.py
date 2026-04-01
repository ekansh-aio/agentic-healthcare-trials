"""
Creative Agent - Ad Copy + Image Generation
Owner: AI Dev
Dependencies: M8 (Advertisements), AWS Bedrock (Claude + Amazon Nova Canvas)

Flow:
1. Claude generates structured copy + image prompts for each ad format
2. Amazon Nova Canvas produces images via boto3
3. Images saved to outputs/<company_id>/<ad_id>/
4. Returns list of creative dicts with image URLs served via /outputs/
"""

import asyncio
import base64
import boto3
import json
import os
from typing import Dict, Any, List

from app.models.models import Advertisement
from app.core.bedrock import get_async_client, get_model, is_configured
from app.core.config import settings


# Nova Canvas: width & height must be multiples of 16, 320–4096, product ≤ 4,194,304
_FORMAT_DIMENSIONS = {
    "1080x1080": (1024, 1024),
    "square":    (1024, 1024),
    "1080x1920": (768,  1344),  # 9:16 portrait / story
    "story":     (768,  1344),
    "portrait":  (768,  1344),
    "9x16":      (768,  1344),
    "16:9":      (1344, 768),   # 16:9 landscape / banner
    "landscape": (1344, 768),
    "banner":    (1344, 768),
    "16x9":      (1344, 768),
}

_CREATIVE_SYSTEM = """You are an expert advertising creative director.
Given a marketing strategy and ad specifications, generate structured creative briefs
for each ad format — including polished copy and a detailed image generation prompt.

Rules for image prompts:
- Photorealistic, professional photography or high-quality CGI
- Absolutely NO text, words, letters, logos, or watermarks in the image
- Describe composition, lighting, mood, subject, and background in detail
- Incorporate the brand visual style from the strategy if available
- image_prompt may be up to 1024 characters

Respond ONLY with valid JSON (no markdown fences, no extra text):
{
  "creatives": [
    {
      "index": 0,
      "format": "<format name from ad specs>",
      "headline": "<short punchy headline, max 8 words>",
      "body": "<2-3 sentence ad body text>",
      "cta": "<call to action, max 4 words>",
      "image_prompt": "<detailed image generation prompt for Nova Canvas>"
    }
  ]
}"""


class CreativeService:
    def __init__(self, company_id: str):
        self.company_id = company_id

    async def generate_creatives(self, ad: Advertisement) -> List[Dict[str, Any]]:
        """
        Main entry point.
        Returns list of creative dicts: {format, headline, body, cta, image_prompt, image_url}
        """
        output_dir = os.path.join(settings.OUTPUT_DIR, self.company_id, ad.id)
        os.makedirs(output_dir, exist_ok=True)

        # Step 1: Claude generates copy + image prompts
        brief = await self._generate_brief(ad)
        items = brief.get("creatives", [])
        if not items:
            return []

        # Step 2: Generate images concurrently (each in a thread — boto3 is sync)
        async def process(item):
            image_url = None
            if is_configured() and settings.USE_BEDROCK:
                image_url = await asyncio.to_thread(
                    self._generate_image,
                    item.get("image_prompt", ""),
                    item.get("format", "square"),
                    item.get("index", 0),
                    output_dir,
                    ad.id,
                )
            return {
                "format":       item.get("format", ""),
                "headline":     item.get("headline", ""),
                "body":         item.get("body", ""),
                "cta":          item.get("cta", ""),
                "image_prompt": item.get("image_prompt", ""),
                "image_url":    image_url,
            }

        results = await asyncio.gather(*[process(c) for c in items])
        return list(results)

    # ── Private: Claude call ─────────────────────────────────────────────────

    async def _generate_brief(self, ad: Advertisement) -> Dict[str, Any]:
        if not is_configured():
            return self._mock_brief(ad)

        client     = get_async_client()
        strategy   = json.dumps(ad.strategy_json, indent=2) if ad.strategy_json else "{}"
        ad_details = json.dumps(ad.ad_details,    indent=2) if ad.ad_details    else "{}"

        user_msg = f"""## Campaign: {ad.title}
Budget: {ad.budget or 'unspecified'}

## Marketing Strategy
{strategy}

## Ad Specifications (from Reviewer AI)
{ad_details}

Generate one creative brief per format listed in the ad specifications.
If no formats are defined, generate three 1080x1920 Meta Ads (portrait/story format) — each a distinct creative iteration with different messaging, mood, and image concept, but all sized 1080x1920.
"""
        response = await client.messages.create(
            model=get_model(),
            max_tokens=2048,
            system=_CREATIVE_SYSTEM,
            messages=[{"role": "user", "content": user_msg}],
        )
        text = response.content[0].text.strip()
        try:
            return json.loads(text.removeprefix("```json").removesuffix("```").strip())
        except json.JSONDecodeError:
            import logging
            logging.getLogger(__name__).warning(
                "Creative brief JSON parse failed for ad %s — using mock", ad.id
            )
            return self._mock_brief(ad)

    # ── Private: Nova Canvas ─────────────────────────────────────────────────

    def _generate_image(
        self,
        prompt: str,
        format_name: str,
        index: int,
        output_dir: str,
        ad_id: str,
    ) -> str | None:
        """
        Synchronous — run via asyncio.to_thread.
        Calls Amazon Nova Canvas on Bedrock and saves PNG to disk.
        Returns the URL path or None on failure.
        """
        width, height = self._get_dimensions(format_name)

        try:
            boto3_kwargs = {"region_name": settings.AWS_REGION}
            if settings.AWS_ACCESS_KEY_ID:
                boto3_kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
            if settings.AWS_SECRET_ACCESS_KEY:
                boto3_kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
            bedrock = boto3.client("bedrock-runtime", **boto3_kwargs)

            safe_prompt = (prompt or "Professional advertisement, modern minimal design, clean composition")[:1024]

            body = json.dumps({
                "taskType": "TEXT_IMAGE",
                "textToImageParams": {
                    "text":         safe_prompt,
                    "negativeText": "text, words, letters, watermark, blurry, distorted, low quality, ugly, nsfw",
                },
                "imageGenerationConfig": {
                    "numberOfImages": 1,
                    "height":         height,
                    "width":          width,
                    "quality":        "premium",
                    "cfgScale":       7.5,
                    "seed":           0,
                },
            })

            response = bedrock.invoke_model(
                modelId="amazon.nova-canvas-v1:0",
                body=body,
                contentType="application/json",
                accept="application/json",
            )

            result      = json.loads(response["body"].read())
            image_bytes = base64.b64decode(result["images"][0])

            safe_fmt  = (
                format_name.replace(" ", "_").replace("/", "-")
                           .replace(":", "-").lower()
            )
            filename  = f"creative_{index}_{safe_fmt}.png"
            file_path = os.path.join(output_dir, filename)

            with open(file_path, "wb") as f:
                f.write(image_bytes)

            return f"/outputs/{self.company_id}/{ad_id}/{filename}"

        except Exception as exc:
            import logging
            logging.getLogger(__name__).error(
                "Nova Canvas image generation failed [format=%s, ad=%s]: %s",
                format_name, ad_id, exc,
            )
            return None

    def _get_dimensions(self, format_name: str) -> tuple[int, int]:
        fmt = format_name.lower()
        for key, dims in _FORMAT_DIMENSIONS.items():
            if key in fmt:
                return dims
        return (1024, 1024)

    # ── Mock (no API key configured) ─────────────────────────────────────────

    def _mock_brief(self, ad: Advertisement) -> Dict[str, Any]:
        return {
            "creatives": [
                {
                    "index": 0,
                    "format": "1080x1920 Meta Ad",
                    "headline": f"Discover {ad.title}",
                    "body": "Cutting-edge solutions built around your needs. Trusted by professionals worldwide.",
                    "cta": "Learn More",
                    "image_prompt": "Portrait 9:16 Meta ad, modern minimalist healthcare setting, soft natural lighting, confident patient and doctor in consultation, clean clinical background, professional photography",
                    "image_url": None,
                },
                {
                    "index": 1,
                    "format": "1080x1920 Meta Ad",
                    "headline": "Make Your Move",
                    "body": "The future starts with one decision. Join thousands who already made the leap.",
                    "cta": "Get Started",
                    "image_prompt": "Portrait 9:16 Meta ad, inspiring close-up of a confident smiling person, warm golden hour lighting, soft bokeh background, optimistic hopeful mood, photorealistic",
                    "image_url": None,
                },
                {
                    "index": 2,
                    "format": "1080x1920 Meta Ad",
                    "headline": "Results That Speak",
                    "body": "Data-driven campaigns that convert. See the difference on day one.",
                    "cta": "See Results",
                    "image_prompt": "Portrait 9:16 Meta ad, modern medical research lab, scientists collaborating, bright clean environment, professional clinical atmosphere, photorealistic",
                    "image_url": None,
                },
            ]
        }
