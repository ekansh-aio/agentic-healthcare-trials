/**
 * M13: Ethics Reviewer Dashboard
 * Owner: Frontend Dev 3
 * Dependencies: adsAPI, documentsAPI
 *
 * Ethical analysis of strategies, request strategy redesign,
 * update ethical reference documents and compliance docs.
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  PageWithSidebar, SectionCard, MetricSummaryCard, CampaignStatusBadge,
} from "../shared/Layout";
import PreviewPanel from "../shared/PreviewPanel";
import { adsAPI, documentsAPI } from "../../services/api";
import {
  Shield, FileText, AlertTriangle, CheckCircle, RotateCcw,
  ChevronDown, ChevronUp, Megaphone, Users, MessageSquare,
  List, TrendingUp, Eye,
} from "lucide-react";

// ─── Palette + KPI helpers (mirrors ReviewDetailPage) ────────────────────────

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

// ─── Platform tag ─────────────────────────────────────────────────────────────

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

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  const bar = (w, h = 12) => ({
    height: h, width: w, borderRadius: 4,
    backgroundColor: "var(--color-card-border)",
  });
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 130px 75px 100px 100px",
      alignItems: "center",
      padding: "14px 16px",
      borderBottom: "1px solid var(--color-border, #e5e7eb)",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={bar("58%", 13)} />
        <div style={bar("30%", 11)} />
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <div style={{ ...bar(56, 20), borderRadius: 10 }} />
        <div style={{ ...bar(48, 20), borderRadius: 10 }} />
      </div>
      <div style={bar(44, 13)} />
      <div style={{ ...bar(72, 24), borderRadius: 6 }} />
      <div style={{ ...bar(80, 32), borderRadius: 8 }} />
    </div>
  );
}

// ─── Collapsible strategy section ────────────────────────────────────────────

function StrategySection({ icon: Icon, title, children, isOpen, onToggle }) {
  return (
    <div style={{ border: "1px solid var(--color-border, #e5e7eb)", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", background: "var(--color-card-bg, #f9fafb)",
          border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <Icon size={15} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-input-text, #111)", flex: 1 }}>{title}</span>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {isOpen && (
        <div style={{ padding: "14px 16px", background: "var(--color-surface, #fff)", fontSize: 13 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Content plan table ───────────────────────────────────────────────────────

function ContentPlanTable({ items }) {
  const rows = Array.isArray(items) ? items : Object.values(items);
  const [expandedRow, setExpandedRow] = useState(null);
  if (!rows.length) return null;

  const PREFERRED_ORDER = ["channel", "format", "frequency", "example"];
  const allKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const cols = [
    ...PREFERRED_ORDER.filter((k) => allKeys.includes(k)),
    ...allKeys.filter((k) => !PREFERRED_ORDER.includes(k)),
  ];
  const mainCols = cols.filter((k) => k !== "example");
  const COL_WIDTHS = { channel: "22%", format: "30%", frequency: "22%" };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
        <thead>
          <tr>
            {mainCols.map((col) => (
              <th key={col} style={{
                padding: "6px 12px", textAlign: "left", width: COL_WIDTHS[col],
                fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.06em", color: "var(--color-sidebar-text)",
                borderBottom: "1px solid var(--color-card-border)", whiteSpace: "nowrap",
              }}>
                {col.replace(/_/g, " ")}
              </th>
            ))}
            {cols.includes("example") && (
              <th style={{
                padding: "6px 12px", textAlign: "left", width: "80px",
                fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.06em", color: "var(--color-sidebar-text)",
                borderBottom: "1px solid var(--color-card-border)", whiteSpace: "nowrap",
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
                {mainCols.map((col) => (
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
                  <td colSpan={mainCols.length + 1} style={{ padding: "10px 12px 12px", borderBottom: "1px solid var(--color-card-border)" }}>
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

// ─── KPI bar chart ────────────────────────────────────────────────────────────

function QuantKpiChart({ kpis }) {
  const normalized = kpis.map((k) => typeof k === "string" ? { metric: k, target: null, context: null } : k);
  const nums   = normalized.map((k) => extractNumber(k.target) ?? 0);
  const maxVal = Math.max(...nums, 1);
  const BAR_MAX = 88, BAR_MIN = 28;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, paddingBottom: 0, borderBottom: "2px solid var(--color-card-border)" }}>
        {normalized.map((k, i) => {
          const cat   = detectKpiCategory(k.metric);
          const color = cat?.color ?? DONUT_PALETTE[i % DONUT_PALETTE.length];
          const barH  = nums[i] === 0 ? BAR_MIN : BAR_MIN + ((nums[i] / maxVal) * (BAR_MAX - BAR_MIN));
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: "0.72rem", fontWeight: 800, color, letterSpacing: "0.02em" }}>{k.target}</span>
              <div style={{
                width: "100%", height: barH, borderRadius: "5px 5px 0 0",
                background: `linear-gradient(180deg, ${color}dd 0%, ${color}55 100%)`,
                transition: "height 0.45s ease",
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, paddingTop: 6 }}>
        {normalized.map((k, i) => {
          const cat   = detectKpiCategory(k.metric);
          const color = cat?.color ?? DONUT_PALETTE[i % DONUT_PALETTE.length];
          return (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color, margin: 0 }}>{k.metric}</p>
              {k.context && <p style={{ fontSize: "0.6rem", color: "var(--color-sidebar-text)", margin: "2px 0 0", lineHeight: 1.3 }}>{k.context}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Strategy viewer (collapsible sections) ───────────────────────────────────

function StrategyViewer({ strategy }) {
  const [openSection, setOpenSection] = useState(null);
  const toggle = (key) => setOpenSection((prev) => (prev === key ? null : key));

  if (!strategy) return (
    <p style={{ fontSize: 13, color: "var(--color-sidebar-text)" }}>No strategy generated yet.</p>
  );
  const s = strategy;
  return (
    <div>
      <StrategySection icon={Megaphone} title="Executive Summary" isOpen={openSection === "summary"} onToggle={() => toggle("summary")}>
        <p style={{ color: "var(--color-input-text)", lineHeight: 1.7 }}>{s.executive_summary}</p>
      </StrategySection>

      {s.target_audience && (
        <StrategySection icon={Users} title="Target Audience" isOpen={openSection === "audience"} onToggle={() => toggle("audience")}>
          {[["PRIMARY", s.target_audience.primary], ["SECONDARY", s.target_audience.secondary], ["DEMOGRAPHICS", s.target_audience.demographics]]
            .filter(([, v]) => v)
            .map(([label, text]) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", marginBottom: 4, color: "var(--color-sidebar-text)" }}>{label}</p>
                <p style={{ color: "var(--color-input-text)", lineHeight: 1.6 }}>{text}</p>
              </div>
            ))}
        </StrategySection>
      )}

      {s.messaging && (
        <StrategySection icon={MessageSquare} title="Messaging" isOpen={openSection === "messaging"} onToggle={() => toggle("messaging")}>
          {s.messaging.core_message && (
            <div style={{ background: "var(--color-accent-subtle)", borderLeft: "3px solid var(--color-accent)", padding: "12px 16px", borderRadius: 6, marginBottom: 14, fontStyle: "italic", color: "var(--color-accent-text)", fontWeight: 500, lineHeight: 1.6 }}>
              "{s.messaging.core_message}"
            </div>
          )}
          {s.messaging.tone && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", marginBottom: 4, color: "var(--color-sidebar-text)" }}>TONE</p>
              <p style={{ color: "var(--color-input-text)", lineHeight: 1.6 }}>{s.messaging.tone}</p>
            </div>
          )}
          {s.messaging.key_differentiators?.length > 0 && (
            <div>
              <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", marginBottom: 8, color: "var(--color-sidebar-text)" }}>KEY DIFFERENTIATORS</p>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                {s.messaging.key_differentiators.map((d, i) => (
                  <li key={i} style={{ color: "var(--color-input-text)", lineHeight: 1.6 }}>{d}</li>
                ))}
              </ul>
            </div>
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
  const navigate = useNavigate();
  const [ads,      setAds]      = useState([]);
  const [docs,     setDocs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [tab,      setTab]      = useState("review"); // "review" | "documents" | "preview"
  const [reviewForm, setReviewForm] = useState({ comments: "" });
  const [docForm,    setDocForm]    = useState({ title: "", content: "" });

  useEffect(() => {
    Promise.all([
      adsAPI.list(),
      documentsAPI.list("ethical_guideline"),
    ])
      .then(([adList, docList]) => { setAds(adList); setDocs(docList); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const pendingEthics = ads.filter((a) =>
    ["under_review", "ethics_review", "approved"].includes(a.status)
  );

  const handleEthicsReview = async (status) => {
    if (!selected) return;
    try {
      await adsAPI.createReview(selected.id, {
        review_type: "ethics",
        status,
        comments: reviewForm.comments,
      });
      setSelected(null);
      setReviewForm({ comments: "" });
      adsAPI.list().then(setAds);
    } catch (err) { alert(err.message); }
  };

  const handleAddDoc = async () => {
    try {
      const doc = await documentsAPI.create({
        doc_type: "ethical_guideline",
        title:    docForm.title,
        content:  docForm.content,
      });
      setDocs((p) => [...p, doc]);
      setDocForm({ title: "", content: "" });
    } catch (err) { alert(err.message); }
  };

  return (
    <PageWithSidebar>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Ethics Manager Dashboard</h1>
          <p className="page-header__subtitle">Ensure marketing strategies meet ethical and compliance standards</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricSummaryCard label="Campaigns to Review" value={loading ? "—" : pendingEthics.length}                                  icon={Shield} />
        <MetricSummaryCard label="Ethical Guidelines"  value={loading ? "—" : docs.length}                                           icon={FileText} />
        <MetricSummaryCard label="Flags Raised"        value={loading ? "—" : ads.filter((a) => a.status === "ethics_review").length} icon={AlertTriangle} />
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab("review")}    className={tab === "review"    ? "filter-tab--active" : "filter-tab"}>Ethics Review</button>
        <button onClick={() => setTab("documents")} className={tab === "documents" ? "filter-tab--active" : "filter-tab"}>Document Updation</button>
        <button onClick={() => setTab("preview")}   className={tab === "preview"   ? "filter-tab--active" : "filter-tab"}>Preview</button>
      </div>

      {/* ── Ethics Review tab ── */}
      {tab === "review" && (
        <div className="grid grid-cols-2 gap-6">

          {/* Campaign queue — table layout matching Project Manager */}
          <SectionCard
            title="Campaigns"
            subtitle={loading ? "Loading campaigns…" : `${pendingEthics.length} campaign${pendingEthics.length !== 1 ? "s" : ""} awaiting ethics review`}
          >
            {loading ? (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 75px 100px 100px", padding: "8px 16px", borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
                  {["Campaign", "Platforms", "Budget", "Status", "Action"].map((h) => (
                    <span key={h} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--color-sidebar-text)" }}>{h}</span>
                  ))}
                </div>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : pendingEthics.length === 0 ? (
              <div className="empty-state">
                <Shield size={40} className="empty-state__icon" />
                <p className="empty-state__text">No campaigns pending ethics review</p>
              </div>
            ) : (
              <div>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 75px 100px 100px", padding: "8px 16px", borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
                  {["Campaign", "Platforms", "Budget", "Status", "Action"].map((h) => (
                    <span key={h} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--color-sidebar-text)" }}>{h}</span>
                  ))}
                </div>
                {/* Rows */}
                {pendingEthics.map((ad) => (
                  <div
                    key={ad.id}
                    onClick={() => setSelected(ad)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 130px 75px 100px 100px",
                      alignItems: "center",
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--color-border, #e5e7eb)",
                      cursor: "pointer",
                      transition: "background 0.15s",
                      background: selected?.id === ad.id
                        ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.07)"
                        : "transparent",
                      outline: selected?.id === ad.id
                        ? "2px solid var(--color-accent)"
                        : "none",
                      outlineOffset: -2,
                      borderRadius: selected?.id === ad.id ? 6 : 0,
                    }}
                    onMouseEnter={(e) => { if (selected?.id !== ad.id) e.currentTarget.style.background = "var(--color-card-bg, #f9fafb)"; }}
                    onMouseLeave={(e) => { if (selected?.id !== ad.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Title + date */}
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 14, color: "var(--color-input-text)" }}>{ad.title}</p>
                      <p style={{ fontSize: 12, color: "var(--color-sidebar-text)", marginTop: 2 }}>
                        {new Date(ad.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {ad.ad_type && (
                          <span style={{ marginLeft: 6 }}>
                            · {Array.isArray(ad.ad_type) ? ad.ad_type.join(", ") : ad.ad_type}
                          </span>
                        )}
                      </p>
                    </div>
                    {/* Platforms */}
                    <div style={{ display: "flex", flexWrap: "wrap" }}>
                      {ad.platforms?.map((p) => <Tag key={p}>{p}</Tag>)}
                    </div>
                    {/* Budget */}
                    <p style={{ fontSize: 13, color: "var(--color-input-text)", fontWeight: 500 }}>
                      {ad.budget ? `$${ad.budget.toLocaleString()}` : "N/A"}
                    </p>
                    {/* Status */}
                    <CampaignStatusBadge status={ad.status} />
                    {/* Open detail */}
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/ethics/campaign/${ad.id}`); }}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "5px 12px", borderRadius: 7, fontSize: "0.75rem", fontWeight: 600,
                        backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
                        border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)",
                        color: "var(--color-accent)", cursor: "pointer",
                      }}
                    >
                      <Eye size={12} /> Review
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Analysis panel */}
          {selected ? (
            <SectionCard title={`Ethics Analysis: ${selected.title}`}>
              <div className="space-y-4">

                {/* Readable strategy viewer instead of raw JSON */}
                <StrategyViewer strategy={selected.strategy_json} />

                <textarea
                  value={reviewForm.comments}
                  onChange={(e) => setReviewForm({ comments: e.target.value })}
                  rows={4}
                  placeholder="Ethical considerations, compliance issues, concerns…"
                  className="field-textarea"
                />

                <div className="flex gap-3">
                  <button onClick={() => handleEthicsReview("approved")} className="btn--approve">
                    <CheckCircle size={16} /> Approve
                  </button>
                  <button onClick={() => handleEthicsReview("rejected")} className="btn--reject">
                    <RotateCcw size={16} /> Redesign Strategy
                  </button>
                </div>
              </div>
            </SectionCard>
          ) : (
            <SectionCard>
              <div className="empty-state">
                <Shield size={48} className="empty-state__icon" />
                <p className="empty-state__text">Select a campaign for ethical analysis</p>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ── Preview tab ── */}
      {tab === "preview" && <PreviewPanel ads={ads} />}

      {/* ── Documents tab ── */}
      {tab === "documents" && (
        <div className="space-y-6">
          <SectionCard title="Add Ethical Guideline">
            <div className="space-y-4">
              <input
                placeholder="Document Title"
                value={docForm.title}
                onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))}
                className="field-input"
              />
              <textarea
                placeholder="Content — compliance notes, ethical review info, internal goals…"
                rows={4}
                value={docForm.content}
                onChange={(e) => setDocForm((p) => ({ ...p, content: e.target.value }))}
                className="field-textarea"
              />
              <button onClick={handleAddDoc} disabled={!docForm.title} className="btn--accent">
                Save Document
              </button>
            </div>
          </SectionCard>

          <SectionCard title={`Existing Guidelines (${docs.length})`}>
            {docs.map((doc) => (
              <div key={doc.id} className="table-row px-1">
                <div>
                  <p className="table-row__title">{doc.title}</p>
                  <p className="table-row__meta mt-1 line-clamp-2">{doc.content}</p>
                </div>
              </div>
            ))}
          </SectionCard>
        </div>
      )}
    </PageWithSidebar>
  );
}
