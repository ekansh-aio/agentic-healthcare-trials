import React, { useState, useEffect } from "react";
import { SectionCard } from "../shared/Layout";
import { adsAPI } from "../../services/api";
import {
  Link2Off, TrendingUp, RefreshCw, Clock, Pause, ExternalLink, Pencil,
  Loader2, ToggleLeft, ToggleRight, Trash2, CheckCircle2, Image,
  X, Plus, Play,
} from "lucide-react";

const DAY_OPTIONS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

export default function ManageTab({ ads: initialAds, metaConnection }) {
  const [ads, setAds] = useState(initialAds);
  // Keep in sync when parent reloads
  useEffect(() => { setAds(initialAds); }, [initialAds]);

  // Campaigns that have been distributed to Meta
  // Show all published ads — even those that lost their campaign_id so the user can restore it
  const metaCampaigns = ads.filter((a) => a.status === "published" || a.bot_config?.meta_campaign_id);

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

  // ── Campaign ID override ────────────────────────────────────────────────────
  const [campaignIdEdit,   setCampaignIdEdit]   = useState(null);  // adId being edited
  const [campaignIdInput,  setCampaignIdInput]  = useState("");
  const [campaignIdSaving, setCampaignIdSaving] = useState(false);

  const openCampaignIdEdit = (ad) => {
    setCampaignIdEdit(ad.id);
    setCampaignIdInput(ad.bot_config?.meta_campaign_id || "");
  };

  const saveCampaignId = async (adId) => {
    const trimmed = campaignIdInput.trim();
    if (!trimmed) { alert("Campaign ID cannot be empty."); return; }
    setCampaignIdSaving(true);
    try {
      const updated = await adsAPI.updateBotConfig(adId, { meta_campaign_id: trimmed });
      setAds((prev) => prev.map((a) => a.id === adId ? updated : a));
      setCampaignIdEdit(null);
    } catch (err) { alert(err.message); }
    finally { setCampaignIdSaving(false); }
  };

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
      <SectionCard title="Manage Meta Ads" subtitle="No published campaigns found">
        <div className="flex flex-col items-center py-12 gap-3">
          <TrendingUp size={36} style={{ color: "var(--color-sidebar-text)", opacity: 0.4 }} />
          <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
            Publish a campaign first, then upload it to Meta from the Upload Ads tab.
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
            subtitle={campaignId ? `Campaign ID: ${campaignId} · ${state?.ads?.length ?? "–"} ads` : "No campaign ID — click Edit Campaign ID to set one"}
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
              <button
                className="btn--inline-action--ghost"
                onClick={() => openCampaignIdEdit(ad)}
                style={{ borderColor: "#6366f144", color: "#6366f1" }}
              >
                <Pencil size={12} /> Edit Campaign ID
              </button>
            </div>

            {/* Campaign ID inline editor */}
            {campaignIdEdit === ad.id && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "10px 12px", background: "var(--color-input-bg)", borderRadius: 8, border: "1px solid #6366f144" }}>
                <span style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", whiteSpace: "nowrap" }}>Meta Campaign ID:</span>
                <input
                  value={campaignIdInput}
                  onChange={(e) => setCampaignIdInput(e.target.value)}
                  placeholder="e.g. 120210123456789"
                  style={{ flex: 1, padding: "5px 10px", borderRadius: 6, fontSize: "0.82rem", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)", color: "var(--color-input-text)", outline: "none", fontFamily: "inherit" }}
                  onKeyDown={(e) => { if (e.key === "Enter") saveCampaignId(ad.id); if (e.key === "Escape") setCampaignIdEdit(null); }}
                  autoFocus
                />
                <button
                  className="btn--inline-action--ghost"
                  onClick={() => saveCampaignId(ad.id)}
                  disabled={campaignIdSaving}
                  style={{ borderColor: "#22c55e44", color: "#22c55e", whiteSpace: "nowrap" }}
                >
                  {campaignIdSaving ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={12} />}
                  Save
                </button>
                <button
                  className="btn--inline-action--ghost"
                  onClick={() => setCampaignIdEdit(null)}
                  style={{ padding: "4px 8px" }}
                >
                  <X size={12} />
                </button>
              </div>
            )}

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
