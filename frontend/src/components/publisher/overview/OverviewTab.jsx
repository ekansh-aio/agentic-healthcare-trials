import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SectionCard } from "../../shared/Layout";
import { adsAPI } from "../../../services/api";
import { hasType, typeLabel } from "../publisherUtils";
import VoicebotConfig from "../VoicebotConfig";
import {
  AlertCircle, Rocket, Globe, Eye, Download, Copy,
  CheckCircle2, Loader2, Zap, UploadCloud, ChevronDown, ChevronUp,
  ChevronRight,
} from "lucide-react";

// ─── Deployment checklist helper ─────────────────────────────────────────────
export function getDeployChecklist(ad) {
  const isAds   = hasType(ad, "ads");
  const isWeb   = hasType(ad, "website");
  const isVoice = hasType(ad, "voicebot");
  const items   = [];

  if (isAds) {
    const count = ad.output_files?.length || 0;
    items.push({
      key:      "creatives",
      label:    "Ad creatives generated",
      done:     count > 0,
      detail:   count > 0 ? `${count} creative${count !== 1 ? "s" : ""} ready` : "No creatives yet",
      note:     count === 0 ? "Ask your Study Coordinator to generate ad creatives for this campaign." : null,
      action:   null,
    });
    items.push({
      key:      "distributed",
      label:    "Ads uploaded to Meta",
      done:     !!ad.bot_config?.meta_campaign_id,
      detail:   ad.bot_config?.meta_campaign_id
        ? `Campaign ID: ${ad.bot_config.meta_campaign_id}`
        : "Not yet uploaded — go to the Upload Ads tab",
      note:     null,
      action:   !ad.bot_config?.meta_campaign_id ? { type: "navigate", path: "/publisher/distribute", label: "Upload Ads" } : null,
    });
  }

  if (isWeb) {
    items.push({
      key:      "website_generated",
      label:    "Website generated",
      done:     !!ad.output_url,
      detail:   ad.output_url ? "Landing page is ready" : "Not yet generated",
      note:     !ad.output_url ? "Ask your Study Coordinator to generate the campaign website." : null,
      action:   null,
    });
    items.push({
      key:      "website_hosted",
      label:    "Landing page hosted",
      done:     !!ad.hosted_url,
      detail:   ad.hosted_url || "Needs to be hosted so Meta can link to it",
      note:     null,
      action:   !ad.hosted_url
        ? (ad.output_url
            ? { type: "host", label: "Host Page" }
            : { type: "disabled", label: "Generate website first" })
        : null,
    });
    // External deploy (Vercel/Netlify/etc.) is optional — shown as a tip, not a blocker
  }

  if (isVoice) {
    const configured = !!(ad.bot_config?.voice_id && ad.bot_config?.first_message);
    items.push({
      key:      "voice_configured",
      label:    "Voice agent configured",
      done:     configured,
      detail:   configured ? `Voice: ${ad.bot_config.voice_id}` : "Name, voice, and opening message not set",
      note:     !configured ? "Expand a published campaign in Overview and configure the Voicebot tab." : null,
      action:   null,
    });
    items.push({
      key:      "voice_provisioned",
      label:    "Voice agent provisioned",
      done:     !!ad.bot_config?.elevenlabs_agent_id,
      detail:   ad.bot_config?.elevenlabs_agent_id
        ? "Voice agent provisioned"
        : "Not yet provisioned",
      note:     null,
      action:   !ad.bot_config?.elevenlabs_agent_id
        ? { type: "navigate", path: `/publisher/campaign/${ad.id}`, label: "Open Campaign Details" }
        : null,
    });
  }

  return items;
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
export default function OverviewTab({ approved, published, publishing, publishError, expandedId, onToggle, onPublish, onUpdateAd, onPreviewAd, onViewDetail, hostingId, hostError, onHostPage }) {
  return (
    <div className="space-y-4">
      {publishError && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", borderRadius: 10,
          backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
        }}>
          <AlertCircle size={15} style={{ color: "#ef4444", flexShrink: 0 }} />
          <p style={{ fontSize: "0.85rem", color: "#ef4444" }}>{publishError}</p>
        </div>
      )}

      {/* ── Campaigns being set up ─────────────────────────────────────────── */}
      <SectionCard
        title="Campaign Setup"
        subtitle={approved.length > 0
          ? `${approved.length} approved campaign${approved.length !== 1 ? "s" : ""} ready to launch`
          : "All approved campaigns have been launched"}
      >
        {approved.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-3">
            <div className="metric-tile__icon-wrap" style={{ width: 48, height: 48 }}>
              <Rocket size={20} style={{ color: "var(--color-sidebar-text)" }} />
            </div>
            <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>No campaigns waiting to be launched</p>
          </div>
        ) : (
          approved.map((ad) => (
            <CampaignRow
              key={ad.id} ad={ad}
              expanded={expandedId === ad.id} onToggle={() => onToggle(ad.id)}
              publishing={publishing}
              onPublish={onPublish} onUpdateAd={onUpdateAd}
              onPreviewAd={onPreviewAd} onViewDetail={onViewDetail}
              hostingId={hostingId} hostError={hostError} onHostPage={onHostPage}
            />
          ))
        )}
      </SectionCard>

      {/* ── Active campaigns ───────────────────────────────────────────────── */}
      <SectionCard
        title="Active Campaigns"
        subtitle={`${published.length} live deployment${published.length !== 1 ? "s" : ""}`}
      >
        {published.length === 0 ? (
          <p className="text-sm py-4" style={{ color: "var(--color-sidebar-text)" }}>No active campaigns yet</p>
        ) : (
          published.map((ad) => (
            <CampaignRow
              key={ad.id} ad={ad}
              expanded={expandedId === ad.id} onToggle={() => onToggle(ad.id)}
              publishing={publishing}
              onPublish={onPublish} onUpdateAd={onUpdateAd}
              onPreviewAd={onPreviewAd} onViewDetail={onViewDetail}
              hostingId={hostingId} hostError={hostError} onHostPage={onHostPage}
            />
          ))
        )}
      </SectionCard>
    </div>
  );
}

// ─── Campaign Row ──────────────────────────────────────────────────────────────
export function CampaignRow({ ad, expanded, onToggle, publishing, onPublish, onUpdateAd, onPreviewAd, onViewDetail }) {
  const isLive     = ad.status === "published";
  const checklist  = getDeployChecklist(ad);
  const doneCount  = checklist.filter((i) => i.done).length;
  const totalCount = checklist.length;
  const allDone    = totalCount > 0 && doneCount === totalCount;

  // Progress pill colour
  const pillColor = isLive
    ? { bg: "rgba(34,197,94,0.12)", text: "#15803d" }
    : allDone
      ? { bg: "rgba(34,197,94,0.12)", text: "#15803d" }
      : doneCount === 0
        ? { bg: "rgba(107,114,128,0.1)", text: "var(--color-sidebar-text)" }
        : { bg: "rgba(234,179,8,0.12)", text: "#92400e" };

  return (
    <div>
      <div
        className="pub-campaign-row"
        style={{ cursor: "pointer", borderBottomLeftRadius: expanded ? 0 : undefined, borderBottomRightRadius: expanded ? 0 : undefined }}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <div className={isLive ? "pub-campaign-row__dot--live" : "pub-campaign-row__dot"} />
          <div>
            <p className="table-row__title">{ad.title}</p>
            <p className="table-row__meta">{typeLabel(ad)} · Budget: ${ad.budget != null ? Number(ad.budget).toLocaleString() : "N/A"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {expanded
            ? <ChevronUp  size={14} style={{ color: "var(--color-sidebar-text)" }} />
            : <ChevronDown size={14} style={{ color: "var(--color-sidebar-text)" }} />}

          <button
            onClick={() => onViewDetail(ad.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 600,
              border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)",
              color: "var(--color-sidebar-text)", cursor: "pointer",
            }}
          >
            <Eye size={11} /> Details
          </button>

          {/* Deployment status pill (replaces old Publish button) */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 700,
            backgroundColor: pillColor.bg, color: pillColor.text,
          }}>
            {isLive
              ? <><CheckCircle2 size={11} /> Active</>
              : allDone
                ? <><CheckCircle2 size={11} /> Ready</>
                : <><span style={{ opacity: 0.7 }}>{doneCount}/{totalCount}</span> steps done</>}
          </span>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        isLive
          ? <PublishedCampaignPanel ad={ad} onPreviewAd={onPreviewAd} onUpdateAd={onUpdateAd} />
          : <DeploymentChecklist
              ad={ad}
              checklist={checklist}
              allDone={allDone}
              publishing={publishing}
              onPublish={onPublish}
              onUpdateAd={onUpdateAd}
              onPreviewAd={onPreviewAd}
            />
      )}
    </div>
  );
}

// ─── Deployment Checklist (shown for approved/unpublished campaigns) ──────────
export function DeploymentChecklist({ ad, checklist, allDone, publishing, onPublish, onUpdateAd, onPreviewAd }) {
  const navigate  = useNavigate();
  const [hosting, setHosting] = useState(false);
  const isAds = hasType(ad, "ads");

  const handleHostPage = async () => {
    setHosting(true);
    try {
      const updated = await adsAPI.hostPage(ad.id);
      onUpdateAd(updated);
    } catch (err) { alert(err.message); }
    finally { setHosting(false); }
  };

  return (
    <div className="pub-campaign-detail">
      <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)", marginBottom: "14px" }}>
        Launch Checklist
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
        {checklist.map((item) => (
          <div
            key={item.key}
            style={{
              display: "flex", alignItems: "flex-start", gap: "12px",
              padding: "12px 14px", borderRadius: "10px",
              backgroundColor: item.done
                ? "rgba(34,197,94,0.05)"
                : "var(--color-page-bg)",
              border: `1px solid ${item.done ? "rgba(34,197,94,0.2)" : "var(--color-card-border)"}`,
            }}
          >
            {/* Icon */}
            <div style={{ flexShrink: 0, marginTop: 1 }}>
              {item.done
                ? <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
                : <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--color-card-border)", backgroundColor: "transparent" }} />}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "0.83rem", fontWeight: 600, color: item.done ? "#15803d" : "var(--color-input-text)", marginBottom: 2 }}>
                {item.label}
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)" }}>{item.detail}</p>
              {item.note && (
                <p style={{ fontSize: "0.72rem", color: "var(--color-muted)", fontStyle: "italic", marginTop: 3 }}>{item.note}</p>
              )}
            </div>

            {/* Action button */}
            {item.action && !item.done && (
              <div style={{ flexShrink: 0 }}>
                {item.action.type === "navigate" && (
                  <button
                    onClick={() => navigate(item.action.path)}
                    className="btn--inline-action--ghost"
                    style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}
                  >
                    {item.action.label} <ChevronRight size={11} />
                  </button>
                )}
                {item.action.type === "host" && (
                  <button
                    onClick={handleHostPage}
                    disabled={hosting}
                    className="btn--inline-action--ghost"
                    style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}
                  >
                    {hosting
                      ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                      : <Globe size={11} />}
                    {hosting ? "Hosting…" : item.action.label}
                  </button>
                )}
                {item.action.type === "disabled" && (
                  <span style={{ fontSize: "0.72rem", color: "var(--color-muted)", fontStyle: "italic" }}>
                    {item.action.label}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Optional: external platform deployment tip */}
      {hasType(ad, "website") && ad.hosted_url && (
        <div style={{ marginBottom: "16px", padding: "10px 14px", borderRadius: "8px", backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.04)", border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.15)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <p style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)" }}>
            <strong>Optional:</strong> Publish your website to Vercel, Netlify, or a custom domain for a live URL.
          </p>
          <button onClick={() => navigate("/publisher/deploy")} className="btn--inline-action--ghost" style={{ fontSize: "0.75rem", flexShrink: 0 }}>
            <UploadCloud size={11} /> Publish Website tab <ChevronRight size={11} />
          </button>
        </div>
      )}

      {/* Preview creatives if available */}
      {isAds && ad.output_files?.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <button className="btn--inline-action--accent" onClick={() => onPreviewAd(ad)}>
            <Eye size={11} /> Preview Creatives
          </button>
        </div>
      )}

      {/* Activate when all done */}
      {allDone && ad.status !== "published" && (
        <div style={{ padding: "14px 16px", borderRadius: "10px", backgroundColor: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.25)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "#15803d" }}>All steps complete</p>
            <p style={{ fontSize: "0.75rem", color: "#166534" }}>This campaign is ready to be marked as active.</p>
          </div>
          <button
            onClick={() => onPublish(ad.id)}
            disabled={publishing === ad.id}
            className="btn--approve"
            style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {publishing === ad.id
              ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
              : <Zap size={13} />}
            {publishing === ad.id ? "Activating…" : "Activate Campaign"}
          </button>
        </div>
      )}

      {/* Voicebot config section (always shown if applicable) */}
      {hasType(ad, "voicebot") && (
        <div style={{ marginTop: "20px", borderTop: "1px solid var(--color-card-border)", paddingTop: "16px" }}>
          <p className="pub-campaign-detail__section-label">Voice Agent Setup</p>
          <VoicebotConfig ad={ad} />
        </div>
      )}
    </div>
  );
}

// ─── Published Campaign Panel (shown for active/published campaigns) ──────────
export function PublishedCampaignPanel({ ad, onPreviewAd, onUpdateAd }) {
  const [hosting, setHosting] = useState(false);
  const [hostErr, setHostErr] = useState(null);

  const handleHostPage = async () => {
    setHosting(true);
    setHostErr(null);
    try {
      const updated = await adsAPI.hostPage(ad.id);
      onUpdateAd(updated);
    } catch (err) { setHostErr(err.message); }
    finally { setHosting(false); }
  };

  const isWebsite = hasType(ad, "website");
  const isAds     = hasType(ad, "ads");

  return (
    <div className="pub-campaign-detail">
      {isWebsite && (
        <div className="mb-4">
          <p className="pub-campaign-detail__section-label">Landing Page</p>
          {ad.output_url ? (
            <>
              <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                <a href={adsAPI.websitePreviewUrl(ad.id)} target="_blank" rel="noreferrer" className="btn--inline-action--success">
                  <Eye size={11} /> Preview
                </a>
                <a href={adsAPI.websiteDownloadUrl(ad.id)} className="btn--inline-action--ghost">
                  <Download size={11} /> Download HTML
                </a>
                <button
                  onClick={handleHostPage}
                  disabled={hosting}
                  className="btn--inline-action--ghost"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: hosting ? "wait" : "pointer" }}
                >
                  <Globe size={11} />
                  {hosting ? "Hosting…" : ad.hosted_url ? "Re-host" : "Host"}
                </button>
              </div>
              {hostErr && (
                <p style={{ fontSize: "0.75rem", color: "#ef4444", marginTop: 6 }}>{hostErr}</p>
              )}
              {ad.hosted_url && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "8px 12px", borderRadius: 8, backgroundColor: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <Globe size={12} style={{ color: "#22c55e", flexShrink: 0 }} />
                  <a href={ad.hosted_url} target="_blank" rel="noreferrer" style={{ fontSize: "0.75rem", color: "var(--color-accent)", textDecoration: "none", flex: 1, wordBreak: "break-all" }}>
                    {window.location.origin}{ad.hosted_url}
                  </a>
                  <button onClick={() => navigator.clipboard.writeText(window.location.origin + ad.hosted_url)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", padding: 2, flexShrink: 0 }}>
                    <Copy size={11} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--color-sidebar-text)" }}>No website generated</p>
          )}
        </div>
      )}

      {isAds && (
        <div className="mb-4">
          <p className="pub-campaign-detail__section-label">Ad Creatives</p>
          {ad.output_files?.length > 0 ? (
            <button className="btn--inline-action--accent" onClick={() => onPreviewAd(ad)}>
              <Eye size={11} /> Preview ({ad.output_files.length})
            </button>
          ) : (
            <p className="text-xs" style={{ color: "var(--color-sidebar-text)" }}>No creatives</p>
          )}
        </div>
      )}

      {hasType(ad, "voicebot") && (
        <div className="mb-2">
          <p className="pub-campaign-detail__section-label">Voice Agent</p>
          <VoicebotConfig ad={ad} />
        </div>
      )}
    </div>
  );
}
