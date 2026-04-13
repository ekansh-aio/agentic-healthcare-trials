/**
 * M11: Admin Dashboard
 * Owner: Frontend Dev 2
 * Dependencies: Shared Layout, adsAPI, usersAPI
 *
 * Admin's home view: stats overview, campaign queue, quick actions.
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageWithSidebar, SectionCard, MetricSummaryCard, CampaignStatusBadge } from "../shared/Layout";
import { adsAPI, usersAPI } from "../../services/api";
import {
  Megaphone, Users, BarChart3, Clock, Plus, Eye,
  CheckCircle, ClipboardList, ArrowRight, UserCheck,
} from "lucide-react";

const QUESTIONNAIRE_CATEGORIES = new Set(["recruitment", "hiring", "survey", "clinical_trial", "research"]);
const QUESTIONNAIRE_KEYWORDS = ["hiring", "recruit", "survey", "clinical", "trial", "research study", "job posting", "job opening", "application", "vacancy", "vacancies", "applicant", "enroll", "enrolment", "participant", "respondent"];

function needsQuestionnaire(ad) {
  if (!ad) return false;
  if (QUESTIONNAIRE_CATEGORIES.has(ad.campaign_category)) return true;
  const title = (ad.title ?? "").toLowerCase();
  return QUESTIONNAIRE_KEYWORDS.some((kw) => title.includes(kw));
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
      gridTemplateColumns: "1fr 180px 90px 90px 120px 110px",
      alignItems: "center",
      padding: "14px 16px",
      borderBottom: "1px solid var(--color-card-border)",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={bar("55%", 13)} />
        <div style={bar("30%", 11)} />
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <div style={{ ...bar(52, 20), borderRadius: 10 }} />
        <div style={{ ...bar(44, 20), borderRadius: 10 }} />
      </div>
      <div style={bar(44, 13)} />
      <div style={bar(52, 12)} />
      <div style={{ ...bar(72, 22), borderRadius: 10 }} />
      <div style={{ ...bar(80, 32), borderRadius: 8 }} />
    </div>
  );
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

// ─── Table header ─────────────────────────────────────────────────────────────
function TableHeader() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 180px 90px 90px 120px 110px",
      padding: "8px 16px",
      borderBottom: "1px solid var(--color-card-border)",
    }}>
      {["Campaign", "Platforms", "Budget", "Type", "Status", ""].map((h) => (
        <span key={h} style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
          color: "var(--color-sidebar-text)", textTransform: "uppercase",
        }}>
          {h}
        </span>
      ))}
    </div>
  );
}

// ─── Campaign row ─────────────────────────────────────────────────────────────
function CampaignRow({ ad, onOpen }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 180px 90px 90px 120px 110px",
        alignItems: "center",
        padding: "14px 16px",
        borderBottom: "1px solid var(--color-card-border)",
        transition: "background 0.15s",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-card-bg)"}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
      onClick={() => onOpen(ad)}
    >
      {/* Title + date */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: "var(--color-input-text)" }}>{ad.title}</p>
          {needsQuestionnaire(ad) && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "3px",
              fontSize: "0.65rem", fontWeight: 600, padding: "1px 6px", borderRadius: "999px",
              backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
              color: "var(--color-accent)",
              border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)",
            }}>
              <ClipboardList size={9} /> Questionnaire
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--color-sidebar-text)", marginTop: 2 }}>
          {new Date(ad.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {needsQuestionnaire(ad) && (
            <span style={{ marginLeft: "6px", textTransform: "capitalize" }}>
              · {ad.campaign_category ? ad.campaign_category.replace("_", " ") : "hiring / recruitment"}
            </span>
          )}
        </p>
      </div>

      {/* Platforms */}
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {ad.platforms?.length > 0
          ? ad.platforms.map((p) => <Tag key={p}>{p}</Tag>)
          : <span style={{ fontSize: 12, color: "var(--color-card-border)" }}>—</span>
        }
      </div>

      {/* Budget */}
      <p style={{ fontSize: 13, color: "var(--color-input-text)", fontWeight: 500 }}>
        {ad.budget ? `$${ad.budget.toLocaleString()}` : <span style={{ color: "var(--color-card-border)" }}>—</span>}
      </p>

      {/* Type */}
      <p style={{ fontSize: 12, color: "var(--color-sidebar-text)", textTransform: "capitalize" }}>
        {ad.ad_type?.join(", ")}
      </p>

      {/* Status */}
      <div>
        <CampaignStatusBadge status={ad.status} />
      </div>

      {/* Action */}
      <button
        onClick={(e) => { e.stopPropagation(); onOpen(ad); }}
        className="btn--accent"
        style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontSize: "0.8rem", padding: "6px 12px" }}
      >
        <Eye size={13} /> Open
      </button>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [ads,     setAds]     = useState([]);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const role = JSON.parse(localStorage.getItem("user") || "{}").role;
    const adsReq   = adsAPI.list().catch(() => []);
    const usersReq = role === "study_coordinator" ? usersAPI.list().catch(() => []) : Promise.resolve([]);
    Promise.all([adsReq, usersReq])
      .then(([a, u]) => { setAds(a); setUsers(u); })
      .finally(() => setLoading(false));
  }, []);

  const active         = ads.filter((a) => !["published"].includes(a.status));
  const published      = ads.filter((a) => a.status === "published");
  const inReview       = ads.filter((a) => ["under_review", "ethics_review"].includes(a.status));
  const totalPatients  = ads.reduce((sum, a) => sum + (a.patients_required || 0), 0);

  const onOpen = (ad) => navigate(`/study-coordinator/campaign/${ad.id}`);

  return (
    <PageWithSidebar>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Study Coordinator Dashboard</h1>
          <p className="page-header__subtitle">Manage campaigns, users, and company documents</p>
        </div>
        <Link to="/study-coordinator/create" className="btn--accent">
          <Plus size={16} /> New Campaign
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <MetricSummaryCard label="Total Campaigns"    value={loading ? "—" : ads.length}                                       icon={Megaphone} />
        <MetricSummaryCard label="Published"          value={loading ? "—" : published.length}                                 icon={BarChart3} trend={12} />
        <MetricSummaryCard label="In Review"          value={loading ? "—" : inReview.length}                                  icon={Clock} />
        <MetricSummaryCard label="Patients Required"  value={loading ? "—" : totalPatients > 0 ? totalPatients.toLocaleString() : "—"} icon={UserCheck} />
        <MetricSummaryCard label="Team Members"       value={loading ? "—" : users.length}                                    icon={Users} />
      </div>

      {/* Active campaigns queue */}
      <SectionCard
        title="Active Campaigns"
        subtitle={loading ? "Loading…" : `${active.length} campaign${active.length !== 1 ? "s" : ""} in progress`}
        actions={
          <Link to="/study-coordinator/create" className="text-sm font-medium" style={{ color: "var(--color-accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Plus size={13} /> New
          </Link>
        }
      >
        {loading ? (
          <div>
            <TableHeader />
            <SkeletonRow /><SkeletonRow /><SkeletonRow />
          </div>
        ) : active.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={40} className="empty-state__icon" />
            <p className="empty-state__text">No active campaigns — create your first one!</p>
          </div>
        ) : (
          <div>
            <TableHeader />
            {active.map((ad) => <CampaignRow key={ad.id} ad={ad} onOpen={onOpen} />)}
          </div>
        )}
      </SectionCard>

      {/* Published campaigns */}
      {!loading && published.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <SectionCard
            title="Published"
            subtitle={`${published.length} live`}
            actions={
              <Link to="/study-coordinator/analytics" className="text-sm font-medium" style={{ color: "var(--color-accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                Analytics <ArrowRight size={13} />
              </Link>
            }
          >
            {published.map((ad) => (
              <div
                key={ad.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--color-card-border)",
                  transition: "background 0.15s", cursor: "pointer",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-card-bg)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                onClick={() => onOpen(ad)}
              >
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14, color: "var(--color-input-text)" }}>{ad.title}</p>
                  <p style={{ fontSize: 12, color: "var(--color-sidebar-text)", marginTop: 2 }}>
                    {ad.platforms?.join(" · ")}
                    {ad.budget && ` · $${ad.budget.toLocaleString()}`}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CampaignStatusBadge status={ad.status} />
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpen(ad); }}
                    className="btn--ghost"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.8rem", padding: "6px 12px" }}
                  >
                    <Eye size={13} /> Open
                  </button>
                </div>
              </div>
            ))}
          </SectionCard>
        </div>
      )}
    </PageWithSidebar>
  );
}
