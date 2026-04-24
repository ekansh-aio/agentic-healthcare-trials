import React, { useState, useRef, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";

// ─── Generate progress hook ───────────────────────────────────────────────────
export function useGenerateProgress() {
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

export function InlineProgress({ progress }) {
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
