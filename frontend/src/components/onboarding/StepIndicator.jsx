import React from "react";
import { Check } from "lucide-react";
import { STEPS } from "./Constants";

/**
 * StepIndicator
 * Renders the dot + label progress bar at the top of the wizard.
 * Already-visited steps (index < currentStep) are clickable.
 *
 * Props:
 *   currentStep  {number}   — the active step index
 *   onStepClick  {function} — called with the step index when a past step is clicked
 */
export default function StepIndicator({ currentStep, onStepClick }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      marginBottom: "32px",
    }}>
      {STEPS.map((s, i) => {
        const done      = i < currentStep;
        const active    = i === currentStep;
        const clickable = i < currentStep;
        const Icon      = s.icon;

        return (
          <React.Fragment key={i}>
            {/* Step dot + label */}
            <div
              onClick={() => clickable && onStepClick(i)}
              style={{
                display:       "flex",
                flexDirection: "column",
                alignItems:    "center",
                gap:           "8px",
                minWidth:      "72px",
                cursor:        clickable ? "pointer" : "default",
              }}
            >
              {/* Circle */}
              <div style={{
                width:           "36px",
                height:          "36px",
                borderRadius:    "50%",
                border:          `2px solid ${done || active ? "var(--color-accent)" : "#374151"}`,
                backgroundColor: done ? "var(--color-accent)" : "#111827",
                display:         "flex",
                alignItems:      "center",
                justifyContent:  "center",
                transition:      "all 0.2s",
                boxShadow:       active ? "0 0 0 3px rgba(16,185,129,0.2)" : "none",
              }}>
                {done
                  ? <Check size={14} strokeWidth={3} color="var(--color-sidebar-bg)" />
                  : <Icon  size={14} color={active ? "var(--color-accent)" : "#6b7280"} />
                }
              </div>

              {/* Label */}
              <span style={{
                fontSize:            "0.7rem",
                fontWeight:          active ? 600 : 400,
                color:               active ? "var(--color-accent)" : done ? "#9ca3af" : "#4b5563",
                textAlign:           "center",
                lineHeight:          1.3,
                transition:          "color 0.2s",
                textDecoration:      clickable ? "underline dotted" : "none",
                textUnderlineOffset: "2px",
              }}>
                {s.label}
              </span>
            </div>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div style={{
                height:          "2px",
                width:           "40px",
                flexShrink:      0,
                marginTop:       "17px",
                backgroundColor: i < currentStep ? "var(--color-accent)" : "#374151",
                transition:      "background-color 0.2s",
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}