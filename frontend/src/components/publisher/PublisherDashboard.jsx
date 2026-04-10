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
import { adsAPI, analyticsAPI, platformConnectionsAPI } from "../../services/api";
import {
  Send, Globe, Image, BarChart3, Sparkles,
  CheckCircle, Rocket, ChevronDown, ChevronUp, Zap, X, ImageOff,
  Share2, UploadCloud, ExternalLink, Download, Eye, AlertCircle,
  CheckCircle2, Loader2, Mic, PhoneCall, PhoneOff, Volume2, Radio, MessageSquare,
  Link2, Link2Off, Settings, RefreshCw, ChevronDown as ChevDown, SlidersHorizontal,
  ToggleLeft, ToggleRight, Trash2, Pencil, TrendingUp, Target, Clock, Calendar,
  Play, Pause, RotateCcw, ChevronRight, Info,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const hasType = (ad, type) => Array.isArray(ad.ad_type) ? ad.ad_type.includes(type) : ad.ad_type === type;
const typeLabel = (ad) => !ad ? "" : (Array.isArray(ad.ad_type) ? ad.ad_type : [ad.ad_type]).join(", ");

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
// Only Meta/Instagram is active. Other platforms are shown as "Coming soon".
// Credentials (access_token, ad_account_id, page_id) come from the stored
// PlatformConnection — they are no longer entered per-publish.
const SOCIAL_PLATFORMS = {
  "Meta/Instagram": {
    id: "meta",
    active: true,
    usesOAuth: true,   // credentials come from Platform Settings, not typed in here
    fields: [
      { key: "destination_url",     label: "Destination URL",     type: "text", placeholder: "https://…",  required: true  },
      { key: "daily_budget",        label: "Daily Budget (USD)",  type: "text", placeholder: "10.00",       required: true  },
      { key: "targeting_countries", label: "Target Countries",    type: "text", placeholder: "US, GB, CA",  required: false },
    ],
  },
  "Google Ads": { id: "google_ads", active: false, fields: [] },
  "LinkedIn":   { id: "linkedin",   active: false, fields: [] },
  "YouTube":    { id: "youtube",    active: false, fields: [] },
  "Twitter/X":  { id: "twitter",    active: false, fields: [] },
  "TikTok":     { id: "tiktok",     active: false, fields: [] },
};

// ─── Tab ↔ Path maps ──────────────────────────────────────────────────────────
const PATH_TO_TAB = {
  "/publisher/deploy":      "deploy",
  "/publisher/distribute":  "distribute",
  "/publisher/manage":      "manage",
  "/publisher/analytics":   "analytics",
  "/publisher/settings":    "settings",
};
const TAB_TO_PATH = {
  overview:    "/publisher",
  deploy:      "/publisher/deploy",
  distribute:  "/publisher/distribute",
  manage:      "/publisher/manage",
  analytics:   "/publisher/analytics",
  settings:    "/publisher/settings",
};

const TABS = [
  { key: "overview",   label: "Overview",    icon: Eye },
  { key: "deploy",     label: "Deploy",      icon: Rocket },
  { key: "distribute", label: "Distribute",  icon: Share2 },
  { key: "manage",     label: "Manage Ads",  icon: TrendingUp },
  { key: "analytics",  label: "Analytics",   icon: BarChart3 },
  { key: "settings",   label: "Settings",    icon: SlidersHorizontal },
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
  const [hostingId,    setHostingId]   = useState(null);
  const [hostError,    setHostError]   = useState({});
  const [expandedId,   setExpandedId]  = useState(null);
  const [previewAd,    setPreviewAd]   = useState(null);

  // Deploy state
  const [deployExpanded, setDeployExpanded] = useState(null);
  const [deployForms,    setDeployForms]    = useState({});
  const [deployStatus,   setDeployStatus]   = useState({});

  // Distribute state
  const [distExpanded, setDistExpanded] = useState(null);
  const [distForms,    setDistForms]    = useState({});
  const [distStatus,   setDistStatus]   = useState({});

  // Platform connections (OAuth)
  const [metaConnection,  setMetaConnection]  = useState(null);   // stored connection or null
  const [metaAccounts,    setMetaAccounts]    = useState(null);   // { ad_accounts, pages }
  const [connectingMeta,  setConnectingMeta]  = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const activeTab = PATH_TO_TAB[location.pathname] || "overview";

  useEffect(() => {
    adsAPI.list().then(setAds).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Load stored Meta connection on mount
  useEffect(() => {
    platformConnectionsAPI.list()
      .then((connections) => {
        const meta = connections.find((c) => c.platform === "meta") || null;
        setMetaConnection(meta);
      })
      .catch(console.error);
  }, []);

  const approved  = ads.filter((a) => a.status === "approved");
  const published = ads.filter((a) => a.status === "published");

  // ── Overview handlers ────────────────────────────────────────────────────
  const handleUpdateAd = (updatedAd) => {
    setAds((p) => p.map((a) => (a.id === updatedAd.id ? updatedAd : a)));
  };

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

  const handleHostPage = async (adId) => {
    setHostingId(adId); setHostError((p) => ({ ...p, [adId]: null }));
    try {
      const updated = await adsAPI.hostPage(adId);
      setAds((p) => p.map((a) => (a.id === adId ? updated : a)));
    } catch (err) {
      setHostError((p) => ({ ...p, [adId]: err.message || "Hosting failed." }));
    } finally {
      setHostingId(null);
    }
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
    // Block inactive platforms
    const entry = Object.entries(SOCIAL_PLATFORMS).find(([, cfg]) => cfg.id === platformId);
    if (!entry || !entry[1].active) return;

    const isOpen = distExpanded?.adId === adId && distExpanded?.platformId === platformId;
    if (!isOpen) {
      // Seed destination_url from the campaign's hosted landing page (if generated)
      const ad = ads.find((a) => a.id === adId);
      if (ad?.hosted_url) {
        const fk = `${adId}_${platformId}`;
        setDistForms((p) => {
          const existing = p[fk] || {};
          if (!existing.destination_url) {
            return { ...p, [fk]: { ...existing, destination_url: ad.hosted_url } };
          }
          return p;
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
      const result = await adsAPI.distributeCreatives(adId, { platform: platformConfig.id, config: distForms[fk] || {} });
      setDistStatus((p) => ({ ...p, [fk]: { status: "posted", result } }));
    } catch (err) {
      setDistStatus((p) => ({ ...p, [fk]: { status: "error", error: err.message } }));
    }
  };

  // ── Meta OAuth connect ────────────────────────────────────────────────────
  const handleConnectMeta = async () => {
    setConnectingMeta(true);
    try {
      const { url } = await platformConnectionsAPI.getOAuthUrl("meta");
      const popup = window.open(url, "meta_oauth", "width=620,height=700,scrollbars=yes,resizable=yes");

      const onMessage = async (event) => {
        if (!event.data || !["meta_oauth_success", "meta_oauth_error"].includes(event.data.type)) return;
        window.removeEventListener("message", onMessage);
        clearInterval(pollClosed);

        if (event.data.type === "meta_oauth_success") {
          // Refresh connection and load account/page lists
          const connections = await platformConnectionsAPI.list();
          const meta = connections.find((c) => c.platform === "meta") || null;
          setMetaConnection(meta);
          if (meta) {
            setLoadingAccounts(true);
            try {
              const accounts = await platformConnectionsAPI.getMetaAccounts();
              setMetaAccounts(accounts);
            } catch (e) { console.error(e); }
            finally { setLoadingAccounts(false); }
          }
        } else {
          alert("Failed to connect Meta account. Please try again.");
        }
        setConnectingMeta(false);
      };

      window.addEventListener("message", onMessage);

      // Fallback: if popup closed without sending a message
      const pollClosed = setInterval(() => {
        if (popup && popup.closed) {
          clearInterval(pollClosed);
          window.removeEventListener("message", onMessage);
          setConnectingMeta(false);
        }
      }, 600);

    } catch (err) {
      alert(err.message);
      setConnectingMeta(false);
    }
  };

  const handleDisconnectMeta = async () => {
    if (!window.confirm("Disconnect your Meta account? Stored credentials will be removed.")) return;
    await platformConnectionsAPI.disconnectMeta();
    setMetaConnection(null);
    setMetaAccounts(null);
  };

  const handleLoadMetaAccounts = async () => {
    if (metaAccounts) return; // already loaded
    setLoadingAccounts(true);
    try {
      const accounts = await platformConnectionsAPI.getMetaAccounts();
      setMetaAccounts(accounts);
    } catch (err) { alert(err.message); }
    finally { setLoadingAccounts(false); }
  };

  const handleSelectAdAccount = async (account) => {
    await platformConnectionsAPI.updateMeta({ ad_account_id: account.id, ad_account_name: account.name });
    setMetaConnection((p) => ({ ...p, ad_account_id: account.id, ad_account_name: account.name }));
  };

  const handleSelectPage = async (page) => {
    await platformConnectionsAPI.updateMeta({ page_id: page.id, page_name: page.name });
    setMetaConnection((p) => ({ ...p, page_id: page.id, page_name: page.name }));
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
          onUpdateAd={handleUpdateAd}
          onPreviewAd={setPreviewAd}
          onViewDetail={(id) => navigate(`/publisher/campaign/${id}`)}
          hostingId={hostingId}
          hostError={hostError}
          onHostPage={handleHostPage}
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
          metaConnection={metaConnection}
          metaAccounts={metaAccounts}
          connectingMeta={connectingMeta}
          loadingAccounts={loadingAccounts}
          onConnectMeta={handleConnectMeta}
          onDisconnectMeta={handleDisconnectMeta}
          onLoadMetaAccounts={handleLoadMetaAccounts}
          onSelectAdAccount={handleSelectAdAccount}
          onSelectPage={handleSelectPage}
        />
      )}

      {/* ── Manage Ads ── */}
      {activeTab === "manage" && (
        <ManageTab ads={ads} metaConnection={metaConnection} />
      )}

      {/* ── Analytics ── */}
      {activeTab === "analytics" && <PublisherAnalytics ads={published} />}

      {/* ── Settings ── */}
      {activeTab === "settings" && (
        <SettingsTab
          metaConnection={metaConnection}
          metaAccounts={metaAccounts}
          connectingMeta={connectingMeta}
          loadingAccounts={loadingAccounts}
          onConnectMeta={handleConnectMeta}
          onDisconnectMeta={handleDisconnectMeta}
          onLoadMetaAccounts={handleLoadMetaAccounts}
          onSelectAdAccount={handleSelectAdAccount}
          onSelectPage={handleSelectPage}
        />
      )}

      {/* Ad Preview Modal */}
      {previewAd && <AdPreviewModal ad={previewAd} onClose={() => setPreviewAd(null)} />}
    </PageWithSidebar>
  );
}

// ─── Deployment checklist helper ─────────────────────────────────────────────
function getDeployChecklist(ad) {
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
      label:    "Distributed to Meta",
      done:     !!ad.bot_config?.meta_campaign_id,
      detail:   ad.bot_config?.meta_campaign_id
        ? `Campaign ID: ${ad.bot_config.meta_campaign_id}`
        : "Not yet distributed — go to the Distribute tab",
      note:     null,
      action:   !ad.bot_config?.meta_campaign_id ? { type: "navigate", path: "/publisher/distribute", label: "Go to Distribute" } : null,
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
        ? `Agent ID: ${ad.bot_config.elevenlabs_agent_id}`
        : "Not yet provisioned on ElevenLabs",
      note:     null,
      action:   !ad.bot_config?.elevenlabs_agent_id
        ? { type: "navigate", path: `/publisher/campaign/${ad.id}`, label: "Open Campaign Details" }
        : null,
    });
  }

  return items;
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ approved, published, publishing, publishError, expandedId, onToggle, onPublish, onUpdateAd, onPreviewAd, onViewDetail, hostingId, hostError, onHostPage }) {
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
          ? `${approved.length} approved campaign${approved.length !== 1 ? "s" : ""} ready to deploy`
          : "All approved campaigns have been deployed"}
      >
        {approved.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-3">
            <div className="metric-tile__icon-wrap" style={{ width: 48, height: 48 }}>
              <Rocket size={20} style={{ color: "var(--color-sidebar-text)" }} />
            </div>
            <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>No campaigns waiting to be deployed</p>
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
function CampaignRow({ ad, expanded, onToggle, publishing, onPublish, onUpdateAd, onPreviewAd, onViewDetail }) {
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
function DeploymentChecklist({ ad, checklist, allDone, publishing, onPublish, onUpdateAd, onPreviewAd }) {
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
        Deployment Checklist
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
            <strong>Optional:</strong> Deploy to Vercel, Netlify, or a custom domain for a production URL.
          </p>
          <button onClick={() => navigate("/publisher/deploy")} className="btn--inline-action--ghost" style={{ fontSize: "0.75rem", flexShrink: 0 }}>
            <UploadCloud size={11} /> Deploy Tab <ChevronRight size={11} />
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
function PublishedCampaignPanel({ ad, onPreviewAd, onUpdateAd }) {
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

  // ── Outbound phone call test ────────────────────────────────────────────────
  const [testPhone,       setTestPhone]       = useState("");
  const [testCallStatus,  setTestCallStatus]  = useState("idle"); // idle | calling | done | error
  const [testCallMsg,     setTestCallMsg]     = useState("");

  const handleTestCall = async () => {
    const phone = testPhone.trim();
    if (!phone) return;
    setTestCallStatus("calling");
    setTestCallMsg("");
    try {
      await adsAPI.requestVoiceCall(ad.id, phone);
      setTestCallStatus("done");
      setTestCallMsg("Calling now — your phone should ring shortly.");
    } catch (err) {
      setTestCallStatus("error");
      setTestCallMsg(err.message || "Call request failed.");
    }
  };

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
      if (err.message?.includes("No ElevenLabs agent provisioned")) {
        setAgentStatus({ provisioned: false });
        setCallError("Agent is not provisioned — click Provision Agent to set it up.");
      } else {
        setCallError(err.name === "NotAllowedError" ? "Microphone access denied — allow microphone access and try again." : (err.message || "Failed to start session."));
      }
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

      {/* ── Test Voice Agent ────────────────────────────────────────── */}
      {agentStatus?.provisioned && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
          <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-muted)", marginBottom: 10 }}>
            Test Voice Agent
          </p>

          {/* Call My Phone */}
          <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
            <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <PhoneCall size={12} style={{ color: "var(--color-accent)" }} /> Call My Phone
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => { setTestPhone(e.target.value); setTestCallStatus("idle"); setTestCallMsg(""); }}
                placeholder="+1 (555) 000-0000"
                className="field-input"
                style={{ flex: 1, fontSize: "0.82rem", padding: "6px 10px" }}
                disabled={testCallStatus === "calling"}
              />
              <button
                onClick={handleTestCall}
                disabled={testCallStatus === "calling" || !testPhone.trim()}
                className="btn--primary"
                style={{ fontSize: "0.8rem", padding: "6px 14px", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}
              >
                {testCallStatus === "calling"
                  ? <><div className="spinner" style={{ width: 10, height: 10 }} /> Calling…</>
                  : <><PhoneCall size={12} /> Call Me</>}
              </button>
            </div>
            {testCallMsg && (
              <p style={{ marginTop: 7, fontSize: "0.75rem", display: "flex", alignItems: "flex-start", gap: 5, color: testCallStatus === "error" ? "#ef4444" : "#10b981" }}>
                <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />{testCallMsg}
              </p>
            )}
            <p style={{ marginTop: 5, fontSize: "0.68rem", color: "var(--color-muted)" }}>
              The agent will call this number via ElevenLabs/Twilio.
            </p>
          </div>

          {/* Browser mic test */}
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

// ─── Platform Settings Card ───────────────────────────────────────────────────
function MetaPlatformSettings({
  connection, accounts, connecting, loadingAccounts,
  onConnect, onDisconnect, onLoadAccounts, onSelectAdAccount, onSelectPage,
}) {
  const [showAdAccounts, setShowAdAccounts] = useState(false);
  const [showPages,      setShowPages]      = useState(false);

  const daysTilExpiry = connection?.token_expires_at
    ? Math.max(0, Math.round((new Date(connection.token_expires_at) - Date.now()) / 86400000))
    : null;

  const pillStyle = (color) => ({
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "2px 10px", borderRadius: 999, fontSize: "0.7rem", fontWeight: 700,
    backgroundColor: `rgba(${color},0.12)`, color: `rgb(${color})`,
  });

  const dropdownStyle = {
    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
    border: "1px solid var(--color-card-border)", borderRadius: "8px",
    backgroundColor: "var(--color-card-bg)", boxShadow: "0 4px 16px rgba(0,0,0,.12)",
    maxHeight: "200px", overflowY: "auto",
  };

  const selectorBtnStyle = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", padding: "7px 10px", borderRadius: "7px", fontSize: "0.8rem",
    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", cursor: "pointer", textAlign: "left",
  };

  return (
    <SectionCard
      title="Platform Settings"
      subtitle="Connect your ad accounts once — credentials are stored securely and reused for every publish"
    >
      {/* ── Meta/Instagram row ── */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap",
        padding: "16px", borderRadius: "10px",
        border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)",
      }}>
        {/* Left: status + connect/disconnect */}
        <div style={{ flex: "0 0 auto", minWidth: 180 }}>
          <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-input-text)", marginBottom: 6 }}>
            Meta / Instagram
          </p>

          {connection ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={pillStyle("34,197,94")}>
                <Link2 size={10} /> Connected
              </span>

              {connection.expires_soon && (
                <span style={pillStyle("234,179,8")}>
                  <AlertCircle size={10} /> Expires in {daysTilExpiry}d — reconnect soon
                </span>
              )}
              {!connection.expires_soon && daysTilExpiry !== null && (
                <span style={{ fontSize: "0.68rem", color: "var(--color-muted)" }}>
                  Token valid for ~{daysTilExpiry} days
                </span>
              )}

              <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                <button
                  className="btn--inline-action--ghost"
                  onClick={onConnect}
                  disabled={connecting}
                  title="Refresh OAuth token"
                >
                  <RefreshCw size={10} style={connecting ? { animation: "spin 1s linear infinite" } : {}} />
                  Reconnect
                </button>
                <button className="btn--inline-action--ghost" onClick={onDisconnect} style={{ color: "#ef4444" }}>
                  <Link2Off size={10} /> Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div>
              <span style={pillStyle("156,163,175")}>
                <Link2Off size={10} /> Not connected
              </span>
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn--accent"
                  onClick={onConnect}
                  disabled={connecting}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem" }}
                >
                  {connecting
                    ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                    : <Link2 size={12} />}
                  {connecting ? "Opening Facebook…" : "Connect Meta Account"}
                </button>
                <p style={{ fontSize: "0.68rem", color: "var(--color-muted)", marginTop: 6 }}>
                  Opens Facebook login in a popup. No developer account needed.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: account + page selectors (only shown when connected) */}
        {connection && (
          <div style={{ flex: 1, display: "flex", gap: 12, flexWrap: "wrap", minWidth: 260 }}>
            {/* Ad Account selector */}
            <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: 5 }}>
                Ad Account
              </label>
              <button
                style={selectorBtnStyle}
                onClick={() => {
                  setShowAdAccounts((v) => !v);
                  setShowPages(false);
                  if (!accounts) onLoadAccounts();
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {connection.ad_account_name || connection.ad_account_id || "Select ad account…"}
                </span>
                <ChevDown size={12} style={{ flexShrink: 0, marginLeft: 4 }} />
              </button>
              {showAdAccounts && (
                <div style={dropdownStyle}>
                  {loadingAccounts
                    ? <div style={{ padding: "12px", textAlign: "center" }}><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /></div>
                    : accounts?.ad_accounts?.length
                      ? accounts.ad_accounts.map((acc) => (
                          <button
                            key={acc.id}
                            onClick={() => { onSelectAdAccount(acc); setShowAdAccounts(false); }}
                            style={{ display: "block", width: "100%", padding: "9px 12px", textAlign: "left", fontSize: "0.8rem", color: "var(--color-input-text)", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--color-card-border)" }}
                          >
                            <span style={{ fontWeight: 600 }}>{acc.name}</span>
                            <span style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginLeft: 6 }}>{acc.id}</span>
                          </button>
                        ))
                      : <p style={{ padding: "10px 12px", fontSize: "0.78rem", color: "var(--color-muted)" }}>No ad accounts found</p>
                  }
                </div>
              )}
            </div>

            {/* Page selector */}
            <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: 5 }}>
                Facebook Page
              </label>
              <button
                style={selectorBtnStyle}
                onClick={() => {
                  setShowPages((v) => !v);
                  setShowAdAccounts(false);
                  if (!accounts) onLoadAccounts();
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {connection.page_name || connection.page_id || "Select page…"}
                </span>
                <ChevDown size={12} style={{ flexShrink: 0, marginLeft: 4 }} />
              </button>
              {showPages && (
                <div style={dropdownStyle}>
                  {loadingAccounts
                    ? <div style={{ padding: "12px", textAlign: "center" }}><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /></div>
                    : accounts?.pages?.length
                      ? accounts.pages.map((pg) => (
                          <button
                            key={pg.id}
                            onClick={() => { onSelectPage(pg); setShowPages(false); }}
                            style={{ display: "block", width: "100%", padding: "9px 12px", textAlign: "left", fontSize: "0.8rem", color: "var(--color-input-text)", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--color-card-border)" }}
                          >
                            <span style={{ fontWeight: 600 }}>{pg.name}</span>
                            {pg.category && <span style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginLeft: 6 }}>{pg.category}</span>}
                          </button>
                        ))
                      : <p style={{ padding: "10px 12px", fontSize: "0.78rem", color: "var(--color-muted)" }}>No pages found</p>
                  }
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({
  metaConnection, metaAccounts, connectingMeta, loadingAccounts,
  onConnectMeta, onDisconnectMeta, onLoadMetaAccounts, onSelectAdAccount, onSelectPage,
}) {
  return (
    <div className="space-y-4">
      <MetaPlatformSettings
        connection={metaConnection}
        accounts={metaAccounts}
        connecting={connectingMeta}
        loadingAccounts={loadingAccounts}
        onConnect={onConnectMeta}
        onDisconnect={onDisconnectMeta}
        onLoadAccounts={onLoadMetaAccounts}
        onSelectAdAccount={onSelectAdAccount}
        onSelectPage={onSelectPage}
      />
    </div>
  );
}

// ─── Distribute Tab ───────────────────────────────────────────────────────────
function DistributeTab({
  ads, distExpanded, distForms, distStatus,
  onSelectPlatform, onUpdateForm, onDistribute, onPreviewAd,
  metaConnection, metaAccounts, connectingMeta, loadingAccounts,
  onConnectMeta, onDisconnectMeta, onLoadMetaAccounts,
  onSelectAdAccount, onSelectPage,
}) {
  const navigate = useNavigate();
  const distributable = ads.filter(
    (a) => (a.status === "approved" || a.status === "published") && a.output_files?.length > 0
  );

  return (
    <div className="space-y-4">
      {/* Compact connection status banner — full config lives in Settings tab */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "12px 16px", borderRadius: 10,
        border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)",
      }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minWidth: 200 }}>
          {metaConnection ? (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.75rem", fontWeight: 700, color: "#16a34a", backgroundColor: "rgba(34,197,94,0.1)", padding: "2px 10px", borderRadius: 999 }}>
                <Link2 size={10} /> Meta Connected
              </span>
              {metaConnection.ad_account_name && (
                <span style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
                  {metaConnection.ad_account_name} · {metaConnection.page_name || "no page selected"}
                </span>
              )}
              {(!metaConnection.ad_account_id || !metaConnection.page_id) && (
                <span style={{ fontSize: "0.73rem", color: "#ca8a04", fontWeight: 600 }}>
                  — select an ad account &amp; page in Settings
                </span>
              )}
            </>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.75rem", fontWeight: 700, color: "var(--color-muted)", backgroundColor: "var(--color-page-bg)", padding: "2px 10px", borderRadius: 999 }}>
              <Link2Off size={10} /> Meta not connected
            </span>
          )}
        </div>
        <button
          onClick={() => navigate("/publisher/settings")}
          className="btn--inline-action--ghost"
          style={{ fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <SlidersHorizontal size={11} /> Platform Settings
        </button>
      </div>

      {distributable.length === 0 ? (
        <SectionCard title="Distribute Ad Creatives" subtitle="No distributable ad campaigns yet">
          <div className="flex flex-col items-center py-12 gap-3">
            <Share2 size={36} style={{ color: "var(--color-sidebar-text)", opacity: 0.4 }} />
            <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
              Generate ad creatives for an approved campaign to distribute them here
            </p>
          </div>
        </SectionCard>
      ) : (
        distributable.map((ad) => {
          const campaignPlatforms = (ad.platforms || []).filter((p) => SOCIAL_PLATFORMS[p]);
          return (
            <SectionCard
              key={ad.id}
              title={ad.title}
              subtitle={`${ad.output_files.length} creative${ad.output_files.length !== 1 ? "s" : ""} ready · ${ad.platforms?.join(", ") || "no platforms configured"}`}
            >
              {/* Creative strip */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)", flex: 1 }}>
                  Ad Creatives
                </p>
                <button className="btn--inline-action--ghost" onClick={() => onPreviewAd(ad)}>
                  <Eye size={11} /> Preview All
                </button>
              </div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "20px", overflowX: "auto", paddingBottom: "4px" }}>
                {ad.output_files.slice(0, 6).map((c, i) => (
                  <div key={i} style={{ width: "80px", height: "60px", borderRadius: "6px", flexShrink: 0, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)", overflow: "hidden" }}>
                    {c.image_url
                      ? <img src={c.image_url} alt={c.headline} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Image size={18} style={{ color: "var(--color-sidebar-text)", opacity: 0.35 }} /></div>
                    }
                  </div>
                ))}
                {ad.output_files.length > 6 && (
                  <div style={{ width: "80px", height: "60px", borderRadius: "6px", flexShrink: 0, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)" }}>+{ad.output_files.length - 6}</span>
                  </div>
                )}
              </div>

              {/* Platform tiles */}
              <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)", marginBottom: "10px" }}>
                Distribute to
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "8px", marginBottom: "16px" }}>
                {Object.entries(SOCIAL_PLATFORMS).map(([name, cfg]) => {
                  const isSelected = distExpanded?.adId === ad.id && distExpanded?.platformId === cfg.id;
                  const isCampaignPlatform = campaignPlatforms.includes(name);
                  return (
                    <DistributePlatformTile
                      key={name}
                      platformName={name}
                      selected={isSelected}
                      status={distStatus[`${ad.id}_${cfg.id}`]}
                      dim={!isCampaignPlatform && cfg.active}
                      active={cfg.active}
                      onClick={() => onSelectPlatform(ad.id, cfg.id)}
                    />
                  );
                })}
              </div>

              {/* Inline form */}
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
                    metaConnection={metaConnection}
                    onChange={(key, val) => onUpdateForm(ad.id, platformConfig.id, key, val)}
                    onPost={() => onDistribute(ad.id, platformConfig)}
                  />
                );
              })()}
            </SectionCard>
          );
        })
      )}
    </div>
  );
}

function DistributePlatformTile({ platformName, selected, status, dim, onClick, active = true }) {
  const isPosted = status?.status === "posted";
  return (
    <button
      onClick={active ? onClick : undefined}
      title={active ? undefined : "Coming soon"}
      style={{
        display: "flex", flexDirection: "column", gap: "3px",
        padding: "10px 12px", borderRadius: "10px", textAlign: "left",
        border: `2px solid ${selected ? "var(--color-accent)" : isPosted ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.4)" : "var(--color-card-border)"}`,
        backgroundColor: selected
          ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)"
          : isPosted ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.05)" : "var(--color-card-bg)",
        cursor: active ? "pointer" : "not-allowed",
        opacity: !active ? 0.35 : dim && !selected ? 0.55 : 1,
        transition: "border-color 0.15s, background-color 0.15s",
        position: "relative",
      }}
    >
      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)" }}>
        {platformName}{isPosted && " ✓"}
      </span>
      {isPosted && <span style={{ fontSize: "0.68rem", color: "var(--color-accent)" }}>Posted</span>}
      {!active && (
        <span style={{ fontSize: "0.62rem", color: "var(--color-muted)", fontStyle: "italic" }}>
          Coming soon
        </span>
      )}
    </button>
  );
}

function DistributeForm({ platformName, platformConfig, formData, status, creatives, metaConnection, onChange, onPost }) {
  const isPosting = status?.status === "posting";
  const isPosted  = status?.status === "posted";
  const isError   = status?.status === "error";

  const inputStyle = {
    width: "100%", padding: "8px 12px", borderRadius: "8px", fontSize: "0.83rem",
    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", outline: "none", fontFamily: "inherit",
  };
  const labelStyle = {
    fontSize: "0.72rem", fontWeight: 600, color: "var(--color-sidebar-text)",
    display: "block", marginBottom: "5px",
  };
  const requiredPill = (
    <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "1px 6px", borderRadius: 999, backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444", marginLeft: 5, verticalAlign: "middle" }}>
      required
    </span>
  );

  // For OAuth platforms, check if connection is ready
  const isMetaReady = !platformConfig.usesOAuth || (metaConnection?.ad_account_id && metaConnection?.page_id);
  const metaNotConnected = platformConfig.usesOAuth && !metaConnection;
  const metaMissingSelection = platformConfig.usesOAuth && metaConnection && (!metaConnection.ad_account_id || !metaConnection.page_id);

  return (
    <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
      <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-input-text)", marginBottom: "4px" }}>
        Publish to {platformName} via Marketing API
      </p>
      <p style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginBottom: "16px" }}>
        Ads are created in <strong>PAUSED</strong> state — review and activate them in Meta Ads Manager.
      </p>

      {/* Connection status banner for OAuth platforms */}
      {platformConfig.usesOAuth && metaConnection && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: "8px", backgroundColor: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.25)", marginBottom: "16px" }}>
          <CheckCircle2 size={13} style={{ color: "#22c55e", flexShrink: 0 }} />
          <p style={{ fontSize: "0.78rem", color: "#16a34a" }}>
            Publishing as <strong>{metaConnection.page_name || metaConnection.page_id}</strong> · Ad Account: <strong>{metaConnection.ad_account_name || metaConnection.ad_account_id}</strong>
          </p>
        </div>
      )}

      {/* Warn if not connected or incomplete */}
      {metaNotConnected && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.22)", marginBottom: "16px" }}>
          <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: "0.78rem", color: "#ef4444" }}>Connect your Meta account in Platform Settings above before publishing.</p>
        </div>
      )}
      {metaMissingSelection && (
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)", marginBottom: "16px" }}>
          <AlertCircle size={14} style={{ color: "#ca8a04", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: "0.78rem", color: "#92400e" }}>Select an Ad Account and Facebook Page in Platform Settings above.</p>
        </div>
      )}

      {/* Per-campaign fields (destination URL, budget, targeting) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px", marginBottom: "16px" }}>
        {platformConfig.fields.map((field) => (
          <div key={field.key}>
            <label style={labelStyle}>{field.label}{field.required && requiredPill}</label>
            <input
              type={field.type}
              style={inputStyle}
              placeholder={field.placeholder || ""}
              value={formData[field.key] || ""}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      {/* Creative selector */}
      <div style={{ marginBottom: "16px" }}>
        <label style={labelStyle}>Select Creatives to Publish</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {creatives.map((c, i) => {
            const sel = (formData.selected_creatives || []).includes(i);
            return (
              <button
                key={i}
                onClick={() => {
                  const cur = formData.selected_creatives || [];
                  onChange("selected_creatives", sel ? cur.filter((x) => x !== i) : [...cur, i]);
                }}
                title={c.headline || `Creative ${i + 1}`}
                style={{ width: "60px", height: "45px", borderRadius: "6px", flexShrink: 0, border: `2px solid ${sel ? "var(--color-accent)" : "var(--color-card-border)"}`, backgroundColor: "var(--color-card-bg)", overflow: "hidden", padding: 0, cursor: "pointer" }}
              >
                {c.image_url
                  ? <img src={c.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Image size={14} style={{ color: "var(--color-sidebar-text)", opacity: 0.4 }} /></div>
                }
              </button>
            );
          })}
        </div>
        {creatives.length > 0 && !formData.selected_creatives?.length && (
          <p style={{ fontSize: "0.68rem", color: "var(--color-muted)", marginTop: 4 }}>No creatives selected — first creative will be used.</p>
        )}
      </div>

      {isError && (
        <div style={{ display: "flex", gap: "8px", padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "12px" }}>
          <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "1px" }} />
          <p style={{ fontSize: "0.8rem", color: "#ef4444" }}>{status.error}</p>
        </div>
      )}

      {isPosted && status?.result && (
        <div style={{ padding: "12px 14px", borderRadius: "10px", backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.06)", border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <CheckCircle2 size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
            <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-accent)" }}>
              Campaign created on Meta — ads are PAUSED pending your review
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.75rem", color: "var(--color-muted)", marginBottom: 10 }}>
            <span>Campaign ID: <code style={{ fontFamily: "monospace" }}>{status.result.campaign_id}</code></span>
            <span>Ad Set ID: <code style={{ fontFamily: "monospace" }}>{status.result.adset_id}</code></span>
            <span>Ads created: {status.result.ad_ids?.length ?? 0}</span>
          </div>
          <a href={status.result.ads_manager_url} target="_blank" rel="noreferrer" className="btn--inline-action--success" style={{ fontSize: "0.8rem" }}>
            <ExternalLink size={11} /> Open in Meta Ads Manager
          </a>
        </div>
      )}

      <button
        onClick={onPost}
        disabled={isPosting || !isMetaReady}
        className="btn--accent"
        style={{ display: "inline-flex", alignItems: "center", gap: "8px", opacity: (isPosting || !isMetaReady) ? 0.5 : 1 }}
      >
        {isPosting ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Share2 size={14} />}
        {isPosting ? "Publishing to Meta…" : isPosted ? "Republish" : `Publish to ${platformName}`}
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

// ─── Manage Ads Tab ───────────────────────────────────────────────────────────
function ManageTab({ ads, metaConnection }) {
  // Campaigns that have been distributed to Meta
  const metaCampaigns = ads.filter((a) => a.bot_config?.meta_campaign_id);

  const [metaAds,       setMetaAds]       = useState({});   // { adId: { loading, ads, error } }
  const [toggling,      setToggling]      = useState({});   // { metaAdId: true/false }
  const [deleting,      setDeleting]      = useState({});
  const [editTarget,    setEditTarget]    = useState(null); // { adId, metaAd }
  const [editForm,      setEditForm]      = useState({});
  const [editSaving,    setEditSaving]    = useState(false);
  const [schedules,     setSchedules]     = useState({});   // { adId: { loading, data } }

  const loadMetaAds = async (adId) => {
    setMetaAds((p) => ({ ...p, [adId]: { loading: true, ads: [], error: null } }));
    try {
      const data = await adsAPI.listMetaAds(adId);
      setMetaAds((p) => ({ ...p, [adId]: { loading: false, ads: data.ads || [], error: null } }));
    } catch (err) {
      setMetaAds((p) => ({ ...p, [adId]: { loading: false, ads: [], error: err.message } }));
    }
  };

  const handleToggle = async (adId, metaAdId, currentStatus) => {
    const newStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setToggling((p) => ({ ...p, [metaAdId]: true }));
    try {
      await adsAPI.updateMetaAd(adId, metaAdId, { status: newStatus });
      setMetaAds((p) => ({
        ...p,
        [adId]: {
          ...p[adId],
          ads: p[adId].ads.map((a) => a.id === metaAdId ? { ...a, status: newStatus } : a),
        },
      }));
    } catch (err) { alert(err.message); }
    finally { setToggling((p) => ({ ...p, [metaAdId]: false })); }
  };

  const handleDelete = async (adId, metaAdId) => {
    if (!window.confirm("Permanently delete this ad from Meta? This cannot be undone.")) return;
    setDeleting((p) => ({ ...p, [metaAdId]: true }));
    try {
      await adsAPI.deleteMetaAd(adId, metaAdId);
      setMetaAds((p) => ({
        ...p,
        [adId]: { ...p[adId], ads: p[adId].ads.filter((a) => a.id !== metaAdId) },
      }));
    } catch (err) { alert(err.message); }
    finally { setDeleting((p) => ({ ...p, [metaAdId]: false })); }
  };

  const openEdit = (adId, metaAd) => {
    const ld = metaAd.creative?.object_story_spec?.link_data || {};
    setEditTarget({ adId, metaAd });
    setEditForm({
      headline:   ld.name || "",
      body:       ld.message || "",
      cta_type:   ld.call_to_action?.type || "LEARN_MORE",
      link_url:   ld.link || "",
      image_hash: metaAd.creative?.image_hash || "",
    });
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await adsAPI.updateMetaAd(editTarget.adId, editTarget.metaAd.id, editForm);
      // Reload the ad list to reflect creative changes
      await loadMetaAds(editTarget.adId);
      setEditTarget(null);
    } catch (err) { alert(err.message); }
    finally { setEditSaving(false); }
  };

  const loadSchedule = async (adId) => {
    setSchedules((p) => ({ ...p, [adId]: { loading: true, data: null } }));
    try {
      const result = await adsAPI.getScheduleSuggestions(adId);
      setSchedules((p) => ({ ...p, [adId]: { loading: false, data: result.suggestions } }));
    } catch (err) {
      setSchedules((p) => ({ ...p, [adId]: { loading: false, data: null, error: err.message } }));
    }
  };

  const inputStyle = {
    width: "100%", padding: "8px 12px", borderRadius: "8px", fontSize: "0.83rem",
    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)", outline: "none", fontFamily: "inherit",
  };

  if (!metaConnection) {
    return (
      <SectionCard title="Manage Meta Ads" subtitle="Connect your Meta account first">
        <div className="flex flex-col items-center py-12 gap-3">
          <Link2Off size={36} style={{ color: "var(--color-sidebar-text)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
            Connect your Meta account in Platform Settings to manage ads here.
          </p>
        </div>
      </SectionCard>
    );
  }

  if (metaCampaigns.length === 0) {
    return (
      <SectionCard title="Manage Meta Ads" subtitle="No campaigns distributed to Meta yet">
        <div className="flex flex-col items-center py-12 gap-3">
          <TrendingUp size={36} style={{ color: "var(--color-sidebar-text)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
            Distribute a campaign to Meta from the Distribute tab to manage its ads here.
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {metaCampaigns.map((ad) => {
        const state = metaAds[ad.id];
        const sched = schedules[ad.id];
        const campaignId = ad.bot_config?.meta_campaign_id;

        return (
          <SectionCard
            key={ad.id}
            title={ad.title}
            subtitle={`Campaign ID: ${campaignId} · ${state?.ads?.length ?? "–"} ads`}
          >
            {/* Action bar */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
              <button
                className="btn--inline-action--ghost"
                onClick={() => loadMetaAds(ad.id)}
                disabled={state?.loading}
              >
                {state?.loading
                  ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                  : <RefreshCw size={12} />}
                {state ? "Refresh Ads" : "Load Ads"}
              </button>
              <button
                className="btn--inline-action--ghost"
                onClick={() => loadSchedule(ad.id)}
                disabled={sched?.loading}
              >
                {sched?.loading
                  ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                  : <Clock size={12} />}
                AI Schedule Suggestions
              </button>
              <a
                href={ad.bot_config?.meta_manager_url}
                target="_blank"
                rel="noreferrer"
                className="btn--inline-action--ghost"
                style={{ fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <ExternalLink size={12} /> Ads Manager
              </a>
            </div>

            {/* Error */}
            {state?.error && (
              <div style={{ padding: "8px 12px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.22)", marginBottom: "12px" }}>
                <p style={{ fontSize: "0.78rem", color: "#ef4444" }}>{state.error}</p>
              </div>
            )}

            {/* Ad table */}
            {state?.ads?.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-card-border)" }}>
                      {["Creative", "Headline", "Status", "Enable/Pause", "Edit", "Delete"].map((h) => (
                        <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "var(--color-sidebar-text)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {state.ads.map((metaAd) => {
                      const ld  = metaAd.creative?.object_story_spec?.link_data || {};
                      const isActive  = metaAd.status === "ACTIVE";
                      const isToggling = toggling[metaAd.id];
                      const isDeleting = deleting[metaAd.id];

                      return (
                        <tr key={metaAd.id} style={{ borderBottom: "1px solid var(--color-card-border)" }}>
                          {/* Creative thumbnail */}
                          <td style={{ padding: "8px 10px" }}>
                            <div style={{ width: 48, height: 36, borderRadius: 6, overflow: "hidden", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                              <Image size={18} style={{ margin: "9px auto", display: "block", color: "var(--color-sidebar-text)", opacity: 0.3 }} />
                            </div>
                          </td>

                          {/* Headline + body */}
                          <td style={{ padding: "8px 10px", maxWidth: 220 }}>
                            <p style={{ fontWeight: 600, color: "var(--color-input-text)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {ld.name || metaAd.name}
                            </p>
                            <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
                              {ld.message || "—"}
                            </p>
                          </td>

                          {/* Status badge */}
                          <td style={{ padding: "8px 10px" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              fontSize: "0.7rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                              backgroundColor: isActive ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)",
                              color: isActive ? "#16a34a" : "#92400e",
                            }}>
                              {isActive ? <Play size={9} /> : <Pause size={9} />}
                              {metaAd.status}
                            </span>
                          </td>

                          {/* Toggle */}
                          <td style={{ padding: "8px 10px" }}>
                            <button
                              onClick={() => handleToggle(ad.id, metaAd.id, metaAd.status)}
                              disabled={isToggling}
                              title={isActive ? "Pause ad" : "Activate ad"}
                              style={{
                                background: "none", border: "none", cursor: "pointer",
                                color: isActive ? "#ca8a04" : "#16a34a", padding: 4,
                              }}
                            >
                              {isToggling
                                ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                                : isActive ? <ToggleRight size={22} /> : <ToggleLeft size={22} />
                              }
                            </button>
                          </td>

                          {/* Edit */}
                          <td style={{ padding: "8px 10px" }}>
                            <button
                              onClick={() => openEdit(ad.id, metaAd)}
                              title="Edit headline / body"
                              className="btn--icon"
                            >
                              <Pencil size={14} />
                            </button>
                          </td>

                          {/* Delete */}
                          <td style={{ padding: "8px 10px" }}>
                            <button
                              onClick={() => handleDelete(ad.id, metaAd.id)}
                              disabled={isDeleting}
                              title="Delete this ad"
                              className="btn--icon"
                              style={{ color: "#ef4444" }}
                            >
                              {isDeleting
                                ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                                : <Trash2 size={14} />
                              }
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Schedule suggestions panel */}
            {sched?.data && (
              <div style={{ marginTop: "16px", padding: "16px", borderRadius: "10px", backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.05)", border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <Sparkles size={14} style={{ color: "var(--color-accent)" }} />
                  <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-input-text)" }}>AI Schedule Recommendations</p>
                  <span style={{ fontSize: "0.65rem", padding: "1px 7px", borderRadius: 999, backgroundColor: sched.data.confidence === "high" ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)", color: sched.data.confidence === "high" ? "#15803d" : "#92400e", fontWeight: 700 }}>
                    {sched.data.confidence?.toUpperCase()} confidence
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px", marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Best Days</p>
                    <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>{sched.data.best_days?.join(", ")}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Best Hours</p>
                    <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>{sched.data.best_hours?.join(", ")}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Pause Periods</p>
                    <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>{sched.data.pause_periods?.join(", ")}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Budget Pacing</p>
                    <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>{sched.data.budget_pacing}</p>
                  </div>
                </div>
                {sched.data.headline_tips?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Caption Tips</p>
                    <ul style={{ paddingLeft: 16, margin: 0 }}>
                      {sched.data.headline_tips.map((tip, i) => (
                        <li key={i} style={{ fontSize: "0.8rem", color: "var(--color-input-text)", marginBottom: 2 }}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", fontStyle: "italic" }}>{sched.data.reasoning}</p>
              </div>
            )}
          </SectionCard>
        );
      })}

      {/* Edit creative modal */}
      {editTarget && (
        <div className="ad-preview-overlay" onClick={() => setEditTarget(null)}>
          <div className="ad-preview-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="ad-preview-modal__header">
              <div>
                <h3 className="page-card__title">Edit Ad Creative</h3>
                <p className="page-card__subtitle">{editTarget.metaAd.name}</p>
              </div>
              <button className="btn--icon" onClick={() => setEditTarget(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.25)" }}>
                <p style={{ fontSize: "0.76rem", color: "#92400e" }}>
                  Editing creates a new Meta creative and assigns it to this ad. The original creative is kept on Meta but deactivated on this ad.
                </p>
              </div>
              {[
                { key: "headline", label: "Headline", multiline: false },
                { key: "body",     label: "Caption / Body (include #hashtags here)", multiline: true },
                { key: "link_url", label: "Destination URL", multiline: false },
              ].map(({ key, label, multiline }) => (
                <div key={key}>
                  <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: 5 }}>{label}</label>
                  {multiline ? (
                    <textarea
                      rows={3}
                      style={{ ...inputStyle, resize: "vertical" }}
                      value={editForm[key] || ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, [key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      type="text"
                      style={inputStyle}
                      value={editForm[key] || ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, [key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
              <div>
                <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: 5 }}>CTA Type</label>
                <select
                  style={inputStyle}
                  value={editForm.cta_type || "LEARN_MORE"}
                  onChange={(e) => setEditForm((p) => ({ ...p, cta_type: e.target.value }))}
                >
                  {["LEARN_MORE","SIGN_UP","CONTACT_US","GET_STARTED","APPLY_NOW","BOOK_NOW"].map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                <button
                  onClick={handleEditSave}
                  disabled={editSaving}
                  className="btn--accent"
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  {editSaving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={14} />}
                  {editSaving ? "Saving to Meta…" : "Save Changes"}
                </button>
                <button onClick={() => setEditTarget(null)} className="btn--ghost" style={{ flex: 1 }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Publisher Analytics Sub-component ───────────────────────────────────────
function PublisherAnalytics({ ads }) {
  const [selectedAd,   setSelectedAd]   = useState(null);
  const [datePreset,   setDatePreset]   = useState("last_30d");
  const [insights,     setInsights]     = useState(null);   // { rows: [...] }
  const [syncing,      setSyncing]      = useState(false);
  const [suggestions,  setSuggestions]  = useState(null);
  const [optimizing,   setOptimizing]   = useState(false);

  const activeAd = selectedAd || ads[0] || null;

  useEffect(() => {
    if (activeAd) setInsights(null);
  }, [activeAd?.id]);

  const handleSyncInsights = async () => {
    if (!activeAd) return;
    setSyncing(true);
    try {
      const data = await adsAPI.fetchMetaInsights(activeAd.id, datePreset);
      setInsights(data);
    } catch (err) { alert(err.message); }
    finally { setSyncing(false); }
  };

  const handleOptimize = async () => {
    if (!activeAd) return;
    setOptimizing(true);
    try {
      const result = await analyticsAPI.triggerOptimize(activeAd.id);
      setSuggestions(result);
    } catch (err) { alert(err.message); }
    finally { setOptimizing(false); }
  };

  const handleDecision = async (decision) => {
    if (!activeAd) return;
    try {
      await analyticsAPI.submitDecision(activeAd.id, { decision });
      setSuggestions(null);
      alert(`Decision "${decision}" recorded.`);
    } catch (err) { alert(err.message); }
  };

  // Derived totals from insights rows
  const totals = (insights?.rows || []).reduce(
    (acc, r) => ({
      impressions: acc.impressions + (r.impressions || 0),
      clicks:      acc.clicks      + (r.clicks      || 0),
      spend:       acc.spend       + (r.spend        || 0),
      reach:       acc.reach       + (r.reach        || 0),
      conversions: acc.conversions + (r.conversions  || 0),
    }),
    { impressions: 0, clicks: 0, spend: 0, reach: 0, conversions: 0 }
  );
  const avgCtr  = totals.impressions ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : "–";
  const avgCpm  = totals.impressions ? ((totals.spend / totals.impressions) * 1000).toFixed(2) : "–";

  // KPIs from strategy
  const strategyKpis = (activeAd?.strategy_json?.kpis || []);

  // Map strategy KPI metric names to computed actuals
  const kpiActualMap = {
    "CTR":             avgCtr !== "–" ? `${avgCtr}%` : null,
    "Impressions":     totals.impressions > 0 ? totals.impressions.toLocaleString() : null,
    "Conversions":     totals.conversions > 0 ? totals.conversions.toLocaleString() : null,
    "Spend":           totals.spend > 0 ? `$${totals.spend.toFixed(2)}` : null,
    "CPC":             totals.clicks && totals.spend ? `$${(totals.spend / totals.clicks).toFixed(2)}` : null,
    "Conversion Rate": totals.clicks && totals.conversions ? `${((totals.conversions / totals.clicks) * 100).toFixed(1)}%` : null,
  };

  const chartData = (insights?.rows || []).map((r) => ({
    date:        r.date?.slice(5),   // "MM-DD"
    Impressions: r.impressions || 0,
    Clicks:      r.clicks      || 0,
    Spend:       parseFloat((r.spend || 0).toFixed(2)),
  }));

  const DATE_PRESETS = [
    { value: "last_7d",   label: "Last 7 days" },
    { value: "last_14d",  label: "Last 14 days" },
    { value: "last_30d",  label: "Last 30 days" },
    { value: "last_90d",  label: "Last 90 days" },
  ];

  if (ads.length === 0) {
    return (
      <SectionCard title="Campaign Analytics" subtitle="No published campaigns yet">
        <div className="flex flex-col items-center py-12 gap-3">
          <BarChart3 size={36} style={{ color: "var(--color-sidebar-text)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>Publish a campaign to view analytics here</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Campaign selector + date picker */}
      <SectionCard title="Campaign Analytics" subtitle="Live performance data from Meta · Sync to populate charts">
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {ads.map((ad) => (
              <button
                key={ad.id}
                onClick={() => setSelectedAd(ad)}
                className={activeAd?.id === ad.id ? "filter-tab--active" : "filter-tab"}
                style={{ fontSize: "0.78rem" }}
              >
                {ad.title}
              </button>
            ))}
          </div>
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: "8px", fontSize: "0.8rem", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-input-text)", cursor: "pointer" }}
          >
            {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button
            onClick={handleSyncInsights}
            disabled={syncing || !activeAd?.bot_config?.meta_campaign_id}
            className="btn--inline-action--ghost"
            style={{ fontSize: "0.8rem" }}
          >
            {syncing
              ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
              : <RefreshCw size={12} />}
            Sync from Meta
          </button>
          {!activeAd?.bot_config?.meta_campaign_id && (
            <span style={{ fontSize: "0.72rem", color: "var(--color-muted)" }}>Distribute to Meta first to fetch live data</span>
          )}
        </div>

        {/* KPI summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px", marginBottom: "20px" }}>
          {[
            { label: "Impressions", value: totals.impressions.toLocaleString() || "–" },
            { label: "Clicks",      value: totals.clicks.toLocaleString()       || "–" },
            { label: "CTR",         value: avgCtr !== "–" ? `${avgCtr}%` : "–" },
            { label: "Spend (USD)", value: totals.spend > 0 ? `$${totals.spend.toFixed(2)}` : "–" },
            { label: "Reach",       value: totals.reach > 0 ? totals.reach.toLocaleString() : "–" },
            { label: "CPM",         value: avgCpm !== "–" ? `$${avgCpm}` : "–" },
          ].map(({ label, value }) => (
            <div key={label} style={{ padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
              <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--color-input-text)" }}>{insights ? value : <span style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>sync to view</span>}</p>
            </div>
          ))}
        </div>

        {/* Impressions + Clicks line chart */}
        {chartData.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "8px" }}>
              Impressions &amp; Clicks — Daily
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-card-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-sidebar-text)" }} />
                <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: "var(--color-sidebar-text)" }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--color-sidebar-text)" }} />
                <Tooltip contentStyle={{ backgroundColor: "var(--color-card-bg)", border: "1px solid var(--color-card-border)", borderRadius: 8, fontSize: "0.78rem" }} />
                <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                <Line yAxisId="left"  type="monotone" dataKey="Impressions" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="Clicks"      stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Daily spend bar chart */}
        {chartData.length > 0 && (
          <div style={{ marginBottom: "8px" }}>
            <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "8px" }}>
              Daily Spend (USD)
            </p>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-card-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-sidebar-text)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-sidebar-text)" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--color-card-bg)", border: "1px solid var(--color-card-border)", borderRadius: 8, fontSize: "0.78rem" }}
                  formatter={(v) => [`$${v}`, "Spend"]}
                />
                <Bar dataKey="Spend" fill="rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.7)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {!insights && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-sidebar-text)", fontSize: "0.83rem" }}>
            Click <strong>Sync from Meta</strong> to load live performance data and populate charts.
          </div>
        )}
      </SectionCard>

      {/* Strategy KPIs — Target vs Achieved */}
      {strategyKpis.length > 0 && (
        <SectionCard
          title="Strategy KPI Targets vs Achieved"
          subtitle="Targets set during strategy creation · Actuals from Meta data (sync required)"
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
            {strategyKpis.map((kpi, i) => {
              const achieved = kpiActualMap[kpi.metric] || null;
              return (
                <div key={i} style={{ padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--color-input-text)" }}>{kpi.metric}</p>
                    <span style={{ fontSize: "0.62rem", padding: "1px 7px", borderRadius: 999, backgroundColor: achieved ? "rgba(34,197,94,0.1)" : "rgba(107,114,128,0.1)", color: achieved ? "#15803d" : "var(--color-muted)", fontWeight: 600 }}>
                      {achieved ? "TRACKED" : "PENDING SYNC"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <div>
                      <p style={{ fontSize: "0.62rem", fontWeight: 600, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Target</p>
                      <p style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-accent)" }}>{kpi.target}</p>
                    </div>
                    <div style={{ borderLeft: "1px solid var(--color-card-border)", paddingLeft: 12 }}>
                      <p style={{ fontSize: "0.62rem", fontWeight: 600, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Achieved</p>
                      <p style={{ fontSize: "1rem", fontWeight: 700, color: achieved ? "var(--color-input-text)" : "var(--color-muted)" }}>
                        {achieved || "–"}
                      </p>
                    </div>
                  </div>
                  {kpi.context && (
                    <p style={{ fontSize: "0.68rem", color: "var(--color-sidebar-text)", marginTop: 6, fontStyle: "italic" }}>{kpi.context}</p>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Optimizer */}
      <SectionCard title="AI Optimizer" subtitle="Get suggestions to improve underperforming campaigns">
        <div className="pub-campaign-row" style={{ marginBottom: suggestions ? 16 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="pub-campaign-row__dot--live" />
            <div>
              <p className="table-row__title">{activeAd?.title}</p>
              <p className="table-row__meta">{typeLabel(activeAd)}</p>
            </div>
          </div>
          <button onClick={handleOptimize} disabled={optimizing} className="btn--optimize">
            {optimizing
              ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
              : <Sparkles size={12} />}
            {optimizing ? "Analyzing…" : "Optimize"}
          </button>
        </div>

        {suggestions && (
          <>
            <div className="code-preview--highlight mb-4">
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.78rem" }}>
                {JSON.stringify(suggestions.suggestions, null, 2)}
              </pre>
            </div>
            <div className="flex gap-3">
              <button onClick={() => handleDecision("accepted")} className="btn--approve">
                <CheckCircle size={14} /> Accept &amp; Redeploy
              </button>
              <button onClick={() => handleDecision("partial")} className="btn--revise">Partial Accept</button>
              <button onClick={() => handleDecision("rejected")} className="btn--ghost flex-1 py-2.5">Reject</button>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
