import React, { useState, useEffect } from "react";
import { FileText, Download, X as XIcon } from "lucide-react";
import { adsAPI } from "../../../services/api";

export function extFromPath(p) {
  if (!p) return null;
  const parts = p.split("/").pop().split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : null;
}

export default function DocPreviewModal({ doc, adId, onClose }) {
  const ext  = extFromPath(doc.file_path);
  const mode = !ext ? "download" : ext === "pdf" ? "pdf" : ["txt", "md"].includes(ext) ? "text" : "download";
  const url  = adsAPI.getDocFileUrl(adId, doc.id);

  const [textContent, setTextContent] = useState(null);
  const [textError,   setTextError]   = useState(false);
  const [pdfError,    setPdfError]    = useState(false);

  useEffect(() => {
    if (mode !== "text") return;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(); return r.text(); })
      .then(setTextContent)
      .catch(() => setTextError(true));
  }, [url, mode]);

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 50, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
    >
      <div style={{ backgroundColor: "var(--color-card-bg)", border: "1px solid var(--color-card-border)", borderRadius: 14, width: "100%", maxWidth: 860, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--color-card-border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0, backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileText size={15} style={{ color: "var(--color-accent)" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</p>
              <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                {doc.file_path?.split("/").pop()}{ext ? ` · ${ext.toUpperCase()}` : ""}{doc.doc_type ? ` · ${doc.doc_type.replace(/_/g, " ")}` : ""}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
            {doc.file_path && (
              <a href={url} download onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", textDecoration: "none", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-input-text)" }}>
                <Download size={13} /> Download
              </a>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", borderRadius: 6, color: "var(--color-sidebar-text)" }}>
              <XIcon size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative", minHeight: 560 }}>
          {mode === "pdf" && !pdfError && (
            <iframe
              src={url}
              title={doc.title}
              style={{ width: "100%", height: "100%", border: "none", display: "block", minHeight: 560 }}
              onError={() => setPdfError(true)}
            />
          )}
          {mode === "pdf" && pdfError && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "48px 24px", textAlign: "center" }}>
              <FileText size={40} style={{ color: "var(--color-sidebar-text)", opacity: 0.5 }} />
              <p style={{ color: "var(--color-input-text)", fontWeight: 600, fontSize: "0.95rem" }}>Could not load PDF preview</p>
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.82rem", maxWidth: 340 }}>The file may still be accessible via download.</p>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", textDecoration: "none", backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)", border: "1px solid var(--color-accent)", color: "var(--color-accent)" }}>
                <Download size={15} /> Open PDF
              </a>
            </div>
          )}
          {mode === "text" && (
            <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>
              {textError
                ? <p style={{ color: "#ef4444", fontSize: "0.875rem" }}>Failed to load file content.</p>
                : textContent === null
                  ? <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.875rem" }}>Loading…</p>
                  : <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.82rem", lineHeight: 1.7, color: "var(--color-input-text)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{textContent}</pre>
              }
            </div>
          )}
          {mode === "download" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "48px 24px", textAlign: "center" }}>
              <FileText size={40} style={{ color: "var(--color-sidebar-text)", opacity: 0.5 }} />
              <p style={{ color: "var(--color-input-text)", fontWeight: 600, fontSize: "0.95rem" }}>Preview not available for {ext ? ext.toUpperCase() : "this file type"}</p>
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.82rem", maxWidth: 340 }}>Download the file to view it in your local application.</p>
              {doc.file_path && (
                <a href={url} download style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", textDecoration: "none", backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)", border: "1px solid var(--color-accent)", color: "var(--color-accent)" }}>
                  <Download size={15} /> Download {ext?.toUpperCase() ?? "File"}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
