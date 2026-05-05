"""
Ad Compositor — Clinical Trial Recruitment Ad Creative
══════════════════════════════════════════════════════

Three layout styles (set layout["layout_style"]):

  dark_panel_top : solid brand-colour panel (top N%) + photo (bottom)
                   → Nucleus Network / Trialfacts / Nightingale style
  photo_top      : photo (top ~52%) + light/cream panel (bottom)
                   → Clinical Trial Seeker / George Institute style
  full_bleed     : photo fills entire canvas + dark gradient scrim
                   → Sydney Clinic / "1 in 70" style

All layouts render:
  large bold sans-serif headline (ALL-CAPS words auto-sized bigger)
  → subtext line
  → pill CTA button
"""

import io
import os
import re
from typing import List, Tuple

from PIL import Image, ImageDraw, ImageFont

# ── Font paths ────────────────────────────────────────────────────────────────

_SANS_BOLD = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/calibrib.ttf",
]
_SANS_REG = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/calibri.ttf",
]


# ── Utilities ─────────────────────────────────────────────────────────────────

def _load_font(candidates: list, size: int) -> ImageFont.FreeTypeFont:
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _hex_to_rgb(h: str) -> Tuple[int, int, int]:
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _hex_to_rgba(h: str, alpha: int = 255) -> Tuple[int, int, int, int]:
    r, g, b = _hex_to_rgb(h)
    return (r, g, b, alpha)


def _is_light(hex_color: str) -> bool:
    r, g, b = _hex_to_rgb(hex_color)
    return (0.299 * r + 0.587 * g + 0.114 * b) > 155


def _tw(draw, text: str, font) -> float:
    return draw.textlength(text, font=font)


def _th(draw, text: str, font) -> int:
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[3] - bb[1]


def _top_off(draw, text: str, font) -> int:
    return draw.textbbox((0, 0), text, font=font)[1]


def _wrap(draw, text: str, font, max_w: float) -> List[str]:
    words = text.split()
    if not words:
        return [""]
    lines, cur, cw = [], [], 0.0
    for word in words:
        w  = _tw(draw, word, font)
        sp = _tw(draw, " ", font)
        gap = sp if cur else 0.0
        if cur and cw + gap + w > max_w:
            lines.append(" ".join(cur))
            cur, cw = [word], w
        else:
            cur.append(word)
            cw += gap + w
    if cur:
        lines.append(" ".join(cur))
    return lines


def _parse_runs(text: str) -> List[Tuple[str, bool]]:
    """Split headline into [(segment, is_emphasis)] — ALL-CAPS words = emphasis."""
    words = text.split()
    runs, cur, cur_emp = [], [], None
    for word in words:
        letters = re.sub(r"[^a-zA-Z]", "", word)
        emp = len(letters) >= 2 and letters.isupper()
        if cur_emp is None:
            cur_emp, cur = emp, [word]
        elif emp == cur_emp:
            cur.append(word)
        else:
            runs.append((" ".join(cur), cur_emp))
            cur, cur_emp = [word], emp
    if cur:
        runs.append((" ".join(cur), cur_emp))
    return runs


def _fit_font(draw, text: str, max_w: float,
              max_size: int = 160, min_size: int = 44) -> ImageFont.FreeTypeFont:
    """Largest font where the longest word fits within max_w."""
    words = text.split() or [text]
    for size in range(max_size, min_size - 1, -4):
        f = _load_font(_SANS_BOLD, size)
        if all(_tw(draw, w, f) <= max_w for w in words):
            return f
    return _load_font(_SANS_BOLD, min_size)


# ── Gradient ──────────────────────────────────────────────────────────────────

def _draw_gradient(img: Image.Image,
                   x0: int, y0: int, x1: int, y1: int,
                   c_top: tuple, c_bot: tuple) -> None:
    w, h = x1 - x0, y1 - y0
    if w <= 0 or h <= 0:
        return
    band = Image.new("RGBA", (w, h))
    px   = band.load()
    for row in range(h):
        t = row / max(h - 1, 1)
        r = int(c_top[0] + (c_bot[0] - c_top[0]) * t)
        g = int(c_top[1] + (c_bot[1] - c_top[1]) * t)
        b = int(c_top[2] + (c_bot[2] - c_top[2]) * t)
        a = int(c_top[3] + (c_bot[3] - c_top[3]) * t)
        for col in range(w):
            px[col, row] = (r, g, b, a)
    img.alpha_composite(band, (x0, y0))


# ── Photo helper ──────────────────────────────────────────────────────────────

def _crop_resize(photo_bytes: bytes, target_w: int, target_h: int) -> Image.Image:
    img = Image.open(io.BytesIO(photo_bytes)).convert("RGBA")
    pw, ph = img.size
    ratio = target_w / target_h
    if pw / ph > ratio:
        nw  = int(ph * ratio)
        img = img.crop(((pw - nw) // 2, 0, (pw - nw) // 2 + nw, ph))
    else:
        nh  = int(pw / ratio)
        img = img.crop((0, (ph - nh) // 2, pw, (ph - nh) // 2 + nh))
    return img.resize((target_w, target_h), Image.LANCZOS)


# ── Text rendering ────────────────────────────────────────────────────────────

def _shadow_text(draw, x: int, y: int, text: str, font,
                 color: tuple, off: int = 4, alpha: int = 130) -> None:
    draw.text((x + off, y + off), text, font=font, fill=(0, 0, 0, alpha))
    draw.text((x, y),             text, font=font, fill=color)


def _draw_pill_button(canvas: Image.Image, draw,
                      cx: int, y: int, text: str, font,
                      fill: tuple, text_color: tuple,
                      pad_x: int = 72, pad_y: int = 30,
                      radius: int = 60) -> int:
    """Draw a pill CTA button centered at cx, top at y. Returns button height."""
    tw   = int(_tw(draw, text, font))
    th   = int(_th(draw, text, font))
    bw   = tw + pad_x * 2
    bh   = th + pad_y * 2
    x0, y0 = cx - bw // 2, y
    x1, y1 = x0 + bw,     y0 + bh

    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)
    canvas.alpha_composite(layer)

    to = _top_off(draw, text, font)
    draw.text((x0 + pad_x, y0 + pad_y - to), text, font=font, fill=text_color)
    return bh


# ── Shared text-block renderer ────────────────────────────────────────────────

def _render_text_block(
    canvas: Image.Image,
    layout: dict,
    region_x0: int, region_y0: int,
    region_x1: int, region_y1: int,
    is_over_photo: bool = False,
) -> None:
    """
    Render headline → subtext → CTA pill button, vertically centred inside
    the given region rectangle.  Modifies canvas in place.
    """
    draw = ImageDraw.Draw(canvas)

    headline   = layout.get("headline_text", "")
    subtext    = layout.get("subtext", "")
    cta        = layout.get("cta", "Book Now")
    txt_color  = _hex_to_rgba(layout.get("text_color",    "#FFFFFF"))
    sub_color  = _hex_to_rgba(layout.get("subtext_color", "#CCCCCC"))
    panel_hex  = layout.get("top_bg_color", "#0a1f5c")

    rw   = region_x1 - region_x0
    rh   = region_y1 - region_y0
    cx   = (region_x0 + region_x1) // 2
    pad  = 72
    maxw = rw - pad * 2

    # ── Shadow strength ───────────────────────────────────────────────────────
    shad_off = 5 if is_over_photo else 3
    shad_a   = 160 if is_over_photo else 100

    # ── Parse headline into (text, is_emphasis) runs ──────────────────────────
    runs = _parse_runs(headline)

    EMP_MAX, EMP_MIN = 148, 52   # ALL-CAPS emphasis segments
    REG_SZ           = 62        # regular-case segments

    segments = []
    for seg_text, is_emp in runs:
        if is_emp:
            f    = _fit_font(draw, seg_text, maxw, max_size=EMP_MAX, min_size=EMP_MIN)
            lines = _wrap(draw, seg_text, f, maxw)
        else:
            f    = _load_font(_SANS_BOLD, REG_SZ)
            lines = _wrap(draw, seg_text, f, maxw)
        lh = _th(draw, lines[0] if lines else seg_text, f)
        segments.append({"font": f, "is_emp": is_emp, "lines": lines, "lh": lh})

    LINE_GAP = 10
    SEG_GAP  = 18

    hl_h = (
        sum(s["lh"] * len(s["lines"]) + LINE_GAP * max(0, len(s["lines"]) - 1)
            for s in segments)
        + SEG_GAP * max(0, len(segments) - 1)
    )

    # ── Subtext ───────────────────────────────────────────────────────────────
    sub_sz   = 46
    font_sub = _load_font(_SANS_BOLD, sub_sz)
    sub_lines = _wrap(draw, subtext, font_sub, maxw)
    sub_lh   = _th(draw, sub_lines[0], font_sub) if sub_lines else 0
    sub_h    = sub_lh * len(sub_lines) + 8 * max(0, len(sub_lines) - 1)

    # ── CTA button ────────────────────────────────────────────────────────────
    cta_font = _load_font(_SANS_BOLD, 50)
    btn_pad_x, btn_pad_y = 72, 30
    btn_h = _th(draw, cta, cta_font) + btn_pad_y * 2

    SUBTEXT_GAP = 30
    BTN_GAP     = 48

    total_h = hl_h + SUBTEXT_GAP + sub_h + BTN_GAP + btn_h

    # Vertically centre (clamp to padding)
    avail = rh - pad * 2
    if total_h <= avail:
        y = region_y0 + (rh - total_h) // 2
    else:
        # Scale down emphasis font if overflow
        scale    = avail / total_h
        new_emp  = max(EMP_MIN, int(EMP_MAX * scale))
        new_reg  = max(38,      int(REG_SZ  * scale))
        new_sub  = max(28,      int(sub_sz  * scale))
        segments = []
        for seg_text, is_emp in runs:
            if is_emp:
                f    = _fit_font(draw, seg_text, maxw, max_size=new_emp, min_size=EMP_MIN)
                lines = _wrap(draw, seg_text, f, maxw)
            else:
                f    = _load_font(_SANS_BOLD, new_reg)
                lines = _wrap(draw, seg_text, f, maxw)
            lh = _th(draw, lines[0] if lines else seg_text, f)
            segments.append({"font": f, "is_emp": is_emp, "lines": lines, "lh": lh})
        font_sub  = _load_font(_SANS_BOLD, new_sub)
        sub_lines = _wrap(draw, subtext, font_sub, maxw)
        sub_lh    = _th(draw, sub_lines[0], font_sub) if sub_lines else 0
        sub_h     = sub_lh * len(sub_lines) + 8 * max(0, len(sub_lines) - 1)
        cta_font  = _load_font(_SANS_BOLD, max(32, int(50 * scale)))
        btn_h     = _th(draw, cta, cta_font) + btn_pad_y * 2
        hl_h      = (
            sum(s["lh"] * len(s["lines"]) + LINE_GAP * max(0, len(s["lines"]) - 1)
                for s in segments)
            + SEG_GAP * max(0, len(segments) - 1)
        )
        total_h   = hl_h + SUBTEXT_GAP + sub_h + BTN_GAP + btn_h
        y = region_y0 + max(pad, (rh - total_h) // 2)

    # ── Draw headline ─────────────────────────────────────────────────────────
    for i, seg in enumerate(segments):
        for j, line in enumerate(seg["lines"]):
            lw = _tw(draw, line, seg["font"])
            to = _top_off(draw, line, seg["font"])
            tx = cx - lw / 2
            _shadow_text(draw, int(tx), int(y - to), line, seg["font"],
                         txt_color, shad_off, shad_a)
            y += seg["lh"]
            if j < len(seg["lines"]) - 1:
                y += LINE_GAP
        if i < len(segments) - 1:
            y += SEG_GAP

    # ── Draw subtext ──────────────────────────────────────────────────────────
    y += SUBTEXT_GAP
    for j, line in enumerate(sub_lines):
        lw = _tw(draw, line, font_sub)
        to = _top_off(draw, line, font_sub)
        tx = cx - lw / 2
        _shadow_text(draw, int(tx), int(y - to), line, font_sub,
                     sub_color, max(2, shad_off - 2), shad_a // 2)
        y += sub_lh
        if j < len(sub_lines) - 1:
            y += 8

    # ── CTA pill button ───────────────────────────────────────────────────────
    y += BTN_GAP
    if _is_light(panel_hex):
        # light panel → dark filled button
        btn_fill = _hex_to_rgba(layout.get("text_color", "#1a1a1a"))
        btn_txt  = (255, 255, 255, 255)
    else:
        # dark panel → white filled button with panel-colour text
        btn_fill = (255, 255, 255, 255)
        btn_txt  = _hex_to_rgba(panel_hex)

    _draw_pill_button(canvas, draw, cx, int(y), cta, cta_font,
                      btn_fill, btn_txt, btn_pad_x, btn_pad_y)


# ── Layout: dark panel top + photo bottom ─────────────────────────────────────

def _layout_dark_panel_top(photo_bytes: bytes, layout: dict,
                            canvas_w: int, canvas_h: int) -> bytes:
    bg_hex  = layout.get("top_bg_color", "#0a1f5c")
    top_pct = max(0.38, min(0.55, layout.get("top_height_pct", 44) / 100))
    top_h   = int(canvas_h * top_pct)
    bot_h   = canvas_h - top_h
    bg_rgb  = _hex_to_rgb(bg_hex)

    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 255))

    # Solid panel
    panel = Image.new("RGBA", (canvas_w, top_h), (*bg_rgb, 255))
    canvas.alpha_composite(panel)

    # Subtle top→bottom darkening gradient on panel
    r, g, b = bg_rgb
    _draw_gradient(canvas, 0, 0, canvas_w, top_h,
                   (max(0,r-20), max(0,g-20), max(0,b-20), 110),
                   (r, g, b, 0))

    # 6-px accent stripe at very top
    accent = (min(255,r+55), min(255,g+55), min(255,b+75), 255)
    ImageDraw.Draw(canvas).rectangle([0, 0, canvas_w, 6], fill=accent)

    # Photo in bottom section
    photo = _crop_resize(photo_bytes, canvas_w, bot_h)
    canvas.alpha_composite(photo, (0, top_h))

    # Soft gradient fade: panel colour bleeds into photo edge
    _draw_gradient(canvas, 0, top_h - 60, canvas_w, top_h + 30,
                   (*bg_rgb, 240), (*bg_rgb, 0))

    # Text block centred in panel
    _render_text_block(canvas, layout, 0, 0, canvas_w, top_h, is_over_photo=False)

    return _to_png(canvas)


# ── Layout: photo top + light panel bottom ────────────────────────────────────

def _layout_photo_top(photo_bytes: bytes, layout: dict,
                      canvas_w: int, canvas_h: int) -> bytes:
    photo_pct = max(0.40, min(0.60, layout.get("top_height_pct", 50) / 100))
    photo_h   = int(canvas_h * photo_pct)
    panel_h   = canvas_h - photo_h
    panel_hex = layout.get("top_bg_color", "#F5F0EB")
    panel_rgb = _hex_to_rgb(panel_hex)

    canvas = Image.new("RGBA", (canvas_w, canvas_h), (*panel_rgb, 255))

    # Photo at top
    photo = _crop_resize(photo_bytes, canvas_w, photo_h)
    canvas.alpha_composite(photo, (0, 0))

    # Light panel at bottom (solid)
    panel = Image.new("RGBA", (canvas_w, panel_h), (*panel_rgb, 255))
    canvas.alpha_composite(panel, (0, photo_h))

    # Thin separator line between photo and panel
    div_color = _hex_to_rgba(layout.get("divider_color", "#DDDDDD"), 180)
    ImageDraw.Draw(canvas).rectangle(
        [0, photo_h - 2, canvas_w, photo_h + 2], fill=div_color
    )

    # Soft gradient: photo fades into panel at the join
    _draw_gradient(canvas, 0, photo_h - 40, canvas_w, photo_h + 10,
                   (*panel_rgb, 0), (*panel_rgb, 220))

    # Text block in bottom panel
    _render_text_block(canvas, layout,
                       0, photo_h, canvas_w, canvas_h,
                       is_over_photo=False)

    return _to_png(canvas)


# ── Layout: full-bleed photo + dark gradient scrim ────────────────────────────

def _layout_full_bleed(photo_bytes: bytes, layout: dict,
                        canvas_w: int, canvas_h: int) -> bytes:
    scrim_hex = layout.get("top_bg_color", "#111111")
    scrim_rgb = _hex_to_rgb(scrim_hex)

    canvas = Image.new("RGBA", (canvas_w, canvas_h))

    # Full-canvas photo
    photo = _crop_resize(photo_bytes, canvas_w, canvas_h)
    canvas.alpha_composite(photo)

    # Dark scrim from bottom — covers bottom 55% with deep opacity
    scrim_h = int(canvas_h * 0.58)
    _draw_gradient(canvas,
                   0, canvas_h - scrim_h, canvas_w, canvas_h,
                   (*scrim_rgb, 0), (*scrim_rgb, 235))

    # Lighter top vignette (adds depth, helps logo area)
    _draw_gradient(canvas, 0, 0, canvas_w, int(canvas_h * 0.18),
                   (*scrim_rgb, 120), (*scrim_rgb, 0))

    # Text block in bottom 55%
    text_region_top = canvas_h - scrim_h + int(scrim_h * 0.06)
    _render_text_block(canvas, layout,
                       0, text_region_top, canvas_w, canvas_h,
                       is_over_photo=True)

    return _to_png(canvas)


# ── Output helper ─────────────────────────────────────────────────────────────

def _to_png(canvas: Image.Image) -> bytes:
    out = io.BytesIO()
    canvas.convert("RGB").save(out, format="PNG", optimize=True)
    return out.getvalue()


# ── Public entry point ────────────────────────────────────────────────────────

def composite_ad(
    photo_bytes: bytes,
    layout: dict,
    canvas_w: int = 1080,
    canvas_h: int = 1920,
) -> bytes:
    style = layout.get("layout_style", "dark_panel_top")
    if style == "photo_top":
        return _layout_photo_top(photo_bytes, layout, canvas_w, canvas_h)
    if style == "full_bleed":
        return _layout_full_bleed(photo_bytes, layout, canvas_w, canvas_h)
    return _layout_dark_panel_top(photo_bytes, layout, canvas_w, canvas_h)
