/**
 * Brand Theme Service
 * Applies a company's brand kit to the UI by writing CSS custom properties
 * onto document.documentElement at runtime.
 *
 * Only two brand fields affect the UI:
 *   - primary_color  → dark structural tokens (sidebar, primary buttons)
 *   - accent_color   → accent tokens (focus rings, active states, badges, CTAs)
 *
 * secondary_color is intentionally excluded — it is used by the AI curator
 * when generating campaign assets, not for platform UI theming.
 *
 * White, light grays, and all neutral surface tokens are never touched.
 */

// ── Tuning constants ────────────────────────────────────────────────────────
// Adjust these to experiment with how aggressively brand colors are applied.

/** Maximum HSL lightness (0–100) allowed for sidebar / dark-button backgrounds.
 *  Primary colors lighter than this are clamped down to this value.
 *  Raise it to allow lighter sidebars; lower it for a more dramatic dark chrome. */
const PRIMARY_MAX_LIGHTNESS = 22;

/** How much darker the hover state of primary buttons is vs the base (HSL units). */
const PRIMARY_HOVER_DARKEN = 6;

/** Lightness for the sidebar border — slightly lighter than the sidebar bg. */
const SIDEBAR_BORDER_LIGHTNESS_OFFSET = 12;

/** Lightness for the subtle accent background (the very faint tinted chip backgrounds). */
const ACCENT_SUBTLE_LIGHTNESS = 95;

/** Lightness for accent text shown on accent-subtle backgrounds. */
const ACCENT_TEXT_LIGHTNESS = 28;

/** Lightness for the active sidebar nav link text (lighter, vivid version of accent). */
const ACCENT_ACTIVE_TEXT_LIGHTNESS = 62;

// ── Color math helpers ──────────────────────────────────────────────────────

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h;
  switch (max) {
    case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
    case gn: h = ((bn - rn) / d + 2) / 6; break;
    default: h = ((rn - gn) / d + 4) / 6; break;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** Returns a CSS hsl() string with clamped lightness. */
function hsl(h, s, l) {
  const clampedL = Math.max(0, Math.min(100, l));
  const clampedS = Math.max(0, Math.min(100, s));
  return `hsl(${Math.round(h)}, ${Math.round(clampedS)}%, ${Math.round(clampedL)}%)`;
}

function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

// ── Token derivation ────────────────────────────────────────────────────────

function derivePrimaryTokens(primaryHex) {
  const { h, s, l } = hexToHsl(primaryHex);

  // Clamp lightness so any primary color becomes dark enough for sidebar use.
  const darkL = Math.min(l, PRIMARY_MAX_LIGHTNESS);

  return {
    "--color-sidebar-bg":         hsl(h, s, darkL),
    "--color-sidebar-border":     hsl(h, s, darkL + SIDEBAR_BORDER_LIGHTNESS_OFFSET),
    "--color-btn-primary-bg":     hsl(h, s, darkL),
    "--color-btn-primary-hover":  hsl(h, s, darkL + PRIMARY_HOVER_DARKEN),
  };
}

function deriveAccentTokens(accentHex) {
  const { h, s } = hexToHsl(accentHex);

  return {
    "--color-accent":              accentHex,
    "--color-accent-hover":        hsl(h, s, 35),
    "--color-accent-subtle":       hsl(h, s, ACCENT_SUBTLE_LIGHTNESS),
    "--color-accent-text":         hsl(h, s, ACCENT_TEXT_LIGHTNESS),
    "--color-sidebar-text-active": hsl(h, s, ACCENT_ACTIVE_TEXT_LIGHTNESS),

    // Sidebar active nav link background uses a low-opacity tint of the accent.
    // This is applied inline in Layout.jsx as rgba so we also expose the raw
    // RGB components for use in rgba() expressions.
    "--color-accent-r": String(hexToRgb(accentHex).r),
    "--color-accent-g": String(hexToRgb(accentHex).g),
    "--color-accent-b": String(hexToRgb(accentHex).b),
  };
}

// ── Font loading ────────────────────────────────────────────────────────────

// Fonts that ship with the browser or system — no Google Fonts fetch needed.
const SYSTEM_FONTS = new Set([
  "helvetica neue", "helvetica", "arial", "georgia", "times new roman",
  "courier new", "verdana", "trebuchet ms", "impact",
]);

/**
 * Injects a Google Fonts <link> for the given font family if it hasn't
 * been loaded already. Skips system fonts. Safe to call multiple times.
 */
function loadGoogleFont(fontFamily) {
  if (!fontFamily) return;
  if (SYSTEM_FONTS.has(fontFamily.toLowerCase())) return;

  const id = `gf-${fontFamily.replace(/\s+/g, "-").toLowerCase()}`;
  if (document.getElementById(id)) return;

  const encoded = encodeURIComponent(fontFamily);
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

// ── Persistence keys ────────────────────────────────────────────────────────

// When this localStorage key is set to "default", AuthContext will skip
// applyBrandTheme on login and session restore, preserving the platform default.
// The flag is cleared automatically when the user actively saves a brand kit.
const THEME_OVERRIDE_KEY = "theme_override";

// Cached brand kit — written by applyBrandTheme, read on page refresh so the
// correct theme is restored instantly without waiting for an API round-trip.
const THEME_CACHE_KEY = "brand_kit_cache";

export function isDefaultThemeOverrideActive() {
  return localStorage.getItem(THEME_OVERRIDE_KEY) === "default";
}

/**
 * Returns the last applied brand kit from localStorage, or null if none.
 * Used by AuthContext to restore the theme instantly on page refresh.
 */
export function getCachedBrandTheme() {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Applies brand kit colors and font to the document root CSS variables.
 * Safe to call multiple times — each call overwrites the previous theme.
 * No-ops gracefully if the brand kit is missing or has no fields.
 * Clears the default-theme override flag so the brand theme stays active
 * across refreshes after the user saves a new brand kit.
 *
 * @param {object|null} brandKit  — response from GET /brand-kit/
 *   Expected fields: primary_color, accent_color, primary_font (all optional)
 */
export function applyBrandTheme(brandKit) {
  if (!brandKit) return;

  // Saving a brand kit always clears the "use default" override.
  localStorage.removeItem(THEME_OVERRIDE_KEY);

  // Persist so the theme can be restored instantly on next page refresh
  // without waiting for a network round-trip.
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(brandKit));
  } catch { /* quota exceeded — ignore */ }

  const root = document.documentElement;

  if (brandKit.primary_color) {
    const tokens = derivePrimaryTokens(brandKit.primary_color);
    Object.entries(tokens).forEach(([prop, val]) => {
      root.style.setProperty(prop, val);
    });
  }

  if (brandKit.accent_color) {
    const tokens = deriveAccentTokens(brandKit.accent_color);
    Object.entries(tokens).forEach(([prop, val]) => {
      root.style.setProperty(prop, val);
    });
  }

  if (brandKit.primary_font) {
    loadGoogleFont(brandKit.primary_font);
    root.style.setProperty(
      "--font-sans",
      `'${brandKit.primary_font}', system-ui, -apple-system, sans-serif`,
    );
  }
}

/**
 * Resets all brand theme tokens back to the defaults defined in index.css
 * and sets the persistent override flag so the default theme survives
 * page refreshes. The brand kit in the DB is untouched.
 *
 * Pass clearFlag=true on logout to also remove the override flag so the
 * next company's login starts clean.
 */
export function resetBrandTheme({ clearFlag = false } = {}) {
  // Always clear the cache so a stale kit isn't restored on the next load.
  localStorage.removeItem(THEME_CACHE_KEY);

  const root = document.documentElement;
  const props = [
    "--color-accent",
    "--color-accent-hover",
    "--color-accent-subtle",
    "--color-accent-text",
    "--color-sidebar-text-active",
    "--color-accent-r",
    "--color-accent-g",
    "--color-accent-b",
    "--color-sidebar-bg",
    "--color-sidebar-border",
    "--color-btn-primary-bg",
    "--color-btn-primary-hover",
    "--font-sans",
  ];
  props.forEach((prop) => root.style.removeProperty(prop));

  if (clearFlag) {
    localStorage.removeItem(THEME_OVERRIDE_KEY);
  } else {
    localStorage.setItem(THEME_OVERRIDE_KEY, "default");
  }
}