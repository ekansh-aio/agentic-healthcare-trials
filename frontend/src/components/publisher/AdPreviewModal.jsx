import React from "react";
import { X, ImageOff } from "lucide-react";

// ─── Ad Preview Modal ─────────────────────────────────────────────────────────
export function aspectRatioForFormat(format = "") {
  const f = format.toLowerCase();
  if (f.includes("16:9") || f.includes("banner")) return "16/9";
  if (f.includes("1:1") || f.includes("square"))  return "1/1";
  if (f.includes("9:16") || f.includes("story"))  return "9/16";
  if (f.includes("4:5"))                           return "4/5";
  return "16/9";
}

export default function AdPreviewModal({ ad, onClose }) {
  const creatives = ad.output_files || [];
  return (
    <div className="ad-preview-overlay" onClick={onClose}>
      <div className="ad-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ad-preview-modal__header">
          <div>
            <h3 className="page-card__title">{ad.title} — Ad Preview</h3>
            <p className="page-card__subtitle">{creatives.length} creative{creatives.length !== 1 ? "s" : ""}</p>
          </div>
          <button className="btn--icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          {creatives.map((c, i) => (
            <div key={i} className="ad-creative-card">
              <div className="ad-creative-card__image-area" style={{ aspectRatio: aspectRatioForFormat(c.format) }}>
                {c.image_url ? (
                  <img src={c.image_url} alt={c.headline} style={{ maxHeight: "260px", maxWidth: "100%", width: "auto", height: "auto", display: "block" }} />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <ImageOff size={28} style={{ color: "var(--color-sidebar-text)" }} />
                    <p className="text-xs" style={{ color: "var(--color-sidebar-text)" }}>No image generated</p>
                  </div>
                )}
              </div>
              <div className="ad-creative-card__body">
                <span className="ad-creative-card__format">{c.format || `Creative ${i + 1}`}</span>
                {c.headline && <p className="ad-creative-card__headline">{c.headline}</p>}
                {c.body     && <p className="ad-creative-card__body-text">{c.body}</p>}
                {c.cta      && <span className="ad-creative-card__cta">{c.cta}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
