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

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageWithSidebar, SectionCard } from "../shared/Layout";
import { adsAPI } from "../../services/api";
import { Globe, Image, Bot, MessageSquare, Sparkles, FileText, X, Upload } from "lucide-react";

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

const AD_TYPES = [
  { value: "website",  label: "Website",       icon: Globe,         desc: "AI-generated marketing website" },
  { value: "ads",      label: "Advertisements", icon: Image,         desc: "Display, social, and search ads" },
  { value: "voicebot", label: "Voicebot",        icon: Bot,           desc: "Voice-based conversational agent", requiresWebsite: true },
  { value: "chatbot",  label: "Chatbot",         icon: MessageSquare, desc: "Text-based conversational agent", requiresWebsite: true },
];

const PLATFORMS = ["Google Ads", "Meta/Instagram", "LinkedIn", "Twitter/X", "YouTube", "TikTok", "Email"];

export default function CampaignCreator() {
  const navigate    = useNavigate();
  const [loading,    setLoading]    = useState(false);
  const [generating, setGenerating] = useState(false);
  const [createdAd,  setCreatedAd]  = useState(null);
  const [uploadProgress, setUploadProgress] = useState("");

  const [form, setForm] = useState({
    title: "",
    ad_types: [],
    budget: "",
    platforms: [],
    target_audience: { age_range: "", gender: "", interests: "" },
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

  const handleCreate = async () => {
    setLoading(true);
    try {
      // Step 1 — create the advertisement record
      const ad = await adsAPI.create({
        title:           form.title,
        ad_type:         form.ad_types,
        budget:          form.budget ? parseFloat(form.budget) : null,
        platforms:       form.platforms,
        target_audience: form.target_audience,
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

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await adsAPI.generateStrategy(createdAd.id);
      await adsAPI.submitForReview(createdAd.id);
      navigate("/admin");
    } catch (err) { alert("Strategy generation failed:\n\n" + extractErrorMessage(err)); }
    finally { setGenerating(false); }
  };

  const websiteSelected = form.ad_types.includes("website");

  return (
    <PageWithSidebar>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Create Campaign</h1>
          <p className="page-header__subtitle">
            Define your campaign type, budget, and audience. Then let AI generate the strategy.
          </p>
        </div>
      </div>

      {!createdAd ? (
        <div className="space-y-6 max-w-3xl">

          <SectionCard
            title="Campaign Type"
            subtitle="Select one or more. Voicebot and Chatbot require Website first."
          >
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
                        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-input-text)" }}>
                          {t.label}
                        </span>
                        {locked && (
                          <span style={{
                            fontSize: "0.7rem", padding: "1px 6px", borderRadius: "4px",
                            backgroundColor: "var(--color-btn-ghost-bg)", color: "var(--color-sidebar-text)",
                          }}>needs Website</span>
                        )}
                        {active && (
                          <span style={{
                            fontSize: "0.7rem", padding: "1px 6px", borderRadius: "4px",
                            backgroundColor: "var(--color-accent-subtle)", color: "var(--color-accent-text)",
                          }}>selected</span>
                        )}
                      </div>
                      <p style={{ fontSize: "0.75rem", marginTop: "2px", color: "var(--color-sidebar-text)" }}>
                        {t.desc}
                      </p>
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
          </SectionCard>

          <SectionCard title="Campaign Details">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-input-text)" }}>
                  Campaign Title
                </label>
                <input
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="e.g. Q2 Product Launch"
                  className="field-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-input-text)" }}>
                  Budget ($)
                </label>
                <input
                  type="number"
                  value={form.budget}
                  onChange={(e) => update("budget", e.target.value)}
                  placeholder="10000"
                  className="field-input"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Protocol Documents"
            subtitle="Upload product/service descriptions, campaign requirements, targets, or any brief. The AI curator uses these as high-priority context when generating your strategy."
          >
            <ProtocolDocsSection
              docs={form.protocol_docs}
              onAdd={addProtocolDocs}
              onChange={updateProtocolDoc}
              onRemove={removeProtocolDoc}
            />
          </SectionCard>

          <SectionCard title="Target Platforms">
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={form.platforms.includes(p) ? "platform-pill--active" : "platform-pill"}
                >
                  {p}
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Target Audience">
            <div className="grid grid-cols-3 gap-4">
              <input
                placeholder="Age Range (e.g. 25-45)"
                value={form.target_audience.age_range}
                onChange={(e) => update("target_audience", { ...form.target_audience, age_range: e.target.value })}
                className="field-input"
              />
              <input
                placeholder="Gender"
                value={form.target_audience.gender}
                onChange={(e) => update("target_audience", { ...form.target_audience, gender: e.target.value })}
                className="field-input"
              />
              <input
                placeholder="Interests"
                value={form.target_audience.interests}
                onChange={(e) => update("target_audience", { ...form.target_audience, interests: e.target.value })}
                className="field-input"
              />
            </div>
          </SectionCard>

          {uploadProgress && (
            <p style={{ fontSize: "0.82rem", color: "var(--color-accent)", textAlign: "center" }}>
              {uploadProgress}
            </p>
          )}

          <button
            onClick={handleCreate}
            disabled={loading || !form.title || form.ad_types.length === 0}
            className="btn--primary-full"
          >
            {loading ? <><span className="spinner" /> {uploadProgress || "Creating…"}</> : "Create Campaign"}
          </button>
        </div>

      ) : (
        <SectionCard title={`Campaign Created: ${createdAd.title}`}>
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
              style={{ backgroundColor: "var(--color-accent-subtle)" }}>
              <Sparkles size={28} style={{ color: "var(--color-accent)" }} />
            </div>
            <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
              Campaign created with: <strong>{createdAd.ad_type?.join(", ")}</strong>.
              {form.protocol_docs.length > 0 && (
                <> <strong>{form.protocol_docs.length} protocol document{form.protocol_docs.length > 1 ? "s" : ""}</strong> attached as AI context.</>
              )}
              {" "}Generate an AI marketing strategy and submit for review?
            </p>
            <button onClick={handleGenerate} disabled={generating} className="btn--accent px-8 py-2.5">
              {generating ? <><span className="spinner" /> AI is generating strategy…</> : "Generate Strategy & Submit for Review"}
            </button>
          </div>
        </SectionCard>
      )}
    </PageWithSidebar>
  );
}