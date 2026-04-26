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

import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageWithSidebar, MetricSummaryCard } from "../shared/Layout";
import { adsAPI, analyticsAPI, platformConnectionsAPI } from "../../services/api";
import {
  Globe, BarChart3, Rocket, Share2, Zap, Eye, SlidersHorizontal, TrendingUp,
} from "lucide-react";
import ManageTab from "./ManageTab";
import PublisherAnalytics from "./PublisherAnalytics";
import AdPreviewModal from "./AdPreviewModal";
import MetaPlatformSettings from "./MetaPlatformSettings";
import OverviewTab from "./overview/OverviewTab";
import DeployTab from "./deploy/DeployTab";
import DistributeTab, { SOCIAL_PLATFORMS } from "./distribute/DistributeTab";

// ─── Tab ↔ Path maps ──────────────────────────────────────────────────────────
export const PATH_TO_TAB = {
  "/publisher/deploy":      "deploy",
  "/publisher/distribute":  "distribute",
  "/publisher/manage":      "manage",
  "/publisher/analytics":   "analytics",
  "/publisher/settings":    "settings",
};
export const TAB_TO_PATH = {
  overview:    "/publisher",
  deploy:      "/publisher/deploy",
  distribute:  "/publisher/distribute",
  manage:      "/publisher/manage",
  analytics:   "/publisher/analytics",
  settings:    "/publisher/settings",
};

export const TABS = [
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

        // Seed destination_url from hosted landing page — must be absolute for Meta
        if (!existing.destination_url && ad?.hosted_url) {
          seeds.destination_url = `${window.location.origin}${ad.hosted_url}`;
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
