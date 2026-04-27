/**
 * ConversationAnalysis
 * Displays AI-generated analysis of a voice call or chat session.
 * Shown in the participant detail view inside CampaignDetailPage.
 *
 * Props:
 *   analysis       — the call_analysis JSON object (already fetched)
 *   sessionId      — voice session ID (used for the "Re-analyze" button label)
 *   onReanalyze    — async callback to trigger fresh analysis
 *   loading        — bool, whether analysis is in progress
 */

import React, { useState } from "react";
import {
  Sparkles, ChevronDown, ChevronRight, CheckCircle2, AlertCircle,
  MessageSquare, User, Loader2, RefreshCw, Info,
} from "lucide-react";

// ─── Small helpers ────────────────────────────────────────────────────────────

function InfoGrid({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
      {items.map(({ label, value }) => (
        <div
          key={label}
          style={{
            padding: "10px 14px", borderRadius: 8,
            border: "1px solid var(--color-card-border)",
            backgroundColor: "var(--color-page-bg)",
          }}
        >
          <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
            {label}
          </p>
          <p style={{ fontSize: "0.85rem", fontWeight: 600, color: value ? "var(--color-input-text)" : "var(--color-sidebar-text)", fontStyle: value ? "normal" : "italic" }}>
            {value || "not provided"}
          </p>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title, count, open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        background: "none", border: "none", cursor: "pointer",
        padding: "8px 0", textAlign: "left",
      }}
    >
      {open ? <ChevronDown size={14} style={{ color: "var(--color-sidebar-text)" }} /> : <ChevronRight size={14} style={{ color: "var(--color-sidebar-text)" }} />}
      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {title}
      </span>
      {count != null && (
        <span style={{ fontSize: "0.68rem", color: "var(--color-sidebar-text)", backgroundColor: "var(--color-page-bg)", border: "1px solid var(--color-card-border)", borderRadius: 20, padding: "1px 7px" }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ConversationAnalysis({ analysis, sessionId, onReanalyze, loading }) {
  const [showQA, setShowQA]             = useState(true);
  const [showQuestionnaire, setShowQuestionnaire] = useState(true);
  const [showInfo, setShowInfo]         = useState(true);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 0", color: "var(--color-sidebar-text)", fontSize: "0.82rem" }}>
        <Loader2 size={15} style={{ animation: "spin 1s linear infinite", color: "var(--color-accent)" }} />
        Analyzing conversation…
      </div>
    );
  }

  if (!analysis) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
        <Info size={14} style={{ color: "var(--color-sidebar-text)" }} />
        <span style={{ fontSize: "0.8rem", color: "var(--color-sidebar-text)" }}>No analysis yet.</span>
        {onReanalyze && (
          <button
            onClick={onReanalyze}
            className="btn--ghost"
            style={{ fontSize: "0.76rem", display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px" }}
          >
            <Sparkles size={12} /> Analyze
          </button>
        )}
      </div>
    );
  }

  const eligible      = analysis.eligibility_outcome;
  const eligColor     = eligible === "eligible" ? "#16a34a" : eligible === "not_eligible" ? "#dc2626" : "#d97706";
  const eligBg        = eligible === "eligible" ? "rgba(34,197,94,0.1)" : eligible === "not_eligible" ? "rgba(239,68,68,0.08)" : "rgba(217,119,6,0.08)";
  const questionnaire = analysis.questionnaire_responses || [];
  const questions     = analysis.questions_asked || [];
  const infoRetrieved = analysis.information_retrieved || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header row: eligibility badge + re-analyze */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Sparkles size={14} style={{ color: "var(--color-accent)" }} />
        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          AI Analysis
        </span>
        <span style={{
          marginLeft: 4, padding: "2px 10px", borderRadius: 20,
          fontSize: "0.71rem", fontWeight: 700,
          backgroundColor: eligBg, color: eligColor,
          border: `1px solid ${eligColor}40`,
        }}>
          {eligible === "eligible" ? "Eligible" : eligible === "not_eligible" ? "Not Eligible" : "Review Needed"}
        </span>
        {analysis.channel && (
          <span style={{ fontSize: "0.69rem", color: "var(--color-sidebar-text)", backgroundColor: "var(--color-page-bg)", border: "1px solid var(--color-card-border)", borderRadius: 20, padding: "2px 8px" }}>
            {analysis.channel} {analysis.duration_label && analysis.duration_label !== "N/A" ? `· ${analysis.duration_label}` : ""}
          </span>
        )}
        <div style={{ marginLeft: "auto" }}>
          {onReanalyze && (
            <button
              onClick={onReanalyze}
              disabled={loading}
              className="btn--ghost"
              style={{ fontSize: "0.73rem", display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px" }}
            >
              <RefreshCw size={11} /> Re-analyze
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      {analysis.summary && (
        <div style={{ padding: "12px 14px", borderRadius: 8, backgroundColor: "var(--color-page-bg)", border: "1px solid var(--color-card-border)" }}>
          <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)", lineHeight: 1.6, margin: 0 }}>
            {analysis.summary}
          </p>
        </div>
      )}

      {/* Drop-off reason */}
      {analysis.drop_off_reason && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 8, backgroundColor: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertCircle size={14} style={{ color: "#dc2626", flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontSize: "0.71rem", fontWeight: 700, color: "#dc2626", marginBottom: 2 }}>
              Disqualified at turn {analysis.drop_off_turn ?? "—"}
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--color-input-text)", margin: 0 }}>
              {analysis.drop_off_reason}
            </p>
          </div>
        </div>
      )}

      {/* Booking outcome */}
      {analysis.booking_attempted && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8, backgroundColor: "var(--color-page-bg)", border: "1px solid var(--color-card-border)" }}>
          <CheckCircle2 size={13} style={{ color: analysis.booking_outcome === "booked" ? "#16a34a" : "var(--color-sidebar-text)" }} />
          <span style={{ fontSize: "0.78rem", color: "var(--color-input-text)" }}>
            Booking {analysis.booking_outcome === "booked" ? "confirmed" : analysis.booking_outcome === "declined" ? "declined by participant" : "not completed"}
          </span>
        </div>
      )}

      {/* Information retrieved */}
      {Object.keys(infoRetrieved).length > 0 && (
        <div>
          <SectionHeader title="Information Retrieved" open={showInfo} onToggle={() => setShowInfo(v => !v)} />
          {showInfo && (
            <InfoGrid
              items={[
                { label: "Name",  value: infoRetrieved.name },
                { label: "Phone", value: infoRetrieved.phone },
                { label: "Age",   value: infoRetrieved.age },
                { label: "Sex",   value: infoRetrieved.sex },
                { label: "Email", value: infoRetrieved.email },
              ]}
            />
          )}
        </div>
      )}

      {/* Questionnaire responses */}
      {questionnaire.length > 0 && (
        <div>
          <SectionHeader
            title="Screening Responses"
            count={questionnaire.length}
            open={showQuestionnaire}
            onToggle={() => setShowQuestionnaire(v => !v)}
          />
          {showQuestionnaire && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {questionnaire.map((q, i) => {
                const isElig = q.is_eligible;
                const color  = isElig === true ? "#16a34a" : isElig === false ? "#dc2626" : "var(--color-sidebar-text)";
                const bg     = isElig === true ? "rgba(34,197,94,0.08)" : isElig === false ? "rgba(239,68,68,0.06)" : "var(--color-page-bg)";
                return (
                  <div
                    key={i}
                    style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${isElig === false ? "rgba(239,68,68,0.25)" : "var(--color-card-border)"}`, backgroundColor: bg }}
                  >
                    <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-input-text)", marginBottom: 6 }}>
                      {i + 1}. {q.question_text}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isElig === true && <CheckCircle2 size={12} style={{ color }} />}
                      {isElig === false && <AlertCircle size={12} style={{ color }} />}
                      <span style={{ fontSize: "0.76rem", fontWeight: 600, color, backgroundColor: `${color}18`, padding: "2px 9px", borderRadius: 20 }}>
                        {q.selected_option || "No answer"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Questions & answers */}
      {questions.length > 0 && (
        <div>
          <SectionHeader
            title="Questions Asked"
            count={questions.length}
            open={showQA}
            onToggle={() => setShowQA(v => !v)}
          />
          {showQA && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {questions.map((q, i) => (
                <div key={i} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: q.user_answer ? 8 : 0 }}>
                    <MessageSquare size={12} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-input-text)", margin: 0 }}>
                      {q.question}
                    </p>
                    <span style={{ marginLeft: "auto", fontSize: "0.65rem", color: "var(--color-sidebar-text)", flexShrink: 0 }}>
                      turn {q.turn}
                    </span>
                  </div>
                  {q.user_answer && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingLeft: 20 }}>
                      <User size={11} style={{ color: "var(--color-sidebar-text)", flexShrink: 0, marginTop: 2 }} />
                      <p style={{ fontSize: "0.78rem", color: "var(--color-input-text)", margin: 0, lineHeight: 1.5 }}>
                        {q.user_answer}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
