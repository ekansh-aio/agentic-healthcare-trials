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
import { adsAPI, companyAPI, surveyAPI } from "../../services/api";
import {
  ArrowLeft, Megaphone, Globe, Image, Bot, MessageSquare,
  FileText, Check, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Loader2, Target, DollarSign, Users, Layers, Zap, BarChart2,
  MessageCircle, Send, ThumbsUp, ThumbsDown, RefreshCw, Sparkles,
  Download, Eye, Trash2, ClipboardList, Plus, X as XIcon, GripVertical,
  LayoutDashboard, ClipboardCheck, History, MapPin, Copy, PenLine,
  Mic, PhoneCall, PhoneOff, Volume2, Wand2, Phone, Pencil,
} from "lucide-react";

// ─── Campaign categories that require a questionnaire ─────────────────────────
const QUESTIONNAIRE_CATEGORIES = new Set(["recruitment", "hiring", "survey", "clinical_trial", "research"]);

const QUESTIONNAIRE_KEYWORDS = ["hiring", "recruit", "survey", "clinical", "trial", "research study", "job posting", "job opening", "application", "vacancy", "vacancies", "applicant", "enroll", "enrolment", "participant", "respondent"];

/** Check protocol doc titles first (strongest signal), fall back to campaign title. */
function needsQuestionnaire(ad, protoDocs) {
  if (!ad) return false;
  if (QUESTIONNAIRE_CATEGORIES.has(ad.campaign_category)) return true;
  const titles = [
    ad.title || "",
    ...(protoDocs || []).map((d) => d.title || ""),
  ].join(" ").toLowerCase();
  return QUESTIONNAIRE_KEYWORDS.some((kw) => titles.includes(kw));
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
  const [pdfError,    setPdfError]    = useState(false);

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
          {mode === "pdf" && !pdfError && (
            <iframe
              src={url}
              title={doc.title}
              style={{ width: "100%", height: "100%", border: "none", display: "block", minHeight: 560 }}
              onError={() => setPdfError(true)}
            />
          )}
          {mode === "pdf" && pdfError && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "48px 24px", textAlign: "center" }}>
              <FileText size={40} style={{ color: "var(--color-sidebar-text)", opacity: 0.5 }} />
              <p style={{ color: "var(--color-input-text)", fontWeight: 600, fontSize: "0.95rem" }}>Could not load PDF preview</p>
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.82rem", maxWidth: 340 }}>The file may still be accessible via download.</p>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", textDecoration: "none", backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)", border: "1px solid var(--color-accent)", color: "var(--color-accent)" }}>
                <Download size={15} /> Open PDF
              </a>
            </div>
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
  return { id: crypto.randomUUID(), text: "", type: "multiple_choice", options: ["", ""], correct_option: null, required: true };
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
function QuestionnaireSection({ adId, questionnaire, readOnly, showAI = true, onSaved }) {
  const saved       = questionnaire?.questions ?? [];
  const [questions, setQuestions] = useState(saved.length ? saved : [newQuestion()]);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved_ok,  setSavedOk]   = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState(null);
  // per-question rewrite state: { [qId]: { open, prompt, loading, error } }
  const [rewriteStates, setRewriteStates] = useState({});
  const qProgress = useGenerateProgress();

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

  const setCorrectOption = (qId, idx) =>
    setQuestions((prev) => prev.map((q) =>
      q.id === qId ? { ...q, correct_option: q.correct_option === idx ? null : idx } : q
    ));

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
      setQuestions((prev) => prev.map((item) => item.id === q.id ? { ...item, ...updated, id: q.id } : item));
      setRewriteStates((prev) => ({ ...prev, [q.id]: { open: false, prompt: "", loading: false, error: null } }));
    } catch (err) {
      setRewriteStates((prev) => ({ ...prev, [q.id]: { ...prev[q.id], loading: false, error: err.message || "Rewrite failed." } }));
    }
  };

  const inputBase = {
    width: "100%", padding: "7px 10px", borderRadius: "7px", fontSize: "0.82rem",
    border: "1.5px solid var(--color-input-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", outline: "none", boxSizing: "border-box",
  };

  const hasQuestions = saved.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* AI Generate banner — SC only */}
      {!readOnly && showAI && (
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

      {questions.map((q, qi) => {
        const rw = rewriteStates[q.id] ?? {};
        return (
        <div key={q.id} style={{
          borderRadius: "10px", border: "1.5px solid var(--color-input-border)",
          backgroundColor: "var(--color-card-bg)", overflow: "hidden",
        }}>
          {/* Question header */}
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 14px", borderBottom: "1.5px solid var(--color-input-border)",
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
                {/* Rewrite with AI button — SC only */}
                <>
                  {showAI && (
                    <button
                      onClick={() => toggleRewrite(q.id)}
                      title="Rewrite this question with AI"
                      style={{
                        flexShrink: 0, background: rw.open ? "var(--color-accent-subtle)" : "none",
                        border: `1px solid ${rw.open ? "var(--color-accent)" : "var(--color-card-border)"}`,
                        borderRadius: "7px", padding: "5px 9px", cursor: "pointer",
                        display: "inline-flex", alignItems: "center", gap: 5,
                        color: rw.open ? "var(--color-accent)" : "var(--color-sidebar-text)",
                        fontSize: "0.72rem", fontWeight: 600,
                      }}
                    >
                      <Sparkles size={13} style={{ color: rw.open ? "var(--color-accent)" : "#6b7280" }} />
                    </button>
                  )}
                  <button
                    onClick={() => removeQuestion(q.id)}
                    disabled={questions.length === 1}
                    style={{ background: "none", border: "none", cursor: questions.length === 1 ? "not-allowed" : "pointer", padding: "4px", color: questions.length === 1 ? "var(--color-card-border)" : "#ef4444", flexShrink: 0 }}
                    title="Delete question"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              </>
            ) : (
              <span style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", lineHeight: 1.5 }}>{q.text}</span>
            )}
          </div>

          {/* Per-question AI rewrite panel — SC only */}
          {!readOnly && showAI && rw.open && (
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

          {/* Options */}
          <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {(q.options ?? []).map((opt, oi) => {
              const isCorrect = q.correct_option === oi;
              return (
              <div key={oi} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {/* Correct-option tick */}
                <button
                  type="button"
                  title={isCorrect ? "Correct answer (click to unset)" : "Mark as correct answer"}
                  onClick={() => !readOnly && setCorrectOption(q.id, oi)}
                  style={{
                    flexShrink: 0, width: 20, height: 20, borderRadius: "50%",
                    border: `2px solid ${isCorrect ? "#22c55e" : "var(--color-input-border)"}`,
                    backgroundColor: isCorrect ? "rgba(34,197,94,0.15)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: readOnly ? "default" : "pointer",
                    transition: "all 0.15s",
                    padding: 0,
                  }}
                >
                  {isCorrect && <Check size={11} strokeWidth={3} style={{ color: "#22c55e" }} />}
                </button>
                {!readOnly ? (
                  <>
                    <input
                      style={{ ...inputBase, flex: 1, borderColor: isCorrect ? "rgba(34,197,94,0.3)" : undefined }}
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
                  <span style={{ fontSize: "0.82rem", color: isCorrect ? "#22c55e" : "var(--color-input-text)", fontWeight: isCorrect ? 600 : 400 }}>
                    {opt || <em style={{ color: "var(--color-sidebar-text)" }}>—</em>}
                  </span>
                )}
              </div>
              );
            })}
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
        );
      })}

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
  // "generating" sits between draft and strategy_created in the timeline
  if (status === "generating") return 0;
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

// Keys handled by dedicated UI — excluded from the catch-all block
const KNOWN_STRATEGY_KEYS = new Set([
  "executive_summary", "target_audience", "messaging", "channels",
  "content_plan", "kpis", "budget_breakdown", "budget_allocation",
  "funnel_stages", "ad_upload_specs", "social_content",
]);

// ─── Strategy Viewer — PDF-inspired design system ────────────────────────────
// Dark hero · teal accents · section bars · animated charts

/** "—— LABEL" section divider matching the REIMAGINE 4 PDF style */
function SBar({ label }) {
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
function SCard({ children, style = {} }) {
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
function SCardHead({ icon, label }) {
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

function ChannelRow({ ch, index }) {
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
const DONUT_PALETTE = [
  "var(--color-accent)", "#6366f1", "#f59e0b", "#ec4899",
  "#14b8a6", "#8b5cf6", "#f97316", "#0ea5e9",
];

function detectKpiCategory(text) {
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

// ─── KPI chart (horizontal bars — PDF-style) ─────────────────────────────────
function QuantKpiChart({ kpis }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

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
function DonutChart({ slices, size = 130, thickness = 22 }) {
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
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <DonutChart slices={slices} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <DollarSign size={15} style={{ color: "var(--color-accent)" }} />
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color, flexShrink: 0 }} />
            <p style={{ flex: 1, fontSize: "0.76rem", color: "var(--color-input-text)", fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.label.replace(/_/g, " ")}
            </p>
            <p style={{ fontSize: "0.82rem", fontWeight: 800, color: s.color, flexShrink: 0, margin: 0 }}>{s.pct}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Funnel stages — PDF-style 3-column cards ────────────────────────────────
const FUNNEL_META = [
  { accent: "var(--color-accent)", bg: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)", border: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)", badge: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12)" },
  { accent: "#6366f1", bg: "rgba(99,102,241,0.05)", border: "rgba(99,102,241,0.22)", badge: "rgba(99,102,241,0.1)" },
  { accent: "#0d1b2e", bg: "rgba(13,27,46,0.04)",   border: "rgba(13,27,46,0.14)",   badge: "rgba(13,27,46,0.07)" },
];

function FunnelStages({ stages }) {
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
function AdUploadSpecs({ specs }) {
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

function StrategyViewer({ strategy, ad, onRetry }) {
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

            {/* Executive Summary */}
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

            {/* Right: Audience + Messaging stacked */}
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

                    {/* Tone — callout block, never a pill */}
                    {messaging.tone && (
                      <div style={{ padding: "14px 18px", borderTop: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                        <p style={{ fontSize: "0.58rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-sidebar-text)", marginBottom: 6 }}>Tone</p>
                        <p style={{ fontSize: "0.78rem", color: "var(--color-input-text)", lineHeight: 1.6, margin: 0 }}>{messaging.tone}</p>
                      </div>
                    )}

                    {/* Key phrases — small chips (usually short words) */}
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

                    {/* CTA — action button style */}
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
          <div style={{ display: "grid", gridTemplateColumns: budgetData ? "1fr 280px" : "1fr", gap: 14, alignItems: "start" }}>

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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {Object.entries(social_content).map(([platform, content]) => (
              <SCard key={platform}>
                <SCardHead icon={<Send size={13} />} label={platform} />
                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Caption */}
                  {content.caption && (
                    <div>
                      <p style={{ fontSize: "0.62rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-accent)", marginBottom: 6 }}>Caption</p>
                      <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)", lineHeight: 1.6, margin: 0 }}>{content.caption}</p>
                    </div>
                  )}

                  {/* Hashtags */}
                  {content.hashtags && (
                    <div>
                      <p style={{ fontSize: "0.62rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-accent)", marginBottom: 6 }}>Hashtags</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {content.hashtags.split(/\s+/).filter(h => h).map((h, i) => (
                          <span key={i} style={{
                            fontSize: "0.72rem", padding: "3px 9px", borderRadius: 999, fontWeight: 600,
                            backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
                            color: "var(--color-accent)",
                          }}>{h.startsWith("#") ? h : `#${h}`}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Launch Schedule */}
                  {content.launch_schedule && (
                    <div style={{
                      padding: "10px 13px", borderRadius: 10,
                      backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)",
                      border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.18)",
                    }}>
                      <p style={{ fontSize: "0.62rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-accent)", marginBottom: 7 }}>Recommended Launch Window</p>
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
                    </div>
                  )}

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
  const [form, setForm]       = useState({ review_type: "strategy", status: "approved", comments: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const submit = async () => {
    if (!form.comments.trim()) { setError("Comment is required."); return; }
    setLoading(true); setError(null);
    try {
      await adsAPI.createReview(adId, form);
      setForm({ review_type: "strategy", status: "approved", comments: "" });
      onSubmitted();
    } catch (err) {
      setError(err.message || "Failed to submit review.");
    } finally {
      setLoading(false);
    }
  };

  const fieldStyle = {
    padding: "8px 10px", borderRadius: "8px", fontSize: "0.83rem",
    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <select
          value={form.review_type}
          onChange={(e) => setForm((p) => ({ ...p, review_type: e.target.value }))}
          style={{ ...fieldStyle, flexShrink: 0 }}
        >
          <option value="strategy">Strategy</option>
          <option value="ethics">Ethics</option>
          <option value="performance">Performance</option>
        </select>

        <select
          value={form.status}
          onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
          style={{ ...fieldStyle, flexShrink: 0 }}
        >
          <option value="approved">Approve</option>
          <option value="revision">Request Revision</option>
          <option value="rejected">Reject</option>
        </select>

        <input
          type="text"
          placeholder="Add a comment…"
          value={form.comments}
          onChange={(e) => setForm((p) => ({ ...p, comments: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ ...fieldStyle, flex: 1, minWidth: 180 }}
        />

        <button
          onClick={submit}
          disabled={loading}
          className="btn--accent"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, opacity: loading ? 0.7 : 1 }}
        >
          {loading ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={13} />}
          Submit
        </button>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: "#ef4444" }}>
          <AlertCircle size={13} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}
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
      display: "flex", alignItems: "baseline", gap: 10,
      padding: "10px 14px", borderRadius: 8,
      border: "1px solid var(--color-card-border)",
      backgroundColor: "var(--color-card-bg)",
    }}>
      <span style={{
        fontSize: "0.7rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999,
        flexShrink: 0, textTransform: "capitalize",
        backgroundColor: statusColor + "22", color: statusColor, border: `1px solid ${statusColor}44`,
      }}>
        {review.status}
      </span>
      <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", flexShrink: 0, textTransform: "capitalize" }}>
        {review.review_type}
      </span>
      {review.comments && (
        <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)", flex: 1, lineHeight: 1.5 }}>
          {review.comments}
        </span>
      )}
      {review.created_at && (
        <span style={{ fontSize: "0.68rem", color: "var(--color-sidebar-text)", flexShrink: 0, marginLeft: "auto" }}>
          {new Date(review.created_at).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

// ─── Creatives Viewer ─────────────────────────────────────────────────────────
function CreativesViewer({ creatives }) {
  const [popover, setPopover] = useState(null); // { url, top, left }

  const openPopover = (e, url) => {
    setPopover({ url });
  };

  if (!creatives?.length) return null;

  return (
    <>
      {/* Click-anchored popover */}
      {popover && (
        <>
          <div
            onClick={() => setPopover(null)}
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
          />
          <div
            style={{
              position: "fixed", zIndex: 1000,
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              width: 420,
              backgroundColor: "var(--color-card-bg)",
              border: "1px solid var(--color-card-border)",
              borderRadius: "14px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={popover.url}
              alt="Ad creative"
              style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: 360 }}
            />
            <button
              onClick={() => setPopover(null)}
              style={{
                position: "absolute", top: 8, right: 8,
                background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "6px",
                padding: "3px 6px", cursor: "pointer", color: "#fff",
                display: "flex", alignItems: "center",
              }}
            >
              <XIcon size={13} />
            </button>
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" }}>
        {creatives.map((c, i) => (
          <div key={i} style={{
            borderRadius: "16px",
            border: "2px solid var(--color-card-border)",
            backgroundColor: "var(--color-card-bg)",
            boxShadow: "0 4px 18px rgba(0,0,0,0.10)",
            overflow: "visible",
            padding: "10px 10px 0 10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}>
            {/* Image */}
            <div style={{
              position: "relative",
              backgroundColor: "var(--color-page-bg)",
              overflow: "hidden",
              maxHeight: "260px",
              maxWidth: "100%",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "center",
            }}>
              {c.image_url ? (
                <img
                  src={c.image_url}
                  alt={c.headline}
                  style={{ maxHeight: "260px", maxWidth: "100%", width: "auto", height: "auto", display: "block" }}
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
                  onClick={(e) => openPopover(e, c.image_url)}
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
            <div style={{ padding: "16px", textAlign: "center", width: "100%" }}>
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
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

// ─── Australian ElevenLabs voice catalogue (mirrors AUSTRALIAN_VOICES in voicebot_agent.py) ──
const VOICE_CATALOGUE = [
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", desc: "Warm · friendly · Australian female" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", desc: "Casual · approachable · Australian male" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura",   desc: "Upbeat · energetic · Australian female" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris",   desc: "Professional · measured · Australian male" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Aimee",  desc: "Friendly · natural · Australian female" },
];
const CONV_STYLES = ["professional", "friendly", "casual", "formal", "empathetic", "energetic"];
const VOICE_LANGUAGES = [
  { code: "en",    label: "English" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es",    label: "Spanish" },
  { code: "fr",    label: "French" },
  { code: "de",    label: "German" },
  { code: "it",    label: "Italian" },
  { code: "pt",    label: "Portuguese" },
  { code: "hi",    label: "Hindi" },
  { code: "ja",    label: "Japanese" },
  { code: "zh",    label: "Chinese" },
];

// ─── Live voice widget — native WebSocket + Web Audio (no external SDK) ──────
// Implements the ElevenLabs ConvAI WebSocket protocol directly:
//   • Captures mic at 16 kHz mono PCM-16, sends as base64 user_audio_chunk msgs
//   • Plays back base64 PCM-16 audio chunks received from ElevenLabs
//   • Handles interruption events and ping/pong keepalive
function LiveVoiceWidget({ adId, isProvisioned }) {
  const [status,     setStatus]     = useState("idle"); // idle | connecting | connected
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error,      setError]      = useState(null);

  const wsRef        = useRef(null);
  const ctxRef       = useRef(null);   // AudioContext
  const processorRef = useRef(null);   // ScriptProcessorNode
  const streamRef    = useRef(null);   // MediaStream
  const schedRef     = useRef(0);      // next scheduled audio playback time
  const closingRef   = useRef(false);  // true when we initiated the close

  const cleanupAudio = useCallback(() => {
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch {}
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      try { ctxRef.current.close(); } catch {}
      ctxRef.current = null;
    }
    schedRef.current = 0;
    setIsSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    closingRef.current = true;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    cleanupAudio();
    setStatus("idle");
    // intentionally NOT clearing error here — errors must stay visible after stop
  }, [cleanupAudio]);

  // Cleanup on unmount
  useEffect(() => () => {
    closingRef.current = true;
    if (wsRef.current) wsRef.current.close();
    cleanupAudio();
  }, [cleanupAudio]);

  // Decode base64 PCM-16 chunk and schedule it for playback
  const playPCM = useCallback((b64) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    try {
      const bin = atob(b64);
      const u8  = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const i16 = new Int16Array(u8.buffer);
      const f32 = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;

      const buf = ctx.createBuffer(1, f32.length, 16000);
      buf.copyToChannel(f32, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);

      const startAt = Math.max(ctx.currentTime, schedRef.current);
      src.start(startAt);
      schedRef.current = startAt + buf.duration;
      setIsSpeaking(true);
      src.onended = () => {
        if (!ctxRef.current || schedRef.current <= ctxRef.current.currentTime + 0.05) {
          setIsSpeaking(false);
        }
      };
    } catch {}
  }, []);

  const start = async () => {
    setStatus("connecting"); setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone not available — this feature requires HTTPS or localhost.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const { signed_url } = await adsAPI.getVoiceSessionToken(adId);

      // 16 kHz context — matches ElevenLabs ConvAI input/output sample rate
      const ctx = new AudioContext({ sampleRate: 16000 });
      ctxRef.current = ctx;

      closingRef.current = false;
      const ws = new WebSocket(signed_url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");

        const source    = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        // Route through a muted gain node — keeps graph alive, no speaker echo
        const muted = ctx.createGain();
        muted.gain.value = 0;
        source.connect(processor);
        processor.connect(muted);
        muted.connect(ctx.destination);

        processor.onaudioprocess = (e) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          const f32 = e.inputBuffer.getChannelData(0);
          const i16 = new Int16Array(f32.length);
          for (let i = 0; i < f32.length; i++) {
            i16[i] = Math.round(Math.max(-1, Math.min(1, f32[i])) * 32767);
          }
          const u8 = new Uint8Array(i16.buffer);
          // Encode to base64 in safe chunks to avoid call-stack overflow
          let b64 = "";
          for (let i = 0; i < u8.length; i += 8192) {
            b64 += String.fromCharCode(...u8.subarray(i, Math.min(i + 8192, u8.length)));
          }
          wsRef.current.send(JSON.stringify({ user_audio_chunk: btoa(b64) }));
        };
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "audio" && msg.audio_event?.audio_base_64) {
            playPCM(msg.audio_event.audio_base_64);
          } else if (msg.type === "interruption") {
            // Agent was interrupted — discard queued audio
            schedRef.current = ctxRef.current?.currentTime ?? 0;
            setIsSpeaking(false);
          } else if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", event_id: msg.ping_event?.event_id }));
          }
        } catch {}
      };

      ws.onerror = () => {
        stop(); // stop() does NOT clear error, so we set it after
        setError("Connection failed — check that the agent is provisioned and try again.");
      };
      ws.onclose = (evt) => {
        if (!closingRef.current) {
          cleanupAudio();
          setStatus("idle");
          // Only show a message if it wasn't a clean close (code 1000 = normal)
          if (evt.code !== 1000) {
            setError(`Session ended unexpectedly (code ${evt.code}) — try re-provisioning the agent.`);
          }
        }
        closingRef.current = false;
      };
    } catch (err) {
      cleanupAudio();
      setStatus("idle");
      if (err.name === "NotAllowedError") {
        setError("Microphone access denied — allow microphone access and try again.");
      } else {
        setError(err.message || "Failed to start session.");
      }
    }
  };

  if (!isProvisioned) {
    return (
      <div style={{ padding: "28px 0", textAlign: "center" }}>
        <Bot size={28} style={{ color: "var(--color-card-border)", margin: "0 auto 10px" }} />
        <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.85rem" }}>
          Provision the agent above before starting a voice session.
        </p>
      </div>
    );
  }

  if (status === "connected") {
    return (
      <div>
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "16px 18px", borderRadius: 10, marginBottom: 16,
          border: "1px solid rgba(34,197,94,0.25)",
          backgroundColor: "rgba(34,197,94,0.04)",
        }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              backgroundColor: "rgba(34,197,94,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {isSpeaking
                ? <Volume2 size={20} style={{ color: "#22c55e" }} />
                : <Mic     size={20} style={{ color: "#22c55e" }} />}
            </div>
            {isSpeaking && (
              <div style={{
                position: "absolute", inset: -5, borderRadius: "50%",
                border: "2px solid rgba(34,197,94,0.4)",
                animation: "pulse 1.2s ease-in-out infinite",
              }} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--color-input-text)" }}>
              {isSpeaking ? "Agent is speaking…" : "Listening — speak into your microphone"}
            </p>
            <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: 2 }}>
              Voice session active · live audio streaming
            </p>
          </div>
        </div>
        <ActionButton onClick={stop} variant="ghost" icon={<PhoneOff size={14} />}>
          End Session
        </ActionButton>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <ActionButton onClick={start} loading={status === "connecting"} icon={<PhoneCall size={14} />}>
          {status === "connecting" ? "Connecting…" : "Start Voice Session"}
        </ActionButton>
        {status === "idle" && (
          <p style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)" }}>
            Microphone access required
          </p>
        )}
      </div>
      {error && (
        <div style={{ padding: "8px 12px", borderRadius: 7, fontSize: "0.78rem", color: "#ef4444", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Voicebot configuration + provisioning panel ──────────────────────────────
function VoicebotPanel({ ad, adId, isPublisher, isStudyCoordinator, onConfigSaved }) {
  const canEdit = isPublisher || isStudyCoordinator;
  const cfg     = ad.bot_config || {};

  const [voiceId,    setVoiceId]    = useState(cfg.voice_id            || "XrExE9yKIg1WjnnlVkGX"); // default: Matilda (Australian)
  const [firstMsg,   setFirstMsg]   = useState(cfg.first_message       || "[takes a breath] Hi, this is Matilda with [Organization]. [short pause] We're enrolling volunteers for a clinical trial focused on [condition]. [short pause] Participation is voluntary, and, um, I can explain what's involved if you're interested.");
  const [language,   setLanguage]   = useState(cfg.language            || "en");
  const [botName,    setBotName]    = useState(cfg.bot_name            || "");
  const [convStyle,  setConvStyle]  = useState(cfg.conversation_style  || "professional");
  const [compliance, setCompliance] = useState(cfg.compliance_notes    || "");

  // Persisted recommendation from strategy generation (_voice_rec in bot_config)
  const storedRec = cfg._voice_rec || null;

  // AI recommendation (manual re-run)
  const [recLoading, setRecLoading] = useState(false);
  const [recError,   setRecError]   = useState(null);
  const [recReason,  setRecReason]  = useState(
    storedRec ? `${storedRec.voice_name}: ${storedRec.reason}` : null
  );

  // Save config
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError,   setSaveError]   = useState(null);
  const [saveDone,    setSaveDone]    = useState(false);

  // Agent provisioning
  const [agentStatus,      setAgentStatus]      = useState(null);
  const [statusLoading,    setStatusLoading]    = useState(true);
  const [provisionLoading, setProvisionLoading] = useState(false);
  const [provisionError,   setProvisionError]   = useState(null);

  // Conversation history
  const [conversations, setConversations] = useState([]);
  const [convsLoading,  setConvsLoading]  = useState(false);
  const [convsError,    setConvsError]    = useState(null);
  const [selectedConv,  setSelectedConv]  = useState(null);
  const [transcript,    setTranscript]    = useState(null);
  const [transLoading,  setTransLoading]  = useState(false);

  useEffect(() => {
    loadAgentStatus();
    loadConversations();
  }, [adId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAgentStatus = async () => {
    setStatusLoading(true);
    try { setAgentStatus(await adsAPI.getVoiceAgentStatus(adId)); } catch {}
    setStatusLoading(false);
  };

  const loadConversations = async () => {
    setConvsLoading(true);
    try {
      const r = await adsAPI.listVoiceConversations(adId);
      setConversations(r.conversations || []);
    } catch (e) { setConvsError(e.message); }
    setConvsLoading(false);
  };

  const handleRecommend = async () => {
    setRecLoading(true); setRecError(null); setRecReason(null);
    try {
      const rec = await adsAPI.getVoiceRecommendation(adId);
      setVoiceId(rec.voice_id);
      setConvStyle(rec.conversation_style);
      setFirstMsg(rec.first_message);
      setRecReason(`${rec.voice_name}: ${rec.reason}`);
    } catch (e) { setRecError(e.message); }
    setRecLoading(false);
  };

  const handleSaveConfig = async () => {
    setSaveLoading(true); setSaveError(null); setSaveDone(false);
    try {
      await adsAPI.updateBotConfig(adId, {
        voice_id:           voiceId,
        first_message:      firstMsg,
        language,
        bot_name:           botName   || undefined,
        conversation_style: convStyle,
        compliance_notes:   compliance || undefined,
      });
      setSaveDone(true);
      if (onConfigSaved) onConfigSaved();
    } catch (e) { setSaveError(e.message); }
    setSaveLoading(false);
  };

  const handleProvision = async () => {
    setProvisionLoading(true); setProvisionError(null);
    try {
      await adsAPI.provisionVoiceAgent(adId);
      await loadAgentStatus();
    } catch (e) { setProvisionError(e.message); }
    setProvisionLoading(false);
  };

  const handleDeleteAgent = async () => {
    setProvisionLoading(true); setProvisionError(null);
    try {
      await adsAPI.deleteVoiceAgent(adId);
      setAgentStatus({ provisioned: false });
    } catch (e) { setProvisionError(e.message); }
    setProvisionLoading(false);
  };

  const handleSelectConv = async (conv) => {
    if (selectedConv?.conversation_id === conv.conversation_id) {
      setSelectedConv(null); return;
    }
    setSelectedConv(conv); setTranscript(null); setTransLoading(true);
    try { setTranscript(await adsAPI.getVoiceTranscript(conv.conversation_id)); } catch {}
    setTransLoading(false);
  };

  const inputStyle = {
    padding: "8px 10px", borderRadius: 8, width: "100%",
    border: "1px solid var(--color-card-border)",
    backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)",
    fontSize: "0.82rem", outline: "none",
  };
  const labelStyle = {
    display: "block", fontSize: "0.72rem", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.06em",
    color: "var(--color-sidebar-text)", marginBottom: 6,
  };

  const isProvisioned = agentStatus?.provisioned;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Bot Configuration ─────────────────────────────────────────────── */}
      <SectionCard
        title="Voice Agent Configuration"
        subtitle="Set the voice, personality, and opening message for your voicebot"
      >
        {/* AI recommendation — shown automatically if strategy was generated, or on manual request */}
        {canEdit && (
          <div style={{ marginBottom: 20 }}>
            {/* Persisted recommendation banner (set at strategy-generation time) */}
            {recReason && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 14px", borderRadius: 8, marginBottom: 12,
                backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.05)",
                border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.18)",
              }}>
                <Wand2 size={13} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-accent)", marginBottom: 2 }}>
                    AI Voice Recommendation
                  </p>
                  <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", lineHeight: 1.5 }}>
                    {recReason}
                  </p>
                </div>
              </div>
            )}
            {/* Manual re-run button — only show when strategy exists */}
            {ad.strategy_json && (
              <ActionButton onClick={handleRecommend} loading={recLoading} variant="ghost" icon={<Wand2 size={13} />}>
                {recLoading ? "Analyzing…" : recReason ? "Re-run Recommendation" : "Get AI Recommendation"}
              </ActionButton>
            )}
            {recError && (
              <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 7, fontSize: "0.78rem", color: "#ef4444", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                {recError}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Voice */}
          <div>
            <label style={labelStyle}>Voice</label>
            <select value={voiceId} onChange={e => setVoiceId(e.target.value)} disabled={!canEdit} style={inputStyle}>
              {VOICE_CATALOGUE.map(v => (
                <option key={v.id} value={v.id}>{v.name} — {v.desc}</option>
              ))}
            </select>
          </div>

          {/* Conversation style */}
          <div>
            <label style={labelStyle}>Conversation Style</label>
            <select value={convStyle} onChange={e => setConvStyle(e.target.value)} disabled={!canEdit} style={inputStyle}>
              {CONV_STYLES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Agent name */}
          <div>
            <label style={labelStyle}>Agent Name</label>
            <input
              type="text" value={botName} onChange={e => setBotName(e.target.value)}
              placeholder="e.g. Health Assistant"
              disabled={!canEdit} style={inputStyle}
            />
          </div>

          {/* Language */}
          <div>
            <label style={labelStyle}>Language</label>
            <select value={language} onChange={e => setLanguage(e.target.value)} disabled={!canEdit} style={inputStyle}>
              {VOICE_LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>

          {/* Opening message */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Opening Message</label>
            <input
              type="text" value={firstMsg} onChange={e => setFirstMsg(e.target.value)}
              placeholder="Hello! How can I help you today?"
              disabled={!canEdit} style={inputStyle}
            />
          </div>

          {/* Compliance notes */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
              Compliance Notes
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, opacity: 0.6 }}>(optional)</span>
            </label>
            <textarea
              value={compliance} onChange={e => setCompliance(e.target.value)}
              placeholder="e.g. Do not make medical claims. Refer users to a healthcare professional."
              disabled={!canEdit} rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        </div>

        {canEdit && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <ActionButton onClick={handleSaveConfig} loading={saveLoading} icon={<Check size={14} />}>
              {saveLoading ? "Saving…" : "Save Configuration"}
            </ActionButton>
            {saveDone && (
              <span style={{ fontSize: "0.78rem", color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 size={13} /> Saved
              </span>
            )}
            {saveError && <span style={{ fontSize: "0.78rem", color: "#ef4444" }}>{saveError}</span>}
          </div>
        )}
      </SectionCard>

      {/* ── Agent Provisioning (Publisher only) ───────────────────────────── */}
      {isPublisher && (
        <SectionCard
          title="Voice Agent"
          subtitle="Provision and manage the live conversational AI agent"
        >
          {statusLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, color: "var(--color-sidebar-text)", fontSize: "0.82rem" }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Checking agent status…
            </div>
          ) : agentStatus && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
              padding: "10px 14px", borderRadius: 8,
              border: `1px solid ${isProvisioned ? "rgba(34,197,94,0.2)" : "var(--color-card-border)"}`,
              backgroundColor: isProvisioned ? "rgba(34,197,94,0.04)" : "var(--color-page-bg)",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: isProvisioned ? "#22c55e" : "#6b7280", flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)" }}>
                  {isProvisioned ? `Agent live — ${agentStatus.name || "Voice Agent"}` : "No agent provisioned"}
                </p>
                {isProvisioned && agentStatus.agent_id && (
                  <p style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)", marginTop: 1 }}>ID: {agentStatus.agent_id}</p>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ActionButton onClick={handleProvision} loading={provisionLoading} icon={<Zap size={14} />}>
              {provisionLoading ? "Provisioning…" : isProvisioned ? "Update Agent" : "Provision Agent"}
            </ActionButton>
            {isProvisioned && (
              <ActionButton onClick={handleDeleteAgent} loading={provisionLoading} variant="ghost" icon={<Trash2 size={14} />}>
                Delete Agent
              </ActionButton>
            )}
          </div>
          {provisionError && (
            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 7, fontSize: "0.78rem", color: "#ef4444", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              {provisionError}
            </div>
          )}
          {!isProvisioned && !statusLoading && (
            <p style={{ marginTop: 10, fontSize: "0.75rem", color: "var(--color-sidebar-text)" }}>
              Save the configuration above first, then click Provision to deploy the agent.
            </p>
          )}
        </SectionCard>
      )}

      {/* ── Live Voice Session (Publisher only) ───────────────────────────── */}
      {isPublisher && (
        <SectionCard
          title="Live Voice Session"
          subtitle="Test the agent with a real-time voice call directly in your browser"
        >
          <LiveVoiceWidget adId={adId} isProvisioned={isProvisioned} />
        </SectionCard>
      )}

      {/* ── Conversation History ───────────────────────────────────────────── */}
      <SectionCard
        title="Conversation History"
        subtitle="Past voice sessions"
      >
        {convsLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-sidebar-text)", fontSize: "0.82rem" }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Loading…
          </div>
        ) : convsError ? (
          <p style={{ fontSize: "0.82rem", color: "#ef4444" }}>{convsError}</p>
        ) : conversations.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <PhoneCall size={28} style={{ color: "var(--color-card-border)", margin: "0 auto 10px" }} />
            <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.85rem" }}>No conversations yet.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {conversations.map(c => (
              <div
                key={c.conversation_id}
                onClick={() => handleSelectConv(c)}
                style={{
                  padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${selectedConv?.conversation_id === c.conversation_id ? "var(--color-accent)" : "var(--color-card-border)"}`,
                  backgroundColor: "var(--color-card-bg)", transition: "border-color 0.15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)", fontFamily: "ui-monospace, monospace" }}>
                    {c.conversation_id?.slice(0, 16)}…
                  </p>
                  <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", textTransform: "capitalize" }}>
                    {c.status}
                  </span>
                </div>
                {c.start_time && (
                  <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: 2 }}>
                    {new Date(c.start_time * 1000).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Transcript viewer */}
        {selectedConv && (
          <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--color-input-text)" }}>Transcript</p>
              <button onClick={() => setSelectedConv(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", padding: 4 }}>
                <XIcon size={14} />
              </button>
            </div>
            {transLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-sidebar-text)", fontSize: "0.78rem" }}>
                <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Loading transcript…
              </div>
            ) : transcript ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
                {(transcript.transcript || []).map((turn, i) => (
                  <div key={i} style={{ display: "flex", gap: 10 }}>
                    <span style={{
                      fontSize: "0.7rem", fontWeight: 700, minWidth: 40, flexShrink: 0, marginTop: 2,
                      color: turn.role === "agent" ? "var(--color-accent)" : "var(--color-sidebar-text)",
                    }}>
                      {turn.role === "agent" ? "Agent" : "User"}
                    </span>
                    <p style={{ fontSize: "0.78rem", color: "var(--color-input-text)", lineHeight: 1.55, margin: 0 }}>
                      {turn.message}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)" }}>No transcript data.</p>
            )}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button onClick={loadConversations} className="btn--ghost" style={{ fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Page-level tabs ──────────────────────────────────────────────────────────
const PAGE_TABS = [
  { key: "overview",      label: "Overview",      icon: LayoutDashboard, alwaysShow: true  },
  { key: "strategy",      label: "Strategy",      icon: Layers,          alwaysShow: true  },
  { key: "questionnaire", label: "Questionnaire", icon: ClipboardList,   alwaysShow: true  },
  { key: "participants",  label: "Participants",  icon: Users,           alwaysShow: true  },
  { key: "review",        label: "Review",        icon: ClipboardCheck,  alwaysShow: true  },
  { key: "history",       label: "History",       icon: History,         alwaysShow: true  },
  { key: "publish",       label: "Publish",       icon: Zap,             alwaysShow: true  },
];

function PageTabBar({ active, onChange, showQuestionnaireDot, role, adTypes }) {
  return (
    <div style={{
      display: "flex", borderBottom: "1px solid var(--color-card-border)",
      marginBottom: 28, gap: 0, overflowX: "auto",
    }}>
      {PAGE_TABS.filter(t => t.alwaysShow || (t.key === "voicebot" && adTypes?.includes("voicebot"))).map(({ key, label, icon: Icon }) => {
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
  const [titleEditing,    setTitleEditing]    = useState(false);
  const [titleInput,      setTitleInput]      = useState("");
  const [titleSaving,     setTitleSaving]     = useState(false);
  const [pageTab,         setPageTab]         = useState("overview");
  const [companyLocations, setCompanyLocations] = useState([]);  // [{ country, cities }]
  const [participants,     setParticipants]     = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [syncingTranscripts,  setSyncingTranscripts]  = useState(false);
  const [syncResult,          setSyncResult]          = useState(null);
  // Voicebot conversation history (loaded in participants tab for voicebot campaigns)
  const [convHistory,         setConvHistory]         = useState([]);
  const [convHistoryLoading,  setConvHistoryLoading]  = useState(false);
  const [selectedConvHistory, setSelectedConvHistory] = useState(null);
  const [convTranscript,      setConvTranscript]      = useState(null);
  const [convTransLoading,    setConvTransLoading]    = useState(false);

  const saveTitle = async () => {
    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === ad.title) { setTitleEditing(false); return; }
    setTitleSaving(true);
    try {
      const updated = await adsAPI.update(id, { title: trimmed });
      setAd(updated);
      setTitleEditing(false);
    } catch (err) {
      alert(err.message || "Failed to save title.");
    } finally {
      setTitleSaving(false);
    }
  };

  const genProgress = useGenerateProgress();

  const role = JSON.parse(localStorage.getItem("user") || "{}").role;
  const isStudyCoordinator = role === "study_coordinator";
  const canRegenerate = ["project_manager", "ethics_manager"].includes(role);
  const canGenerate   = isStudyCoordinator || canRegenerate;
  const isPublisher   = role === "publisher";

  // Poll GET /{adId} until updated_at changes (background task committed).
  // Used after any endpoint that fires a BackgroundTask and returns immediately.
  //
  // Resilient to transient 5xx/network errors: during heavy generation the
  // backend can momentarily return 503 (ALB queue / SQLite lock) — swallow
  // those and keep polling until the deadline.
  const pollUntilUpdated = useCallback(async (adId, beforeUpdatedAt, timeoutMs = 300_000) => {
    const deadline = Date.now() + timeoutMs;
    let transientErrors = 0;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const latest = await adsAPI.get(adId);
        transientErrors = 0;
        if (latest.updated_at !== beforeUpdatedAt) return latest;
      } catch (err) {
        const msg = String(err?.message || "");
        const isTransient = /HTTP 5\d\d|503|502|504|Failed to fetch|NetworkError/i.test(msg);
        if (!isTransient) throw err;
        transientErrors += 1;
        if (transientErrors >= 10) throw new Error("Server is unavailable — please refresh the page.");
      }
    }
    throw new Error("Timed out waiting for generation to complete. Please refresh the page.");
  }, []);

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

  useEffect(() => {
    if (pageTab !== "participants" || !id) return;
    setParticipantsLoading(true);
    surveyAPI.list(id)
      .then((data) => setParticipants(data || []))
      .catch(() => setParticipants([]))
      .finally(() => setParticipantsLoading(false));
    // Load voicebot conversation history alongside participants
    if (ad?.ad_type?.includes("voicebot")) {
      setConvHistoryLoading(true);
      adsAPI.listVoiceConversations(id)
        .then((r) => setConvHistory(r.conversations || []))
        .catch(() => setConvHistory([]))
        .finally(() => setConvHistoryLoading(false));
    }
  }, [pageTab, id, ad?.ad_type]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectConvHistory = async (conv) => {
    if (selectedConvHistory?.conversation_id === conv.conversation_id) {
      setSelectedConvHistory(null); return;
    }
    setSelectedConvHistory(conv); setConvTranscript(null); setConvTransLoading(true);
    try { setConvTranscript(await adsAPI.getVoiceTranscript(conv.conversation_id)); } catch {}
    setConvTransLoading(false);
  };

  const handleSyncTranscripts = async () => {
    setSyncingTranscripts(true);
    setSyncResult(null);
    try {
      const result = await surveyAPI.syncTranscripts(id);
      setSyncResult(result);
      // Reload participants to pick up newly linked transcripts
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

  // ── Action handlers ──────────────────────────────────────────────────────
  const handleGenerateStrategy = async () => {
    setGenLoading(true); setGenError(null);
    try {
      // Step 1 — strategy (returns immediately with status=generating; poll until done)
      genProgress.start("Generating strategy…", 25000);
      const triggered = await adsAPI.generateStrategy(id);
      setAd(triggered);
      const afterStrategy = await pollUntilUpdated(id, triggered.updated_at, 120_000);
      setAd(afterStrategy);
      if (afterStrategy.status === "draft") {
        throw new Error("AI generation failed. This may be a network issue or a temporary API problem. Please try again.");
      }
      genProgress.complete();

      const adTypes = afterStrategy.ad_type || [];
      const isWebsite  = adTypes.includes("website");
      const hasNonWeb  = adTypes.some(t => t !== "website");

      // Step 2 — website (if campaign type includes website)
      if (isWebsite) {
        setWebsiteLoading(true); setWebsiteError(null);
        genProgress.start("Building landing page…", 120000);
        try {
          const triggeredWebsite = await adsAPI.generateWebsite(id);
          const afterWebsite = await pollUntilUpdated(id, triggeredWebsite.updated_at, 600_000);
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
        genProgress.start("Generating ad creatives + images…", 120000);
        try {
          const triggeredCreatives = await adsAPI.generateCreatives(id);
          const afterCreatives = await pollUntilUpdated(id, triggeredCreatives.updated_at);
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
    genProgress.start("Running AI review…", 60000);
    try {
      const triggered = await adsAPI.submitForReview(id);
      const updated = await pollUntilUpdated(id, triggered.updated_at);
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
    genProgress.start("Generating ad creatives + images…", 120000);
    try {
      const triggered = await adsAPI.generateCreatives(id);
      // Backend returns immediately; poll until the background task commits
      const updated = await pollUntilUpdated(id, triggered.updated_at);
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
    genProgress.start("Building landing page…", 120000);
    try {
      const prevUrl = ad?.output_url;
      const triggered = await adsAPI.generateWebsite(id);
      // Backend returns immediately; poll until the background task commits.
      // Website gen is slower than creatives (Claude + image + EFS write) → 10 min.
      const updated = await pollUntilUpdated(id, triggered.updated_at, 600_000);
      // Detect silent failure: task touched updated_at but didn't produce a URL
      if (!updated.output_url && !prevUrl) {
        throw new Error("Website generation failed on the server. Check the backend logs for the error.");
      }
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

      {/* Delete confirmation — top banner */}
      {showDeleteConfirm && (
        <div style={{
          position: "fixed", top: 0, left: 240, right: 0, zIndex: 1000,
          background: "var(--color-card-bg)",
          borderBottom: "2px solid #ef4444",
          boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
          padding: "18px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24,
          animation: "slideDown 0.2s ease",
        }}>
          <style>{`@keyframes slideDown{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--color-input-text)", margin: "0 0 3px" }}>
              Delete Campaign?
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--color-sidebar-text)", margin: 0 }}>
              Permanently deletes <strong style={{ color: "var(--color-input-text)" }}>{ad.title}</strong> — documents, reviews, and analytics. Cannot be undone.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <button onClick={() => setShowDeleteConfirm(false)} disabled={deleteLoading} className="btn--ghost" style={{ padding: "7px 16px" }}>
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteLoading}
              style={{
                background: "#ef4444", color: "#fff", border: "none",
                borderRadius: "8px", padding: "7px 18px", cursor: "pointer",
                fontWeight: 600, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px",
                opacity: deleteLoading ? 0.7 : 1,
              }}
            >
              {deleteLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />}
              Delete Campaign
            </button>
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
            {titleEditing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setTitleEditing(false); }}
                  autoFocus
                  style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", lineHeight: 1.3, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, padding: "2px 10px", outline: "none", minWidth: 0, flex: 1 }}
                />
                <button onClick={saveTitle} disabled={titleSaving} style={{ background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 6, cursor: "pointer", padding: "4px 10px", color: "#86efac", fontSize: "0.78rem", fontWeight: 600, flexShrink: 0 }}>
                  {titleSaving ? "…" : "Save"}
                </button>
                <button onClick={() => setTitleEditing(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: 4, flexShrink: 0 }}>
                  <XIcon size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", lineHeight: 1.3, margin: 0 }}>
                  {ad.title}
                </h1>
                <button
                  onClick={() => { setTitleInput(ad.title); setTitleEditing(true); }}
                  title="Rename campaign"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.35)", padding: 4, flexShrink: 0, display: "flex", alignItems: "center" }}
                >
                  <Pencil size={14} />
                </button>
              </div>
            )}
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
      <PageTabBar active={pageTab} onChange={setPageTab} showQuestionnaireDot={showQDot} role={role} adTypes={ad?.ad_type} />

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

          {/* Voicebot Info — read-only, voicebot campaigns only */}
          {ad.ad_type?.includes("voicebot") && (() => {
            const cfg = ad.bot_config || {};
            const isProvisioned = !!cfg.elevenlabs_agent_id;
            const voiceName = VOICE_CATALOGUE.find(v => v.id === cfg.voice_id)?.name || cfg.voice_id || "—";
            const convStyleLabel = cfg.conversation_style
              ? cfg.conversation_style.charAt(0).toUpperCase() + cfg.conversation_style.slice(1)
              : "—";
            return (
              <SectionCard title="Voice Agent" subtitle="Voicebot configuration for this campaign">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
                  {[
                    { label: "Agent Status",        value: isProvisioned ? "Provisioned" : "Not provisioned", accent: isProvisioned },
                    { label: "Agent Name",           value: cfg.bot_name || "—" },
                    { label: "Voice",                value: voiceName },
                    { label: "Conversation Style",   value: convStyleLabel },
                    { label: "Language",             value: cfg.language || "en" },
                    { label: "Phone Number",         value: cfg.voice_phone_number || "—" },
                  ].map(({ label, value, accent }) => (
                    <div key={label} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                      <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</p>
                      <p style={{ fontSize: "0.88rem", fontWeight: 600, color: accent ? "#22c55e" : "var(--color-input-text)" }}>{value}</p>
                    </div>
                  ))}
                </div>
                {cfg.first_message && (
                  <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                    <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Opening Message</p>
                    <p style={{ fontSize: "0.85rem", color: "var(--color-input-text)", fontStyle: "italic" }}>&ldquo;{cfg.first_message}&rdquo;</p>
                  </div>
                )}
              </SectionCard>
            );
          })()}

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
                <StrategyViewer strategy={ad.strategy_json} ad={ad} onRetry={isStudyCoordinator ? handleGenerateStrategy : undefined} />
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

          {/* Generating spinner — shown while background task is running */}
          {!hasStrategy && ad.status === "generating" && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ display: "inline-block", width: 32, height: 32, border: "3px solid var(--color-card-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 12 }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>Generating strategy… this usually takes 1–2 minutes.</p>
            </div>
          )}

          {/* Empty state */}
          {!hasStrategy && ad.status !== "draft" && ad.status !== "generating" && (
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
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-input-text)", margin: 0 }}>
              Eligibility Questionnaire
            </h2>
            <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", marginTop: 4 }}>
              {ad.campaign_category ? ad.campaign_category.replace("_", " ") + " campaign" : "Campaign"} — define the questions participants will answer
            </p>
          </div>
          <QuestionnaireSection
            adId={id}
            questionnaire={ad.questionnaire}
            readOnly={isPublisher}
            showAI={isStudyCoordinator}
            onSaved={load}
          />
        </div>
      )}

      {/* ══ REVIEW tab ════════════════════════════════════════════════════════ */}
      {pageTab === "review" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {canReview && (
            <SectionCard title="Submit Review">
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

      {/* ══ PARTICIPANTS tab ══════════════════════════════════════════════════ */}
      {pageTab === "participants" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {selectedParticipant ? (
            /* ── Detail view ── */
            <SectionCard
              title={selectedParticipant.full_name}
              subtitle={`Submitted ${new Date(selectedParticipant.created_at).toLocaleString()}`}
            >
              <button
                onClick={() => setSelectedParticipant(null)}
                className="btn--ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem", marginBottom: 20 }}
              >
                <ArrowLeft size={13} /> Back to list
              </button>

              {/* Personal details */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
                {[
                  { label: "Full Name",    value: selectedParticipant.full_name },
                  { label: "Age",          value: selectedParticipant.age },
                  { label: "Sex",          value: selectedParticipant.sex.replace(/_/g, " ") },
                  { label: "Phone",        value: selectedParticipant.phone },
                  { label: "Eligibility",  value: selectedParticipant.is_eligible === true ? "Eligible" : selectedParticipant.is_eligible === false ? "Not Eligible" : "Unknown" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                    <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</p>
                    <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--color-input-text)" }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Voice call transcript */}
              {selectedParticipant.voice_sessions?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                    Voice Call Transcript
                  </p>
                  {selectedParticipant.voice_sessions.map((vs) => (
                    <div key={vs.id} style={{ border: "1px solid var(--color-card-border)", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
                      {/* Session header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", backgroundColor: "var(--color-page-bg)", borderBottom: vs.transcripts?.length > 0 ? "1px solid var(--color-card-border)" : "none" }}>
                        <Phone size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)" }}>
                          {vs.phone || "Unknown number"}
                        </span>
                        <span style={{
                          marginLeft: "auto", fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                          backgroundColor: vs.status === "ended" ? "rgba(34,197,94,0.12)" : vs.status === "failed" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.12)",
                          color: vs.status === "ended" ? "#16a34a" : vs.status === "failed" ? "#dc2626" : "#b45309",
                        }}>
                          {vs.status}
                        </span>
                        {vs.duration_seconds != null && (
                          <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                            {Math.floor(vs.duration_seconds / 60)}m {vs.duration_seconds % 60}s
                          </span>
                        )}
                        <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                          {new Date(vs.started_at).toLocaleString()}
                        </span>
                      </div>
                      {/* Transcript turns */}
                      {vs.transcripts?.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 360, overflowY: "auto", padding: "12px 16px" }}>
                          {[...vs.transcripts].sort((a, b) => (a.turn_index ?? 0) - (b.turn_index ?? 0)).map((turn, ti) => (
                            <div key={ti} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                              <span style={{
                                flexShrink: 0, width: 44, fontSize: "0.68rem", fontWeight: 700, textAlign: "right",
                                paddingTop: 3,
                                color: turn.speaker === "agent" ? "var(--color-accent)" : "var(--color-sidebar-text)",
                                textTransform: "uppercase",
                              }}>
                                {turn.speaker === "agent" ? "Agent" : "User"}
                              </span>
                              <div style={{
                                flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: "0.83rem", lineHeight: 1.5,
                                backgroundColor: turn.speaker === "agent" ? "rgba(var(--accent-rgb, 16,185,129), 0.07)" : "var(--color-page-bg)",
                                border: "1px solid var(--color-card-border)",
                                color: "var(--color-input-text)",
                              }}>
                                {turn.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: "0.8rem", color: "var(--color-sidebar-text)", padding: "12px 16px" }}>
                          No transcript available yet.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Survey answers */}
              {selectedParticipant.answers?.length > 0 && (
                <>
                  <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                    Survey Answers
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {selectedParticipant.answers.map((ans, i) => (
                      <div key={i} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                        <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)", marginBottom: 6 }}>
                          Q{i + 1}. {ans.question_text}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 600,
                            backgroundColor: ans.is_eligible === true ? "rgba(34,197,94,0.12)" : ans.is_eligible === false ? "rgba(239,68,68,0.1)" : "rgba(107,114,128,0.1)",
                            color: ans.is_eligible === true ? "#16a34a" : ans.is_eligible === false ? "#dc2626" : "var(--color-sidebar-text)",
                          }}>
                            {ans.selected_option}
                          </span>
                          {ans.is_eligible === true && <CheckCircle2 size={13} style={{ color: "#16a34a" }} />}
                          {ans.is_eligible === false && <AlertCircle size={13} style={{ color: "#dc2626" }} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
          ) : (
            /* ── List view ── */
            <SectionCard
              title="Participants"
              subtitle="People who completed the survey and submitted their details"
            >
              {/* Sync transcripts button — only relevant for voicebot campaigns */}
              {ad.ad_type?.includes("voicebot") && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <button
                    onClick={handleSyncTranscripts}
                    disabled={syncingTranscripts}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "7px 14px", borderRadius: 8, border: "1px solid var(--color-card-border)",
                      backgroundColor: "var(--color-card-bg)", cursor: syncingTranscripts ? "not-allowed" : "pointer",
                      fontSize: "0.8rem", fontWeight: 600, color: "var(--color-input-text)",
                      opacity: syncingTranscripts ? 0.6 : 1, transition: "opacity 0.15s",
                    }}
                  >
                    {syncingTranscripts
                      ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Syncing…</>
                      : <><RefreshCw size={13} /> Sync Transcripts</>}
                  </button>
                  {syncResult && !syncResult.error && (
                    <span style={{ fontSize: "0.78rem", color: "#16a34a" }}>
                      ✓ {syncResult.synced} synced, {syncResult.skipped} already up-to-date
                    </span>
                  )}
                  {syncResult?.error && (
                    <span style={{ fontSize: "0.78rem", color: "#dc2626" }}>{syncResult.error}</span>
                  )}
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
                  <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.78rem", marginTop: 4 }}>
                    Responses will appear here once people complete the survey.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: 10, border: "1px solid var(--color-card-border)", overflow: "hidden" }}>
                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.5fr 1fr 32px 40px", gap: 0, padding: "10px 16px", backgroundColor: "var(--color-page-bg)", borderBottom: "1px solid var(--color-card-border)" }}>
                    {["Name", "Age", "Sex", "Phone", "Eligibility", "", ""].map((h) => (
                      <span key={h} style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
                    ))}
                  </div>
                  {/* Rows */}
                  {participants.map((p, idx) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedParticipant(p)}
                      style={{
                        display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.5fr 1fr 32px 40px",
                        gap: 0, padding: "12px 16px", cursor: "pointer",
                        borderBottom: idx < participants.length - 1 ? "1px solid var(--color-card-border)" : "none",
                        backgroundColor: "var(--color-card-bg)",
                        transition: "background-color 0.1s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-page-bg)"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--color-card-bg)"}
                    >
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.full_name}</span>
                      <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>{p.age}</span>
                      <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)", textTransform: "capitalize" }}>{p.sex.replace(/_/g, " ")}</span>
                      <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>{p.phone}</span>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: "0.75rem", fontWeight: 600,
                        color: p.is_eligible === true ? "#16a34a" : p.is_eligible === false ? "#dc2626" : "var(--color-sidebar-text)",
                      }}>
                        {p.is_eligible === true && <CheckCircle2 size={12} />}
                        {p.is_eligible === false && <AlertCircle size={12} />}
                        {p.is_eligible === true ? "Eligible" : p.is_eligible === false ? "Not Eligible" : "Unknown"}
                      </span>
                      {/* Voice call indicator */}
                      {p.voice_sessions?.length > 0 ? (
                        <Phone size={13} style={{ color: "var(--color-accent)", alignSelf: "center" }} title="Has voice call transcript" />
                      ) : (
                        <span />
                      )}
                      <ChevronDown size={14} style={{ color: "var(--color-sidebar-text)", transform: "rotate(-90deg)" }} />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {/* Conversation History — voicebot campaigns only */}
            {ad.ad_type?.includes("voicebot") && (
              <SectionCard title="Conversation History" subtitle="Past voice sessions from the voicebot">
                {convHistoryLoading ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-sidebar-text)", fontSize: "0.82rem" }}>
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Loading…
                  </div>
                ) : convHistory.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0" }}>
                    <PhoneCall size={28} style={{ color: "var(--color-card-border)", margin: "0 auto 10px" }} />
                    <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.85rem" }}>No conversations yet.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {convHistory.map(c => (
                      <div
                        key={c.conversation_id}
                        onClick={() => handleSelectConvHistory(c)}
                        style={{
                          padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                          border: `1px solid ${selectedConvHistory?.conversation_id === c.conversation_id ? "var(--color-accent)" : "var(--color-card-border)"}`,
                          backgroundColor: "var(--color-card-bg)", transition: "border-color 0.15s",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)", fontFamily: "ui-monospace, monospace" }}>
                            {c.conversation_id?.slice(0, 16)}…
                          </p>
                          <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", textTransform: "capitalize" }}>{c.status}</span>
                        </div>
                        {c.start_time && (
                          <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: 2 }}>
                            {new Date(c.start_time * 1000).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Transcript viewer */}
                {selectedConvHistory && (
                  <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--color-input-text)" }}>Transcript</p>
                      <button onClick={() => setSelectedConvHistory(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", padding: 4 }}>
                        <XIcon size={14} />
                      </button>
                    </div>
                    {convTransLoading ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-sidebar-text)", fontSize: "0.78rem" }}>
                        <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Loading transcript…
                      </div>
                    ) : convTranscript ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
                        {(convTranscript.transcript || []).map((turn, i) => (
                          <div key={i} style={{ display: "flex", gap: 10 }}>
                            <span style={{
                              fontSize: "0.7rem", fontWeight: 700, minWidth: 40, flexShrink: 0, marginTop: 2,
                              color: turn.role === "agent" ? "var(--color-accent)" : "var(--color-sidebar-text)",
                            }}>
                              {turn.role === "agent" ? "Agent" : "User"}
                            </span>
                            <p style={{ fontSize: "0.78rem", color: "var(--color-input-text)", lineHeight: 1.55, margin: 0 }}>
                              {turn.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)" }}>No transcript data.</p>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={() => {
                      setConvHistoryLoading(true);
                      adsAPI.listVoiceConversations(id)
                        .then((r) => setConvHistory(r.conversations || []))
                        .catch(() => {})
                        .finally(() => setConvHistoryLoading(false));
                    }}
                    className="btn--ghost"
                    style={{ fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <RefreshCw size={12} /> Refresh
                  </button>
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
                          Generates copy + images for all ad formats using AI
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

          {/* Empty states */}
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
          {isStudyCoordinator && ad.status !== "draft" && !ad.output_files?.length && !ad.output_url && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Eye size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>
                No preview content yet. Ad creatives and the landing page will appear here once generated.
              </p>
            </div>
          )}
          {canRegenerate && ad.status === "draft" && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Layers size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>
                A <strong style={{ color: "var(--color-input-text)" }}>strategy</strong> must be generated before creatives can be produced.
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