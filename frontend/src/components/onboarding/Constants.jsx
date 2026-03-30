import { Building2, UserPlus, FileUp, MapPin, Palette, Cpu } from "lucide-react";

// ── Wizard step definitions ────────────────────────────────────────────────
export const STEPS = [
  { label: "Company Info",     icon: Building2 },
  { label: "Study Coordinator Account", icon: UserPlus },
  { label: "Upload Documents", icon: FileUp },
  { label: "Locations",        icon: MapPin },
  { label: "Brand Kit",        icon: Palette },
  { label: "AI Training",      icon: Cpu },
];

// ── Document type options (Step 2) ────────────────────────────────────────
export const DOC_TYPES = [
  { value: "usp",               label: "Unique Selling Proposition", icon: "🎯" },
  { value: "compliance",        label: "Compliance Documents",       icon: "⚖️"  },
  { value: "policy",            label: "Company Policies",           icon: "📋" },
  { value: "marketing_goal",    label: "Marketing Goals",            icon: "📈" },
  { value: "ethical_guideline", label: "Ethical Guidelines",         icon: "🤝" },
  { value: "input",             label: "Input Documents / Briefs",   icon: "📥" },
  { value: "other",             label: "Others",                     icon: "➕" },
];

export const ACCEPTED_DOC_FORMATS = ".pdf,.doc,.docx,.txt";
export const ACCEPTED_DOC_MIME    = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

// ── Brand kit presets by industry (Step 3) ────────────────────────────────
//
// Color rules for every preset:
//   primaryColor  — deep, dark, saturated. Becomes sidebar + primary buttons.
//                   Must look good as a large background (not too bright).
//   accentColor   — vivid, warm or contrasting hue. Used on white backgrounds
//                   for buttons, links, badges, focus rings. Must pass 3:1
//                   contrast on white at minimum. No light or desaturated values.
//   secondaryColor — used by AI for ad/campaign generation only, not UI theming.
//
// Primary and accent should be complementary (opposite sides of the color wheel)
// or at least split-complementary — never analogous (same hue family).
//
export const BRAND_PRESETS = {
  Technology: [
    {
      // Deep navy primary, vivid orange accent — high contrast, energetic
      name: "Tech Clarity",
      primaryColor: "#1e3a5f", secondaryColor: "#0f172a", accentColor: "#f97316",
      primaryFont: "Inter", secondaryFont: "IBM Plex Mono",
      adjectives: "precise, innovative, trustworthy",
      dos: "Use data-driven language, keep it crisp", donts: "Avoid buzzwords, no hype",
    },
    {
      // Deep violet primary, amber accent — bold contrast, startup energy
      name: "Startup Bold",
      primaryColor: "#4c1d95", secondaryColor: "#18181b", accentColor: "#f59e0b",
      primaryFont: "Space Grotesk", secondaryFont: "Inter",
      adjectives: "bold, disruptive, energetic",
      dos: "Lead with impact, use active voice", donts: "No corporate speak, avoid passive voice",
    },
    {
      // Dark slate blue primary, emerald accent — professional, trustworthy
      name: "Enterprise Pro",
      primaryColor: "#1e3a8a", secondaryColor: "#1e293b", accentColor: "#10b981",
      primaryFont: "DM Sans", secondaryFont: "Source Serif 4",
      adjectives: "reliable, professional, authoritative",
      dos: "Formal tone, cite numbers", donts: "No slang, avoid ambiguity",
    },
  ],
  Finance: [
    {
      // Deep forest green primary, warm amber accent — wealth, stability
      name: "Trust & Wealth",
      primaryColor: "#14532d", secondaryColor: "#1c1917", accentColor: "#d97706",
      primaryFont: "Playfair Display", secondaryFont: "Lato",
      adjectives: "trustworthy, established, growth-focused",
      dos: "Reassure, use clear figures", donts: "No vague promises, avoid risk downplaying",
    },
    {
      // Dark ocean blue primary, coral accent — modern, accessible
      name: "Modern Finance",
      primaryColor: "#0c4a6e", secondaryColor: "#0f172a", accentColor: "#f43f5e",
      primaryFont: "Sora", secondaryFont: "Mulish",
      adjectives: "smart, accessible, forward-thinking",
      dos: "Simplify jargon, be transparent", donts: "No fear-mongering, avoid complexity",
    },
    {
      // Deep mahogany primary, warm gold accent — luxury, discretion
      name: "Premium Banking",
      primaryColor: "#78350f", secondaryColor: "#111827", accentColor: "#b45309",
      primaryFont: "Cormorant Garamond", secondaryFont: "Nunito Sans",
      adjectives: "exclusive, refined, discreet",
      dos: "Understated elegance, high quality feel", donts: "No aggressive sales, avoid loud claims",
    },
  ],
  Retail: [
    {
      // Deep crimson primary, vivid yellow accent — energy, urgency
      name: "Pop & Energy",
      primaryColor: "#7f1d1d", secondaryColor: "#18181b", accentColor: "#eab308",
      primaryFont: "Nunito", secondaryFont: "Open Sans",
      adjectives: "fun, vibrant, accessible",
      dos: "Use excitement, urgency, deals", donts: "No technical terms, avoid dull language",
    },
    {
      // Charcoal primary, teal accent — clean, modern, readable
      name: "Minimal Shop",
      primaryColor: "#1f2937", secondaryColor: "#f9fafb", accentColor: "#0d9488",
      primaryFont: "DM Sans", secondaryFont: "Georgia",
      adjectives: "clean, curated, quality-first",
      dos: "Let products speak, be concise", donts: "No clutter, avoid over-promising",
    },
    {
      // Near-black primary, deep gold accent — timeless luxury
      name: "Luxury Retail",
      primaryColor: "#0f0f0f", secondaryColor: "#fafaf9", accentColor: "#92690a",
      primaryFont: "Didact Gothic", secondaryFont: "EB Garamond",
      adjectives: "exclusive, aspirational, timeless",
      dos: "Evoke desire, use sensory language", donts: "No discounts in copy, avoid casualness",
    },
  ],
  Healthcare: [
    {
      // Deep teal primary, warm orange accent — calm, trustworthy, clear
      name: "Care & Trust",
      primaryColor: "#134e4a", secondaryColor: "#f0f9ff", accentColor: "#ea580c",
      primaryFont: "Source Sans Pro", secondaryFont: "Merriweather",
      adjectives: "compassionate, reliable, clear",
      dos: "Empathize, use plain language", donts: "No fear language, avoid complex medical jargon",
    },
    {
      // Deep emerald primary, vivid violet accent — fresh, optimistic
      name: "Modern Wellness",
      primaryColor: "#064e3b", secondaryColor: "#1a1a2e", accentColor: "#7c3aed",
      primaryFont: "Quicksand", secondaryFont: "Roboto",
      adjectives: "fresh, holistic, optimistic",
      dos: "Inspire action, be positive", donts: "Avoid clinical coldness, no scare tactics",
    },
  ],
  Education: [
    {
      // Deep indigo primary, warm amber accent — authority, inspiration
      name: "Academic",
      primaryColor: "#1e1b4b", secondaryColor: "#1e293b", accentColor: "#d97706",
      primaryFont: "Libre Baskerville", secondaryFont: "Noto Sans",
      adjectives: "authoritative, inspiring, credible",
      dos: "Back with evidence, inspire curiosity", donts: "No dumbing down, avoid being preachy",
    },
    {
      // Deep fuchsia primary, vivid cyan accent — playful, energetic
      name: "EdTech Fun",
      primaryColor: "#701a75", secondaryColor: "#fdf4ff", accentColor: "#0891b2",
      primaryFont: "Fredoka One", secondaryFont: "Nunito",
      adjectives: "playful, encouraging, accessible",
      dos: "Celebrate progress, use relatable language", donts: "No gatekeeping, avoid elitism",
    },
  ],
};

export const DEFAULT_PRESETS = BRAND_PRESETS.Technology;