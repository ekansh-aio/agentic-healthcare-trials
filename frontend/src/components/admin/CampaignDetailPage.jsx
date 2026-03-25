/**
 * Campaign Detail Page
 * Owner: Frontend Dev 2
 * Dependencies: adsAPI
 *
 * Route: /admin/campaign/:id  (also accessible by reviewer, publisher, ethics_reviewer)
 *
 * Sections (conditionally shown by status):
 *   - Metadata          — always
 *   - Status timeline   — always
 *   - Protocol docs     — always
 *   - Strategy          — strategy_created and beyond
 *   - Review panel      — strategy_created / under_review (reviewer role)
 *   - Reviews           — under_review and beyond
 *   - Analytics         — published only
 *
 * Actions:
 *   - Generate Strategy  — draft (admin / publisher)
 *   - Submit for Review  — strategy_created (admin / publisher)
 *   - Publish            — approved (publisher / admin)
 */

import React, { useState, useEffect, useCallback, useRef, Component } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { PageWithSidebar, SectionCard, CampaignStatusBadge } from "../shared/Layout";
import { adsAPI } from "../../services/api";
import {
  ArrowLeft, Megaphone, Globe, Image, Bot, MessageSquare,
  FileText, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Loader2, Target, DollarSign, Users, Layers, Zap, BarChart2,
  MessageCircle, Send, ThumbsUp, ThumbsDown, RefreshCw, Sparkles,
  Download, Eye, Trash2,
} from "lucide-react";

// ─── Generate progress hook ───────────────────────────────────────────────────
function useGenerateProgress() {
  const [progress, setProgress] = useState(0);
  const [label,    setLabel]    = useState("");
  const timerRef   = useRef(null);
  const startedAt  = useRef(null);
  const durationMs = useRef(20000);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startedAt.current;
    const dur     = durationMs.current;
    // Exponential easing — reaches ~86% at 1× duration, asymptotes at 92%
    const pct = Math.min(92, 92 * (1 - Math.exp(-(elapsed / dur) * 2)));
    setProgress(Math.round(pct));
  }, []);

  const start = useCallback((taskLabel, estimatedMs = 20000) => {
    if (timerRef.current) clearInterval(timerRef.current);
    startedAt.current  = Date.now();
    durationMs.current = estimatedMs;
    setLabel(taskLabel);
    setProgress(2);
    timerRef.current = setInterval(tick, 250);
  }, [tick]);

  const complete = useCallback(() => {
    clearInterval(timerRef.current);
    setProgress(100);
    setTimeout(() => { setProgress(0); setLabel(""); }, 700);
  }, []);

  const fail = useCallback(() => {
    clearInterval(timerRef.current);
    setProgress(0);
    setLabel("");
  }, []);

  useEffect(() => () => clearInterval(timerRef.current), []);

  return { progress, label, start, complete, fail };
}

function InlineProgress({ progress }) {
  if (!progress) return null;
  const done = progress === 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
      <div style={{
        flex: 1, height: "5px", minWidth: "80px", maxWidth: "220px",
        background: "var(--color-accent-subtle)",
        borderRadius: "50px", overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${progress}%`,
          background: done ? "var(--color-accent)" : "var(--color-accent)",
          opacity: done ? 1 : 0.85,
          borderRadius: "50px",
          transition: "width 0.25s ease",
        }} />
      </div>
      <span style={{
        fontSize: "0.72rem", fontWeight: 600,
        color: done ? "var(--color-accent)" : "var(--color-accent-text)",
        fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      }}>
        {done ? "✓ Done" : `${progress}%`}
      </span>
    </div>
  );
}

// ─── Status lifecycle ─────────────────────────────────────────────────────────
const STATUS_STEPS = [
  { key: "draft",            label: "Draft" },
  { key: "strategy_created", label: "Strategy Ready" },
  { key: "under_review",     label: "Under Review" },
  { key: "ethics_review",    label: "Ethics Review" },
  { key: "approved",         label: "Approved" },
  { key: "published",        label: "Published" },
];

function statusIndex(status) {
  const idx = STATUS_STEPS.findIndex((s) => s.key === status);
  return idx === -1 ? 0 : idx;
}

function StatusTimeline({ status }) {
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
const TYPE_ICON = { website: Globe, ads: Image, voicebot: Bot, chatbot: MessageSquare };

function AdTypeChip({ type }) {
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
function GenericValue({ value }) {
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

/** Section divider label used across StrategyViewer */
function SectionLabel({ children }) {
  return (
    <p style={{
      fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.06em", color: "var(--color-sidebar-text)", marginBottom: "10px",
    }}>
      {children}
    </p>
  );
}

// Keys handled by dedicated UI — excluded from the catch-all block
const KNOWN_STRATEGY_KEYS = new Set([
  "executive_summary", "target_audience", "messaging", "channels",
  "content_plan", "kpis", "budget_breakdown", "budget_allocation",
]);

// ─── Strategy sub-components ──────────────────────────────────────────────────

function SidebarBox({ icon, title, children }) {
  return (
    <div style={{
      padding: "14px 16px", borderRadius: "10px",
      border: "1px solid var(--color-card-border)",
      backgroundColor: "var(--color-card-bg)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
        <span style={{ color: "var(--color-accent)" }}>{icon}</span>
        <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)" }}>
          {title}
        </p>
      </div>
      {children}
    </div>
  );
}

function ChannelRow({ ch, index }) {
  // ch may be a plain string like "Meta/Instagram — Reels, Stories, and Feed Ads targeting…"
  // or an object with platform/name/strategy keys
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

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "12px",
      padding: "10px 14px", borderRadius: "8px",
      border: "1px solid var(--color-card-border)",
      backgroundColor: "var(--color-card-bg)",
    }}>
      <div style={{
        width: "30px", height: "30px", borderRadius: "6px", flexShrink: 0,
        backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Target size={13} style={{ color: "var(--color-accent)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "0.83rem", fontWeight: 600, color: "var(--color-input-text)", marginBottom: detail ? "3px" : 0 }}>
          {platform}
        </p>
        {detail && (
          <p style={{ fontSize: "0.76rem", color: "var(--color-sidebar-text)", lineHeight: 1.5 }}>
            {detail}
          </p>
        )}
        {extraEntries.map(([k, v]) => (
          <InfoRow key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v)} />
        ))}
      </div>
      {!isString && ch.budget_allocation != null && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--color-accent)" }}>
            {Math.round(ch.budget_allocation <= 1 ? ch.budget_allocation * 100 : ch.budget_allocation)}%
          </p>
          <p style={{ fontSize: "0.62rem", color: "var(--color-sidebar-text)" }}>budget</p>
        </div>
      )}
    </div>
  );
}

function ContentPlanTable({ items }) {
  // items may be an array of objects or a plain object keyed by index
  const rows = Array.isArray(items)
    ? items
    : Object.values(items);

  const [expandedRow, setExpandedRow] = useState(null);

  if (!rows.length) return null;

  // Detect columns from first row, prioritise known order
  const PREFERRED_ORDER = ["channel", "format", "frequency", "example"];
  const allKeys = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const cols = [
    ...PREFERRED_ORDER.filter(k => allKeys.includes(k)),
    ...allKeys.filter(k => !PREFERRED_ORDER.includes(k)),
  ];
  const mainCols = cols.filter(k => k !== "example");

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
        <thead>
          <tr>
            {mainCols.map(col => (
              <th key={col} style={{
                padding: "6px 12px", textAlign: "left",
                fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.06em", color: "var(--color-sidebar-text)",
                borderBottom: "1px solid var(--color-card-border)",
                whiteSpace: "nowrap",
              }}>
                {col.replace(/_/g, " ")}
              </th>
            ))}
            {cols.includes("example") && (
              <th style={{
                padding: "6px 12px", textAlign: "left",
                fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.06em", color: "var(--color-sidebar-text)",
                borderBottom: "1px solid var(--color-card-border)",
                whiteSpace: "nowrap", width: "80px",
              }}>
                Example
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <React.Fragment key={i}>
              <tr style={{ backgroundColor: i % 2 === 0 ? "transparent" : "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.03)" }}>
                {mainCols.map(col => (
                  <td key={col} style={{
                    padding: "8px 12px", color: "var(--color-input-text)",
                    borderBottom: expandedRow === i ? "none" : "1px solid var(--color-card-border)",
                    verticalAlign: "top", lineHeight: 1.5,
                  }}>
                    {String(row[col] ?? "")}
                  </td>
                ))}
                {cols.includes("example") && (
                  <td style={{
                    padding: "8px 12px",
                    borderBottom: expandedRow === i ? "none" : "1px solid var(--color-card-border)",
                    verticalAlign: "top",
                  }}>
                    {row.example && (
                      <button
                        onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                        style={{
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                          display: "inline-flex", alignItems: "center", gap: "4px",
                          color: "var(--color-accent)", fontSize: "0.72rem", fontWeight: 600,
                        }}
                      >
                        <Eye size={11} />
                        {expandedRow === i ? "Hide" : "View"}
                      </button>
                    )}
                  </td>
                )}
              </tr>
              {expandedRow === i && row.example && (
                <tr style={{ backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.04)" }}>
                  <td colSpan={mainCols.length + 1} style={{
                    padding: "10px 12px 12px",
                    borderBottom: "1px solid var(--color-card-border)",
                  }}>
                    <p style={{ fontSize: "0.76rem", color: "var(--color-sidebar-text)", lineHeight: 1.6, fontStyle: "italic" }}>
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

function KpiGrid({ kpis }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "8px" }}>
      {kpis.map((kpi, i) => {
        // kpi may be a string "Label: description" or an object from the AI
        const kpiStr = typeof kpi === "string" ? kpi : JSON.stringify(kpi);
        const colonIdx = kpiStr.indexOf(":");
        const [label, desc] = colonIdx !== -1
          ? [kpiStr.slice(0, colonIdx).trim(), kpiStr.slice(colonIdx + 1).trim()]
          : [kpiStr, ""];
        return (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: "8px",
            padding: "8px 10px", borderRadius: "8px",
            border: "1px solid var(--color-card-border)",
            backgroundColor: "var(--color-card-bg)",
          }}>
            <Zap size={11} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: "3px" }} />
            <div>
              <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-input-text)", lineHeight: 1.4 }}>
                {label}
              </p>
              {desc && (
                <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", lineHeight: 1.4, marginTop: "2px" }}>
                  {desc}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BudgetBar({ budgetData }) {
  const entries = Object.entries(budgetData);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {entries.map(([k, v]) => {
        const raw = String(v).replace("%", "").trim();
        const pct = isNaN(Number(raw)) ? null : Number(raw) <= 1 ? Math.round(Number(raw) * 100) : Math.round(Number(raw));
        return (
          <div key={k}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
              <span style={{ fontSize: "0.74rem", color: "var(--color-input-text)", lineHeight: 1.3 }}>
                {k.replace(/_/g, " ")}
              </span>
              <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--color-accent)", flexShrink: 0, marginLeft: "8px" }}>
                {pct !== null ? `${pct}%` : String(v)}
              </span>
            </div>
            {pct !== null && (
              <div style={{ height: "4px", borderRadius: "999px", backgroundColor: "var(--color-card-border)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, backgroundColor: "var(--color-accent)", borderRadius: "999px" }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StrategyViewer({ strategy }) {
  const [showRaw, setShowRaw] = useState(false);
  if (!strategy) return null;

  const {
    executive_summary, target_audience, messaging, channels,
    content_plan, kpis, budget_breakdown, budget_allocation,
  } = strategy;

  const budgetData = budget_breakdown ?? budget_allocation ?? null;

  const extraEntries = Object.entries(strategy).filter(
    ([k]) => !KNOWN_STRATEGY_KEYS.has(k)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Executive Summary — full width */}
      {executive_summary && (
        <div style={{
          padding: "16px", borderRadius: "10px",
          backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)",
          border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.2)",
        }}>
          <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-accent)", marginBottom: "8px" }}>
            Executive Summary
          </p>
          <p style={{ fontSize: "0.88rem", lineHeight: 1.7, color: "var(--color-input-text)" }}>
            {executive_summary}
          </p>
        </div>
      )}

      {/* Two-column body: left main + right sidebar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "16px", alignItems: "start" }}>

        {/* ── LEFT MAIN COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>

          {/* Channel Strategy */}
          {channels?.length > 0 && (
            <div style={{
              borderRadius: "10px", border: "1px solid var(--color-card-border)",
              backgroundColor: "var(--color-card-bg)", overflow: "hidden",
            }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-card-border)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Target size={13} style={{ color: "var(--color-accent)" }} />
                <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)" }}>
                  Channel Strategy
                </p>
              </div>
              <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {channels.map((ch, i) => <ChannelRow key={i} ch={ch} index={i} />)}
              </div>
            </div>
          )}

          {/* Content Plan */}
          {content_plan && (Array.isArray(content_plan) ? content_plan.length > 0 : Object.keys(content_plan).length > 0) && (
            <div style={{
              borderRadius: "10px", border: "1px solid var(--color-card-border)",
              backgroundColor: "var(--color-card-bg)", overflow: "hidden",
            }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-card-border)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Layers size={13} style={{ color: "var(--color-accent)" }} />
                <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)" }}>
                  Content Plan
                </p>
              </div>
              <ContentPlanTable items={content_plan} />
            </div>
          )}

          {/* KPIs */}
          {kpis?.length > 0 && (
            <div style={{
              borderRadius: "10px", border: "1px solid var(--color-card-border)",
              backgroundColor: "var(--color-card-bg)", overflow: "hidden",
            }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-card-border)", display: "flex", alignItems: "center", gap: "6px" }}>
                <BarChart2 size={13} style={{ color: "var(--color-accent)" }} />
                <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)" }}>
                  KPIs
                </p>
              </div>
              <div style={{ padding: "12px 14px" }}>
                <KpiGrid kpis={kpis} />
              </div>
            </div>
          )}

          {/* Catch-all extra keys */}
          {extraEntries.length > 0 && (
            <div style={{
              borderRadius: "10px", border: "1px solid var(--color-card-border)",
              backgroundColor: "var(--color-card-bg)", overflow: "hidden",
            }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-card-border)" }}>
                <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)" }}>
                  Additional Details
                </p>
              </div>
              <div style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
                {extraEntries.map(([key, val]) => (
                  <div key={key} style={{
                    padding: "10px 12px", borderRadius: "8px",
                    border: "1px solid var(--color-card-border)",
                    backgroundColor: "var(--color-page-bg)",
                  }}>
                    <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "capitalize", color: "var(--color-accent)", marginBottom: "6px" }}>
                      {key.replace(/_/g, " ")}
                    </p>
                    <GenericValue value={val} />
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ── RIGHT SIDEBAR COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Target Audience */}
          {target_audience && (
            <SidebarBox icon={<Users size={13} />} title="Target Audience">
              {target_audience.primary && (
                <div style={{ marginBottom: "8px" }}>
                  <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>Primary</p>
                  <p style={{ fontSize: "0.76rem", color: "var(--color-input-text)", lineHeight: 1.5 }}>{target_audience.primary}</p>
                </div>
              )}
              {target_audience.secondary && (
                <div style={{ marginBottom: "8px" }}>
                  <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>Secondary</p>
                  <p style={{ fontSize: "0.76rem", color: "var(--color-input-text)", lineHeight: 1.5 }}>{target_audience.secondary}</p>
                </div>
              )}
              {target_audience.demographics && typeof target_audience.demographics === "string" && (
                <div>
                  <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>Demographics</p>
                  <p style={{ fontSize: "0.74rem", color: "var(--color-sidebar-text)", lineHeight: 1.5 }}>{target_audience.demographics}</p>
                </div>
              )}
              {target_audience.demographics && typeof target_audience.demographics === "object" && !Array.isArray(target_audience.demographics) && (
                <div>
                  <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>Demographics</p>
                  {Object.entries(target_audience.demographics).map(([k, v]) => (
                    <InfoRow key={k} label={k} value={String(v)} />
                  ))}
                </div>
              )}
              {Object.entries(target_audience)
                .filter(([k]) => !["primary", "secondary", "demographics"].includes(k))
                .map(([k, v]) => (
                  <InfoRow key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v)} />
                ))
              }
            </SidebarBox>
          )}

          {/* Messaging */}
          {messaging && (
            <SidebarBox icon={<MessageCircle size={13} />} title="Messaging">
              {messaging.core_message && (
                <div style={{ marginBottom: "8px" }}>
                  <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>Core Message</p>
                  <p style={{ fontSize: "0.76rem", color: "var(--color-input-text)", lineHeight: 1.5 }}>{messaging.core_message}</p>
                </div>
              )}
              {messaging.tone && (
                <div style={{ marginBottom: "8px" }}>
                  <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>Tone</p>
                  <p style={{ fontSize: "0.74rem", color: "var(--color-sidebar-text)", lineHeight: 1.5 }}>{messaging.tone}</p>
                </div>
              )}
              {messaging.key_differentiators?.length > 0 && (
                <div style={{ marginBottom: "6px" }}>
                  <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "5px" }}>Key Differentiators</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {messaging.key_differentiators.map((d, i) => (
                      <div key={i} style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                        <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--color-accent)", flexShrink: 0, marginTop: "6px" }} />
                        <p style={{ fontSize: "0.72rem", color: "var(--color-input-text)", lineHeight: 1.4 }}>{d}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {messaging.key_phrases?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                  {messaging.key_phrases.map((p) => (
                    <span key={p} style={{
                      fontSize: "0.68rem", padding: "2px 7px", borderRadius: "999px",
                      backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
                      color: "var(--color-accent)",
                      border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.2)",
                    }}>{p}</span>
                  ))}
                </div>
              )}
              {messaging.cta && <InfoRow label="CTA" value={messaging.cta} />}
              {Object.entries(messaging)
                .filter(([k]) => !["core_message", "tone", "cta", "key_phrases", "key_differentiators"].includes(k))
                .map(([k, v]) => (
                  <div key={k} style={{ marginTop: "6px" }}>
                    <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>
                      {k.replace(/_/g, " ")}
                    </p>
                    <GenericValue value={v} />
                  </div>
                ))
              }
            </SidebarBox>
          )}

          {/* Budget Allocation */}
          {budgetData && (
            <SidebarBox icon={<DollarSign size={13} />} title="Budget Allocation">
              <BudgetBar budgetData={budgetData} />
            </SidebarBox>
          )}

        </div>
      </div>

      {/* Raw JSON toggle — full width below grid */}
      <button
        onClick={() => setShowRaw((p) => !p)}
        style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          background: "none", border: "none", cursor: "pointer", padding: 0,
          color: "var(--color-sidebar-text)", fontSize: "0.78rem",
        }}
      >
        {showRaw ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {showRaw ? "Hide" : "View"} raw JSON
      </button>
      {showRaw && (
        <pre style={{
          padding: "16px", borderRadius: "10px",
          border: "1px solid var(--color-card-border)",
          backgroundColor: "var(--color-page-bg)",
          fontSize: "0.72rem", lineHeight: 1.7, whiteSpace: "pre-wrap",
          wordBreak: "break-word", color: "var(--color-input-text)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          maxHeight: "400px", overflowY: "auto",
        }}>
          {JSON.stringify(strategy, null, 2)}
        </pre>
      )}
    </div>
  );
}



function InfoRow({ label, value }) {
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

// ─── Review submission panel ──────────────────────────────────────────────────
function ReviewPanel({ adId, onSubmitted }) {
  const [form, setForm]       = useState({ review_type: "strategy", status: "approved", comments: "", suggestions: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const submit = async () => {
    if (!form.comments.trim()) { setError("Comments are required."); return; }
    setLoading(true); setError(null);
    try {
      await adsAPI.createReview(adId, form);
      onSubmitted();
    } catch (err) {
      setError(err.message || "Failed to submit review.");
    } finally {
      setLoading(false);
    }
  };

  const labelStyle = { fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: "6px" };
  const selectStyle = {
    width: "100%", padding: "8px 12px", borderRadius: "8px", fontSize: "0.85rem",
    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", outline: "none",
  };
  const textStyle = { ...selectStyle, resize: "vertical", minHeight: "80px", fontFamily: "inherit" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div>
          <label style={labelStyle}>Review Type</label>
          <select style={selectStyle} value={form.review_type} onChange={(e) => setForm((p) => ({ ...p, review_type: e.target.value }))}>
            <option value="strategy">Strategy Review</option>
            <option value="ethics">Ethics Review</option>
            <option value="performance">Performance Review</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Decision</label>
          <select style={selectStyle} value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
            <option value="approved">Approve</option>
            <option value="revision">Request Revision</option>
            <option value="rejected">Reject</option>
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Comments *</label>
        <textarea
          style={textStyle}
          placeholder="Provide your review comments..."
          value={form.comments}
          onChange={(e) => setForm((p) => ({ ...p, comments: e.target.value }))}
        />
      </div>

      <div>
        <label style={labelStyle}>Suggestions (optional)</label>
        <textarea
          style={{ ...textStyle, minHeight: "60px" }}
          placeholder="Any specific suggestions for improvement..."
          value={form.suggestions}
          onChange={(e) => setForm((p) => ({ ...p, suggestions: e.target.value }))}
        />
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
          <p style={{ fontSize: "0.82rem", color: "#ef4444" }}>{error}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: "10px" }}>
        <button
          onClick={submit}
          disabled={loading}
          className="btn--accent"
          style={{ display: "inline-flex", alignItems: "center", gap: "8px", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />}
          Submit Review
        </button>
      </div>
    </div>
  );
}

// ─── Review card ──────────────────────────────────────────────────────────────
function ReviewCard({ review }) {
  const statusColor = {
    approved: "var(--color-success)",
    rejected: "#ef4444",
    revision: "#f59e0b",
    pending:  "var(--color-sidebar-text)",
  }[review.status] ?? "var(--color-sidebar-text)";

  return (
    <div style={{
      padding: "14px 16px", borderRadius: "10px",
      border: "1px solid var(--color-card-border)",
      backgroundColor: "var(--color-card-bg)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            fontSize: "0.7rem", fontWeight: 600, padding: "2px 8px",
            borderRadius: "999px", textTransform: "capitalize",
            backgroundColor: statusColor + "22", color: statusColor,
            border: `1px solid ${statusColor}44`,
          }}>
            {review.status}
          </span>
          <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", textTransform: "capitalize" }}>
            {review.review_type} review
          </span>
        </div>
        {review.created_at && (
          <span style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)" }}>
            {new Date(review.created_at).toLocaleDateString()}
          </span>
        )}
      </div>
      {review.comments && (
        <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)", lineHeight: 1.6 }}>
          {review.comments}
        </p>
      )}
      {review.suggestions && (
        <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", marginTop: "6px", fontStyle: "italic" }}>
          Suggestions: {typeof review.suggestions === "object"
            ? JSON.stringify(review.suggestions, null, 2)
            : review.suggestions}
        </p>
      )}
    </div>
  );
}

// ─── Creatives Viewer ─────────────────────────────────────────────────────────
function CreativesViewer({ creatives }) {
  const [lightbox, setLightbox] = useState(null);
  if (!creatives?.length) return null;

  return (
    <>
      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            backgroundColor: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img
            src={lightbox}
            alt="Ad creative"
            style={{ maxHeight: "90vh", maxWidth: "90vw", borderRadius: "12px", objectFit: "contain" }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" }}>
        {creatives.map((c, i) => (
          <div key={i} style={{
            borderRadius: "12px",
            border: "1px solid var(--color-card-border)",
            backgroundColor: "var(--color-card-bg)",
            overflow: "hidden",
          }}>
            {/* Image */}
            <div style={{
              position: "relative",
              backgroundColor: "var(--color-page-bg)",
              aspectRatio: c.format?.includes("1920") ? "9/16" : c.format?.includes("16:9") ? "16/9" : "1/1",
              overflow: "hidden",
              maxHeight: "260px",
            }}>
              {c.image_url ? (
                <img
                  src={c.image_url}
                  alt={c.headline}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{
                  width: "100%", height: "100%", minHeight: "160px",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px",
                  color: "var(--color-sidebar-text)",
                }}>
                  <Image size={28} style={{ opacity: 0.3 }} />
                  <p style={{ fontSize: "0.72rem", opacity: 0.5 }}>Image not generated</p>
                </div>
              )}

              {/* Format badge */}
              <span style={{
                position: "absolute", top: "8px", left: "8px",
                fontSize: "0.65rem", fontWeight: 600, padding: "2px 7px", borderRadius: "4px",
                backgroundColor: "rgba(0,0,0,0.6)", color: "#fff", backdropFilter: "blur(4px)",
              }}>
                {c.format}
              </span>

              {/* View full size button */}
              {c.image_url && (
                <button
                  onClick={() => setLightbox(c.image_url)}
                  style={{
                    position: "absolute", top: "8px", right: "8px",
                    background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "6px",
                    padding: "4px 6px", cursor: "pointer", display: "flex", alignItems: "center",
                    color: "#fff", backdropFilter: "blur(4px)",
                  }}
                  title="View full size"
                >
                  <Eye size={12} />
                </button>
              )}
            </div>

            {/* Copy */}
            <div style={{ padding: "16px" }}>
              <p style={{
                fontSize: "1rem", fontWeight: 700,
                color: "var(--color-input-text)", marginBottom: "6px", lineHeight: 1.3,
              }}>
                {c.headline}
              </p>
              <p style={{
                fontSize: "0.82rem", color: "var(--color-sidebar-text)",
                lineHeight: 1.6, marginBottom: "12px",
              }}>
                {c.body}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{
                  fontSize: "0.75rem", fontWeight: 600,
                  padding: "4px 12px", borderRadius: "999px",
                  backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12)",
                  color: "var(--color-accent)",
                  border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)",
                }}>
                  {c.cta}
                </span>
                {c.image_url && (
                  <a
                    href={c.image_url}
                    download
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "4px",
                      fontSize: "0.72rem", color: "var(--color-sidebar-text)",
                      textDecoration: "none",
                    }}
                  >
                    <Download size={11} /> Download
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────
function ActionButton({ onClick, loading, disabled, variant = "accent", icon, children }) {
  const cls = variant === "ghost" ? "btn--ghost" : variant === "primary" ? "btn--primary" : "btn--accent";
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cls}
      style={{ display: "inline-flex", alignItems: "center", gap: "8px", opacity: (disabled || loading) ? 0.6 : 1, cursor: (disabled || loading) ? "not-allowed" : "pointer" }}
    >
      {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : icon}
      {children}
    </button>
  );
}

// ─── Error boundary ───────────────────────────────────────────────────────────
class DetailErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <PageWithSidebar>
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <AlertCircle size={36} style={{ color: "#ef4444", margin: "0 auto 14px" }} />
            <p style={{ color: "var(--color-input-text)", fontWeight: 700, fontSize: "1rem" }}>
              Something went wrong rendering this campaign
            </p>
            <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.82rem", marginTop: "6px", maxWidth: "420px", margin: "8px auto 0" }}>
              {this.state.error?.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn--ghost"
              style={{ marginTop: "20px" }}
            >
              Reload page
            </button>
          </div>
        </PageWithSidebar>
      );
    }
    return this.props.children;
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CampaignDetailPage() {
  return <DetailErrorBoundary><CampaignDetailPageInner /></DetailErrorBoundary>;
}

function CampaignDetailPageInner() {
  const { id }      = useParams();
  const navigate    = useNavigate();

  const [ad,        setAd]        = useState(null);
  const [protoDocs, setProtoDocs] = useState([]);
  const [reviews,   setReviews]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // Per-action loading & error
  const [genLoading,  setGenLoading]  = useState(false);
  const [genError,    setGenError]    = useState(null);
  const [revLoading,  setRevLoading]  = useState(false);
  const [revError,    setRevError]    = useState(null);
  const [pubLoading,  setPubLoading]  = useState(false);
  const [pubError,    setPubError]    = useState(null);
  const [creativeLoading, setCreativeLoading] = useState(false);
  const [creativeError,   setCreativeError]   = useState(null);
  const [deleteLoading,   setDeleteLoading]   = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [websiteLoading,  setWebsiteLoading]  = useState(false);
  const [websiteError,    setWebsiteError]    = useState(null);

  const genProgress = useGenerateProgress();

  const role = JSON.parse(localStorage.getItem("user") || "{}").role;

  const load = useCallback(async () => {
    try {
      const [adData, docsData, reviewsData] = await Promise.all([
        adsAPI.get(id),
        adsAPI.listDocuments(id),
        adsAPI.listReviews(id),
      ]);
      setAd(adData);
      setProtoDocs(docsData);
      setReviews(reviewsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Action handlers ──────────────────────────────────────────────────────
  const handleGenerateStrategy = async () => {
    setGenLoading(true); setGenError(null);
    genProgress.start("Generating strategy…", 25000);
    try {
      const updated = await adsAPI.generateStrategy(id);
      setAd(updated);
      genProgress.complete();
    } catch (err) {
      genProgress.fail();
      setGenError(err.message || "Strategy generation failed. Check that training has been run and API keys are configured.");
    } finally {
      setGenLoading(false);
    }
  };

  const handleSubmitForReview = async () => {
    setRevLoading(true); setRevError(null);
    genProgress.start("Running AI review…", 20000);
    try {
      const updated = await adsAPI.submitForReview(id);
      setAd(updated);
      genProgress.complete();
    } catch (err) {
      genProgress.fail();
      setRevError(err.message || "Failed to submit for review.");
    } finally {
      setRevLoading(false);
    }
  };

  const handlePublish = async () => {
    setPubLoading(true); setPubError(null);
    genProgress.start("Publishing campaign…", 8000);
    try {
      const updated = await adsAPI.publish(id);
      setAd(updated);
      genProgress.complete();
    } catch (err) {
      genProgress.fail();
      setPubError(err.message || "Publish failed. Campaign must be approved first.");
    } finally {
      setPubLoading(false);
    }
  };

  const handleReviewSubmitted = async () => {
    await load();
  };

  const handleGenerateCreatives = async () => {
    setCreativeLoading(true); setCreativeError(null);
    genProgress.start("Generating ad creatives + images…", 60000);
    try {
      const updated = await adsAPI.generateCreatives(id);
      setAd(updated);
      genProgress.complete();
    } catch (err) {
      genProgress.fail();
      setCreativeError(err.message || "Creative generation failed.");
    } finally {
      setCreativeLoading(false);
    }
  };

  const handleGenerateWebsite = async () => {
    setWebsiteLoading(true); setWebsiteError(null);
    genProgress.start("Building landing page…", 35000);
    try {
      const updated = await adsAPI.generateWebsite(id);
      setAd(updated);
      genProgress.complete();
    } catch (err) {
      genProgress.fail();
      setWebsiteError(err.message || "Website generation failed.");
    } finally {
      setWebsiteLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await adsAPI.delete(id);
      navigate("/admin");
    } catch (err) {
      setShowDeleteConfirm(false);
      setDeleteLoading(false);
      alert(err.message || "Failed to delete campaign.");
    }
  };

  // ── Derived state ────────────────────────────────────────────────────────
  const currentStep = ad ? statusIndex(ad.status) : 0;
  const hasStrategy = ad && currentStep >= statusIndex("strategy_created");
  const hasReviews  = ad && currentStep >= statusIndex("under_review");
  const isPublished = ad && ad.status === "published";
  const canReview   = ad && (ad.status === "under_review" || ad.status === "strategy_created" || ad.status === "ethics_review");

  if (loading) return (
    <PageWithSidebar>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "40px 0", color: "var(--color-sidebar-text)" }}>
        <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
        <p>Loading campaign…</p>
      </div>
    </PageWithSidebar>
  );

  if (error || !ad) return (
    <PageWithSidebar>
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <AlertCircle size={32} style={{ color: "#ef4444", margin: "0 auto 12px" }} />
        <p style={{ color: "var(--color-input-text)", fontWeight: 600 }}>Campaign not found</p>
        <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.85rem", marginTop: "4px" }}>{error}</p>
        <button onClick={() => navigate(-1)} className="btn--ghost" style={{ marginTop: "16px" }}>Go back</button>
      </div>
    </PageWithSidebar>
  );

  return (
    <PageWithSidebar>

      {/* CSS for spinner */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Page header */}
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: "4px" }}>
            <ArrowLeft size={18} style={{ color: "var(--color-sidebar-text)" }} />
          </button>
          <div>
            <h1 className="page-header__title">{ad.title}</h1>
            <p className="page-header__subtitle">Created {new Date(ad.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <CampaignStatusBadge status={ad.status} />
          {role === "admin" && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete campaign"
              style={{
                background: "none", border: "1px solid #ef4444", borderRadius: "8px",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "5px",
                padding: "6px 12px", color: "#ef4444", fontSize: "0.8rem", fontWeight: 500,
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "var(--color-card-bg)", border: "1px solid var(--color-card-border)",
            borderRadius: "14px", padding: "28px 32px", maxWidth: "400px", width: "90%",
          }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-input-text)", marginBottom: "8px" }}>
              Delete Campaign?
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)", marginBottom: "24px", lineHeight: 1.6 }}>
              This will permanently delete <strong style={{ color: "var(--color-input-text)" }}>{ad.title}</strong> and all
              its documents, reviews, and analytics. This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
                className="btn--ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                style={{
                  background: "#ef4444", color: "#fff", border: "none",
                  borderRadius: "8px", padding: "8px 18px", cursor: "pointer",
                  fontWeight: 600, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px",
                  opacity: deleteLoading ? 0.7 : 1,
                }}
              >
                {deleteLoading
                  ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  : <Trash2 size={14} />}
                Delete Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">

        {/* Status timeline */}
        <SectionCard title="Campaign Progress">
          <StatusTimeline status={ad.status} />
        </SectionCard>

        {/* Metadata */}
        <SectionCard title="Campaign Details">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "20px" }}>

            <div>
              <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>
                Campaign Type
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {ad.ad_type?.map((t) => <AdTypeChip key={t} type={t} />)}
              </div>
            </div>

            {ad.budget && (
              <div>
                <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Budget</p>
                <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--color-input-text)" }}>${ad.budget.toLocaleString()}</p>
              </div>
            )}

            {ad.platforms?.length > 0 && (
              <div>
                <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Platforms</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {ad.platforms.map((p) => (
                    <span key={p} style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "999px", border: "1px solid var(--color-card-border)", color: "var(--color-sidebar-text)" }}>{p}</span>
                  ))}
                </div>
              </div>
            )}

            {ad.target_audience && Object.values(ad.target_audience).some(Boolean) && (
              <div>
                <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Target Audience</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {ad.target_audience.age_range && <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>Age: {ad.target_audience.age_range}</p>}
                  {ad.target_audience.gender    && <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>Gender: {ad.target_audience.gender}</p>}
                  {ad.target_audience.interests && <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>Interests: {ad.target_audience.interests}</p>}
                </div>
              </div>
            )}

          </div>
        </SectionCard>

        {/* Protocol documents */}
        <SectionCard
          title="Protocol Documents"
          subtitle={protoDocs.length === 0 ? "No documents attached" : `${protoDocs.length} document${protoDocs.length > 1 ? "s" : ""} attached`}
        >
          {protoDocs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <FileText size={28} style={{ color: "var(--color-sidebar-text)", margin: "0 auto 8px", opacity: 0.5 }} />
              <p style={{ fontSize: "0.82rem", color: "var(--color-sidebar-text)" }}>No protocol documents were uploaded for this campaign.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {protoDocs.map((doc) => (
                <div key={doc.id} style={{
                  display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px",
                  borderRadius: "8px", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)",
                }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "6px", flexShrink: 0, backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <FileText size={14} style={{ color: "var(--color-accent)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</p>
                    <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                      {doc.doc_type?.replace(/_/g, " ")}{doc.file_path && ` · ${doc.file_path.split("/").pop()}`}
                    </p>
                  </div>
                  <span style={{ fontSize: "0.65rem", fontWeight: 600, padding: "2px 6px", borderRadius: "4px", backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)", color: "var(--color-accent)", border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.2)" }}>
                    Priority {doc.priority}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── Generate Strategy action (draft status) ───────────────────────── */}
        {ad.status === "draft" && (
          <SectionCard
            title="Generate Marketing Strategy"
            subtitle="Claude will analyse your company documents and campaign brief to create a tailored strategy"
          >
            {genError && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "16px" }}>
                <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{genError}</p>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <ActionButton onClick={handleGenerateStrategy} loading={genLoading} icon={<Zap size={14} />}>
                {genLoading ? "Generating…" : "Generate Strategy with Claude"}
              </ActionButton>
              {genLoading
                ? <InlineProgress progress={genProgress.progress} />
                : <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)" }}>Uses your trained Curator skill · typical time: 15–30 s</p>
              }
            </div>
          </SectionCard>
        )}

        {/* ── Strategy viewer ───────────────────────────────────────────────── */}
        {hasStrategy && (
          <SectionCard
            title="AI Marketing Strategy"
            subtitle="Generated by the Curator AI based on company and protocol documents"
          >
            {ad.strategy_json ? (
              <StrategyViewer strategy={ad.strategy_json} />
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)" }}>Strategy is being generated…</p>
            )}
          </SectionCard>
        )}

        {/* ── Reviewer pre-processing (strategy_created) ───────────────────── */}
        {ad.status === "strategy_created" && (
          <SectionCard
            title="Submit for Review"
            subtitle="The Reviewer AI will analyse the strategy and prepare website requirements and ad specifications"
          >
            {revError && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "16px" }}>
                <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{revError}</p>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <ActionButton onClick={handleSubmitForReview} loading={revLoading} variant="primary" icon={<Send size={14} />}>
                {revLoading ? "Processing…" : "Submit for AI Review"}
              </ActionButton>
              {revLoading && <InlineProgress progress={genProgress.progress} />}
            </div>
          </SectionCard>
        )}

        {/* ── Human review panel ────────────────────────────────────────────── */}
        {canReview && (
          <SectionCard
            title="Submit Your Review"
            subtitle="Add your human review — approve, request revisions, or flag ethical concerns"
          >
            <ReviewPanel adId={id} onSubmitted={handleReviewSubmitted} />
          </SectionCard>
        )}

        {/* ── Review history ────────────────────────────────────────────────── */}
        {hasReviews && reviews.length > 0 && (
          <SectionCard
            title="Review History"
            subtitle={`${reviews.length} review${reviews.length !== 1 ? "s" : ""} on record`}
          >
            <div className="space-y-3">
              {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
            </div>
          </SectionCard>
        )}

        {/* ── Reviewer output (website_reqs / ad_details) ───────────────────── */}
        {(ad.website_reqs || ad.ad_details) && (
          <SectionCard
            title="Reviewer Output"
            subtitle="Structured requirements extracted by the Reviewer AI"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

              {/* Website Requirements */}
              {ad.website_reqs && (
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-accent)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Globe size={12} /> Website Requirements
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
                    {Object.entries(ad.website_reqs).map(([key, val]) => (
                      <div key={key} style={{
                        padding: "12px 14px", borderRadius: "10px",
                        border: "1px solid var(--color-card-border)",
                        backgroundColor: "var(--color-card-bg)",
                      }}>
                        <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "capitalize", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>
                          {key.replace(/_/g, " ")}
                        </p>
                        <GenericValue value={val} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ad Specifications */}
              {ad.ad_details && (
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-accent)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Layers size={12} /> Ad Specifications
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
                    {Object.entries(ad.ad_details).map(([key, val]) => (
                      <div key={key} style={{
                        padding: "12px 14px", borderRadius: "10px",
                        border: "1px solid var(--color-card-border)",
                        backgroundColor: "var(--color-card-bg)",
                      }}>
                        <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "capitalize", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>
                          {key.replace(/_/g, " ")}
                        </p>
                        <GenericValue value={val} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </SectionCard>
        )}

        {/* ── Generate Ad Creatives ─────────────────────────────────────────── */}
        {(ad.status === "approved" || ad.status === "published") && (
          <SectionCard
            title="Generate Ad Creatives"
            subtitle="Claude writes copy · Titan Image Generator v2 produces the visuals"
          >
            {creativeError && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "16px" }}>
                <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{creativeError}</p>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: ad.output_files?.length ? "24px" : 0 }}>
              <ActionButton
                onClick={handleGenerateCreatives}
                loading={creativeLoading}
                icon={<Sparkles size={14} />}
              >
                {creativeLoading
                  ? "Generating…"
                  : ad.output_files?.length
                    ? "Regenerate Creatives"
                    : "Generate Ad Creatives"}
              </ActionButton>
              {creativeLoading
                ? <InlineProgress progress={genProgress.progress} />
                : !ad.output_files?.length && (
                    <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)" }}>
                      Generates copy + images for all ad formats · uses AWS Bedrock Titan
                    </p>
                  )
              }
            </div>
            {ad.output_files?.length > 0 && (
              <CreativesViewer creatives={ad.output_files} />
            )}
          </SectionCard>
        )}

        {/* ── Generate Website ──────────────────────────────────────────────── */}
        {(ad.status === "approved" || ad.status === "published") && ad.ad_type?.includes("website") && (
          <SectionCard
            title="Generate Landing Page"
            subtitle="Claude builds a complete, brand-styled HTML page from your strategy and website requirements"
          >
            {websiteError && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "16px" }}>
                <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{websiteError}</p>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: ad.output_url ? "20px" : 0 }}>
              <ActionButton
                onClick={handleGenerateWebsite}
                loading={websiteLoading}
                icon={<Globe size={14} />}
              >
                {websiteLoading
                  ? "Generating…"
                  : ad.output_url
                    ? "Regenerate Website"
                    : "Generate Website"}
              </ActionButton>
              {websiteLoading
                ? <InlineProgress progress={genProgress.progress} />
                : !ad.output_url && (
                    <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)" }}>
                      Generates a self-contained HTML page · uses brand kit + strategy
                    </p>
                  )
              }
            </div>
            {ad.output_url && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px", borderRadius: "10px",
                border: "1px solid rgba(16,185,129,0.3)",
                backgroundColor: "rgba(16,185,129,0.06)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Globe size={16} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)" }}>
                      Landing page ready
                    </p>
                    <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: "2px" }}>
                      Self-contained HTML · brand-styled · responsive
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <a
                    href={adsAPI.websitePreviewUrl(id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "5px",
                      padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600,
                      backgroundColor: "var(--color-accent)", color: "#fff",
                      textDecoration: "none", border: "none",
                    }}
                  >
                    <Eye size={13} /> Preview
                  </a>
                  <a
                    href={adsAPI.websiteDownloadUrl(id)}
                    download="landing-page.html"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "5px",
                      padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600,
                      border: "1px solid var(--color-card-border)",
                      backgroundColor: "var(--color-card-bg)", color: "var(--color-input-text)",
                      textDecoration: "none",
                    }}
                  >
                    <Download size={13} /> Download
                  </a>
                </div>
              </div>
            )}
          </SectionCard>
        )}

        {/* ── Publish action ────────────────────────────────────────────────── */}
        {ad.status === "approved" && (
          <SectionCard
            title="Publish Campaign"
            subtitle="Campaign has been approved — ready to go live"
          >
            {pubError && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "16px" }}>
                <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{pubError}</p>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <ActionButton onClick={handlePublish} loading={pubLoading} icon={<Zap size={14} />}>
                {pubLoading ? "Publishing…" : "Publish Campaign"}
              </ActionButton>
              {pubLoading && <InlineProgress progress={genProgress.progress} />}
            </div>
          </SectionCard>
        )}

        {/* Analytics link */}
        {isPublished && (
          <SectionCard title="Analytics" subtitle="Campaign is live — view performance data">
            <Link to="/admin/analytics" className="btn--accent" style={{ display: "inline-flex" }}>
              View Analytics
            </Link>
          </SectionCard>
        )}

        {/* Reload button */}
        <div style={{ paddingBottom: "32px", display: "flex", gap: "10px" }}>
          <button
            onClick={() => { setLoading(true); load(); }}
            className="btn--ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
          <button onClick={() => navigate(-1)} className="btn--ghost">Back</button>
        </div>

      </div>
    </PageWithSidebar>
  );
}