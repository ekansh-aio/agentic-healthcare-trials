/**
 * M13: Ethics Manager Dashboard
 * Owner: Frontend Dev 3
 * Dependencies: adsAPI, documentsAPI
 *
 * Ethics review is the mandatory step between Project Manager strategy approval
 * and publishing. Campaigns only appear here once a PM has approved the strategy
 * (status === "ethics_review"). Approving sets status → "approved" (ready to
 * publish). Requesting revision sets status → "under_review" (back to PM queue).
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  PageWithSidebar, SectionCard, MetricSummaryCard, CampaignStatusBadge,
} from "../shared/Layout";
import PreviewPanel from "../shared/PreviewPanel";
import { adsAPI, documentsAPI } from "../../services/api";
import {
  Shield, FileText, AlertTriangle, CheckCircle2, RotateCcw,
  ChevronDown, ChevronUp, Megaphone, Users, MessageSquare,
  List, TrendingUp, Eye, Clock, CheckSquare, Square,
  AlertCircle, Loader2, BookOpen, X, Plus, Sparkles,
  Globe, Image, Type, Hash, RefreshCw, ChevronRight,
} from "lucide-react";

// ─── Ethics checklist items (clinical-trial specific) ─────────────────────────

const ETHICS_CRITERIA = [
  { id: "consent",    label: "Participant consent language is clear and non-coercive" },
  { id: "audience",   label: "Target audience criteria are clinically appropriate" },
  { id: "claims",     label: "No misleading or exaggerated efficacy claims" },
  { id: "vulnerable", label: "Vulnerable population safeguards are addressed" },
  { id: "safety",     label: "Safety and emergency contact information is included" },
  { id: "reg",        label: "Trial registration (e.g. ClinicalTrials.gov ID) is referenced" },
  { id: "privacy",    label: "Data handling and privacy commitments are disclosed" },
  { id: "incentive",  label: "Financial incentives do not compromise voluntary consent" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DONUT_PALETTE = [
  "var(--color-accent)", "#6366f1", "#f59e0b", "#ec4899",
  "#14b8a6", "#8b5cf6", "#f97316", "#0ea5e9",
];

function detectKpiCategory(text) {
  const t = (text ?? "").toLowerCase();
  if (/ctr|click.through|click.rate/.test(t))  return { label: "CTR",    color: "#6366f1" };
  if (/cpa|cost.per.acq|cost per acq/.test(t)) return { label: "CPA",    color: "#f59e0b" };
  if (/roas|return.on.ad/.test(t))             return { label: "ROAS",   color: "#14b8a6" };
  if (/impression|reach|awareness/.test(t))    return { label: "REACH",  color: "#8b5cf6" };
  if (/conversion|convert/.test(t))            return { label: "CVR",    color: "#ec4899" };
  if (/engag/.test(t))                         return { label: "ENG",    color: "#f97316" };
  if (/revenue|roi|return on invest/.test(t))  return { label: "ROI",    color: "#0ea5e9" };
  if (/bounce/.test(t))                        return { label: "BOUNCE", color: "#ef4444" };
  if (/open rate|email/.test(t))               return { label: "EMAIL",  color: "#22c55e" };
  if (/lead/.test(t))                          return { label: "LEADS",  color: "#a78bfa" };
  if (/view|video|watch/.test(t))              return { label: "VIDEO",  color: "#fb923c" };
  return null;
}

function extractNumber(str) {
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

function Tag({ children }) {
  return (
    <span style={{
      display: "inline-block",
      backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
      color: "var(--color-accent)",
      border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.2)",
      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 500,
      marginRight: 4, marginBottom: 4,
    }}>
      {children}
    </span>
  );
}

function ReviewHistoryBadge({ status }) {
  const map = {
    approved: { bg: "#f0fdf4", border: "#86efac", color: "#16a34a", label: "Approved" },
    revision:  { bg: "#fff7ed", border: "#fed7aa", color: "#ea580c", label: "Revision Requested" },
    rejected:  { bg: "#fef2f2", border: "#fca5a5", color: "#dc2626", label: "Rejected" },
    pending:   { bg: "#f9fafb", border: "#e5e7eb", color: "#6b7280", label: "Pending" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 6, fontSize: "0.7rem", fontWeight: 600,
      backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

// ─── Collapsible strategy section ─────────────────────────────────────────────

function StrategySection({ icon: Icon, title, children, isOpen, onToggle }) {
  return (
    <div style={{ border: "1px solid var(--color-card-border)", borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", background: "var(--color-input-bg)",
          border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <Icon size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-input-text)", flex: 1 }}>{title}</span>
        {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {isOpen && (
        <div style={{ padding: "12px 14px", fontSize: 13 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function ContentPlanTable({ items }) {
  const rows = Array.isArray(items) ? items : Object.values(items);
  if (!rows.length) return null;
  const PREFERRED_ORDER = ["channel", "format", "frequency", "example"];
  const allKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const cols = [...PREFERRED_ORDER.filter((k) => allKeys.includes(k)), ...allKeys.filter((k) => !PREFERRED_ORDER.includes(k))];
  const mainCols = cols.filter((k) => k !== "example");
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
        <thead>
          <tr>
            {mainCols.map((col) => (
              <th key={col} style={{ padding: "5px 10px", textAlign: "left", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)", borderBottom: "1px solid var(--color-card-border)" }}>
                {col.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "transparent" : "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.03)" }}>
              {mainCols.map((col) => (
                <td key={col} style={{ padding: "7px 10px", color: "var(--color-input-text)", borderBottom: "1px solid var(--color-card-border)", lineHeight: 1.5 }}>
                  {String(row[col] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuantKpiChart({ kpis }) {
  const normalized = kpis.map((k) => typeof k === "string" ? { metric: k, target: null, context: null } : k);
  const nums = normalized.map((k) => extractNumber(k.target) ?? 0);
  const maxVal = Math.max(...nums, 1);
  const BAR_MAX = 72, BAR_MIN = 24;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, paddingBottom: 0, borderBottom: "2px solid var(--color-card-border)" }}>
        {normalized.map((k, i) => {
          const cat = detectKpiCategory(k.metric);
          const color = cat?.color ?? DONUT_PALETTE[i % DONUT_PALETTE.length];
          const barH = nums[i] === 0 ? BAR_MIN : BAR_MIN + ((nums[i] / maxVal) * (BAR_MAX - BAR_MIN));
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 800, color }}>{k.target}</span>
              <div style={{ width: "100%", height: barH, borderRadius: "4px 4px 0 0", background: `linear-gradient(180deg, ${color}dd 0%, ${color}55 100%)` }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, paddingTop: 5 }}>
        {normalized.map((k, i) => {
          const cat = detectKpiCategory(k.metric);
          const color = cat?.color ?? DONUT_PALETTE[i % DONUT_PALETTE.length];
          return (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <p style={{ fontSize: "0.68rem", fontWeight: 700, color, margin: 0 }}>{k.metric}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StrategyViewer({ strategy }) {
  const [openSection, setOpenSection] = useState(null);
  const toggle = (key) => setOpenSection((prev) => (prev === key ? null : key));
  if (!strategy) return <p style={{ fontSize: 13, color: "var(--color-sidebar-text)" }}>No strategy generated yet.</p>;
  const s = strategy;
  return (
    <div>
      <StrategySection icon={Megaphone} title="Executive Summary" isOpen={openSection === "summary"} onToggle={() => toggle("summary")}>
        <p style={{ color: "var(--color-input-text)", lineHeight: 1.7 }}>{s.executive_summary}</p>
      </StrategySection>
      {s.target_audience && (
        <StrategySection icon={Users} title="Target Audience" isOpen={openSection === "audience"} onToggle={() => toggle("audience")}>
          {[["PRIMARY", s.target_audience.primary], ["SECONDARY", s.target_audience.secondary], ["DEMOGRAPHICS", s.target_audience.demographics]]
            .filter(([, v]) => v).map(([label, text]) => (
              <div key={label} style={{ marginBottom: 10 }}>
                <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", marginBottom: 3, color: "var(--color-sidebar-text)" }}>{label}</p>
                <p style={{ color: "var(--color-input-text)", lineHeight: 1.6 }}>{text}</p>
              </div>
            ))}
        </StrategySection>
      )}
      {s.messaging && (
        <StrategySection icon={MessageSquare} title="Messaging" isOpen={openSection === "messaging"} onToggle={() => toggle("messaging")}>
          {s.messaging.core_message && (
            <div style={{ background: "var(--color-accent-subtle)", borderLeft: "3px solid var(--color-accent)", padding: "10px 14px", borderRadius: 6, marginBottom: 12, fontStyle: "italic", color: "var(--color-accent-text)", fontWeight: 500, lineHeight: 1.6 }}>
              "{s.messaging.core_message}"
            </div>
          )}
          {s.messaging.tone && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", marginBottom: 3, color: "var(--color-sidebar-text)" }}>TONE</p>
              <p style={{ color: "var(--color-input-text)", lineHeight: 1.6 }}>{s.messaging.tone}</p>
            </div>
          )}
          {s.messaging.key_differentiators?.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 5 }}>
              {s.messaging.key_differentiators.map((d, i) => (
                <li key={i} style={{ color: "var(--color-input-text)", lineHeight: 1.6 }}>{d}</li>
              ))}
            </ul>
          )}
        </StrategySection>
      )}
      {s.content_plan?.length > 0 && (
        <StrategySection icon={List} title={`Content Plan (${s.content_plan.length} items)`} isOpen={openSection === "content"} onToggle={() => toggle("content")}>
          <ContentPlanTable items={s.content_plan} />
        </StrategySection>
      )}
      {s.kpis?.length > 0 && (
        <StrategySection icon={TrendingUp} title={`KPIs (${s.kpis.length})`} isOpen={openSection === "kpis"} onToggle={() => toggle("kpis")}>
          <QuantKpiChart kpis={s.kpis} />
        </StrategySection>
      )}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function EthicsDashboard() {
  const [ads,      setAds]      = useState([]);
  const [docs,     setDocs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [tab,      setTab]      = useState("review"); // "review" | "optimizations" | "documents" | "preview"

  // Right panel sub-tab
  const [panelTab, setPanelTab] = useState("strategy"); // "strategy" | "checklist" | "history"

  // Review form state
  const [checklist,    setChecklist]    = useState({});
  const [comments,     setComments]     = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState("");

  // Review history for selected campaign
  const [reviews,      setReviews]      = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Optimizer changes tab
  const [optChanges,      setOptChanges]      = useState([]);  // grouped by ad
  const [optLoading,      setOptLoading]      = useState(false);
  const [optActing,       setOptActing]       = useState({});  // { adId: "approving"|"rejecting" }

  // Documents tab
  const [docForm, setDocForm] = useState({ title: "", content: "" });
  const [savingDoc, setSavingDoc] = useState(false);

  const loadOptChanges = useCallback(() => {
    setOptLoading(true);
    adsAPI.listOptimizerChanges()
      .then(setOptChanges)
      .catch(console.error)
      .finally(() => setOptLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "optimizations") loadOptChanges();
  }, [tab, loadOptChanges]);

  const handleOptApprove = async (adId, reviewIds) => {
    setOptActing((p) => ({ ...p, [adId]: "approving" }));
    try {
      await adsAPI.approveOptimizerChanges(adId, reviewIds);
      loadOptChanges();
    } catch (err) { alert(err.message); }
    finally { setOptActing((p) => ({ ...p, [adId]: null })); }
  };

  const handleOptReject = async (adId, reviewIds) => {
    setOptActing((p) => ({ ...p, [adId]: "rejecting" }));
    try {
      await adsAPI.rejectOptimizerChanges(adId, reviewIds);
      loadOptChanges();
    } catch (err) { alert(err.message); }
    finally { setOptActing((p) => ({ ...p, [adId]: null })); }
  };

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([adsAPI.list(), documentsAPI.list("ethical_guideline")])
      .then(([adList, docList]) => { setAds(adList); setDocs(docList); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // When a campaign is selected, load its review history
  useEffect(() => {
    if (!selected) { setReviews([]); return; }
    setReviewsLoading(true);
    adsAPI.listReviews(selected.id)
      .then(setReviews)
      .catch(console.error)
      .finally(() => setReviewsLoading(false));
  }, [selected?.id]);

  const handleSelectCampaign = (ad) => {
    setSelected(ad);
    setPanelTab("strategy");
    setChecklist({});
    setComments("");
    setSubmitError("");
  };

  const allCriteriaMet = ETHICS_CRITERIA.every((c) => checklist[c.id]);

  const handleSubmit = async (decision) => {
    // Revision requires a comment
    if (decision === "revision" && !comments.trim()) {
      setSubmitError("Please provide comments explaining what needs to be revised.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      await adsAPI.createReview(selected.id, {
        review_type: "ethics",
        status: decision,
        comments: comments.trim() || null,
        suggestions: { checklist },
      });
      // Reload data and clear panel
      loadData();
      setSelected(null);
      setChecklist({});
      setComments("");
    } catch (err) {
      setSubmitError(err.message || "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  };

  // Derived counts
  const awaitingReview = ads.filter((a) => a.status === "ethics_review");
  const approvedToday  = ads.filter((a) => a.status === "approved");
  const underRevision  = ads.filter((a) => a.status === "under_review");

  return (
    <PageWithSidebar>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Ethics Review</h1>
          <p className="page-header__subtitle">
            Review and approve marketing strategies for clinical trial compliance before publishing
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricSummaryCard label="Awaiting Ethics Review" value={loading ? "—" : awaitingReview.length} icon={Shield} />
        <MetricSummaryCard label="Approved for Publishing" value={loading ? "—" : approvedToday.length} icon={CheckCircle2} />
        <MetricSummaryCard label="Sent for Revision" value={loading ? "—" : underRevision.length} icon={RotateCcw} />
      </div>

      {/* Main tab bar */}
      <div className="flex gap-2 mb-6">
        {[
          { key: "review",        label: "Ethics Review",      icon: Shield },
          { key: "optimizations", label: "Optimizations",      icon: Sparkles, badge: optChanges.reduce((s, g) => s + g.changes.length, 0) || null },
          { key: "documents",     label: "Ethical Guidelines", icon: BookOpen },
          { key: "preview",       label: "Ad Preview",         icon: Eye },
        ].map(({ key, label, icon: Icon, badge }) => (
          <button key={key} onClick={() => setTab(key)} className={tab === key ? "filter-tab--active" : "filter-tab"} style={{ position: "relative" }}>
            <Icon size={13} style={{ display: "inline", marginRight: 5 }} />{label}
            {badge ? (
              <span style={{ marginLeft: 6, fontSize: "0.62rem", fontWeight: 800, background: "#f59e0b", color: "#fff", borderRadius: 999, padding: "1px 6px" }}>{badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Optimizations tab ────────────────────────────────────────────────── */}
      {tab === "optimizations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {optLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--color-accent)" }} />
            </div>
          ) : optChanges.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "72px 24px", gap: 14,
              borderRadius: 14, border: "1px dashed var(--color-card-border)",
              background: "var(--color-card-bg)",
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: "50%",
                background: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Sparkles size={22} style={{ color: "var(--color-accent)" }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ margin: "0 0 4px", fontSize: "0.92rem", fontWeight: 700, color: "var(--color-input-text)" }}>All clear</p>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-muted)", maxWidth: 320 }}>
                  No pending optimizer changes. When the AI optimizer suggests updates, they'll appear here for your review.
                </p>
              </div>
            </div>
          ) : optChanges.map((group) => {
            const acting = optActing[group.ad_id];
            const allIds = group.changes.map((c) => c.review_id);
            const changeCount = group.changes.length;
            return (
              <div key={group.ad_id} style={{
                borderRadius: 14, border: "1px solid var(--color-card-border)",
                background: "var(--color-card-bg)",
                overflow: "hidden",
              }}>
                {/* ── Card header ── */}
                <div style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid var(--color-card-border)",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                      background: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Sparkles size={15} style={{ color: "var(--color-accent)" }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {group.ad_title}
                      </p>
                      <p style={{ margin: 0, fontSize: "0.73rem", color: "var(--color-muted)" }}>
                        {changeCount} pending change{changeCount !== 1 ? "s" : ""} from AI optimizer
                      </p>
                    </div>
                  </div>
                  <span style={{
                    fontSize: "0.7rem", fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                    background: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
                    color: "var(--color-sidebar-text-active)", flexShrink: 0,
                    border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)",
                  }}>
                    {changeCount} change{changeCount !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* ── Change list ── */}
                <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {group.changes.map((change, idx) => {
                    const sugg = change.suggestions || {};
                    const isField    = !!sugg.field;
                    const isCreative = sugg.action === "regenerate_creative";
                    const isWebsite  = sugg.action === "regenerate_website";

                    const typeLabel = isCreative ? "Creative" : isWebsite ? "Website" : (sugg.field || "Change").replace(/_/g, " ");
                    const accentBorder = "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.2)";
                    const accentBg     = "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.04)";

                    return (
                      <div key={change.review_id} style={{
                        borderRadius: 10,
                        border: "1px solid var(--color-card-border)",
                        background: "var(--color-page-bg)",
                        overflow: "hidden",
                      }}>
                        {/* Change header row */}
                        <div style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "10px 14px",
                          borderBottom: isField && sugg.new_value ? "1px solid var(--color-card-border)" : "none",
                        }}>
                          <div style={{
                            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                            background: "var(--color-accent)",
                          }} />
                          <span style={{
                            fontSize: "0.66rem", fontWeight: 800, textTransform: "uppercase",
                            letterSpacing: "0.04em", color: "var(--color-sidebar-text-active)", flexShrink: 0,
                          }}>
                            {typeLabel}
                          </span>
                          <p style={{
                            margin: 0, fontSize: "0.82rem", fontWeight: 500,
                            color: "var(--color-input-text)", flex: 1,
                          }}>
                            {change.comments}
                          </p>
                        </div>

                        {/* Diff block — field changes only */}
                        {isField && sugg.new_value && (
                          <div style={{ display: "grid", gridTemplateColumns: sugg.old_value ? "1fr 1fr" : "1fr" }}>
                            {sugg.old_value && (
                              <div style={{
                                padding: "10px 14px",
                                borderRight: "1px solid var(--color-card-border)",
                                background: "rgba(239,68,68,0.04)",
                              }}>
                                <p style={{
                                  margin: "0 0 5px", fontSize: "0.65rem", fontWeight: 700,
                                  textTransform: "uppercase", letterSpacing: "0.05em",
                                  color: "var(--color-muted)", display: "flex", alignItems: "center", gap: 4,
                                }}>
                                  <span>−</span> Before
                                </p>
                                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--color-sidebar-text)", lineHeight: 1.55, textDecoration: "line-through", opacity: 0.7 }}>
                                  {sugg.old_value}
                                </p>
                              </div>
                            )}
                            <div style={{
                              padding: "10px 14px",
                              background: accentBg,
                            }}>
                              <p style={{
                                margin: "0 0 5px", fontSize: "0.65rem", fontWeight: 700,
                                textTransform: "uppercase", letterSpacing: "0.05em",
                                color: "var(--color-sidebar-text-active)", display: "flex", alignItems: "center", gap: 4,
                              }}>
                                <span>+</span> After
                              </p>
                              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--color-input-text)", lineHeight: 1.55 }}>
                                {sugg.new_value}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Action note for creative/website changes */}
                        {(isCreative || isWebsite) && (
                          <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                            <AlertCircle size={12} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
                            <p style={{ margin: 0, fontSize: "0.76rem", color: "var(--color-muted)" }}>
                              {isCreative
                                ? "New creative images will be uploaded to Meta on approval."
                                : "New website HTML will go live on approval."}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Action footer ── */}
                <div style={{
                  padding: "14px 20px",
                  borderTop: "1px solid var(--color-card-border)",
                  background: "var(--color-page-bg)",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <button
                    onClick={() => handleOptApprove(group.ad_id, allIds)}
                    disabled={!!acting}
                    className="btn--accent"
                    style={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      opacity: acting && acting !== "approving" ? 0.45 : 1,
                      cursor: acting ? "not-allowed" : "pointer",
                    }}
                  >
                    {acting === "approving"
                      ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Deploying…</>
                      : <><CheckCircle2 size={14} /> Approve &amp; Deploy All</>}
                  </button>
                  <button
                    onClick={() => handleOptReject(group.ad_id, allIds)}
                    disabled={!!acting}
                    className="btn--ghost"
                    style={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      opacity: acting && acting !== "rejecting" ? 0.45 : 1,
                      cursor: acting ? "not-allowed" : "pointer",
                      color: "var(--color-muted)",
                    }}
                  >
                    {acting === "rejecting"
                      ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Reverting…</>
                      : <><X size={13} /> Reject &amp; Revert All</>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Ethics Review tab ─────────────────────────────────────────────────── */}
      {tab === "review" && (
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20, alignItems: "start" }}>

          {/* ── Campaign queue ── */}
          <div>
            <SectionCard
              title="Pending Ethics Review"
              subtitle={loading ? "Loading…" : `${awaitingReview.length} campaign${awaitingReview.length !== 1 ? "s" : ""} awaiting review`}
            >
              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                  <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "var(--color-accent)" }} />
                </div>
              ) : awaitingReview.length === 0 ? (
                <div className="empty-state" style={{ padding: "32px 16px" }}>
                  <CheckCircle2 size={36} className="empty-state__icon" />
                  <p className="empty-state__text">All caught up — no campaigns awaiting ethics review</p>
                  <p className="empty-state__hint">Campaigns arrive here once the Project Manager approves the strategy</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {awaitingReview.map((ad) => {
                    const isSelected = selected?.id === ad.id;
                    return (
                      <div
                        key={ad.id}
                        onClick={() => handleSelectCampaign(ad)}
                        style={{
                          padding: "12px 16px",
                          borderBottom: "1px solid var(--color-card-border)",
                          cursor: "pointer",
                          borderRadius: 8,
                          marginBottom: 2,
                          backgroundColor: isSelected
                            ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.08)"
                            : "transparent",
                          outline: isSelected ? "2px solid var(--color-accent)" : "none",
                          outlineOffset: -2,
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "var(--color-input-bg)"; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 700, fontSize: 13, color: "var(--color-input-text)", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {ad.title}
                            </p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginBottom: 4 }}>
                              {ad.platforms?.map((p) => <Tag key={p}>{p}</Tag>)}
                            </div>
                            <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--color-sidebar-text)" }}>
                              {ad.budget && <span>${ad.budget.toLocaleString()}</span>}
                              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                <Clock size={10} />
                                {new Date(ad.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            </div>
                          </div>
                          <CampaignStatusBadge status={ad.status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* Informational note */}
            <div style={{
              marginTop: 12, padding: "12px 14px", borderRadius: 8,
              backgroundColor: "#eff6ff", border: "1px solid #bfdbfe",
              fontSize: "0.75rem", color: "#1e40af", lineHeight: 1.6,
            }}>
              <p style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <AlertCircle size={12} /> About the Ethics Review Step
              </p>
              Campaigns arrive here after the Project Manager approves the strategy.
              Your approval is required before the Publisher can launch the campaign.
              Requesting revision sends it back to the Project Manager queue.
            </div>
          </div>

          {/* ── Review panel ── */}
          {selected ? (
            <div>
              {/* Campaign header card */}
              <div style={{
                padding: "16px 20px", borderRadius: 10, marginBottom: 14,
                border: "1px solid var(--color-card-border)",
                backgroundColor: "var(--color-card-bg)",
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <h2 style={{ fontWeight: 800, fontSize: "1rem", color: "var(--color-input-text)", margin: 0 }}>
                      {selected.title}
                    </h2>
                    <CampaignStatusBadge status={selected.status} />
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: "0.78rem", color: "var(--color-sidebar-text)" }}>
                    {selected.ad_type && (
                      <span>Types: {Array.isArray(selected.ad_type) ? selected.ad_type.join(", ") : selected.ad_type}</span>
                    )}
                    {selected.budget && <span>Budget: ${selected.budget.toLocaleString()}</span>}
                    {selected.target_patient_count && <span>Target patients: {selected.target_patient_count}</span>}
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", padding: 4, display: "flex", borderRadius: 6 }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Panel sub-tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
                {[
                  { key: "strategy",  label: "Strategy",         icon: Megaphone },
                  { key: "checklist", label: "Ethics Checklist",  icon: CheckSquare },
                  { key: "history",   label: "Review History",    icon: Clock },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setPanelTab(key)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "7px 14px", borderRadius: 8, fontSize: "0.8rem", fontWeight: 600,
                      border: "1px solid",
                      borderColor: panelTab === key ? "var(--color-accent)" : "var(--color-card-border)",
                      backgroundColor: panelTab === key ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.08)" : "transparent",
                      color: panelTab === key ? "var(--color-accent)" : "var(--color-sidebar-text)",
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>

              {/* ── Strategy sub-tab ── */}
              {panelTab === "strategy" && (
                <SectionCard title="Marketing Strategy" subtitle="Review the strategy submitted for ethics approval">
                  <StrategyViewer strategy={selected.strategy_json} />
                </SectionCard>
              )}

              {/* ── Ethics checklist sub-tab ── */}
              {panelTab === "checklist" && (
                <SectionCard title="Ethics Compliance Checklist" subtitle="Tick each criterion you have verified">
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                    {ETHICS_CRITERIA.map((c) => {
                      const checked = !!checklist[c.id];
                      return (
                        <label
                          key={c.id}
                          style={{
                            display: "flex", alignItems: "flex-start", gap: 10,
                            padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                            border: "1px solid",
                            borderColor: checked ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.3)" : "var(--color-card-border)",
                            backgroundColor: checked ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.05)" : "transparent",
                            transition: "all 0.12s",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setChecklist((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                            style={{ display: "none" }}
                          />
                          <div style={{ flexShrink: 0, marginTop: 1 }}>
                            {checked
                              ? <CheckSquare size={16} color="var(--color-accent)" />
                              : <Square size={16} color="var(--color-sidebar-text)" />}
                          </div>
                          <span style={{
                            fontSize: "0.82rem", lineHeight: 1.5,
                            color: checked ? "var(--color-input-text)" : "var(--color-sidebar-text)",
                            fontWeight: checked ? 600 : 400,
                          }}>
                            {c.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Progress indicator */}
                  {(() => {
                    const count = Object.values(checklist).filter(Boolean).length;
                    const total = ETHICS_CRITERIA.length;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--color-sidebar-text)", marginBottom: 4 }}>
                          <span>{count} of {total} criteria verified</span>
                          <span style={{ color: pct === 100 ? "var(--color-accent)" : "var(--color-sidebar-text)", fontWeight: 600 }}>
                            {pct === 100 ? "✓ All criteria met" : `${pct}%`}
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, backgroundColor: "var(--color-card-border)", overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 999,
                            width: `${pct}%`,
                            backgroundColor: pct === 100 ? "var(--color-accent)" : "#f59e0b",
                            transition: "width 0.3s ease",
                          }} />
                        </div>
                      </div>
                    );
                  })()}

                  {!allCriteriaMet && (
                    <div style={{
                      padding: "10px 12px", borderRadius: 8, fontSize: "0.78rem",
                      backgroundColor: "#fff7ed", border: "1px solid #fed7aa", color: "#92400e",
                      display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 16,
                    }}>
                      <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                      Complete all checklist items to approve. You can still request a revision without completing the checklist.
                    </div>
                  )}
                </SectionCard>
              )}

              {/* ── History sub-tab ── */}
              {panelTab === "history" && (
                <SectionCard title="Review History" subtitle="All reviews submitted for this campaign">
                  {reviewsLoading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                      <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--color-accent)" }} />
                    </div>
                  ) : reviews.filter((r) => !r.comments?.startsWith("[system]")).length === 0 ? (
                    <div className="empty-state" style={{ padding: "24px 16px" }}>
                      <Clock size={32} className="empty-state__icon" />
                      <p className="empty-state__text">No reviews submitted yet</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {reviews
                        .filter((r) => !r.comments?.startsWith("[system]"))
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                        .map((r) => (
                          <div key={r.id} style={{
                            padding: "12px 14px", borderRadius: 8,
                            border: "1px solid var(--color-card-border)",
                            backgroundColor: "var(--color-input-bg)",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{
                                  padding: "2px 8px", borderRadius: 6, fontSize: "0.7rem",
                                  fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                                  backgroundColor: r.review_type === "ethics" ? "#f0fdf4" : "#eff6ff",
                                  color: r.review_type === "ethics" ? "#16a34a" : "#1d4ed8",
                                  border: `1px solid ${r.review_type === "ethics" ? "#86efac" : "#bfdbfe"}`,
                                }}>
                                  {r.review_type} review
                                </span>
                                <ReviewHistoryBadge status={r.status} />
                              </div>
                              <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                                {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            {r.comments && (
                              <p style={{ fontSize: "0.8rem", color: "var(--color-input-text)", lineHeight: 1.6, margin: 0 }}>
                                {r.comments}
                              </p>
                            )}
                            {r.suggestions?.checklist && (
                              <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: 5 }}>
                                Ethics criteria checked: {Object.values(r.suggestions.checklist).filter(Boolean).length} / {ETHICS_CRITERIA.length}
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </SectionCard>
              )}

              {/* ── Decision panel (always visible at the bottom) ── */}
              <div style={{
                marginTop: 14, padding: "18px 20px", borderRadius: 10,
                border: "1px solid var(--color-card-border)",
                backgroundColor: "var(--color-card-bg)",
              }}>
                <p style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--color-input-text)", marginBottom: 12 }}>
                  Submit Ethics Decision
                </p>

                <textarea
                  value={comments}
                  onChange={(e) => { setComments(e.target.value); setSubmitError(""); }}
                  rows={3}
                  placeholder="Comments — ethical observations, compliance issues, or reason for revision (required when requesting revision)…"
                  className="field-textarea"
                  style={{ marginBottom: 12 }}
                />

                {submitError && (
                  <div style={{
                    padding: "8px 12px", borderRadius: 7, marginBottom: 12,
                    backgroundColor: "#fef2f2", border: "1px solid #fca5a5",
                    fontSize: "0.78rem", color: "#dc2626", display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <AlertCircle size={12} /> {submitError}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  {/* Approve — requires all checklist items ticked */}
                  <button
                    onClick={() => handleSubmit("approved")}
                    disabled={submitting || !allCriteriaMet}
                    style={{
                      flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                      padding: "10px 16px", borderRadius: 8, border: "none",
                      backgroundColor: allCriteriaMet ? "var(--color-accent)" : "var(--color-card-border)",
                      color: allCriteriaMet ? "#fff" : "var(--color-sidebar-text)",
                      fontWeight: 700, fontSize: "0.875rem", fontFamily: "inherit",
                      cursor: (submitting || !allCriteriaMet) ? "not-allowed" : "pointer",
                      opacity: submitting ? 0.7 : 1,
                      transition: "all 0.15s",
                    }}
                    title={!allCriteriaMet ? "Complete all checklist items in the Ethics Checklist tab to approve" : ""}
                  >
                    {submitting
                      ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Submitting…</>
                      : <><CheckCircle2 size={15} /> Approve for Publishing</>}
                  </button>

                  {/* Request revision */}
                  <button
                    onClick={() => handleSubmit("revision")}
                    disabled={submitting}
                    style={{
                      flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                      padding: "10px 16px", borderRadius: 8,
                      border: "1px solid #f97316", backgroundColor: "transparent",
                      color: "#f97316", fontWeight: 700, fontSize: "0.875rem", fontFamily: "inherit",
                      cursor: submitting ? "not-allowed" : "pointer",
                      opacity: submitting ? 0.7 : 1,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { if (!submitting) { e.currentTarget.style.backgroundColor = "#f97316"; e.currentTarget.style.color = "#fff"; }}}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#f97316"; }}
                  >
                    <RotateCcw size={14} /> Request Revision
                  </button>
                </div>

                {!allCriteriaMet && (
                  <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: 8, textAlign: "center" }}>
                    Complete all items in the{" "}
                    <button onClick={() => setPanelTab("checklist")} style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", fontWeight: 600, fontSize: "inherit", padding: 0 }}>
                      Ethics Checklist
                    </button>
                    {" "}to enable approval.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              minHeight: 400, borderRadius: 10, border: "1px dashed var(--color-card-border)",
              color: "var(--color-sidebar-text)", textAlign: "center", padding: 32,
            }}>
              <Shield size={48} style={{ marginBottom: 12, opacity: 0.25 }} />
              <p style={{ fontWeight: 600, fontSize: "0.875rem", margin: "0 0 6px" }}>
                Select a campaign to begin ethics review
              </p>
              <p style={{ fontSize: "0.78rem", lineHeight: 1.6, maxWidth: 300 }}>
                Choose a campaign from the queue on the left to review its marketing strategy and assess ethical compliance.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Ad Preview tab ─────────────────────────────────────────────────────── */}
      {tab === "preview" && <PreviewPanel ads={ads} />}

      {/* ── Ethical Guidelines tab ─────────────────────────────────────────────── */}
      {tab === "documents" && (
        <div className="space-y-6">
          <SectionCard title="Add Ethical Guideline" subtitle="Upload compliance notes and review references for your team">
            <div className="space-y-4">
              <input
                placeholder="Document Title *"
                value={docForm.title}
                onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))}
                className="field-input"
              />
              <textarea
                placeholder="Content — compliance notes, ethical review criteria, internal policies…"
                rows={5}
                value={docForm.content}
                onChange={(e) => setDocForm((p) => ({ ...p, content: e.target.value }))}
                className="field-textarea"
              />
              <button
                onClick={async () => {
                  if (!docForm.title.trim()) return;
                  setSavingDoc(true);
                  try {
                    const doc = await documentsAPI.create({ doc_type: "ethical_guideline", title: docForm.title, content: docForm.content });
                    setDocs((p) => [...p, doc]);
                    setDocForm({ title: "", content: "" });
                  } catch (err) { alert(err.message); }
                  finally { setSavingDoc(false); }
                }}
                disabled={!docForm.title.trim() || savingDoc}
                className="btn btn--primary"
              >
                {savingDoc ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite", display: "inline", marginRight: 6 }} />Saving…</> : <><Plus size={14} style={{ display: "inline", marginRight: 5 }} />Save Guideline</>}
              </button>
            </div>
          </SectionCard>

          <SectionCard title={`Existing Guidelines (${docs.length})`}>
            {docs.length === 0 ? (
              <div className="empty-state">
                <FileText size={32} className="empty-state__icon" />
                <p className="empty-state__text">No ethical guidelines added yet</p>
              </div>
            ) : (
              docs.map((doc) => (
                <div key={doc.id} className="table-row px-1">
                  <div>
                    <p className="table-row__title">{doc.title}</p>
                    <p className="table-row__meta mt-1" style={{ lineClamp: 2 }}>{doc.content}</p>
                  </div>
                </div>
              ))
            )}
          </SectionCard>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </PageWithSidebar>
  );
}
