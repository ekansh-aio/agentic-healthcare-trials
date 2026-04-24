import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { SectionCard } from "../../shared/Layout";
import { adsAPI } from "../../../services/api";
import { hasType, typeLabel } from "../publisherUtils";
import MetaPlatformSettings from "../MetaPlatformSettings";
import {
  Image, AlertCircle, Share2, Link2, Link2Off, SlidersHorizontal,
  Eye, CheckCircle2, ExternalLink, Loader2,
} from "lucide-react";

// ─── Common currencies for Meta ad accounts ──────────────────────────────────
export const CURRENCIES = [
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "NZD", label: "NZD — New Zealand Dollar" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
  { code: "HKD", label: "HKD — Hong Kong Dollar" },
  { code: "CHF", label: "CHF — Swiss Franc" },
  { code: "SEK", label: "SEK — Swedish Krona" },
  { code: "NOK", label: "NOK — Norwegian Krone" },
  { code: "DKK", label: "DKK — Danish Krone" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "BRL", label: "BRL — Brazilian Real" },
  { code: "MXN", label: "MXN — Mexican Peso" },
  { code: "ZAR", label: "ZAR — South African Rand" },
];

// ─── Top countries with ISO codes for Meta targeting ─────────────────────────
export const COUNTRY_LIST = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "CH", name: "Switzerland" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "PL", name: "Poland" },
  { code: "FI", name: "Finland" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "JP", name: "Japan" },
  { code: "IN", name: "India" },
  { code: "ZA", name: "South Africa" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "MY", name: "Malaysia" },
  { code: "PH", name: "Philippines" },
];

// ─── Social distribution platform definitions ────────────────────────────────
// Only Meta/Instagram is active. Other platforms are shown as "Coming soon".
// Credentials (access_token, ad_account_id, page_id) come from the stored
// PlatformConnection — they are no longer entered per-publish.
export const SOCIAL_PLATFORMS = {
  "Meta/Instagram": {
    id: "meta",
    active: true,
    usesOAuth: true,   // credentials come from Platform Settings, not typed in here
    fields: [
      { key: "destination_url", label: "Destination URL", type: "text", placeholder: "https://…", required: true },
    ],
  },
  "Google Ads": { id: "google_ads", active: false, fields: [] },
  "LinkedIn":   { id: "linkedin",   active: false, fields: [] },
  "YouTube":    { id: "youtube",    active: false, fields: [] },
  "Twitter/X":  { id: "twitter",    active: false, fields: [] },
  "TikTok":     { id: "tiktok",     active: false, fields: [] },
};

// ─── Distribute Tab ───────────────────────────────────────────────────────────
export default function DistributeTab({
  ads, distExpanded, distForms, distStatus,
  onSelectPlatform, onUpdateForm, onDistribute, onPreviewAd,
  metaConnection, metaAccounts, connectingMeta, loadingAccounts,
  onConnectMeta, onDisconnectMeta, onLoadMetaAccounts,
  onSelectAdAccount, onSelectPage,
}) {
  const navigate = useNavigate();
  const distributable = ads.filter(
    (a) => (a.status === "approved" || a.status === "published") && a.output_files?.length > 0
  );

  return (
    <div className="space-y-4">
      {/* Compact connection status banner — full config lives in Settings tab */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "12px 16px", borderRadius: 10,
        border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)",
      }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minWidth: 200 }}>
          {metaConnection ? (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.75rem", fontWeight: 700, color: "#16a34a", backgroundColor: "rgba(34,197,94,0.1)", padding: "2px 10px", borderRadius: 999 }}>
                <Link2 size={10} /> Meta Connected
              </span>
              {metaConnection.ad_account_name && (
                <span style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
                  {metaConnection.ad_account_name} · {metaConnection.page_name || "no page selected"}
                </span>
              )}
              {(!metaConnection.ad_account_id || !metaConnection.page_id) && (
                <span style={{ fontSize: "0.73rem", color: "#ca8a04", fontWeight: 600 }}>
                  — select an ad account &amp; page in Settings
                </span>
              )}
            </>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.75rem", fontWeight: 700, color: "var(--color-muted)", backgroundColor: "var(--color-page-bg)", padding: "2px 10px", borderRadius: 999 }}>
              <Link2Off size={10} /> Meta not connected
            </span>
          )}
        </div>
        <button
          onClick={() => navigate("/publisher/settings")}
          className="btn--inline-action--ghost"
          style={{ fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <SlidersHorizontal size={11} /> Platform Settings
        </button>
      </div>

      {distributable.length === 0 ? (
        <SectionCard title="Upload Ad Creatives" subtitle="No ad campaigns ready to upload yet">
          <div className="flex flex-col items-center py-12 gap-3">
            <Share2 size={36} style={{ color: "var(--color-sidebar-text)", opacity: 0.4 }} />
            <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
              Generate ad creatives for an approved campaign to upload them here
            </p>
          </div>
        </SectionCard>
      ) : (
        distributable.map((ad) => {
          const campaignPlatforms = (ad.platforms || []).filter((p) => SOCIAL_PLATFORMS[p]);
          return (
            <SectionCard
              key={ad.id}
              title={ad.title}
              subtitle={`${ad.output_files.length} creative${ad.output_files.length !== 1 ? "s" : ""} ready · ${ad.platforms?.join(", ") || "no platforms configured"}`}
            >
              {/* Creative strip */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)", flex: 1 }}>
                  Ad Creatives
                </p>
                <button className="btn--inline-action--ghost" onClick={() => onPreviewAd(ad)}>
                  <Eye size={11} /> Preview All
                </button>
              </div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "20px", overflowX: "auto", paddingBottom: "4px" }}>
                {ad.output_files.slice(0, 6).map((c, i) => (
                  <div key={i} style={{ width: "80px", height: "60px", borderRadius: "6px", flexShrink: 0, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)", overflow: "hidden" }}>
                    {c.image_url
                      ? <img src={c.image_url} alt={c.headline} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Image size={18} style={{ color: "var(--color-sidebar-text)", opacity: 0.35 }} /></div>
                    }
                  </div>
                ))}
                {ad.output_files.length > 6 && (
                  <div style={{ width: "80px", height: "60px", borderRadius: "6px", flexShrink: 0, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)" }}>+{ad.output_files.length - 6}</span>
                  </div>
                )}
              </div>

              {/* Platform tiles */}
              <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)", marginBottom: "10px" }}>
                Upload to
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "8px", marginBottom: "16px" }}>
                {Object.entries(SOCIAL_PLATFORMS).map(([name, cfg]) => {
                  const isSelected = distExpanded?.adId === ad.id && distExpanded?.platformId === cfg.id;
                  const isCampaignPlatform = campaignPlatforms.includes(name);
                  return (
                    <DistributePlatformTile
                      key={name}
                      platformName={name}
                      selected={isSelected}
                      status={distStatus[`${ad.id}_${cfg.id}`]}
                      dim={!isCampaignPlatform && cfg.active}
                      active={cfg.active}
                      onClick={() => onSelectPlatform(ad.id, cfg.id)}
                    />
                  );
                })}
              </div>

              {/* Inline form */}
              {distExpanded?.adId === ad.id && (() => {
                const entry = Object.entries(SOCIAL_PLATFORMS).find(([, cfg]) => cfg.id === distExpanded.platformId);
                if (!entry) return null;
                const [platformName, platformConfig] = entry;
                const fk = `${ad.id}_${platformConfig.id}`;
                return (
                  <DistributeForm
                    platformName={platformName}
                    platformConfig={platformConfig}
                    formData={distForms[fk] || {}}
                    status={distStatus[fk]}
                    creatives={ad.output_files}
                    metaConnection={metaConnection}
                    onChange={(key, val) => onUpdateForm(ad.id, platformConfig.id, key, val)}
                    onPost={() => onDistribute(ad.id, platformConfig)}
                  />
                );
              })()}
            </SectionCard>
          );
        })
      )}
    </div>
  );
}

// ─── Distribute Platform Tile ─────────────────────────────────────────────────
export function DistributePlatformTile({ platformName, selected, status, dim, onClick, active = true }) {
  const isPosted = status?.status === "posted";
  return (
    <button
      onClick={active ? onClick : undefined}
      title={active ? undefined : "Coming soon"}
      style={{
        display: "flex", flexDirection: "column", gap: "3px",
        padding: "10px 12px", borderRadius: "10px", textAlign: "left",
        border: `2px solid ${selected ? "var(--color-accent)" : isPosted ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.4)" : "var(--color-card-border)"}`,
        backgroundColor: selected
          ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)"
          : isPosted ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.05)" : "var(--color-card-bg)",
        cursor: active ? "pointer" : "not-allowed",
        opacity: !active ? 0.35 : dim && !selected ? 0.55 : 1,
        transition: "border-color 0.15s, background-color 0.15s",
        position: "relative",
      }}
    >
      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)" }}>
        {platformName}{isPosted && " ✓"}
      </span>
      {isPosted && <span style={{ fontSize: "0.68rem", color: "var(--color-accent)" }}>Posted</span>}
      {!active && (
        <span style={{ fontSize: "0.62rem", color: "var(--color-muted)", fontStyle: "italic" }}>
          Coming soon
        </span>
      )}
    </button>
  );
}

// ─── Country Picker ───────────────────────────────────────────────────────────
export function CountryPicker({ value, onChange }) {
  // value: comma-separated ISO codes string e.g. "US,GB,CA"
  const [query, setQuery] = useState("");
  const [open,  setOpen]  = useState(false);
  const ref = useRef(null);

  const selected = value
    ? value.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
    : [];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (code) => {
    const next = selected.includes(code)
      ? selected.filter((c) => c !== code)
      : [...selected, code];
    onChange(next.join(","));
    setQuery("");
  };

  const filtered = COUNTRY_LIST.filter(
    (c) =>
      !selected.includes(c.code) &&
      (c.name.toLowerCase().includes(query.toLowerCase()) || c.code.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Selected chips */}
      <div
        onClick={() => setOpen(true)}
        style={{
          minHeight: "38px", padding: "4px 8px", borderRadius: "8px", cursor: "text",
          border: `1px solid ${open ? "var(--color-accent)" : "var(--color-card-border)"}`,
          backgroundColor: "var(--color-input-bg)",
          display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center",
        }}
      >
        {selected.map((code) => {
          const country = COUNTRY_LIST.find((c) => c.code === code);
          return (
            <span key={code} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px 2px 10px",
              borderRadius: 999, backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
              border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)",
              color: "var(--color-accent)",
            }}>
              {code} {country ? `· ${country.name}` : ""}
              <button
                onClick={(e) => { e.stopPropagation(); toggle(code); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "var(--color-accent)", fontSize: "0.8rem", marginLeft: 2 }}
              >×</button>
            </span>
          );
        })}
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? "Search countries…" : "Add country…"}
          style={{
            border: "none", outline: "none", background: "transparent",
            fontSize: "0.8rem", color: "var(--color-input-text)", minWidth: 120, flex: 1,
            fontFamily: "inherit",
          }}
        />
        {selected.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", padding: "0 2px", fontSize: "0.72rem" }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
          maxHeight: 220, overflowY: "auto", borderRadius: 10,
          border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        }}>
          {filtered.slice(0, 20).map((c) => (
            <button
              key={c.code}
              onMouseDown={(e) => { e.preventDefault(); toggle(c.code); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 14px", border: "none", background: "none", cursor: "pointer",
                fontSize: "0.8rem", color: "var(--color-input-text)", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-page-bg)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <strong style={{ marginRight: 6 }}>{c.code}</strong>{c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Distribute Form ──────────────────────────────────────────────────────────
export function DistributeForm({ platformName, platformConfig, formData, status, creatives, metaConnection, onChange, onPost }) {
  const isPosting = status?.status === "posting";
  const isPosted  = status?.status === "posted";
  const isError   = status?.status === "error";

  const inputStyle = {
    width: "100%", padding: "8px 12px", borderRadius: "8px", fontSize: "0.83rem",
    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", outline: "none", fontFamily: "inherit",
  };
  const labelStyle = {
    fontSize: "0.72rem", fontWeight: 600, color: "var(--color-sidebar-text)",
    display: "block", marginBottom: "5px",
  };
  const requiredPill = (
    <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "1px 6px", borderRadius: 999, backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444", marginLeft: 5, verticalAlign: "middle" }}>
      required
    </span>
  );

  // For OAuth platforms, check if connection is ready
  const isMetaReady = !platformConfig.usesOAuth || (metaConnection?.ad_account_id && metaConnection?.page_id);
  const metaNotConnected = platformConfig.usesOAuth && !metaConnection;
  const metaMissingSelection = platformConfig.usesOAuth && metaConnection && (!metaConnection.ad_account_id || !metaConnection.page_id);

  return (
    <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
      <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-input-text)", marginBottom: "4px" }}>
        Publish to {platformName} via Marketing API
      </p>
      <p style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginBottom: "16px" }}>
        All settings below are sent directly to Meta's Marketing API — no manual setup in Ads Manager needed. Ads go <strong>ACTIVE</strong> immediately and can be paused from the Manage Ads tab.
      </p>

      {/* Connection status banner for OAuth platforms */}
      {platformConfig.usesOAuth && metaConnection && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: "8px", backgroundColor: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.25)", marginBottom: "16px" }}>
          <CheckCircle2 size={13} style={{ color: "#22c55e", flexShrink: 0 }} />
          <p style={{ fontSize: "0.78rem", color: "#16a34a" }}>
            Publishing as <strong>{metaConnection.page_name || metaConnection.page_id}</strong> · Ad Account: <strong>{metaConnection.ad_account_name || metaConnection.ad_account_id}</strong>
          </p>
        </div>
      )}

      {/* Warn if not connected or incomplete */}
      {metaNotConnected && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.22)", marginBottom: "16px" }}>
          <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: "0.78rem", color: "#ef4444" }}>Connect your Meta account in Platform Settings above before publishing.</p>
        </div>
      )}
      {metaMissingSelection && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)", marginBottom: "16px" }}>
          <AlertCircle size={14} style={{ color: "#ca8a04", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: "0.78rem", color: "#92400e" }}>Select an Ad Account and Facebook Page in Platform Settings above.</p>
        </div>
      )}

      {/* Per-campaign fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>

        {/* Destination URL (generic field loop — only destination_url remains) */}
        {platformConfig.fields.map((field) => (
          <div key={field.key}>
            <label style={labelStyle}>{field.label}{field.required && requiredPill}</label>
            <input
              type={field.type}
              style={inputStyle}
              placeholder={field.placeholder || ""}
              value={formData[field.key] || ""}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          </div>
        ))}

        {/* Daily Budget — custom row with currency + per-creative split */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Daily Budget{requiredPill}</label>
            {formData._budget_ai_suggested && (
              <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "1px 6px", borderRadius: 999, backgroundColor: "rgba(99,102,241,0.1)", color: "rgba(99,102,241,0.9)", border: "1px solid rgba(99,102,241,0.2)" }}>
                AI suggested
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            {/* Amount input */}
            <div style={{ position: "relative", flex: 1 }}>
              <input
                type="number"
                min="1"
                step="0.01"
                style={{ ...inputStyle, paddingRight: 8 }}
                placeholder="10.00"
                value={formData.daily_budget || ""}
                onChange={(e) => onChange("daily_budget", e.target.value)}
                onFocus={() => onChange("_budget_ai_suggested", false)}
              />
            </div>
            {/* Currency selector */}
            <select
              value={formData.currency || "USD"}
              onChange={(e) => onChange("currency", e.target.value)}
              style={{
                padding: "8px 10px", borderRadius: "8px", fontSize: "0.8rem",
                border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
                color: "var(--color-input-text)", cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </div>
          {/* Per-creative split */}
          {(() => {
            const budget = parseFloat(formData.daily_budget);
            const numSelected = formData.selected_creatives?.length || 0;
            const numCreatives = numSelected > 0 ? numSelected : Math.min(1, creatives.length);
            const currency = formData.currency || "USD";
            if (!isNaN(budget) && budget > 0 && numCreatives > 0) {
              const perCreative = (budget / numCreatives).toFixed(2);
              return (
                <p style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)", marginTop: 5 }}>
                  {currency} {budget.toFixed(2)} shared across {numCreatives} ad{numCreatives !== 1 ? "s" : ""} ≈ <strong>{currency} {perCreative}/day per ad</strong>
                  {" "}<span style={{ color: "var(--color-muted)" }}>(Meta distributes from the ad set budget)</span>
                </p>
              );
            }
            return null;
          })()}
        </div>

        {/* Target Countries — chip picker */}
        <div>
          <label style={labelStyle}>Target Countries</label>
          <CountryPicker
            value={formData.targeting_countries || ""}
            onChange={(val) => onChange("targeting_countries", val)}
          />
        </div>

        {/* Browser Add-on — dropdown, AI-seeded from campaign data */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Browser Add-on</label>
            {formData._addon_ai_suggested && formData.addon_type && (
              <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "1px 6px", borderRadius: 999, backgroundColor: "rgba(99,102,241,0.1)", color: "rgba(99,102,241,0.9)", border: "1px solid rgba(99,102,241,0.2)" }}>
                AI suggested
              </span>
            )}
          </div>
          <select
            value={formData.addon_type || ""}
            onChange={(e) => { onChange("addon_type", e.target.value); onChange("_addon_ai_suggested", false); }}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="">None — standard CTA button</option>
            <option value="whatsapp">WhatsApp — open chat when clicked</option>
            <option value="phone">Phone call — routes to voicebot</option>
          </select>
          {formData.addon_type === "whatsapp" && (
            <div style={{ marginTop: 8 }}>
              <label style={labelStyle}>WhatsApp Number{requiredPill}</label>
              <input
                type="tel"
                style={inputStyle}
                placeholder="+61 400 000 000"
                value={formData.addon_phone || ""}
                onChange={(e) => onChange("addon_phone", e.target.value)}
              />
            </div>
          )}
        </div>

      </div>

      {/* Creative selector */}
      <div style={{ marginBottom: "16px" }}>
        <label style={labelStyle}>Select Creatives to Publish</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {creatives.map((c, i) => {
            const sel = (formData.selected_creatives || []).includes(i);
            return (
              <button
                key={i}
                onClick={() => {
                  const cur = formData.selected_creatives || [];
                  onChange("selected_creatives", sel ? cur.filter((x) => x !== i) : [...cur, i]);
                }}
                title={c.headline || `Creative ${i + 1}`}
                style={{ width: "60px", height: "45px", borderRadius: "6px", flexShrink: 0, border: `2px solid ${sel ? "var(--color-accent)" : "var(--color-card-border)"}`, backgroundColor: "var(--color-card-bg)", overflow: "hidden", padding: 0, cursor: "pointer" }}
              >
                {c.image_url
                  ? <img src={c.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Image size={14} style={{ color: "var(--color-sidebar-text)", opacity: 0.4 }} /></div>
                }
              </button>
            );
          })}
        </div>
        {creatives.length > 0 && !formData.selected_creatives?.length && (
          <p style={{ fontSize: "0.68rem", color: "var(--color-muted)", marginTop: 4 }}>No creatives selected — first creative will be used.</p>
        )}
      </div>

      {isError && (
        <div style={{ display: "flex", gap: "8px", padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "12px" }}>
          <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "1px" }} />
          <p style={{ fontSize: "0.8rem", color: "#ef4444" }}>{status.error}</p>
        </div>
      )}

      {isPosted && status?.result && (
        <div style={{ padding: "12px 14px", borderRadius: "10px", backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)", border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <CheckCircle2 size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
            <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-accent)" }}>
              Campaign created on Meta — ads are ACTIVE and serving
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.75rem", color: "var(--color-muted)", marginBottom: 10 }}>
            <span>Campaign ID: <code style={{ fontFamily: "monospace" }}>{status.result.campaign_id}</code></span>
            <span>Ad Set ID: <code style={{ fontFamily: "monospace" }}>{status.result.adset_id}</code></span>
            <span>Ads created: {status.result.ad_ids?.length ?? 0}</span>
          </div>
          <a href={status.result.ads_manager_url} target="_blank" rel="noreferrer" className="btn--inline-action--success" style={{ fontSize: "0.8rem" }}>
            <ExternalLink size={11} /> Open in Meta Ads Manager
          </a>
        </div>
      )}

      <button
        onClick={onPost}
        disabled={isPosting || !isMetaReady}
        className="btn--accent"
        style={{ display: "inline-flex", alignItems: "center", gap: "8px", opacity: (isPosting || !isMetaReady) ? 0.5 : 1 }}
      >
        {isPosting ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Share2 size={14} />}
        {isPosting ? "Publishing to Meta…" : isPosted ? "Republish" : `Publish to ${platformName}`}
      </button>
    </div>
  );
}
