/**
 * M14: Publisher Dashboard
 * Owner: Frontend Dev 2
 * Dependencies: adsAPI, analyticsAPI
 *
 * Tabs (URL-driven):
 *   /publisher           → Overview   — approve, generate creatives/website, publish
 *   /publisher/deploy    → Deploy     — push generated websites to Vercel/Netlify/Render/GitHub Pages/custom domain
 *   /publisher/distribute→ Distribute — post ad creatives to Meta/YouTube/LinkedIn/Twitter/TikTok/etc
 *   /publisher/analytics → Analytics  — optimizer + performance
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageWithSidebar, SectionCard, MetricSummaryCard, CampaignStatusBadge } from "../shared/Layout";
import { adsAPI, analyticsAPI } from "../../services/api";
import {
  Send, Globe, Image, BarChart3, Sparkles,
  CheckCircle, Rocket, ChevronDown, ChevronUp, Zap, X, ImageOff,
  Share2, UploadCloud, ExternalLink, Download, Eye, AlertCircle,
  CheckCircle2, Loader2, Mic, PhoneCall, PhoneOff, Volume2, Radio, MessageSquare,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const hasType = (ad, type) => Array.isArray(ad.ad_type) ? ad.ad_type.includes(type) : ad.ad_type === type;
const typeLabel = (ad) => (Array.isArray(ad.ad_type) ? ad.ad_type : [ad.ad_type]).join(", ");

// ─── Deploy platform definitions ─────────────────────────────────────────────
const DEPLOY_PLATFORMS = [
  {
    id: "vercel",
    label: "Vercel",
    description: "Deploy to Vercel edge network",
    fields: [
      { key: "token",        label: "Vercel Token",     type: "password", placeholder: "eyJhbGci…" },
      { key: "project_name", label: "Project Name",     type: "text",     placeholder: "my-campaign" },
    ],
  },
  {
    id: "netlify",
    label: "Netlify",
    description: "Deploy to Netlify CDN",
    fields: [
      { key: "token",     label: "Personal Access Token", type: "password", placeholder: "nfp_…" },
      { key: "site_name", label: "Site Name (optional)",  type: "text",     placeholder: "my-campaign" },
    ],
  },
  {
    id: "render",
    label: "Render",
    description: "Deploy to Render static sites",
    fields: [
      { key: "api_key",    label: "API Key",    type: "password", placeholder: "rnd_…" },
      { key: "service_id", label: "Service ID", type: "text",     placeholder: "srv-…" },
    ],
  },
  {
    id: "github_pages",
    label: "GitHub Pages",
    description: "Host on GitHub Pages",
    fields: [
      { key: "token",  label: "GitHub Token", type: "password", placeholder: "ghp_…" },
      { key: "repo",   label: "Repository",   type: "text",     placeholder: "username/repo" },
      { key: "branch", label: "Branch",       type: "text",     placeholder: "gh-pages" },
    ],
  },
  {
    id: "custom",
    label: "Custom Domain",
    description: "Deploy via FTP/SFTP to your own server",
    fields: [
      { key: "domain",       label: "Domain",                type: "text",     placeholder: "https://mysite.com" },
      { key: "ftp_host",     label: "FTP/SFTP Host",         type: "text",     placeholder: "ftp.mysite.com" },
      { key: "ftp_user",     label: "Username",              type: "text",     placeholder: "" },
      { key: "ftp_pass",     label: "Password",              type: "password", placeholder: "" },
      { key: "remote_path",  label: "Remote Path (optional)", type: "text",    placeholder: "/public_html" },
    ],
  },
];

// ─── Social distribution platform definitions ────────────────────────────────
const SOCIAL_PLATFORMS = {
  "Google Ads": {
    id: "google_ads",
    fields: [
      { key: "customer_id",      label: "Customer ID",      type: "text",     placeholder: "123-456-7890" },
      { key: "developer_token",  label: "Developer Token",  type: "password", placeholder: "" },
      { key: "campaign_name",    label: "Campaign Name",    type: "text",     placeholder: "Q2 Launch" },
    ],
  },
  "Meta/Instagram": {
    id: "meta",
    fields: [
      { key: "access_token",  label: "Access Token",  type: "password", placeholder: "EAA…" },
      { key: "ad_account_id", label: "Ad Account ID", type: "text",     placeholder: "act_…" },
      { key: "caption",       label: "Caption",       type: "textarea", placeholder: "Discover our latest…" },
      { key: "hashtags",      label: "Hashtags",      type: "text",     placeholder: "#brand #campaign" },
    ],
  },
  "YouTube": {
    id: "youtube",
    fields: [
      { key: "api_key",     label: "YouTube API Key", type: "password", placeholder: "AIza…" },
      { key: "channel_id",  label: "Channel ID",      type: "text",     placeholder: "UC…" },
      { key: "title",       label: "Ad Title",        type: "text",     placeholder: "Campaign Title" },
      { key: "description", label: "Description",     type: "textarea", placeholder: "" },
    ],
  },
  "LinkedIn": {
    id: "linkedin",
    fields: [
      { key: "access_token",    label: "Access Token",    type: "password", placeholder: "" },
      { key: "organization_id", label: "Organization URN", type: "text",    placeholder: "urn:li:organization:…" },
      { key: "caption",         label: "Post Caption",    type: "textarea", placeholder: "" },
    ],
  },
  "Twitter/X": {
    id: "twitter",
    fields: [
      { key: "api_key",      label: "API Key",      type: "password", placeholder: "" },
      { key: "api_secret",   label: "API Secret",   type: "password", placeholder: "" },
      { key: "access_token", label: "Access Token", type: "password", placeholder: "" },
      { key: "tweet_text",   label: "Tweet Text",   type: "textarea", placeholder: "Check out our latest…" },
    ],
  },
  "TikTok": {
    id: "tiktok",
    fields: [
      { key: "access_token",  label: "Access Token",  type: "password", placeholder: "" },
      { key: "advertiser_id", label: "Advertiser ID", type: "text",     placeholder: "" },
    ],
  },
  "Email": {
    id: "email",
    fields: [
      { key: "smtp_host",       label: "SMTP Host",                     type: "text",     placeholder: "smtp.gmail.com" },
      { key: "smtp_port",       label: "Port",                          type: "text",     placeholder: "587" },
      { key: "from_email",      label: "From Email",                    type: "text",     placeholder: "hello@company.com" },
      { key: "subject",         label: "Email Subject",                 type: "text",     placeholder: "Campaign Launch!" },
      { key: "recipient_list",  label: "Recipients (comma-separated)",  type: "textarea", placeholder: "user@example.com, …" },
    ],
  },
};

// ─── Tab ↔ Path maps ──────────────────────────────────────────────────────────
const PATH_TO_TAB = {
  "/publisher/deploy":      "deploy",
  "/publisher/distribute":  "distribute",
  "/publisher/analytics":   "analytics",
};
const TAB_TO_PATH = {
  overview:    "/publisher",
  deploy:      "/publisher/deploy",
  distribute:  "/publisher/distribute",
  analytics:   "/publisher/analytics",
};

const TABS = [
  { key: "overview",   label: "Overview",    icon: Eye },
  { key: "deploy",     label: "Deploy",      icon: Rocket },
  { key: "distribute", label: "Distribute",  icon: Share2 },
  { key: "analytics",  label: "Analytics",   icon: BarChart3 },
];

// ─── Root component ───────────────────────────────────────────────────────────
export default function PublisherDashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  const [ads,       setAds]       = useState([]);
  const [loading,   setLoading]   = useState(true);

  // Overview state
  const [publishing,   setPublishing]  = useState(null);
  const [publishError, setPublishError] = useState(null);
  const [expandedId,   setExpandedId]  = useState(null);
  const [previewAd,    setPreviewAd]   = useState(null);

  // Deploy state
  const [deployExpanded, setDeployExpanded] = useState(null); // { adId, platformId }
  const [deployForms,    setDeployForms]    = useState({});   // key: `${adId}_${platformId}`
  const [deployStatus,   setDeployStatus]   = useState({});   // key → { status, url, error }

  // Distribute state
  const [distExpanded, setDistExpanded] = useState(null); // { adId, platformId }
  const [distForms,    setDistForms]    = useState({});
  const [distStatus,   setDistStatus]   = useState({});

  const activeTab = PATH_TO_TAB[location.pathname] || "overview";

  useEffect(() => {
    adsAPI.list().then(setAds).catch(console.error).finally(() => setLoading(false));
  }, []);

  const approved  = ads.filter((a) => a.status === "approved");
  const published = ads.filter((a) => a.status === "published");

  // ── Overview handlers ────────────────────────────────────────────────────
  const handlePublish = async (adId) => {
    setPublishing(adId); setPublishError(null);
    try {
      const updated = await adsAPI.publish(adId);
      setAds((p) => p.map((a) => (a.id === adId ? updated : a)));
    } catch (err) {
      setPublishError(err.message || "Publish failed. Campaign must be approved first.");
      setTimeout(() => setPublishError(null), 6000);
    }
    finally { setPublishing(null); }
  };

  // ── Deploy handlers ──────────────────────────────────────────────────────
  const handleDeploySelect = (adId, platformId) => {
    const isOpen = deployExpanded?.adId === adId && deployExpanded?.platformId === platformId;
    setDeployExpanded(isOpen ? null : { adId, platformId });
  };

  const updateDeployForm = (adId, platformId, key, value) => {
    const fk = `${adId}_${platformId}`;
    setDeployForms((p) => ({ ...p, [fk]: { ...(p[fk] || {}), [key]: value } }));
  };

  const handleDeploy = async (adId, platform) => {
    const fk = `${adId}_${platform.id}`;
    setDeployStatus((p) => ({ ...p, [fk]: { status: "deploying" } }));
    try {
      const result = await adsAPI.deployWebsite(adId, { platform: platform.id, config: deployForms[fk] || {} });
      setDeployStatus((p) => ({ ...p, [fk]: { status: "deployed", url: result?.url } }));
    } catch (err) {
      setDeployStatus((p) => ({ ...p, [fk]: { status: "error", error: err.message } }));
    }
  };

  // ── Distribute handlers ──────────────────────────────────────────────────
  const handleDistSelect = (adId, platformId) => {
    const isOpen = distExpanded?.adId === adId && distExpanded?.platformId === platformId;
    if (!isOpen) {
      // Seed form with AI suggestions from strategy_json when opening
      const ad = ads.find((a) => a.id === adId);
      const platformName = Object.entries(SOCIAL_PLATFORMS).find(([, cfg]) => cfg.id === platformId)?.[0];
      const suggestion = ad?.strategy_json?.social_content?.[platformName];
      if (suggestion) {
        const fk = `${adId}_${platformId}`;
        setDistForms((p) => {
          const existing = p[fk] || {};
          // Only seed fields that are still empty so manual edits aren't overwritten
          const seeded = { ...existing };
          if (!seeded.caption      && suggestion.caption)   seeded.caption      = suggestion.caption;
          if (!seeded.hashtags     && suggestion.hashtags)  seeded.hashtags     = suggestion.hashtags;
          if (!seeded.tweet_text   && suggestion.caption)   seeded.tweet_text   = suggestion.caption;
          if (!seeded.description  && suggestion.caption)   seeded.description  = suggestion.caption;
          return { ...p, [fk]: seeded };
        });
      }
    }
    setDistExpanded(isOpen ? null : { adId, platformId });
  };

  const updateDistForm = (adId, platformId, key, value) => {
    const fk = `${adId}_${platformId}`;
    setDistForms((p) => ({ ...p, [fk]: { ...(p[fk] || {}), [key]: value } }));
  };

  const handleDistribute = async (adId, platformConfig) => {
    const fk = `${adId}_${platformConfig.id}`;
    setDistStatus((p) => ({ ...p, [fk]: { status: "posting" } }));
    try {
      await adsAPI.distributeCreatives(adId, { platform: platformConfig.id, config: distForms[fk] || {} });
      setDistStatus((p) => ({ ...p, [fk]: { status: "posted" } }));
    } catch (err) {
      setDistStatus((p) => ({ ...p, [fk]: { status: "error", error: err.message } }));
    }
  };

  if (loading) return (
    <PageWithSidebar>
      <div className="flex items-center justify-center py-40">
        <div className="spinner--dark" />
      </div>
    </PageWithSidebar>
  );

  return (
    <PageWithSidebar>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div className="page-header">
        <div>
          <h1 className="page-header__title">Publisher Dashboard</h1>
          <p className="page-header__subtitle">Publish campaigns, deploy websites, and distribute creatives</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricSummaryCard label="Ready to Publish" value={approved.length}                                        icon={Rocket} />
        <MetricSummaryCard label="Published"         value={published.length}                                       icon={Globe} />
        <MetricSummaryCard label="Total Campaigns"   value={ads.length}                                             icon={BarChart3} />
        <MetricSummaryCard label="Active"            value={published.filter((a) => a.status !== "paused").length} icon={Zap} />
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => navigate(TAB_TO_PATH[t.key])}
            className={`${activeTab === t.key ? "filter-tab--active" : "filter-tab"} flex items-center gap-1.5`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeTab === "overview" && (
        <OverviewTab
          approved={approved}
          published={published}
          publishing={publishing}
          publishError={publishError}
          expandedId={expandedId}
          onToggle={(id) => setExpandedId((p) => (p === id ? null : id))}
          onPublish={handlePublish}
          onPreviewAd={setPreviewAd}
          onViewDetail={(id) => navigate(`/publisher/campaign/${id}`)}
        />
      )}

      {/* ── Deploy ── */}
      {activeTab === "deploy" && (
        <DeployTab
          ads={ads}
          deployExpanded={deployExpanded}
          deployForms={deployForms}
          deployStatus={deployStatus}
          onSelectPlatform={handleDeploySelect}
          onUpdateForm={updateDeployForm}
          onDeploy={handleDeploy}
        />
      )}

      {/* ── Distribute ── */}
      {activeTab === "distribute" && (
        <DistributeTab
          ads={ads}
          distExpanded={distExpanded}
          distForms={distForms}
          distStatus={distStatus}
          onSelectPlatform={handleDistSelect}
          onUpdateForm={updateDistForm}
          onDistribute={handleDistribute}
          onPreviewAd={setPreviewAd}
        />
      )}

      {/* ── Analytics ── */}
      {activeTab === "analytics" && <PublisherAnalytics ads={published} />}

      {/* Ad Preview Modal */}
      {previewAd && <AdPreviewModal ad={previewAd} onClose={() => setPreviewAd(null)} />}
    </PageWithSidebar>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ approved, published, publishing, publishError, expandedId, onToggle, onPublish, onPreviewAd, onViewDetail }) {
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
      <SectionCard
        title="Ready to Publish"
        subtitle={approved.length > 0
          ? `${approved.length} campaign${approved.length !== 1 ? "s" : ""} awaiting deployment`
          : "All campaigns are up to date"}
      >
        {approved.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-3">
            <div className="metric-tile__icon-wrap" style={{ width: 48, height: 48 }}>
              <Rocket size={20} style={{ color: "var(--color-sidebar-text)" }} />
            </div>
            <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>No campaigns waiting to be published</p>
          </div>
        ) : (
          approved.map((ad) => (
            <CampaignRow
              key={ad.id} ad={ad}
              expanded={expandedId === ad.id} onToggle={() => onToggle(ad.id)}
              publishing={publishing}
              onPublish={onPublish} onPreviewAd={onPreviewAd} onViewDetail={onViewDetail}
            />
          ))
        )}
      </SectionCard>

      <SectionCard
        title="Published Campaigns"
        subtitle={`${published.length} live deployment${published.length !== 1 ? "s" : ""}`}
      >
        {published.length === 0 ? (
          <p className="text-sm py-4" style={{ color: "var(--color-sidebar-text)" }}>No published campaigns yet</p>
        ) : (
          published.map((ad) => (
            <CampaignRow
              key={ad.id} ad={ad}
              expanded={expandedId === ad.id} onToggle={() => onToggle(ad.id)}
              publishing={publishing}
              onPublish={onPublish} onPreviewAd={onPreviewAd} onViewDetail={onViewDetail}
            />
          ))
        )}
      </SectionCard>
    </div>
  );
}

function CampaignRow({ ad, expanded, onToggle, publishing, onPublish, onPreviewAd, onViewDetail }) {
  const isLive = ad.status === "published";
  return (
    <div>
      <div
        className="pub-campaign-row"
        style={{ cursor: "pointer", borderBottomLeftRadius: expanded ? 0 : undefined, borderBottomRightRadius: expanded ? 0 : undefined }}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className={isLive ? "pub-campaign-row__dot--live" : "pub-campaign-row__dot"} />
          <div>
            <p className="table-row__title">{ad.title}</p>
            <p className="table-row__meta">{typeLabel(ad)} · Budget: ${ad.budget != null ? Number(ad.budget).toLocaleString() : "N/A"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {expanded ? <ChevronUp size={14} style={{ color: "var(--color-sidebar-text)" }} /> : <ChevronDown size={14} style={{ color: "var(--color-sidebar-text)" }} />}
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
          {!isLive ? (
            <button onClick={() => onPublish(ad.id)} disabled={publishing === ad.id} className="btn--publish">
              {publishing === ad.id
                ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Publishing…</>
                : <><Send size={13} /> Publish</>}
            </button>
          ) : (
            <CampaignStatusBadge status={ad.status} />
          )}
        </div>
      </div>
      {expanded && (
        <CampaignDetailPanel ad={ad} onPreviewAd={onPreviewAd} />
      )}
    </div>
  );
}

function CampaignDetailPanel({ ad, onPreviewAd }) {
  const isWebsite = hasType(ad, "website");
  const isAds     = hasType(ad, "ads");

  return (
    <div className="pub-campaign-detail">

      {isWebsite && (
        <div className="mb-4">
          <p className="pub-campaign-detail__section-label">Generated Website</p>
          {ad.output_url ? (
            <div className="flex gap-2">
              <a href={adsAPI.websitePreviewUrl(ad.id)} target="_blank" rel="noreferrer" className="btn--inline-action--success">
                <Eye size={11} /> Preview
              </a>
              <a href={adsAPI.websiteDownloadUrl(ad.id)} className="btn--inline-action--ghost">
                <Download size={11} /> Download HTML
              </a>
            </div>
          ) : (
            <p className="text-xs" style={{ color: "var(--color-sidebar-text)" }}>Website not yet generated</p>
          )}
        </div>
      )}

      {isAds && (
        <div className="mb-4">
          <p className="pub-campaign-detail__section-label">Generated Creatives</p>
          {ad.output_files?.length > 0 ? (
            <div className="flex gap-2">
              <button className="btn--inline-action--accent" onClick={() => onPreviewAd(ad)}>
                <Eye size={11} /> Preview
              </button>
            </div>
          ) : (
            <p className="text-xs" style={{ color: "var(--color-sidebar-text)" }}>Ad creatives not yet generated</p>
          )}
        </div>
      )}

      {hasType(ad, "voicebot") && (
        <div className="mb-2">
          <p className="pub-campaign-detail__section-label">Voice Agent Setup</p>
          <VoicebotConfig ad={ad} />
        </div>
      )}
    </div>
  );
}

// ElevenLabs voice options (popular voices from the voice library)
const ELEVEN_VOICES = [
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Rachel — Calm, professional (F)" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam — Deep, authoritative (M)" },
  { id: "oWAxZDx7w5VEj9dCyTzz", label: "Grace — Warm, friendly (F)" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh — Conversational (M)" },
  { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi — Strong, confident (F)" },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold — Crisp, clear (M)" },
  { id: "MF3mGyEYCl7XYWbV9V6O", label: "Elli — Bright, energetic (F)" },
  { id: "XB0fDUnXU5powFXDhCwa", label: "Charlotte — Sophisticated (F)" },
];

function VoicebotConfig({ ad }) {
  const existing = ad.bot_config || {};

  const [form, setForm] = useState({
    bot_name:      existing.bot_name      || "Assistant",
    voice_id:      existing.voice_id      || "EXAVITQu4vr4xnSDxMaL",
    first_message: existing.first_message || "Hi! How can I help you today?",
    // conversation_style, language, compliance_notes are set by AI recommendation — not exposed to the user
  });

  const [saving,         setSaving]         = useState(false);
  const [provisioning,   setProvisioning]   = useState(false);
  const [agentStatus,    setAgentStatus]    = useState(null);
  const [statusError,    setStatusError]    = useState(null);
  const [conversations,  setConversations]  = useState(null);
  const [showConvs,      setShowConvs]      = useState(false);
  const [transcript,     setTranscript]     = useState(null);
  const [recommending,   setRecommending]   = useState(false);
  const [recommendation, setRecommendation] = useState(null);

  // ── Live voice test session ─────────────────────────────────────────────────
  const [callStatus,  setCallStatus]  = useState("idle"); // idle | connecting | connected
  const [isSpeaking,  setIsSpeaking]  = useState(false);
  const [callError,   setCallError]   = useState(null);
  const wsRef        = useRef(null);
  const ctxRef       = useRef(null);
  const processorRef = useRef(null);
  const streamRef    = useRef(null);
  const schedRef     = useRef(0);
  const closingRef   = useRef(false);

  const cleanupCall = useCallback(() => {
    if (processorRef.current) { try { processorRef.current.disconnect(); } catch {} processorRef.current = null; }
    if (streamRef.current)    { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (ctxRef.current)       { try { ctxRef.current.close(); } catch {} ctxRef.current = null; }
    schedRef.current = 0;
    setIsSpeaking(false);
  }, []);

  const stopCall = useCallback(() => {
    closingRef.current = true;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    cleanupCall();
    setCallStatus("idle");
  }, [cleanupCall]);

  useEffect(() => () => {
    closingRef.current = true;
    if (wsRef.current) wsRef.current.close();
    cleanupCall();
  }, [cleanupCall]);

  const playPCM = useCallback((b64) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    try {
      const bin = atob(b64);
      const u8  = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const i16 = new Int16Array(u8.buffer);
      const f32 = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
      const buf = ctx.createBuffer(1, f32.length, 16000);
      buf.copyToChannel(f32, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime, schedRef.current);
      src.start(startAt);
      schedRef.current = startAt + buf.duration;
      setIsSpeaking(true);
      src.onended = () => { if (!ctxRef.current || schedRef.current <= ctxRef.current.currentTime + 0.05) setIsSpeaking(false); };
    } catch {}
  }, []);

  const startCall = async () => {
    setCallStatus("connecting"); setCallError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone not available — this page must be served over HTTPS or localhost.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const { signed_url } = await adsAPI.getVoiceSessionToken(ad.id);
      const ctx = new AudioContext({ sampleRate: 16000 });
      ctxRef.current = ctx;
      closingRef.current = false;
      const ws = new WebSocket(signed_url);
      wsRef.current = ws;

      ws.onopen = () => {
        setCallStatus("connected");
        const source    = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        const muted = ctx.createGain();
        muted.gain.value = 0;
        source.connect(processor);
        processor.connect(muted);
        muted.connect(ctx.destination);
        processor.onaudioprocess = (e) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          const f32 = e.inputBuffer.getChannelData(0);
          const i16 = new Int16Array(f32.length);
          for (let i = 0; i < f32.length; i++) i16[i] = Math.round(Math.max(-1, Math.min(1, f32[i])) * 32767);
          const u8 = new Uint8Array(i16.buffer);
          let b64 = "";
          for (let i = 0; i < u8.length; i += 8192) b64 += String.fromCharCode(...u8.subarray(i, Math.min(i + 8192, u8.length)));
          wsRef.current.send(JSON.stringify({ user_audio_chunk: btoa(b64) }));
        };
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "audio" && msg.audio_event?.audio_base_64) playPCM(msg.audio_event.audio_base_64);
          else if (msg.type === "interruption") { schedRef.current = ctxRef.current?.currentTime ?? 0; setIsSpeaking(false); }
          else if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong", event_id: msg.ping_event?.event_id }));
        } catch {}
      };
      ws.onerror = () => { stopCall(); setCallError("Connection failed — check your ElevenLabs API key and agent provisioning."); };
      ws.onclose = (evt) => {
        if (!closingRef.current) { cleanupCall(); setCallStatus("idle"); if (evt.code !== 1000) setCallError(`Session closed (code ${evt.code}).`); }
        closingRef.current = false;
      };
    } catch (err) {
      cleanupCall(); setCallStatus("idle");
      setCallError(err.name === "NotAllowedError" ? "Microphone access denied — allow microphone access and try again." : (err.message || "Failed to start session."));
    }
  };

  // Load agent status once on mount
  useEffect(() => {
    if (!hasType(ad, "voicebot")) return;
    adsAPI.getVoiceAgentStatus(ad.id)
      .then(setAgentStatus)
      .catch(() => setAgentStatus({ provisioned: false }));
  }, [ad.id]);

  const handleSave = async () => {
    setSaving(true);
    try { await adsAPI.updateBotConfig(ad.id, form); }
    catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleRecommend = async () => {
    setRecommending(true);
    setRecommendation(null);
    try {
      const rec = await adsAPI.getVoiceRecommendation(ad.id);
      setRecommendation(rec);
    } catch (err) { alert(err.message); }
    finally { setRecommending(false); }
  };

  const applyRecommendation = () => {
    if (!recommendation) return;
    // Only update the user-visible fields; conversation_style / language are AI-managed
    setForm((p) => ({
      ...p,
      voice_id:      recommendation.voice_id,
      first_message: recommendation.first_message,
    }));
    setRecommendation(null);
  };

  const handleProvision = async () => {
    setProvisioning(true);
    setStatusError(null);
    try {
      await adsAPI.updateBotConfig(ad.id, form);      // save first
      const result = await adsAPI.provisionVoiceAgent(ad.id);
      setAgentStatus({ provisioned: true, agent_id: result.agent_id, name: form.bot_name });
    } catch (err) {
      setStatusError(err.message);
    } finally {
      setProvisioning(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!window.confirm("Delete the ElevenLabs agent for this campaign?")) return;
    try {
      await adsAPI.deleteVoiceAgent(ad.id);
      setAgentStatus({ provisioned: false });
    } catch (err) { alert(err.message); }
  };

  const handleLoadConversations = async () => {
    if (showConvs) { setShowConvs(false); return; }
    try {
      const data = await adsAPI.listVoiceConversations(ad.id);
      setConversations(data.conversations || []);
      setShowConvs(true);
    } catch (err) { alert(err.message); }
  };

  const handleViewTranscript = async (conversationId) => {
    try {
      const data = await adsAPI.getVoiceTranscript(conversationId);
      setTranscript(data);
    } catch (err) { alert(err.message); }
  };

  const isVoicebot = hasType(ad, "voicebot");

  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 16, background: "var(--color-surface)" }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Mic size={15} style={{ color: "var(--color-accent)" }} />
        <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>ElevenLabs Voice Agent</span>
        {agentStatus?.provisioned ? (
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: "#10b981", fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            Agent Live
          </span>
        ) : (
          <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--color-muted)" }}>Not provisioned</span>
        )}
      </div>

      {/* AI Recommendation */}
      <div className="mb-4">
        <button
          onClick={handleRecommend}
          disabled={recommending || !ad.strategy_json}
          className="btn--inline-action--accent"
          style={{ width: "100%", justifyContent: "center", gap: 6, fontSize: "0.83rem", padding: "9px 0" }}
          title={!ad.strategy_json ? "Generate a campaign strategy first to enable voice recommendations" : ""}
        >
          {recommending
            ? <><div className="spinner" style={{ width: 11, height: 11 }} /> Analyzing audience…</>
            : <><Sparkles size={13} /> Recommend Voice Profile from Target Audience</>}
        </button>
        {!ad.strategy_json && (
          <p style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginTop: 4, textAlign: "center" }}>
            Generate a campaign strategy first to unlock voice recommendations.
          </p>
        )}

        {recommendation && (
          <div style={{ marginTop: 10, background: "rgba(16,185,129,0.06)", border: "1.5px solid #10b981", borderRadius: 12, padding: "14px 16px" }}>
            <div className="flex items-start justify-between gap-3">
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--color-text)", marginBottom: 4 }}>
                  <Sparkles size={11} style={{ display: "inline", color: "#10b981", marginRight: 5 }} />
                  Recommended: <span style={{ color: "#10b981" }}>{recommendation.voice_name}</span>
                </p>
                <p style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginBottom: 6, lineHeight: 1.5 }}>
                  {recommendation.reason}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: "0.7rem" }}>
                  <span style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "2px 8px" }}>
                    Style: {recommendation.conversation_style}
                  </span>
                  <span style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "2px 8px", fontStyle: "italic" }}>
                    "{recommendation.first_message}"
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <button onClick={applyRecommendation} className="btn--inline-action--success" style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                  <CheckCircle2 size={11} /> Apply
                </button>
                <button onClick={() => setRecommendation(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.7rem", color: "var(--color-muted)" }}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Config form */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-muted)", display: "block", marginBottom: 4 }}>Bot Name</label>
          <input
            value={form.bot_name}
            onChange={(e) => setForm((p) => ({ ...p, bot_name: e.target.value }))}
            className="field-input"
            placeholder="e.g. Alex"
          />
        </div>
        <div>
          <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-muted)", display: "block", marginBottom: 4 }}>ElevenLabs Voice</label>
          <select value={form.voice_id} onChange={(e) => setForm((p) => ({ ...p, voice_id: e.target.value }))} className="field-select">
            {ELEVEN_VOICES.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-muted)", display: "block", marginBottom: 4 }}>Opening Message</label>
          <input
            value={form.first_message}
            onChange={(e) => setForm((p) => ({ ...p, first_message: e.target.value }))}
            className="field-input"
            placeholder="Hi! How can I help you today?"
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={handleSave} disabled={saving} className="btn--inline-action--ghost">
          {saving ? <><div className="spinner" style={{ width: 10, height: 10 }} /> Saving…</> : "Save Config"}
        </button>

        {isVoicebot && (
          <button onClick={handleProvision} disabled={provisioning} className="btn--primary" style={{ fontSize: "0.8rem", padding: "7px 16px" }}>
            {provisioning
              ? <><div className="spinner" style={{ width: 10, height: 10 }} /> Provisioning…</>
              : agentStatus?.provisioned
                ? <><Zap size={12} /> Re-provision Agent</>
                : <><Radio size={12} /> Provision Agent</>
            }
          </button>
        )}

        {agentStatus?.provisioned && (
          <>
            <button onClick={handleLoadConversations} className="btn--inline-action--accent" style={{ fontSize: "0.8rem" }}>
              <PhoneCall size={11} /> {showConvs ? "Hide Calls" : "View Calls"}
            </button>
            <button onClick={handleDeleteAgent} className="btn--inline-action--ghost" style={{ fontSize: "0.8rem", color: "#ef4444" }}>
              Delete Agent
            </button>
          </>
        )}
      </div>

      {/* Provision error */}
      {statusError && (
        <p style={{ marginTop: 10, fontSize: "0.78rem", color: "#ef4444" }}>
          <AlertCircle size={11} style={{ display: "inline", marginRight: 4 }} />{statusError}
        </p>
      )}

      {/* ── Live Voice Test ─────────────────────────────────────────── */}
      {agentStatus?.provisioned && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
          <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-muted)", marginBottom: 10 }}>
            Test Voice Agent
          </p>

          {callStatus === "connected" ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.05)", marginBottom: 10 }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", backgroundColor: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isSpeaking ? <Volume2 size={16} style={{ color: "#10b981" }} /> : <Mic size={16} style={{ color: "#10b981" }} />}
                  </div>
                  {isSpeaking && (
                    <div style={{ position: "absolute", inset: -4, borderRadius: "50%", border: "2px solid rgba(16,185,129,0.4)", animation: "pulse 1.2s ease-in-out infinite" }} />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: "0.83rem", fontWeight: 700, color: "var(--color-text)" }}>
                    {isSpeaking ? "Agent is speaking…" : "Listening — speak into your mic"}
                  </p>
                  <p style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginTop: 1 }}>Live session active</p>
                </div>
              </div>
              <button onClick={stopCall} className="btn--inline-action--ghost" style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: 5 }}>
                <PhoneOff size={12} /> End Call
              </button>
            </div>
          ) : (
            <div>
              <button
                onClick={startCall}
                disabled={callStatus === "connecting"}
                className="btn--primary"
                style={{ fontSize: "0.8rem", padding: "7px 16px", display: "flex", alignItems: "center", gap: 6, opacity: callStatus === "connecting" ? 0.7 : 1 }}
              >
                {callStatus === "connecting"
                  ? <><div className="spinner" style={{ width: 10, height: 10 }} /> Connecting…</>
                  : <><PhoneCall size={12} /> Start Voice Call</>}
              </button>
              {callError && (
                <p style={{ marginTop: 8, fontSize: "0.75rem", color: "#ef4444", display: "flex", alignItems: "flex-start", gap: 5 }}>
                  <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />{callError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Conversations list */}
      {showConvs && conversations !== null && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
          <p style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: 8 }}>
            <PhoneCall size={11} style={{ display: "inline", marginRight: 5 }} />
            Call History ({conversations.length})
          </p>
          {conversations.length === 0 ? (
            <p style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>No calls yet — share the landing page to get started.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {conversations.map((c) => (
                <div key={c.conversation_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--color-bg)", borderRadius: 8, padding: "8px 12px", fontSize: "0.78rem" }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{c.conversation_id?.slice(0, 12)}…</span>
                    <span style={{ color: "var(--color-muted)", marginLeft: 8 }}>
                      {c.status} · {c.metadata?.duration != null ? `${Math.round(c.metadata.duration)}s` : "—"}
                    </span>
                  </div>
                  <button onClick={() => handleViewTranscript(c.conversation_id)} className="btn--inline-action--ghost" style={{ fontSize: "0.72rem" }}>
                    <MessageSquare size={10} /> Transcript
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transcript modal */}
      {transcript && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setTranscript(null)}>
          <div style={{ background: "var(--color-surface)", borderRadius: 16, padding: 24, maxWidth: 560, width: "90%", maxHeight: "70vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontWeight: 700, fontSize: "0.9rem" }}>Call Transcript</p>
              <button onClick={() => setTranscript(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-muted)" }}><X size={16} /></button>
            </div>
            {(transcript.transcript || []).map((turn, i) => (
              <div key={i} style={{ marginBottom: 10, display: "flex", flexDirection: "column", alignItems: turn.role === "agent" ? "flex-start" : "flex-end" }}>
                <span style={{ fontSize: "0.65rem", color: "var(--color-muted)", marginBottom: 2, textTransform: "capitalize" }}>{turn.role}</span>
                <div style={{ background: turn.role === "agent" ? "var(--color-bg)" : "var(--color-accent)", color: turn.role === "agent" ? "var(--color-text)" : "#fff", borderRadius: 10, padding: "8px 12px", fontSize: "0.83rem", maxWidth: "80%" }}>
                  {turn.message}
                </div>
              </div>
            ))}
            {(!transcript.transcript || transcript.transcript.length === 0) && (
              <p style={{ color: "var(--color-muted)", fontSize: "0.82rem" }}>No transcript available for this call.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Deploy Tab ───────────────────────────────────────────────────────────────
function DeployTab({ ads, deployExpanded, deployForms, deployStatus, onSelectPlatform, onUpdateForm, onDeploy }) {
  const deployable = ads.filter(
    (a) => (a.status === "approved" || a.status === "published") && hasType(a, "website")
  );

  if (deployable.length === 0) {
    return (
      <SectionCard title="Deploy Websites" subtitle="No deployable website campaigns yet">
        <div className="flex flex-col items-center py-12 gap-3">
          <UploadCloud size={36} style={{ color: "var(--color-sidebar-text)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
            Generate a website for an approved campaign to deploy it here
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {deployable.map((ad) => (
        <SectionCard key={ad.id} title={ad.title} subtitle={`${typeLabel(ad)} · ${ad.status}`}>

          {/* Website readiness row */}
          {ad.output_url ? (
            <div style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "12px 16px", borderRadius: "10px", marginBottom: "20px",
              border: "1px solid var(--color-card-border)",
              backgroundColor: "var(--color-card-bg)",
            }}>
              <Globe size={15} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
              <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", flex: 1 }}>
                Landing page ready
              </p>
              <a href={adsAPI.websitePreviewUrl(ad.id)} target="_blank" rel="noreferrer" className="btn--inline-action--ghost">
                <Eye size={11} /> Preview
              </a>
              <a href={adsAPI.websiteDownloadUrl(ad.id)} className="btn--inline-action--ghost">
                <Download size={11} /> Download
              </a>
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "12px 16px", borderRadius: "10px", marginBottom: "20px",
              border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)",
            }}>
              <AlertCircle size={14} style={{ color: "var(--color-sidebar-text)", flexShrink: 0 }} />
              <p style={{ fontSize: "0.82rem", color: "var(--color-sidebar-text)", flex: 1 }}>
                Website not yet generated — the Study Coordinator generates assets during campaign creation
              </p>
            </div>
          )}

          {/* Platform tiles */}
          <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)", marginBottom: "10px" }}>
            Deploy to
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px", marginBottom: "16px" }}>
            {DEPLOY_PLATFORMS.map((platform) => {
              const isSelected = deployExpanded?.adId === ad.id && deployExpanded?.platformId === platform.id;
              const status     = deployStatus[`${ad.id}_${platform.id}`];
              return (
                <DeployPlatformTile
                  key={platform.id}
                  platform={platform}
                  selected={isSelected}
                  status={status}
                  disabled={!ad.output_url}
                  onClick={() => onSelectPlatform(ad.id, platform.id)}
                />
              );
            })}
          </div>

          {/* Inline config form */}
          {deployExpanded?.adId === ad.id && (() => {
            const platform = DEPLOY_PLATFORMS.find((p) => p.id === deployExpanded.platformId);
            if (!platform) return null;
            const fk = `${ad.id}_${platform.id}`;
            return (
              <DeployConfigForm
                platform={platform}
                formData={deployForms[fk] || {}}
                status={deployStatus[fk]}
                onChange={(key, val) => onUpdateForm(ad.id, platform.id, key, val)}
                onDeploy={() => onDeploy(ad.id, platform)}
              />
            );
          })()}
        </SectionCard>
      ))}
    </div>
  );
}

function DeployPlatformTile({ platform, selected, status, disabled, onClick }) {
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

function DeployConfigForm({ platform, formData, status, onChange, onDeploy }) {
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
            Deployed successfully{status.url && ` → ${status.url}`}
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
        {isDeploying ? "Deploying…" : isDeployed ? `Redeploy to ${platform.label}` : `Deploy to ${platform.label}`}
      </button>
    </div>
  );
}

// ─── Distribute Tab ───────────────────────────────────────────────────────────
function DistributeTab({ ads, distExpanded, distForms, distStatus, onSelectPlatform, onUpdateForm, onDistribute, onPreviewAd }) {
  const distributable = ads.filter(
    (a) => (a.status === "approved" || a.status === "published") && a.output_files?.length > 0
  );

  if (distributable.length === 0) {
    return (
      <SectionCard title="Distribute Ad Creatives" subtitle="No distributable ad campaigns yet">
        <div className="flex flex-col items-center py-12 gap-3">
          <Share2 size={36} style={{ color: "var(--color-sidebar-text)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
            Generate ad creatives for an approved campaign to distribute them here
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {distributable.map((ad) => {
        const campaignPlatforms = (ad.platforms || []).filter((p) => SOCIAL_PLATFORMS[p]);
        const otherPlatforms    = Object.keys(SOCIAL_PLATFORMS).filter((p) => !campaignPlatforms.includes(p));

        return (
          <SectionCard
            key={ad.id}
            title={ad.title}
            subtitle={`${ad.output_files.length} creative${ad.output_files.length !== 1 ? "s" : ""} ready · ${ad.platforms?.join(", ") || "no platforms configured"}`}
          >
            {/* Creative strip header */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)", flex: 1 }}>
                Ad Creatives
              </p>
              <button className="btn--inline-action--ghost" onClick={() => onPreviewAd(ad)}>
                <Eye size={11} /> Preview All
              </button>
            </div>

            {/* Creative thumbnail strip */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "20px", overflowX: "auto", paddingBottom: "4px" }}>
              {ad.output_files.slice(0, 6).map((c, i) => (
                <div key={i} style={{
                  width: "80px", height: "60px", borderRadius: "6px", flexShrink: 0,
                  border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)",
                  overflow: "hidden",
                }}>
                  {c.image_url
                    ? <img src={c.image_url} alt={c.headline} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Image size={18} style={{ color: "var(--color-sidebar-text)", opacity: 0.35 }} />
                      </div>
                  }
                </div>
              ))}
              {ad.output_files.length > 6 && (
                <div style={{
                  width: "80px", height: "60px", borderRadius: "6px", flexShrink: 0,
                  border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)" }}>+{ad.output_files.length - 6}</span>
                </div>
              )}
            </div>

            {/* Campaign's own platforms */}
            {campaignPlatforms.length > 0 && (
              <>
                <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)", marginBottom: "10px" }}>
                  Campaign Platforms
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "8px", marginBottom: "16px" }}>
                  {campaignPlatforms.map((name) => {
                    const cfg = SOCIAL_PLATFORMS[name];
                    const isSelected = distExpanded?.adId === ad.id && distExpanded?.platformId === cfg.id;
                    return (
                      <DistributePlatformTile
                        key={name} platformName={name}
                        selected={isSelected}
                        status={distStatus[`${ad.id}_${cfg.id}`]}
                        onClick={() => onSelectPlatform(ad.id, cfg.id)}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {/* Other available platforms */}
            {otherPlatforms.length > 0 && (
              <>
                <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)", marginBottom: "10px" }}>
                  Other Platforms
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "8px", marginBottom: "16px" }}>
                  {otherPlatforms.map((name) => {
                    const cfg = SOCIAL_PLATFORMS[name];
                    const isSelected = distExpanded?.adId === ad.id && distExpanded?.platformId === cfg.id;
                    return (
                      <DistributePlatformTile
                        key={name} platformName={name}
                        selected={isSelected}
                        status={distStatus[`${ad.id}_${cfg.id}`]}
                        dim
                        onClick={() => onSelectPlatform(ad.id, cfg.id)}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {/* Inline post form */}
            {distExpanded?.adId === ad.id && (() => {
              const entry = Object.entries(SOCIAL_PLATFORMS).find(([, cfg]) => cfg.id === distExpanded.platformId);
              if (!entry) return null;
              const [platformName, platformConfig] = entry;
              const fk = `${ad.id}_${platformConfig.id}`;
              return (
                <DistributeForm
                  platformName={platformName}
                  platformConfig={platformConfig}
                  formData={distForms[fk] || {}}
                  status={distStatus[fk]}
                  creatives={ad.output_files}
                  aiSuggestions={ad.strategy_json?.social_content?.[platformName]}
                  onChange={(key, val) => onUpdateForm(ad.id, platformConfig.id, key, val)}
                  onPost={() => onDistribute(ad.id, platformConfig)}
                />
              );
            })()}
          </SectionCard>
        );
      })}
    </div>
  );
}

function DistributePlatformTile({ platformName, selected, status, dim, onClick }) {
  const isPosted = status?.status === "posted";
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: "3px",
        padding: "10px 12px", borderRadius: "10px", textAlign: "left",
        border: `2px solid ${selected ? "var(--color-accent)" : isPosted ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.4)" : "var(--color-card-border)"}`,
        backgroundColor: selected
          ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)"
          : isPosted ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.05)" : "var(--color-card-bg)",
        cursor: "pointer",
        opacity: dim && !selected ? 0.55 : 1,
        transition: "border-color 0.15s, background-color 0.15s",
      }}
    >
      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)" }}>
        {platformName}{isPosted && " ✓"}
      </span>
      {isPosted && <span style={{ fontSize: "0.68rem", color: "var(--color-accent)" }}>Posted</span>}
    </button>
  );
}

function DistributeForm({ platformName, platformConfig, formData, status, creatives, aiSuggestions, onChange, onPost }) {
  const isPosting = status?.status === "posting";
  const isPosted  = status?.status === "posted";
  const isError   = status?.status === "error";

  // Fields that were seeded from AI suggestions
  const AI_SEEDED_KEYS = new Set(["caption", "hashtags", "tweet_text", "description"]);

  const inputStyle = {
    width: "100%", padding: "8px 12px", borderRadius: "8px", fontSize: "0.83rem",
    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", outline: "none", fontFamily: "inherit",
  };
  const labelStyle = {
    fontSize: "0.72rem", fontWeight: 600, color: "var(--color-sidebar-text)",
    display: "block", marginBottom: "5px",
  };

  const aiPill = (
    <span style={{
      fontSize: "0.6rem", fontWeight: 700, padding: "1px 7px", borderRadius: 999,
      backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12)",
      color: "var(--color-accent)", marginLeft: 6, verticalAlign: "middle",
      letterSpacing: "0.06em", textTransform: "uppercase",
    }}>AI Suggested</span>
  );

  return (
    <div style={{
      padding: "20px", borderRadius: "12px",
      border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)",
    }}>
      <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-input-text)", marginBottom: "16px" }}>
        Post to {platformName}
      </p>

      {/* AI Launch Schedule Recommendation */}
      {aiSuggestions?.launch_schedule && (
        <div style={{
          display: "flex", gap: 10, padding: "10px 14px", borderRadius: 10, marginBottom: 16,
          backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)",
          border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.2)",
        }}>
          <Sparkles size={14} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>
              AI Recommended Launch Window
            </p>
            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-input-text)", margin: "0 0 2px" }}>
              {[aiSuggestions.launch_schedule.recommended_window, aiSuggestions.launch_schedule.best_days, aiSuggestions.launch_schedule.best_time].filter(Boolean).join(" · ")}
            </p>
            {aiSuggestions.launch_schedule.rationale && (
              <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", margin: 0, fontStyle: "italic" }}>
                {aiSuggestions.launch_schedule.rationale}
              </p>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px", marginBottom: "16px" }}>
        {platformConfig.fields.map((field) => {
          const isAiField = AI_SEEDED_KEYS.has(field.key) && aiSuggestions && (field.key === "caption" ? aiSuggestions.caption : field.key === "hashtags" ? aiSuggestions.hashtags : aiSuggestions.caption);
          return (
            <div key={field.key} style={field.type === "textarea" ? { gridColumn: "1 / -1" } : {}}>
              <label style={labelStyle}>
                {field.label}
                {isAiField && aiPill}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  style={{ ...inputStyle, resize: "vertical", minHeight: "72px" }}
                  placeholder={field.placeholder || ""}
                  value={formData[field.key] || ""}
                  onChange={(e) => onChange(field.key, e.target.value)}
                />
              ) : (
                <input
                  type={field.type}
                  style={inputStyle}
                  placeholder={field.placeholder || ""}
                  value={formData[field.key] || ""}
                  onChange={(e) => onChange(field.key, e.target.value)}
                />
              )}
            </div>
          );
        })}

        {/* Schedule field — common to all platforms */}
        <div>
          <label style={labelStyle}>
            Schedule (optional)
            {aiSuggestions?.launch_schedule && aiPill}
          </label>
          <input
            type="datetime-local"
            style={inputStyle}
            value={formData.schedule_at || ""}
            onChange={(e) => onChange("schedule_at", e.target.value)}
          />
          {aiSuggestions?.launch_schedule?.recommended_window && !formData.schedule_at && (
            <p style={{ fontSize: "0.68rem", color: "var(--color-sidebar-text)", marginTop: 4, fontStyle: "italic" }}>
              Recommended: {aiSuggestions.launch_schedule.recommended_window}
            </p>
          )}
        </div>
      </div>

      {/* Creative selector */}
      <div style={{ marginBottom: "16px" }}>
        <label style={labelStyle}>Select Creatives to Post</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {creatives.map((c, i) => {
            const sel = (formData.selected_creatives || []).includes(i);
            return (
              <button
                key={i}
                onClick={() => {
                  const cur     = formData.selected_creatives || [];
                  const updated = sel ? cur.filter((x) => x !== i) : [...cur, i];
                  onChange("selected_creatives", updated);
                }}
                style={{
                  width: "60px", height: "45px", borderRadius: "6px", flexShrink: 0,
                  border: `2px solid ${sel ? "var(--color-accent)" : "var(--color-card-border)"}`,
                  backgroundColor: "var(--color-card-bg)", overflow: "hidden",
                  padding: 0, cursor: "pointer",
                }}
              >
                {c.image_url
                  ? <img src={c.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Image size={14} style={{ color: "var(--color-sidebar-text)", opacity: 0.4 }} />
                    </div>
                }
              </button>
            );
          })}
        </div>
      </div>

      {isError && (
        <div style={{ display: "flex", gap: "8px", padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "12px" }}>
          <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "1px" }} />
          <p style={{ fontSize: "0.8rem", color: "#ef4444" }}>{status.error}</p>
        </div>
      )}

      {isPosted && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.08)", border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.3)", marginBottom: "12px" }}>
          <CheckCircle2 size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
          <p style={{ fontSize: "0.82rem", color: "var(--color-accent)" }}>
            {formData.schedule_at
              ? `Scheduled for ${new Date(formData.schedule_at).toLocaleString()}`
              : "Posted successfully"}
          </p>
        </div>
      )}

      <button
        onClick={onPost}
        disabled={isPosting}
        className="btn--accent"
        style={{ display: "inline-flex", alignItems: "center", gap: "8px", opacity: isPosting ? 0.7 : 1 }}
      >
        {isPosting
          ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
          : <Share2 size={14} />}
        {isPosting
          ? "Posting…"
          : formData.schedule_at
            ? "Schedule Post"
            : isPosted ? "Repost" : `Post to ${platformName}`}
      </button>
    </div>
  );
}

// ─── Ad Preview Modal ─────────────────────────────────────────────────────────
function AdPreviewModal({ ad, onClose }) {
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
                  <img src={c.image_url} alt={c.headline} className="w-full h-full object-cover" />
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

function aspectRatioForFormat(format = "") {
  const f = format.toLowerCase();
  if (f.includes("16:9") || f.includes("banner")) return "16/9";
  if (f.includes("1:1") || f.includes("square"))  return "1/1";
  if (f.includes("9:16") || f.includes("story"))  return "9/16";
  if (f.includes("4:5"))                           return "4/5";
  return "16/9";
}

// ─── Publisher Analytics Sub-component ───────────────────────────────────────
function PublisherAnalytics({ ads }) {
  const [selected,    setSelected]    = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [optimizing,  setOptimizing]  = useState(false);

  const handleOptimize = async (adId) => {
    setOptimizing(true);
    try {
      const result = await analyticsAPI.triggerOptimize(adId);
      setSuggestions(result);
    } catch (err) { alert(err.message); }
    finally { setOptimizing(false); }
  };

  const handleDecision = async (adId, decision) => {
    try {
      await analyticsAPI.submitDecision(adId, { decision });
      setSuggestions(null);
      alert(`Decision "${decision}" recorded. Reinforcement learning updated.`);
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Published Campaign Analytics" subtitle="View performance and apply optimizer suggestions">
        {ads.length === 0 ? (
          <p className="text-sm py-4" style={{ color: "var(--color-sidebar-text)" }}>No published campaigns to analyze yet</p>
        ) : (
          ads.map((ad) => (
            <div key={ad.id} className="pub-campaign-row">
              <div className="flex items-center gap-3">
                <div className="pub-campaign-row__dot--live" />
                <div>
                  <p className="table-row__title">{ad.title}</p>
                  <p className="table-row__meta">{typeLabel(ad)}</p>
                </div>
              </div>
              <button
                onClick={() => { setSelected(ad); handleOptimize(ad.id); }}
                className="btn--optimize"
              >
                <Sparkles size={12} /> {optimizing && selected?.id === ad.id ? "Optimizing…" : "Optimize"}
              </button>
            </div>
          ))
        )}
      </SectionCard>

      {suggestions && selected && (
        <SectionCard title={`Optimizer Suggestions: ${selected.title}`}>
          <div className="code-preview--highlight mb-4">
            <pre>{JSON.stringify(suggestions.suggestions, null, 2)}</pre>
          </div>
          <div className="flex gap-3">
            <button onClick={() => handleDecision(selected.id, "accepted")} className="btn--approve">
              <CheckCircle size={16} /> Accept & Redeploy
            </button>
            <button onClick={() => handleDecision(selected.id, "partial")} className="btn--revise">
              Partial Accept
            </button>
            <button onClick={() => handleDecision(selected.id, "rejected")} className="btn--ghost flex-1 py-2.5">
              Reject
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
