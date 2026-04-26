import React, { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Check, CheckCircle2, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { adsAPI } from "../../../services/api";
import { useGenerateProgress, InlineProgress } from "./GenerateProgress";

export const QUESTION_TYPES = [
  { value: "text",             label: "Short Text" },
  { value: "textarea",         label: "Long Text" },
  { value: "yes_no",           label: "Yes / No" },
  { value: "multiple_choice",  label: "Multiple Choice" },
  { value: "scale",            label: "Scale (1–5)" },
];

export function newQuestion() {
  return { id: crypto.randomUUID(), text: "", type: "multiple_choice", options: ["", ""], correct_option: null, required: true };
}

// ─── Auto-sizing textarea for question text ───────────────────────────────────
export function AutoTextarea({ value, onChange, inputBase }) {
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
export default function QuestionnaireSection({ adId, questionnaire, readOnly, showAI = true, onSaved }) {
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
