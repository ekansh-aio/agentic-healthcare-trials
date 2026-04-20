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
import { adsAPI, analyticsAPI, platformConnectionsAPI, surveyAPI } from "../../services/api";
import {
  Send, Globe, Image, BarChart3, Sparkles, Copy, Server,
  CheckCircle, Rocket, ChevronDown, ChevronUp, Zap, X, ImageOff,
  Share2, UploadCloud, ExternalLink, Download, Eye, AlertCircle,
  CheckCircle2, Loader2, Mic, PhoneCall, PhoneOff, Volume2, Radio, MessageSquare,
  Link2, Link2Off, Settings, RefreshCw, ChevronDown as ChevDown, SlidersHorizontal,
  ToggleLeft, ToggleRight, Trash2, Pencil, TrendingUp, Target, Clock, Calendar,
  Play, Pause, ChevronRight, Info, Plus,
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

// ─── Social distribution platform definitions ────────────────────────────────
// Only Meta/Instagram is active. Other platforms are shown as "Coming soon".
// Credentials (access_token, ad_account_id, page_id) come from the stored
// PlatformConnection — they are no longer entered per-publish.
// Common currencies for Meta ad accounts
const CURRENCIES = [
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "NZD", label: "NZD — New Zealand Dollar" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
  { code: "HKD", label: "HKD — Hong Kong Dollar" },
  { code: "CHF", label: "CHF — Swiss Franc" },
  { code: "SEK", label: "SEK — Swedish Krona" },
  { code: "NOK", label: "NOK — Norwegian Krone" },
  { code: "DKK", label: "DKK — Danish Krone" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "BRL", label: "BRL — Brazilian Real" },
  { code: "MXN", label: "MXN — Mexican Peso" },
  { code: "ZAR", label: "ZAR — South African Rand" },
];

// Top countries with ISO codes for Meta targeting
const COUNTRY_LIST = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "CH", name: "Switzerland" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "PL", name: "Poland" },
  { code: "FI", name: "Finland" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "JP", name: "Japan" },
  { code: "IN", name: "India" },
  { code: "ZA", name: "South Africa" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "MY", name: "Malaysia" },
  { code: "PH", name: "Philippines" },
];

const SOCIAL_PLATFORMS = {
  "Meta/Instagram": {
    id: "meta",
    active: true,
    usesOAuth: true,   // credentials come from Platform Settings, not typed in here
    fields: [
      { key: "destination_url", label: "Destination URL", type: "text", placeholder: "https://…", required: true },
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
  { key: "deploy",     label: "Publish Website", icon: Rocket },
  { key: "distribute", label: "Upload Ads",      icon: Share2 },
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
  const autoExpandDone = useRef(false);

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

  // Optimizer state — lifted here so results persist across tab switches
  const [optimizerSuggestions,   setOptimizerSuggestions]   = useState(null);
  const [optimizerRunning,       setOptimizerRunning]       = useState(false);
  const [optimizerStep,          setOptimizerStep]          = useState(0);

  const activeTab = PATH_TO_TAB[location.pathname] || "overview";

  useEffect(() => {
    adsAPI.list().then((data) => {
      setAds(data);
      // Auto-expand the most recent campaign in Overview (runs once)
      if (!autoExpandDone.current && data.length > 0) {
        autoExpandDone.current = true;
        const first = data.find((a) => a.status === "approved" || a.status === "published");
        if (first) setExpandedId(first.id);
      }
    }).catch(console.error).finally(() => setLoading(false));
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
      const ad = ads.find((a) => a.id === adId);
      const fk = `${adId}_${platformId}`;
      setDistForms((p) => {
        const existing = p[fk] || {};
        const seeds = {};

        // Seed destination_url from hosted landing page
        if (!existing.destination_url && ad?.hosted_url) {
          seeds.destination_url = ad.hosted_url;
        }

        // AI-suggested daily budget: use strategy daily budget, or spread total over 30 days
        if (!existing.daily_budget) {
          const stratBudget =
            ad?.strategy_json?.daily_budget_usd ||
            ad?.strategy_json?.daily_budget ||
            ad?.strategy_json?.recommended_daily_budget;
          const suggested = stratBudget
            ? parseFloat(stratBudget)
            : ad?.budget
              ? Math.max(5, Math.round((parseFloat(ad.budget) / 30) * 100) / 100)
              : 10;
          seeds.daily_budget           = suggested.toFixed(2);
          seeds._budget_ai_suggested   = true;
        }

        // Default target countries
        if (!existing.targeting_countries) {
          seeds.targeting_countries = "AU,IN,US";
        }

        // Default currency
        if (!existing.currency) {
          seeds.currency = "USD";
        }

        // Default browser add-on to None; user can switch to WhatsApp/Phone manually
        if (!existing.addon_type) {
          seeds.addon_type          = "";
          seeds._addon_ai_suggested = false;
        }

        return Object.keys(seeds).length
          ? { ...p, [fk]: { ...existing, ...seeds } }
          : p;
      });
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
          <p className="page-header__subtitle">Launch campaigns, publish your website, and upload ads to social platforms</p>
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
          hostingId={hostingId}
          hostError={hostError}
          onHost={handleHostPage}
          onAdUpdated={(updated) => setAds((p) => p.map((a) => (a.id === updated.id ? updated : a)))}
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
      {activeTab === "analytics" && (
        <PublisherAnalytics
          ads={published}
          suggestions={optimizerSuggestions}
          setSuggestions={setOptimizerSuggestions}
          optimizing={optimizerRunning}
          setOptimizing={setOptimizerRunning}
          optimizerStep={optimizerStep}
          setOptimizerStep={setOptimizerStep}
        />
      )}

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
        ? `Agent ID: ${ad.bot_config.elevenlabs_agent_id}`
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
      await adsAPI.requestVoiceCall(ad.id, { phone_number: phone, action: "call_now" });
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
      ws.onerror = () => { stopCall(); setCallError("Connection failed — check that the agent is provisioned and try again."); };
      ws.onclose = (evt) => {
        if (!closingRef.current) { cleanupCall(); setCallStatus("idle"); if (evt.code !== 1000) setCallError(`Session closed (code ${evt.code}).`); }
        closingRef.current = false;
      };
    } catch (err) {
      cleanupCall(); setCallStatus("idle");
      if (err.message?.includes("No ElevenLabs agent provisioned") || err.message?.includes("No voice agent provisioned")) {
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
    if (!window.confirm("Delete the voice agent for this campaign?")) return;
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
        <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Voice Agent</span>
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
          <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-muted)", display: "block", marginBottom: 4 }}>Voice</label>
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
              The agent will call this number via our outbound calling service.
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
function DeployTab({ ads, hostingId, hostError, onHost }) {
  const deployable = ads.filter(
    (a) => (a.status === "approved" || a.status === "published") && hasType(a, "website")
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
        <SectionCard title="Upload Ad Creatives" subtitle="No ad campaigns ready to upload yet">
          <div className="flex flex-col items-center py-12 gap-3">
            <Share2 size={36} style={{ color: "var(--color-sidebar-text)", opacity: 0.4 }} />
            <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
              Generate ad creatives for an approved campaign to upload them here
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
                Upload to
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

// ─── Country Picker ───────────────────────────────────────────────────────────
function CountryPicker({ value, onChange }) {
  // value: comma-separated ISO codes string e.g. "US,GB,CA"
  const [query, setQuery] = useState("");
  const [open,  setOpen]  = useState(false);
  const ref = useRef(null);

  const selected = value
    ? value.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
    : [];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (code) => {
    const next = selected.includes(code)
      ? selected.filter((c) => c !== code)
      : [...selected, code];
    onChange(next.join(","));
    setQuery("");
  };

  const filtered = COUNTRY_LIST.filter(
    (c) =>
      !selected.includes(c.code) &&
      (c.name.toLowerCase().includes(query.toLowerCase()) || c.code.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Selected chips */}
      <div
        onClick={() => setOpen(true)}
        style={{
          minHeight: "38px", padding: "4px 8px", borderRadius: "8px", cursor: "text",
          border: `1px solid ${open ? "var(--color-accent)" : "var(--color-card-border)"}`,
          backgroundColor: "var(--color-input-bg)",
          display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center",
        }}
      >
        {selected.map((code) => {
          const country = COUNTRY_LIST.find((c) => c.code === code);
          return (
            <span key={code} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px 2px 10px",
              borderRadius: 999, backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
              border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)",
              color: "var(--color-accent)",
            }}>
              {code} {country ? `· ${country.name}` : ""}
              <button
                onClick={(e) => { e.stopPropagation(); toggle(code); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "var(--color-accent)", fontSize: "0.8rem", marginLeft: 2 }}
              >×</button>
            </span>
          );
        })}
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? "Search countries…" : "Add country…"}
          style={{
            border: "none", outline: "none", background: "transparent",
            fontSize: "0.8rem", color: "var(--color-input-text)", minWidth: 120, flex: 1,
            fontFamily: "inherit",
          }}
        />
        {selected.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", padding: "0 2px", fontSize: "0.72rem" }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
          maxHeight: 220, overflowY: "auto", borderRadius: 10,
          border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        }}>
          {filtered.slice(0, 20).map((c) => (
            <button
              key={c.code}
              onMouseDown={(e) => { e.preventDefault(); toggle(c.code); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 14px", border: "none", background: "none", cursor: "pointer",
                fontSize: "0.8rem", color: "var(--color-input-text)", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-page-bg)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <strong style={{ marginRight: 6 }}>{c.code}</strong>{c.name}
            </button>
          ))}
        </div>
      )}
    </div>
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
        All settings below are sent directly to Meta's Marketing API — no manual setup in Ads Manager needed. Ads go <strong>ACTIVE</strong> immediately and can be paused from the Manage Ads tab.
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

      {/* Per-campaign fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>

        {/* Destination URL (generic field loop — only destination_url remains) */}
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

        {/* Daily Budget — custom row with currency + per-creative split */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Daily Budget{requiredPill}</label>
            {formData._budget_ai_suggested && (
              <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "1px 6px", borderRadius: 999, backgroundColor: "rgba(99,102,241,0.1)", color: "rgba(99,102,241,0.9)", border: "1px solid rgba(99,102,241,0.2)" }}>
                AI suggested
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            {/* Amount input */}
            <div style={{ position: "relative", flex: 1 }}>
              <input
                type="number"
                min="1"
                step="0.01"
                style={{ ...inputStyle, paddingRight: 8 }}
                placeholder="10.00"
                value={formData.daily_budget || ""}
                onChange={(e) => onChange("daily_budget", e.target.value)}
                onFocus={() => onChange("_budget_ai_suggested", false)}
              />
            </div>
            {/* Currency selector */}
            <select
              value={formData.currency || "USD"}
              onChange={(e) => onChange("currency", e.target.value)}
              style={{
                padding: "8px 10px", borderRadius: "8px", fontSize: "0.8rem",
                border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
                color: "var(--color-input-text)", cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </div>
          {/* Per-creative split */}
          {(() => {
            const budget = parseFloat(formData.daily_budget);
            const numSelected = formData.selected_creatives?.length || 0;
            const numCreatives = numSelected > 0 ? numSelected : Math.min(1, creatives.length);
            const currency = formData.currency || "USD";
            if (!isNaN(budget) && budget > 0 && numCreatives > 0) {
              const perCreative = (budget / numCreatives).toFixed(2);
              return (
                <p style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)", marginTop: 5 }}>
                  {currency} {budget.toFixed(2)} shared across {numCreatives} ad{numCreatives !== 1 ? "s" : ""} ≈ <strong>{currency} {perCreative}/day per ad</strong>
                  {" "}<span style={{ color: "var(--color-muted)" }}>(Meta distributes from the ad set budget)</span>
                </p>
              );
            }
            return null;
          })()}
        </div>

        {/* Target Countries — chip picker */}
        <div>
          <label style={labelStyle}>Target Countries</label>
          <CountryPicker
            value={formData.targeting_countries || ""}
            onChange={(val) => onChange("targeting_countries", val)}
          />
        </div>

        {/* Browser Add-on — dropdown, AI-seeded from campaign data */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Browser Add-on</label>
            {formData._addon_ai_suggested && formData.addon_type && (
              <span style={{ fontSize: "0.6rem", fontWeight: 700, padding: "1px 6px", borderRadius: 999, backgroundColor: "rgba(99,102,241,0.1)", color: "rgba(99,102,241,0.9)", border: "1px solid rgba(99,102,241,0.2)" }}>
                AI suggested
              </span>
            )}
          </div>
          <select
            value={formData.addon_type || ""}
            onChange={(e) => { onChange("addon_type", e.target.value); onChange("_addon_ai_suggested", false); }}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="">None — standard CTA button</option>
            <option value="whatsapp">WhatsApp — open chat when clicked</option>
            <option value="phone">Phone call — routes to voicebot</option>
          </select>
          {formData.addon_type === "whatsapp" && (
            <div style={{ marginTop: 8 }}>
              <label style={labelStyle}>WhatsApp Number{requiredPill}</label>
              <input
                type="tel"
                style={inputStyle}
                placeholder="+61 400 000 000"
                value={formData.addon_phone || ""}
                onChange={(e) => onChange("addon_phone", e.target.value)}
              />
            </div>
          )}
        </div>

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
              Campaign created on Meta — ads are ACTIVE and serving
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

function aspectRatioForFormat(format = "") {
  const f = format.toLowerCase();
  if (f.includes("16:9") || f.includes("banner")) return "16/9";
  if (f.includes("1:1") || f.includes("square"))  return "1/1";
  if (f.includes("9:16") || f.includes("story"))  return "9/16";
  if (f.includes("4:5"))                           return "4/5";
  return "16/9";
}

// ─── Manage Ads Tab ───────────────────────────────────────────────────────────
const DAY_OPTIONS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

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
  const [pauseTarget,    setPauseTarget]    = useState(null); // adId whose pause modal is open
  // windows: array of { id, days:[], timeFrom, timeTo }
  const [pauseWindows,   setPauseWindows]   = useState([]);
  const [pauseSaving,    setPauseSaving]    = useState(false);
  const [savedSchedules, setSavedSchedules] = useState({}); // { adId: windows[] } — local cache after save

  const loadMetaAds = async (adId) => {
    setMetaAds((p) => ({ ...p, [adId]: { loading: true, ads: [], error: null } }));
    try {
      const data = await adsAPI.listMetaAds(adId);
      setMetaAds((p) => ({ ...p, [adId]: { loading: false, ads: data.ads || [], error: null } }));
    } catch (err) {
      setMetaAds((p) => ({ ...p, [adId]: { loading: false, ads: [], error: err.message } }));
    }
  };

  // Auto-load ads for the most recent campaign on mount
  useEffect(() => {
    if (metaCampaigns.length > 0) loadMetaAds(metaCampaigns[0].id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      cta_type:   ld.call_to_action?.type || "BOOK_NOW",
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

  // Returns array of window objects for an ad
  const getWindowsForAd = (adId) => {
    if (savedSchedules[adId] !== undefined) return savedSchedules[adId];
    const ad = metaCampaigns.find((a) => a.id === adId);
    const existing = ad?.bot_config?.pause_schedule;
    if (!existing) return [];
    // Handle legacy single-object format
    if (Array.isArray(existing)) return existing;
    // Convert old single format to array
    return [{
      id: "legacy",
      days: existing.pause_days || [],
      timeFrom: (existing.pause_hours || "00:00-23:59").split("-")[0],
      timeTo:   (existing.pause_hours || "00:00-23:59").split("-")[1],
    }];
  };

  const openPauseModal = (adId) => {
    const existing = getWindowsForAd(adId);
    setPauseWindows(existing.map((w, i) => ({ ...w, id: w.id || String(i) })));
    setPauseTarget(adId);
  };

  const addWindow = () => {
    const id = Date.now().toString();
    setPauseWindows((p) => [...p, { id, days: [], timeFrom: "00:00", timeTo: "23:59" }]);
  };

  const removeWindow = (id) => {
    setPauseWindows((p) => p.filter((w) => w.id !== id));
  };

  const updateWindow = (id, field, value) => {
    setPauseWindows((p) => p.map((w) => w.id === id ? { ...w, [field]: value } : w));
  };

  const toggleWindowDay = (id, day) => {
    setPauseWindows((p) => p.map((w) =>
      w.id === id ? { ...w, days: w.days.includes(day) ? w.days.filter((d) => d !== day) : [...w.days, day] } : w
    ));
  };

  const handlePauseSave = async () => {
    if (!pauseTarget) return;
    const invalid = pauseWindows.filter((w) => w.days.length === 0);
    if (invalid.length > 0) { alert("Each window must have at least one day selected."); return; }
    setPauseSaving(true);
    try {
      await adsAPI.updateBotConfig(pauseTarget, { pause_schedule: pauseWindows });
      setSavedSchedules((p) => ({ ...p, [pauseTarget]: pauseWindows }));
      setPauseTarget(null);
    } catch (err) { alert(err.message); }
    finally { setPauseSaving(false); }
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
            Upload a campaign to Meta from the Upload Ads tab to manage its ads here.
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
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
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
              <button
                className="btn--inline-action--ghost"
                onClick={() => openPauseModal(ad.id)}
                style={{ borderColor: "#f59e0b44", color: "#f59e0b" }}
              >
                <Pause size={12} /> Schedule Pause
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

            {/* Active pause schedule windows */}
            {(() => {
              const windows = getWindowsForAd(ad.id);
              if (!windows.length) return null;
              return (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#b45309", display: "flex", alignItems: "center", gap: 5 }}>
                      <Pause size={11} style={{ color: "#f59e0b" }} /> {windows.length} pause window{windows.length !== 1 ? "s" : ""} active
                    </span>
                    <button onClick={() => openPauseModal(ad.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#b45309", fontSize: "0.72rem", fontWeight: 700, padding: 0 }}>Edit</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {windows.map((w, i) => (
                      <div key={w.id || i} style={{
                        padding: "6px 12px", borderRadius: 7,
                        backgroundColor: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.22)",
                        display: "flex", gap: 8, alignItems: "center",
                      }}>
                        <Clock size={10} style={{ color: "#f59e0b", flexShrink: 0 }} />
                        <span style={{ fontSize: "0.75rem", color: "#92400e" }}>
                          Every <strong>{w.days.join(", ")}</strong> · {w.timeFrom}–{w.timeTo}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

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

      {/* Schedule Pause modal */}
      {pauseTarget && (
        <div className="ad-preview-overlay" onClick={() => setPauseTarget(null)}>
          <div className="ad-preview-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="ad-preview-modal__header">
              <div>
                <h3 className="page-card__title">Schedule Pause Windows</h3>
                <p className="page-card__subtitle">Add independent recurring windows — each pauses and resumes automatically</p>
              </div>
              <button className="btn--icon" onClick={() => setPauseTarget(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", maxHeight: "70vh", overflowY: "auto" }}>
              {pauseWindows.length === 0 && (
                <p style={{ fontSize: "0.8rem", color: "var(--color-sidebar-text)", textAlign: "center", padding: "16px 0" }}>
                  No windows yet — click <strong>Add Window</strong> below to create one.
                </p>
              )}
              {pauseWindows.map((win, idx) => (
                <div key={win.id} style={{ border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: "14px", backgroundColor: "rgba(245,158,11,0.04)", display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Window header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Window {idx + 1}
                    </span>
                    <button
                      onClick={() => removeWindow(win.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 2, display: "flex", alignItems: "center" }}
                      title="Remove this window"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {/* Day toggles */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {DAY_OPTIONS.map((day) => {
                      const active = win.days.includes(day);
                      return (
                        <button
                          key={day}
                          onClick={() => toggleWindowDay(win.id, day)}
                          style={{
                            fontSize: "0.72rem", fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                            cursor: "pointer", transition: "all 0.15s",
                            backgroundColor: active ? "#f59e0b" : "rgba(245,158,11,0.08)",
                            color: active ? "#fff" : "#b45309",
                            border: `1px solid ${active ? "#f59e0b" : "rgba(245,158,11,0.3)"}`,
                          }}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                  {/* Time range */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: 4 }}>Pause from</label>
                      <input
                        type="time"
                        style={{ ...inputStyle }}
                        value={win.timeFrom}
                        onChange={(e) => updateWindow(win.id, "timeFrom", e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: 4 }}>Resume at</label>
                      <input
                        type="time"
                        style={{ ...inputStyle }}
                        value={win.timeTo}
                        onChange={(e) => updateWindow(win.id, "timeTo", e.target.value)}
                      />
                    </div>
                  </div>
                  {/* Per-window preview */}
                  {win.days.length > 0 && (
                    <div style={{ padding: "8px 12px", borderRadius: 7, backgroundColor: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", gap: 7, alignItems: "center" }}>
                      <Clock size={11} style={{ color: "#f59e0b", flexShrink: 0 }} />
                      <p style={{ fontSize: "0.75rem", color: "#92400e", margin: 0 }}>
                        Every <strong>{win.days.map((d) => d.slice(0, 3)).join(", ")}</strong> · {win.timeFrom} → {win.timeTo}
                      </p>
                    </div>
                  )}
                </div>
              ))}
              {/* Add window button */}
              <button
                onClick={addWindow}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 8, border: "1.5px dashed rgba(245,158,11,0.5)", background: "none", cursor: "pointer", color: "#b45309", fontSize: "0.8rem", fontWeight: 600 }}
              >
                <Plus size={14} /> Add Window
              </button>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", gap: "10px" }}>
              <button
                onClick={handlePauseSave}
                disabled={pauseSaving}
                className="btn--accent"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                {pauseSaving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Pause size={14} />}
                {pauseSaving ? "Saving…" : "Save Schedule"}
              </button>
              <button onClick={() => setPauseTarget(null)} className="btn--ghost" style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

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
                  value={editForm.cta_type || "BOOK_NOW"}
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

// ─── Optimizer Result ─────────────────────────────────────────────────────────

const ACTION_META = {
  set_today_budget:   { label: "Set Today's Budget",    color: "#22c55e", Icon: TrendingUp },
  schedule_pause:     { label: "Schedule Pause",        color: "#f59e0b", Icon: Pause },
  edit_caption:       { label: "Apply Caption",         color: "#6366f1", Icon: Globe },
  edit_content:       { label: "Update Content",        color: "#6366f1", Icon: Globe },
  switch_voice:       { label: "Switch Voice",          color: "#8b5cf6", Icon: Mic },
  edit_ad_caption:    { label: "Apply Caption",         color: "#f59e0b", Icon: Image },
  edit_ad_hashtags:   { label: "Apply Hashtags",        color: "#f59e0b", Icon: Image },
  regenerate_creative:{ label: "Regenerate Creative",   color: "#f59e0b", Icon: Image },
  informational:      { label: "Noted",                 color: "#6b7280", Icon: CheckCircle2 },
};

const ACTION_VIEW_PATH = {
  set_today_budget:    "/publisher/manage",
  schedule_pause:      "/publisher/manage",
  edit_caption:        "/publisher/deploy",
  edit_content:        "/publisher/deploy",
  edit_ad_caption:     "/publisher/distribute",
  edit_ad_hashtags:    "/publisher/distribute",
  regenerate_creative: "/publisher/distribute",
  switch_voice:        "/publisher",
};

/**
 * Execute a single optimizer action against the API.
 * Extracted so the auto-apply path (no UI) can call the same logic.
 * Returns void; throws on failure.
 */
async function applyOptimizerAction(actionType, actionValue, adId) {
  if (actionType === "set_today_budget") {
    const newBudget = parseFloat(actionValue);
    if (!isNaN(newBudget)) await adsAPI.updateMetaBudget(adId, newBudget);

  } else if (actionType === "schedule_pause") {
    const v = actionValue || {};
    await adsAPI.updateBotConfig(adId, {
      pause_schedule: {
        label:       v.pause_label || "Low-CTR window",
        pause_days:  v.pause_days  || [],
        pause_hours: v.pause_hours || null,
      },
    });

  } else if (actionType === "edit_caption") {
    await adsAPI.minorEditStrategy(adId, { field: "caption",      new_value: actionValue || "", old_value: "" });

  } else if (actionType === "edit_content") {
    await adsAPI.minorEditStrategy(adId, { field: "content_note", new_value: actionValue || "", old_value: "" });
    await adsAPI.generateWebsite(adId);

  } else if (actionType === "switch_voice") {
    await adsAPI.updateBotConfig(adId, { voice_id: actionValue });

  } else if (actionType === "edit_ad_caption") {
    await adsAPI.minorEditStrategy(adId, { field: "ad_caption",   new_value: actionValue || "", old_value: "" });

  } else if (actionType === "edit_ad_hashtags") {
    const tags = Array.isArray(actionValue)
      ? actionValue
      : (actionValue || "").split(/\s+/).filter(Boolean);
    await adsAPI.minorEditStrategy(adId, { field: "hashtags", new_value: tags.join(" "), old_value: "" });

  } else if (actionType === "regenerate_creative") {
    await adsAPI.generateCreatives(adId);
  }
}

function OptimizationItemCard({ item, globalIndex, adId, onApplied }) {
  const navigate   = useNavigate();
  const [applying, setApplying] = useState(false);
  const [applied,  setApplied]  = useState(false);
  const [error,    setError]    = useState(null);

  const actionType = item.action_type || "informational";
  const meta       = ACTION_META[actionType] || ACTION_META.informational;
  const num        = String(globalIndex + 1).padStart(2, "0");
  const viewPath   = ACTION_VIEW_PATH[actionType] || null;

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    try {
      await applyOptimizerAction(actionType, item.action_value, adId);
      setApplied(true);
      onApplied?.();
    } catch (err) {
      setError(err.message || "Failed to apply.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={{
      borderRadius: 12,
      border: `1px solid ${applied ? meta.color + "40" : "var(--color-card-border)"}`,
      borderLeft: `3px solid ${applied ? meta.color : "var(--color-card-border)"}`,
      backgroundColor: applied ? `${meta.color}06` : "var(--color-card-bg)",
      overflow: "hidden",
      transition: "all 0.2s",
      opacity: applied ? 0.75 : 1,
    }}>
      {/* Header row */}
      <div style={{ padding: "12px 14px 10px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{
          fontSize: "0.62rem", fontWeight: 800, color: "#fff",
          background: applied ? meta.color : "var(--color-muted)", borderRadius: 5,
          padding: "2px 6px", flexShrink: 0, marginTop: 3, letterSpacing: "0.02em",
        }}>{num}</span>
        <p style={{ fontSize: "0.86rem", fontWeight: 700, color: "var(--color-input-text)", lineHeight: 1.45, flex: 1 }}>
          {item.what}
        </p>
      </div>

      {/* Why box */}
      <div style={{
        margin: "0 12px 10px", padding: "8px 12px",
        backgroundColor: "var(--color-page-bg)", borderRadius: 8,
        display: "flex", gap: 7, alignItems: "flex-start",
      }}>
        <Target size={11} style={{ color: "var(--color-sidebar-text)", flexShrink: 0, marginTop: 3 }} />
        <p style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)", lineHeight: 1.55 }}>
          {item.why}
        </p>
      </div>

      {/* Schedule preview — only for schedule_pause */}
      {actionType === "schedule_pause" && item.action_value && (
        <div style={{
          margin: "0 12px 10px", padding: "8px 12px", borderRadius: 8,
          backgroundColor: `${meta.color}08`, border: `1px solid ${meta.color}25`,
          display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        }}>
          <Clock size={11} style={{ color: meta.color, flexShrink: 0 }} />
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: meta.color }}>
            {item.action_value.pause_label}
          </span>
          {item.action_value.pause_hours && (
            <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
              {item.action_value.pause_hours}
            </span>
          )}
          <span style={{ fontSize: "0.68rem", color: "var(--color-sidebar-text)", marginLeft: "auto" }}>
            auto-pauses &amp; resumes on schedule
          </span>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: "0 12px 10px", display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
        {/* Action type badge */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: "0.66rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999,
          backgroundColor: `${meta.color}14`, color: meta.color, border: `1px solid ${meta.color}30`,
        }}>
          <meta.Icon size={9} />
          {meta.label}
        </span>

        {applied ? (
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.72rem", fontWeight: 600, color: meta.color }}>
              <CheckCircle2 size={12} /> Applied
            </span>
            {viewPath && (
              <button
                onClick={() => navigate(viewPath)}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontSize: "0.72rem", fontWeight: 600, padding: "3px 10px", borderRadius: 7,
                  cursor: "pointer", border: `1px solid ${meta.color}40`,
                  backgroundColor: `${meta.color}0e`, color: meta.color,
                  transition: "all 0.15s",
                }}
              >
                <ExternalLink size={10} /> View Changes
              </button>
            )}
          </span>
        ) : (
          <button
            onClick={handleApply}
            disabled={applying}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: "0.75rem", fontWeight: 700, padding: "5px 14px", borderRadius: 8,
              cursor: applying ? "not-allowed" : "pointer",
              border: `1px solid ${meta.color}50`,
              backgroundColor: `${meta.color}12`, color: meta.color,
              opacity: applying ? 0.6 : 1, transition: "all 0.15s",
            }}
          >
            {applying
              ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
              : <meta.Icon size={11} />}
            {applying ? "Applying…" : "Apply"}
          </button>
        )}
      </div>

      {error && (
        <p style={{ padding: "0 14px 10px", fontSize: "0.72rem", color: "#ef4444", display: "flex", gap: 4, alignItems: "center" }}>
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  );
}

function OptimizerResult({ data, adId }) {
  const [activeSection, setActiveSection] = useState(null);

  if (!data) return null;

  // Recover from raw_response fallback
  let resolved = data;
  if (data.raw_response && !data.cost_optimization && !data.website_optimization) {
    try {
      const raw = data.raw_response;
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch {
        const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
        if (start !== -1 && end > start) parsed = JSON.parse(raw.slice(start, end + 1));
      }
      if (parsed?.cost_optimization || parsed?.website_optimization || parsed?.bot_optimization || parsed?.advertisement_optimization) {
        resolved = parsed;
      }
    } catch { /* fall through */ }
  }

  if (!resolved.cost_optimization && !resolved.website_optimization && !resolved.bot_optimization && !resolved.advertisement_optimization) {
    return (
      <div style={{ padding: "20px", textAlign: "center", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
        <AlertCircle size={24} style={{ color: "var(--color-muted)", margin: "0 auto 8px" }} />
        <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)", marginBottom: 4 }}>Unable to parse optimizer response</p>
        <p style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)" }}>Try re-running the optimizer.</p>
      </div>
    );
  }

  const {
    cost_optimization          = {},
    website_optimization       = [],
    bot_optimization           = [],
    advertisement_optimization = [],
  } = resolved;

  const costItems  = cost_optimization.items || [];
  const costAssess = cost_optimization.overall_assessment;

  const SECTIONS = [
    {
      key:    "cost",
      label:  "Cost & Schedule",
      icon:   TrendingUp,
      accent: "#22c55e",
      items:  costItems.map(i => ({ ...i, action_type: i.action_type || "set_today_budget" })),
    },
    {
      key:    "website",
      label:  "Website",
      icon:   Globe,
      accent: "#6366f1",
      items:  website_optimization.map(i => ({ ...i, action_type: i.action_type || "edit_caption" })),
    },
    {
      key:    "bot",
      label:  "Voice Bot",
      icon:   Mic,
      accent: "#8b5cf6",
      items:  bot_optimization.map(i => ({ ...i, action_type: i.action_type || "switch_voice" })),
    },
    {
      key:    "ads",
      label:  "Ad Creative",
      icon:   Image,
      accent: "#f59e0b",
      items:  advertisement_optimization.map(i => ({ ...i, action_type: i.action_type || "edit_ad_caption" })),
    },
  ].filter(s => s.items.length > 0);

  const totalItems = SECTIONS.reduce((n, s) => n + s.items.length, 0);
  const openSection = SECTIONS.find(s => s.key === activeSection);

  return (
    <div>
      {/* Overall assessment banner */}
      {costAssess && (
        <div style={{ padding: "10px 14px", borderRadius: 10, backgroundColor: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)", display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 16 }}>
          <TrendingUp size={13} style={{ color: "#22c55e", flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: "0.78rem", color: "var(--color-input-text)", lineHeight: 1.6 }}>{costAssess}</p>
        </div>
      )}

      {totalItems === 0 && (
        <p style={{ textAlign: "center", padding: "28px 0", color: "var(--color-sidebar-text)", fontSize: "0.82rem" }}>No suggestions generated for this period.</p>
      )}

      {/* Category pill cards */}
      {SECTIONS.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          {SECTIONS.map((section) => {
            const SIcon = section.icon;
            const isActive = activeSection === section.key;
            return (
              <button
                key={section.key}
                onClick={() => setActiveSection(isActive ? null : section.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 16px", borderRadius: 10, cursor: "pointer",
                  border: `1.5px solid ${isActive ? section.accent : `${section.accent}35`}`,
                  backgroundColor: isActive ? `${section.accent}15` : `${section.accent}07`,
                  transition: "all 0.15s",
                  outline: "none",
                  minWidth: 130,
                }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: `${section.accent}20`,
                }}>
                  <SIcon size={14} style={{ color: section.accent }} />
                </div>
                <div style={{ textAlign: "left" }}>
                  <p style={{ fontSize: "0.78rem", fontWeight: 700, color: isActive ? section.accent : "var(--color-input-text)", margin: 0 }}>
                    {section.label}
                  </p>
                  <p style={{ fontSize: "0.68rem", color: "var(--color-sidebar-text)", margin: 0 }}>
                    {section.items.length} suggestion{section.items.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <ChevronDown
                  size={14}
                  style={{
                    color: section.accent, marginLeft: "auto",
                    transform: isActive ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                  }}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Expanded section dropdown */}
      {openSection && (
        <div style={{
          border: `1.5px solid ${openSection.accent}30`,
          borderRadius: 12,
          backgroundColor: `${openSection.accent}05`,
          overflow: "hidden",
          marginBottom: 4,
        }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${openSection.accent}20`, display: "flex", alignItems: "center", gap: 8 }}>
            <openSection.icon size={13} style={{ color: openSection.accent }} />
            <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: openSection.accent, margin: 0 }}>
              {openSection.label}
            </p>
            <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--color-sidebar-text)" }}>
              {openSection.items.length} suggestion{openSection.items.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {openSection.items.map((item, i) => (
              <OptimizationItemCard key={i} item={item} globalIndex={i} adId={adId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Publisher Analytics Sub-component ───────────────────────────────────────
const OPTIMIZER_STEPS = [
  { label: "Fetching performance data" },
  { label: "Analyzing cost efficiency" },
  { label: "Reviewing content signals" },
  { label: "Identifying traffic windows" },
  { label: "Generating recommendations" },
];

function PublisherAnalytics({ ads, suggestions, setSuggestions, optimizing, setOptimizing, optimizerStep, setOptimizerStep }) {
  const [selectedAd,    setSelectedAd]    = useState(null);
  const [datePreset,    setDatePreset]    = useState("last_30d");
  const [insights,      setInsights]      = useState(null);   // { rows: [...] }
  const [syncing,       setSyncing]       = useState(false);
  const [platformMetrics, setPlatformMetrics] = useState(null); // { conversations, surveys }
  const [metricsLoading,  setMetricsLoading]  = useState(false);

  useEffect(() => {
    if (!optimizing) { setOptimizerStep(0); return; }
    const id = setInterval(() => setOptimizerStep(s => (s + 1) % OPTIMIZER_STEPS.length), 1400);
    return () => clearInterval(id);
  }, [optimizing]);

  const activeAd = selectedAd || ads[0] || null;

  useEffect(() => {
    if (activeAd) setInsights(null);
  }, [activeAd?.id]);

  useEffect(() => {
    if (!activeAd) return;
    setMetricsLoading(true);
    Promise.all([
      adsAPI.listVoiceConversations(activeAd.id, 100).catch(() => ({ conversations: [] })),
      surveyAPI.list(activeAd.id).catch(() => []),
    ]).then(([convData, surveys]) => {
      const convs = convData?.conversations || convData || [];
      setPlatformMetrics({ conversations: convs, surveys: Array.isArray(surveys) ? surveys : [] });
    }).finally(() => setMetricsLoading(false));
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
      const { log_id } = await analyticsAPI.triggerOptimize(activeAd.id);
      let result;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        result = await analyticsAPI.getOptimizeStatus(activeAd.id, log_id);
        if (result.status === "done" || result.status === "failed") break;
      }
      if (result?.status === "failed") throw new Error("Optimizer failed — please try again.");
      setSuggestions(result);
    } catch (err) { alert(err.message); }
    finally { setOptimizing(false); }
  };

  const handleDecision = async (decision) => {
    if (!activeAd) return;
    try {
      const s = suggestions?.suggestions || {};
      await analyticsAPI.submitDecision(activeAd.id, {
        decision,
        applied_changes: {
          cost_items:          s.cost_optimization?.items         || [],
          website_items:       s.website_optimization             || [],
          advertisement_items: s.advertisement_optimization       || [],
        },
      });
      setSuggestions(null);
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
  const hasSynced    = !!insights;

  /**
   * Fuzzy-match a strategy KPI name against Meta totals.
   * Returns a display string when the metric IS derivable from Meta data (including "0").
   * Returns undefined when the KPI simply cannot be derived from Meta (e.g. Pre-Screener rate).
   */
  const resolveKpiFromMeta = (metric) => {
    const m = metric.toLowerCase();

    if (m.includes("impression"))
      return totals.impressions.toLocaleString();

    if (m.includes("reach"))
      return totals.reach.toLocaleString();

    if (m.includes("cpm"))
      return avgCpm !== "–" ? `$${avgCpm}` : "$0.00";

    if (m.includes("ctr") || m.includes("click-to-page") || m.includes("click rate") || m.includes("click through"))
      return avgCtr !== "–" ? `${avgCtr}%` : "0.00%";

    // Bare "clicks" — avoid matching "cost per click", "ctr", "rate"
    if (m.includes("click") && !m.includes("cost") && !m.includes("cpc") && !m.includes("rate") && !m.includes("ctr") && !m.includes("through"))
      return totals.clicks.toLocaleString();

    if (m.includes("cpc") || m.includes("cost per click") || m.includes("cost per link click"))
      return totals.clicks ? `$${(totals.spend / totals.clicks).toFixed(2)}` : "–";

    if (m.includes("cpl") || m.includes("cost per lead"))
      return totals.conversions ? `$${(totals.spend / totals.conversions).toFixed(2)}` : "–";

    if (m.includes("cpa") || m.includes("cost per enrolled") || m.includes("cost per acquisition") || m.includes("cost per participant"))
      return totals.conversions ? `$${(totals.spend / totals.conversions).toFixed(2)}` : "–";

    if (m.includes("spend") || m.includes("amount spent"))
      return `$${totals.spend.toFixed(2)}`;

    if (m.includes("conversion rate"))
      return totals.clicks > 0
        ? `${Math.min((totals.conversions / totals.clicks) * 100, 100).toFixed(2)}%`
        : "–";

    if (m.includes("conversion") || m.includes("enrolled participant") || m.includes("total enrolled") || m.includes("enrolled"))
      return totals.conversions.toLocaleString();

    // This KPI cannot be derived from Meta Ads data (e.g. Pre-Screener rates, survey metrics)
    return undefined;
  };

  const chartData = (insights?.rows || []).map((r) => {
    const imp = r.impressions || 0;
    const clk = r.clicks      || 0;
    return {
      date:        r.date?.slice(5),   // "MM-DD"
      Impressions: imp,
      Clicks:      clk,
      Spend:       parseFloat((r.spend || 0).toFixed(2)),
      CTR:         imp > 0 ? parseFloat(((clk / imp) * 100).toFixed(3)) : 0,
    };
  });

  // Parse CTR target from strategy KPIs (e.g. "2%" → 2.0)
  const ctrKpi = strategyKpis.find(k => k.metric?.toLowerCase().includes("ctr") || k.metric?.toLowerCase().includes("click-through") || k.metric?.toLowerCase().includes("click rate"));
  const ctrTarget = ctrKpi ? parseFloat(String(ctrKpi.target).replace(/[^0-9.]/g, "")) : null;

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
            <span style={{ fontSize: "0.72rem", color: "var(--color-muted)" }}>Upload to Meta first to fetch live data</span>
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

        {/* Impressions + Clicks line chart — right axis scaled to CTR target */}
        {chartData.length > 0 && (() => {
          const maxImpressions = Math.max(...chartData.map(d => d.Impressions), 1);
          // If a CTR target exists, set right-axis max so that target-CTR clicks
          // for the peak impression value aligns visually with the left-axis peak.
          // e.g. 20000 impressions at 1% CTR → right max = 200, so 200 clicks sits
          // at the same height as 20000 impressions.
          const rightMax = (ctrTarget !== null && !isNaN(ctrTarget))
            ? Math.ceil(maxImpressions * (ctrTarget / 100))
            : undefined;
          return (
            <div style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "8px" }}>
                <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)" }}>
                  Impressions &amp; Clicks — Daily
                </p>
                {rightMax !== undefined && (
                  <span style={{ fontSize: "0.65rem", fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "rgba(99,102,241,0.08)", color: "#6366f1", border: "1px solid rgba(99,102,241,0.2)" }}>
                    Right axis scaled to {ctrTarget}% CTR target
                  </span>
                )}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-card-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-sidebar-text)" }} />
                  <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: "var(--color-sidebar-text)" }} domain={[0, maxImpressions]} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--color-sidebar-text)" }}
                    domain={rightMax !== undefined ? [0, rightMax] : [0, "auto"]} />
                  <Tooltip contentStyle={{ backgroundColor: "var(--color-card-bg)", border: "1px solid var(--color-card-border)", borderRadius: 8, fontSize: "0.78rem" }} />
                  <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                  <Line yAxisId="left"  type="linear" dataKey="Impressions" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="linear" dataKey="Clicks"      stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        })()}


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
              const achieved = hasSynced ? resolveKpiFromMeta(kpi.metric) : undefined;
              const badgeLabel = !hasSynced ? "PENDING SYNC" : achieved !== undefined ? "TRACKED" : "NOT IN META";
              const badgeBg = !hasSynced ? "rgba(107,114,128,0.1)" : achieved !== undefined ? "rgba(34,197,94,0.1)" : "rgba(99,102,241,0.1)";
              const badgeColor = !hasSynced ? "var(--color-muted)" : achieved !== undefined ? "#15803d" : "rgba(99,102,241,0.8)";
              return (
                <div key={i} style={{ padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--color-input-text)" }}>{kpi.metric}</p>
                    <span style={{ fontSize: "0.62rem", padding: "1px 7px", borderRadius: 999, backgroundColor: badgeBg, color: badgeColor, fontWeight: 600 }}>
                      {badgeLabel}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <div>
                      <p style={{ fontSize: "0.62rem", fontWeight: 600, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Target</p>
                      <p style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-accent)" }}>{kpi.target}</p>
                    </div>
                    <div style={{ borderLeft: "1px solid var(--color-card-border)", paddingLeft: 12 }}>
                      <p style={{ fontSize: "0.62rem", fontWeight: 600, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Achieved</p>
                      <p style={{ fontSize: "1rem", fontWeight: 700, color: achieved !== undefined ? "var(--color-input-text)" : "var(--color-muted)" }}>
                        {achieved !== undefined ? achieved : "–"}
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

      {/* Platform Metrics */}
      {(() => {
        const convs    = platformMetrics?.conversations || [];
        const surveys  = platformMetrics?.surveys || [];

        // Conversation metrics
        const totalConvs   = convs.length;
        const completedConvs = convs.filter(c => c.status === "done" || c.status === "completed" || c.end_time).length;
        const convCompletionRate = totalConvs > 0 ? ((completedConvs / totalConvs) * 100).toFixed(1) + "%" : "–";
        const avgDuration = totalConvs > 0
          ? (() => {
              const withDur = convs.filter(c => c.call_duration_secs > 0);
              if (!withDur.length) return "–";
              const avg = withDur.reduce((s, c) => s + c.call_duration_secs, 0) / withDur.length;
              return avg >= 60 ? `${(avg / 60).toFixed(1)}m` : `${Math.round(avg)}s`;
            })()
          : "–";

        // Survey / lead metrics
        const totalSurveys  = surveys.length;
        const qualifiedLeads = surveys.filter(s => s.screening_result === "qualified" || s.eligible === true).length;
        const leadQualRate   = totalSurveys > 0 ? ((qualifiedLeads / totalSurveys) * 100).toFixed(1) + "%" : "–";

        // Meta-derived chatbot conversion rate: (conversations / clicks) × 100
        const chatbotConvRate = totalConvs > 0 && totals.clicks > 0
          ? `${Math.min((totalConvs / totals.clicks) * 100, 100).toFixed(2)}%`
          : "–";

        const metricCards = [
          {
            label: "Chatbot Conversations",
            value: metricsLoading ? "…" : totalConvs.toLocaleString(),
            sub: "Total voice/chat sessions started",
            color: "#8b5cf6",
            note: null,
          },
          {
            label: "Conversation Completion Rate",
            value: metricsLoading ? "…" : convCompletionRate,
            sub: `${completedConvs} of ${totalConvs} completed`,
            color: "#6366f1",
            note: null,
          },
          {
            label: "Avg. Conversation Duration",
            value: metricsLoading ? "…" : avgDuration,
            sub: "Mean time per session",
            color: "#8b5cf6",
            note: null,
          },
          {
            label: "Chatbot Conversion Rate",
            value: metricsLoading ? "…" : chatbotConvRate,
            sub: "Conversations ÷ ad clicks",
            color: "#6366f1",
            note: !hasSynced ? "Sync Meta for clicks data" : null,
          },
          {
            label: "Pre-Screener Submissions",
            value: metricsLoading ? "…" : totalSurveys.toLocaleString(),
            sub: "Survey responses received",
            color: "#0ea5e9",
            note: null,
          },
          {
            label: "Lead Qualification Rate",
            value: metricsLoading ? "…" : leadQualRate,
            sub: `${qualifiedLeads} qualified of ${totalSurveys}`,
            color: "#0ea5e9",
            note: null,
          },
          {
            label: "Website Visitors",
            value: hasSynced ? totals.clicks.toLocaleString() : "–",
            sub: "Ad clicks redirected to website",
            color: "#22c55e",
            note: !hasSynced ? "Sync Meta to populate" : null,
          },
          {
            label: "Cost Per Lead",
            value: hasSynced && totalSurveys > 0 ? `$${(totals.spend / totalSurveys).toFixed(2)}` : "–",
            sub: "Spend ÷ pre-screener submissions",
            color: "#f59e0b",
            note: !hasSynced ? "Sync Meta to populate" : null,
          },
          {
            label: "Total Ad Spend",
            value: hasSynced ? `$${totals.spend.toFixed(2)}` : "–",
            sub: "Across all Meta ads",
            color: "#f59e0b",
            note: !hasSynced ? "Sync Meta to populate" : null,
          },
        ];

        return (
          <SectionCard title="Platform Metrics" subtitle="Live data from chatbot, pre-screener, and Meta ads">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
              {metricCards.map((m, i) => (
                <div key={i} style={{ padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)", borderLeft: `3px solid ${m.color}30` }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--color-sidebar-text)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{m.label}</p>
                  <p style={{ fontSize: "1.3rem", fontWeight: 800, color: m.value === "–" ? "var(--color-muted)" : m.color, marginBottom: 4, lineHeight: 1 }}>{m.value}</p>
                  <p style={{ fontSize: "0.68rem", color: "var(--color-sidebar-text)" }}>{m.sub}</p>
                  {m.note && <p style={{ fontSize: "0.65rem", color: "var(--color-muted)", marginTop: 4, fontStyle: "italic" }}>{m.note}</p>}
                </div>
              ))}
            </div>
          </SectionCard>
        );
      })()}

      {/* Optimizer */}
      <SectionCard title="AI Optimizer" subtitle="Cost + content suggestions derived from your analytics data">
        {/* Campaign row + action button */}
        <div className="pub-campaign-row" style={{ marginBottom: (suggestions || optimizing) ? 20 : 8 }}>
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
            {optimizing ? "Analyzing…" : suggestions ? "Re-run" : "Optimize"}
          </button>
        </div>

        {/* Loading state */}
        {optimizing && (
          <div style={{ padding: "28px 0 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ position: "relative", width: 48, height: 48 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid var(--color-card-border)", borderTop: "3px solid var(--color-accent)", animation: "spin 0.9s linear infinite" }} />
              <Sparkles size={16} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", color: "var(--color-accent)" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: "0.86rem", fontWeight: 700, color: "var(--color-input-text)", marginBottom: 10 }}>
                {OPTIMIZER_STEPS[optimizerStep].label}…
              </p>
              <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                {OPTIMIZER_STEPS.map((_, i) => (
                  <div key={i} style={{
                    height: 5, borderRadius: 3,
                    width: i === optimizerStep ? 20 : 6,
                    backgroundColor: i <= optimizerStep ? "var(--color-accent)" : "var(--color-card-border)",
                    transition: "all 0.35s",
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Idle state — no suggestions yet */}
        {!suggestions && !optimizing && (
          <div style={{ padding: "4px 0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { Icon: TrendingUp, color: "#22c55e", bg: "rgba(34,197,94,0.07)", label: "Cost Optimization" },
                { Icon: Globe,      color: "#6366f1", bg: "rgba(99,102,241,0.07)", label: "Website" },
                { Icon: Image,      color: "#f59e0b", bg: "rgba(245,158,11,0.07)", label: "Ad Creative" },
              ].map(({ Icon, color, bg, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${color}30`, backgroundColor: bg }}>
                  <Icon size={12} style={{ color }} />
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color }}>{label}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", lineHeight: 1.6 }}>
              Analyzes your Meta performance data to suggest cost reallocation, content improvements, and creative updates tailored to this campaign.
            </p>
          </div>
        )}

        {/* Results */}
        {suggestions && !optimizing && (() => {
          const s = suggestions.suggestions || {};
          const totalCount =
            (s.cost_optimization?.items?.length || 0) +
            (s.website_optimization?.length || 0) +
            (s.advertisement_optimization?.length || 0);
          return (
            <>
              <OptimizerResult data={s} adId={activeAd?.id} />
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--color-card-border)", display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => handleDecision("accepted")} className="btn--approve">
                  <CheckCircle size={14} />
                  Apply All{totalCount > 0 ? ` (${totalCount})` : ""}
                </button>
                <button onClick={() => handleDecision("rejected")} className="btn--ghost" style={{ padding: "8px 16px" }}>
                  Dismiss
                </button>
              </div>
            </>
          );
        })()}
      </SectionCard>
    </div>
  );
}
