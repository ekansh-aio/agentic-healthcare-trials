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

import React, { useState } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useGeneration, GEN_STEPS } from "../../contexts/GenerationContext";
import {
  LayoutDashboard, Users, FileText, BarChart3,
  LogOut, Shield, Eye, Megaphone, Globe, Bot,
  Rocket, Share2, Sparkles, X, CheckCircle2, Activity, Menu,
} from "lucide-react";

// ─── RoleGuardedRoute ─────────────────────────────────────────────────────────
// Usage: wrap a page component in App.jsx to restrict access by role.
//
//   <RoleGuardedRoute allowedRoles={["study_coordinator"]}>
//     <AdminDashboard />
//   </RoleGuardedRoute>

export function RoleGuardedRoute({ children, allowedRoles }) {
  const { isAuthenticated, role, onboarded, loading } = useAuth();
  const location = useLocation();

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="spinner--dark" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} />;
  if (!onboarded) return <Navigate to="/onboarding" />;
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

export function AppSidebar({ isOpen, onClose }) {
  const { role, logout } = useAuth();
  const location = useLocation();
  const navLinks = SIDEBAR_LINKS_BY_ROLE[role] || [];

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  return (
    <aside className={`sidebar${isOpen ? " sidebar--open" : ""}`}>
      {/* Brand / logo strip */}
      <div className="sidebar__brand">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="sidebar__logo-mark">
              <Activity size={14} color="white" strokeWidth={2.5} />
            </div>
            <span className="sidebar__app-name">ClinAds Pro</span>
          </div>
          {/* Close button — visible only on mobile */}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#9ca3af", padding: "4px", display: "flex", borderRadius: "6px",
              }}
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
          )}
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
              onClick={handleNavClick}
            >
              <Icon size={16} />
              {link.label}
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
  const location = useLocation();

  const isOnCreatePage = location.pathname === "/study-coordinator/create";

  if (!isGenerating) return null;

  const activeIdx   = GEN_STEPS.findIndex((s) => progress < s.threshold);
  const currentStep = activeIdx === -1 ? GEN_STEPS[GEN_STEPS.length - 1] : GEN_STEPS[activeIdx];

  // ── Small ring (pill) ───────────────────────────────────────────────────────
  const ps = 36, pst = 3, pr = (ps - pst) / 2;
  const pc = 2 * Math.PI * pr;
  const poff = pc - (progress / 100) * pc;

  const pillBg     = done ? "rgba(74,222,128,0.12)" : error ? "rgba(239,68,68,0.12)" : "rgba(13,27,42,0.95)";
  const pillBorder = done ? "rgba(74,222,128,0.4)"  : error ? "rgba(239,68,68,0.4)"  : "rgba(255,255,255,0.12)";

  // ── Expanded overlay — shown automatically when on the create page ──────────
  if (isOnCreatePage) {
    const bs = 116, bst = 7, br = (bs - bst) / 2;
    const bc   = 2 * Math.PI * br;
    const boff = bc - (progress / 100) * bc;

    return (
      <div className="gen-pill-overlay" style={{
        position: "fixed", top: 0, bottom: 0, right: 0,
        zIndex: 998,
        background: "rgba(10,18,30,0.97)",
        backdropFilter: "blur(20px)",
        overflowY: "auto",
        animation: "fadeIn 0.2s ease",
      }}>
        <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}} @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

        {/* Inner wrapper — auto margins center it when there's room; padding lets it breathe */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 28, padding: "40px 24px",
          margin: "auto",
          width: "100%", maxWidth: 560,
          boxSizing: "border-box",
        }}>

        {/* Big progress ring */}
        <div style={{ position: "relative", width: bs, height: bs }}>
          <svg width={bs} height={bs} style={{ transform: "rotate(-90deg)" }}>
            <circle cx={bs/2} cy={bs/2} r={br} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={bst} />
            <circle cx={bs/2} cy={bs/2} r={br} fill="none"
              stroke={done ? "#4ade80" : error ? "#ef4444" : "url(#bigGrad)"}
              strokeWidth={bst} strokeLinecap="round"
              strokeDasharray={bc} strokeDashoffset={boff}
              style={{ transition: "stroke-dashoffset 0.4s ease" }}
            />
            <defs>
              <linearGradient id="bigGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4ade80" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <span style={{ fontSize: "1.55rem", fontWeight: 800, color: done ? "#4ade80" : "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {progress}%
            </span>
            <Sparkles size={13} style={{ color: done ? "#4ade80" : "#22d3ee" }} />
          </div>
        </div>

        {/* Title & status */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff", margin: "0 0 6px" }}>
            {done ? `${adTitle} — Ready!` : error ? "Generation Failed" : adTitle}
          </p>
          <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.38)", margin: 0 }}>
            {done ? "Submitted for review" : error || "Running in background — you can navigate away safely"}
          </p>
        </div>

        {/* Step list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7, width: "100%", maxWidth: 420 }}>
          {GEN_STEPS.map((step, i) => {
            const stepDone   = progress >= step.threshold;
            const stepActive = !stepDone && (i === 0 ? progress > 0 : progress >= GEN_STEPS[i - 1].threshold);
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 10,
                background: stepDone ? "rgba(74,222,128,0.07)" : stepActive ? "rgba(34,211,238,0.07)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${stepDone ? "rgba(74,222,128,0.18)" : stepActive ? "rgba(34,211,238,0.18)" : "rgba(255,255,255,0.05)"}`,
                transition: "all 0.3s ease",
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: stepDone ? "rgba(74,222,128,0.2)" : stepActive ? "rgba(34,211,238,0.15)" : "transparent",
                  border: `1.5px solid ${stepDone ? "#4ade80" : stepActive ? "#22d3ee" : "rgba(255,255,255,0.12)"}`,
                }}>
                  {stepDone
                    ? <CheckCircle2 size={11} style={{ color: "#4ade80" }} />
                    : stepActive
                    ? <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22d3ee" }} />
                    : null}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.78rem", fontWeight: stepActive ? 700 : 500, color: stepDone ? "#4ade80" : stepActive ? "#22d3ee" : "rgba(255,255,255,0.28)", margin: 0 }}>
                    {step.label}
                  </p>
                  <p style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.22)", margin: "1px 0 0" }}>
                    {step.desc}
                  </p>
                </div>
                {stepActive && !done && (
                  <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid #22d3ee", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>

        {(done || error) && (
          <button
            onClick={dismiss}
            style={{ padding: "10px 36px", borderRadius: 10, background: "var(--color-accent)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem", fontFamily: "inherit" }}
          >
            {error ? "Dismiss" : "Done"}
          </button>
        )}

        </div>{/* end inner wrapper */}
      </div>
    );
  }

  // ── Collapsed pill (bottom-right, shown on all other pages) ────────────────
  return (
    <div
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 999,
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px 10px 10px",
        borderRadius: 16,
        background: pillBg,
        border: `1px solid ${pillBorder}`,
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        maxWidth: 320,
        cursor: "default",
        transition: "all 0.3s ease",
      }}
    >
      {/* Mini ring */}
      <div style={{ position: "relative", width: ps, height: ps, flexShrink: 0 }}>
        <svg width={ps} height={ps} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={ps/2} cy={ps/2} r={pr} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={pst} />
          <circle cx={ps/2} cy={ps/2} r={pr} fill="none"
            stroke={done ? "#4ade80" : error ? "#ef4444" : "url(#pillGrad)"}
            strokeWidth={pst} strokeLinecap="round"
            strokeDasharray={pc} strokeDashoffset={poff}
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

      {/* % or dismiss */}
      {done || error
        ? <button onClick={(e) => { e.stopPropagation(); dismiss(); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(255,255,255,0.4)", flexShrink: 0, display: "flex" }}>
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-page-bg)" }}>
      {/* Mobile backdrop — click to close */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-auto min-w-0 page-fade-in" style={{ display: "flex", flexDirection: "column" }}>
        {/* Mobile top bar — hamburger + brand name */}
        <div className="sidebar-mobile-bar">
          <button
            className="sidebar-hamburger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <span style={{ color: "#ffffff", fontWeight: 600, fontSize: "0.9rem" }}>ClinAds Pro</span>
        </div>

        <div className="page-main-content" style={{ flex: 1, padding: "2rem" }}>
          {children}
        </div>
      </main>

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
            <Icon size={15} style={{ color: "var(--color-accent)" }} />
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