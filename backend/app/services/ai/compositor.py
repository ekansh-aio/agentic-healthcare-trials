"""
Ad Compositor — overlays structured text/design onto a photo background.

Typography hierarchy (matches pharma/clinical trial ad style):
  ① Small italic serif  → intro phrase before ALL CAPS
  ② Huge bold serif     → ALL CAPS emphasis run (auto-sized to fill panel width)
  ③ Small italic serif  → continuation phrase after ALL CAPS
  ── divider ──
  ④ Bold sans-serif     → subtext

Usage:
    from app.services.ai.compositor import composite_ad
    png_bytes = composite_ad(photo_bytes, layout, canvas_w=1080, canvas_h=1920)
"""

import io
import os
import re
from typing import List, Tuple
from PIL import Image, ImageDraw, ImageFont

# ── Font candidates ───────────────────────────────────────────────────────────

_SERIF_BOLD = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf",
    "/Library/Fonts/Georgia Bold.ttf",
    "C:/Windows/Fonts/georgiab.ttf",
    "C:/Windows/Fonts/timesbd.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]

_SERIF_BOLD_ITALIC = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSerifBoldItalic.ttf",
    "/Library/Fonts/Georgia Bold Italic.ttf",
    "C:/Windows/Fonts/georgiaz.ttf",
    "C:/Windows/Fonts/timesbi.ttf",
    "C:/Windows/Fonts/georgiai.ttf",
]

_SANS_BOLD = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/calibrib.ttf",
]


def _load_font(candidates: list, size: int) -> ImageFont.FreeTypeFont:
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _tw(draw: ImageDraw.ImageDraw, text: str, font) -> float:
    return draw.textlength(text, font=font)


def _th(draw: ImageDraw.ImageDraw, text: str, font) -> int:
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[3] - bb[1]


def _parse_runs(text: str) -> List[Tuple[str, bool]]:
    """
    Split headline into [(segment_text, is_emphasis), ...].
    Consecutive ALL-CAPS words (≥2 letters) are grouped as one emphasis run.
    """
    words = text.split()
    runs, current, current_emp = [], [], None
    for word in words:
        clean = re.sub(r"[^a-zA-Z]", "", word)
        is_emp = len(clean) >= 2 and clean.isupper()
        if current_emp is None:
            current_emp, current = is_emp, [word]
        elif is_emp == current_emp:
            current.append(word)
        else:
            runs.append((" ".join(current), current_emp))
            current, current_emp = [word], is_emp
    if current:
        runs.append((" ".join(current), current_emp))
    return runs


def _fit_font(draw: ImageDraw.ImageDraw, text: str, candidates: list,
              max_w: float, max_size: int = 148, min_size: int = 64) -> ImageFont.FreeTypeFont:
    """Return the largest font from candidates where text fits within max_w."""
    for size in range(max_size, min_size - 1, -4):
        font = _load_font(candidates, size)
        if _tw(draw, text, font) <= max_w:
            return font
    return _load_font(candidates, min_size)


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_w: float) -> List[str]:
    """Word-wrap text into lines that fit max_w."""
    words, lines, current, cw = text.split(), [], [], 0.0
    for word in words:
        w  = _tw(draw, word, font)
        sp = _tw(draw, " ", font)
        gap = sp if current else 0
        if current and cw + gap + w > max_w:
            lines.append(" ".join(current))
            current, cw = [word], w
        else:
            current.append(word)
            cw += gap + w
    if current:
        lines.append(" ".join(current))
    return lines or [""]


def _draw_centered(draw: ImageDraw.ImageDraw, text: str, font,
                   y: int, canvas_w: int, color: tuple) -> int:
    """Draw centered text, return new y after the line."""
    w  = _tw(draw, text, font)
    h  = _th(draw, text, font)
    draw.text(((canvas_w - w) / 2, y), text, font=font, fill=color)
    return y + h


def _draw_top_section(
    draw: ImageDraw.ImageDraw,
    headline_text: str,
    subtext: str,
    canvas_w: int,
    top_h: int,
    padding: int,
    text_color: tuple,
    subtext_color: tuple,
    divider_color: tuple,
) -> None:
    """
    Renders the complete top panel:
      - Headline parsed into italic runs + big emphasis run
      - Divider
      - Subtext (bold sans, centered)
    Everything is vertically centered in top_h.
    """
    max_w        = canvas_w - padding * 2
    run_gap      = 8    # px between headline runs
    div_margin   = 38   # px above and below divider
    sub_line_gap = 12   # px between subtext lines
    divider_h    = 2

    # ── Fonts ─────────────────────────────────────────────────────────────────
    font_italic = _load_font(_SERIF_BOLD_ITALIC, 56)
    font_sub    = _load_font(_SANS_BOLD, 58)

    # ── Parse headline runs ───────────────────────────────────────────────────
    runs = _parse_runs(headline_text)

    # Build renderable items: each item = {"lines": [str], "font": font, "line_h": int}
    items = []
    for seg_text, is_emp in runs:
        if is_emp:
            font = _fit_font(draw, seg_text, _SERIF_BOLD, max_w)
            items.append({"lines": [seg_text], "font": font,
                          "line_h": _th(draw, seg_text, font)})
        else:
            wrapped = _wrap_text(draw, seg_text.strip(), font_italic, max_w)
            lh = _th(draw, wrapped[0] if wrapped else "A", font_italic)
            items.append({"lines": wrapped, "font": font_italic, "line_h": lh})

    # ── Measure subtext ───────────────────────────────────────────────────────
    sub_lines   = _wrap_text(draw, subtext, font_sub, max_w)
    sub_line_h  = _th(draw, sub_lines[0] if sub_lines else "A", font_sub)
    sub_total_h = sub_line_h * len(sub_lines) + sub_line_gap * max(0, len(sub_lines) - 1)

    # ── Measure total block ───────────────────────────────────────────────────
    hl_total_h = sum(
        itm["line_h"] * len(itm["lines"]) + run_gap * max(0, len(itm["lines"]) - 1)
        for itm in items
    ) + run_gap * max(0, len(items) - 1)

    total_h = hl_total_h + div_margin + divider_h + div_margin + sub_total_h

    # Vertically center the full block in top_h
    y = max(padding, (top_h - total_h) // 2)

    # ── Render headline runs ──────────────────────────────────────────────────
    for itm in items:
        for line in itm["lines"]:
            y = _draw_centered(draw, line, itm["font"], y, canvas_w, text_color)
            y += run_gap
        # Remove last run_gap, replace with inter-run gap
        y -= run_gap
        y += run_gap  # same here — just keeps spacing consistent

    y += div_margin

    # ── Divider ───────────────────────────────────────────────────────────────
    draw.line(
        [(padding, y), (canvas_w - padding, y)],
        fill=divider_color,
        width=divider_h,
    )
    y += divider_h + div_margin

    # ── Subtext ───────────────────────────────────────────────────────────────
    for line in sub_lines:
        y = _draw_centered(draw, line, font_sub, y, canvas_w, subtext_color)
        y += sub_line_gap


def composite_ad(
    photo_bytes: bytes,
    layout: dict,
    canvas_w: int = 1080,
    canvas_h: int = 1920,
) -> bytes:
    """
    Composites the final ad creative.

    Args:
        photo_bytes : Raw PNG/JPEG from GPT-image-1 (scene photo, no text)
        layout      : Design spec dict from Claude
        canvas_w/h  : Output dimensions (default 1080×1920 story format)

    Returns:
        Final ad as PNG bytes.
    """
    bg_color      = _hex_to_rgb(layout.get("top_bg_color",   "#0a1f5c"))
    top_pct       = layout.get("top_height_pct", 45) / 100
    headline_text = layout.get("headline_text",  "")
    subtext       = layout.get("subtext",        "")
    text_color    = _hex_to_rgb(layout.get("text_color",      "#FFFFFF"))
    divider_color = _hex_to_rgb(layout.get("divider_color",   "#FFFFFF"))
    subtext_color = _hex_to_rgb(layout.get("subtext_color",   "#FFFFFF"))

    top_h    = int(canvas_h * top_pct)
    bottom_h = canvas_h - top_h
    padding  = 72

    # ── Canvas ────────────────────────────────────────────────────────────────
    canvas = Image.new("RGB", (canvas_w, canvas_h), bg_color)
    draw   = ImageDraw.Draw(canvas)

    # ── Bottom: photo (center-crop to fill) ───────────────────────────────────
    photo = Image.open(io.BytesIO(photo_bytes)).convert("RGB")
    ph_w, ph_h   = photo.size
    target_ratio = canvas_w / bottom_h
    photo_ratio  = ph_w / ph_h

    if photo_ratio > target_ratio:
        new_w = int(ph_h * target_ratio)
        left  = (ph_w - new_w) // 2
        photo = photo.crop((left, 0, left + new_w, ph_h))
    else:
        new_h = int(ph_w / target_ratio)
        top_c = (ph_h - new_h) // 2
        photo = photo.crop((0, top_c, ph_w, top_c + new_h))

    photo = photo.resize((canvas_w, bottom_h), Image.LANCZOS)
    canvas.paste(photo, (0, top_h))

    # ── Top: full text section ────────────────────────────────────────────────
    _draw_top_section(
        draw=draw,
        headline_text=headline_text,
        subtext=subtext,
        canvas_w=canvas_w,
        top_h=top_h,
        padding=padding,
        text_color=text_color,
        subtext_color=subtext_color,
        divider_color=divider_color,
    )

    # ── Save ──────────────────────────────────────────────────────────────────
    output = io.BytesIO()
    canvas.save(output, format="PNG", optimize=True)
    return output.getvalue()
