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
 *   - Reviews           — under_review and beyond
 *   - Analytics         — published only
 *
 * Actions (TODO — wired as disabled stubs for now):
 *   - Generate Strategy  — draft
 *   - Submit for Review  — strategy_created
 *   - Publish            — approved (publisher only)
 */

import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { PageWithSidebar, SectionCard, CampaignStatusBadge } from "../shared/Layout";
import { adsAPI } from "../../services/api";
import {
  ArrowLeft, Megaphone, Globe, Image, Bot, MessageSquare,
  FileText, Calendar, DollarSign, Target, Users, Layers,
  CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Status lifecycle ────────────────────────────────────────────────────────
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
        const done    = i < current;
        const active  = i === current;
        const pending = i > current;
        return (
          <React.Fragment key={step.key}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: done
                  ? "var(--color-accent)"
                  : active
                    ? "rgba(16,185,129,0.15)"
                    : "var(--color-card-bg)",
                border: `2px solid ${done || active ? "var(--color-accent)" : "var(--color-card-border)"}`,
                transition: "all 0.2s",
              }}>
                {done
                  ? <CheckCircle2 size={13} style={{ color: "#fff" }} />
                  : active
                    ? <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--color-accent)" }} />
                    : <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--color-card-border)" }} />
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

// ── Ad type icon map ────────────────────────────────────────────────────────
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

// ── Strategy viewer ─────────────────────────────────────────────────────────
function StrategySection({ strategy }) {
  const [open, setOpen] = useState(false);
  if (!strategy) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          display: "flex", alignItems: "center", gap: "8px",
          background: "none", border: "none", cursor: "pointer", padding: 0,
          color: "var(--color-accent)", fontSize: "0.85rem", fontWeight: 600,
        }}
      >
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        {open ? "Hide strategy" : "View full strategy"}
      </button>

      {open && (
        <pre style={{
          marginTop: "12px", padding: "16px", borderRadius: "10px",
          border: "1px solid var(--color-card-border)",
          backgroundColor: "var(--color-page-bg)",
          fontSize: "0.75rem", lineHeight: 1.7, whiteSpace: "pre-wrap",
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

// ── Review card ─────────────────────────────────────────────────────────────
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
        <span style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)" }}>
          {new Date(review.created_at).toLocaleDateString()}
        </span>
      </div>
      {review.comments && (
        <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)", lineHeight: 1.6 }}>
          {review.comments}
        </p>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function CampaignDetailPage() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const [ad,         setAd]         = useState(null);
  const [protoDocs,  setProtoDocs]  = useState([]);
  const [reviews,    setReviews]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  useEffect(() => {
    const load = async () => {
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
    };
    load();
  }, [id]);

  const currentStep = ad ? statusIndex(ad.status) : 0;
  const hasStrategy = ad && currentStep >= statusIndex("strategy_created");
  const hasReviews  = ad && currentStep >= statusIndex("under_review");
  const isPublished = ad && ad.status === "published";

  if (loading) return (
    <PageWithSidebar>
      <p style={{ color: "var(--color-sidebar-text)", padding: "40px 0" }}>Loading campaign…</p>
    </PageWithSidebar>
  );

  if (error || !ad) return (
    <PageWithSidebar>
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <AlertCircle size={32} style={{ color: "#ef4444", margin: "0 auto 12px" }} />
        <p style={{ color: "var(--color-input-text)", fontWeight: 600 }}>Campaign not found</p>
        <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.85rem", marginTop: "4px" }}>{error}</p>
        <button onClick={() => navigate(-1)} className="btn--ghost" style={{ marginTop: "16px" }}>
          Go back
        </button>
      </div>
    </PageWithSidebar>
  );

  return (
    <PageWithSidebar>

      {/* Page header */}
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: "4px" }}
          >
            <ArrowLeft size={18} style={{ color: "var(--color-sidebar-text)" }} />
          </button>
          <div>
            <h1 className="page-header__title">{ad.title}</h1>
            <p className="page-header__subtitle">
              Created {new Date(ad.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <CampaignStatusBadge status={ad.status} />
      </div>

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
                <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>
                  Budget
                </p>
                <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--color-input-text)" }}>
                  ${ad.budget.toLocaleString()}
                </p>
              </div>
            )}

            {ad.platforms?.length > 0 && (
              <div>
                <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>
                  Platforms
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {ad.platforms.map((p) => (
                    <span key={p} style={{
                      fontSize: "0.72rem", padding: "2px 8px", borderRadius: "999px",
                      border: "1px solid var(--color-card-border)",
                      color: "var(--color-sidebar-text)",
                    }}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {ad.target_audience && Object.values(ad.target_audience).some(Boolean) && (
              <div>
                <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>
                  Target Audience
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {ad.target_audience.age_range && (
                    <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>Age: {ad.target_audience.age_range}</p>
                  )}
                  {ad.target_audience.gender && (
                    <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>Gender: {ad.target_audience.gender}</p>
                  )}
                  {ad.target_audience.interests && (
                    <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>Interests: {ad.target_audience.interests}</p>
                  )}
                </div>
              </div>
            )}

          </div>
        </SectionCard>

        {/* Protocol documents */}
        <SectionCard
          title="Protocol Documents"
          subtitle={protoDocs.length === 0 ? "No documents attached to this campaign" : `${protoDocs.length} document${protoDocs.length > 1 ? "s" : ""} attached`}
        >
          {protoDocs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <FileText size={28} style={{ color: "var(--color-sidebar-text)", margin: "0 auto 8px", opacity: 0.5 }} />
              <p style={{ fontSize: "0.82rem", color: "var(--color-sidebar-text)" }}>
                No protocol documents were uploaded for this campaign.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {protoDocs.map((doc) => (
                <div key={doc.id} style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  padding: "10px 14px", borderRadius: "8px",
                  border: "1px solid var(--color-card-border)",
                  backgroundColor: "var(--color-card-bg)",
                }}>
                  <div style={{
                    width: "32px", height: "32px", borderRadius: "6px", flexShrink: 0,
                    backgroundColor: "rgba(16,185,129,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <FileText size={14} style={{ color: "var(--color-accent)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {doc.title}
                    </p>
                    <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                      {doc.doc_type?.replace(/_/g, " ")}
                      {doc.file_path && ` · ${doc.file_path.split("/").pop()}`}
                    </p>
                  </div>
                  <span style={{
                    fontSize: "0.65rem", fontWeight: 600, padding: "2px 6px",
                    borderRadius: "4px", backgroundColor: "rgba(16,185,129,0.1)",
                    color: "var(--color-accent)", border: "1px solid rgba(16,185,129,0.2)",
                  }}>
                    Priority {doc.priority}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Strategy */}
        {hasStrategy && (
          <SectionCard
            title="AI Marketing Strategy"
            subtitle="Generated by the Curator AI based on company and protocol documents"
          >
            {ad.strategy_json ? (
              <StrategySection strategy={ad.strategy_json} />
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)" }}>
                Strategy is being generated…
              </p>
            )}
          </SectionCard>
        )}

        {/* Reviews */}
        {hasReviews && (
          <SectionCard
            title="Review History"
            subtitle={`${reviews.length} review${reviews.length !== 1 ? "s" : ""} on record`}
          >
            {reviews.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)" }}>
                No reviews submitted yet.
              </p>
            ) : (
              <div className="space-y-3">
                {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
              </div>
            )}
          </SectionCard>
        )}

        {/* Analytics link */}
        {isPublished && (
          <SectionCard title="Analytics" subtitle="Campaign is live — view performance data">
            <Link
              to={`/admin/analytics`}
              className="btn--accent"
              style={{ display: "inline-flex" }}
            >
              View Analytics
            </Link>
          </SectionCard>
        )}

        {/* Actions */}
        <SectionCard title="Actions">
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>

            {ad.status === "draft" && (
              <button
                disabled
                className="btn--accent"
                title="TODO: trigger strategy generation"
                style={{ opacity: 0.5, cursor: "not-allowed" }}
              >
                Generate Strategy
              </button>
            )}

            {ad.status === "strategy_created" && (
              <button
                disabled
                className="btn--primary"
                title="TODO: submit for review"
                style={{ opacity: 0.5, cursor: "not-allowed" }}
              >
                Submit for Review
              </button>
            )}

            {ad.status === "approved" && (
              <button
                disabled
                className="btn--accent"
                title="TODO: publish campaign (publisher only)"
                style={{ opacity: 0.5, cursor: "not-allowed" }}
              >
                Publish Campaign
              </button>
            )}

            <button onClick={() => navigate(-1)} className="btn--ghost">
              Back
            </button>
          </div>

          {(ad.status === "draft" || ad.status === "strategy_created" || ad.status === "approved") && (
            <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: "10px" }}>
              Action buttons will be enabled in the next release.
            </p>
          )}
        </SectionCard>

      </div>
    </PageWithSidebar>
  );
}