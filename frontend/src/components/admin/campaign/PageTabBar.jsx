import React from "react";
import { LayoutDashboard, Layers, ClipboardList, Users, ClipboardCheck, History, Zap, CalendarDays } from "lucide-react";

// ─── Page-level tabs ──────────────────────────────────────────────────────────
export const PAGE_TABS = [
  { key: "overview",      label: "Overview",      icon: LayoutDashboard, alwaysShow: true  },
  { key: "strategy",      label: "Strategy",      icon: Layers,          alwaysShow: true  },
  { key: "questionnaire", label: "Questionnaire", icon: ClipboardList,   alwaysShow: true  },
  { key: "participants",  label: "Participants",  icon: Users,           alwaysShow: true  },
  { key: "bookings",      label: "Bookings",      icon: CalendarDays,    alwaysShow: true  },
  { key: "review",        label: "Review",        icon: ClipboardCheck,  alwaysShow: true  },
  { key: "history",       label: "History",       icon: History,         alwaysShow: true  },
  { key: "publish",       label: "Publish",       icon: Zap,             alwaysShow: true  },
];

export default function PageTabBar({ active, onChange, showQuestionnaireDot, role, adTypes }) {
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
