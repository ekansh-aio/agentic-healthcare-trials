/**
 * M12b: Reviewer Campaign Detail Page
 * Owner: Frontend Dev 3
 * Dependencies: adsAPI, shared/Layout
 *
 * Route: /reviewer/campaign/:id
 *
 * Mirrors CampaignDetailPage (M11) but scoped to reviewer actions:
 *   - View strategy (read-only StrategyViewer)
 *   - Submit a verdict review (approve / revision / reject) — existing flow
 *   - Minor Edit   — inline field edit → auto audit-trail system message
 *   - AI Re-Strategy — reviewer writes instructions → full AI rewrite
 *
 * Styles: index.css classes only, no raw Tailwind color utilities.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  PageWithSidebar, SectionCard, CampaignStatusBadge,
} from "../shared/Layout";
import { adsAPI, surveyAPI } from "../../services/api";
import {
  ArrowLeft, CheckCircle, XCircle, MessageSquare,
  Megaphone, Globe, Image, Bot, Loader2, AlertCircle,
  ChevronDown, ChevronUp, Target, DollarSign, Users,
  Layers, TrendingUp, List, Send, Sparkles,
  RefreshCw, CheckCircle2, BarChart2, Zap, MessageCircle,
  FileText, ClipboardList, Eye, Calendar, LayoutDashboard,
  History, ClipboardCheck, Download, X, Check, Phone,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

function needsQuestionnaire(ad) {
  return !!ad;
}

const QUESTION_TYPE_LABELS = {
  text:            "Short Text",
  textarea:        "Long Text",
  yes_no:          "Yes / No",
  multiple_choice: "Multiple Choice",
  scale:           "Scale (1–5)",
};

// ─── Progress utilities (mirrors admin CampaignDetailPage) ───────────────────

function useGenerateProgress() {
  const [progress, setProgress] = useState(0);
  const [label,    setLabel]    = useState("");
  const timerRef   = useRef(null);
  const startedAt  = useRef(null);
  const durationMs = useRef(20000);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startedAt.current;
    const dur     = durationMs.current;
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
        background: "var(--color-accent-subtle, rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12))",
        borderRadius: "50px", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${progress}%`,
          background: "var(--color-accent)",
          opacity: done ? 1 : 0.85,
          borderRadius: "50px",
          transition: "width 0.25s ease",
        }} />
      </div>
      <span style={{
        fontSize: "0.72rem", fontWeight: 600,
        color: "var(--color-accent)",
        fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      }}>
        {done ? "✓ Done" : `${progress}%`}
      </span>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUS_STEPS = [
  { key: "draft",            label: "Draft" },
  { key: "strategy_created", label: "Strategy Ready" },
  { key: "under_review",     label: "Under Review" },
  { key: "ethics_review",    label: "Ethics Review" },
  { key: "approved",         label: "Approved" },
  { key: "published",        label: "Published" },
];

function statusIndex(s) {
  const i = STATUS_STEPS.findIndex((x) => x.key === s);
  return i === -1 ? 0 : i;
}

function StatusTimeline({ status }) {
  const current = statusIndex(status);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", paddingBottom: 4 }}>
      {STATUS_STEPS.map((step, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <React.Fragment key={step.key}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: done ? "var(--color-accent)" : active ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.15)" : "var(--color-card-bg)",
                border: `2px solid ${done || active ? "var(--color-accent)" : "var(--color-card-border)"}`,
                transition: "all 0.2s",
              }}>
                {done
                  ? <CheckCircle2 size={13} style={{ color: "#fff" }} />
                  : <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: active ? "var(--color-accent)" : "var(--color-card-border)" }} />
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
                flex: 1, height: 2, minWidth: 20,
                backgroundColor: i < current ? "var(--color-accent)" : "var(--color-card-border)",
                marginBottom: 20, transition: "background-color 0.2s",
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

const TYPE_ICON = { website: Globe, ads: Image, voicebot: Bot, chatbot: MessageSquare };
function AdTypeChip({ type }) {
  const Icon = TYPE_ICON[type] ?? Megaphone;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 10px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 500,
      border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)",
      color: "var(--color-input-text)",
    }}>
      <Icon size={12} style={{ color: "var(--color-accent)" }} />
      {type}
    </span>
  );
}

function Tag({ children }) {
  return (
    <span style={{
      display: "inline-block",
      background: "var(--color-primary-light, #dcfce7)",
      color: "var(--color-primary, #166534)",
      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 500,
      marginRight: 4, marginBottom: 4,
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      maxWidth: 160, flexShrink: 0,
    }}>
      {children}
    </span>
  );
}

// ─── Collapsible strategy section (same as ReviewerDashboard) ─────────────────

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
        <Icon size={15} style={{ color: "var(--color-primary, #166534)", flexShrink: 0 }} />
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

function StrategyViewer({ strategy }) {
  const [openSection, setOpenSection] = useState(null);
  const toggle = (key) => setOpenSection((prev) => prev === key ? null : key);

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
            <div style={{ background: "var(--color-primary-light, #dcfce7)", borderLeft: "3px solid var(--color-primary, #166534)", padding: "12px 16px", borderRadius: 6, marginBottom: 14, fontStyle: "italic", color: "var(--color-primary, #166534)", fontWeight: 500, lineHeight: 1.6 }}>
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

// ─── Content plan table (mirrors admin StrategyViewer) ────────────────────────

function ContentPlanTable({ items }) {
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
  const COL_WIDTHS = { channel: "22%", format: "30%", frequency: "22%" };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
        <thead>
          <tr>
            {mainCols.map(col => (
              <th key={col} style={{
                padding: "6px 12px", textAlign: "left",
                width: COL_WIDTHS[col],
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

// ─── Questionnaire viewer (read-only) ─────────────────────────────────────────

function QuestionnaireViewer({ questionnaire, adId, onGenerated, role }) {
  const saved = questionnaire?.questions ?? [];
  const [questions, setQuestions] = useState(saved);
  const [dirty,     setDirty]     = useState(false);
  const qProgress = useGenerateProgress();
  const [saving,    setSaving]    = useState(false);
  const [saveOk,    setSaveOk]    = useState(false);
  const [saveErr,   setSaveErr]   = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState(null);
  const [rewriteStates, setRewriteStates] = useState({});

  const isPM = role === "project_manager";

  useEffect(() => {
    setQuestions(questionnaire?.questions ?? []);
    setDirty(false);
  }, [questionnaire]);

  const updateText = (id, text) => {
    setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, text } : q));
    setDirty(true); setSaveOk(false);
  };

  const updateOption = (id, oi, val) => {
    setQuestions((prev) => prev.map((q) =>
      q.id === id ? { ...q, options: q.options.map((o, i) => i === oi ? val : o) } : q
    ));
    setDirty(true); setSaveOk(false);
  };

  const setCorrectOption = (id, oi) => {
    setQuestions((prev) => prev.map((q) =>
      q.id === id ? { ...q, correct_option: q.correct_option === oi ? null : oi } : q
    ));
    setDirty(true); setSaveOk(false);
  };

  const saveEdits = async () => {
    setSaving(true); setSaveErr(null); setSaveOk(false);
    try {
      await adsAPI.updateQuestionnaire(adId, { questions });
      setSaveOk(true); setDirty(false);
      if (onGenerated) onGenerated();
    } catch (err) {
      setSaveErr(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const generateWithAI = async () => {
    setAiLoading(true); setAiError(null);
    qProgress.start("Generating questions…", 15000);
    try {
      await adsAPI.generateQuestionnaire(adId);
      qProgress.complete();
      if (onGenerated) onGenerated();
    } catch (err) {
      qProgress.fail();
      setAiError(err.message || "AI generation failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const toggleRewrite = (qId) =>
    setRewriteStates((prev) => ({
      ...prev,
      [qId]: { open: !prev[qId]?.open, prompt: prev[qId]?.prompt ?? "", loading: false, error: null },
    }));

  const setRewritePrompt = (qId, val) =>
    setRewriteStates((prev) => ({ ...prev, [qId]: { ...prev[qId], prompt: val } }));

  const submitRewrite = async (q) => {
    const state = rewriteStates[q.id] ?? {};
    if (!state.prompt?.trim()) return;
    setRewriteStates((prev) => ({ ...prev, [q.id]: { ...prev[q.id], loading: true, error: null } }));
    try {
      const res = await adsAPI.rewriteQuestion(adId, q, state.prompt.trim());
      const updated = res.question;
      setQuestions((prev) => prev.map((item) => item.id === q.id ? { ...updated, id: q.id } : item));
      setRewriteStates((prev) => ({ ...prev, [q.id]: { open: false, prompt: "", loading: false, error: null } }));
      setDirty(true);
    } catch (err) {
      setRewriteStates((prev) => ({ ...prev, [q.id]: { ...prev[q.id], loading: false, error: err.message || "Rewrite failed." } }));
    }
  };

  const inputBase = {
    width: "100%", padding: "6px 10px", borderRadius: "7px", fontSize: "0.83rem",
    border: "1.5px solid var(--color-input-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", outline: "none", boxSizing: "border-box",
    fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

      {/* Top action bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {/* AI regenerate — PM only */}
        {isPM && (
          <button
            onClick={generateWithAI}
            disabled={aiLoading || saving}
            className="btn--accent"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", opacity: (aiLoading || saving) ? 0.7 : 1 }}
          >
            {aiLoading ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} />}
            {aiLoading ? "Generating…" : questions.length ? "Regenerate Questions" : "Generate Questions"}
          </button>
        )}
        {isPM && <InlineProgress progress={qProgress.progress} />}

        {dirty && (
          <button
            onClick={saveEdits}
            disabled={saving}
            className="btn--accent"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={13} />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        )}

        {saveOk && !dirty && (
          <span style={{ fontSize: "0.75rem", color: "#22c55e", display: "flex", alignItems: "center", gap: "4px" }}>
            <CheckCircle size={12} /> Saved
          </span>
        )}
      </div>

      {(aiError || saveErr) && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
          <p style={{ fontSize: "0.82rem", color: "#ef4444" }}>{aiError || saveErr}</p>
        </div>
      )}

      {!questions.length && !aiLoading && (
        <p style={{ fontSize: "0.82rem", color: "var(--color-sidebar-text)", fontStyle: "italic" }}>
          No questions yet{isPM ? " — click \"Generate Questions\" above" : ""}.
        </p>
      )}

      {questions.map((q, qi) => {
        const rw = rewriteStates[q.id] ?? {};
        return (
        <div key={q.id ?? qi} style={{
          borderRadius: "10px", border: "1.5px solid var(--color-input-border)",
          backgroundColor: "var(--color-card-bg)", overflow: "hidden",
        }}>
          {/* Question header */}
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "9px 14px", borderBottom: "1px solid var(--color-card-border)",
            backgroundColor: "var(--color-page-bg)",
          }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--color-sidebar-text)", flexShrink: 0 }}>
              Q{qi + 1}
            </span>
            <input
              style={{ ...inputBase, flex: 1, fontWeight: 600, backgroundColor: "transparent", border: "1px solid transparent", borderRadius: "6px", padding: "4px 8px", transition: "border-color 0.15s" }}
              value={q.text}
              onChange={(e) => updateText(q.id, e.target.value)}
              onFocus={(e) => e.target.style.borderColor = "var(--color-accent)"}
              onBlur={(e) => e.target.style.borderColor = "transparent"}
              placeholder="Question text…"
            />
            {/* AI rewrite button — PM only */}
            {isPM && (
              <button
                onClick={() => toggleRewrite(q.id)}
                title="Rewrite this question with AI"
                style={{
                  flexShrink: 0, background: rw.open ? "var(--color-accent-subtle)" : "none",
                  border: `1.5px solid ${rw.open ? "var(--color-accent)" : "var(--color-card-border)"}`,
                  borderRadius: "7px", padding: "5px 9px", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 5,
                  color: rw.open ? "var(--color-accent)" : "var(--color-sidebar-text)",
                  fontSize: "0.72rem", fontWeight: 600,
                }}
              >
                <Sparkles size={13} style={{ color: rw.open ? "var(--color-accent)" : "#6b7280" }} />
              </button>
            )}
            <span style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)", flexShrink: 0, whiteSpace: "nowrap" }}>
              {QUESTION_TYPE_LABELS[q.type] ?? q.type}
              {q.required && <span style={{ color: "#ef4444", marginLeft: "4px" }}>*</span>}
            </span>
          </div>

          {/* Per-question AI rewrite panel — PM only */}
          {isPM && rw.open && (
            <div style={{
              padding: "10px 14px", borderBottom: "1px solid var(--color-card-border)",
              backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.04)",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                Rewrite instruction
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...inputBase, flex: 1 }}
                  value={rw.prompt ?? ""}
                  onChange={(e) => setRewritePrompt(q.id, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !rw.loading && submitRewrite(q)}
                  placeholder="e.g. focus on age eligibility, make it about prior medical history…"
                  disabled={rw.loading}
                  autoFocus
                />
                <button
                  onClick={() => submitRewrite(q)}
                  disabled={rw.loading || !rw.prompt?.trim()}
                  className="btn--accent"
                  style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 14px", opacity: (rw.loading || !rw.prompt?.trim()) ? 0.6 : 1 }}
                >
                  {rw.loading ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} />}
                  {rw.loading ? "Rewriting…" : "Rewrite"}
                </button>
              </div>
              {rw.error && <p style={{ fontSize: "0.75rem", color: "#ef4444", margin: 0 }}>{rw.error}</p>}
            </div>
          )}

          {/* Answer area */}
          <div style={{ padding: "10px 14px" }}>
            {(q.type === "multiple_choice") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {(q.options ?? []).map((opt, oi) => {
                  const isCorrect = q.correct_option === oi;
                  return (
                    <div key={oi} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {/* Correct-option tick */}
                      <button
                        type="button"
                        title={isCorrect ? "Correct answer (click to unset)" : "Mark as correct answer"}
                        onClick={() => setCorrectOption(q.id, oi)}
                        style={{
                          flexShrink: 0, width: 20, height: 20, borderRadius: "50%",
                          border: `1.5px solid ${isCorrect ? "#22c55e" : "var(--color-card-border)"}`,
                          backgroundColor: isCorrect ? "rgba(34,197,94,0.15)" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", transition: "all 0.15s", padding: 0,
                        }}
                      >
                        {isCorrect && <Check size={11} strokeWidth={3} style={{ color: "#22c55e" }} />}
                      </button>
                      <input
                        style={{ ...inputBase, flex: 1, borderColor: isCorrect ? "rgba(34,197,94,0.3)" : undefined }}
                        value={opt}
                        onChange={(e) => updateOption(q.id, oi, e.target.value)}
                        placeholder={`Option ${oi + 1}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {(q.type === "text")     && <div style={{ padding: "7px 10px", borderRadius: "7px", fontSize: "0.82rem", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)", color: "var(--color-sidebar-text)", fontStyle: "italic" }}>Short text answer</div>}
            {(q.type === "textarea") && <div style={{ padding: "7px 10px", borderRadius: "7px", fontSize: "0.82rem", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)", color: "var(--color-sidebar-text)", fontStyle: "italic", minHeight: "52px" }}>Long text answer</div>}
            {(q.type === "yes_no")   && (
              <div style={{ display: "flex", gap: "10px" }}>
                {["Yes", "No"].map((opt) => (
                  <span key={opt} style={{ padding: "5px 16px", borderRadius: "999px", border: "1px solid var(--color-card-border)", fontSize: "0.8rem", color: "var(--color-sidebar-text)" }}>{opt}</span>
                ))}
              </div>
            )}
            {(q.type === "scale") && (
              <div style={{ display: "flex", gap: "8px" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid var(--color-card-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", color: "var(--color-sidebar-text)" }}>{n}</span>
                ))}
              </div>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}

// ─── Verdict review panel (existing behaviour, preserved) ─────────────────────

function VerdictPanel({ adId, onSubmitted }) {
  const INITIAL_FORM = { review_type: "strategy", status: "approved", comments: "", suggestions: "" };
  const [form, setForm]         = useState(INITIAL_FORM);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [submitted, setSubmitted] = useState(null); // { status, review_type }

  const submit = async () => {
    if (form.status !== "approved" && !form.comments.trim()) {
      setError("Comments are required when requesting revision or rejecting.");
      return;
    }
    setLoading(true); setError(null);
    try {
      const payload = {
        ...form,
        comments: form.comments.trim() || "Approved.",
        suggestions: form.suggestions.trim() ? { text: form.suggestions.trim() } : null,
      };
      await adsAPI.createReview(adId, payload);
      setSubmitted({ status: form.status, review_type: form.review_type });
      setForm(INITIAL_FORM);
      onSubmitted();
    } catch (err) {
      setError(err.message || "Failed to submit review.");
    } finally {
      setLoading(false);
    }
  };

  const labelStyle = { fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: 6 };
  const inputStyle = {
    width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: "0.85rem",
    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", outline: "none", boxSizing: "border-box",
  };
  const textStyle = { ...inputStyle, resize: "vertical", minHeight: 80, fontFamily: "inherit" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={labelStyle}>Review Type</label>
          <select style={inputStyle} value={form.review_type} onChange={(e) => setForm((p) => ({ ...p, review_type: e.target.value }))}>
            <option value="strategy">Strategy Review</option>
            <option value="ethics">Ethics Review</option>
            <option value="performance">Performance Review</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Decision</label>
          <select style={inputStyle} value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
            <option value="approved">Approve</option>
            <option value="revision">Request Revision</option>
            <option value="rejected">Reject</option>
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Comments {form.status !== "approved" ? "*" : "(optional)"}</label>
        <textarea style={textStyle} placeholder="Provide your review comments..." value={form.comments} onChange={(e) => setForm((p) => ({ ...p, comments: e.target.value }))} />
      </div>
      <div>
        <label style={labelStyle}>Suggestions (optional)</label>
        <textarea style={{ ...textStyle, minHeight: 60 }} placeholder="Any specific suggestions for improvement..." value={form.suggestions} onChange={(e) => setForm((p) => ({ ...p, suggestions: e.target.value }))} />
      </div>

      {submitted && (() => {
        const isApproved = submitted.status === "approved";
        const isRevision = submitted.status === "revision";
        const typeLabel  = submitted.review_type === "strategy" ? "Strategy" : submitted.review_type === "ethics" ? "Ethics" : "Performance";
        const [bg, border, icon, text] = isApproved
          ? ["rgba(34,197,94,0.08)",  "rgba(34,197,94,0.3)",  <CheckCircle size={16} style={{ color: "#22c55e", flexShrink: 0 }} />,  `${typeLabel} review submitted — campaign approved.`]
          : isRevision
          ? ["rgba(251,191,36,0.08)", "rgba(251,191,36,0.35)", <AlertCircle size={16} style={{ color: "#f59e0b", flexShrink: 0 }} />,  `${typeLabel} review submitted — revision requested.`]
          : ["rgba(239,68,68,0.08)",  "rgba(239,68,68,0.3)",  <AlertCircle size={16} style={{ color: "#ef4444", flexShrink: 0 }} />,  `${typeLabel} review submitted — campaign rejected.`];
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, backgroundColor: bg, border: `1px solid ${border}` }}>
            {icon}
            <div>
              <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>Review Submitted</p>
              <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", margin: "2px 0 0" }}>{text}</p>
            </div>
          </div>
        );
      })()}

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
          <p style={{ fontSize: "0.82rem", color: "#ef4444" }}>{error}</p>
        </div>
      )}

      <button
        onClick={submit}
        disabled={loading}
        className="btn--accent"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, opacity: loading ? 0.7 : 1 }}
      >
        {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />}
        Submit Review
      </button>
    </div>
  );
}

/** Safely reads a dot-path like "messaging.core_message" from an object */
function getNestedValue(obj, path) {
  return path.split(".").reduce((acc, k) => (acc != null ? acc[k] : undefined), obj) ?? "";
}

// ─── Protocol document preview modal ─────────────────────────────────────────

function extFromPath(p) {
  if (!p) return null;
  const parts = p.split("/").pop().split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : null;
}

function DocPreviewModal({ doc, adId, onClose }) {
  const ext  = extFromPath(doc.file_path);
  const mode = !ext ? "download" : ext === "pdf" ? "pdf" : ["txt", "md"].includes(ext) ? "text" : "download";
  const url  = adsAPI.getDocFileUrl(adId, doc.id);

  const [textContent, setTextContent] = useState(null);
  const [textError,   setTextError]   = useState(false);

  useEffect(() => {
    if (mode !== "text") return;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(); return r.text(); })
      .then(setTextContent)
      .catch(() => setTextError(true));
  }, [url, mode]);

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 50, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
    >
      <div style={{ backgroundColor: "var(--color-card-bg)", border: "1px solid var(--color-card-border)", borderRadius: 14, width: "100%", maxWidth: 860, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--color-card-border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0, backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileText size={15} style={{ color: "var(--color-accent)" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</p>
              <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                {doc.file_path?.split("/").pop()}{ext ? ` · ${ext.toUpperCase()}` : ""}{doc.doc_type ? ` · ${doc.doc_type.replace(/_/g, " ")}` : ""}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
            {doc.file_path && (
              <a href={url} download onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", textDecoration: "none", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-input-text)" }}>
                <Download size={13} /> Download
              </a>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", borderRadius: 6, color: "var(--color-sidebar-text)" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative", minHeight: 560 }}>
          {mode === "pdf" && (
            <iframe src={url} title={doc.title} style={{ width: "100%", height: "100%", border: "none", display: "block", minHeight: 560 }} />
          )}
          {mode === "text" && (
            <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>
              {textError
                ? <p style={{ color: "#ef4444", fontSize: "0.875rem" }}>Failed to load file content.</p>
                : textContent === null
                  ? <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.875rem" }}>Loading…</p>
                  : <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.82rem", lineHeight: 1.7, color: "var(--color-input-text)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{textContent}</pre>
              }
            </div>
          )}
          {mode === "download" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "48px 24px", textAlign: "center" }}>
              <FileText size={40} style={{ color: "var(--color-sidebar-text)", opacity: 0.5 }} />
              <p style={{ color: "var(--color-input-text)", fontWeight: 600, fontSize: "0.95rem" }}>Preview not available for {ext ? ext.toUpperCase() : "this file type"}</p>
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.82rem", maxWidth: 340 }}>Download the file to view it in your local application.</p>
              {doc.file_path && (
                <a href={url} download style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", textDecoration: "none", backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)", border: "1px solid var(--color-accent)", color: "var(--color-accent)" }}>
                  <Download size={15} /> Download {ext?.toUpperCase() ?? "File"}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Budget donut chart ────────────────────────────────────────────────────────

const DONUT_PALETTE = [
  "var(--color-accent)", "#6366f1", "#f59e0b", "#ec4899",
  "#14b8a6", "#8b5cf6", "#f97316", "#0ea5e9",
];

// Detect KPI category from metric name → { label, color } or null
function detectKpiCategory(text) {
  const t = (text ?? "").toLowerCase();
  if (/ctr|click.through|click.rate/.test(t))  return { label: "CTR",        color: "#6366f1" };
  if (/cpa|cost.per.acq|cost per acq/.test(t)) return { label: "CPA",        color: "#f59e0b" };
  if (/roas|return.on.ad/.test(t))             return { label: "ROAS",       color: "#14b8a6" };
  if (/impression|reach|awareness/.test(t))    return { label: "REACH",      color: "#8b5cf6" };
  if (/conversion|convert/.test(t))            return { label: "CVR",        color: "#ec4899" };
  if (/engag/.test(t))                         return { label: "ENG",        color: "#f97316" };
  if (/revenue|roi|return on invest/.test(t))  return { label: "ROI",        color: "#0ea5e9" };
  if (/bounce/.test(t))                        return { label: "BOUNCE",     color: "#ef4444" };
  if (/open rate|email/.test(t))               return { label: "EMAIL",      color: "#22c55e" };
  if (/lead/.test(t))                          return { label: "LEADS",      color: "#a78bfa" };
  if (/view|video|watch/.test(t))              return { label: "VIDEO",      color: "#fb923c" };
  return null;
}

// Extract a raw numeric value from a target string — used to decide quant vs qual
// and to normalize bar heights. Handles %, $, ×/x, k/m suffixes.
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

// ─── Bar chart for quantitative KPIs ──────────────────────────────────────────

function QuantKpiChart({ kpis, editable = false, onUpdate }) {
  const normalized = kpis.map(k => typeof k === "string" ? { metric: k, target: null, context: null } : k);
  const nums    = normalized.map(k => extractNumber(k.target) ?? 0);
  const maxVal  = Math.max(...nums, 1);
  const BAR_MAX = 88, BAR_MIN = 28;

  return (
    <div>
      {/* Bars */}
      <div style={{
        display: "flex", alignItems: "flex-end", gap: 10,
        paddingBottom: 0, borderBottom: "2px solid var(--color-card-border)",
      }}>
        {normalized.map((k, i) => {
          const cat   = detectKpiCategory(k.metric);
          const color = cat?.color ?? DONUT_PALETTE[i % DONUT_PALETTE.length];
          const barH  = nums[i] === 0 ? BAR_MIN : BAR_MIN + ((nums[i] / maxVal) * (BAR_MAX - BAR_MIN));
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              {/* Target value above bar */}
              {editable
                ? <InlineField value={k.target ?? ""} onChange={(v) => onUpdate(i, "target", v)} multiline={false}
                    extraStyle={{ fontSize: "0.72rem", fontWeight: 700, color, textAlign: "center", maxWidth: "100%" }} placeholder="Target…" />
                : <span style={{ fontSize: "0.72rem", fontWeight: 800, color, letterSpacing: "0.02em" }}>{k.target}</span>
              }
              {/* Bar */}
              <div style={{
                width: "100%", height: barH, borderRadius: "5px 5px 0 0",
                background: `linear-gradient(180deg, ${color}dd 0%, ${color}55 100%)`,
                transition: "height 0.45s ease",
              }} />
            </div>
          );
        })}
      </div>
      {/* Metric labels + context below x-axis */}
      <div style={{ display: "flex", gap: 10, paddingTop: 6 }}>
        {normalized.map((k, i) => {
          const cat   = detectKpiCategory(k.metric);
          const color = cat?.color ?? DONUT_PALETTE[i % DONUT_PALETTE.length];
          return (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              {editable
                ? <InlineField value={k.metric ?? ""} onChange={(v) => onUpdate(i, "metric", v)} multiline={false}
                    extraStyle={{ fontSize: "0.72rem", fontWeight: 700, color, textAlign: "center" }} placeholder="Metric…" />
                : <p style={{ fontSize: "0.72rem", fontWeight: 700, color, margin: 0 }}>{k.metric}</p>
              }
              {editable
                ? <InlineField value={k.context ?? ""} onChange={(v) => onUpdate(i, "context", v)} multiline={false}
                    extraStyle={{ fontSize: "0.6rem", color: "var(--color-sidebar-text)", textAlign: "center" }} placeholder="Context…" />
                : k.context && <p style={{ fontSize: "0.6rem", color: "var(--color-sidebar-text)", margin: "2px 0 0", lineHeight: 1.3 }}>{k.context}</p>
              }
            </div>
          );
        })}
      </div>
    </div>
  );
}


function DonutChart({ slices, size = 150, thickness = 26 }) {
  const r    = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const cx   = size / 2, cy = size / 2;
  let acc = 0;
  return (
    <svg width={size} height={size}>
      {/* track */}
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
            style={{ transition: "stroke-dasharray 0.4s ease" }}
          />
        );
      })}
    </svg>
  );
}

function BudgetDonut({ strategy }) {
  if (!strategy?.budget_allocation) return null;
  const entries = Object.entries(strategy.budget_allocation);
  if (!entries.length) return null;

  const slices = entries.map(([label, val], i) => ({
    label,
    pct: parseFloat(String(val)) || 0,
    color: DONUT_PALETTE[i % DONUT_PALETTE.length],
  }));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "4px 0" }}>
      {/* Ring */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <DonutChart slices={slices} />
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <DollarSign size={16} style={{ color: "var(--color-accent)" }} />
        </div>
      </div>
      {/* Legend */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: s.color, flexShrink: 0 }} />
            <p style={{ flex: 1, fontSize: "0.78rem", color: "var(--color-input-text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
              {s.label}
            </p>
            <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--color-input-text)", flexShrink: 0, margin: 0 }}>
              {s.pct}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Inline editable text field (transparent-border, auto-resize) ──────────────

function InlineField({ value, onChange, multiline = true, placeholder = "", extraStyle = {} }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !multiline) return;
    ref.current.style.height = "auto";
    ref.current.style.height = ref.current.scrollHeight + "px";
  }, [value, multiline]);

  const base = {
    width: "100%", background: "transparent",
    border: "1px solid transparent", borderRadius: 6,
    padding: "3px 6px", outline: "none",
    color: "var(--color-input-text)", fontFamily: "inherit",
    fontSize: 13, lineHeight: 1.7, boxSizing: "border-box",
    transition: "border-color 0.15s",
    ...extraStyle,
  };

  const onFocus = (e) => { e.target.style.borderColor = "var(--color-accent)"; };
  const onBlur  = (e) => { e.target.style.borderColor = "transparent"; };

  if (!multiline) return (
    <input
      type="text" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus} onBlur={onBlur}
      style={base}
    />
  );

  return (
    <textarea
      ref={ref} rows={1} value={value} placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = e.target.scrollHeight + "px";
      }}
      onFocus={onFocus} onBlur={onBlur}
      style={{ ...base, resize: "none", overflow: "hidden" }}
    />
  );
}

// ─── Editable strategy viewer (reviewer-only) ─────────────────────────────────
//
// Fields in executive_summary, target_audience, and messaging are editable inline.
// Each collapsible section has a "Save Changes" button that activates when its
// fields are dirty. Saving calls adsAPI.minorEditStrategy per changed field and
// logs each change to the audit trail.

function EditableStrategyViewer({ strategy, adId, onSaved }) {
  const [s, setS]               = useState(strategy ?? {});
  const [dirty, setDirty]       = useState({});
  const [saving, setSaving]     = useState({});
  const [saveErr, setSaveErr]   = useState({});
  const [saveOk, setSaveOk]     = useState({});
  const [openSection, setOpenSection]         = useState(null);
  const [expandedContentRow, setExpandedContentRow] = useState(null);
  const toggle = (key) => setOpenSection((prev) => prev === key ? null : key);

  // Handles both old string KPIs (field=null) and new structured KPIs (field = "metric"|"target"|"context")
  const updateKpi = (index, fieldOrValue, value) => {
    const newKpis = [...(s.kpis ?? [])];
    if (value !== undefined) {
      // structured update: updateKpi(i, "metric", newVal)
      const cur = newKpis[index];
      newKpis[index] = typeof cur === "object" ? { ...cur, [fieldOrValue]: value } : { [fieldOrValue]: value };
    } else {
      // legacy string update: updateKpi(i, newVal)
      newKpis[index] = fieldOrValue;
    }
    setS((prev) => ({ ...prev, kpis: newKpis }));
    setDirty((prev) => ({ ...prev, kpis: { kpis: { old: JSON.stringify(strategy?.kpis ?? []), new: JSON.stringify(newKpis) } } }));
    setSaveOk((prev) => ({ ...prev, kpis: false }));
  };

  const updateContentItem = (index, field, value) => {
    const newPlan = (s.content_plan ?? []).map((item, i) => i === index ? { ...item, [field]: value } : item);
    setS((prev) => ({ ...prev, content_plan: newPlan }));
    setDirty((prev) => ({ ...prev, content: { content_plan: { old: JSON.stringify(strategy?.content_plan ?? []), new: JSON.stringify(newPlan) } } }));
    setSaveOk((prev) => ({ ...prev, content: false }));
  };

  useEffect(() => {
    setS(strategy ?? {});
    setDirty({});
    setSaveOk({});
  }, [strategy]);

  const update = (path, value, sectionKey) => {
    setS((prev) => {
      const parts = path.split(".");
      if (parts.length === 1) return { ...prev, [parts[0]]: value };
      return { ...prev, [parts[0]]: { ...prev[parts[0]], [parts[1]]: value } };
    });
    setDirty((prev) => ({
      ...prev,
      [sectionKey]: {
        ...(prev[sectionKey] ?? {}),
        [path]: { old: String(getNestedValue(strategy, path)), new: value },
      },
    }));
    setSaveOk((prev) => ({ ...prev, [sectionKey]: false }));
  };

  const isSectionDirty = (sectionKey) => {
    const fields = dirty[sectionKey] ?? {};
    return Object.values(fields).some((v) => v.new !== v.old);
  };

  const saveSection = async (sectionKey) => {
    const fields = dirty[sectionKey] ?? {};
    const changed = Object.entries(fields).filter(([, v]) => v.new !== v.old);
    if (!changed.length) return;
    setSaving((p) => ({ ...p, [sectionKey]: true }));
    setSaveErr((p) => ({ ...p, [sectionKey]: null }));
    try {
      for (const [field, { old: oldVal, new: newVal }] of changed) {
        await adsAPI.minorEditStrategy(adId, { field, old_value: oldVal, new_value: newVal });
      }
      setDirty((p) => ({ ...p, [sectionKey]: {} }));
      setSaveOk((p) => ({ ...p, [sectionKey]: true }));
      if (onSaved) onSaved();
    } catch (err) {
      setSaveErr((p) => ({ ...p, [sectionKey]: err.message || "Failed to save." }));
    } finally {
      setSaving((p) => ({ ...p, [sectionKey]: false }));
    }
  };

  function SaveBar({ sectionKey }) {
    const isDirty  = isSectionDirty(sectionKey);
    const isSaving = saving[sectionKey];
    const err      = saveErr[sectionKey];
    const ok       = saveOk[sectionKey];
    if (!isDirty && !err && !ok) return null;
    return (
      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {isDirty && (
          <button
            onClick={() => saveSection(sectionKey)}
            disabled={isSaving}
            className="btn--accent"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.78rem", padding: "6px 14px", opacity: isSaving ? 0.7 : 1 }}
          >
            {isSaving
              ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
              : <CheckCircle2 size={12} />}
            {isSaving ? "Saving…" : "Save Changes"}
          </button>
        )}
        {err && <p style={{ fontSize: "0.75rem", color: "#ef4444" }}>{err}</p>}
        {ok && !isDirty && (
          <span style={{ fontSize: "0.75rem", color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}>
            <CheckCircle size={12} /> Saved · recorded in audit trail
          </span>
        )}
      </div>
    );
  }

  if (!strategy) return (
    <p style={{ fontSize: 13, color: "var(--color-sidebar-text)" }}>No strategy generated yet.</p>
  );

  return (
    <div>
      {/* Subtle hint */}
      <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginBottom: 14, fontStyle: "italic" }}>
        Click any text to edit inline — a Save button appears when you make changes.
      </p>

      <StrategySection icon={Megaphone} title="Executive Summary" isOpen={openSection === "summary"} onToggle={() => toggle("summary")}>
        <InlineField
          value={s.executive_summary ?? ""}
          onChange={(v) => update("executive_summary", v, "summary")}
          placeholder="Executive summary…"
        />
        <SaveBar sectionKey="summary" />
      </StrategySection>

      {s.target_audience && (
        <StrategySection icon={Users} title="Target Audience" isOpen={openSection === "audience"} onToggle={() => toggle("audience")}>
          {[
            ["PRIMARY",      "target_audience.primary"],
            ["SECONDARY",    "target_audience.secondary"],
            ["DEMOGRAPHICS", "target_audience.demographics"],
          ]
            .filter(([, path]) => getNestedValue(s, path))
            .map(([label, path]) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", marginBottom: 4, color: "var(--color-sidebar-text)" }}>{label}</p>
                <InlineField
                  value={String(getNestedValue(s, path))}
                  onChange={(v) => update(path, v, "audience")}
                />
              </div>
            ))}
          <SaveBar sectionKey="audience" />
        </StrategySection>
      )}

      {s.messaging && (
        <StrategySection icon={MessageSquare} title="Messaging" isOpen={openSection === "messaging"} onToggle={() => toggle("messaging")}>
          {s.messaging.core_message !== undefined && (
            <div style={{
              background: "var(--color-primary-light, #dcfce7)",
              borderLeft: "3px solid var(--color-primary, #166534)",
              padding: "10px 14px", borderRadius: 6, marginBottom: 14,
            }}>
              <InlineField
                value={s.messaging.core_message ?? ""}
                onChange={(v) => update("messaging.core_message", v, "messaging")}
                placeholder="Core message…"
                extraStyle={{ fontStyle: "italic", color: "var(--color-primary, #166534)", fontWeight: 500 }}
              />
            </div>
          )}
          {s.messaging.tone !== undefined && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", marginBottom: 4, color: "var(--color-sidebar-text)" }}>TONE</p>
              <InlineField
                value={s.messaging.tone ?? ""}
                onChange={(v) => update("messaging.tone", v, "messaging")}
                multiline={false}
              />
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
          <SaveBar sectionKey="messaging" />
        </StrategySection>
      )}

      {s.content_plan?.length > 0 && (
        <StrategySection icon={List} title={`Content Plan (${s.content_plan.length} items)`} isOpen={openSection === "content"} onToggle={() => toggle("content")}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr>
                  {[["Channel", "22%"], ["Format", "30%"], ["Frequency", "22%"], ["Example", "80px"]].map(([col, w]) => (
                    <th key={col} style={{
                      padding: "6px 12px", textAlign: "left", width: w,
                      fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.06em", color: "var(--color-sidebar-text)",
                      borderBottom: "1px solid var(--color-card-border)",
                      whiteSpace: "nowrap",
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.content_plan.map((item, i) => (
                  <React.Fragment key={i}>
                    <tr style={{ backgroundColor: i % 2 === 0 ? "transparent" : "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.03)" }}>
                      <td style={{ padding: "8px 12px", borderBottom: expandedContentRow === i ? "none" : "1px solid var(--color-card-border)", verticalAlign: "middle" }}>
                        <Tag>{item.channel}</Tag>
                      </td>
                      <td style={{ padding: "8px 12px", borderBottom: expandedContentRow === i ? "none" : "1px solid var(--color-card-border)", verticalAlign: "middle" }}>
                        <InlineField
                          value={item.format ?? ""}
                          onChange={(v) => updateContentItem(i, "format", v)}
                          multiline={false}
                          placeholder="Format…"
                          extraStyle={{ fontSize: "0.78rem" }}
                        />
                      </td>
                      <td style={{ padding: "8px 12px", borderBottom: expandedContentRow === i ? "none" : "1px solid var(--color-card-border)", verticalAlign: "middle" }}>
                        <InlineField
                          value={item.frequency ?? ""}
                          onChange={(v) => updateContentItem(i, "frequency", v)}
                          multiline={false}
                          placeholder="Frequency…"
                          extraStyle={{ fontSize: "0.78rem" }}
                        />
                      </td>
                      <td style={{ padding: "8px 12px", borderBottom: expandedContentRow === i ? "none" : "1px solid var(--color-card-border)", verticalAlign: "middle" }}>
                        {item.example !== undefined && (
                          <button
                            onClick={() => setExpandedContentRow(expandedContentRow === i ? null : i)}
                            style={{
                              background: "none", border: "none", cursor: "pointer", padding: 0,
                              display: "inline-flex", alignItems: "center", gap: 4,
                              color: "var(--color-accent)", fontSize: "0.72rem", fontWeight: 600,
                            }}
                          >
                            <Eye size={11} />
                            {expandedContentRow === i ? "Hide" : "Edit"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedContentRow === i && (
                      <tr style={{ backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.04)" }}>
                        <td colSpan={4} style={{ padding: "10px 14px 14px", borderBottom: "1px solid var(--color-card-border)" }}>
                          <p style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: 6 }}>Example</p>
                          <InlineField
                            value={item.example ?? ""}
                            onChange={(v) => updateContentItem(i, "example", v)}
                            placeholder="Example content…"
                            extraStyle={{ fontSize: "0.82rem", lineHeight: 1.6 }}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <SaveBar sectionKey="content" />
        </StrategySection>
      )}

      {s.kpis?.length > 0 && (
        <StrategySection icon={TrendingUp} title={`KPIs (${s.kpis.length})`} isOpen={openSection === "kpis"} onToggle={() => toggle("kpis")}>
          <QuantKpiChart kpis={s.kpis} editable onUpdate={(idx, field, value) => updateKpi(idx, field, value)} />
          <SaveBar sectionKey="kpis" />
        </StrategySection>
      )}
    </div>
  );
}

// ─── AI Re-Strategy panel ──────────────────────────────────────────────────────
//
// Reviewer writes freeform instructions / feedback.
// Calls adsAPI.rewriteStrategy(adId, { instructions }) → backend runs full AI rewrite.
// Backend should append a system audit message like:
//   "AI Re-Strategy triggered by reviewer: '<first 120 chars of instructions>…'"

function AIReStrategyPanel({ adId, onRewritten }) {
  const [instructions, setInstructions] = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [success,      setSuccess]      = useState(false);
  const [confirmed,    setConfirmed]    = useState(false);
  const reProgress = useGenerateProgress();

  const run = async () => {
    if (!instructions.trim()) { setError("Instructions are required."); return; }
    if (!confirmed) { setError("Please confirm you want to replace the current strategy."); return; }
    setLoading(true); setError(null); setSuccess(false);
reProgress.start("Re-writing strategy…", 120000);

try {
  const triggered = await adsAPI.rewriteStrategy(adId, {
    instructions: instructions.trim(),
  });

  const beforeAt = triggered.updated_at;
  const deadline = Date.now() + 180000;
  let done = false;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));

    try {
      const latest = await adsAPI.get(adId);

      const processing =
        latest.status === "optimizing" ||
        latest.status === "generating";

      const changed = latest.updated_at !== beforeAt;

      if (changed && !processing) {
        done = true;
        break;
      }
    } catch (_) {
      // swallow transient polling errors
    }
  }

  if (!done) {
    throw new Error(
      "Timed out waiting for re-strategy to complete. Please refresh."
    );
  }
      reProgress.complete();
      setSuccess(true);
      setInstructions("");
      setConfirmed(false);
      onRewritten();
    } catch (err) {
      reProgress.fail();
      setError(err.message || "Re-strategy failed.");
    } finally {
      setLoading(false);
    }
  };

  const labelStyle = { fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: 6 };
  const textStyle  = {
    width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: "0.85rem",
    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", outline: "none", boxSizing: "border-box",
    resize: "vertical", minHeight: 130, fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Warning callout */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 8, backgroundColor: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.3)" }}>
        <Sparkles size={14} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", lineHeight: 1.5 }}>
          This will <strong style={{ color: "var(--color-input-text)" }}>replace the entire strategy from scratch</strong> using your instructions as guidance. The current strategy will be overwritten. This action is recorded in the audit trail.
        </p>
      </div>

      {/* Instructions textarea */}
      <div>
        <label style={labelStyle}>Your Instructions *</label>
        <textarea
          style={textStyle}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. The current strategy over-indexes on social media. Refocus on B2B channels like LinkedIn and email with a thought-leadership angle. Reduce influencer budget to under 10%. Keep the same target audience but adjust messaging tone to be more professional."
        />
        <p style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)", marginTop: 4 }}>
          Be as specific as possible — the original campaign brief plus your instructions will be used to generate a new strategy.
        </p>
      </div>

      {/* Confirmation checkbox */}
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          style={{ width: 15, height: 15, accentColor: "var(--color-accent)", cursor: "pointer" }}
        />
        <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>
          I understand the current strategy will be permanently replaced
        </span>
      </label>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
          <p style={{ fontSize: "0.82rem", color: "#ef4444" }}>{error}</p>
        </div>
      )}
      {success && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
          <CheckCircle size={14} style={{ color: "#22c55e", flexShrink: 0 }} />
          <p style={{ fontSize: "0.82rem", color: "#22c55e" }}>AI is re-writing the strategy. Reload in a few seconds to see the result.</p>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={run}
          disabled={loading || !confirmed}
          className="btn--accent"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, opacity: (loading || !confirmed) ? 0.6 : 1, cursor: (loading || !confirmed) ? "not-allowed" : "pointer" }}
        >
          {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={14} />}
          {loading ? "Re-writing strategy… (1–2 min)" : "Trigger AI Re-Strategy"}
        </button>
        <InlineProgress progress={reProgress.progress} />
      </div>
    </div>
  );
}

// ─── Review history card ───────────────────────────────────────────────────────

function ReviewCard({ review }) {
  const isSystem = review.review_type === "system" || review.is_system;
  const statusColor = {
    approved: "var(--color-success)",
    rejected: "#ef4444",
    revision: "#f59e0b",
    pending:  "var(--color-sidebar-text)",
  }[review.status] ?? "var(--color-sidebar-text)";

  if (isSystem) {
    return (
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "10px 14px", borderRadius: 8,
        border: "1px dashed var(--color-card-border)",
        backgroundColor: "var(--color-page-bg)",
      }}>
        <RefreshCw size={13} style={{ color: "var(--color-sidebar-text)", flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", lineHeight: 1.6, fontStyle: "italic" }}>
            {review.comments}
          </p>
          {review.created_at && (
            <p style={{ fontSize: "0.68rem", color: "var(--color-sidebar-text)", marginTop: 4 }}>
              {new Date(review.created_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "2px 8px", borderRadius: 999, textTransform: "capitalize", backgroundColor: statusColor + "22", color: statusColor, border: `1px solid ${statusColor}44` }}>
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
      {review.comments && <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)", lineHeight: 1.6 }}>{review.comments}</p>}
      {review.suggestions?.text && <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", marginTop: 6, fontStyle: "italic" }}>Suggestions: {review.suggestions.text}</p>}
    </div>
  );
}

// ─── Tab bar used inside the action column ─────────────────────────────────────

const ACTION_TABS = [
  { key: "verdict",    label: "Verdict",     icon: CheckCircle },
  { key: "restrategy", label: "Re-Strategy", icon: Sparkles    },
];

function ActionTabs({ active, onChange }) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--color-card-border)", marginBottom: 20 }}>
      {ACTION_TABS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 14px", border: "none", background: "none",
            cursor: "pointer", fontSize: "0.8rem", fontWeight: active === key ? 700 : 500,
            color: active === key ? "var(--color-accent)" : "var(--color-sidebar-text)",
            borderBottom: active === key ? "2px solid var(--color-accent)" : "2px solid transparent",
            marginBottom: -1, transition: "color 0.15s",
          }}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Page-level tab bar ────────────────────────────────────────────────────────

const PAGE_TABS = [
  { key: "overview",      label: "Overview",      icon: LayoutDashboard },
  { key: "strategy",      label: "Strategy",      icon: Layers          },
  { key: "questionnaire", label: "Questionnaire", icon: ClipboardList   },
  { key: "participants",  label: "Participants",  icon: Users           },
  { key: "review",        label: "Review",        icon: ClipboardCheck  },
  { key: "history",       label: "History",       icon: History         },
];

function PageTabBar({ active, onChange, showQuestionnaireDot }) {
  return (
    <div style={{
      display: "flex", borderBottom: "1px solid var(--color-card-border)",
      marginBottom: 28, gap: 0, overflowX: "auto",
    }}>
      {PAGE_TABS.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        const hasDot   = key === "questionnaire" && showQuestionnaireDot;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              display: "flex", alignItems: "center", gap: 7, position: "relative",
              padding: "11px 18px", border: "none", background: "none",
              cursor: "pointer", fontSize: "0.82rem", fontWeight: isActive ? 700 : 500,
              color: isActive ? "var(--color-accent)" : "var(--color-sidebar-text)",
              borderBottom: isActive ? "2px solid var(--color-accent)" : "2px solid transparent",
              marginBottom: -1, transition: "color 0.15s", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            <Icon size={14} />
            {label}
            {hasDot && (
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                backgroundColor: "#f59e0b",
                display: "inline-block", marginLeft: 2, flexShrink: 0,
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main exported component ───────────────────────────────────────────────────

export default function ReviewerCampaignDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const { role }  = useAuth();

  const [ad,         setAd]         = useState(null);
  const [reviews,    setReviews]    = useState([]);
  const [protoDocs,  setProtoDocs]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [pageTab,    setPageTab]    = useState("overview");
  const [actionTab,  setActionTab]  = useState("verdict");
  const [previewDoc, setPreviewDoc] = useState(null);
  const [participants,        setParticipants]        = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [syncingTranscripts,  setSyncingTranscripts]  = useState(false);
  const [syncResult,          setSyncResult]          = useState(null);

  const load = useCallback(async () => {
    try {
      const [adData, reviewsData, docsData] = await Promise.all([
        adsAPI.get(id),
        adsAPI.listReviews(id),
        adsAPI.listDocuments(id).catch(() => []),
      ]);
      setAd(adData);
      setReviews(reviewsData);
      setProtoDocs(docsData ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (pageTab !== "participants" || !id) return;
    setParticipantsLoading(true);
    surveyAPI.list(id)
      .then((data) => setParticipants(data || []))
      .catch(() => setParticipants([]))
      .finally(() => setParticipantsLoading(false));
  }, [pageTab, id]);

  const handleActionDone = async () => { await load(); };

  const handleSyncTranscripts = async () => {
    setSyncingTranscripts(true);
    setSyncResult(null);
    try {
      const result = await surveyAPI.syncTranscripts(id);
      setSyncResult(result);
      const data = await surveyAPI.list(id);
      setParticipants(data || []);
      if (selectedParticipant) {
        const refreshed = (data || []).find((p) => p.id === selectedParticipant.id);
        if (refreshed) setSelectedParticipant(refreshed);
      }
    } catch (err) {
      setSyncResult({ error: err.message || "Sync failed" });
    } finally {
      setSyncingTranscripts(false);
    }
  };

  if (loading) return (
    <PageWithSidebar>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "60px 0", color: "var(--color-sidebar-text)" }}>
        <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
        <p>Loading campaign…</p>
      </div>
    </PageWithSidebar>
  );

  if (error || !ad) return (
    <PageWithSidebar>
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <AlertCircle size={32} style={{ color: "#ef4444", margin: "0 auto 12px" }} />
        <p style={{ color: "var(--color-input-text)", fontWeight: 600 }}>Campaign not found</p>
        <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.85rem", marginTop: 4 }}>{error}</p>
        <button onClick={() => navigate(-1)} className="btn--ghost" style={{ marginTop: 16 }}>Go back</button>
      </div>
    </PageWithSidebar>
  );

  const hasStrategy   = statusIndex(ad.status) >= statusIndex("strategy_created");
  const canAct        = ["under_review", "strategy_created", "ethics_review"].includes(ad.status);
  const qualifies     = needsQuestionnaire(ad);
  const questEmpty    = !(ad.questionnaire?.questions?.length > 0);
  const showQDot      = qualifies && questEmpty;

  return (
    <>
    <PageWithSidebar>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* ── Back button ── */}
      <button
        onClick={() => navigate(-1)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20,
          padding: "6px 12px", border: "1px solid var(--color-card-border)",
          borderRadius: 8, background: "transparent", cursor: "pointer",
          fontSize: "0.8rem", color: "var(--color-sidebar-text)",
        }}
      >
        <ArrowLeft size={14} /> Back
      </button>

      {/* ── Hero card ── */}
      <div style={{
        borderRadius: 16,
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f2027 100%)",
        padding: "32px 36px", marginBottom: 32, position: "relative", overflow: "hidden",
      }}>
        {/* decorative blobs */}
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.08)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -30, left: 120, width: 120, height: 120, borderRadius: "50%", background: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.05)", pointerEvents: "none" }} />

        {/* title row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20, position: "relative" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 6 }}>
              Campaign Review
            </p>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", lineHeight: 1.3, margin: 0 }}>
              {ad.title}
            </h1>
          </div>
          <CampaignStatusBadge status={ad.status} />
        </div>

        {/* stats row */}
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", position: "relative" }}>
          {ad.budget && (
            <div>
              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Budget</p>
              <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>${ad.budget?.toLocaleString()}</p>
            </div>
          )}
          {ad.duration && (
            <div>
              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Duration</p>
              <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>{ad.duration}</p>
            </div>
          )}
          {ad.platforms?.length > 0 && (
            <div>
              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Platforms</p>
              <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>{ad.platforms.join(" · ")}</p>
            </div>
          )}
          {ad.ad_type?.length > 0 && (
            <div>
              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Type</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ad.ad_type.map((t) => (
                  <AdTypeChip key={t} type={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Page tab navigation ── */}
      <PageTabBar active={pageTab} onChange={setPageTab} showQuestionnaireDot={showQDot} />

      {/* ── Tab content ── */}

      {/* OVERVIEW */}
      {pageTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <SectionCard title="Campaign Progress">
            <StatusTimeline status={ad.status} />
          </SectionCard>

          {(() => {
            const hasBudget = !!(ad.strategy_json?.budget_allocation && Object.keys(ad.strategy_json.budget_allocation).length > 0);
            const hasDocs   = protoDocs.length > 0;
            if (!hasDocs && !hasBudget) return null;
            return (
              <div style={{ display: "grid", gridTemplateColumns: hasDocs && hasBudget ? "1fr 1fr" : "1fr", gap: 16, alignItems: "start" }}>
                {hasDocs && (
                  <SectionCard title="Protocol Documents" subtitle={`${protoDocs.length} document${protoDocs.length !== 1 ? "s" : ""} attached`}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {protoDocs.map((doc) => (
                        <div
                          key={doc.id}
                          onClick={() => doc.file_path && setPreviewDoc(doc)}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "10px 14px", borderRadius: 8,
                            border: "1px solid var(--color-card-border)",
                            backgroundColor: "var(--color-card-bg)",
                            cursor: doc.file_path ? "pointer" : "default",
                            transition: "border-color 0.15s",
                          }}
                          onMouseEnter={(e) => { if (doc.file_path) e.currentTarget.style.borderColor = "var(--color-accent)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-card-border)"; }}
                        >
                          <FileText size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: "0.83rem", fontWeight: 600, color: "var(--color-input-text)", margin: 0 }}>{doc.title}</p>
                            {doc.doc_type && (
                              <p style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)", marginTop: 2, textTransform: "capitalize" }}>{doc.doc_type.replace(/_/g, " ")}{doc.file_path && ` · ${doc.file_path.split("/").pop()}`}</p>
                            )}
                          </div>
                          {doc.file_path && <Eye size={13} style={{ color: "var(--color-sidebar-text)", flexShrink: 0 }} />}
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}
                {hasBudget && (
                  <SectionCard title="Budget Distribution">
                    <BudgetDonut strategy={ad.strategy_json} />
                  </SectionCard>
                )}
              </div>
            );
          })()}

          {qualifies && (
            <div
              onClick={() => setPageTab("questionnaire")}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "18px 22px", borderRadius: 12, cursor: "pointer",
                border: questEmpty ? "1px solid rgba(245,158,11,0.4)" : "1px solid var(--color-card-border)",
                backgroundColor: questEmpty ? "rgba(245,158,11,0.05)" : "var(--color-card-bg)",
                transition: "border-color 0.15s",
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: questEmpty ? "rgba(245,158,11,0.12)" : "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
              }}>
                <ClipboardList size={18} style={{ color: questEmpty ? "#f59e0b" : "var(--color-accent)" }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--color-input-text)", margin: 0 }}>
                  Eligibility Questionnaire
                  {questEmpty && <span style={{ marginLeft: 8, fontSize: "0.72rem", fontWeight: 600, color: "#f59e0b" }}>· Needs setup</span>}
                </p>
                <p style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)", marginTop: 3 }}>
                  {questEmpty ? "No questions generated yet — click to set up" : `${ad.questionnaire.questions.length} question${ad.questionnaire.questions.length !== 1 ? "s" : ""} ready`}
                </p>
              </div>
              <ArrowLeft size={14} style={{ color: "var(--color-sidebar-text)", transform: "rotate(180deg)" }} />
            </div>
          )}
        </div>
      )}

      {/* STRATEGY */}
      {pageTab === "strategy" && (
        <div>
          {hasStrategy
            ? <EditableStrategyViewer strategy={ad.strategy_json} adId={id} onSaved={handleActionDone} />
            : (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <Layers size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
                <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>Strategy not yet generated for this campaign.</p>
              </div>
            )
          }
        </div>
      )}

      {/* QUESTIONNAIRE */}
      {pageTab === "questionnaire" && (
        <div>
          {qualifies ? (
            <>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-input-text)", margin: 0 }}>
                  Eligibility Questionnaire
                </h2>
                <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", marginTop: 4 }}>
                  {ad.questionnaire?.questions?.length
                    ? `${ad.questionnaire.questions.length} question${ad.questionnaire.questions.length !== 1 ? "s" : ""} · edit wording or regenerate below`
                    : "No questions yet — generate to get started"
                  }
                </p>
              </div>
              <QuestionnaireViewer questionnaire={ad.questionnaire} adId={id} onGenerated={handleActionDone} role={role} />
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <ClipboardList size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>This campaign type does not require a questionnaire.</p>
            </div>
          )}
        </div>
      )}

      {/* REVIEW */}
      {pageTab === "review" && (
        <div>
          {!canAct ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <ClipboardCheck size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>
                Campaign is <strong style={{ color: "var(--color-input-text)" }}>{ad.status}</strong> — no action required right now.
              </p>
            </div>
          ) : (
            <div style={{ maxWidth: 640 }}>
              <ActionTabs active={actionTab} onChange={setActionTab} />

              {actionTab === "verdict" && (
                <VerdictPanel adId={id} onSubmitted={handleActionDone} />
              )}
              {actionTab === "restrategy" && (
                hasStrategy
                  ? <AIReStrategyPanel adId={id} onRewritten={handleActionDone} />
                  : <p style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)" }}>Strategy must be generated before triggering a re-write.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* PARTICIPANTS */}
      {pageTab === "participants" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {selectedParticipant ? (
            <SectionCard title={selectedParticipant.full_name} subtitle={`Submitted ${new Date(selectedParticipant.created_at).toLocaleString()}`}>
              <button onClick={() => setSelectedParticipant(null)} className="btn--ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem", marginBottom: 20 }}>
                <ArrowLeft size={13} /> Back to list
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 14, marginBottom: 24 }}>
                {[
                  { label: "Full Name",   value: selectedParticipant.full_name },
                  { label: "Age",         value: selectedParticipant.age },
                  { label: "Sex",         value: selectedParticipant.sex.replace(/_/g, " ") },
                  { label: "Phone",       value: selectedParticipant.phone },
                  { label: "Eligibility", value: selectedParticipant.is_eligible === true ? "Eligible" : selectedParticipant.is_eligible === false ? "Not Eligible" : "Unknown" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                    <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</p>
                    <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--color-input-text)", textTransform: "capitalize" }}>{value}</p>
                  </div>
                ))}
              </div>
              {/* Voice call transcript */}
              {selectedParticipant.voice_sessions?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Voice Call Transcript</p>
                  {selectedParticipant.voice_sessions.map((vs) => (
                    <div key={vs.id} style={{ border: "1px solid var(--color-card-border)", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", backgroundColor: "var(--color-page-bg)", borderBottom: vs.transcripts?.length > 0 ? "1px solid var(--color-card-border)" : "none" }}>
                        <Phone size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)" }}>{vs.phone || "Unknown number"}</span>
                        <span style={{ marginLeft: "auto", fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20, backgroundColor: vs.status === "ended" ? "rgba(34,197,94,0.12)" : vs.status === "failed" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.12)", color: vs.status === "ended" ? "#16a34a" : vs.status === "failed" ? "#dc2626" : "#b45309" }}>{vs.status}</span>
                        {vs.duration_seconds != null && <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>{Math.floor(vs.duration_seconds / 60)}m {vs.duration_seconds % 60}s</span>}
                        <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>{new Date(vs.started_at).toLocaleString()}</span>
                      </div>
                      {vs.transcripts?.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 360, overflowY: "auto", padding: "12px 16px" }}>
                          {[...vs.transcripts].sort((a, b) => (a.turn_index ?? 0) - (b.turn_index ?? 0)).map((turn, ti) => (
                            <div key={ti} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                              <span style={{ flexShrink: 0, width: 44, fontSize: "0.68rem", fontWeight: 700, textAlign: "right", paddingTop: 3, color: turn.speaker === "agent" ? "var(--color-accent)" : "var(--color-sidebar-text)", textTransform: "uppercase" }}>{turn.speaker === "agent" ? "Agent" : "User"}</span>
                              <div style={{ flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: "0.83rem", lineHeight: 1.5, backgroundColor: turn.speaker === "agent" ? "rgba(16,185,129,0.07)" : "var(--color-page-bg)", border: "1px solid var(--color-card-border)", color: "var(--color-input-text)" }}>{turn.text}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: "0.8rem", color: "var(--color-sidebar-text)", padding: "12px 16px" }}>No transcript available yet.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selectedParticipant.answers?.length > 0 && (
                <>
                  <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Survey Answers</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {selectedParticipant.answers.map((ans, i) => (
                      <div key={i} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                        <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)", marginBottom: 6 }}>Q{i + 1}. {ans.question_text}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 600, backgroundColor: ans.is_eligible === true ? "rgba(34,197,94,0.12)" : ans.is_eligible === false ? "rgba(239,68,68,0.1)" : "rgba(107,114,128,0.1)", color: ans.is_eligible === true ? "#16a34a" : ans.is_eligible === false ? "#dc2626" : "var(--color-sidebar-text)" }}>{ans.selected_option}</span>
                          {ans.is_eligible === true  && <CheckCircle2 size={13} style={{ color: "#16a34a" }} />}
                          {ans.is_eligible === false && <AlertCircle  size={13} style={{ color: "#dc2626" }} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
          ) : (
            <SectionCard title="Participants" subtitle="People who completed the survey and submitted their details">
              {ad.ad_type?.includes("voicebot") && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <button
                    onClick={handleSyncTranscripts}
                    disabled={syncingTranscripts}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)", cursor: syncingTranscripts ? "not-allowed" : "pointer", fontSize: "0.8rem", fontWeight: 600, color: "var(--color-input-text)", opacity: syncingTranscripts ? 0.6 : 1 }}
                  >
                    {syncingTranscripts ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Syncing…</> : <><RefreshCw size={13} /> Sync Transcripts</>}
                  </button>
                  {syncResult && !syncResult.error && <span style={{ fontSize: "0.78rem", color: "#16a34a" }}>✓ {syncResult.synced} synced, {syncResult.skipped} already up-to-date</span>}
                  {syncResult?.error && <span style={{ fontSize: "0.78rem", color: "#dc2626" }}>{syncResult.error}</span>}
                </div>
              )}
              {participantsLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "32px 0", justifyContent: "center" }}>
                  <Loader2 size={18} style={{ animation: "spin 1s linear infinite", color: "var(--color-accent)" }} />
                  <p style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)" }}>Loading participants…</p>
                </div>
              ) : participants.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <Users size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
                  <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>No participants yet.</p>
                </div>
              ) : (
                <div style={{ borderRadius: 10, border: "1px solid var(--color-card-border)", overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.5fr 1fr 32px", padding: "10px 16px", backgroundColor: "var(--color-page-bg)", borderBottom: "1px solid var(--color-card-border)" }}>
                    {["Name","Age","Sex","Phone","Eligibility",""].map((h) => (
                      <span key={h} style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
                    ))}
                  </div>
                  {participants.map((p, idx) => (
                    <div key={p.id} onClick={() => setSelectedParticipant(p)}
                      style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.5fr 1fr 32px", padding: "12px 16px", cursor: "pointer", borderBottom: idx < participants.length - 1 ? "1px solid var(--color-card-border)" : "none", backgroundColor: "var(--color-card-bg)", transition: "background 0.1s" }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-page-bg)"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--color-card-bg)"}
                    >
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.full_name}</span>
                      <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>{p.age}</span>
                      <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)", textTransform: "capitalize" }}>{p.sex.replace(/_/g," ")}</span>
                      <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>{p.phone}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.75rem", fontWeight: 600, color: p.is_eligible === true ? "#16a34a" : p.is_eligible === false ? "#dc2626" : "var(--color-sidebar-text)" }}>
                        {p.is_eligible === true  && <CheckCircle2 size={12} />}
                        {p.is_eligible === false && <AlertCircle  size={12} />}
                        {p.is_eligible === true ? "Eligible" : p.is_eligible === false ? "Not Eligible" : "Unknown"}
                      </span>
                      <ChevronDown size={14} style={{ color: "var(--color-sidebar-text)", transform: "rotate(-90deg)" }} />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}
        </div>
      )}

      {/* HISTORY */}
      {pageTab === "history" && (
        <div>
          {reviews.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <History size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>No review history yet.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)", marginBottom: 4 }}>
                {reviews.length} entr{reviews.length !== 1 ? "ies" : "y"}
              </p>
              {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Footer refresh ── */}
      <div style={{ paddingTop: 32, paddingBottom: 24 }}>
        <button
          onClick={() => { setLoading(true); load(); }}
          className="btn--ghost"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem" }}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

    </PageWithSidebar>

    {previewDoc && <DocPreviewModal doc={previewDoc} adId={id} onClose={() => setPreviewDoc(null)} />}
    </>
  );
}