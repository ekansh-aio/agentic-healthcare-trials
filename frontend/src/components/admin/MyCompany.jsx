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
import { documentsAPI } from "../../services/api";
import {
  FileText, Plus, Pencil, Trash2, Upload, X, File, CheckCircle2, Download,
} from "lucide-react";
import { DOC_TYPES, ACCEPTED_DOC_FORMATS, ACCEPTED_DOC_MIME } from "../onboarding/Constants";

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


// ── Main page ──────────────────────────────────────────────────────────────
export default function MyCompany() {
  const [docs,        setDocs]        = useState([]);
  const [filter,      setFilter]      = useState("");
  const [mode,        setMode]        = useState(null);   // null | "add" | "edit"
  const [editingDoc,  setEditingDoc]  = useState(null);
  const [previewDoc,  setPreviewDoc]  = useState(null);   // doc to preview, or null
  const [saving,      setSaving]      = useState(false);

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
      // TODO: trigger AI retraining — POST /onboarding/train
      // Any change to company documents should retrain Curator + Reviewer skills
      // so the SkillConfig reflects the latest document set.
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
      // TODO: trigger AI retraining — POST /onboarding/train
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
    // TODO: trigger AI retraining — POST /onboarding/train
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
    </PageWithSidebar>
  );
}