/**
 * M11: My Company
 * Owner: Frontend Dev 2
 * Dependencies: documentsAPI
 *
 * Manage company documents: USP, Compliances, Policies, Marketing Goals, etc.
 * Clicking a document tile opens a preview modal (PDF/TXT inline, DOCX/DOC download).
 *
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useEffect, useRef } from "react";
import { PageWithSidebar, SectionCard } from "../shared/Layout";
import { documentsAPI, brandKitAPI, onboardingAPI, companyAPI } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { applyBrandTheme, resetBrandTheme, isDefaultThemeOverrideActive } from "../../services/theme";
import {
  FileText, Plus, Pencil, Trash2, Upload, X, File, CheckCircle2, Download,
  Palette, Check, ChevronDown, ChevronUp, RotateCcw, Sparkles, Loader2, AlertCircle,
  MapPin, Search, AlertTriangle,
} from "lucide-react";
import { DOC_TYPES, ACCEPTED_DOC_FORMATS, ACCEPTED_DOC_MIME, BRAND_PRESETS, DEFAULT_PRESETS } from "../onboarding/Constants";

// ── File helpers ───────────────────────────────────────────────────────────
const FILE_LABEL = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "text/plain": "TXT",
};
function fileTypeLabel(mime) { return FILE_LABEL[mime] ?? "FILE"; }
function fileSizeStr(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Derive the file extension from the stored file_path string.
function extFromPath(filePath) {
  if (!filePath) return null;
  const name = filePath.split("/").pop();
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : null;
}

// Derive the original filename from the stored file_path string.
function nameFromPath(filePath) {
  if (!filePath) return null;
  return filePath.split("/").pop();
}

// Returns the preview mode for a given file extension.
// "pdf"      — render with <iframe>
// "text"     — fetch and render in <pre>
// "download" — no inline render, offer download only
function previewMode(ext) {
  if (!ext) return "download";
  if (ext === "pdf") return "pdf";
  if (["txt", "md"].includes(ext)) return "text";
  return "download";
}


// ── Preview Modal ──────────────────────────────────────────────────────────
function PreviewModal({ doc, onClose }) {
  const ext  = extFromPath(doc.file_path);
  const mode = previewMode(ext);
  const url  = documentsAPI.getFileUrl(doc.id);

  const [textContent, setTextContent] = useState(null);
  const [textError,   setTextError]   = useState(false);

  useEffect(() => {
    if (mode !== "text") return;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.text();
      })
      .then(setTextContent)
      .catch(() => setTextError(true));
  }, [url, mode]);

  // Close on backdrop click
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const typeInfo = DOC_TYPES.find((t) => t.value === doc.doc_type);

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{
        backgroundColor: "var(--color-card-bg)",
        border: "1px solid var(--color-card-border)",
        borderRadius: "14px",
        width: "100%", maxWidth: "860px",
        maxHeight: "90vh",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* Modal header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--color-card-border)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "7px", flexShrink: 0,
              backgroundColor: "rgba(16,185,129,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.95rem",
            }}>
              {typeInfo?.icon ?? <FileText size={15} style={{ color: "var(--color-sidebar-text)" }} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{
                fontWeight: 600, fontSize: "0.95rem",
                color: "var(--color-input-text)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {doc.title}
              </p>
              <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                {nameFromPath(doc.file_path) ?? (typeInfo?.label ?? doc.doc_type?.replace(/_/g, " "))}
                {" · "}v{doc.version}
                {ext ? ` · ${ext.toUpperCase()}` : ""}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginLeft: "12px" }}>
            {/* Download button — always available if file exists */}
            {doc.file_path && (
              <a
                href={url}
                download
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "6px 12px", borderRadius: "7px", fontSize: "0.78rem",
                  fontWeight: 500, cursor: "pointer", textDecoration: "none",
                  border: "1px solid var(--color-input-border)",
                  backgroundColor: "var(--color-input-bg)",
                  color: "var(--color-input-text)",
                }}
              >
                <Download size={13} />
                Download
              </a>
            )}
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "4px", display: "flex", borderRadius: "6px",
                color: "var(--color-sidebar-text)",
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative", minHeight: "600px" }}>

          {/* PDF */}
          {mode === "pdf" && (
            <iframe
              src={url}
              title={doc.title}
              style={{ width: "100%", height: "100%", border: "none", display: "block", minHeight: "600px" }}
            />
          )}

          {/* Plain text / Markdown */}
          {mode === "text" && (
            <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>
              {textError ? (
                <p style={{ color: "#ef4444", fontSize: "0.875rem" }}>
                  Failed to load file content.
                </p>
              ) : textContent === null ? (
                <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.875rem" }}>
                  Loading...
                </p>
              ) : (
                <pre style={{
                  margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  fontSize: "0.82rem", lineHeight: 1.7,
                  color: "var(--color-input-text)",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}>
                  {textContent}
                </pre>
              )}
            </div>
          )}

          {/* DOCX / DOC — no browser renderer */}
          {mode === "download" && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: "12px",
              padding: "48px 24px", textAlign: "center",
            }}>
              <FileText size={40} style={{ color: "var(--color-sidebar-text)", opacity: 0.5 }} />
              <p style={{ color: "var(--color-input-text)", fontWeight: 600, fontSize: "0.95rem" }}>
                Preview not available for {ext ? ext.toUpperCase() : "this file type"}
              </p>
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.82rem", maxWidth: "340px" }}>
                Download the file to view it in your local application.
              </p>
              {doc.file_path && (
                <a
                  href={url}
                  download
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    padding: "9px 18px", borderRadius: "8px", fontSize: "0.85rem",
                    fontWeight: 600, cursor: "pointer", textDecoration: "none",
                    backgroundColor: "rgba(16,185,129,0.1)",
                    border: "1px solid var(--color-accent)",
                    color: "var(--color-accent)",
                  }}
                >
                  <Download size={15} />
                  Download File
                </a>
              )}
              {!doc.file_path && (
                <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.82rem" }}>
                  No file attached to this document.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ── Add-document form ──────────────────────────────────────────────────────
function AddDocumentForm({ existingDocs, onAdd, onCancel, loading }) {
  const fileInputRef                = useRef(null);
  const [selectedType, setSelected] = useState(null);
  const [pendingFile,  setPending]  = useState(null);
  const [fileError,    setFileErr]  = useState("");

  const isOther  = selectedType === "other";
  const chosen   = DOC_TYPES.find((t) => t.value === selectedType);

  const titleFromFile = () => chosen?.label ?? selectedType;

  const docTitle = chosen?.label ?? "";

  const canAdd = selectedType && pendingFile;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ACCEPTED_DOC_MIME ?? [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
    ];
    if (file.type && !allowed.includes(file.type)) {
      setFileErr("Unsupported format. Please use PDF, DOCX, DOC, or TXT.");
      return;
    }
    setFileErr("");
    setPending(file);
  };

  const clearFile = () => {
    setPending(null);
    setFileErr("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectCategory = (value) => {
    setSelected(value);
    clearFile();
  };

  const handleAdd = () => {
    if (!canAdd) return;
    const doc_type = selectedType === "other" ? "input" : selectedType;
    onAdd({ doc_type, title: chosen?.label ?? selectedType, file: pendingFile });
  };

  return (
    <div className="space-y-4" onKeyDown={(e) => { if (e.key === "Enter" && canAdd && !loading) { e.preventDefault(); handleAdd(); } }}>

      {/* Category pills */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2"
          style={{ color: "var(--color-sidebar-text)" }}>
          Document Category
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {DOC_TYPES.map((t) => {
            const active       = selectedType === t.value;
            const alreadyAdded = t.value !== "other" && existingDocs.some((d) => d.doc_type === t.value);
            return (
              <button key={t.value} type="button"
                onClick={() => selectCategory(t.value)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", borderRadius: "999px", fontSize: "0.78rem",
                  fontWeight: active ? 600 : 400, cursor: "pointer",
                  border: `1px solid ${active ? "var(--color-accent)" : "var(--color-input-border)"}`,
                  backgroundColor: active ? "rgba(16,185,129,0.1)" : "var(--color-input-bg)",
                  color: active ? "var(--color-accent)" : "var(--color-input-text)",
                  opacity: (alreadyAdded && !active) ? 0.45 : 1,
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: "0.85rem", lineHeight: 1 }}>{t.icon}</span>
                {t.label}
                {alreadyAdded && (
                  <CheckCircle2 size={11} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* File upload zone */}
      {selectedType && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: "var(--color-sidebar-text)" }}>
            Upload File
          </p>

          {!pendingFile ? (
            <button type="button"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              className="w-full border-2 border-dashed rounded-lg py-7 flex flex-col items-center gap-2"
              style={{ borderColor: "var(--color-input-border)", backgroundColor: "transparent", cursor: "pointer" }}
            >
              <Upload size={22} style={{ color: "var(--color-sidebar-text)" }} />
              <span style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)" }}>Click to upload</span>
              <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", opacity: 0.6 }}>
                PDF · DOCX · DOC · TXT
              </span>
            </button>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "10px 14px", borderRadius: "10px",
              border: "1px solid var(--color-accent)",
              backgroundColor: "rgba(16,185,129,0.07)",
            }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "6px", flexShrink: 0,
                backgroundColor: "rgba(16,185,129,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.6rem", fontWeight: 700, color: "var(--color-accent)", letterSpacing: "0.03em",
              }}>
                {fileTypeLabel(pendingFile.type)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pendingFile.name}
                </p>
                <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                  {fileSizeStr(pendingFile.size)}
                </p>
              </div>
              <button type="button" onClick={clearFile}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex" }}>
                <X size={14} style={{ color: "var(--color-sidebar-text)" }} />
              </button>
            </div>
          )}

          {fileError && (
            <p style={{ fontSize: "0.75rem", color: "#ef4444", marginTop: "6px" }}>{fileError}</p>
          )}
          <input ref={fileInputRef} type="file"
            accept={ACCEPTED_DOC_FORMATS} onChange={handleFileChange} className="hidden" />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="btn--ghost">
          Cancel
        </button>
        <button type="button" onClick={handleAdd} disabled={!canAdd || loading} className="btn--accent">
          <File size={15} />
          {loading ? "Adding…" : "Add Document"}
        </button>
      </div>
    </div>
  );
}


// ── Edit-document form (title only; doc_type is locked) ────────────────────
function EditDocumentForm({ doc, onSave, onCancel, loading }) {
  const [title,   setTitle]   = useState(doc.title);
  const [content, setContent] = useState(doc.content ?? "");
  const typeInfo = DOC_TYPES.find((t) => t.value === doc.doc_type);
  const typeLabel = typeInfo ? `${typeInfo.icon ?? ""} ${typeInfo.label}`.trim() : doc.doc_type;

  return (
    <div className="space-y-4">

      <div style={{
        display: "inline-flex", alignItems: "center", gap: "6px",
        padding: "5px 12px", borderRadius: "999px", fontSize: "0.78rem",
        border: "1px solid var(--color-accent)",
        backgroundColor: "rgba(16,185,129,0.1)", color: "var(--color-accent)", fontWeight: 600,
      }}>
        {typeLabel}
      </div>

      <input
        placeholder="Document Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="field-input"
      />

      <textarea
        placeholder="Document Content (optional notes or extracted text)"
        rows={5}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="field-textarea"
      />

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="btn--ghost">Cancel</button>
        <button
          type="button"
          onClick={() => onSave({ title: title.trim(), content })}
          disabled={!title.trim() || loading}
          className="btn--primary"
        >
          {loading ? "Saving…" : "Update"}
        </button>
      </div>
    </div>
  );
}



// ── Locations Panel ────────────────────────────────────────────────────────
const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Argentina","Armenia","Australia","Austria",
  "Azerbaijan","Bahrain","Bangladesh","Belarus","Belgium","Bolivia","Brazil",
  "Bulgaria","Cambodia","Canada","Chile","China","Colombia","Croatia","Czech Republic",
  "Denmark","Dominican Republic","Ecuador","Egypt","Ethiopia","Finland","France",
  "Georgia","Germany","Ghana","Greece","Guatemala","Honduras","Hong Kong","Hungary",
  "India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan",
  "Jordan","Kazakhstan","Kenya","Kuwait","Lebanon","Malaysia","Mexico","Morocco",
  "Myanmar","Nepal","Netherlands","New Zealand","Nigeria","Norway","Oman","Pakistan",
  "Panama","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia",
  "Saudi Arabia","Serbia","Singapore","South Africa","South Korea","Spain",
  "Sri Lanka","Sweden","Switzerland","Taiwan","Tanzania","Thailand","Turkey",
  "Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay",
  "Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
];

function LocationsPanel() {
  const [open,      setOpen]      = useState(false);
  const [locations, setLocations] = useState([]);   // [{ country, cities }]
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState("");

  // dropdown state
  const [query,    setQuery]    = useState("");
  const [ddOpen,   setDdOpen]   = useState(false);
  const [active,   setActive]   = useState(null);  // country being edited
  const [cityInput,setCityInput]= useState("");
  const ddRef = useRef(null);

  useEffect(() => {
    companyAPI.getProfile()
      .then((p) => setLocations(p.locations || []))
      .catch(() => {});
  }, []);

  // close dropdown on outside click
  useEffect(() => {
    const h = (e) => { if (ddRef.current && !ddRef.current.contains(e.target)) setDdOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = query.trim()
    ? COUNTRIES.filter((c) => c.toLowerCase().includes(query.toLowerCase()))
    : COUNTRIES;

  const addCountry = (country) => {
    setLocations((prev) =>
      prev.find((l) => l.country === country) ? prev : [...prev, { country, cities: [] }]
    );
    setActive(country);
    setDdOpen(false);
    setQuery("");
  };

  const removeCountry = (country) => {
    setLocations((prev) => prev.filter((l) => l.country !== country));
    if (active === country) setActive(null);
  };

  const addCity = (country) => {
    const city = cityInput.trim();
    if (!city) return;
    setLocations((prev) =>
      prev.map((l) =>
        l.country === country
          ? { ...l, cities: l.cities.includes(city) ? l.cities : [...l.cities, city] }
          : l
      )
    );
    setCityInput("");
  };

  const removeCity = (country, city) => {
    setLocations((prev) =>
      prev.map((l) =>
        l.country === country ? { ...l, cities: l.cities.filter((c) => c !== city) } : l
      )
    );
  };

  const handleSave = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      await companyAPI.updateLocations(locations);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || "Failed to save locations.");
    } finally {
      setSaving(false);
    }
  };

  const totalCities = locations.reduce((n, l) => n + l.cities.length, 0);

  return (
    <div className="page-card mb-8">

      {/* Header */}
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px", background: "none", border: "none",
          cursor: "pointer", borderRadius: "var(--radius-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0,
            backgroundColor: "var(--color-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <MapPin size={15} style={{ color: "#fff" }} />
          </div>
          <div style={{ textAlign: "left" }}>
            <p className="page-card__title">Operating Locations</p>
            <p className="page-card__subtitle">
              {locations.length === 0
                ? "No locations added yet"
                : `${locations.length} ${locations.length === 1 ? "country" : "countries"}, ${totalCities} ${totalCities === 1 ? "city" : "cities"}`
              }
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={16} style={{ color: "var(--color-sidebar-text)", flexShrink: 0 }} />
               : <ChevronDown size={16} style={{ color: "var(--color-sidebar-text)", flexShrink: 0 }} />}
      </button>

      {/* Body */}
      {open && (
        <div style={{ padding: "0 24px 24px" }}>

          {/* Country dropdown */}
          <div ref={ddRef} style={{ position: "relative", marginBottom: "20px" }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: "var(--color-sidebar-text)" }}>
              Add a Country
            </p>
            <button
              type="button"
              onClick={() => setDdOpen((p) => !p)}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px", borderRadius: "8px",
                border: "1px solid var(--color-input-border)",
                backgroundColor: "var(--color-input-bg)",
                color: "var(--color-sidebar-text)", fontSize: "0.875rem", cursor: "pointer",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Search size={13} /> Select a country…
              </span>
              {ddOpen
                ? <ChevronUp size={13} />
                : <ChevronDown size={13} />}
            </button>

            {ddOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
                backgroundColor: "var(--color-card-bg)",
                border: "1px solid var(--color-card-border)",
                borderRadius: "8px", boxShadow: "0 10px 25px rgba(0,0,0,0.35)",
                overflow: "hidden",
              }}>
                <div style={{ padding: "8px", borderBottom: "1px solid var(--color-input-border)" }}>
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search countries…"
                    className="field-input"
                    style={{ marginBottom: 0, padding: "6px 10px" }}
                  />
                </div>
                <ul style={{ maxHeight: "180px", overflowY: "auto", margin: 0, padding: "4px 0", listStyle: "none" }}>
                  {filtered.length === 0 && (
                    <li style={{ padding: "8px 12px", color: "var(--color-sidebar-text)", fontSize: "0.8rem" }}>
                      No results
                    </li>
                  )}
                  {filtered.map((country) => {
                    const already = locations.some((l) => l.country === country);
                    return (
                      <li
                        key={country}
                        onClick={() => addCountry(country)}
                        style={{
                          padding: "8px 12px", cursor: "pointer", fontSize: "0.85rem",
                          color: already ? "var(--color-accent)" : "var(--color-input-text)",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-input-bg)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        {country}
                        {already && <CheckCircle2 size={13} style={{ color: "var(--color-accent)" }} />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Location cards */}
          {locations.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
              {locations.map(({ country, cities }) => (
                <div
                  key={country}
                  style={{
                    borderRadius: "10px",
                    border: `1px solid ${active === country ? "var(--color-accent)" : "var(--color-input-border)"}`,
                    backgroundColor: "var(--color-input-bg)",
                    overflow: "hidden", transition: "border-color 0.15s",
                  }}
                >
                  {/* Country row */}
                  <div
                    onClick={() => setActive(active === country ? null : country)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <MapPin size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                      <span style={{ color: "var(--color-input-text)", fontWeight: 600, fontSize: "0.875rem" }}>
                        {country}
                      </span>
                      {cities.length > 0 && (
                        <span style={{
                          fontSize: "0.7rem", color: "var(--color-sidebar-text)",
                          backgroundColor: "var(--color-card-bg)",
                          padding: "2px 7px", borderRadius: "999px",
                          border: "1px solid var(--color-card-border)",
                        }}>
                          {cities.length} {cities.length === 1 ? "city" : "cities"}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeCountry(country); }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex", color: "var(--color-sidebar-text)" }}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* City editor */}
                  {active === country && (
                    <div style={{ padding: "0 14px 14px" }}>
                      {cities.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
                          {cities.map((city) => (
                            <span
                              key={city}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "4px",
                                padding: "3px 8px", borderRadius: "999px",
                                backgroundColor: "rgba(16,185,129,0.1)",
                                border: "1px solid var(--color-accent)",
                                color: "var(--color-accent)", fontSize: "0.75rem",
                              }}
                            >
                              {city}
                              <button
                                type="button"
                                onClick={() => removeCity(country, city)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, display: "flex" }}
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "6px" }}>
                        <input
                          value={cityInput}
                          onChange={(e) => setCityInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCity(country); } }}
                          placeholder="Type a city and press Enter…"
                          className="field-input"
                          style={{ flex: 1, marginBottom: 0, padding: "7px 10px" }}
                        />
                        <button
                          type="button"
                          onClick={() => addCity(country)}
                          className="btn--accent"
                          style={{ padding: "7px 12px", fontSize: "0.8rem" }}
                        >
                          <Plus size={13} /> Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {locations.length === 0 && (
            <div style={{
              textAlign: "center", padding: "24px 16px", borderRadius: "10px",
              border: "1px dashed var(--color-input-border)",
              color: "var(--color-sidebar-text)", fontSize: "0.8rem", marginBottom: "20px",
            }}>
              <MapPin size={24} style={{ marginBottom: "8px", opacity: 0.4 }} />
              <p style={{ margin: 0 }}>No locations yet. Select a country above to get started.</p>
            </div>
          )}

          {/* Error */}
          {error && <div className="alert--error mb-4">{error}</div>}

          {/* Save row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "12px" }}>
            {saved && (
              <div className="alert--success py-2 px-3">
                <Check size={14} strokeWidth={2.5} /> Locations saved
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn--accent px-6 py-2.5"
            >
              {saving ? <><span className="spinner" /> Saving…</> : "Save Locations"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Brand Kit Panel ────────────────────────────────────────────────────────
function BrandKitPanel() {
  const [open,           setOpen]           = useState(false);
  const [brandKit,       setBrandKit]       = useState(null);
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [brand,          setBrand]          = useState(null);
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [error,          setError]          = useState("");
  const [usingDefault,   setUsingDefault]   = useState(isDefaultThemeOverrideActive);
  const brandPdfRef = useRef(null);
  const [brandPdfFile, setBrandPdfFile] = useState(null);
  const { user, companyIndustry } = useAuth();

  const handleUseDefault = () => {
    resetBrandTheme();
    setUsingDefault(true);
  };

  const handleRestoreBrandTheme = () => {
    if (brandKit) {
      applyBrandTheme(brandKit);
      setUsingDefault(false);
    }
  };

  // Fetch current brand kit on mount
  useEffect(() => {
    brandKitAPI.get()
      .then((bk) => {
        setBrandKit(bk);
        setBrand({
          primaryColor:   bk.primary_color   || null,
          secondaryColor: bk.secondary_color || null,
          accentColor:    bk.accent_color    || null,
          primaryFont:    bk.primary_font    || null,
          secondaryFont:  bk.secondary_font  || null,
          adjectives:     bk.adjectives      || "",
          dos:            bk.dos             || "",
          donts:          bk.donts           || "",
        });
        setSelectedPreset(bk.preset_name || null);
      })
      .catch(() => {
        // No brand kit yet — start blank
        setBrand({
          primaryColor: null, secondaryColor: null, accentColor: null,
          primaryFont: null, secondaryFont: null,
          adjectives: "", dos: "", donts: "",
        });
      });
  }, []);

  // Match company industry to a preset group — fallback to Technology
  const industryPresets = (() => {
    const key = Object.keys(BRAND_PRESETS).find(
      (k) => companyIndustry?.toLowerCase().includes(k.toLowerCase())
    );
    return key ? BRAND_PRESETS[key] : DEFAULT_PRESETS;
  })();

  const applyPreset = (preset) => {
    const { name, ...brandFields } = preset;
    setBrand(brandFields);
    setSelectedPreset(preset.name);
    setBrandPdfFile(null);
    if (brandPdfRef.current) brandPdfRef.current.value = "";
    setSaved(false);
  };

  const handleBrandPdfChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== "application/pdf") { setError("Please upload a PDF file."); return; }
    setBrandPdfFile(file);
    setSelectedPreset(null);
    setError("");
    setSaved(false);
  };

  const clearBrandPdf = () => {
    setBrandPdfFile(null);
    if (brandPdfRef.current) brandPdfRef.current.value = "";
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const payload = {
        primary_color:   brand.primaryColor   || null,
        secondary_color: brand.secondaryColor || null,
        accent_color:    brand.accentColor    || null,
        primary_font:    brand.primaryFont    || null,
        secondary_font:  brand.secondaryFont  || null,
        adjectives:      brand.adjectives     || null,
        dos:             brand.dos            || null,
        donts:           brand.donts          || null,
        preset_name:     selectedPreset       || null,
      };

      // Use update if brand kit exists, create if it doesn't
      const updated = brandKit
        ? await brandKitAPI.update(payload)
        : await brandKitAPI.create(payload);

      setBrandKit(updated);
      applyBrandTheme(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || "Failed to save brand kit.");
    } finally {
      setSaving(false);
    }
  };

  // Current live colors for the preview strip
  const previewColors = [
    { label: "Primary",  color: brand?.primaryColor  || "#030712" },
    { label: "Accent",   color: brand?.accentColor   || "#10b981" },
    { label: "Secondary",color: brand?.secondaryColor|| "#0f172a" },
  ];

  return (
    <div className="page-card mb-8">

      {/* Header row — always visible */}
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px", background: "none", border: "none",
          cursor: "pointer", borderRadius: "var(--radius-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0,
            backgroundColor: "var(--color-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Palette size={15} style={{ color: "#fff" }} />
          </div>
          <div style={{ textAlign: "left" }}>
            <p className="page-card__title">Brand Kit</p>
            <p className="page-card__subtitle">
              {selectedPreset ? `Active: ${selectedPreset}` : "Colors, fonts and tone for your company"}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
          {/* Color preview strip */}
          <div style={{ display: "flex", gap: "4px" }}>
            {previewColors.map(({ label, color }) => (
              <div
                key={label}
                title={label}
                style={{
                  width: "20px", height: "20px", borderRadius: "5px",
                  backgroundColor: color,
                  border: "1px solid rgba(0,0,0,0.12)",
                }}
              />
            ))}
          </div>
          {open
            ? <ChevronUp size={16} style={{ color: "var(--color-sidebar-text)" }} />
            : <ChevronDown size={16} style={{ color: "var(--color-sidebar-text)" }} />
          }
        </div>
      </button>

      {/* Expanded editor */}
      {open && brand && (
        <div style={{ borderTop: "1px solid var(--color-card-border)", padding: "20px 24px" }}>

          {/* Preset picker */}
          <p className="text-xs font-semibold uppercase tracking-wide mb-3"
            style={{ color: "var(--color-sidebar-text)" }}>
            Starter Presets
          </p>
          <div className="space-y-2 mb-5">
            {industryPresets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                style={{
                  width: "100%", padding: "11px 14px", borderRadius: "10px",
                  cursor: "pointer",
                  border: `1px solid ${selectedPreset === preset.name ? "var(--color-accent)" : "var(--color-input-border)"}`,
                  backgroundColor: selectedPreset === preset.name
                    ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.07)"
                    : "var(--color-input-bg)",
                  display: "flex", alignItems: "center", gap: "12px", textAlign: "left",
                  transition: "all 0.15s",
                  opacity: brandPdfFile ? 0.4 : 1,
                }}
              >
                <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                  {[preset.primaryColor, preset.secondaryColor, preset.accentColor].map((c, ci) => (
                    <div key={ci} style={{
                      width: "16px", height: "16px", borderRadius: "4px",
                      backgroundColor: c, border: "1px solid rgba(0,0,0,0.15)",
                    }} />
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", marginBottom: "1px" }}>
                    {preset.name}
                  </p>
                  <p style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {preset.primaryFont} · {preset.adjectives}
                  </p>
                </div>
                {selectedPreset === preset.name && (
                  <Check size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                )}
              </button>
            ))}
          </div>

          {/* OR divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-input-border)" }} />
            <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", fontWeight: 500 }}>OR</span>
            <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-input-border)" }} />
          </div>

          {/* PDF upload */}
          <p className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: "var(--color-sidebar-text)" }}>
            Upload Brand Guidelines PDF
          </p>
          {!brandPdfFile ? (
            <button
              type="button"
              onClick={() => brandPdfRef.current?.click()}
              className="w-full border-2 border-dashed rounded-lg py-6 flex flex-col items-center gap-2"
              style={{
                borderColor: "var(--color-input-border)", backgroundColor: "transparent",
                cursor: "pointer", opacity: selectedPreset ? 0.4 : 1, marginBottom: "20px",
              }}
            >
              <Upload size={20} style={{ color: "var(--color-sidebar-text)" }} />
              <span style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)" }}>
                Click to upload your brand guidelines
              </span>
              <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", opacity: 0.6 }}>
                PDF · AI will extract colors, fonts and tone automatically
              </span>
            </button>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "12px 14px", borderRadius: "10px", marginBottom: "20px",
              border: "1px solid var(--color-accent)",
              backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.07)",
            }}>
              <FileText size={18} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {brandPdfFile.name}
                </p>
                <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                  {(brandPdfFile.size / 1024).toFixed(0)} KB · AI will parse this during training
                </p>
              </div>
              <Check size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
              <button type="button" onClick={clearBrandPdf}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex" }}>
                <X size={14} style={{ color: "var(--color-sidebar-text)" }} />
              </button>
            </div>
          )}
          <input
            ref={brandPdfRef}
            type="file"
            accept="application/pdf"
            onChange={handleBrandPdfChange}
            className="hidden"
          />

          {/* Error */}
          {error && (
            <div className="alert--error mb-4">{error}</div>
          )}

          {/* Default theme toggle */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 14px", borderRadius: "10px", marginBottom: "16px",
            border: `1px solid ${usingDefault ? "var(--color-input-border)" : "var(--color-input-border)"}`,
            backgroundColor: usingDefault ? "var(--color-page-bg)" : "transparent",
          }}>
            <div>
              <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)" }}>
                Use Platform Default Theme
              </p>
              <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: "2px" }}>
                {usingDefault
                  ? "Currently active — brand kit is saved but not applied"
                  : "Override your brand kit with the platform default"
                }
              </p>
            </div>
            {usingDefault ? (
              <button
                onClick={handleRestoreBrandTheme}
                className="btn--ghost px-4 py-2 text-sm"
                style={{ flexShrink: 0 }}
              >
                Restore Brand Kit
              </button>
            ) : (
              <button
                onClick={handleUseDefault}
                className="btn--ghost px-4 py-2 text-sm"
                style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "6px" }}
              >
                <RotateCcw size={13} /> Use Default
              </button>
            )}
          </div>

          {/* Save row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "12px" }}>
            {saved && (
              <div className="alert--success py-2 px-3">
                <Check size={14} strokeWidth={2.5} /> Brand kit saved
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={saving || (!brand.primaryColor && !brand.accentColor && !brandPdfFile && !selectedPreset)}
              className="btn--accent px-6 py-2.5"
            >
              {saving ? <><span className="spinner" /> Saving…</> : "Save Brand Kit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function MyCompany() {
  const { role, logout, companyName } = useAuth();
  const [docs,          setDocs]          = useState([]);
  const [filter,        setFilter]        = useState("");
  const [mode,          setMode]          = useState(null);   // null | "add" | "edit"
  const [editingDoc,    setEditingDoc]    = useState(null);
  const [previewDoc,    setPreviewDoc]    = useState(null);   // doc to preview, or null
  const [saving,        setSaving]        = useState(false);
  const [retraining,    setRetraining]    = useState(false);
  const [retrainOk,     setRetrainOk]     = useState(false);
  const [retrainErr,    setRetrainErr]    = useState(null);

  // ── Delete account ────────────────────────────────────────────────────────
  const [showDeleteModal,   setShowDeleteModal]   = useState(false);
  const [deletePassword,    setDeletePassword]    = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError,       setDeleteError]       = useState("");
  const [deleting,          setDeleting]          = useState(false);

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== companyName) { setDeleteError(`Please type "${companyName}" exactly to confirm.`); return; }
    if (!deletePassword) { setDeleteError("Please enter your password."); return; }
    setDeleting(true); setDeleteError("");
    try {
      await companyAPI.deleteAccount(deletePassword);
      logout();
    } catch (err) {
      setDeleteError(err.message || "Failed to delete account.");
    } finally {
      setDeleting(false);
    }
  };

  const triggerRetrain = async () => {
    setRetraining(true); setRetrainOk(false); setRetrainErr(null);
    try {
      await onboardingAPI.triggerTraining();
      setRetrainOk(true);
    } catch (err) {
      setRetrainErr(err.message || "Retraining failed.");
    } finally {
      setRetraining(false);
    }
  };

  useEffect(() => {
    documentsAPI.list(filter || undefined).then(setDocs).catch(console.error);
  }, [filter]);

  const closeForm = () => { setMode(null); setEditingDoc(null); };

  // ── Add (file upload) ────────────────────────────────────────────────────
  const handleAdd = async ({ doc_type, title, file }) => {
    setSaving(true);
    try {
      const created = await documentsAPI.upload(doc_type, title, file);
      setDocs((p) => [...p, created]);
      onboardingAPI.triggerTraining().catch(() => {}); // fire-and-forget: refresh SkillConfig
      closeForm();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  // ── Edit (title + content) ───────────────────────────────────────────────
  const handleSaveEdit = async ({ title, content }) => {
    setSaving(true);
    try {
      const updated = await documentsAPI.update(editingDoc.id, { title, content });
      setDocs((p) => p.map((d) => (d.id === editingDoc.id ? updated : d)));
      onboardingAPI.triggerTraining().catch(() => {}); // fire-and-forget
      closeForm();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (e, id) => {
    // Prevent the tile click from firing the preview
    e.stopPropagation();
    if (!confirm("Delete this document?")) return;
    await documentsAPI.delete(id);
    setDocs((p) => p.filter((d) => d.id !== id));
    onboardingAPI.triggerTraining().catch(() => {}); // fire-and-forget
  };

  const handleEditClick = (e, doc) => {
    e.stopPropagation();
    setEditingDoc(doc);
    setMode("edit");
  };

  const filterTabs = [{ value: "", label: "All" }, ...DOC_TYPES.filter((t) => t.value !== "other")];

  return (
    <PageWithSidebar>

      {/* Preview modal */}
      {previewDoc && (
        <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}

      {/* Brand kit — admin only */}
      {role === "study_coordinator" && <BrandKitPanel />}

      {/* Operating locations — admin only */}
      {role === "study_coordinator" && <LocationsPanel />}

      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">My Company</h1>
          <p className="page-header__subtitle">Manage company documents and policies</p>
        </div>
        {mode === null && (
          <button onClick={() => setMode("add")} className="btn--accent">
            <Plus size={16} /> Add Document
          </button>
        )}
      </div>

      {/* Add form */}
      {mode === "add" && (
        <SectionCard title="New Document" className="mb-6">
          <AddDocumentForm
            existingDocs={docs}
            onAdd={handleAdd}
            onCancel={closeForm}
            loading={saving}
          />
        </SectionCard>
      )}

      {/* Edit form */}
      {mode === "edit" && editingDoc && (
        <SectionCard title="Edit Document" className="mb-6">
          <EditDocumentForm
            doc={editingDoc}
            onSave={handleSaveEdit}
            onCancel={closeForm}
            loading={saving}
          />
        </SectionCard>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6" style={{ flexWrap: "wrap" }}>
        {filterTabs.map((t) => (
          <button key={t.value} onClick={() => setFilter(t.value)}
            className={filter === t.value ? "filter-tab--active" : "filter-tab"}>
            {t.icon && <span style={{ marginRight: "4px" }}>{t.icon}</span>}
            {t.label}
          </button>
        ))}
      </div>

      {/* Document list */}
      <div className="space-y-3">
        {docs.length === 0 && (
          <div className="page-card page-card__body" style={{ textAlign: "center", padding: "40px 20px" }}>
            <FileText size={32} style={{ color: "var(--color-sidebar-text)", margin: "0 auto 12px" }} />
            <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.875rem" }}>
              No documents yet. Click <strong>Add Document</strong> to upload one.
            </p>
          </div>
        )}

        {docs.map((doc) => {
          const typeInfo  = DOC_TYPES.find((t) => t.value === doc.doc_type);
          const ext       = extFromPath(doc.file_path);
          const fileName  = nameFromPath(doc.file_path);
          const hasFile   = !!doc.file_path;

          return (
            <div
              key={doc.id}
              onClick={() => hasFile && setPreviewDoc(doc)}
              className="page-card page-card__body flex items-start justify-between"
              style={{
                cursor: hasFile ? "pointer" : "default",
                transition: "box-shadow 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (hasFile) {
                  e.currentTarget.style.boxShadow = "0 0 0 1.5px var(--color-accent)";
                  e.currentTarget.style.borderColor = "var(--color-accent)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "";
                e.currentTarget.style.borderColor = "";
              }}
            >
              <div className="flex gap-4" style={{ flex: 1, minWidth: 0 }}>
                {/* Category badge */}
                <div style={{
                  width: "36px", height: "36px", borderRadius: "8px", flexShrink: 0,
                  backgroundColor: "rgba(16,185,129,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1rem",
                }}>
                  {typeInfo?.icon ?? <FileText size={16} style={{ color: "var(--color-sidebar-text)" }} />}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--color-input-text)" }}>
                    {doc.title}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-sidebar-text)" }}>
                    {fileName ?? (typeInfo?.label ?? doc.doc_type?.replace(/_/g, " "))}
                    {" · "}v{doc.version}
                    {ext ? ` · ${ext.toUpperCase()}` : ""}
                    {!hasFile && " · no file"}
                  </p>
                  {doc.content && (
                    <p className="text-sm mt-2 line-clamp-2" style={{ color: "#4b5563" }}>{doc.content}</p>
                  )}
                </div>
              </div>

              {/* Action buttons — stopPropagation so tile click doesn't fire */}
              <div className="flex gap-1" style={{ flexShrink: 0, marginLeft: "12px" }}>
                <button
                  onClick={(e) => handleEditClick(e, doc)}
                  className="btn--icon"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={(e) => handleDelete(e, doc.id)}
                  className="btn--icon-danger"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── AI Skills (admin only) ─────────────────────────────────────────── */}
      {role === "study_coordinator" && (
        <SectionCard
          title="Skills"
          subtitle="Retrain the Curator & Reviewer skills against your current documents. Run this after adding documents or when a system template update is released."
          style={{ marginTop: 32 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button
              onClick={triggerRetrain}
              disabled={retraining}
              className="btn--accent"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, opacity: retraining ? 0.7 : 1 }}
            >
              {retraining
                ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                : <Sparkles size={14} />}
              {retraining ? "Retraining…" : "Retrain Skills"}
            </button>

            {retrainOk && !retraining && (
              <span style={{ fontSize: "0.78rem", color: "#22c55e", display: "flex", alignItems: "center", gap: 5 }}>
                <CheckCircle2 size={13} /> Skills updated — new strategies will use the latest template
              </span>
            )}
            {retrainErr && (
              <span style={{ fontSize: "0.78rem", color: "#ef4444", display: "flex", alignItems: "center", gap: 5 }}>
                <AlertCircle size={13} /> {retrainErr}
              </span>
            )}
          </div>
          <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: 10 }}>
            After retraining, use <strong>Regenerate Strategy</strong> on any campaign to apply the updated KPI format and improvements.
          </p>
        </SectionCard>
      )}

      {/* ── Danger Zone ──────────────────────────────────────────────────────── */}
      {role === "study_coordinator" && (
        <div style={{
          marginTop: 32,
          border: "1px solid #fca5a5",
          borderRadius: "12px",
          overflow: "hidden",
        }}>
          {/* Header strip */}
          <div style={{
            padding: "12px 20px",
            backgroundColor: "#fff5f5",
            borderBottom: "1px solid #fca5a5",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <AlertTriangle size={15} color="#dc2626" />
            <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "#dc2626" }}>Danger Zone</span>
          </div>

          {/* Action row */}
          <div style={{
            padding: "16px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 16, flexWrap: "wrap",
            backgroundColor: "#ffffff",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--color-input-text)", marginBottom: 3 }}>
                Delete this company account
              </p>
              <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", maxWidth: 500 }}>
                Once you delete a company account, there is no going back. All users, campaigns,
                documents, brand kit, and AI skills will be permanently erased.
              </p>
            </div>
            <button
              onClick={() => { setShowDeleteModal(true); setDeletePassword(""); setDeleteConfirmText(""); setDeleteError(""); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8,
                border: "1px solid #dc2626", backgroundColor: "transparent",
                color: "#dc2626", fontWeight: 600, fontSize: "0.8rem",
                cursor: "pointer", transition: "background-color 0.15s, color 0.15s",
                fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#dc2626"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#dc2626"; }}
            >
              <Trash2 size={14} /> Delete this account
            </button>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────────────────────────────── */}
      {showDeleteModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setShowDeleteModal(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 60,
            backgroundColor: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(2px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px",
          }}
        >
          <div style={{
            backgroundColor: "#ffffff",
            borderRadius: "14px",
            width: "100%", maxWidth: "480px",
            overflow: "hidden",
            boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
          }}>
            {/* Red accent bar */}
            <div style={{ height: 4, backgroundColor: "#dc2626" }} />

            <div style={{ padding: "28px" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  backgroundColor: "#fef2f2",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <AlertTriangle size={22} color="#dc2626" />
                </div>
                <div>
                  <p style={{ fontWeight: 800, fontSize: "1.05rem", color: "#111827", margin: "0 0 4px" }}>
                    Are you absolutely sure?
                  </p>
                  <p style={{ fontSize: "0.78rem", color: "#6b7280", margin: 0 }}>
                    This action <strong>cannot</strong> be undone or recovered.
                  </p>
                </div>
              </div>

              {/* What gets deleted callout */}
              <div style={{
                backgroundColor: "#fff7ed",
                border: "1px solid #fed7aa",
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 22,
              }}>
                <p style={{ fontSize: "0.78rem", color: "#c2410c", fontWeight: 700, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertCircle size={13} /> This will permanently delete:
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.78rem", color: "#7c2d12", lineHeight: 1.9 }}>
                  <li>The <strong>{companyName}</strong> company account and all settings</li>
                  <li>All users and their access</li>
                  <li>All campaigns and advertisements</li>
                  <li>All uploaded documents and brand kit</li>
                  <li>All AI-trained skills</li>
                </ul>
              </div>

              {/* Confirm by typing company name */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: "0.8rem", color: "#374151", fontWeight: 500, display: "block", marginBottom: 7, lineHeight: 1.5 }}>
                  To confirm, type{" "}
                  <code style={{
                    backgroundColor: "#f3f4f6", padding: "1px 7px", borderRadius: 5,
                    fontFamily: "monospace", fontSize: "0.82rem", color: "#dc2626", fontWeight: 700,
                  }}>{companyName}</code>{" "}
                  in the box below:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => { setDeleteConfirmText(e.target.value); setDeleteError(""); }}
                  placeholder={companyName}
                  autoFocus
                  className="field-input"
                  style={{ borderColor: deleteConfirmText && deleteConfirmText !== companyName ? "#fca5a5" : undefined }}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: "0.8rem", color: "#374151", fontWeight: 500, display: "block", marginBottom: 7 }}>
                  Confirm your password:
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && deleteConfirmText === companyName && deletePassword) handleDeleteAccount(); }}
                  placeholder="Your account password"
                  className="field-input"
                  style={{ borderColor: deleteError && !deletePassword ? "#fca5a5" : undefined }}
                />
              </div>

              {deleteError && (
                <p style={{ fontSize: "0.78rem", color: "#dc2626", marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}>
                  <AlertCircle size={12} /> {deleteError}
                </p>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="btn btn--ghost"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteConfirmText !== companyName || !deletePassword}
                  style={{
                    flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "10px 16px", borderRadius: 8, border: "none",
                    backgroundColor: "#dc2626", color: "#fff",
                    fontWeight: 700, fontSize: "0.8rem", fontFamily: "inherit",
                    cursor: (deleting || deleteConfirmText !== companyName || !deletePassword) ? "not-allowed" : "pointer",
                    opacity: (deleting || deleteConfirmText !== companyName || !deletePassword) ? 0.45 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {deleting
                    ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Deleting…</>
                    : <><Trash2 size={14} /> I understand, delete it</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </PageWithSidebar>
  );
}