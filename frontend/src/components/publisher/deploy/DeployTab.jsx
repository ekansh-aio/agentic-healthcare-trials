import React from "react";
import { SectionCard } from "../../shared/Layout";
import { adsAPI } from "../../../services/api";
import { typeLabel } from "../publisherUtils";
import {
  AlertCircle, Globe, Server, Download, Copy,
  UploadCloud, ExternalLink, CheckCircle2, Loader2,
} from "lucide-react";

// ─── Deploy platform definitions ─────────────────────────────────────────────
export const DEPLOY_PLATFORMS = [
  {
    id: "vercel",
    label: "Vercel",
    description: "Publish on Vercel",
    fields: [
      { key: "token",        label: "Vercel Token",     type: "password", placeholder: "eyJhbGci…" },
      { key: "project_name", label: "Project Name",     type: "text",     placeholder: "my-campaign" },
    ],
  },
  {
    id: "netlify",
    label: "Netlify",
    description: "Publish on Netlify",
    fields: [
      { key: "token",     label: "Personal Access Token", type: "password", placeholder: "nfp_…" },
      { key: "site_name", label: "Site Name (optional)",  type: "text",     placeholder: "my-campaign" },
    ],
  },
  {
    id: "render",
    label: "Render",
    description: "Publish on Render",
    fields: [
      { key: "api_key",    label: "API Key",    type: "password", placeholder: "rnd_…" },
      { key: "service_id", label: "Service ID", type: "text",     placeholder: "srv-…" },
    ],
  },
  {
    id: "github_pages",
    label: "GitHub Pages",
    description: "Publish on GitHub Pages",
    fields: [
      { key: "token",  label: "GitHub Token", type: "password", placeholder: "ghp_…" },
      { key: "repo",   label: "Repository",   type: "text",     placeholder: "username/repo" },
      { key: "branch", label: "Branch",       type: "text",     placeholder: "gh-pages" },
    ],
  },
  {
    id: "custom",
    label: "Custom Domain",
    description: "Publish to your own server",
    fields: [
      { key: "domain",       label: "Domain",                type: "text",     placeholder: "https://mysite.com" },
      { key: "ftp_host",     label: "FTP/SFTP Host",         type: "text",     placeholder: "ftp.mysite.com" },
      { key: "ftp_user",     label: "Username",              type: "text",     placeholder: "" },
      { key: "ftp_pass",     label: "Password",              type: "password", placeholder: "" },
      { key: "remote_path",  label: "Remote Path (optional)", type: "text",    placeholder: "/public_html" },
    ],
  },
];

// ─── Deploy Tab ───────────────────────────────────────────────────────────────
export default function DeployTab({ ads, hostingId, hostError, onHost }) {
  const deployable = ads.filter(
    (a) => (a.status === "approved" || a.status === "published") && a.ad_type?.includes("website")
  );

  if (deployable.length === 0) {
    return (
      <SectionCard title="Publish Website" subtitle="No website campaigns ready to publish yet">
        <div className="flex flex-col items-center py-12 gap-3">
          <UploadCloud size={36} style={{ color: "var(--color-sidebar-text)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
            Generate a website for an approved campaign to publish it here
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {deployable.map((ad) => {
        const isHosting  = hostingId === ad.id;
        const hostedUrl  = ad.hosted_url ? `${window.location.origin}${ad.hosted_url}` : null;

        return (
          <SectionCard key={ad.id} title={ad.title} subtitle={`${typeLabel(ad)} · ${ad.status}`}>
            {ad.output_url ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                {/* Landing page row */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px", borderRadius: 10,
                  border: "1px solid var(--color-card-border)",
                  backgroundColor: "var(--color-card-bg)",
                }}>
                  <Server size={15} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                  <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", flex: 1 }}>
                    Landing page ready
                  </p>
                  <button
                    onClick={() => onHost(ad.id)}
                    disabled={isHosting}
                    className="btn--inline-action--accent"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, opacity: isHosting ? 0.7 : 1 }}
                  >
                    {isHosting
                      ? <Loader2 size={11} style={{ animation: "spin 0.75s linear infinite" }} />
                      : <Server size={11} />}
                    {isHosting ? "Hosting…" : ad.hosted_url ? "Re-host" : "Host"}
                  </button>
                  <a href={adsAPI.websiteDownloadUrl(ad.id)} className="btn--inline-action--ghost">
                    <Download size={11} /> Download
                  </a>
                </div>

                {/* Hosted URL bar */}
                {hostedUrl && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: 8,
                    backgroundColor: "rgba(16,185,129,0.06)",
                    border: "1px solid rgba(16,185,129,0.25)",
                  }}>
                    <Globe size={13} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                    <a
                      href={hostedUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: "0.8rem", color: "var(--color-accent)", flex: 1, wordBreak: "break-all", textDecoration: "none", fontWeight: 500 }}
                    >
                      {hostedUrl}
                    </a>
                    <button
                      onClick={() => navigator.clipboard.writeText(hostedUrl)}
                      title="Copy URL"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", padding: 2, flexShrink: 0 }}
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                )}

                {/* Host error */}
                {hostError?.[ad.id] && (
                  <p style={{ fontSize: "0.78rem", color: "#ef4444" }}>{hostError[ad.id]}</p>
                )}
              </div>
            ) : (
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px", borderRadius: 10,
                border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)",
              }}>
                <AlertCircle size={14} style={{ color: "var(--color-sidebar-text)", flexShrink: 0 }} />
                <p style={{ fontSize: "0.82rem", color: "var(--color-sidebar-text)", flex: 1 }}>
                  Website not yet generated — ask the Study Coordinator to generate the campaign website
                </p>
              </div>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

export function DeployPlatformTile({ platform, selected, status, disabled, onClick }) {
  const isDeployed = status?.status === "deployed";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", flexDirection: "column", alignItems: "flex-start",
        gap: "4px", padding: "12px 14px", borderRadius: "10px", textAlign: "left",
        border: `2px solid ${selected ? "var(--color-accent)" : isDeployed ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.4)" : "var(--color-card-border)"}`,
        backgroundColor: selected
          ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)"
          : isDeployed ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.05)" : "var(--color-card-bg)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "border-color 0.15s, background-color 0.15s",
      }}
    >
      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)" }}>
        {platform.label}{isDeployed && " ✓"}
      </span>
      <span style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)", lineHeight: 1.3 }}>
        {platform.description}
      </span>
    </button>
  );
}

export function DeployConfigForm({ platform, formData, status, onChange, onDeploy }) {
  const isDeploying = status?.status === "deploying";
  const isDeployed  = status?.status === "deployed";
  const isError     = status?.status === "error";

  const inputStyle = {
    width: "100%", padding: "8px 12px", borderRadius: "8px", fontSize: "0.83rem",
    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", outline: "none", fontFamily: "inherit",
  };
  const labelStyle = {
    fontSize: "0.72rem", fontWeight: 600, color: "var(--color-sidebar-text)",
    display: "block", marginBottom: "5px",
  };

  return (
    <div style={{
      padding: "20px", borderRadius: "12px",
      border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)",
    }}>
      <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-input-text)", marginBottom: "16px" }}>
        Configure {platform.label}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px", marginBottom: "16px" }}>
        {platform.fields.map((field) => (
          <div key={field.key}>
            <label style={labelStyle}>{field.label}</label>
            <input
              type={field.type}
              style={inputStyle}
              placeholder={field.placeholder}
              value={formData[field.key] || ""}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      {isError && (
        <div style={{ display: "flex", gap: "8px", padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "12px" }}>
          <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "1px" }} />
          <p style={{ fontSize: "0.8rem", color: "#ef4444" }}>{status.error}</p>
        </div>
      )}

      {isDeployed && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.08)", border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.3)", marginBottom: "12px" }}>
          <CheckCircle2 size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
          <p style={{ fontSize: "0.82rem", color: "var(--color-accent)", flex: 1 }}>
            Published successfully{status.url && ` → ${status.url}`}
          </p>
          {status.url && (
            <a href={status.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.78rem", color: "var(--color-accent)" }}>
              <ExternalLink size={12} /> Open
            </a>
          )}
        </div>
      )}

      <button
        onClick={onDeploy}
        disabled={isDeploying}
        className="btn--accent"
        style={{ display: "inline-flex", alignItems: "center", gap: "8px", opacity: isDeploying ? 0.7 : 1 }}
      >
        {isDeploying
          ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
          : <UploadCloud size={14} />}
        {isDeploying ? "Publishing…" : isDeployed ? `Re-publish on ${platform.label}` : `Publish on ${platform.label}`}
      </button>
    </div>
  );
}
