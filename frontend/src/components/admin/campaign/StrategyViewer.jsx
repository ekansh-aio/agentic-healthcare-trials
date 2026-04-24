import React, { useState } from "react";
import { Globe, Image, Bot, MessageSquare, BarChart2, DollarSign, Users, Sparkles, MessageCircle, ChevronDown, ChevronUp, Send, AlertCircle, Eye, CheckCircle2, Megaphone } from "lucide-react";

// ─── Status lifecycle ─────────────────────────────────────────────────────────
export const STATUS_STEPS = [
  { key: "draft",            label: "Draft" },
  { key: "strategy_created", label: "Strategy Ready" },
  { key: "under_review",     label: "Under Review" },
  { key: "ethics_review",    label: "Ethics Review" },
  { key: "approved",         label: "Approved" },
  { key: "published",        label: "Published" },
];

export function statusIndex(status) {
  // "generating" sits between draft and strategy_created in the timeline
  if (status === "generating") return 0;
  const idx = STATUS_STEPS.findIndex((s) => s.key === status);
  return idx === -1 ? 0 : idx;
}

export function StatusTimeline({ status }) {
  const current = statusIndex(status);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", paddingBottom: "4px" }}>
      {STATUS_STEPS.map((step, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <React.Fragment key={step.key}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: done ? "var(--color-accent)" : active ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.15)" : "var(--color-card-bg)",
                border: `2px solid ${done || active ? "var(--color-accent)" : "var(--color-card-border)"}`,
                transition: "all 0.2s",
              }}>
                {done
                  ? <CheckCircle2 size={13} style={{ color: "#fff" }} />
                  : <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: active ? "var(--color-accent)" : "var(--color-card-border)" }} />
                }
              </div>
              <p style={{
                fontSize: "0.65rem", fontWeight: active ? 600 : 400, whiteSpace: "nowrap",
                color: done || active ? "var(--color-input-text)" : "var(--color-sidebar-text)",
              }}>
                {step.label}
              </p>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div style={{
                flex: 1, height: "2px", minWidth: "20px",
                backgroundColor: i < current ? "var(--color-accent)" : "var(--color-card-border)",
                marginBottom: "20px", transition: "background-color 0.2s",
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Ad type chips ────────────────────────────────────────────────────────────
export const TYPE_ICON = { website: Globe, ads: Image, voicebot: Bot, chatbot: MessageSquare };

export function AdTypeChip({ type }) {
  const Icon = TYPE_ICON[type] ?? Megaphone;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "4px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 500,
      border: "1px solid var(--color-card-border)",
      backgroundColor: "var(--color-card-bg)",
      color: "var(--color-input-text)",
    }}>
      <Icon size={12} style={{ color: "var(--color-accent)" }} />
      {type}
    </span>
  );
}

// ─── Strategy viewer ──────────────────────────────────────────────────────────

/** Render any unknown value (string, array, object) as readable UI */
export function GenericValue({ value }) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return (
      <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)", lineHeight: 1.6 }}>
        {String(value)}
      </p>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    // Array of primitives → pill tags
    if (typeof value[0] !== "object") {
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
          {value.map((item, i) => (
            <span key={i} style={{
              fontSize: "0.72rem", padding: "2px 8px", borderRadius: "999px",
              backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.08)",
              color: "var(--color-accent)",
              border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.2)",
            }}>
              {String(item)}
            </span>
          ))}
        </div>
      );
    }
    // Array of objects → sub-cards
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
        {value.map((item, i) => (
          <div key={i} style={{
            padding: "8px 10px", borderRadius: "8px",
            border: "1px solid var(--color-card-border)",
            backgroundColor: "var(--color-page-bg)",
          }}>
            {Object.entries(item).map(([k, v]) => (
              <InfoRow key={k} label={k} value={
                typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
              } />
            ))}
          </div>
        ))}
      </div>
    );
  }
  // Plain object → InfoRows
  return (
    <div>
      {Object.entries(value).map(([k, v]) => (
        <InfoRow key={k} label={k} value={
          typeof v === "object" ? JSON.stringify(v) : String(v ?? "")
        } />
      ))}
    </div>
  );
}

// Keys handled by dedicated UI — excluded from the catch-all block
export const KNOWN_STRATEGY_KEYS = new Set([
  "executive_summary", "target_audience", "messaging", "channels",
  "content_plan", "kpis", "budget_breakdown", "budget_allocation",
  "funnel_stages", "ad_upload_specs", "social_content",
]);

// ─── Strategy Viewer — PDF-inspired design system ────────────────────────────
// Dark hero · teal accents · section bars · animated charts

/** "—— LABEL" section divider matching the REIMAGINE 4 PDF style */
export function SBar({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 16px" }}>
      <div style={{ width: 28, height: 2, borderRadius: 2, backgroundColor: "var(--color-accent)", flexShrink: 0 }} />
      <span style={{
        fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase",
        letterSpacing: "0.18em", color: "var(--color-sidebar-text)",
      }}>{label}</span>
    </div>
  );
}

/** Rounded card wrapper */
export function SCard({ children, style = {} }) {
  return (
    <div style={{
      borderRadius: 14, border: "1px solid var(--color-card-border)",
      backgroundColor: "var(--color-card-bg)", overflow: "hidden", ...style,
    }}>
      {children}
    </div>
  );
}

/** Card header row */
export function SCardHead({ icon, label }) {
  return (
    <div style={{
      padding: "10px 16px", borderBottom: "1px solid var(--color-card-border)",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ color: "var(--color-accent)", display: "flex", flexShrink: 0 }}>{icon}</span>
      <p style={{
        margin: 0, fontSize: "0.62rem", fontWeight: 900, textTransform: "uppercase",
        letterSpacing: "0.14em", color: "var(--color-sidebar-text)",
      }}>{label}</p>
    </div>
  );
}

export function ChannelRow({ ch, index }) {
  const isString = typeof ch === "string";
  const [platform, detail] = isString
    ? (() => {
        const dashIdx = ch.indexOf(" — ");
        return dashIdx !== -1
          ? [ch.slice(0, dashIdx).trim(), ch.slice(dashIdx + 3).trim()]
          : [ch, ""];
      })()
    : [ch.platform ?? ch.name ?? `Channel ${index + 1}`, ch.strategy ?? ""];

  const extraEntries = isString
    ? []
    : Object.entries(ch).filter(([k]) => !["platform", "name", "strategy", "budget_allocation"].includes(k));

  const num = index + 1;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 14,
      padding: "14px 16px",
      borderBottom: "1px solid var(--color-card-border)",
      transition: "background 0.15s",
    }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.03)"}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
    >
      {/* Number badge */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.7rem", fontWeight: 800, color: "var(--color-accent)",
      }}>{num}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--color-input-text)", margin: "0 0 3px" }}>
          {platform}
        </p>
        {detail && (
          <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", lineHeight: 1.55, margin: 0 }}>
            {detail}
          </p>
        )}
        {extraEntries.map(([k, v]) => (
          <InfoRow key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v)} />
        ))}
      </div>

      {!isString && ch.budget_allocation != null && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--color-accent)", lineHeight: 1 }}>
            {Math.round(ch.budget_allocation <= 1 ? ch.budget_allocation * 100 : ch.budget_allocation)}%
          </p>
          <p style={{ fontSize: "0.58rem", color: "var(--color-sidebar-text)", letterSpacing: "0.06em", textTransform: "uppercase" }}>budget</p>
        </div>
      )}
    </div>
  );
}

export function ContentPlanTable({ items }) {
  const rows = Array.isArray(items) ? items : Object.values(items);
  const [expandedRow, setExpandedRow] = useState(null);
  if (!rows.length) return null;

  const PREFERRED_ORDER = ["channel", "format", "frequency", "example"];
  const allKeys = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const cols = [
    ...PREFERRED_ORDER.filter(k => allKeys.includes(k)),
    ...allKeys.filter(k => !PREFERRED_ORDER.includes(k)),
  ];
  const mainCols = cols.filter(k => k !== "example");

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
        <thead>
          <tr style={{ backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.04)" }}>
            {mainCols.map(col => (
              <th key={col} style={{
                padding: "9px 16px", textAlign: "left",
                fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase",
                letterSpacing: "0.12em", color: "var(--color-sidebar-text)",
                borderBottom: "2px solid var(--color-card-border)",
                whiteSpace: "nowrap",
              }}>
                {col.replace(/_/g, " ")}
              </th>
            ))}
            {cols.includes("example") && (
              <th style={{
                padding: "9px 16px", textAlign: "left", width: 90,
                fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase",
                letterSpacing: "0.12em", color: "var(--color-sidebar-text)",
                borderBottom: "2px solid var(--color-card-border)",
              }}>Example</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <React.Fragment key={i}>
              <tr
                style={{ cursor: row.example ? "pointer" : "default", transition: "background 0.12s" }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.04)"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
              >
                {mainCols.map((col, ci) => (
                  <td key={col} style={{
                    padding: "11px 16px",
                    color: ci === 0 ? "var(--color-input-text)" : "var(--color-sidebar-text)",
                    fontWeight: ci === 0 ? 600 : 400,
                    borderBottom: expandedRow === i ? "none" : "1px solid var(--color-card-border)",
                    verticalAlign: "top", lineHeight: 1.55,
                  }}>
                    {String(row[col] ?? "")}
                  </td>
                ))}
                {cols.includes("example") && (
                  <td style={{
                    padding: "11px 16px",
                    borderBottom: expandedRow === i ? "none" : "1px solid var(--color-card-border)",
                    verticalAlign: "top",
                  }}>
                    {row.example && (
                      <button
                        onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                        style={{
                          background: "none", border: "none", cursor: "pointer", padding: "3px 8px",
                          display: "inline-flex", alignItems: "center", gap: 4,
                          color: "var(--color-accent)", fontSize: "0.7rem", fontWeight: 700,
                          borderRadius: 6,
                          backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.08)",
                        }}
                      >
                        <Eye size={10} />
                        {expandedRow === i ? "Hide" : "View"}
                      </button>
                    )}
                  </td>
                )}
              </tr>
              {expandedRow === i && row.example && (
                <tr>
                  <td colSpan={mainCols.length + 1} style={{
                    padding: "12px 16px 14px",
                    borderBottom: "1px solid var(--color-card-border)",
                    backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.03)",
                    borderLeft: "3px solid var(--color-accent)",
                  }}>
                    <p style={{ fontSize: "0.78rem", color: "var(--color-input-text)", lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>
                      {row.example}
                    </p>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Shared palette ───────────────────────────────────────────────────────────
export const DONUT_PALETTE = [
  "var(--color-accent)", "#6366f1", "#f59e0b", "#ec4899",
  "#14b8a6", "#8b5cf6", "#f97316", "#0ea5e9",
];

export function detectKpiCategory(text) {
  const t = (text ?? "").toLowerCase();
  if (/ctr|click.through|click.rate/.test(t))  return "#6366f1";
  if (/cpa|cost.per.acq|cost per acq/.test(t)) return "#f59e0b";
  if (/roas|return.on.ad/.test(t))             return "#14b8a6";
  if (/impression|reach|awareness/.test(t))    return "#8b5cf6";
  if (/conversion|convert/.test(t))            return "#ec4899";
  if (/engag/.test(t))                         return "#f97316";
  if (/revenue|roi|return on invest/.test(t))  return "#0ea5e9";
  if (/lead/.test(t))                          return "#a78bfa";
  if (/view|video|watch/.test(t))              return "#fb923c";
  return null;
}

export function extractNumber(str) {
  if (!str) return null;
  const s = str.replace(/,/g, "");
  const m = s.match(/(\d+(?:\.\d+)?)\s*([km×x]?)/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const suf = m[2].toLowerCase();
  if (suf === "k") n *= 1000;
  else if (suf === "m") n *= 1_000_000;
  return n;
}

// ─── KPI chart (horizontal bars — PDF-style) ─────────────────────────────────
export function QuantKpiChart({ kpis }) {
  const [mounted, setMounted] = useState(false);
  React.useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  const normalized = kpis.map(k =>
    typeof k === "string" ? { metric: k, target: null, context: null } : k
  );
  const nums   = normalized.map(k => extractNumber(k.target) ?? 0);
  const maxVal = Math.max(...nums, 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {normalized.map((k, i) => {
        const color  = detectKpiCategory(k.metric) ?? DONUT_PALETTE[i % DONUT_PALETTE.length];
        const pct    = nums[i] === 0 ? 12 : Math.max(12, (nums[i] / maxVal) * 100);
        return (
          <div key={i}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
              <div>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-input-text)" }}>{k.metric}</span>
                {k.context && <span style={{ fontSize: "0.68rem", color: "var(--color-sidebar-text)", marginLeft: 6 }}>{k.context}</span>}
              </div>
              <span style={{ fontSize: "0.95rem", fontWeight: 800, color, letterSpacing: "-0.01em" }}>{k.target}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, backgroundColor: "var(--color-card-border)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 999,
                background: `linear-gradient(90deg, ${color} 0%, ${color}99 100%)`,
                width: mounted ? `${pct}%` : "0%",
                transition: "width 0.7s cubic-bezier(0.16,1,0.3,1)",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Budget donut (used inside StrategyViewer AND in the campaign header) ─────
export function DonutChart({ slices, size = 130, thickness = 22 }) {
  const r    = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const cx   = size / 2, cy = size / 2;
  let acc = 0;
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-card-border)" strokeWidth={thickness} />
      {slices.map((slice, i) => {
        const arc    = (slice.pct / 100) * circ;
        const offset = -(acc / 100) * circ;
        acc += slice.pct;
        return (
          <circle
            key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={slice.color} strokeWidth={thickness}
            strokeDasharray={`${arc} ${circ}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray 0.5s ease" }}
          />
        );
      })}
    </svg>
  );
}

export function BudgetDonut({ strategy }) {
  if (!strategy?.budget_allocation) return null;
  const entries = Object.entries(strategy.budget_allocation);
  if (!entries.length) return null;
  const slices = entries.map(([label, val], i) => ({
    label,
    pct: parseFloat(String(val)) || 0,
    color: DONUT_PALETTE[i % DONUT_PALETTE.length],
  }));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div style={{ position: "relative" }}>
        <DonutChart slices={slices} size={150} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <DollarSign size={15} style={{ color: "var(--color-accent)" }} />
        </div>
      </div>
      <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color, flexShrink: 0, marginTop: 3 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "0.74rem", color: "var(--color-input-text)", fontWeight: 500, margin: 0, lineHeight: 1.4 }}>
                {s.label.replace(/_/g, " ")}
              </p>
              <p style={{ fontSize: "0.78rem", fontWeight: 800, color: s.color, margin: 0 }}>{s.pct}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Funnel stages — PDF-style 3-column cards ────────────────────────────────
export const FUNNEL_META = [
  { accent: "var(--color-accent)", bg: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)", border: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)", badge: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12)" },
  { accent: "#6366f1", bg: "rgba(99,102,241,0.05)", border: "rgba(99,102,241,0.22)", badge: "rgba(99,102,241,0.1)" },
  { accent: "#0d1b2e", bg: "rgba(13,27,46,0.04)",   border: "rgba(13,27,46,0.14)",   badge: "rgba(13,27,46,0.07)" },
];

export function FunnelStages({ stages }) {
  if (!stages?.length) return null;
  return (
    <div>
      <SBar label="Funnel Architecture · Patient Journey" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {stages.map((s, i) => {
          const c = FUNNEL_META[i % FUNNEL_META.length];
          return (
            <div key={i} style={{
              borderRadius: 14, border: `1px solid ${c.border}`,
              backgroundColor: c.bg, padding: "18px 18px 14px",
              display: "flex", flexDirection: "column", gap: 10,
              position: "relative", overflow: "hidden",
            }}>
              {/* Top: stage badge + large pct */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <span style={{
                  fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em",
                  padding: "3px 10px", borderRadius: 999,
                  backgroundColor: c.badge, color: c.accent,
                }}>
                  {s.stage}
                </span>
                {s.budget_pct && (
                  <span style={{ fontSize: "1.6rem", fontWeight: 900, color: c.accent, lineHeight: 1, letterSpacing: "-0.02em" }}>
                    {s.budget_pct}
                  </span>
                )}
              </div>

              {/* Stage name */}
              <p style={{ fontSize: "1rem", fontWeight: 800, color: "var(--color-input-text)", margin: 0, lineHeight: 1.2 }}>
                {s.name}
              </p>

              <div style={{ width: 32, height: 2, borderRadius: 2, backgroundColor: c.accent, opacity: 0.5 }} />

              {/* Audience */}
              {s.audience && (
                <div>
                  <p style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-sidebar-text)", marginBottom: 3 }}>Audience</p>
                  <p style={{ fontSize: "0.76rem", color: "var(--color-input-text)", lineHeight: 1.5, margin: 0 }}>{s.audience}</p>
                </div>
              )}

              {/* Goal */}
              {s.goal && (
                <div>
                  <p style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-sidebar-text)", marginBottom: 3 }}>Goal</p>
                  <p style={{ fontSize: "0.76rem", color: "var(--color-input-text)", lineHeight: 1.5, margin: 0 }}>{s.goal}</p>
                </div>
              )}

              {/* Format chips */}
              {s.formats?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                  {s.formats.map((f, fi) => (
                    <span key={fi} style={{
                      fontSize: "0.64rem", fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                      border: `1px solid ${c.border}`, color: c.accent, backgroundColor: c.badge,
                    }}>{f}</span>
                  ))}
                </div>
              )}

              {/* Footer budget note */}
              {s.budget_pct && (
                <p style={{ fontSize: "0.64rem", color: "var(--color-sidebar-text)", margin: 0, paddingTop: 8, borderTop: `1px solid ${c.border}` }}>
                  {s.budget_pct} of total budget
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Ad upload specs + optimal windows ───────────────────────────────────────
export function AdUploadSpecs({ specs }) {
  if (!specs) return null;
  const { formats = [], optimal_windows = [], demographic_notes } = specs;
  if (!formats.length && !optimal_windows.length && !demographic_notes) return null;

  return (
    <div>
      <SBar label="Ad Upload Specs · Optimal Windows" />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Demographic targeting note */}
        {demographic_notes && (
          <div style={{
            padding: "14px 18px", borderRadius: 12,
            backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)",
            border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.2)",
            borderLeft: "4px solid var(--color-accent)",
          }}>
            <p style={{ fontSize: "0.62rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--color-accent)", marginBottom: 5 }}>
              Demographic Targeting
            </p>
            <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)", lineHeight: 1.65, margin: 0 }}>{demographic_notes}</p>
          </div>
        )}

        {/* Format spec table */}
        {formats.length > 0 && (
          <SCard>
            <SCardHead icon={<Image size={13} />} label="Creative Format Specs" />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.04)" }}>
                    {["Format", "Ratio", "Dimensions", "Max Size", "Duration", "Placements"].map(col => (
                      <th key={col} style={{
                        padding: "9px 14px", textAlign: "left",
                        fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase",
                        letterSpacing: "0.12em", color: "var(--color-sidebar-text)",
                        borderBottom: "2px solid var(--color-card-border)", whiteSpace: "nowrap",
                      }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {formats.map((f, i) => (
                    <tr key={i}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.03)"}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                      style={{ transition: "background 0.12s" }}
                    >
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--color-input-text)", borderBottom: "1px solid var(--color-card-border)", whiteSpace: "nowrap" }}>{f.name}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: "var(--color-accent)", borderBottom: "1px solid var(--color-card-border)", whiteSpace: "nowrap" }}>{f.aspect_ratio}</td>
                      <td style={{ padding: "10px 14px", color: "var(--color-input-text)", borderBottom: "1px solid var(--color-card-border)", whiteSpace: "nowrap" }}>{f.dimensions}</td>
                      <td style={{ padding: "10px 14px", color: "var(--color-input-text)", borderBottom: "1px solid var(--color-card-border)", whiteSpace: "nowrap" }}>{f.max_file_size}</td>
                      <td style={{ padding: "10px 14px", color: f.video_duration ? "var(--color-input-text)" : "var(--color-sidebar-text)", borderBottom: "1px solid var(--color-card-border)", whiteSpace: "nowrap" }}>{f.video_duration ?? "—"}</td>
                      <td style={{ padding: "10px 14px", color: "var(--color-sidebar-text)", borderBottom: "1px solid var(--color-card-border)" }}>{f.placements}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SCard>
        )}

        {/* Optimal upload windows */}
        {optimal_windows.length > 0 && (
          <div>
            <p style={{ fontSize: "0.62rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--color-sidebar-text)", marginBottom: 10 }}>
              Optimal Upload Windows
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
              {optimal_windows.map((w, i) => (
                <div key={i} style={{
                  padding: "14px 16px", borderRadius: 12,
                  border: "1px solid var(--color-card-border)",
                  backgroundColor: "var(--color-card-bg)",
                  borderTop: "3px solid var(--color-accent)",
                }}>
                  <p style={{ fontSize: "1rem", fontWeight: 800, color: "var(--color-accent)", marginBottom: 2, lineHeight: 1.2 }}>{w.time}</p>
                  <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--color-input-text)", marginBottom: 5 }}>{w.days}</p>
                  <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", lineHeight: 1.45, margin: 0 }}>{w.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "3px 0", borderBottom: "1px solid var(--color-card-border)" }}>
      <span style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)", textTransform: "capitalize", flexShrink: 0 }}>
        {String(label).replace(/_/g, " ")}
      </span>
      <span style={{ fontSize: "0.75rem", color: "var(--color-input-text)", fontWeight: 500, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

export default function StrategyViewer({ strategy, ad, onRetry }) {
  const [showRaw, setShowRaw] = useState(false);
  if (!strategy) return null;

  if (strategy.parse_error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "32px 16px", textAlign: "center" }}>
        <AlertCircle size={32} style={{ color: "#ef4444", opacity: 0.7 }} />
        <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--color-text)" }}>AI generation failed</p>
        <p style={{ fontSize: "0.82rem", color: "var(--color-sidebar-text)", maxWidth: 400 }}>
          This may be a network issue or a temporary API problem. Your documents are intact — please retry.
        </p>
        {onRetry && (
          <button className="btn--inline-action--ghost" onClick={onRetry} style={{ marginTop: 4 }}>
            Retry Generation
          </button>
        )}
      </div>
    );
  }

  const {
    executive_summary, target_audience, messaging, channels,
    content_plan, kpis, budget_breakdown, budget_allocation,
    funnel_stages, ad_upload_specs, social_content,
  } = strategy;

  const budgetData  = budget_breakdown ?? budget_allocation ?? null;
  const extraEntries = Object.entries(strategy).filter(([k]) => !KNOWN_STRATEGY_KEYS.has(k));
  const adTypes     = ad?.ad_type ?? [];
  const platforms   = ad?.platforms ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, animation: "pageFadeIn 0.3s ease both" }}>

      {/* ── DARK HERO HEADER ── */}
      <div style={{
        borderRadius: 16, overflow: "hidden",
        background: "linear-gradient(135deg, #0d1b2e 0%, #0a2540 55%, rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.18) 100%)",
        padding: "28px 28px 24px",
        position: "relative",
      }}>
        {/* Subtle grid texture overlay */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 32px), repeating-linear-gradient(90deg, #fff 0, #fff 1px, transparent 1px, transparent 32px)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative" }}>
          {/* Section label */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 24, height: 2, borderRadius: 2, backgroundColor: "var(--color-accent)" }} />
            <span style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--color-accent)" }}>
              Marketing Strategy
            </span>
          </div>

          {/* Campaign title */}
          {ad?.title && (
            <h2 style={{ fontSize: "1.6rem", fontWeight: 900, color: "#ffffff", margin: "0 0 14px", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              {ad.title}
            </h2>
          )}

          {/* Ad type + platform chips */}
          {(adTypes.length > 0 || platforms.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
              {adTypes.map((t, i) => (
                <span key={i} style={{
                  fontSize: "0.66rem", fontWeight: 700, padding: "4px 12px", borderRadius: 999,
                  backgroundColor: "var(--color-accent)", color: "#fff",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                }}>{t}</span>
              ))}
              {platforms.map((p, i) => (
                <span key={i} style={{
                  fontSize: "0.66rem", fontWeight: 600, padding: "4px 12px", borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                }}>{p}</span>
              ))}
            </div>
          )}

          {/* Primary audience + budget stat row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            {target_audience?.primary && (
              <div>
                <p style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.45)", marginBottom: 3 }}>Primary Audience</p>
                <p style={{ fontSize: "0.84rem", color: "rgba(255,255,255,0.9)", fontWeight: 500, margin: 0, maxWidth: 400 }}>{target_audience.primary}</p>
              </div>
            )}
            {ad?.budget && (
              <div>
                <p style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.45)", marginBottom: 3 }}>Budget</p>
                <p style={{ fontSize: "0.84rem", color: "var(--color-accent)", fontWeight: 800, margin: 0 }}>{ad.budget}</p>
              </div>
            )}
            {channels?.length > 0 && (
              <div>
                <p style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.45)", marginBottom: 3 }}>Channels</p>
                <p style={{ fontSize: "0.84rem", color: "rgba(255,255,255,0.9)", fontWeight: 700, margin: 0 }}>{channels.length} Active</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── OVERVIEW ── */}
      {(executive_summary || target_audience || messaging) && (
        <div>
          <SBar label="Overview" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14, alignItems: "start" }}>

            {/* Left: Executive Summary + Messaging stacked */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {executive_summary && (
              <SCard>
                <SCardHead icon={<Sparkles size={13} />} label="Executive Summary" />
                <div style={{ padding: "18px 20px" }}>
                  <p style={{ fontSize: "0.92rem", lineHeight: 1.75, color: "var(--color-input-text)", margin: "0 0 16px", fontWeight: 400 }}>
                    {executive_summary}
                  </p>
                  {/* Key differentiators as a callout */}
                  {messaging?.key_differentiators?.length > 0 && (
                    <div style={{
                      padding: "14px 16px", borderRadius: 10,
                      backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)",
                      borderLeft: "4px solid var(--color-accent)",
                    }}>
                      <p style={{ fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--color-accent)", marginBottom: 8 }}>
                        Key Differentiators
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {messaging.key_differentiators.map((d, i) => (
                          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <span style={{
                              fontSize: "0.62rem", fontWeight: 900, color: "var(--color-accent)",
                              minWidth: 18, backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12)",
                              borderRadius: 4, padding: "1px 5px", textAlign: "center", flexShrink: 0, marginTop: 1,
                            }}>{i + 1}</span>
                            <p style={{ fontSize: "0.8rem", color: "var(--color-input-text)", lineHeight: 1.5, margin: 0 }}>{d}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </SCard>
            )}

              {messaging && (
                <SCard>
                  <SCardHead icon={<MessageCircle size={13} />} label="Messaging" />
                  <div style={{ display: "flex", flexDirection: "column" }}>

                    {/* Core message — prominent quote block */}
                    {messaging.core_message && (
                      <div style={{ padding: "16px 18px" }}>
                        <p style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-accent)", marginBottom: 8 }}>Core Message</p>
                        <div style={{
                          padding: "12px 14px", borderRadius: 8,
                          backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.05)",
                          borderLeft: "3px solid var(--color-accent)",
                        }}>
                          <p style={{ fontSize: "0.84rem", color: "var(--color-input-text)", lineHeight: 1.65, margin: 0, fontWeight: 500 }}>
                            {messaging.core_message}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Tone */}
                    {messaging.tone && (
                      <div style={{ padding: "14px 18px", borderTop: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                        <p style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-sidebar-text)", marginBottom: 6 }}>Tone</p>
                        <p style={{ fontSize: "0.78rem", color: "var(--color-input-text)", lineHeight: 1.6, margin: 0 }}>{messaging.tone}</p>
                      </div>
                    )}

                    {/* Key phrases */}
                    {messaging.key_phrases?.length > 0 && (
                      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--color-card-border)" }}>
                        <p style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-sidebar-text)", marginBottom: 7 }}>Key Phrases</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {messaging.key_phrases.map((p, i) => (
                            <span key={i} style={{
                              fontSize: "0.72rem", padding: "4px 10px", borderRadius: 6, fontWeight: 500,
                              backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.07)",
                              color: "var(--color-input-text)", border: "1px solid var(--color-card-border)",
                            }}>{p}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* CTA */}
                    {messaging.cta && (
                      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--color-card-border)", display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-sidebar-text)", flexShrink: 0 }}>CTA</span>
                        <span style={{
                          fontSize: "0.78rem", fontWeight: 700, color: "var(--color-accent)",
                          padding: "4px 12px", borderRadius: 7,
                          backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
                          border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.2)",
                        }}>{messaging.cta}</span>
                      </div>
                    )}

                    {/* Extra messaging keys */}
                    {Object.entries(messaging)
                      .filter(([k]) => !["core_message", "tone", "cta", "key_phrases", "key_differentiators"].includes(k))
                      .map(([k, v]) => (
                        <div key={k} style={{ padding: "10px 16px", borderTop: "1px solid var(--color-card-border)" }}>
                          <p style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-sidebar-text)", marginBottom: 4 }}>
                            {k.replace(/_/g, " ")}
                          </p>
                          <GenericValue value={v} />
                        </div>
                      ))
                    }
                  </div>
                </SCard>
              )}
            </div>

            {/* Right: Audience only */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {target_audience && (
                <SCard>
                  <SCardHead icon={<Users size={13} />} label="Target Audience" />
                  <div style={{ display: "flex", flexDirection: "column" }}>

                    {/* Primary — teal left-border row */}
                    {target_audience.primary && (
                      <div style={{ padding: "14px 16px", borderLeft: "3px solid var(--color-accent)", margin: "0 0 0 0" }}>
                        <p style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-accent)", marginBottom: 5 }}>Primary</p>
                        <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)", lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{target_audience.primary}</p>
                      </div>
                    )}

                    {/* Secondary — muted left-border row */}
                    {target_audience.secondary && (
                      <div style={{ padding: "14px 16px", borderLeft: "3px solid var(--color-card-border)", borderTop: "1px solid var(--color-card-border)" }}>
                        <p style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-sidebar-text)", marginBottom: 5 }}>Secondary</p>
                        <p style={{ fontSize: "0.78rem", color: "var(--color-input-text)", lineHeight: 1.6, margin: 0 }}>{target_audience.secondary}</p>
                      </div>
                    )}

                    {/* Demographics — chips if comma-separated string, rows if object */}
                    {target_audience.demographics && (
                      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                        <p style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-sidebar-text)", marginBottom: 8 }}>Demographics</p>
                        {typeof target_audience.demographics === "string" ? (
                          // Try to split on comma/semicolon into chips; fall back to paragraph
                          (() => {
                            const parts = target_audience.demographics.split(/[,;]/).map(s => s.trim()).filter(Boolean);
                            return parts.length > 2 ? (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                {parts.map((part, i) => (
                                  <span key={i} style={{
                                    fontSize: "0.71rem", padding: "3px 9px", borderRadius: 6,
                                    backgroundColor: "var(--color-card-bg)", border: "1px solid var(--color-card-border)",
                                    color: "var(--color-input-text)", lineHeight: 1.4,
                                  }}>{part}</span>
                                ))}
                              </div>
                            ) : (
                              <p style={{ fontSize: "0.76rem", color: "var(--color-sidebar-text)", lineHeight: 1.6, margin: 0 }}>
                                {target_audience.demographics}
                              </p>
                            );
                          })()
                        ) : (
                          Object.entries(target_audience.demographics).map(([k, v]) => (
                            <InfoRow key={k} label={k} value={String(v)} />
                          ))
                        )}
                      </div>
                    )}

                    {/* Any extra audience keys */}
                    {Object.entries(target_audience)
                      .filter(([k]) => !["primary", "secondary", "demographics"].includes(k))
                      .map(([k, v]) => (
                        <div key={k} style={{ padding: "10px 16px", borderTop: "1px solid var(--color-card-border)" }}>
                          <InfoRow label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v)} />
                        </div>
                      ))
                    }
                  </div>
                </SCard>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── CHANNEL STRATEGY ── */}
      {channels?.length > 0 && (
        <div>
          <SBar label="Channel Strategy" />
          <SCard>
            {channels.map((ch, i) => <ChannelRow key={i} ch={ch} index={i} />)}
          </SCard>
        </div>
      )}

      {/* ── FUNNEL ARCHITECTURE ── */}
      <FunnelStages stages={funnel_stages} />

      {/* ── CONTENT PLAN ── */}
      {content_plan && (Array.isArray(content_plan) ? content_plan.length > 0 : Object.keys(content_plan).length > 0) && (
        <div>
          <SBar label="Content Plan" />
          <SCard>
            <ContentPlanTable items={content_plan} />
          </SCard>
        </div>
      )}

      {/* ── PERFORMANCE ── */}
      {(kpis?.length > 0 || budgetData) && (
        <div>
          <SBar label="Performance Targets" />
          <div style={{ display: "grid", gridTemplateColumns: budgetData ? "1fr 360px" : "1fr", gap: 14, alignItems: "start" }}>

            {kpis?.length > 0 && (
              <SCard>
                <SCardHead icon={<BarChart2 size={13} />} label="KPI Targets" />
                <div style={{ padding: "18px 20px" }}>
                  <QuantKpiChart kpis={kpis} />
                </div>
              </SCard>
            )}

            {budgetData && (
              <SCard>
                <SCardHead icon={<DollarSign size={13} />} label="Budget Allocation" />
                <div style={{ padding: "16px 18px" }}>
                  <BudgetDonut strategy={{ budget_allocation: budgetData }} />
                </div>
              </SCard>
            )}
          </div>
        </div>
      )}

      {/* ── AD UPLOAD SPECS ── */}
      <AdUploadSpecs specs={ad_upload_specs} />

      {/* ── SOCIAL CONTENT & LAUNCH SCHEDULE ── */}
      {social_content && Object.keys(social_content).length > 0 && (
        <div>
          <SBar label="Social Content & Launch Schedule" />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Object.entries(social_content).map(([platform, content]) => (
              <SCard key={platform}>
                <SCardHead icon={<Send size={13} />} label={platform} />
                <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "start" }}>

                  {/* Caption */}
                  <div>
                    <p style={{ fontSize: "0.62rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-accent)", marginBottom: 6 }}>Caption</p>
                    {content.caption
                      ? <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)", lineHeight: 1.6, margin: 0 }}>{content.caption}</p>
                      : <p style={{ fontSize: "0.8rem", color: "var(--color-sidebar-text)", margin: 0 }}>—</p>
                    }
                  </div>

                  {/* Hashtags */}
                  <div>
                    <p style={{ fontSize: "0.62rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-accent)", marginBottom: 6 }}>Hashtags</p>
                    {content.hashtags
                      ? <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {content.hashtags.split(/\s+/).filter(h => h).map((h, i) => (
                            <span key={i} style={{
                              fontSize: "0.72rem", padding: "3px 9px", borderRadius: 999, fontWeight: 600,
                              backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
                              color: "var(--color-accent)",
                            }}>{h.startsWith("#") ? h : `#${h}`}</span>
                          ))}
                        </div>
                      : <p style={{ fontSize: "0.8rem", color: "var(--color-sidebar-text)", margin: 0 }}>—</p>
                    }
                  </div>

                  {/* Launch Schedule */}
                  <div style={{
                    padding: "10px 13px", borderRadius: 10,
                    backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)",
                    border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.18)",
                  }}>
                    <p style={{ fontSize: "0.62rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-accent)", marginBottom: 7 }}>Launch Window</p>
                    {content.launch_schedule ? <>
                      {content.launch_schedule.recommended_window && (
                        <p style={{ fontSize: "0.84rem", fontWeight: 700, color: "var(--color-input-text)", margin: "0 0 4px" }}>{content.launch_schedule.recommended_window}</p>
                      )}
                      {(content.launch_schedule.best_days || content.launch_schedule.best_time) && (
                        <p style={{ fontSize: "0.76rem", color: "var(--color-sidebar-text)", margin: "0 0 4px" }}>
                          {[content.launch_schedule.best_days, content.launch_schedule.best_time].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {content.launch_schedule.rationale && (
                        <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", fontStyle: "italic", margin: 0 }}>{content.launch_schedule.rationale}</p>
                      )}
                    </> : <p style={{ fontSize: "0.8rem", color: "var(--color-sidebar-text)", margin: 0 }}>—</p>}
                  </div>

                </div>
              </SCard>
            ))}
          </div>
        </div>
      )}

      {/* ── ADDITIONAL FIELDS (catch-all) ── */}
      {extraEntries.length > 0 && (
        <div>
          <SBar label="Additional Details" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {extraEntries.map(([key, val]) => (
              <SCard key={key} style={{ padding: "14px 16px" }}>
                <p style={{ fontSize: "0.62rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-accent)", marginBottom: 6 }}>
                  {key.replace(/_/g, " ")}
                </p>
                <GenericValue value={val} />
              </SCard>
            ))}
          </div>
        </div>
      )}

      {/* Raw JSON toggle */}
      <button
        onClick={() => setShowRaw(p => !p)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer", padding: 0,
          color: "var(--color-sidebar-text)", fontSize: "0.75rem",
        }}
      >
        {showRaw ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {showRaw ? "Hide" : "View"} raw JSON
      </button>
      {showRaw && (
        <pre style={{
          padding: "16px", borderRadius: 12,
          border: "1px solid var(--color-card-border)",
          backgroundColor: "#0d1b2e",
          fontSize: "0.7rem", lineHeight: 1.7, whiteSpace: "pre-wrap",
          wordBreak: "break-word", color: "#7dd3fc",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          maxHeight: "400px", overflowY: "auto",
        }}>
          {JSON.stringify(strategy, null, 2)}
        </pre>
      )}
    </div>
  );
}
