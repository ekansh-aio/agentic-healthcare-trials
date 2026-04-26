import React, { useState, useEffect } from "react";
import { SectionCard } from "../shared/Layout";
import { adsAPI, analyticsAPI, surveyAPI } from "../../services/api";
import {
  BarChart3, Sparkles, Loader2, RefreshCw, TrendingUp, Globe, Image,
  Mic, CheckCircle, AlertCircle, Target, Clock,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const typeLabel = (ad) => !ad ? "" : (Array.isArray(ad.ad_type) ? ad.ad_type : [ad.ad_type]).join(", ");

const ACTION_META = {
  set_today_budget:    { label: "Set Today's Budget",    color: "#22c55e", Icon: TrendingUp },
  schedule_pause:      { label: "Schedule Pause",        color: "#f59e0b", Icon: Clock },
  edit_caption:        { label: "Apply Caption",         color: "#6366f1", Icon: Globe },
  edit_content:        { label: "Update Content",        color: "#6366f1", Icon: Globe },
  switch_voice:        { label: "Switch Voice",          color: "#8b5cf6", Icon: Mic },
  edit_ad_caption:     { label: "Apply Caption",         color: "#f59e0b", Icon: Image },
  edit_ad_hashtags:    { label: "Apply Hashtags",        color: "#f59e0b", Icon: Image },
  regenerate_creative: { label: "Regenerate Creative",   color: "#f59e0b", Icon: Image },
  informational:       { label: "Noted",                 color: "#6b7280", Icon: CheckCircle },
};

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
  const [applying, setApplying] = useState(false);
  const [applied,  setApplied]  = useState(false);
  const [error,    setError]    = useState(null);

  const actionType = item.action_type || "informational";
  const meta       = ACTION_META[actionType] || ACTION_META.informational;
  const num        = String(globalIndex + 1).padStart(2, "0");

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
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.72rem", fontWeight: 600, color: meta.color }}>
            <CheckCircle size={12} /> Applied
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

const OPTIMIZER_STEPS = [
  { label: "Fetching performance data" },
  { label: "Analyzing cost efficiency" },
  { label: "Reviewing content signals" },
  { label: "Identifying traffic windows" },
  { label: "Generating recommendations" },
];

const DATE_PRESETS = [
  { value: "last_7d",   label: "Last 7 days" },
  { value: "last_14d",  label: "Last 14 days" },
  { value: "last_30d",  label: "Last 30 days" },
  { value: "last_90d",  label: "Last 90 days" },
];

export default function PublisherAnalytics({ ads, suggestions, setSuggestions, optimizing, setOptimizing, optimizerStep, setOptimizerStep }) {
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
  }, [optimizing]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeAd = selectedAd || ads[0] || null;

  useEffect(() => {
    if (activeAd) setInsights(null);
  }, [activeAd?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [activeAd?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const resolveKpiFromMeta = (metric) => {
    const m = metric.toLowerCase();
    if (m.includes("impression")) return totals.impressions.toLocaleString();
    if (m.includes("reach")) return totals.reach.toLocaleString();
    if (m.includes("cpm")) return avgCpm !== "–" ? `$${avgCpm}` : "$0.00";
    if (m.includes("ctr") || m.includes("click-to-page") || m.includes("click rate") || m.includes("click through"))
      return avgCtr !== "–" ? `${avgCtr}%` : "0.00%";
    if (m.includes("click") && !m.includes("cost") && !m.includes("cpc") && !m.includes("rate") && !m.includes("ctr") && !m.includes("through"))
      return totals.clicks.toLocaleString();
    if (m.includes("cpc") || m.includes("cost per click") || m.includes("cost per link click"))
      return totals.clicks ? `$${(totals.spend / totals.clicks).toFixed(2)}` : "–";
    if (m.includes("cpl") || m.includes("cost per lead"))
      return totals.conversions ? `$${(totals.spend / totals.conversions).toFixed(2)}` : "–";
    if (m.includes("cpa") || m.includes("cost per enrolled") || m.includes("cost per acquisition") || m.includes("cost per participant"))
      return totals.conversions ? `$${(totals.spend / totals.conversions).toFixed(2)}` : "–";
    if (m.includes("spend") || m.includes("amount spent")) return `$${totals.spend.toFixed(2)}`;
    if (m.includes("conversion rate"))
      return totals.clicks > 0 ? `${Math.min((totals.conversions / totals.clicks) * 100, 100).toFixed(2)}%` : "–";
    if (m.includes("conversion") || m.includes("enrolled participant") || m.includes("total enrolled") || m.includes("enrolled"))
      return totals.conversions.toLocaleString();
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

        {/* Impressions + Clicks line chart */}
        {chartData.length > 0 && (() => {
          const maxImpressions = Math.max(...chartData.map(d => d.Impressions), 1);
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

        const totalSurveys  = surveys.length;
        const qualifiedLeads = surveys.filter(s => s.screening_result === "qualified" || s.eligible === true).length;
        const leadQualRate   = totalSurveys > 0 ? ((qualifiedLeads / totalSurveys) * 100).toFixed(1) + "%" : "–";

        const chatbotConvRate = totalConvs > 0 && totals.clicks > 0
          ? `${Math.min((totalConvs / totals.clicks) * 100, 100).toFixed(2)}%`
          : "–";

        const metricCards = [
          { label: "Chatbot Conversations",      value: metricsLoading ? "…" : totalConvs.toLocaleString(),   sub: "Total voice/chat sessions started",           color: "#8b5cf6", note: null },
          { label: "Conversation Completion Rate", value: metricsLoading ? "…" : convCompletionRate,          sub: `${completedConvs} of ${totalConvs} completed`, color: "#6366f1", note: null },
          { label: "Avg. Conversation Duration",  value: metricsLoading ? "…" : avgDuration,                   sub: "Mean time per session",                       color: "#8b5cf6", note: null },
          { label: "Chatbot Conversion Rate",     value: metricsLoading ? "…" : chatbotConvRate,               sub: "Conversations ÷ ad clicks",                   color: "#6366f1", note: !hasSynced ? "Sync Meta for clicks data" : null },
          { label: "Pre-Screener Submissions",    value: metricsLoading ? "…" : totalSurveys.toLocaleString(), sub: "Survey responses received",                   color: "#0ea5e9", note: null },
          { label: "Lead Qualification Rate",     value: metricsLoading ? "…" : leadQualRate,                  sub: `${qualifiedLeads} qualified of ${totalSurveys}`, color: "#0ea5e9", note: null },
          { label: "Website Visitors",            value: hasSynced ? totals.clicks.toLocaleString() : "–",    sub: "Ad clicks redirected to website",             color: "#22c55e", note: !hasSynced ? "Sync Meta to populate" : null },
          { label: "Cost Per Lead",               value: hasSynced && totalSurveys > 0 ? `$${(totals.spend / totalSurveys).toFixed(2)}` : "–", sub: "Spend ÷ pre-screener submissions", color: "#f59e0b", note: !hasSynced ? "Sync Meta to populate" : null },
          { label: "Total Ad Spend",              value: hasSynced ? `$${totals.spend.toFixed(2)}` : "–",     sub: "Across all Meta ads",                         color: "#f59e0b", note: !hasSynced ? "Sync Meta to populate" : null },
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
