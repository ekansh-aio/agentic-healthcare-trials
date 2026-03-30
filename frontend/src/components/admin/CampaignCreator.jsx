/**
 * M11: Campaign Creator
 * Owner: Frontend Dev 2
 * Dependencies: adsAPI
 *
 * Ad type rules:
 *  - Multiple types can be selected simultaneously.
 *  - Voicebot and Chatbot are locked until Website is selected.
 *  - Deselecting Website automatically removes Voicebot and Chatbot.
 *
 * Protocol Documents:
 *  - Accepts PDF, DOCX, Markdown, TXT via drag-and-drop or file picker.
 *  - Each file gets an auto-inferred doc_type (editable by user).
 *  - After ad creation, each file is uploaded via POST /advertisements/{id}/documents.
 *  - Stored at uploads/docs/<company_id>/<ad_id>/<filename> — separate from company docs.
 *  - Priority 10 — curator treats these as higher-priority context than company docs (0).
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageWithSidebar, SectionCard } from "../shared/Layout";
import { adsAPI, companyAPI } from "../../services/api";
import { useGeneration } from "../../contexts/GenerationContext";
import { Globe, Image, Bot, MessageSquare, Sparkles, FileText, X, Upload, MapPin, ChevronDown, Check, Users, Megaphone, ArrowLeft, ArrowRight, Plus } from "lucide-react";


// Accepted MIME types and their display labels
const ACCEPTED_TYPES = {
  "application/pdf":                                                              { ext: "PDF",  color: "#e74c3c" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":     { ext: "DOCX", color: "#2980b9" },
  "text/markdown":                                                                { ext: "MD",   color: "#8e44ad" },
  "text/plain":                                                                   { ext: "TXT",  color: "#27ae60" },
};
const ACCEPT_STRING = Object.keys(ACCEPTED_TYPES).join(",") + ",.md,.txt";

const DOC_TYPE_OPTIONS = [
  { value: "product_description",   label: "Product / Service Description" },
  { value: "campaign_requirements", label: "Campaign Requirements" },
  { value: "targets",               label: "Targets & KPIs" },
  { value: "audience_brief",        label: "Audience Brief" },
  { value: "compliance",            label: "Compliance / Legal" },
  { value: "other",                 label: "Other" },
];

function inferDocType(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes("product") || lower.includes("service") || lower.includes("usp")) return "product_description";
  if (lower.includes("requirement") || lower.includes("brief"))                         return "campaign_requirements";
  if (lower.includes("target") || lower.includes("kpi") || lower.includes("goal"))      return "targets";
  if (lower.includes("audience") || lower.includes("persona"))                          return "audience_brief";
  if (lower.includes("compliance") || lower.includes("legal") || lower.includes("policy")) return "compliance";
  return "other";
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function extractErrorMessage(err) {
  if (!err) return "An unknown error occurred.";
  if (typeof err === "string") return err;
  if (err.detail) {
    if (Array.isArray(err.detail)) {
      return err.detail.map((d) => `${d.loc?.join(" → ") ?? ""}: ${d.msg}`).join("\n");
    }
    return String(err.detail);
  }
  if (err.message && typeof err.message === "string") return err.message;
  try { return JSON.stringify(err, null, 2); } catch { return String(err); }
}

function ProtocolDocRow({ doc, index, onChange, onRemove }) {
  const typeInfo = ACCEPTED_TYPES[doc.file.type] ?? { ext: "FILE", color: "#7f8c8d" };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px",
      padding: "10px 12px", borderRadius: "8px",
      border: "1px solid var(--color-card-border)",
      backgroundColor: "var(--color-card-bg)",
    }}>
      <span style={{
        fontSize: "0.65rem", fontWeight: 700, padding: "2px 6px",
        borderRadius: "4px", backgroundColor: typeInfo.color + "22",
        color: typeInfo.color, flexShrink: 0, letterSpacing: "0.04em",
      }}>
        {typeInfo.ext}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: "0.8rem", fontWeight: 600, color: "var(--color-input-text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {doc.file.name}
        </p>
        <p style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)", marginTop: "1px" }}>
          {formatBytes(doc.file.size)}
        </p>
      </div>

      <select
        value={doc.doc_type}
        onChange={(e) => onChange(index, "doc_type", e.target.value)}
        style={{
          fontSize: "0.75rem", padding: "4px 8px", borderRadius: "6px",
          border: "1px solid var(--color-card-border)",
          backgroundColor: "var(--color-input-bg, var(--color-card-bg))",
          color: "var(--color-input-text)",
          flexShrink: 0, maxWidth: "180px",
        }}
      >
        {DOC_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <button
        onClick={() => onRemove(index)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--color-sidebar-text)", padding: "2px", flexShrink: 0,
          display: "flex", alignItems: "center",
        }}
        title="Remove"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function ProtocolDocsSection({ docs, onAdd, onChange, onRemove }) {
  const [dragging, setDragging] = React.useState(false);

  const processFiles = (fileList) => {
    const incoming = Array.from(fileList).filter((f) => {
      if (ACCEPTED_TYPES[f.type]) return true;
      if (f.name.endsWith(".md") || f.name.endsWith(".txt")) return true;
      return false;
    });
    onAdd(incoming.map((file) => ({ file, doc_type: inferDocType(file.name) })));
  };

  const onDrop = (e) => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files); };
  const onInputChange = (e) => { processFiles(e.target.files); e.target.value = ""; };

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: "8px",
          padding: "28px 20px", borderRadius: "10px",
          border: `2px dashed ${dragging ? "var(--color-accent)" : "var(--color-card-border)"}`,
          backgroundColor: dragging ? "var(--color-accent-subtle)" : "transparent",
          cursor: "pointer", transition: "border-color 0.15s, background-color 0.15s",
        }}
      >
        <input type="file" multiple accept={ACCEPT_STRING} onChange={onInputChange} style={{ display: "none" }} />
        <Upload size={22} style={{ color: dragging ? "var(--color-accent)" : "var(--color-sidebar-text)" }} />
        <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-input-text)", textAlign: "center" }}>
          Drag & drop files here, or <span style={{ color: "var(--color-accent)", textDecoration: "underline" }}>browse</span>
        </p>
        <p style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)", textAlign: "center" }}>
          Accepts PDF, DOCX, Markdown, TXT — multiple files allowed
        </p>
      </label>

      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc, i) => (
            <ProtocolDocRow key={i} doc={doc} index={i} onChange={onChange} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dual-month date range picker ────────────────────────────────────────────
const DAYS   = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function toYMD(date) {
  // Returns "YYYY-MM-DD" in local time
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYMD(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function DateRangePicker({ startDate, endDate, onChange }) {
  const today     = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-based
  const [hovered,   setHovered]   = useState(null); // "YYYY-MM-DD"

  const start = parseYMD(startDate);
  const end   = parseYMD(endDate);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function handleDayClick(ymd) {
    const clicked = parseYMD(ymd);
    // If no start or both set → begin new selection
    if (!start || (start && end)) {
      onChange({ startDate: ymd, endDate: "" });
      return;
    }
    // start set but no end
    if (clicked < start) {
      // clicked before start → make it the new start
      onChange({ startDate: ymd, endDate: "" });
    } else {
      onChange({ startDate: startDate, endDate: ymd });
    }
  }

  function isInRange(ymd) {
    const d = parseYMD(ymd);
    const rangeEnd = end || (start && hovered ? parseYMD(hovered) : null);
    if (!start || !rangeEnd) return false;
    const lo = start < rangeEnd ? start : rangeEnd;
    const hi = start < rangeEnd ? rangeEnd : start;
    return d > lo && d < hi;
  }
  function isStart(ymd)  { return startDate === ymd; }
  function isEnd(ymd)    { return endDate === ymd || (!endDate && hovered === ymd && start); }

  function MonthGrid({ year, month }) {
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    return (
      <div style={{ minWidth: 260 }}>
        {/* Day-of-week header */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: "0.7rem", fontWeight: 600, color: "var(--color-sidebar-text)", padding: "4px 0" }}>{d}</div>
          ))}
        </div>
        {/* Day cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 2 }}>
          {cells.map((day, idx) => {
            if (!day) return <div key={idx} />;
            const ymd  = `${year}-${String(month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const sel  = isStart(ymd) || isEnd(ymd);
            const inR  = isInRange(ymd);
            const isToday = ymd === toYMD(today);

            return (
              <div
                key={ymd}
                onClick={() => handleDayClick(ymd)}
                onMouseEnter={() => setHovered(ymd)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position: "relative",
                  textAlign: "center",
                  cursor: "pointer",
                  userSelect: "none",
                  padding: "5px 0",
                  // range background spans full cell
                  backgroundColor: inR ? "rgba(16,185,129,0.12)" : "transparent",
                  // round left edge for start, right edge for end
                  borderRadius: isStart(ymd) ? "999px 0 0 999px" : isEnd(ymd) ? "0 999px 999px 0" : 0,
                }}
              >
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 30, height: 30, borderRadius: "50%",
                  fontSize: "0.82rem", fontWeight: sel ? 700 : isToday ? 600 : 400,
                  backgroundColor: sel ? "var(--color-accent)" : "transparent",
                  color: sel ? "#fff" : isToday ? "var(--color-accent)" : "var(--color-input-text)",
                  border: isToday && !sel ? "1.5px solid var(--color-accent)" : "none",
                  transition: "background 0.1s",
                }}>
                  {day}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Right calendar month
  const rightMonth = viewMonth === 11 ? 0 : viewMonth + 1;
  const rightYear  = viewMonth === 11 ? viewYear + 1 : viewYear;

  // Format a date string for the header pill
  function fmtHeader(ymd) {
    if (!ymd) return "—";
    const d = parseYMD(ymd);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
  }

  return (
    <div style={{
      border: "1px solid var(--color-card-border)",
      borderRadius: 12,
      padding: "16px 20px",
      backgroundColor: "var(--color-card-bg)",
    }}>
      {/* Selected range header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 14px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600,
          border: `2px solid ${startDate ? "var(--color-accent)" : "var(--color-card-border)"}`,
          color: startDate ? "var(--color-input-text)" : "var(--color-sidebar-text)",
          backgroundColor: "var(--color-bg)",
          minWidth: 110, textAlign: "center",
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: "var(--color-accent)" }}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {startDate ? fmtHeader(startDate) : "Start date"}
        </div>
        <span style={{ color: "var(--color-sidebar-text)", fontWeight: 500 }}>–</span>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 14px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600,
          border: `2px solid ${endDate ? "var(--color-accent)" : "var(--color-card-border)"}`,
          color: endDate ? "var(--color-input-text)" : "var(--color-sidebar-text)",
          backgroundColor: "var(--color-bg)",
          minWidth: 110, textAlign: "center",
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: "var(--color-accent)" }}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {endDate ? fmtHeader(endDate) : "End date"}
        </div>
        {startDate && endDate && (
          <button
            type="button"
            onClick={() => onChange({ startDate: "", endDate: "" })}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", display: "flex", alignItems: "center", marginLeft: "auto", padding: "4px 8px", borderRadius: 6, fontSize: "0.75rem" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Calendars row */}
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        {/* Left month */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button type="button" onClick={prevMonth} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-accent)", display: "flex", padding: 4, borderRadius: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--color-input-text)" }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <div style={{ width: 24 }} /> {/* spacer */}
          </div>
          <MonthGrid year={viewYear} month={viewMonth} />
        </div>

        {/* Divider */}
        <div style={{ width: 1, backgroundColor: "var(--color-card-border)", alignSelf: "stretch" }} />

        {/* Right month */}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ width: 24 }} /> {/* spacer */}
            <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--color-input-text)" }}>
              {MONTHS[rightMonth]} {rightYear}
            </span>
            <button type="button" onClick={nextMonth} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-accent)", display: "flex", padding: 4, borderRadius: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <MonthGrid year={rightYear} month={rightMonth} />
        </div>
      </div>
    </div>
  );
}

// ─── Multi-location picker ────────────────────────────────────────────────────
function LocationMultiPicker({ locations, companyLocations, onChange }) {
  const [selCountry, setSelCountry] = useState("");
  const [selCity,    setSelCity]    = useState("");

  if (companyLocations.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 8, border: "1px dashed var(--color-card-border)", color: "var(--color-sidebar-text)", fontSize: "0.82rem" }}>
        <MapPin size={16} style={{ opacity: 0.5, flexShrink: 0 }} />
        No locations configured. Add them first in <strong style={{ marginLeft: 4 }}>My Company → Operating Locations</strong>.
      </div>
    );
  }

  // Group flat array by country for display
  const grouped = locations.reduce((acc, loc) => {
    if (!acc[loc.country]) acc[loc.country] = [];
    if (loc.city) acc[loc.country].push(loc.city);
    return acc;
  }, {});

  const addedCitiesForSel = new Set(
    locations.filter((l) => l.country === selCountry && l.city).map((l) => l.city)
  );
  const companyCitiesForSel = (
    companyLocations.find((c) => c.country === selCountry)?.cities || []
  ).filter((c) => !addedCitiesForSel.has(c));

  const handleAdd = () => {
    if (!selCountry) return;
    const isDup = locations.some(
      (l) => l.country === selCountry && (l.city || "") === (selCity || "")
    );
    if (!isDup) onChange([...locations, { country: selCountry, city: selCity }]);
    setSelCity("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Added locations grouped by country */}
      {Object.keys(grouped).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(grouped).map(([country, cities]) => (
            <div key={country} style={{ borderRadius: 10, border: "1px solid var(--color-card-border)", overflow: "hidden" }}>
              {/* Country header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", backgroundColor: "rgba(16,185,129,0.07)", borderBottom: cities.length ? "1px solid var(--color-card-border)" : "none" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", fontWeight: 600, color: "var(--color-accent)" }}>
                  <MapPin size={12} /> {country}
                </span>
                <button type="button" onClick={() => onChange(locations.filter((l) => l.country !== country))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", display: "flex", padding: 2 }}>
                  <X size={13} />
                </button>
              </div>
              {/* City chips */}
              {cities.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 12px" }}>
                  {cities.map((city) => (
                    <span key={city} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: "0.76rem", backgroundColor: "var(--color-bg)", border: "1px solid var(--color-card-border)", color: "var(--color-input-text)", fontWeight: 500 }}>
                      {city}
                      <button type="button" onClick={() => onChange(locations.filter((l) => !(l.country === country && l.city === city)))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", padding: 0, display: "flex" }}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Picker row */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 150px" }}>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", marginBottom: 4 }}>Country</label>
          <div style={{ position: "relative" }}>
            <select value={selCountry} onChange={(e) => { setSelCountry(e.target.value); setSelCity(""); }} className="field-input" style={{ appearance: "none", paddingRight: 28, marginBottom: 0 }}>
              <option value="">Select…</option>
              {companyLocations.map((l) => <option key={l.country} value={l.country}>{l.country}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "var(--color-sidebar-text)", pointerEvents: "none" }} />
          </div>
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", marginBottom: 4 }}>
            City <span style={{ fontWeight: 400, opacity: 0.7 }}>(optional)</span>
          </label>
          {selCountry && companyCitiesForSel.length > 0 ? (
            <div style={{ position: "relative" }}>
              <select value={selCity} onChange={(e) => setSelCity(e.target.value)} className="field-input" style={{ appearance: "none", paddingRight: 28, marginBottom: 0 }}>
                <option value="">Whole country</option>
                {companyCitiesForSel.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "var(--color-sidebar-text)", pointerEvents: "none" }} />
            </div>
          ) : (
            <input value={selCity} onChange={(e) => setSelCity(e.target.value)} disabled={!selCountry} placeholder={selCountry ? "Enter city (optional)…" : "Select country first"} className="field-input" style={{ marginBottom: 0 }} />
          )}
        </div>
        <button type="button" onClick={handleAdd} disabled={!selCountry} className="btn--accent" style={{ padding: "9px 16px", flexShrink: 0 }}>
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );
}

const AD_TYPES = [
  { value: "website",  label: "Website",       icon: Globe,         desc: "AI-generated marketing website" },
  { value: "ads",      label: "Advertisements", icon: Image,         desc: "Display, social, and search ads" },
  { value: "voicebot", label: "Voicebot",        icon: Bot,           desc: "Voice-based conversational agent", requiresWebsite: true },
  { value: "chatbot",  label: "Chatbot",         icon: MessageSquare, desc: "Text-based conversational agent", requiresWebsite: true },
];

const PLATFORMS = ["Google Ads", "Meta/Instagram", "LinkedIn", "Twitter/X", "YouTube", "TikTok", "Email"];

export default function CampaignCreator() {
  const navigate    = useNavigate();
  const { startGeneration } = useGeneration();
  const [step,       setStep]       = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [createdAd,  setCreatedAd]  = useState(null);
  const [uploadProgress, setUploadProgress] = useState("");

  const [companyLocations, setCompanyLocations] = useState([]);  // [{ country, cities }]

  useEffect(() => {
    companyAPI.getProfile()
      .then((p) => setCompanyLocations(p.locations || []))
      .catch(() => {});
  }, []);

  const [form, setForm] = useState({
    title: "",
    ad_types: [],
    budget: "",
    start_date: "",
    end_date: "",
    patients_required: "",
    platforms: [],
    target_audience: { age_range: "", gender: "", interests: "" },
    trial_location: [],
    protocol_docs: [],
  });

  const addProtocolDocs   = (incoming) => setForm((p) => ({ ...p, protocol_docs: [...p.protocol_docs, ...incoming] }));
  const updateProtocolDoc = (idx, key, val) => setForm((p) => {
    const updated = [...p.protocol_docs];
    updated[idx] = { ...updated[idx], [key]: val };
    return { ...p, protocol_docs: updated };
  });
  const removeProtocolDoc = (idx) => setForm((p) => ({
    ...p, protocol_docs: p.protocol_docs.filter((_, i) => i !== idx),
  }));

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const toggleAdType = (value, locked) => {
    if (locked) return;
    setForm((prev) => {
      const isSelected = prev.ad_types.includes(value);
      if (value === "website" && isSelected) {
        return { ...prev, ad_types: prev.ad_types.filter((x) => !["website", "voicebot", "chatbot"].includes(x)) };
      }
      return {
        ...prev,
        ad_types: isSelected ? prev.ad_types.filter((x) => x !== value) : [...prev.ad_types, value],
      };
    });
  };

  const togglePlatform = (p) => setForm((prev) => ({
    ...prev,
    platforms: prev.platforms.includes(p)
      ? prev.platforms.filter((x) => x !== p)
      : [...prev.platforms, p],
  }));

  // Compute human-readable duration label from start/end dates
  const computeDuration = (start, end) => {
    if (!start || !end) return null;
    const s = new Date(start), e = new Date(end);
    if (e <= s) return null;
    const days = Math.round((e - s) / 86400000);
    const fmt = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    if (days < 7)   return `${days} day${days !== 1 ? "s" : ""} (${fmt(s)} – ${fmt(e)})`;
    if (days < 31)  return `${Math.round(days / 7)} week${Math.round(days / 7) !== 1 ? "s" : ""} (${fmt(s)} – ${fmt(e)})`;
    const months = Math.round(days / 30.44);
    return `${months} month${months !== 1 ? "s" : ""} (${fmt(s)} – ${fmt(e)})`;
  };

  const handleCreate = async () => {
    setLoading(true);
    try {
      // Step 1 — create the advertisement record
      const ad = await adsAPI.create({
        title:             form.title,
        ad_type:           form.ad_types,
        budget:            form.budget ? parseFloat(form.budget) : null,
        duration:          computeDuration(form.start_date, form.end_date),
        trial_start_date:  form.start_date || null,
        trial_end_date:    form.end_date || null,
        platforms:         form.platforms,
        target_audience:   form.target_audience,
        trial_location:    form.trial_location.length > 0 ? form.trial_location : null,
        patients_required: form.patients_required ? parseInt(form.patients_required, 10) : null,
      });

      // Step 2 — upload each protocol document scoped to this campaign
      if (form.protocol_docs.length > 0) {
        for (let i = 0; i < form.protocol_docs.length; i++) {
          const { file, doc_type } = form.protocol_docs[i];
          setUploadProgress(`Uploading document ${i + 1} of ${form.protocol_docs.length}…`);
          const title = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim();
          await adsAPI.uploadDocument(ad.id, doc_type, title, file);
        }
        setUploadProgress("");
      }

      setCreatedAd(ad);
    } catch (err) {
      setUploadProgress("");
      alert("Campaign creation failed:\n\n" + extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = () => {
    startGeneration(createdAd.id, createdAd.title);
    navigate("/study-coordinator");
  };

  const websiteSelected = form.ad_types.includes("website");

  // ── Step definitions ─────────────────────────────────────────────────────
  const WIZARD_STEPS = [
    { id: 1, label: "Campaign Type",  icon: Megaphone  },
    { id: 2, label: "Trial Details",  icon: FileText   },
    { id: 3, label: "Location",       icon: MapPin     },
    { id: 4, label: "Audience",       icon: Users      },
    { id: 5, label: "Documents",      icon: Upload     },
    { id: 6, label: "Review",         icon: Check      },
  ];

  const canNext = () => {
    if (step === 1) return form.ad_types.length > 0;
    if (step === 2) return form.title.trim().length > 0;
    return true;
  };

  // ── Step indicator ────────────────────────────────────────────────────────
  function StepIndicator() {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 36, userSelect: "none" }}>
        {WIZARD_STEPS.map((s, idx) => {
          const done   = step > s.id;
          const active = step === s.id;
          const Icon   = s.icon;
          return (
            <React.Fragment key={s.id}>
              <div
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: done ? "pointer" : "default" }}
                onClick={() => done && setStep(s.id)}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: done || active ? "var(--color-accent)" : "var(--color-card-bg)",
                  border: `2px solid ${done || active ? "var(--color-accent)" : "var(--color-card-border)"}`,
                  color: done || active ? "#fff" : "var(--color-sidebar-text)",
                  transition: "all 0.2s",
                  flexShrink: 0,
                }}>
                  {done ? <Check size={15} strokeWidth={2.5} /> : <Icon size={15} />}
                </div>
                <span style={{
                  fontSize: "0.68rem", fontWeight: active ? 700 : 500,
                  color: active ? "var(--color-accent)" : done ? "var(--color-input-text)" : "var(--color-sidebar-text)",
                  textAlign: "center", maxWidth: 64, lineHeight: 1.2,
                }}>
                  {s.label}
                </span>
              </div>
              {idx < WIZARD_STEPS.length - 1 && (
                <div style={{
                  flex: 1, height: 2, marginTop: 17,
                  backgroundColor: step > s.id ? "var(--color-accent)" : "var(--color-card-border)",
                  transition: "background-color 0.3s",
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // ── Review summary helper ─────────────────────────────────────────────────
  function ReviewRow({ label, value, onEdit, stepId }) {
    return (
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        padding: "12px 0", borderBottom: "1px solid var(--color-card-border)",
      }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: 4 }}>{label}</p>
          <p style={{ fontSize: "0.88rem", color: "var(--color-input-text)" }}>{value || <span style={{ color: "var(--color-sidebar-text)", fontStyle: "italic" }}>Not set</span>}</p>
        </div>
        <button type="button" onClick={() => setStep(stepId)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-accent)", fontSize: "0.78rem", fontWeight: 600, padding: "2px 8px", flexShrink: 0 }}>
          Edit
        </button>
      </div>
    );
  }

  // ── Navigation bar ────────────────────────────────────────────────────────
  function NavBar({ onNext: onNextFn }) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--color-card-border)" }}>
        <button
          type="button"
          onClick={() => setStep(s => s - 1)}
          disabled={step === 1}
          className="btn--ghost"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: step === 1 ? 0 : 1, pointerEvents: step === 1 ? "none" : "auto" }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <button
          type="button"
          onClick={onNextFn || (() => setStep(s => s + 1))}
          disabled={!canNext()}
          className="btn--accent"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 24px" }}
        >
          {step === 6 ? (loading ? <><span className="spinner" /> {uploadProgress || "Creating…"}</> : "Create Campaign") : <>Next <ArrowRight size={14} /></>}
        </button>
      </div>
    );
  }

  return (
    <PageWithSidebar>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Create Campaign</h1>
          <p className="page-header__subtitle">Follow the steps to configure and launch your clinical trial campaign.</p>
        </div>
      </div>

      {!createdAd ? (
        <div style={{ maxWidth: 760 }}>
          <StepIndicator />

          {/* ── Step 1: Campaign Type ─────────────────────────────────────── */}
          {step === 1 && (
            <SectionCard title="Campaign Type" subtitle="Select one or more. Voicebot and Chatbot require Website first.">
              <div className="grid grid-cols-2 gap-3">
                {AD_TYPES.map((t) => {
                  const Icon   = t.icon;
                  const active = form.ad_types.includes(t.value);
                  const locked = !!t.requiresWebsite && !websiteSelected;
                  return (
                    <div
                      key={t.value}
                      onClick={() => toggleAdType(t.value, locked)}
                      style={{
                        display: "flex", alignItems: "center", gap: "12px",
                        padding: "16px", borderRadius: "12px",
                        border: `2px solid ${active ? "var(--color-accent)" : "var(--color-card-border)"}`,
                        backgroundColor: active ? "var(--color-accent-subtle)" : "var(--color-card-bg)",
                        opacity: locked ? 0.4 : 1,
                        cursor: locked ? "not-allowed" : "pointer",
                        transition: "border-color 0.15s, background-color 0.15s",
                        userSelect: "none",
                      }}
                    >
                      <Icon size={24} style={{ color: active ? "var(--color-accent)" : "var(--color-sidebar-text)", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-input-text)" }}>{t.label}</span>
                          {locked && <span style={{ fontSize: "0.7rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "var(--color-btn-ghost-bg)", color: "var(--color-sidebar-text)" }}>needs Website</span>}
                          {active && <span style={{ fontSize: "0.7rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "var(--color-accent-subtle)", color: "var(--color-accent-text)" }}>selected</span>}
                        </div>
                        <p style={{ fontSize: "0.75rem", marginTop: "2px", color: "var(--color-sidebar-text)" }}>{t.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {form.ad_types.length > 0 && (
                <p style={{ fontSize: "0.75rem", marginTop: "12px", fontWeight: 500, color: "var(--color-accent-text)" }}>
                  Selected: {form.ad_types.join(", ")}
                </p>
              )}
              <NavBar />
            </SectionCard>
          )}

          {/* ── Step 2: Trial Details ─────────────────────────────────────── */}
          {step === 2 && (
            <SectionCard title="Trial Details" subtitle="Name your campaign, set the budget, patient target, and trial dates.">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-input-text)" }}>
                    Campaign Title <span style={{ color: "var(--color-accent)" }}>*</span>
                  </label>
                  <input
                    value={form.title}
                    onChange={(e) => update("title", e.target.value)}
                    placeholder="e.g. Phase II Cardiology Trial 2026"
                    className="field-input"
                    autoFocus
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-input-text)" }}>
                      Budget ($) <span style={{ fontWeight: 400, color: "var(--color-sidebar-text)" }}>(optional)</span>
                    </label>
                    <input type="number" value={form.budget} onChange={(e) => update("budget", e.target.value)} placeholder="10000" className="field-input" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-input-text)" }}>
                      Patients Required <span style={{ fontWeight: 400, color: "var(--color-sidebar-text)" }}>(optional)</span>
                    </label>
                    <input type="number" min="1" value={form.patients_required} onChange={(e) => update("patients_required", e.target.value)} placeholder="e.g. 500" className="field-input" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-input-text)" }}>
                    Trial Duration <span style={{ fontWeight: 400, color: "var(--color-sidebar-text)" }}>(optional)</span>
                  </label>
                  <DateRangePicker
                    startDate={form.start_date}
                    endDate={form.end_date}
                    onChange={({ startDate, endDate }) => setForm(p => ({ ...p, start_date: startDate, end_date: endDate }))}
                  />
                  {computeDuration(form.start_date, form.end_date) && (
                    <div style={{ marginTop: "10px", display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 12px", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 500, backgroundColor: "rgba(16,185,129,0.1)", border: "1px solid var(--color-accent)", color: "var(--color-accent)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {computeDuration(form.start_date, form.end_date)}
                    </div>
                  )}
                </div>
              </div>
              <NavBar />
            </SectionCard>
          )}

          {/* ── Step 3: Location ─────────────────────────────────────────── */}
          {step === 3 && (
            <SectionCard title="Trial Locations" subtitle="Add all countries and cities where this trial is taking place.">
              <LocationMultiPicker
                locations={form.trial_location}
                companyLocations={companyLocations}
                onChange={(locs) => update("trial_location", locs)}
              />
              <NavBar />
            </SectionCard>
          )}

          {/* ── Step 4: Audience & Platforms ────────────────────────────── */}
          {step === 4 && (
            <SectionCard title="Audience & Platforms" subtitle="Define who you want to reach and where.">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-input-text)" }}>Target Platforms</label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map((p) => (
                      <button key={p} type="button" onClick={() => togglePlatform(p)} className={form.platforms.includes(p) ? "platform-pill--active" : "platform-pill"}>{p}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-input-text)" }}>Target Audience</label>
                  <div className="grid grid-cols-3 gap-4">
                    <input placeholder="Age Range (e.g. 25-45)" value={form.target_audience.age_range} onChange={(e) => update("target_audience", { ...form.target_audience, age_range: e.target.value })} className="field-input" />
                    <input placeholder="Gender" value={form.target_audience.gender} onChange={(e) => update("target_audience", { ...form.target_audience, gender: e.target.value })} className="field-input" />
                    <input placeholder="Interests" value={form.target_audience.interests} onChange={(e) => update("target_audience", { ...form.target_audience, interests: e.target.value })} className="field-input" />
                  </div>
                </div>
              </div>
              <NavBar />
            </SectionCard>
          )}

          {/* ── Step 5: Documents ─────────────────────────────────────────── */}
          {step === 5 && (
            <SectionCard title="Protocol Documents" subtitle="Upload product/service descriptions, requirements, or any brief. The AI curator uses these as high-priority context.">
              <ProtocolDocsSection docs={form.protocol_docs} onAdd={addProtocolDocs} onChange={updateProtocolDoc} onRemove={removeProtocolDoc} />
              <NavBar />
            </SectionCard>
          )}

          {/* ── Step 6: Review & Create ───────────────────────────────────── */}
          {step === 6 && (
            <div className="space-y-6">

              {/* Campaign Type */}
              <SectionCard title="Campaign Type" subtitle="Select one or more. Voicebot and Chatbot require Website first.">
                <div className="grid grid-cols-2 gap-3">
                  {AD_TYPES.map((t) => {
                    const Icon   = t.icon;
                    const active = form.ad_types.includes(t.value);
                    const locked = !!t.requiresWebsite && !websiteSelected;
                    return (
                      <div key={t.value} onClick={() => toggleAdType(t.value, locked)} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderRadius: "12px", border: `2px solid ${active ? "var(--color-accent)" : "var(--color-card-border)"}`, backgroundColor: active ? "var(--color-accent-subtle)" : "var(--color-card-bg)", opacity: locked ? 0.4 : 1, cursor: locked ? "not-allowed" : "pointer", transition: "border-color 0.15s, background-color 0.15s", userSelect: "none" }}>
                        <Icon size={20} style={{ color: active ? "var(--color-accent)" : "var(--color-sidebar-text)", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)" }}>{t.label}</span>
                            {locked && <span style={{ fontSize: "0.68rem", padding: "1px 5px", borderRadius: "4px", backgroundColor: "var(--color-btn-ghost-bg)", color: "var(--color-sidebar-text)" }}>needs Website</span>}
                            {active && <span style={{ fontSize: "0.68rem", padding: "1px 5px", borderRadius: "4px", backgroundColor: "var(--color-accent-subtle)", color: "var(--color-accent-text)" }}>selected</span>}
                          </div>
                          <p style={{ fontSize: "0.72rem", marginTop: "2px", color: "var(--color-sidebar-text)" }}>{t.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              {/* Trial Details */}
              <SectionCard title="Trial Details">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-input-text)" }}>Campaign Title <span style={{ color: "var(--color-accent)" }}>*</span></label>
                    <input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="e.g. Phase II Cardiology Trial 2026" className="field-input" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-input-text)" }}>Budget ($) <span style={{ fontWeight: 400, color: "var(--color-sidebar-text)" }}>(optional)</span></label>
                      <input type="number" value={form.budget} onChange={(e) => update("budget", e.target.value)} placeholder="10000" className="field-input" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-input-text)" }}>Patients Required <span style={{ fontWeight: 400, color: "var(--color-sidebar-text)" }}>(optional)</span></label>
                      <input type="number" min="1" value={form.patients_required} onChange={(e) => update("patients_required", e.target.value)} placeholder="e.g. 500" className="field-input" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-input-text)" }}>Trial Duration <span style={{ fontWeight: 400, color: "var(--color-sidebar-text)" }}>(optional)</span></label>
                    <DateRangePicker startDate={form.start_date} endDate={form.end_date} onChange={({ startDate, endDate }) => setForm(p => ({ ...p, start_date: startDate, end_date: endDate }))} />
                    {computeDuration(form.start_date, form.end_date) && (
                      <div style={{ marginTop: "10px", display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 12px", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 500, backgroundColor: "rgba(16,185,129,0.1)", border: "1px solid var(--color-accent)", color: "var(--color-accent)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        {computeDuration(form.start_date, form.end_date)}
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>

              {/* Location */}
              <SectionCard title="Trial Locations" subtitle="Add all countries and cities where this trial is taking place.">
                <LocationMultiPicker
                  locations={form.trial_location}
                  companyLocations={companyLocations}
                  onChange={(locs) => update("trial_location", locs)}
                />
              </SectionCard>

              {/* Audience & Platforms */}
              <SectionCard title="Audience & Platforms">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-input-text)" }}>Target Platforms</label>
                    <div className="flex flex-wrap gap-2">
                      {PLATFORMS.map((p) => (
                        <button key={p} type="button" onClick={() => togglePlatform(p)} className={form.platforms.includes(p) ? "platform-pill--active" : "platform-pill"}>{p}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-input-text)" }}>Target Audience</label>
                    <div className="grid grid-cols-3 gap-4">
                      <input placeholder="Age Range (e.g. 25-45)" value={form.target_audience.age_range} onChange={(e) => update("target_audience", { ...form.target_audience, age_range: e.target.value })} className="field-input" />
                      <input placeholder="Gender" value={form.target_audience.gender} onChange={(e) => update("target_audience", { ...form.target_audience, gender: e.target.value })} className="field-input" />
                      <input placeholder="Interests" value={form.target_audience.interests} onChange={(e) => update("target_audience", { ...form.target_audience, interests: e.target.value })} className="field-input" />
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Documents */}
              <SectionCard title="Protocol Documents" subtitle="Upload product/service descriptions, requirements, or any brief. The AI curator uses these as high-priority context.">
                <ProtocolDocsSection docs={form.protocol_docs} onAdd={addProtocolDocs} onChange={updateProtocolDoc} onRemove={removeProtocolDoc} />
              </SectionCard>

              {uploadProgress && (
                <p style={{ fontSize: "0.82rem", color: "var(--color-accent)", textAlign: "center" }}>{uploadProgress}</p>
              )}

              <NavBar onNext={handleCreate} />
            </div>
          )}
        </div>

      ) : (
        <div style={{ maxWidth: 560 }}>
          <SectionCard>
            <div className="text-center py-8 space-y-4">
              <div style={{ width: 64, height: 64, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", backgroundColor: "var(--color-accent-subtle)" }}>
                <Sparkles size={28} style={{ color: "var(--color-accent)" }} />
              </div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--color-input-text)" }}>{createdAd.title}</h2>
              <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
                Campaign created with: <strong>{createdAd.ad_type?.join(", ")}</strong>.
                {form.protocol_docs.length > 0 && <> <strong>{form.protocol_docs.length} protocol document{form.protocol_docs.length > 1 ? "s" : ""}</strong> attached as AI context.</>}
                {" "}Generate an AI marketing strategy and submit for review?
              </p>
              <p className="text-xs" style={{ color: "var(--color-sidebar-text)", opacity: 0.6 }}>You can navigate away — generation runs in the background.</p>
              <button onClick={handleGenerate} className="btn--accent px-8 py-2.5">
                Generate Strategy & Submit for Review
              </button>
            </div>
          </SectionCard>
        </div>
      )}
    </PageWithSidebar>
  );
}