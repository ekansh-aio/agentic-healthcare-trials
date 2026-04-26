import React, { useState } from "react";
import { Send, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { adsAPI } from "../../../services/api";

// ─── Review submission panel ──────────────────────────────────────────────────
export function ReviewPanel({ adId, onSubmitted }) {
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
export function ReviewCard({ review }) {
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
