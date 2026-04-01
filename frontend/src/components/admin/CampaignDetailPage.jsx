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
import { adsAPI, companyAPI } from "../../services/api";
import {
  ArrowLeft, Megaphone, Globe, Image, Bot, MessageSquare,
  FileText, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Loader2, Target, DollarSign, Users, Layers, Zap, BarChart2,
  MessageCircle, Send, ThumbsUp, ThumbsDown, RefreshCw, Sparkles,
  Download, Eye, Trash2, ClipboardList, Plus, X as XIcon, GripVertical,
  LayoutDashboard, ClipboardCheck, History, MapPin, Copy,
} from "lucide-react";

// ─── Campaign categories that require a questionnaire ─────────────────────────
const QUESTIONNAIRE_CATEGORIES = new Set(["recruitment", "hiring", "survey", "clinical_trial", "research"]);

const QUESTIONNAIRE_KEYWORDS = ["hiring", "recruit", "survey", "clinical", "trial", "research study", "job posting", "job opening", "application", "vacancy", "vacancies", "applicant", "enroll", "enrolment", "participant", "respondent"];

/** Check protocol doc titles first (strongest signal), fall back to campaign title. */
function needsQuestionnaire(ad, docs = []) {
  if (!ad) return false;
  if (QUESTIONNAIRE_CATEGORIES.has(ad.campaign_category)) return true;
  const docText = docs.map((d) => `${d.title ?? ""} ${d.doc_type ?? ""}`).join(" ").toLowerCase();
  if (docText && QUESTIONNAIRE_KEYWORDS.some((kw) => docText.includes(kw))) return true;
  const title = (ad.title ?? "").toLowerCase();
  return QUESTIONNAIRE_KEYWORDS.some((kw) => title.includes(kw));
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
              <XIcon size={18} />
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

const QUESTION_TYPES = [
  { value: "text",             label: "Short Text" },
  { value: "textarea",         label: "Long Text" },
  { value: "yes_no",           label: "Yes / No" },
  { value: "multiple_choice",  label: "Multiple Choice" },
  { value: "scale",            label: "Scale (1–5)" },
];

function newQuestion() {
  return { id: crypto.randomUUID(), text: "", type: "multiple_choice", options: ["", ""], required: true };
}

// ─── Auto-sizing textarea for question text ───────────────────────────────────
function AutoTextarea({ value, onChange, inputBase }) {
  const ref = useRef(null);

  // Resize on mount and whenever value changes externally (e.g. AI generate)
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = ref.current.scrollHeight + "px";
  }, [value]);

  return (
    <textarea
      ref={ref}
      style={{
        ...inputBase, flex: 1, fontWeight: 600,
        backgroundColor: "transparent",
        border: "1px solid transparent",
        transition: "border-color 0.15s",
        resize: "none", overflow: "hidden",
        lineHeight: 1.5, fontFamily: "inherit",
        minHeight: "36px",
      }}
      rows={1}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = e.target.scrollHeight + "px";
      }}
      onFocus={(e) => e.target.style.borderColor = "var(--color-accent)"}
      onBlur={(e) => e.target.style.borderColor = "transparent"}
      placeholder="Enter question text…"
    />
  );
}

// ─── Questionnaire builder / viewer ───────────────────────────────────────────
function QuestionnaireSection({ adId, questionnaire, readOnly, onSaved }) {
  const saved       = questionnaire?.questions ?? [];
  const [questions, setQuestions] = useState(saved.length ? saved : [newQuestion()]);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved_ok,  setSavedOk]   = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState(null);
  const qProgress = useGenerateProgress();

  // keep local state in sync when parent reloads
  useEffect(() => {
    const qs = questionnaire?.questions ?? [];
    setQuestions(qs.length ? qs : [newQuestion()]);
  }, [questionnaire]);

  const updateQ = (id, patch) =>
    setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, ...patch } : q));

  const updateOption = (qId, idx, val) =>
    setQuestions((prev) => prev.map((q) =>
      q.id === qId ? { ...q, options: q.options.map((o, i) => i === idx ? val : o) } : q
    ));

  const addOption = (qId) =>
    setQuestions((prev) => prev.map((q) =>
      q.id === qId ? { ...q, options: [...(q.options ?? []), ""] } : q
    ));

  const removeOption = (qId, idx) =>
    setQuestions((prev) => prev.map((q) =>
      q.id === qId ? { ...q, options: q.options.filter((_, i) => i !== idx) } : q
    ));

  const addQuestion = () => setQuestions((prev) => [...prev, newQuestion()]);

  const removeQuestion = (id) =>
    setQuestions((prev) => prev.length > 1 ? prev.filter((q) => q.id !== id) : prev);

  const save = async () => {
    const incomplete = questions.find((q) => !q.text.trim());
    if (incomplete) { setSaveError("All questions must have text."); return; }
    setSaving(true); setSaveError(null); setSavedOk(false);
    try {
      await adsAPI.updateQuestionnaire(adId, { questions });
      setSavedOk(true);
      if (onSaved) onSaved();
    } catch (err) {
      setSaveError(err.message || "Failed to save questionnaire.");
    } finally {
      setSaving(false);
    }
  };

  const generateWithAI = async () => {
    setAiLoading(true); setAiError(null);
    qProgress.start("Generating questions…", 15000);
    try {
      const updated = await adsAPI.generateQuestionnaire(adId);
      const qs = updated.questionnaire?.questions ?? [];
      if (qs.length) setQuestions(qs);
      qProgress.complete();
      if (onSaved) onSaved();
    } catch (err) {
      qProgress.fail();
      setAiError(err.message || "AI questionnaire generation failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const inputBase = {
    width: "100%", padding: "7px 10px", borderRadius: "7px", fontSize: "0.82rem",
    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", outline: "none", boxSizing: "border-box",
  };

  const hasQuestions = saved.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* AI Generate banner — only for editors */}
      {!readOnly && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={generateWithAI}
            disabled={aiLoading}
            className="btn--accent"
            style={{ display: "inline-flex", alignItems: "center", gap: "7px", opacity: aiLoading ? 0.7 : 1 }}
          >
            {aiLoading
              ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              : <Sparkles size={14} />}
            {aiLoading ? "Generating…" : hasQuestions ? "Regenerate Questions" : "Generate Questions"}
          </button>
          {aiLoading
            ? <InlineProgress progress={qProgress.progress} />
            : (
              <p style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)" }}>
                {hasQuestions
                  ? "Current questions will be replaced based on campaign context and protocol documents."
                  : "MCQ eligibility questions will be generated from your campaign brief and protocol documents."}
              </p>
            )
          }
        </div>
      )}

      {aiError && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
          <p style={{ fontSize: "0.82rem", color: "#ef4444" }}>{aiError}</p>
        </div>
      )}

      <div style={{ height: "1px", backgroundColor: "var(--color-card-border)" }} />

      {questions.map((q, qi) => (
        <div key={q.id} style={{
          borderRadius: "10px", border: "1px solid var(--color-card-border)",
          backgroundColor: "var(--color-card-bg)", overflow: "hidden",
        }}>
          {/* Question header */}
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 14px", borderBottom: "1px solid var(--color-card-border)",
            backgroundColor: "var(--color-page-bg)",
          }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--color-sidebar-text)", flexShrink: 0 }}>
              Q{qi + 1}
            </span>
            {!readOnly ? (
              <>
                <AutoTextarea
                  value={q.text}
                  onChange={(val) => updateQ(q.id, { text: val })}
                  inputBase={inputBase}
                />
                <button
                  onClick={() => removeQuestion(q.id)}
                  disabled={questions.length === 1}
                  style={{ background: "none", border: "none", cursor: questions.length === 1 ? "not-allowed" : "pointer", padding: "4px", color: questions.length === 1 ? "var(--color-card-border)" : "#ef4444", flexShrink: 0, alignSelf: "flex-start", marginTop: "6px" }}
                  title="Delete question"
                >
                  <Trash2 size={14} />
                </button>
              </>
            ) : (
              <span style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", lineHeight: 1.5 }}>{q.text}</span>
            )}
          </div>

          {/* Options */}
          <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {(q.options ?? []).map((opt, oi) => (
              <div key={oi} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "13px", height: "13px", borderRadius: "50%", border: "1px solid var(--color-card-border)", flexShrink: 0 }} />
                {!readOnly ? (
                  <>
                    <input
                      style={{ ...inputBase, flex: 1 }}
                      value={opt}
                      onChange={(e) => updateOption(q.id, oi, e.target.value)}
                      placeholder={`Option ${oi + 1}`}
                    />
                    <button
                      onClick={() => removeOption(q.id, oi)}
                      disabled={(q.options ?? []).length <= 2}
                      style={{ background: "none", border: "none", cursor: (q.options ?? []).length <= 2 ? "not-allowed" : "pointer", color: (q.options ?? []).length <= 2 ? "var(--color-card-border)" : "#ef4444", padding: "4px", flexShrink: 0 }}
                      title="Remove option"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>{opt || <em style={{ color: "var(--color-sidebar-text)" }}>—</em>}</span>
                )}
              </div>
            ))}
            {!readOnly && (
              <button
                onClick={() => addOption(q.id)}
                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", color: "var(--color-accent)", fontSize: "0.75rem", fontWeight: 600, padding: "2px 0", marginTop: "2px" }}
              >
                <Plus size={12} /> Add option
              </button>
            )}
          </div>
        </div>
      ))}

      {!readOnly && (
        <>
          <button
            onClick={addQuestion}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              background: "none", border: "1px dashed var(--color-card-border)",
              borderRadius: "8px", padding: "8px 16px", cursor: "pointer",
              color: "var(--color-accent)", fontSize: "0.8rem", fontWeight: 600,
              width: "100%", justifyContent: "center",
            }}
          >
            <Plus size={13} /> Add Question
          </button>

          {saveError && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
              <p style={{ fontSize: "0.82rem", color: "#ef4444" }}>{saveError}</p>
            </div>
          )}
          {saved_ok && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
              <CheckCircle2 size={14} style={{ color: "#22c55e", flexShrink: 0 }} />
              <p style={{ fontSize: "0.82rem", color: "#22c55e" }}>Changes saved.</p>
            </div>
          )}

          <button
            onClick={save}
            disabled={saving}
            className="btn--accent"
            style={{ display: "inline-flex", alignItems: "center", gap: "8px", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={14} />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </>
      )}

      {readOnly && questions.length === 0 && (
        <p style={{ fontSize: "0.82rem", color: "var(--color-sidebar-text)" }}>No questions added yet.</p>
      )}
    </div>
  );
}

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

// ─── KPI bar chart (mirrors ReviewDetailPage) ────────────────────────────────

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

function QuantKpiChart({ kpis }) {
  const normalized = kpis.map(k =>
    typeof k === "string" ? { metric: k, target: null, context: null } : k
  );
  const nums   = normalized.map(k => extractNumber(k.target) ?? 0);
  const maxVal = Math.max(...nums, 1);
  const BAR_MAX = 88, BAR_MIN = 28;

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "flex-end", gap: 10,
        borderBottom: "2px solid var(--color-card-border)",
      }}>
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
              {k.context && (
                <p style={{ fontSize: "0.6rem", color: "var(--color-sidebar-text)", margin: "2px 0 0", lineHeight: 1.3 }}>{k.context}</p>
              )}
            </div>
          );
        })}
      </div>
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

function DonutChart({ slices, size = 150, thickness = 26 }) {
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
      <div style={{ position: "relative", flexShrink: 0 }}>
        <DonutChart slices={slices} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <DollarSign size={16} style={{ color: "var(--color-accent)" }} />
        </div>
      </div>
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
                <QuantKpiChart kpis={kpis} />
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

// ─── Page-level tabs ──────────────────────────────────────────────────────────
const PAGE_TABS = [
  { key: "overview",      label: "Overview",      icon: LayoutDashboard },
  { key: "strategy",      label: "Strategy",      icon: Layers          },
  { key: "questionnaire", label: "Questionnaire", icon: ClipboardList   },
  { key: "review",        label: "Review",        icon: ClipboardCheck  },
  { key: "history",       label: "History",       icon: History         },
  { key: "publish",       label: "Publish",       icon: Zap             },
];

function PageTabBar({ active, onChange, showQuestionnaireDot, role }) {
  return (
    <div style={{
      display: "flex", borderBottom: "1px solid var(--color-card-border)",
      marginBottom: 28, gap: 0, overflowX: "auto",
    }}>
      {PAGE_TABS.map(({ key, label, icon: Icon }) => {
        const displayLabel = key === "publish" && role === "study_coordinator" ? "Preview" : label;
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
            {displayLabel}
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

// ─── Trial Locations Card ─────────────────────────────────────────────────────
function TrialLocationsCard({ ad, companyLocations, onSave }) {
  // locations = [{ country, city }] flat array
  const [locations, setLocations] = useState(ad.trial_location || []);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState("");

  // Picker state
  const [selCountry, setSelCountry] = useState("");
  const [selCity,    setSelCity]    = useState("");

  useEffect(() => { setLocations(ad.trial_location || []); }, [ad.trial_location]);

  // Group flat array into { country → Set<city> } for display
  const grouped = locations.reduce((acc, loc) => {
    if (!acc[loc.country]) acc[loc.country] = [];
    if (loc.city) acc[loc.country].push(loc.city);
    return acc;
  }, {});
  const groupedCountries = Object.keys(grouped);

  // Cities already added for the selected country
  const addedCitiesForSel = new Set(
    locations.filter((l) => l.country === selCountry && l.city).map((l) => l.city)
  );

  // Available cities from company config for selected country (minus already added)
  const companyCitiesForSel = (
    companyLocations.find((c) => c.country === selCountry)?.cities || []
  ).filter((c) => !addedCitiesForSel.has(c));

  // Whether this country already appears in the flat list (no city entry = whole country)
  const countryHasNoCityEntry = (country) =>
    locations.some((l) => l.country === country && !l.city);

  const handleAdd = () => {
    if (!selCountry) return;
    // Prevent exact duplicate
    const isDup = locations.some(
      (l) => l.country === selCountry && (l.city || "") === (selCity || "")
    );
    if (isDup) { setSelCity(""); return; }
    setLocations((prev) => [...prev, { country: selCountry, city: selCity }]);
    setSelCity("");
    setSaved(false);
  };

  // Remove a specific city entry for a country
  const handleRemoveCity = (country, city) => {
    setLocations((prev) =>
      prev.filter((l) => !(l.country === country && (l.city || "") === (city || "")))
    );
    setSaved(false);
  };

  // Remove all entries for a country
  const handleRemoveCountry = (country) => {
    setLocations((prev) => prev.filter((l) => l.country !== country));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const updated = await adsAPI.update(ad.id, { trial_location: locations });
      onSave(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || "Failed to save locations.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Trial Locations"
      subtitle="Countries and cities where this trial is taking place"
    >
      {/* Grouped display */}
      {groupedCountries.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
          {groupedCountries.map((country) => (
            <div
              key={country}
              style={{
                borderRadius: "10px",
                border: "1px solid var(--color-card-border)",
                overflow: "hidden",
              }}
            >
              {/* Country header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px",
                backgroundColor: "rgba(16,185,129,0.07)",
                borderBottom: grouped[country].length > 0
                  ? "1px solid var(--color-card-border)" : "none",
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", fontWeight: 600, color: "var(--color-accent)" }}>
                  <MapPin size={12} />
                  {country}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveCountry(country)}
                  title="Remove country"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", display: "flex", padding: "2px" }}
                >
                  <XIcon size={13} />
                </button>
              </div>

              {/* City chips */}
              {grouped[country].length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "10px 12px" }}>
                  {grouped[country].map((city) => (
                    <span
                      key={city}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "5px",
                        padding: "3px 9px", borderRadius: "999px", fontSize: "0.76rem",
                        backgroundColor: "var(--color-card-bg)",
                        border: "1px solid var(--color-card-border)",
                        color: "var(--color-text)", fontWeight: 500,
                      }}
                    >
                      {city}
                      <button
                        type="button"
                        onClick={() => handleRemoveCity(country, city)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", padding: 0, display: "flex" }}
                      >
                        <XIcon size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "12px 14px", borderRadius: "8px", marginBottom: "16px",
          border: "1px dashed var(--color-card-border)",
          color: "var(--color-sidebar-text)", fontSize: "0.82rem",
        }}>
          <MapPin size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
          No trial locations assigned yet.
        </div>
      )}

      {/* Add picker */}
      {companyLocations.length === 0 ? (
        <p style={{ fontSize: "0.8rem", color: "var(--color-sidebar-text)", marginBottom: "16px" }}>
          No locations configured in My Company. Add them first under <strong>My Company → Operating Locations</strong>.
        </p>
      ) : (
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "16px", flexWrap: "wrap" }}>
          {/* Country */}
          <div style={{ flex: "1 1 150px" }}>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", marginBottom: "4px" }}>
              Country
            </label>
            <div style={{ position: "relative" }}>
              <select
                value={selCountry}
                onChange={(e) => { setSelCountry(e.target.value); setSelCity(""); }}
                className="field-input"
                style={{ appearance: "none", paddingRight: "28px", marginBottom: 0 }}
              >
                <option value="">Select…</option>
                {companyLocations.map((l) => (
                  <option key={l.country} value={l.country}>{l.country}</option>
                ))}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--color-sidebar-text)", pointerEvents: "none" }} />
            </div>
          </div>

          {/* City */}
          <div style={{ flex: "1 1 150px" }}>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", marginBottom: "4px" }}>
              City <span style={{ fontWeight: 400, opacity: 0.7 }}>(optional)</span>
            </label>
            {selCountry && companyCitiesForSel.length > 0 ? (
              <div style={{ position: "relative" }}>
                <select
                  value={selCity}
                  onChange={(e) => setSelCity(e.target.value)}
                  className="field-input"
                  style={{ appearance: "none", paddingRight: "28px", marginBottom: 0 }}
                >
                  <option value="">Whole country</option>
                  {companyCitiesForSel.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={12} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--color-sidebar-text)", pointerEvents: "none" }} />
              </div>
            ) : (
              <input
                value={selCity}
                onChange={(e) => setSelCity(e.target.value)}
                disabled={!selCountry}
                placeholder={selCountry ? "Enter city (optional)…" : "Select country first"}
                className="field-input"
                style={{ marginBottom: 0 }}
              />
            )}
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!selCountry}
            className="btn--accent"
            style={{ padding: "9px 16px", flexShrink: 0 }}
          >
            <Plus size={14} /> Add
          </button>
        </div>
      )}

      {/* Error */}
      {error && <div className="alert--error mb-3">{error}</div>}

      {/* Save row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "12px" }}>
        {saved && (
          <div className="alert--success py-2 px-3">
            <CheckCircle2 size={13} strokeWidth={2.5} /> Locations saved
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn--accent"
          style={{ padding: "8px 20px" }}
        >
          {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : "Save Locations"}
        </button>
      </div>
    </SectionCard>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────
export default function CampaignDetailPage() {
  return <DetailErrorBoundary><CampaignDetailPageInner /></DetailErrorBoundary>;
}

function CampaignDetailPageInner() {
  const { id }      = useParams();
  const navigate    = useNavigate();

  const [ad,        setAd]        = useState(null);
  const [protoDocs,  setProtoDocs]  = useState([]);
  const [reviews,    setReviews]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

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
  const [hostLoading,     setHostLoading]     = useState(false);
  const [hostError,       setHostError]       = useState(null);
  const [regenLoading,    setRegenLoading]    = useState(false);
  const [regenError,      setRegenError]      = useState(null);
  const [regenInstr,      setRegenInstr]      = useState("");
  const [regenConfirmed,  setRegenConfirmed]  = useState(false);
  const [regenOpen,       setRegenOpen]       = useState(false);
  const [pageTab,         setPageTab]         = useState("overview");
  const [companyLocations, setCompanyLocations] = useState([]);  // [{ country, cities }]

  const genProgress = useGenerateProgress();

  const role = JSON.parse(localStorage.getItem("user") || "{}").role;
  const isStudyCoordinator = role === "study_coordinator";
  const canRegenerate = ["project_manager", "ethics_manager"].includes(role);
  const canGenerate   = isStudyCoordinator || canRegenerate;
  const isPublisher   = role === "publisher";

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

  useEffect(() => {
    companyAPI.getProfile()
      .then((p) => setCompanyLocations(p.locations || []))
      .catch(() => {});
  }, []);

  // ── Action handlers ──────────────────────────────────────────────────────
  const handleGenerateStrategy = async () => {
    setGenLoading(true); setGenError(null);
    try {
      // Step 1 — strategy
      genProgress.start("Generating strategy…", 25000);
      const afterStrategy = await adsAPI.generateStrategy(id);
      setAd(afterStrategy);
      genProgress.complete();

      const adTypes = afterStrategy.ad_type || [];
      const isWebsite  = adTypes.includes("website");
      const hasNonWeb  = adTypes.some(t => t !== "website");

      // Step 2 — website (if campaign type includes website)
      if (isWebsite) {
        setWebsiteLoading(true); setWebsiteError(null);
        genProgress.start("Building landing page…", 35000);
        try {
          const afterWebsite = await adsAPI.generateWebsite(id);
          setAd(afterWebsite);
          genProgress.complete();
        } catch (err) {
          genProgress.fail();
          setWebsiteError(err.message || "Website generation failed.");
        } finally {
          setWebsiteLoading(false);
        }
      }

      // Step 3 — creatives (if campaign includes non-website ad types)
      if (hasNonWeb) {
        setCreativeLoading(true); setCreativeError(null);
        genProgress.start("Generating ad creatives…", 40000);
        try {
          const afterCreatives = await adsAPI.generateCreatives(id);
          setAd(afterCreatives);
          genProgress.complete();
        } catch (err) {
          genProgress.fail();
          setCreativeError(err.message || "Creative generation failed.");
        } finally {
          setCreativeLoading(false);
        }
      }
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

  const handleHostPage = async () => {
    setHostLoading(true); setHostError(null);
    try {
      const updated = await adsAPI.hostPage(id);
      setAd(updated);
    } catch (err) {
      setHostError(err.message || "Hosting failed.");
    } finally {
      setHostLoading(false);
    }
  };

  const handleRegenStrategy = async () => {
    if (!regenInstr.trim()) { setRegenError("Instructions are required."); return; }
    if (!regenConfirmed)    { setRegenError("Please confirm the current strategy will be replaced."); return; }
    setRegenLoading(true); setRegenError(null);
    genProgress.start("Re-writing strategy…", 25000);
    try {
      const updated = await adsAPI.rewriteStrategy(id, { instructions: regenInstr.trim() });
      setAd(updated);
      genProgress.complete();
      setRegenInstr(""); setRegenConfirmed(false); setRegenOpen(false);
    } catch (err) {
      genProgress.fail();
      setRegenError(err.message || "Strategy regeneration failed.");
    } finally {
      setRegenLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await adsAPI.delete(id);
      navigate("/study-coordinator");
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
  const qualifies   = ad && needsQuestionnaire(ad, protoDocs);
  const questEmpty  = !(ad?.questionnaire?.questions?.length > 0);
  const showQDot    = qualifies && questEmpty;

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
    <>
    <PageWithSidebar>

      {/* CSS for spinner */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

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
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleteLoading} className="btn--ghost">
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
                {deleteLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />}
                Delete Campaign
              </button>
            </div>
          </div>
        </div>
      )}

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
              {role?.replace(/_/g, " ")} · Campaign
            </p>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", lineHeight: 1.3, margin: 0 }}>
              {ad.title}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <CampaignStatusBadge status={ad.status} />
            {role === "study_coordinator" && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)",
                  borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", color: "#f87171", fontSize: "0.8rem", fontWeight: 500,
                }}
              >
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </div>

        {/* stats row */}
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", position: "relative" }}>
          <div>
            <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Created</p>
            <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>{new Date(ad.created_at).toLocaleDateString()}</p>
          </div>
          {ad.budget && (
            <div>
              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Budget</p>
              <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>${ad.budget.toLocaleString()}</p>
            </div>
          )}
          {(ad.trial_start_date || ad.trial_end_date || ad.duration) && (
            <div>
              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Duration</p>
              {ad.trial_start_date && ad.trial_end_date ? (
                <>
                  <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff" }}>
                    {new Date(ad.trial_start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {" – "}
                    {new Date(ad.trial_end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  {ad.duration && (
                    <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{ad.duration.split("(")[0].trim()}</p>
                  )}
                </>
              ) : (
                <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>{ad.duration}</p>
              )}
            </div>
          )}
          {ad.patients_required && (
            <div>
              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Patients Required</p>
              <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>{ad.patients_required.toLocaleString()}</p>
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
                {ad.ad_type.map((t) => <AdTypeChip key={t} type={t} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Page tab navigation ── */}
      <PageTabBar active={pageTab} onChange={setPageTab} showQuestionnaireDot={showQDot} role={role} />

      {/* ══ OVERVIEW tab ══════════════════════════════════════════════════════ */}
      {pageTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          <SectionCard title="Campaign Progress">
            <StatusTimeline status={ad.status} />
          </SectionCard>

          <SectionCard title="Campaign Details">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "20px" }}>
              <div>
                <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Campaign Type</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {ad.ad_type?.map((t) => <AdTypeChip key={t} type={t} />)}
                </div>
              </div>
              {(ad.campaign_category || qualifies) && (
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Category</p>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: "5px",
                    padding: "4px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 500,
                    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)",
                    color: "var(--color-input-text)", textTransform: "capitalize",
                  }}>
                    <ClipboardList size={11} style={{ color: "var(--color-accent)" }} />
                    {ad.campaign_category ? ad.campaign_category.replace("_", " ") : "hiring / recruitment"}
                  </span>
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
              {ad.patients_required && (
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Patients Required</p>
                  <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)", fontWeight: 600 }}>
                    {ad.patients_required.toLocaleString()} patients
                  </p>
                </div>
              )}
              {(ad.trial_start_date || ad.trial_end_date) && (
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Trial Period</p>
                  {ad.trial_start_date && (
                    <p style={{ fontSize: "0.8rem", color: "var(--color-input-text)" }}>
                      <span style={{ fontWeight: 600 }}>Start:</span>{" "}
                      {new Date(ad.trial_start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                  {ad.trial_end_date && (
                    <p style={{ fontSize: "0.8rem", color: "var(--color-input-text)", marginTop: "2px" }}>
                      <span style={{ fontWeight: 600 }}>End:</span>{" "}
                      {new Date(ad.trial_end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                  {ad.duration && (
                    <p style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)", marginTop: "4px" }}>
                      {ad.duration.split("(")[0].trim()}
                    </p>
                  )}
                </div>
              )}
              {ad.trial_location?.length > 0 && (
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Trial Locations</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {ad.trial_location.map((loc, i) => (
                      <p key={i} style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>
                        {[loc.city, loc.country].filter(Boolean).join(", ")}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Trial Locations — study_coordinator only */}
          {role === "study_coordinator" && (
            <TrialLocationsCard
              ad={ad}
              companyLocations={companyLocations}
              onSave={(updated) => setAd(updated)}
            />
          )}

          {/* Protocol Docs + Budget Distribution — 2-col when both exist */}
          {(() => {
            const hasBudget = !!(ad.strategy_json?.budget_allocation && Object.keys(ad.strategy_json.budget_allocation).length > 0);
            return (
              <div style={{ display: "grid", gridTemplateColumns: hasBudget ? "1fr 1fr" : "1fr", gap: 16, alignItems: "start" }}>
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {protoDocs.map((doc) => (
                        <div
                          key={doc.id}
                          onClick={() => doc.file_path && setPreviewDoc(doc)}
                          style={{
                            display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px",
                            borderRadius: "8px", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)",
                            cursor: doc.file_path ? "pointer" : "default", transition: "border-color 0.15s",
                          }}
                          onMouseEnter={(e) => { if (doc.file_path) e.currentTarget.style.borderColor = "var(--color-accent)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-card-border)"; }}
                        >
                          <div style={{ width: "32px", height: "32px", borderRadius: "6px", flexShrink: 0, backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <FileText size={14} style={{ color: "var(--color-accent)" }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</p>
                            <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                              {doc.doc_type?.replace(/_/g, " ")}{doc.file_path && ` · ${doc.file_path.split("/").pop()}`}
                            </p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            {doc.priority && (
                              <span style={{ fontSize: "0.65rem", fontWeight: 600, padding: "2px 6px", borderRadius: "4px", backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)", color: "var(--color-accent)", border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.2)" }}>
                                Priority {doc.priority}
                              </span>
                            )}
                            {doc.file_path && <Eye size={13} style={{ color: "var(--color-sidebar-text)" }} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
                {hasBudget && (
                  <SectionCard title="Budget Distribution">
                    <BudgetDonut strategy={ad.strategy_json} />
                  </SectionCard>
                )}
              </div>
            );
          })()}

          {/* Questionnaire callout */}
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
                  {questEmpty ? "No questions yet — click to set up" : `${ad.questionnaire.questions.length} question${ad.questionnaire.questions.length !== 1 ? "s" : ""} ready`}
                </p>
              </div>
              <ArrowLeft size={14} style={{ color: "var(--color-sidebar-text)", transform: "rotate(180deg)" }} />
            </div>
          )}

          {/* Generated Assets preview — shown to all roles whenever content exists */}
          {(ad.output_url || ad.output_files?.length > 0) && (
            <SectionCard title="Generated Assets" subtitle="Preview content produced for this campaign">
              {ad.output_url && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 18px", borderRadius: "10px", marginBottom: ad.output_files?.length > 0 ? "16px" : 0,
                  border: "1px solid rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.06)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Globe size={16} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)" }}>Landing Page</p>
                      <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: "2px" }}>Self-contained HTML · brand-styled · responsive</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <a href={adsAPI.websitePreviewUrl(id)} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600, backgroundColor: "var(--color-accent)", color: "#fff", textDecoration: "none", border: "none" }}>
                      <Eye size={13} /> Preview
                    </a>
                    <a href={adsAPI.websiteDownloadUrl(id)} download="landing-page.html" style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)", color: "var(--color-input-text)", textDecoration: "none" }}>
                      <Download size={13} /> Download
                    </a>
                  </div>
                </div>
              )}
              {ad.output_files?.length > 0 && (
                <div>
                  <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-sidebar-text)", marginBottom: "12px" }}>Ad Creatives ({ad.output_files.length})</p>
                  <CreativesViewer creatives={ad.output_files} />
                </div>
              )}
            </SectionCard>
          )}

        </div>
      )}

      {/* ══ STRATEGY tab ══════════════════════════════════════════════════════ */}
      {pageTab === "strategy" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Generate (draft) — Study Coordinator only */}
          {ad.status === "draft" && isStudyCoordinator && (
            <SectionCard
              title="Generate Marketing Strategy"
              subtitle="Analyses your company documents and campaign brief to create a tailored strategy"
            >
              {genError && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "16px" }}>
                  <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                  <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{genError}</p>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <ActionButton onClick={handleGenerateStrategy} loading={genLoading} icon={<Zap size={14} />}>
                  {genLoading ? "Generating…" : "Generate Strategy"}
                </ActionButton>
                {genLoading
                  ? <InlineProgress progress={genProgress.progress} />
                  : <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)" }}>Uses your trained Curator skill · typical time: 15–30 s</p>
                }
              </div>
            </SectionCard>
          )}

          {/* Strategy viewer */}
          {hasStrategy && (
            <SectionCard
              title="Marketing Strategy"
              subtitle="Generated from company and protocol documents"
            >
              {ad.strategy_json ? (
                <StrategyViewer strategy={ad.strategy_json} />
              ) : (
                <p style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)" }}>Strategy is being generated…</p>
              )}
            </SectionCard>
          )}

          {/* Regenerate — Project Manager and Ethics Manager only */}
          {hasStrategy && canRegenerate && (
            <SectionCard
              title="Regenerate Strategy"
              subtitle="Replace the current strategy using your instructions"
            >
              {!regenOpen ? (
                <button
                  onClick={() => setRegenOpen(true)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "8px",
                    background: "none", border: "1px solid var(--color-card-border)",
                    borderRadius: "8px", padding: "7px 14px", cursor: "pointer",
                    color: "var(--color-sidebar-text)", fontSize: "0.8rem", fontWeight: 500,
                  }}
                >
                  <Sparkles size={13} style={{ color: "var(--color-accent)" }} />
                  Rewrite Strategy…
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.3)" }}>
                    <Sparkles size={14} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", lineHeight: 1.5 }}>
                      This will <strong style={{ color: "var(--color-input-text)" }}>replace the entire strategy</strong> using your instructions as guidance. The current strategy will be overwritten and the change will appear in the audit trail.
                    </p>
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: "6px" }}>Your Instructions *</label>
                    <textarea
                      style={{
                        width: "100%", padding: "8px 12px", borderRadius: "8px", fontSize: "0.85rem",
                        border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
                        color: "var(--color-input-text)", outline: "none", boxSizing: "border-box",
                        resize: "vertical", minHeight: "110px", fontFamily: "inherit",
                      }}
                      value={regenInstr}
                      onChange={(e) => setRegenInstr(e.target.value)}
                      placeholder="e.g. Shift focus from social media to B2B channels. Reduce influencer spend to under 10%. Keep the same target audience but adopt a more professional tone."
                    />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={regenConfirmed}
                      onChange={(e) => setRegenConfirmed(e.target.checked)}
                      style={{ width: 15, height: 15, accentColor: "var(--color-accent)", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>
                      I understand the current strategy will be permanently replaced
                    </span>
                  </label>
                  {regenError && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                      <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
                      <p style={{ fontSize: "0.82rem", color: "#ef4444" }}>{regenError}</p>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <ActionButton onClick={handleRegenStrategy} loading={regenLoading} disabled={!regenConfirmed} icon={<Sparkles size={14} />}>
                      {regenLoading ? "Re-writing… (15–30 s)" : "Trigger AI Re-Strategy"}
                    </ActionButton>
                    {regenLoading
                      ? <InlineProgress progress={genProgress.progress} />
                      : (
                        <button
                          onClick={() => { setRegenOpen(false); setRegenError(null); setRegenInstr(""); setRegenConfirmed(false); }}
                          className="btn--ghost"
                          style={{ fontSize: "0.8rem" }}
                        >
                          Cancel
                        </button>
                      )
                    }
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* Submit for review — Study Coordinator only */}
          {ad.status === "strategy_created" && isStudyCoordinator && (
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

          {/* Empty state */}
          {!hasStrategy && ad.status !== "draft" && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Layers size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>Strategy not yet generated for this campaign.</p>
            </div>
          )}

        </div>
      )}

      {/* ══ QUESTIONNAIRE tab ═════════════════════════════════════════════════ */}
      {pageTab === "questionnaire" && (
        <div>
          {qualifies ? (
            <>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-input-text)", margin: 0 }}>
                  Eligibility Questionnaire
                </h2>
                <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", marginTop: 4 }}>
                  {ad.campaign_category ? ad.campaign_category.replace("_", " ") + " campaign" : "Detected from campaign title"} — define the questions participants will answer
                </p>
              </div>
              <QuestionnaireSection
                adId={id}
                questionnaire={ad.questionnaire}
                readOnly={isPublisher}
                onSaved={load}
              />
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <ClipboardList size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>This campaign type does not require a questionnaire.</p>
            </div>
          )}
        </div>
      )}

      {/* ══ REVIEW tab ════════════════════════════════════════════════════════ */}
      {pageTab === "review" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {canReview && (
            <SectionCard
              title="Submit Your Review"
              subtitle="Add your human review — approve, request revisions, or flag ethical concerns"
            >
              <ReviewPanel adId={id} onSubmitted={handleReviewSubmitted} />
            </SectionCard>
          )}

          {(ad.website_reqs || ad.ad_details) && (
            <SectionCard title="Reviewer Output" subtitle="Structured requirements extracted by the Reviewer AI">
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {ad.website_reqs && (
                  <div>
                    <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-accent)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Globe size={12} /> Website Requirements
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
                      {Object.entries(ad.website_reqs).map(([key, val]) => (
                        <div key={key} style={{ padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)" }}>
                          <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "capitalize", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>{key.replace(/_/g, " ")}</p>
                          <GenericValue value={val} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {ad.ad_details && (
                  <div>
                    <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-accent)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Layers size={12} /> Ad Specifications
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
                      {Object.entries(ad.ad_details).map(([key, val]) => (
                        <div key={key} style={{ padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)" }}>
                          <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "capitalize", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>{key.replace(/_/g, " ")}</p>
                          <GenericValue value={val} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {!canReview && !(ad.website_reqs || ad.ad_details) && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <ClipboardCheck size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>
                Campaign is <strong style={{ color: "var(--color-input-text)" }}>{ad.status}</strong> — no review activity yet.
              </p>
            </div>
          )}

        </div>
      )}

      {/* ══ HISTORY tab ═══════════════════════════════════════════════════════ */}
      {pageTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {reviews.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <History size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>No review history yet.</p>
            </div>
          ) : (
            <SectionCard
              title="Review History"
              subtitle={`${reviews.length} entr${reviews.length !== 1 ? "ies" : "y"} on record`}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ══ PUBLISH tab ═══════════════════════════════════════════════════════ */}
      {pageTab === "publish" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Generate Ad Creatives */}
          {(canRegenerate ? ad.status !== "draft" : !!ad.output_files?.length) && (
            <SectionCard
              title="Ad Creatives"
              subtitle="Campaign copy and visuals produced from your strategy"
            >
              {creativeError && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "16px" }}>
                  <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                  <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{creativeError}</p>
                </div>
              )}
              {canRegenerate && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: ad.output_files?.length ? "24px" : 0 }}>
                  <ActionButton onClick={handleGenerateCreatives} loading={creativeLoading} icon={<Sparkles size={14} />}>
                    {creativeLoading ? "Generating…" : ad.output_files?.length ? "Regenerate Creatives" : "Generate Ad Creatives"}
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
              )}
              {ad.output_files?.length > 0 && <CreativesViewer creatives={ad.output_files} />}
            </SectionCard>
          )}

          {/* Generate Website */}
          {ad.ad_type?.includes("website") && (canRegenerate ? ad.status !== "draft" : !!ad.output_url) && (
            <SectionCard
              title="Landing Page"
              subtitle="Brand-styled HTML page generated from your strategy and website requirements"
            >
              {websiteError && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "16px" }}>
                  <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                  <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{websiteError}</p>
                </div>
              )}
              {canRegenerate && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: ad.output_url ? "20px" : 0 }}>
                  <ActionButton onClick={handleGenerateWebsite} loading={websiteLoading} icon={<Globe size={14} />}>
                    {websiteLoading ? "Generating…" : ad.output_url ? "Regenerate Website" : "Generate Website"}
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
              )}
              {ad.output_url && (
                <>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 18px", borderRadius: "10px",
                    border: "1px solid rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.06)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Globe size={16} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)" }}>Landing page ready</p>
                        <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: "2px" }}>Self-contained HTML · brand-styled · responsive</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <a href={adsAPI.websitePreviewUrl(id)} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600, backgroundColor: "var(--color-accent)", color: "#fff", textDecoration: "none", border: "none" }}>
                        <Eye size={13} /> Preview
                      </a>
                      <a href={adsAPI.websiteDownloadUrl(id)} download="landing-page.html" style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)", color: "var(--color-input-text)", textDecoration: "none" }}>
                        <Download size={13} /> Download
                      </a>
                      {isPublisher && (
                        <ActionButton onClick={handleHostPage} loading={hostLoading} icon={<Globe size={13} />}>
                          {hostLoading ? "Hosting…" : ad.hosted_url ? "Re-host" : "Host"}
                        </ActionButton>
                      )}
                    </div>
                  </div>
                  {isPublisher && hostError && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginTop: "12px" }}>
                      <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                      <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{hostError}</p>
                    </div>
                  )}
                  {isPublisher && ad.hosted_url && (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "12px", padding: "10px 14px", borderRadius: "8px", backgroundColor: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
                      <Globe size={14} style={{ color: "#22c55e", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginBottom: "2px" }}>Hosted at</p>
                        <a href={ad.hosted_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.82rem", color: "var(--color-accent)", wordBreak: "break-all", textDecoration: "none", fontWeight: 500 }}>
                          {window.location.origin}{ad.hosted_url}
                        </a>
                      </div>
                      <button onClick={() => navigator.clipboard.writeText(window.location.origin + ad.hosted_url)} title="Copy URL" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", padding: "4px", flexShrink: 0 }}>
                        <Copy size={13} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </SectionCard>
          )}

          {/* Publish — Publisher only */}
          {ad.status === "approved" && isPublisher && (
            <SectionCard title="Publish Campaign" subtitle="Campaign has been approved — ready to go live">
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

          {/* Analytics */}
          {isPublished && (
            <SectionCard title="Analytics" subtitle="Campaign is live — view performance data">
              <Link to="/study-coordinator/analytics" className="btn--accent" style={{ display: "inline-flex" }}>
                View Analytics
              </Link>
            </SectionCard>
          )}

          {/* Empty state */}
          {isPublisher && ad.status !== "approved" && ad.status !== "published" && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Zap size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>
                Campaign must be <strong style={{ color: "var(--color-input-text)" }}>approved</strong> before publishing.
              </p>
            </div>
          )}
          {isStudyCoordinator && ad.status === "draft" && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Zap size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>
                Generate a <strong style={{ color: "var(--color-input-text)" }}>strategy</strong> first to unlock preview.
              </p>
            </div>
          )}

        </div>
      )}

      {/* ── Footer refresh ── */}
      <div style={{ paddingTop: 32, paddingBottom: 24 }}>
        <button
          onClick={() => { setLoading(true); load(); }}
          className="btn--ghost"
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem" }}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

    </PageWithSidebar>

    {previewDoc && <DocPreviewModal doc={previewDoc} adId={id} onClose={() => setPreviewDoc(null)} />}
    </>
  );
}