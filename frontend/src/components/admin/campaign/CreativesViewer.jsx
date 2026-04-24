import React, { useState } from "react";
import { Download, Eye, X as XIcon, Image } from "lucide-react";

// ─── Creatives Viewer ─────────────────────────────────────────────────────────
export default function CreativesViewer({ creatives }) {
  const [popover, setPopover] = useState(null); // { url, top, left }

  const openPopover = (e, url) => {
    setPopover({ url });
  };

  if (!creatives?.length) return null;

  return (
    <>
      {/* Click-anchored popover */}
      {popover && (
        <>
          <div
            onClick={() => setPopover(null)}
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
          />
          <div
            style={{
              position: "fixed", zIndex: 1000,
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              width: 420,
              backgroundColor: "var(--color-card-bg)",
              border: "1px solid var(--color-card-border)",
              borderRadius: "14px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={popover.url}
              alt="Ad creative"
              style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: 360 }}
            />
            <button
              onClick={() => setPopover(null)}
              style={{
                position: "absolute", top: 8, right: 8,
                background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "6px",
                padding: "3px 6px", cursor: "pointer", color: "#fff",
                display: "flex", alignItems: "center",
              }}
            >
              <XIcon size={13} />
            </button>
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" }}>
        {creatives.map((c, i) => (
          <div key={i} style={{
            borderRadius: "16px",
            border: "2px solid var(--color-card-border)",
            backgroundColor: "var(--color-card-bg)",
            boxShadow: "0 4px 18px rgba(0,0,0,0.10)",
            overflow: "visible",
            padding: "10px 10px 0 10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}>
            {/* Image */}
            <div style={{
              position: "relative",
              backgroundColor: "var(--color-page-bg)",
              overflow: "hidden",
              maxHeight: "260px",
              maxWidth: "100%",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "center",
            }}>
              {c.image_url ? (
                <img
                  src={c.image_url}
                  alt={c.headline}
                  style={{ maxHeight: "260px", maxWidth: "100%", width: "auto", height: "auto", display: "block" }}
                />
              ) : (
                <div style={{
                  width: "100%", height: "100%", minHeight: "160px",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px",
                  color: "var(--color-sidebar-text)",
                }}>
                  <Image size={28} style={{ opacity: 0.3 }} />
                  <p style={{ fontSize: "0.72rem", opacity: 0.5 }}>Image not generated</p>
                </div>
              )}

              {/* Format badge */}
              <span style={{
                position: "absolute", top: "8px", left: "8px",
                fontSize: "0.65rem", fontWeight: 600, padding: "2px 7px", borderRadius: "4px",
                backgroundColor: "rgba(0,0,0,0.6)", color: "#fff", backdropFilter: "blur(4px)",
              }}>
                {c.format}
              </span>

              {/* View full size button */}
              {c.image_url && (
                <button
                  onClick={(e) => openPopover(e, c.image_url)}
                  style={{
                    position: "absolute", top: "8px", right: "8px",
                    background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "6px",
                    padding: "4px 6px", cursor: "pointer", display: "flex", alignItems: "center",
                    color: "#fff", backdropFilter: "blur(4px)",
                  }}
                  title="View full size"
                >
                  <Eye size={12} />
                </button>
              )}
            </div>

            {/* Copy */}
            <div style={{ padding: "16px", textAlign: "center", width: "100%" }}>
              <p style={{
                fontSize: "1rem", fontWeight: 700,
                color: "var(--color-input-text)", marginBottom: "6px", lineHeight: 1.3,
              }}>
                {c.headline}
              </p>
              <p style={{
                fontSize: "0.82rem", color: "var(--color-sidebar-text)",
                lineHeight: 1.6, marginBottom: "12px",
              }}>
                {c.body}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
                <span style={{
                  fontSize: "0.75rem", fontWeight: 600,
                  padding: "4px 12px", borderRadius: "999px",
                  backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12)",
                  color: "var(--color-accent)",
                  border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)",
                }}>
                  {c.cta}
                </span>
                {c.image_url && (
                  <a
                    href={c.image_url}
                    download
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "4px",
                      fontSize: "0.72rem", color: "var(--color-sidebar-text)",
                      textDecoration: "none",
                    }}
                  >
                    <Download size={11} /> Download
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
