/**
 * Shared Layout Components
 * Owner: Frontend Dev 1
 *
 * Reusable layout primitives used by all dashboard modules.
 * Design tokens and component styles live in index.css — never add
 * raw Tailwind color/border/bg utilities here for anything brand-related.
 *
 * ─── Component Index ─────────────────────────────────────────────────────────
 *
 *  <RoleGuardedRoute>     — Wraps any page that requires auth + specific roles.
 *                           Use in App.jsx around every dashboard route.
 *
 *  <AppSidebar>           — Left-hand navigation column. Role-aware nav links.
 *                           Rendered once inside <PageWithSidebar>.
 *
 *  <PageWithSidebar>      — Full-page shell: sidebar + scrollable content area.
 *                           Wrap each dashboard page's root element with this.
 *
 *  <SectionCard>          — White content card with optional title, subtitle,
 *                           and header action buttons. Use for every content
 *                           section on a dashboard page (tables, forms, etc.).
 *
 *  <CampaignStatusBadge>  — Pill badge showing an advertisement's lifecycle
 *                           state (draft → published). Drop into any table row
 *                           or detail view that shows ad status.
 *
 *  <MetricSummaryCard>    — Single-metric KPI tile (label + big number + trend).
 *                           Arrange 3–4 of these in a grid at the top of any
 *                           analytics or dashboard page.
 */

import React from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useGeneration, GEN_STEPS } from "../../contexts/GenerationContext";
import {
  LayoutDashboard, Users, FileText, BarChart3,
  LogOut, Shield, Eye, Megaphone, Globe, Bot,
  Rocket, Share2, Sparkles, X,
} from "lucide-react";

// ─── RoleGuardedRoute ─────────────────────────────────────────────────────────
// Usage: wrap a page component in App.jsx to restrict access by role.
//
//   <RoleGuardedRoute allowedRoles={["study_coordinator"]}>
//     <AdminDashboard />
//   </RoleGuardedRoute>

export function RoleGuardedRoute({ children, allowedRoles }) {
  const { isAuthenticated, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="spinner--dark" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} />;
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" />;
  }
  return children;
}

// Keep legacy alias so existing imports don't break while you migrate.
export const ProtectedRoute = RoleGuardedRoute;

// ─── Navigation map (role → sidebar links) ───────────────────────────────────
// Add / remove links here when extending a role's feature set.

const SIDEBAR_LINKS_BY_ROLE = {
  study_coordinator: [
    { label: "Dashboard",       icon: LayoutDashboard, path: "/study-coordinator" },
    { label: "Create Campaign", icon: Megaphone,        path: "/study-coordinator/create" },
    { label: "User Management", icon: Users,            path: "/study-coordinator/users" },
    { label: "My Company",      icon: FileText,         path: "/study-coordinator/company" },
    { label: "Analytics",       icon: BarChart3,        path: "/study-coordinator/analytics" },
  ],
  project_manager: [
    { label: "Dashboard", icon: LayoutDashboard, path: "/project-manager" },
    { label: "Analytics", icon: BarChart3,       path: "/project-manager/analytics" },
  ],
  ethics_manager: [
    { label: "Dashboard",     icon: LayoutDashboard, path: "/ethics" },
    { label: "Ethics Review", icon: Shield,          path: "/ethics/review" },
    { label: "Documents",     icon: FileText,        path: "/ethics/documents" },
  ],
  publisher: [
    { label: "Dashboard",   icon: LayoutDashboard, path: "/publisher" },
    { label: "Deploy",      icon: Rocket,          path: "/publisher/deploy" },
    { label: "Distribute",  icon: Share2,          path: "/publisher/distribute" },
    { label: "Analytics",   icon: BarChart3,       path: "/publisher/analytics" },
  ],
};

// ─── AppSidebar ───────────────────────────────────────────────────────────────
// Already included inside <PageWithSidebar> — no need to add manually.

export function AppSidebar() {
  const { role, logout } = useAuth();
  const location = useLocation();
  const navLinks = SIDEBAR_LINKS_BY_ROLE[role] || [];

  return (
    <aside className="sidebar">
      {/* Brand / logo strip */}
      <div className="sidebar__brand">
        <div className="flex items-center gap-2.5">
          <div className="sidebar__logo-mark">
            <div className="w-2.5 h-2.5 bg-gray-950 rounded-sm" />
          </div>
          <span className="sidebar__app-name">ClinAds Pro</span>
        </div>
        <p className="sidebar__role-label">{role?.replace("_", " ")}</p>
      </div>

      {/* Role-specific nav links */}
      <nav className="sidebar__nav">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.path;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={isActive ? "sidebar__nav-link--active" : "sidebar__nav-link"}
            >
              <Icon size={16} />
              {link.label}
              {isActive && <div className="ml-auto w-1 h-1 rounded-full bg-current opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* Sign-out */}
      <button onClick={logout} className="sidebar__signout">
        <LogOut size={15} />
        Sign Out
      </button>
    </aside>
  );
}

// Keep legacy alias.
export const Sidebar = AppSidebar;

// ─── PageWithSidebar ──────────────────────────────────────────────────────────
// Usage: wrap the JSX returned by every dashboard page component.
//
//   export default function AdminDashboard() {
//     return (
//       <PageWithSidebar>
//         <h1 className="page-header__title">Hello</h1>
//         <SectionCard title="Campaigns"> ... </SectionCard>
//       </PageWithSidebar>
//     );
//   }

function GenerationPill() {
  const { isGenerating, progress, done, error, adTitle, dismiss } = useGeneration();
  if (!isGenerating) return null;

  const activeIdx  = GEN_STEPS.findIndex((s) => progress < s.threshold);
  const currentStep = activeIdx === -1 ? GEN_STEPS[GEN_STEPS.length - 1] : GEN_STEPS[activeIdx];

  const size = 36, stroke = 3, r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;

  const bg    = done  ? "rgba(74,222,128,0.12)" : error ? "rgba(239,68,68,0.12)" : "rgba(13,27,42,0.95)";
  const border = done ? "rgba(74,222,128,0.4)"  : error ? "rgba(239,68,68,0.4)"  : "rgba(255,255,255,0.12)";

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 999,
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px 10px 10px",
      borderRadius: 16,
      background: bg,
      border: `1px solid ${border}`,
      backdropFilter: "blur(12px)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      maxWidth: 320,
      transition: "all 0.3s ease",
    }}>
      {/* Mini ring */}
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke={done ? "#4ade80" : error ? "#ef4444" : "url(#pillGrad)"}
            strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.3s ease" }}
          />
          <defs>
            <linearGradient id="pillGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4ade80" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={12} style={{ color: done ? "#4ade80" : "#22d3ee" }} />
        </div>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fff", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {done ? `${adTitle} — Strategy ready!` : error ? "Generation failed" : adTitle}
        </p>
        <p style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.45)", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {done ? "Submitted for review" : error || currentStep.label}
        </p>
      </div>

      {/* Progress % or dismiss */}
      {done || error
        ? <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(255,255,255,0.4)", flexShrink: 0, display: "flex" }}>
            <X size={14} />
          </button>
        : <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#4ade80", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
            {progress}%
          </span>
      }
    </div>
  );
}

export function PageWithSidebar({ children }) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-page-bg)" }}>
      <AppSidebar />
      <main className="flex-1 p-8 overflow-auto min-w-0">{children}</main>
      <GenerationPill />
    </div>
  );
}

// Keep legacy alias.
export const DashboardLayout = PageWithSidebar;

// ─── SectionCard ─────────────────────────────────────────────────────────────
// Usage: wrap any logical content block on a dashboard page.
//
//   <SectionCard
//     title="Active Campaigns"
//     subtitle="Campaigns currently under review"
//     actions={<button className="btn--accent">+ New</button>}
//   >
//     <CampaignsTable />
//   </SectionCard>

export function SectionCard({ title, subtitle, children, actions, className = "" }) {
  return (
    <div className={`page-card ${className}`}>
      {(title || actions) && (
        <div className="page-card__header">
          <div>
            {title    && <h3 className="page-card__title">{title}</h3>}
            {subtitle && <p className="page-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      <div className="page-card__body">{children}</div>
    </div>
  );
}

// Keep legacy alias.
export const Card = SectionCard;

// ─── CampaignStatusBadge ──────────────────────────────────────────────────────
// Usage: pass the advertisement's `status` field from the API response.
//
//   <CampaignStatusBadge status={ad.status} />
//
// Valid status values (matches Advertisement.status in models.py):
//   draft | strategy_created | under_review | ethics_review |
//   approved | published | paused | optimizing

const STATUS_TO_CSS_MODIFIER = {
  draft:            "status-badge--draft",
  strategy_created: "status-badge--draft",
  under_review:     "status-badge--review",
  ethics_review:    "status-badge--review",
  approved:         "status-badge--approved",
  published:        "status-badge--published",
  paused:           "status-badge--paused",
  optimizing:       "status-badge--draft",
};

export function CampaignStatusBadge({ status }) {
  const modifier = STATUS_TO_CSS_MODIFIER[status] || "status-badge--draft";
  return (
    <span className={`status-badge ${modifier}`}>
      {status?.replace(/_/g, " ")}
    </span>
  );
}

// Keep legacy alias.
export const StatusBadge = CampaignStatusBadge;

// ─── MetricSummaryCard ────────────────────────────────────────────────────────
// Usage: arrange 3–4 in a responsive grid at the top of analytics pages.
//
//   <div className="grid grid-cols-4 gap-4">
//     <MetricSummaryCard label="Total Campaigns" value={42} icon={Megaphone} trend={12} />
//     <MetricSummaryCard label="Click-Through Rate" value="3.8%" icon={BarChart3} trend={-2} />
//   </div>

export function MetricSummaryCard({ label, value, icon: Icon, trend }) {
  return (
    <div className="metric-tile">
      <div className="flex items-center justify-between mb-3">
        <p className="metric-tile__label">{label}</p>
        {Icon && (
          <div className="metric-tile__icon-wrap">
            <Icon size={15} style={{ color: "var(--color-sidebar-text)" }} />
          </div>
        )}
      </div>
      <p className="metric-tile__value">{value}</p>
      {trend != null && (
        <p className={trend > 0 ? "metric-tile__trend--up" : "metric-tile__trend--down"}>
          {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}% vs last period
        </p>
      )}
    </div>
  );
}

// Keep legacy alias.
export const StatCard = MetricSummaryCard;