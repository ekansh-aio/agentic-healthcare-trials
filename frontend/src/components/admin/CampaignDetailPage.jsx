/**
 * Campaign Detail Page
 * Owner: Frontend Dev 2
 * Dependencies: adsAPI
 *
 * Route: /admin/campaign/:id  (also accessible by reviewer, publisher, ethics_reviewer)
 *
 * Sections (conditionally shown by status):
 *   - Metadata          — always
 *   - Status timeline   — always
 *   - Protocol docs     — always
 *   - Strategy          — strategy_created and beyond
 *   - Review panel      — strategy_created / under_review (reviewer role)
 *   - Reviews           — under_review and beyond
 *   - Analytics         — published only
 *
 * Actions:
 *   - Generate Strategy  — draft (admin / publisher)
 *   - Submit for Review  — strategy_created (admin / publisher)
 *   - Publish            — approved (publisher / admin)
 */

import React, { useState, useEffect, useCallback, Component } from "react";
import VoicebotPanel, { VOICE_CATALOGUE } from "./VoicebotPanel";
import { useParams, useNavigate, Link } from "react-router-dom";
import { PageWithSidebar, SectionCard, CampaignStatusBadge } from "../shared/Layout";
import { adsAPI, companyAPI, surveyAPI, appointmentsAPI } from "../../services/api";
import {
  ArrowLeft, Globe, FileText, CheckCircle2, AlertCircle, ChevronDown,
  Loader2, Layers, Zap, Sparkles,
  Download, Eye, Trash2, ClipboardList, ClipboardCheck, History,
  X as XIcon, RefreshCw, Send, Users,
  Phone, PhoneCall, Pencil, Copy,
} from "lucide-react";

// ─── Extracted sub-components ─────────────────────────────────────────────────
import { useGenerateProgress, InlineProgress } from "./campaign/GenerateProgress";
import DocPreviewModal from "./campaign/DocPreviewModal";
import QuestionnaireSection from "./campaign/QuestionnaireSection";
import StrategyViewer, { StatusTimeline, AdTypeChip, BudgetDonut, GenericValue, statusIndex } from "./campaign/StrategyViewer";
import { ReviewPanel, ReviewCard } from "./campaign/ReviewComponents";
import CreativesViewer from "./campaign/CreativesViewer";
import TrialLocationsCard from "./campaign/TrialLocationsCard";
import PageTabBar from "./campaign/PageTabBar";

// ─── Campaign categories that require a questionnaire ─────────────────────────
const QUESTIONNAIRE_CATEGORIES = new Set(["recruitment", "hiring", "survey", "clinical_trial", "research"]);

const QUESTIONNAIRE_KEYWORDS = ["hiring", "recruit", "survey", "clinical", "trial", "research study", "job posting", "job opening", "application", "vacancy", "vacancies", "applicant", "enroll", "enrolment", "participant", "respondent"];

/** Check protocol doc titles first (strongest signal), fall back to campaign title. */
function needsQuestionnaire(ad, protoDocs) {
  if (!ad) return false;
  if (QUESTIONNAIRE_CATEGORIES.has(ad.campaign_category)) return true;
  const titles = [
    ad.title || "",
    ...(protoDocs || []).map((d) => d.title || ""),
  ].join(" ").toLowerCase();
  return QUESTIONNAIRE_KEYWORDS.some((kw) => titles.includes(kw));
}

function ActionButton({ onClick, loading, disabled, variant = "accent", icon, children }) {
  const cls = variant === "ghost" ? "btn--ghost" : variant === "primary" ? "btn--primary" : "btn--accent";
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cls}
      style={{ display: "inline-flex", alignItems: "center", gap: "8px", opacity: (disabled || loading) ? 0.6 : 1, cursor: (disabled || loading) ? "not-allowed" : "pointer" }}
    >
      {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : icon}
      {children}
    </button>
  );
}

// ─── Error boundary ───────────────────────────────────────────────────────────
class DetailErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <PageWithSidebar>
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <AlertCircle size={36} style={{ color: "#ef4444", margin: "0 auto 14px" }} />
            <p style={{ color: "var(--color-input-text)", fontWeight: 700, fontSize: "1rem" }}>
              Something went wrong rendering this campaign
            </p>
            <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.82rem", marginTop: "6px", maxWidth: "420px", margin: "8px auto 0" }}>
              {this.state.error?.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn--ghost"
              style={{ marginTop: "20px" }}
            >
              Reload page
            </button>
          </div>
        </PageWithSidebar>
      );
    }
    return this.props.children;
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CampaignDetailPage() {
  return <DetailErrorBoundary><CampaignDetailPageInner /></DetailErrorBoundary>;
}

function CampaignDetailPageInner() {
  const { id }      = useParams();
  const navigate    = useNavigate();

  const [ad,        setAd]        = useState(null);
  const [protoDocs,  setProtoDocs]  = useState([]);
  const [reviews,    setReviews]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  // Per-action loading & error
  const [genLoading,  setGenLoading]  = useState(false);
  const [genError,    setGenError]    = useState(null);
  const [revLoading,  setRevLoading]  = useState(false);
  const [revError,    setRevError]    = useState(null);
  const [pubLoading,  setPubLoading]  = useState(false);
  const [pubError,    setPubError]    = useState(null);
  const [creativeLoading, setCreativeLoading] = useState(false);
  const [creativeError,   setCreativeError]   = useState(null);
  const [deleteLoading,   setDeleteLoading]   = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [websiteLoading,  setWebsiteLoading]  = useState(false);
  const [websiteError,    setWebsiteError]    = useState(null);
  const [hostLoading,     setHostLoading]     = useState(false);
  const [hostError,       setHostError]       = useState(null);
  const [regenLoading,    setRegenLoading]    = useState(false);
  const [regenError,      setRegenError]      = useState(null);
  const [regenInstr,      setRegenInstr]      = useState("");
  const [regenConfirmed,  setRegenConfirmed]  = useState(false);
  const [regenOpen,       setRegenOpen]       = useState(false);
  const [titleEditing,    setTitleEditing]    = useState(false);
  const [titleInput,      setTitleInput]      = useState("");
  const [titleSaving,     setTitleSaving]     = useState(false);
  const [pageTab,         setPageTab]         = useState("overview");
  const [companyLocations, setCompanyLocations] = useState([]);  // [{ country, cities }]
  const [participants,     setParticipants]     = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [participantAppointments, setParticipantAppointments] = useState([]);
  const [syncingTranscripts,  setSyncingTranscripts]  = useState(false);
  const [syncResult,          setSyncResult]          = useState(null);
  // Voicebot conversation history (loaded in participants tab for voicebot campaigns)
  const [convHistory,         setConvHistory]         = useState([]);
  const [convHistoryLoading,  setConvHistoryLoading]  = useState(false);
  const [selectedConvHistory, setSelectedConvHistory] = useState(null);
  const [convTranscript,      setConvTranscript]      = useState(null);
  const [convTransLoading,    setConvTransLoading]    = useState(false);

  const saveTitle = async () => {
    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === ad.title) { setTitleEditing(false); return; }
    setTitleSaving(true);
    try {
      const updated = await adsAPI.update(id, { title: trimmed });
      setAd(updated);
      setTitleEditing(false);
    } catch (err) {
      alert(err.message || "Failed to save title.");
    } finally {
      setTitleSaving(false);
    }
  };

  const genProgress = useGenerateProgress();

  const role = JSON.parse(localStorage.getItem("user") || "{}").role;
  const isStudyCoordinator = role === "study_coordinator";
  const canRegenerate = ["project_manager", "ethics_manager"].includes(role);
  const canGenerate   = isStudyCoordinator || canRegenerate;
  const isPublisher   = role === "publisher";

  // Poll GET /{adId} until updated_at changes (background task committed).
  // Used after any endpoint that fires a BackgroundTask and returns immediately.
  //
  // Resilient to transient 5xx/network errors: during heavy generation the
  // backend can momentarily return 503 (ALB queue / SQLite lock) — swallow
  // those and keep polling until the deadline.
  const pollUntilUpdated = useCallback(async (adId, beforeUpdatedAt, timeoutMs = 300_000) => {
    const deadline = Date.now() + timeoutMs;
    let transientErrors = 0;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const latest = await adsAPI.get(adId);
        transientErrors = 0;
        if (latest.updated_at !== beforeUpdatedAt) return latest;
      } catch (err) {
        const msg = String(err?.message || "");
        const isTransient = /HTTP 5\d\d|503|502|504|Failed to fetch|NetworkError/i.test(msg);
        if (!isTransient) throw err;
        transientErrors += 1;
        if (transientErrors >= 10) throw new Error("Server is unavailable — please refresh the page.");
      }
    }
    throw new Error("Timed out waiting for generation to complete. Please refresh the page.");
  }, []);

  const load = useCallback(async () => {
    try {
      const [adData, docsData, reviewsData] = await Promise.all([
        adsAPI.get(id),
        adsAPI.listDocuments(id),
        adsAPI.listReviews(id),
      ]);
      setAd(adData);
      setProtoDocs(docsData);
      setReviews(reviewsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    companyAPI.getProfile()
      .then((p) => setCompanyLocations(p.locations || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (pageTab !== "participants" || !id) return;
    setParticipantsLoading(true);
    surveyAPI.list(id)
      .then((data) => setParticipants(data || []))
      .catch(() => setParticipants([]))
      .finally(() => setParticipantsLoading(false));
    // Load voicebot conversation history alongside participants
    if (ad?.ad_type?.includes("voicebot")) {
      setConvHistoryLoading(true);
      adsAPI.listVoiceConversations(id)
        .then((r) => setConvHistory(r.conversations || []))
        .catch(() => setConvHistory([]))
        .finally(() => setConvHistoryLoading(false));
    }
  }, [pageTab, id, ad?.ad_type]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectConvHistory = async (conv) => {
    if (selectedConvHistory?.conversation_id === conv.conversation_id) {
      setSelectedConvHistory(null); return;
    }
    setSelectedConvHistory(conv); setConvTranscript(null); setConvTransLoading(true);
    try { setConvTranscript(await adsAPI.getVoiceTranscript(conv.conversation_id)); } catch {}
    setConvTransLoading(false);
  };

  const handleSyncTranscripts = async () => {
    setSyncingTranscripts(true);
    setSyncResult(null);
    try {
      const result = await surveyAPI.syncTranscripts(id);
      setSyncResult(result);
      // Reload participants to pick up newly linked transcripts
      const data = await surveyAPI.list(id);
      setParticipants(data || []);
      if (selectedParticipant) {
        const refreshed = (data || []).find((p) => p.id === selectedParticipant.id);
        if (refreshed) setSelectedParticipant(refreshed);
      }
    } catch (err) {
      setSyncResult({ error: err.message || "Sync failed" });
    } finally {
      setSyncingTranscripts(false);
    }
  };

  // ── Action handlers ──────────────────────────────────────────────────────
  const handleGenerateStrategy = async () => {
    setGenLoading(true); setGenError(null);
    try {
      // Step 1 — strategy (returns immediately with status=generating; poll until done)
      genProgress.start("Generating strategy…", 25000);
      const triggered = await adsAPI.generateStrategy(id);
      setAd(triggered);
      const afterStrategy = await pollUntilUpdated(id, triggered.updated_at, 120_000);
      setAd(afterStrategy);
      if (afterStrategy.status === "draft") {
        throw new Error("AI generation failed. This may be a network issue or a temporary API problem. Please try again.");
      }
      genProgress.complete();

      const adTypes = afterStrategy.ad_type || [];
      const isWebsite  = adTypes.includes("website");
      const hasNonWeb  = adTypes.some(t => t !== "website");

      // Step 2 — website (if campaign type includes website)
      if (isWebsite) {
        setWebsiteLoading(true); setWebsiteError(null);
        genProgress.start("Building landing page…", 120000);
        try {
          const triggeredWebsite = await adsAPI.generateWebsite(id);
          const afterWebsite = await pollUntilUpdated(id, triggeredWebsite.updated_at, 600_000);
          setAd(afterWebsite);
          genProgress.complete();
        } catch (err) {
          genProgress.fail();
          setWebsiteError(err.message || "Website generation failed.");
        } finally {
          setWebsiteLoading(false);
        }
      }

      // Step 3 — creatives (if campaign includes non-website ad types)
      if (hasNonWeb) {
        setCreativeLoading(true); setCreativeError(null);
        genProgress.start("Generating ad creatives + images…", 120000);
        try {
          const triggeredCreatives = await adsAPI.generateCreatives(id);
          const afterCreatives = await pollUntilUpdated(id, triggeredCreatives.updated_at);
          setAd(afterCreatives);
          genProgress.complete();
        } catch (err) {
          genProgress.fail();
          setCreativeError(err.message || "Creative generation failed.");
        } finally {
          setCreativeLoading(false);
        }
      }
    } catch (err) {
      genProgress.fail();
      setGenError(err.message || "Strategy generation failed. Check that training has been run and API keys are configured.");
    } finally {
      setGenLoading(false);
    }
  };

  const handleSubmitForReview = async () => {
    setRevLoading(true); setRevError(null);
    genProgress.start("Running AI review…", 60000);
    try {
      const triggered = await adsAPI.submitForReview(id);
      const updated = await pollUntilUpdated(id, triggered.updated_at);
      setAd(updated);
      genProgress.complete();
    } catch (err) {
      genProgress.fail();
      setRevError(err.message || "Failed to submit for review.");
    } finally {
      setRevLoading(false);
    }
  };

  const handlePublish = async () => {
    setPubLoading(true); setPubError(null);
    genProgress.start("Publishing campaign…", 8000);
    try {
      const updated = await adsAPI.publish(id);
      setAd(updated);
      genProgress.complete();
    } catch (err) {
      genProgress.fail();
      setPubError(err.message || "Publish failed. Campaign must be approved first.");
    } finally {
      setPubLoading(false);
    }
  };

  const handleReviewSubmitted = async () => {
    await load();
  };

  const handleGenerateCreatives = async () => {
    setCreativeLoading(true); setCreativeError(null);
    genProgress.start("Generating ad creatives + images…", 120000);
    try {
      const triggered = await adsAPI.generateCreatives(id);
      // Backend returns immediately; poll until the background task commits
      const updated = await pollUntilUpdated(id, triggered.updated_at);
      setAd(updated);
      genProgress.complete();
    } catch (err) {
      genProgress.fail();
      setCreativeError(err.message || "Creative generation failed.");
    } finally {
      setCreativeLoading(false);
    }
  };

  const handleGenerateWebsite = async () => {
    setWebsiteLoading(true); setWebsiteError(null);
    genProgress.start("Building landing page…", 120000);
    try {
      const prevUrl = ad?.output_url;
      const triggered = await adsAPI.generateWebsite(id);
      // Backend returns immediately; poll until the background task commits.
      // Website gen is slower than creatives (Claude + image + EFS write) → 10 min.
      const updated = await pollUntilUpdated(id, triggered.updated_at, 600_000);
      // Detect silent failure: task touched updated_at but didn't produce a URL
      if (!updated.output_url && !prevUrl) {
        throw new Error("Website generation failed on the server. Check the backend logs for the error.");
      }
      setAd(updated);
      genProgress.complete();
    } catch (err) {
      genProgress.fail();
      setWebsiteError(err.message || "Website generation failed.");
    } finally {
      setWebsiteLoading(false);
    }
  };

  const handleHostPage = async () => {
    setHostLoading(true); setHostError(null);
    try {
      const updated = await adsAPI.hostPage(id);
      setAd(updated);
    } catch (err) {
      setHostError(err.message || "Hosting failed.");
    } finally {
      setHostLoading(false);
    }
  };

  const handleRegenStrategy = async () => {
    if (!regenInstr.trim()) { setRegenError("Instructions are required."); return; }
    if (!regenConfirmed)    { setRegenError("Please confirm the current strategy will be replaced."); return; }
    setRegenLoading(true); setRegenError(null);
    genProgress.start("Re-writing strategy…", 25000);
    try {
      const updated = await adsAPI.rewriteStrategy(id, { instructions: regenInstr.trim() });
      setAd(updated);
      genProgress.complete();
      setRegenInstr(""); setRegenConfirmed(false); setRegenOpen(false);
    } catch (err) {
      genProgress.fail();
      setRegenError(err.message || "Strategy regeneration failed.");
    } finally {
      setRegenLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await adsAPI.delete(id);
      navigate("/study-coordinator");
    } catch (err) {
      setShowDeleteConfirm(false);
      setDeleteLoading(false);
      alert(err.message || "Failed to delete campaign.");
    }
  };

  // ── Derived state ────────────────────────────────────────────────────────
  const currentStep = ad ? statusIndex(ad.status) : 0;
  const hasStrategy = ad && currentStep >= statusIndex("strategy_created");
  const hasReviews  = ad && currentStep >= statusIndex("under_review");
  const isPublished = ad && ad.status === "published";
  const canReview   = ad && (ad.status === "under_review" || ad.status === "strategy_created" || ad.status === "ethics_review");
  const qualifies   = ad && needsQuestionnaire(ad, protoDocs);
  const questEmpty  = !(ad?.questionnaire?.questions?.length > 0);
  const showQDot    = qualifies && questEmpty;

  if (loading) return (
    <PageWithSidebar>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "40px 0", color: "var(--color-sidebar-text)" }}>
        <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
        <p>Loading campaign…</p>
      </div>
    </PageWithSidebar>
  );

  if (error || !ad) return (
    <PageWithSidebar>
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <AlertCircle size={32} style={{ color: "#ef4444", margin: "0 auto 12px" }} />
        <p style={{ color: "var(--color-input-text)", fontWeight: 600 }}>Campaign not found</p>
        <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.85rem", marginTop: "4px" }}>{error}</p>
        <button onClick={() => navigate(-1)} className="btn--ghost" style={{ marginTop: "16px" }}>Go back</button>
      </div>
    </PageWithSidebar>
  );

  return (
    <>
    <PageWithSidebar>

      {/* CSS for spinner */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Delete confirmation — top banner */}
      {showDeleteConfirm && (
        <div style={{
          position: "fixed", top: 0, left: 240, right: 0, zIndex: 1000,
          background: "var(--color-card-bg)",
          borderBottom: "2px solid #ef4444",
          boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
          padding: "18px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24,
          animation: "slideDown 0.2s ease",
        }}>
          <style>{`@keyframes slideDown{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--color-input-text)", margin: "0 0 3px" }}>
              Delete Campaign?
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--color-sidebar-text)", margin: 0 }}>
              Permanently deletes <strong style={{ color: "var(--color-input-text)" }}>{ad.title}</strong> — documents, reviews, and analytics. Cannot be undone.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <button onClick={() => setShowDeleteConfirm(false)} disabled={deleteLoading} className="btn--ghost" style={{ padding: "7px 16px" }}>
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteLoading}
              style={{
                background: "#ef4444", color: "#fff", border: "none",
                borderRadius: "8px", padding: "7px 18px", cursor: "pointer",
                fontWeight: 600, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px",
                opacity: deleteLoading ? 0.7 : 1,
              }}
            >
              {deleteLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />}
              Delete Campaign
            </button>
          </div>
        </div>
      )}

      {/* ── Back button ── */}
      <button
        onClick={() => navigate(-1)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20,
          padding: "6px 12px", border: "1px solid var(--color-card-border)",
          borderRadius: 8, background: "transparent", cursor: "pointer",
          fontSize: "0.8rem", color: "var(--color-sidebar-text)",
        }}
      >
        <ArrowLeft size={14} /> Back
      </button>

      {/* ── Hero card ── */}
      <div style={{
        borderRadius: 16,
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f2027 100%)",
        padding: "32px 36px", marginBottom: 32, position: "relative", overflow: "hidden",
      }}>
        {/* decorative blobs */}
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.08)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -30, left: 120, width: 120, height: 120, borderRadius: "50%", background: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.05)", pointerEvents: "none" }} />

        {/* title row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20, position: "relative" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 6 }}>
              {role?.replace(/_/g, " ")} · Campaign
            </p>
            {titleEditing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setTitleEditing(false); }}
                  autoFocus
                  style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", lineHeight: 1.3, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, padding: "2px 10px", outline: "none", minWidth: 0, flex: 1 }}
                />
                <button onClick={saveTitle} disabled={titleSaving} style={{ background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 6, cursor: "pointer", padding: "4px 10px", color: "#86efac", fontSize: "0.78rem", fontWeight: 600, flexShrink: 0 }}>
                  {titleSaving ? "…" : "Save"}
                </button>
                <button onClick={() => setTitleEditing(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: 4, flexShrink: 0 }}>
                  <XIcon size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", lineHeight: 1.3, margin: 0 }}>
                  {ad.title}
                </h1>
                <button
                  onClick={() => { setTitleInput(ad.title); setTitleEditing(true); }}
                  title="Rename campaign"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.35)", padding: 4, flexShrink: 0, display: "flex", alignItems: "center" }}
                >
                  <Pencil size={14} />
                </button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <CampaignStatusBadge status={ad.status} />
            {role === "study_coordinator" && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)",
                  borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", color: "#f87171", fontSize: "0.8rem", fontWeight: 500,
                }}
              >
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </div>

        {/* stats row */}
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", position: "relative" }}>
          <div>
            <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Created</p>
            <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>{new Date(ad.created_at).toLocaleDateString()}</p>
          </div>
          {ad.budget && (
            <div>
              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Budget</p>
              <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>${ad.budget.toLocaleString()}</p>
            </div>
          )}
          {(ad.trial_start_date || ad.trial_end_date || ad.duration) && (
            <div>
              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Duration</p>
              {ad.trial_start_date && ad.trial_end_date ? (
                <>
                  <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff" }}>
                    {new Date(ad.trial_start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {" – "}
                    {new Date(ad.trial_end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  {ad.duration && (
                    <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{ad.duration.split("(")[0].trim()}</p>
                  )}
                </>
              ) : (
                <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>{ad.duration}</p>
              )}
            </div>
          )}
          {ad.patients_required && (
            <div>
              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Patients Required</p>
              <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>{ad.patients_required.toLocaleString()}</p>
            </div>
          )}
          {ad.platforms?.length > 0 && (
            <div>
              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Platforms</p>
              <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff" }}>{ad.platforms.join(" · ")}</p>
            </div>
          )}
          {ad.ad_type?.length > 0 && (
            <div>
              <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Type</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ad.ad_type.map((t) => <AdTypeChip key={t} type={t} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Page tab navigation ── */}
      <PageTabBar active={pageTab} onChange={setPageTab} showQuestionnaireDot={showQDot} role={role} adTypes={ad?.ad_type} />

      {/* ══ OVERVIEW tab ══════════════════════════════════════════════════════ */}
      {pageTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          <SectionCard title="Campaign Progress">
            <StatusTimeline status={ad.status} />
          </SectionCard>

          <SectionCard title="Campaign Details">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "20px" }}>
              <div>
                <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Campaign Type</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {ad.ad_type?.map((t) => <AdTypeChip key={t} type={t} />)}
                </div>
              </div>
              {(ad.campaign_category || qualifies) && (
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Category</p>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: "5px",
                    padding: "4px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 500,
                    border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)",
                    color: "var(--color-input-text)", textTransform: "capitalize",
                  }}>
                    <ClipboardList size={11} style={{ color: "var(--color-accent)" }} />
                    {ad.campaign_category ? ad.campaign_category.replace("_", " ") : "hiring / recruitment"}
                  </span>
                </div>
              )}
              {ad.target_audience && Object.values(ad.target_audience).some(Boolean) && (
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Target Audience</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {ad.target_audience.age_range && <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>Age: {ad.target_audience.age_range}</p>}
                    {ad.target_audience.gender    && <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>Gender: {ad.target_audience.gender}</p>}
                    {ad.target_audience.interests && <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>Interests: {ad.target_audience.interests}</p>}
                  </div>
                </div>
              )}
              {ad.patients_required && (
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Patients Required</p>
                  <p style={{ fontSize: "0.82rem", color: "var(--color-input-text)", fontWeight: 600 }}>
                    {ad.patients_required.toLocaleString()} patients
                  </p>
                </div>
              )}
              {(ad.trial_start_date || ad.trial_end_date) && (
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Trial Period</p>
                  {ad.trial_start_date && (
                    <p style={{ fontSize: "0.8rem", color: "var(--color-input-text)" }}>
                      <span style={{ fontWeight: 600 }}>Start:</span>{" "}
                      {new Date(ad.trial_start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                  {ad.trial_end_date && (
                    <p style={{ fontSize: "0.8rem", color: "var(--color-input-text)", marginTop: "2px" }}>
                      <span style={{ fontWeight: 600 }}>End:</span>{" "}
                      {new Date(ad.trial_end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                  {ad.duration && (
                    <p style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)", marginTop: "4px" }}>
                      {ad.duration.split("(")[0].trim()}
                    </p>
                  )}
                </div>
              )}
              {ad.trial_location?.length > 0 && (
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>Trial Locations</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {ad.trial_location.map((loc, i) => (
                      <p key={i} style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>
                        {[loc.city, loc.country].filter(Boolean).join(", ")}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Voicebot Info — read-only, voicebot campaigns only */}
          {ad.ad_type?.includes("voicebot") && (() => {
            const cfg = ad.bot_config || {};
            const isProvisioned = !!cfg.elevenlabs_agent_id;
            const voiceName = VOICE_CATALOGUE.find(v => v.id === cfg.voice_id)?.name || cfg.voice_id || "—";
            const convStyleLabel = cfg.conversation_style
              ? cfg.conversation_style.charAt(0).toUpperCase() + cfg.conversation_style.slice(1)
              : "—";
            return (
              <SectionCard title="Voice Agent" subtitle="Voicebot configuration for this campaign">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
                  {[
                    { label: "Agent Status",        value: isProvisioned ? "Provisioned" : "Not provisioned", accent: isProvisioned },
                    { label: "Agent Name",           value: cfg.bot_name || "—" },
                    { label: "Voice",                value: voiceName },
                    { label: "Conversation Style",   value: convStyleLabel },
                    { label: "Language",             value: cfg.language || "en" },
                    { label: "Phone Number",         value: cfg.voice_phone_number || "—" },
                  ].map(({ label, value, accent }) => (
                    <div key={label} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                      <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</p>
                      <p style={{ fontSize: "0.88rem", fontWeight: 600, color: accent ? "#22c55e" : "var(--color-input-text)" }}>{value}</p>
                    </div>
                  ))}
                </div>
                {cfg.first_message && (
                  <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                    <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Opening Message</p>
                    <p style={{ fontSize: "0.85rem", color: "var(--color-input-text)", fontStyle: "italic" }}>&ldquo;{cfg.first_message}&rdquo;</p>
                  </div>
                )}
              </SectionCard>
            );
          })()}

          {/* Trial Locations — study_coordinator only */}
          {role === "study_coordinator" && (
            <TrialLocationsCard
              ad={ad}
              companyLocations={companyLocations}
              onSave={(updated) => setAd(updated)}
            />
          )}

          {/* Protocol Docs + Budget Distribution — 2-col when both exist */}
          {(() => {
            const hasBudget = !!(ad.strategy_json?.budget_allocation && Object.keys(ad.strategy_json.budget_allocation).length > 0);
            return (
              <div style={{ display: "grid", gridTemplateColumns: hasBudget ? "1fr 1fr" : "1fr", gap: 16, alignItems: "start" }}>
                <SectionCard
                  title="Protocol Documents"
                  subtitle={protoDocs.length === 0 ? "No documents attached" : `${protoDocs.length} document${protoDocs.length > 1 ? "s" : ""} attached`}
                >
                  {protoDocs.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0" }}>
                      <FileText size={28} style={{ color: "var(--color-sidebar-text)", margin: "0 auto 8px", opacity: 0.5 }} />
                      <p style={{ fontSize: "0.82rem", color: "var(--color-sidebar-text)" }}>No protocol documents were uploaded for this campaign.</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {protoDocs.map((doc) => (
                        <div
                          key={doc.id}
                          onClick={() => doc.file_path && setPreviewDoc(doc)}
                          style={{
                            display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px",
                            borderRadius: "8px", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)",
                            cursor: doc.file_path ? "pointer" : "default", transition: "border-color 0.15s",
                          }}
                          onMouseEnter={(e) => { if (doc.file_path) e.currentTarget.style.borderColor = "var(--color-accent)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-card-border)"; }}
                        >
                          <div style={{ width: "32px", height: "32px", borderRadius: "6px", flexShrink: 0, backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <FileText size={14} style={{ color: "var(--color-accent)" }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</p>
                            <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                              {doc.doc_type?.replace(/_/g, " ")}{doc.file_path && ` · ${doc.file_path.split("/").pop()}`}
                            </p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            {doc.priority && (
                              <span style={{ fontSize: "0.65rem", fontWeight: 600, padding: "2px 6px", borderRadius: "4px", backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)", color: "var(--color-accent)", border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.2)" }}>
                                Priority {doc.priority}
                              </span>
                            )}
                            {doc.file_path && <Eye size={13} style={{ color: "var(--color-sidebar-text)" }} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
                {hasBudget && (
                  <SectionCard title="Budget Distribution">
                    <BudgetDonut strategy={ad.strategy_json} />
                  </SectionCard>
                )}
              </div>
            );
          })()}

          {/* Questionnaire callout */}
          {qualifies && (
            <div
              onClick={() => setPageTab("questionnaire")}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "18px 22px", borderRadius: 12, cursor: "pointer",
                border: questEmpty ? "1px solid rgba(245,158,11,0.4)" : "1px solid var(--color-card-border)",
                backgroundColor: questEmpty ? "rgba(245,158,11,0.05)" : "var(--color-card-bg)",
                transition: "border-color 0.15s",
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: questEmpty ? "rgba(245,158,11,0.12)" : "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
              }}>
                <ClipboardList size={18} style={{ color: questEmpty ? "#f59e0b" : "var(--color-accent)" }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--color-input-text)", margin: 0 }}>
                  Eligibility Questionnaire
                  {questEmpty && <span style={{ marginLeft: 8, fontSize: "0.72rem", fontWeight: 600, color: "#f59e0b" }}>· Needs setup</span>}
                </p>
                <p style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)", marginTop: 3 }}>
                  {questEmpty ? "No questions yet — click to set up" : `${ad.questionnaire.questions.length} question${ad.questionnaire.questions.length !== 1 ? "s" : ""} ready`}
                </p>
              </div>
              <ArrowLeft size={14} style={{ color: "var(--color-sidebar-text)", transform: "rotate(180deg)" }} />
            </div>
          )}

          {/* Generated Assets preview — shown to all roles whenever content exists */}
          {(ad.output_url || ad.output_files?.length > 0) && (
            <SectionCard title="Generated Assets" subtitle="Preview content produced for this campaign">
              {ad.output_url && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 18px", borderRadius: "10px", marginBottom: ad.output_files?.length > 0 ? "16px" : 0,
                  border: "1px solid rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.06)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Globe size={16} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)" }}>Landing Page</p>
                      <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: "2px" }}>Self-contained HTML · brand-styled · responsive</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <a href={adsAPI.websitePreviewUrl(id)} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600, backgroundColor: "var(--color-accent)", color: "#fff", textDecoration: "none", border: "none" }}>
                      <Eye size={13} /> Preview
                    </a>
                    <a href={adsAPI.websiteDownloadUrl(id)} download="landing-page.html" style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)", color: "var(--color-input-text)", textDecoration: "none" }}>
                      <Download size={13} /> Download
                    </a>
                  </div>
                </div>
              )}
              {ad.output_files?.length > 0 && (
                <div>
                  <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-sidebar-text)", marginBottom: "12px" }}>Ad Creatives ({ad.output_files.length})</p>
                  <CreativesViewer creatives={ad.output_files} />
                </div>
              )}
            </SectionCard>
          )}

        </div>
      )}

      {/* ══ STRATEGY tab ══════════════════════════════════════════════════════ */}
      {pageTab === "strategy" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Generate (draft) — Study Coordinator only */}
          {ad.status === "draft" && isStudyCoordinator && (
            <SectionCard
              title="Generate Marketing Strategy"
              subtitle="Analyses your company documents and campaign brief to create a tailored strategy"
            >
              {genError && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "16px" }}>
                  <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                  <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{genError}</p>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <ActionButton onClick={handleGenerateStrategy} loading={genLoading} icon={<Zap size={14} />}>
                  {genLoading ? "Generating…" : "Generate Strategy"}
                </ActionButton>
                {genLoading
                  ? <InlineProgress progress={genProgress.progress} />
                  : <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)" }}>Uses your trained Curator skill · typical time: 15–30 s</p>
                }
              </div>
            </SectionCard>
          )}

          {/* Strategy viewer */}
          {hasStrategy && (
            <SectionCard
              title="Marketing Strategy"
              subtitle="Generated from company and protocol documents"
            >
              {ad.strategy_json ? (
                <StrategyViewer strategy={ad.strategy_json} ad={ad} onRetry={isStudyCoordinator ? handleGenerateStrategy : undefined} />
              ) : (
                <p style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)" }}>Strategy is being generated…</p>
              )}
            </SectionCard>
          )}

          {/* Regenerate — Project Manager and Ethics Manager only */}
          {hasStrategy && canRegenerate && (
            <SectionCard
              title="Regenerate Strategy"
              subtitle="Replace the current strategy using your instructions"
            >
              {!regenOpen ? (
                <button
                  onClick={() => setRegenOpen(true)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "8px",
                    background: "none", border: "1px solid var(--color-card-border)",
                    borderRadius: "8px", padding: "7px 14px", cursor: "pointer",
                    color: "var(--color-sidebar-text)", fontSize: "0.8rem", fontWeight: 500,
                  }}
                >
                  <Sparkles size={13} style={{ color: "var(--color-accent)" }} />
                  Rewrite Strategy…
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.3)" }}>
                    <Sparkles size={14} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", lineHeight: 1.5 }}>
                      This will <strong style={{ color: "var(--color-input-text)" }}>replace the entire strategy</strong> using your instructions as guidance. The current strategy will be overwritten and the change will appear in the audit trail.
                    </p>
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sidebar-text)", display: "block", marginBottom: "6px" }}>Your Instructions *</label>
                    <textarea
                      style={{
                        width: "100%", padding: "8px 12px", borderRadius: "8px", fontSize: "0.85rem",
                        border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-input-bg)",
                        color: "var(--color-input-text)", outline: "none", boxSizing: "border-box",
                        resize: "vertical", minHeight: "110px", fontFamily: "inherit",
                      }}
                      value={regenInstr}
                      onChange={(e) => setRegenInstr(e.target.value)}
                      placeholder="e.g. Shift focus from social media to B2B channels. Reduce influencer spend to under 10%. Keep the same target audience but adopt a more professional tone."
                    />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={regenConfirmed}
                      onChange={(e) => setRegenConfirmed(e.target.checked)}
                      style={{ width: 15, height: 15, accentColor: "var(--color-accent)", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>
                      I understand the current strategy will be permanently replaced
                    </span>
                  </label>
                  {regenError && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                      <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
                      <p style={{ fontSize: "0.82rem", color: "#ef4444" }}>{regenError}</p>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <ActionButton onClick={handleRegenStrategy} loading={regenLoading} disabled={!regenConfirmed} icon={<Sparkles size={14} />}>
                      {regenLoading ? "Re-writing… (15–30 s)" : "Trigger AI Re-Strategy"}
                    </ActionButton>
                    {regenLoading
                      ? <InlineProgress progress={genProgress.progress} />
                      : (
                        <button
                          onClick={() => { setRegenOpen(false); setRegenError(null); setRegenInstr(""); setRegenConfirmed(false); }}
                          className="btn--ghost"
                          style={{ fontSize: "0.8rem" }}
                        >
                          Cancel
                        </button>
                      )
                    }
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* Submit for review — Study Coordinator only */}
          {ad.status === "strategy_created" && isStudyCoordinator && (
            <SectionCard
              title="Submit for Review"
              subtitle="The Reviewer AI will analyse the strategy and prepare website requirements and ad specifications"
            >
              {revError && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "16px" }}>
                  <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                  <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{revError}</p>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <ActionButton onClick={handleSubmitForReview} loading={revLoading} variant="primary" icon={<Send size={14} />}>
                  {revLoading ? "Processing…" : "Submit for AI Review"}
                </ActionButton>
                {revLoading && <InlineProgress progress={genProgress.progress} />}
              </div>
            </SectionCard>
          )}

          {/* Generating spinner — shown while background task is running */}
          {!hasStrategy && ad.status === "generating" && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ display: "inline-block", width: 32, height: 32, border: "3px solid var(--color-card-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 12 }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>Generating strategy… this usually takes 1–2 minutes.</p>
            </div>
          )}

          {/* Empty state */}
          {!hasStrategy && ad.status !== "draft" && ad.status !== "generating" && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Layers size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>Strategy not yet generated for this campaign.</p>
            </div>
          )}

        </div>
      )}

      {/* ══ QUESTIONNAIRE tab ═════════════════════════════════════════════════ */}
      {pageTab === "questionnaire" && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-input-text)", margin: 0 }}>
              Eligibility Questionnaire
            </h2>
            <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", marginTop: 4 }}>
              {ad.campaign_category ? ad.campaign_category.replace("_", " ") + " campaign" : "Campaign"} — define the questions participants will answer
            </p>
          </div>
          <QuestionnaireSection
            adId={id}
            questionnaire={ad.questionnaire}
            readOnly={isPublisher}
            showAI={isStudyCoordinator}
            onSaved={load}
          />
        </div>
      )}

      {/* ══ REVIEW tab ════════════════════════════════════════════════════════ */}
      {pageTab === "review" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {canReview && (
            <SectionCard title="Submit Review">
              <ReviewPanel adId={id} onSubmitted={handleReviewSubmitted} />
            </SectionCard>
          )}

          {(ad.website_reqs || ad.ad_details) && (
            <SectionCard title="Reviewer Output" subtitle="Structured requirements extracted by the Reviewer AI">
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {ad.website_reqs && (
                  <div>
                    <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-accent)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Globe size={12} /> Website Requirements
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
                      {Object.entries(ad.website_reqs).map(([key, val]) => (
                        <div key={key} style={{ padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)" }}>
                          <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "capitalize", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>{key.replace(/_/g, " ")}</p>
                          <GenericValue value={val} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {ad.ad_details && (
                  <div>
                    <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-accent)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Layers size={12} /> Ad Specifications
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
                      {Object.entries(ad.ad_details).map(([key, val]) => (
                        <div key={key} style={{ padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)" }}>
                          <p style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "capitalize", color: "var(--color-sidebar-text)", marginBottom: "6px" }}>{key.replace(/_/g, " ")}</p>
                          <GenericValue value={val} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {!canReview && !(ad.website_reqs || ad.ad_details) && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <ClipboardCheck size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>
                Campaign is <strong style={{ color: "var(--color-input-text)" }}>{ad.status}</strong> — no review activity yet.
              </p>
            </div>
          )}

        </div>
      )}

      {/* ══ HISTORY tab ═══════════════════════════════════════════════════════ */}
      {pageTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {reviews.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <History size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>No review history yet.</p>
            </div>
          ) : (
            <SectionCard
              title="Review History"
              subtitle={`${reviews.length} entr${reviews.length !== 1 ? "ies" : "y"} on record`}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ══ PARTICIPANTS tab ══════════════════════════════════════════════════ */}
      {pageTab === "participants" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {selectedParticipant ? (
            /* ── Detail view ── */
            <SectionCard
              title={selectedParticipant.full_name}
              subtitle={`Submitted ${new Date(selectedParticipant.created_at).toLocaleString()}`}
            >
              <button
                onClick={() => { setSelectedParticipant(null); setParticipantAppointments([]); }}
                className="btn--ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem", marginBottom: 20 }}
              >
                <ArrowLeft size={13} /> Back to list
              </button>

              {/* Personal details */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
                {[
                  { label: "Full Name",    value: selectedParticipant.full_name },
                  { label: "Age",          value: selectedParticipant.age },
                  { label: "Sex",          value: selectedParticipant.sex.replace(/_/g, " ") },
                  { label: "Phone",        value: selectedParticipant.phone },
                  { label: "Eligibility",  value: selectedParticipant.is_eligible === true ? "Eligible" : selectedParticipant.is_eligible === false ? "Not Eligible" : "Unknown" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                    <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</p>
                    <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--color-input-text)" }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Voice call transcript */}
              {selectedParticipant.voice_sessions?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                    Voice Call Transcript
                  </p>
                  {selectedParticipant.voice_sessions.map((vs) => (
                    <div key={vs.id} style={{ border: "1px solid var(--color-card-border)", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
                      {/* Session header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", backgroundColor: "var(--color-page-bg)", borderBottom: vs.transcripts?.length > 0 ? "1px solid var(--color-card-border)" : "none" }}>
                        <Phone size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)" }}>
                          {vs.phone || "Unknown number"}
                        </span>
                        <span style={{
                          marginLeft: "auto", fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                          backgroundColor: vs.status === "ended" ? "rgba(34,197,94,0.12)" : vs.status === "failed" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.12)",
                          color: vs.status === "ended" ? "#16a34a" : vs.status === "failed" ? "#dc2626" : "#b45309",
                        }}>
                          {vs.status}
                        </span>
                        {vs.duration_seconds != null && (
                          <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                            {Math.floor(vs.duration_seconds / 60)}m {vs.duration_seconds % 60}s
                          </span>
                        )}
                        <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                          {new Date(vs.started_at).toLocaleString()}
                        </span>
                      </div>
                      {/* Transcript turns */}
                      {vs.transcripts?.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 360, overflowY: "auto", padding: "12px 16px" }}>
                          {[...vs.transcripts].sort((a, b) => (a.turn_index ?? 0) - (b.turn_index ?? 0)).map((turn, ti) => (
                            <div key={ti} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                              <span style={{
                                flexShrink: 0, width: 44, fontSize: "0.68rem", fontWeight: 700, textAlign: "right",
                                paddingTop: 3,
                                color: turn.speaker === "agent" ? "var(--color-accent)" : "var(--color-sidebar-text)",
                                textTransform: "uppercase",
                              }}>
                                {turn.speaker === "agent" ? "Agent" : "User"}
                              </span>
                              <div style={{
                                flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: "0.83rem", lineHeight: 1.5,
                                backgroundColor: turn.speaker === "agent" ? "rgba(var(--accent-rgb, 16,185,129), 0.07)" : "var(--color-page-bg)",
                                border: "1px solid var(--color-card-border)",
                                color: "var(--color-input-text)",
                              }}>
                                {turn.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: "0.8rem", color: "var(--color-sidebar-text)", padding: "12px 16px" }}>
                          No transcript available yet.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Appointment details */}
              {participantAppointments.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                    Appointments
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {participantAppointments.map((appt) => (
                      <div key={appt.id} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                        {[
                          { label: "Date",     value: new Date(appt.slot_datetime).toLocaleDateString() },
                          { label: "Time",     value: new Date(appt.slot_datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
                          { label: "Duration", value: `${appt.duration_minutes} min` },
                          { label: "Status",   value: appt.status.charAt(0).toUpperCase() + appt.status.slice(1) },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{label}</p>
                            <p style={{ fontSize: "0.88rem", fontWeight: 600, color: appt.status === "confirmed" && label === "Status" ? "#16a34a" : appt.status === "cancelled" && label === "Status" ? "#dc2626" : "var(--color-input-text)" }}>{value}</p>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Survey answers */}
              {selectedParticipant.answers?.length > 0 && (
                <>
                  <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                    Survey Answers
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {selectedParticipant.answers.map((ans, i) => (
                      <div key={i} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                        <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)", marginBottom: 6 }}>
                          Q{i + 1}. {ans.question_text}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 600,
                            backgroundColor: ans.is_eligible === true ? "rgba(34,197,94,0.12)" : ans.is_eligible === false ? "rgba(239,68,68,0.1)" : "rgba(107,114,128,0.1)",
                            color: ans.is_eligible === true ? "#16a34a" : ans.is_eligible === false ? "#dc2626" : "var(--color-sidebar-text)",
                          }}>
                            {ans.selected_option}
                          </span>
                          {ans.is_eligible === true && <CheckCircle2 size={13} style={{ color: "#16a34a" }} />}
                          {ans.is_eligible === false && <AlertCircle size={13} style={{ color: "#dc2626" }} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
          ) : (
            <>
            {/* ── List view ── */}
            <SectionCard
              title="Participants"
              subtitle="People who completed the survey and submitted their details"
            >
              {/* Sync transcripts button — only relevant for voicebot campaigns */}
              {ad.ad_type?.includes("voicebot") && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <button
                    onClick={handleSyncTranscripts}
                    disabled={syncingTranscripts}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "7px 14px", borderRadius: 8, border: "1px solid var(--color-card-border)",
                      backgroundColor: "var(--color-card-bg)", cursor: syncingTranscripts ? "not-allowed" : "pointer",
                      fontSize: "0.8rem", fontWeight: 600, color: "var(--color-input-text)",
                      opacity: syncingTranscripts ? 0.6 : 1, transition: "opacity 0.15s",
                    }}
                  >
                    {syncingTranscripts
                      ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Syncing…</>
                      : <><RefreshCw size={13} /> Sync Transcripts</>}
                  </button>
                  {syncResult && !syncResult.error && (
                    <span style={{ fontSize: "0.78rem", color: "#16a34a" }}>
                      ✓ {syncResult.synced} synced, {syncResult.skipped} already up-to-date
                    </span>
                  )}
                  {syncResult?.error && (
                    <span style={{ fontSize: "0.78rem", color: "#dc2626" }}>{syncResult.error}</span>
                  )}
                </div>
              )}
              {participantsLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "32px 0", justifyContent: "center" }}>
                  <Loader2 size={18} style={{ animation: "spin 1s linear infinite", color: "var(--color-accent)" }} />
                  <p style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)" }}>Loading participants…</p>
                </div>
              ) : participants.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <Users size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
                  <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>No participants yet.</p>
                  <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.78rem", marginTop: 4 }}>
                    Responses will appear here once people complete the survey.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: 10, border: "1px solid var(--color-card-border)", overflow: "hidden" }}>
                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.5fr 1fr 32px 40px", gap: 0, padding: "10px 16px", backgroundColor: "var(--color-page-bg)", borderBottom: "1px solid var(--color-card-border)" }}>
                    {["Name", "Age", "Sex", "Phone", "Eligibility", "", ""].map((h) => (
                      <span key={h} style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-sidebar-text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
                    ))}
                  </div>
                  {/* Rows */}
                  {participants.map((p, idx) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedParticipant(p);
                        setParticipantAppointments([]);
                        appointmentsAPI.list(id)
                          .then((all) => setParticipantAppointments((all || []).filter((a) => a.survey_response_id === p.id)))
                          .catch(() => {});
                      }}
                      style={{
                        display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.5fr 1fr 32px 40px",
                        gap: 0, padding: "12px 16px", cursor: "pointer",
                        borderBottom: idx < participants.length - 1 ? "1px solid var(--color-card-border)" : "none",
                        backgroundColor: "var(--color-card-bg)",
                        transition: "background-color 0.1s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-page-bg)"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--color-card-bg)"}
                    >
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.full_name}</span>
                      <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>{p.age}</span>
                      <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)", textTransform: "capitalize" }}>{p.sex.replace(/_/g, " ")}</span>
                      <span style={{ fontSize: "0.82rem", color: "var(--color-input-text)" }}>{p.phone}</span>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: "0.75rem", fontWeight: 600,
                        color: p.is_eligible === true ? "#16a34a" : p.is_eligible === false ? "#dc2626" : "var(--color-sidebar-text)",
                      }}>
                        {p.is_eligible === true && <CheckCircle2 size={12} />}
                        {p.is_eligible === false && <AlertCircle size={12} />}
                        {p.is_eligible === true ? "Eligible" : p.is_eligible === false ? "Not Eligible" : "Unknown"}
                      </span>
                      {/* Voice call indicator */}
                      {p.voice_sessions?.length > 0 ? (
                        <Phone size={13} style={{ color: "var(--color-accent)", alignSelf: "center" }} title="Has voice call transcript" />
                      ) : (
                        <span />
                      )}
                      <ChevronDown size={14} style={{ color: "var(--color-sidebar-text)", transform: "rotate(-90deg)" }} />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {/* Conversation History — voicebot campaigns only */}
            {ad.ad_type?.includes("voicebot") && (
              <SectionCard title="Conversation History" subtitle="Past voice sessions from the voicebot">
                {convHistoryLoading ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-sidebar-text)", fontSize: "0.82rem" }}>
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Loading…
                  </div>
                ) : convHistory.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0" }}>
                    <PhoneCall size={28} style={{ color: "var(--color-card-border)", margin: "0 auto 10px" }} />
                    <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.85rem" }}>No conversations yet.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {convHistory.map(c => (
                      <div
                        key={c.conversation_id}
                        onClick={() => handleSelectConvHistory(c)}
                        style={{
                          padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                          border: `1px solid ${selectedConvHistory?.conversation_id === c.conversation_id ? "var(--color-accent)" : "var(--color-card-border)"}`,
                          backgroundColor: "var(--color-card-bg)", transition: "border-color 0.15s",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)", fontFamily: "ui-monospace, monospace" }}>
                            {c.conversation_id?.slice(0, 16)}…
                          </p>
                          <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", textTransform: "capitalize" }}>{c.status}</span>
                        </div>
                        {c.start_time && (
                          <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: 2 }}>
                            {new Date(c.start_time * 1000).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Transcript viewer */}
                {selectedConvHistory && (
                  <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--color-input-text)" }}>Transcript</p>
                      <button onClick={() => setSelectedConvHistory(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", padding: 4 }}>
                        <XIcon size={14} />
                      </button>
                    </div>
                    {convTransLoading ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-sidebar-text)", fontSize: "0.78rem" }}>
                        <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Loading transcript…
                      </div>
                    ) : convTranscript ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
                        {(convTranscript.transcript || []).map((turn, i) => (
                          <div key={i} style={{ display: "flex", gap: 10 }}>
                            <span style={{
                              fontSize: "0.7rem", fontWeight: 700, minWidth: 40, flexShrink: 0, marginTop: 2,
                              color: turn.role === "agent" ? "var(--color-accent)" : "var(--color-sidebar-text)",
                            }}>
                              {turn.role === "agent" ? "Agent" : "User"}
                            </span>
                            <p style={{ fontSize: "0.78rem", color: "var(--color-input-text)", lineHeight: 1.55, margin: 0 }}>
                              {turn.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)" }}>No transcript data.</p>
                    )}
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={() => {
                      setConvHistoryLoading(true);
                      adsAPI.listVoiceConversations(id)
                        .then((r) => setConvHistory(r.conversations || []))
                        .catch(() => {})
                        .finally(() => setConvHistoryLoading(false));
                    }}
                    className="btn--ghost"
                    style={{ fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>
              </SectionCard>
            )}
            </>
          )}
        </div>
      )}

      {/* ══ PUBLISH tab ═══════════════════════════════════════════════════════ */}
      {pageTab === "publish" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Generate Ad Creatives */}
          {(canRegenerate ? ad.status !== "draft" : !!ad.output_files?.length) && (
            <SectionCard
              title="Ad Creatives"
              subtitle="Campaign copy and visuals produced from your strategy"
            >
              {creativeError && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "16px" }}>
                  <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                  <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{creativeError}</p>
                </div>
              )}
              {canRegenerate && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: ad.output_files?.length ? "24px" : 0 }}>
                  <ActionButton onClick={handleGenerateCreatives} loading={creativeLoading} icon={<Sparkles size={14} />}>
                    {creativeLoading ? "Generating…" : ad.output_files?.length ? "Regenerate Creatives" : "Generate Ad Creatives"}
                  </ActionButton>
                  {creativeLoading
                    ? <InlineProgress progress={genProgress.progress} />
                    : !ad.output_files?.length && (
                        <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)" }}>
                          Generates copy + images for all ad formats using AI
                        </p>
                      )
                  }
                </div>
              )}
              {ad.output_files?.length > 0 && <CreativesViewer creatives={ad.output_files} />}
            </SectionCard>
          )}

          {/* Generate Website */}
          {ad.ad_type?.includes("website") && (canRegenerate ? ad.status !== "draft" : !!ad.output_url) && (
            <SectionCard
              title="Landing Page"
              subtitle="Brand-styled HTML page generated from your strategy and website requirements"
            >
              {websiteError && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "16px" }}>
                  <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                  <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{websiteError}</p>
                </div>
              )}
              {canRegenerate && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: ad.output_url ? "20px" : 0 }}>
                  <ActionButton onClick={handleGenerateWebsite} loading={websiteLoading} icon={<Globe size={14} />}>
                    {websiteLoading ? "Generating…" : ad.output_url ? "Regenerate Website" : "Generate Website"}
                  </ActionButton>
                  {websiteLoading
                    ? <InlineProgress progress={genProgress.progress} />
                    : !ad.output_url && (
                        <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)" }}>
                          Generates a self-contained HTML page · uses brand kit + strategy
                        </p>
                      )
                  }
                </div>
              )}
              {ad.output_url && (
                <>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 18px", borderRadius: "10px",
                    border: "1px solid rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.06)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Globe size={16} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)" }}>Landing page ready</p>
                        <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: "2px" }}>Self-contained HTML · brand-styled · responsive</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <a href={adsAPI.websitePreviewUrl(id)} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600, backgroundColor: "var(--color-accent)", color: "#fff", textDecoration: "none", border: "none" }}>
                        <Eye size={13} /> Preview
                      </a>
                      <a href={adsAPI.websiteDownloadUrl(id)} download="landing-page.html" style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 14px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600, border: "1px solid var(--color-card-border)", backgroundColor: "var(--color-card-bg)", color: "var(--color-input-text)", textDecoration: "none" }}>
                        <Download size={13} /> Download
                      </a>
                      {isPublisher && (
                        <ActionButton onClick={handleHostPage} loading={hostLoading} icon={<Globe size={13} />}>
                          {hostLoading ? "Hosting…" : ad.hosted_url ? "Re-host" : "Host"}
                        </ActionButton>
                      )}
                    </div>
                  </div>
                  {isPublisher && hostError && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginTop: "12px" }}>
                      <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                      <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{hostError}</p>
                    </div>
                  )}
                  {isPublisher && ad.hosted_url && (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "12px", padding: "10px 14px", borderRadius: "8px", backgroundColor: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
                      <Globe size={14} style={{ color: "#22c55e", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginBottom: "2px" }}>Hosted at</p>
                        <a href={ad.hosted_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.82rem", color: "var(--color-accent)", wordBreak: "break-all", textDecoration: "none", fontWeight: 500 }}>
                          {window.location.origin}{ad.hosted_url}
                        </a>
                      </div>
                      <button onClick={() => navigator.clipboard.writeText(window.location.origin + ad.hosted_url)} title="Copy URL" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-sidebar-text)", padding: "4px", flexShrink: 0 }}>
                        <Copy size={13} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </SectionCard>
          )}

          {/* Publish — Publisher only */}
          {ad.status === "approved" && isPublisher && (
            <SectionCard title="Publish Campaign" subtitle="Campaign has been approved — ready to go live">
              {pubError && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: "16px" }}>
                  <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                  <p style={{ fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{pubError}</p>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <ActionButton onClick={handlePublish} loading={pubLoading} icon={<Zap size={14} />}>
                  {pubLoading ? "Publishing…" : "Publish Campaign"}
                </ActionButton>
                {pubLoading && <InlineProgress progress={genProgress.progress} />}
              </div>
            </SectionCard>
          )}

          {/* Analytics */}
          {isPublished && (
            <SectionCard title="Analytics" subtitle="Campaign is live — view performance data">
              <Link to="/study-coordinator/analytics" className="btn--accent" style={{ display: "inline-flex" }}>
                View Analytics
              </Link>
            </SectionCard>
          )}

          {/* Empty states */}
          {isPublisher && ad.status !== "approved" && ad.status !== "published" && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Zap size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>
                Campaign must be <strong style={{ color: "var(--color-input-text)" }}>approved</strong> before publishing.
              </p>
            </div>
          )}
          {isStudyCoordinator && ad.status === "draft" && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Zap size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>
                Generate a <strong style={{ color: "var(--color-input-text)" }}>strategy</strong> first to unlock preview.
              </p>
            </div>
          )}
          {isStudyCoordinator && ad.status !== "draft" && !ad.output_files?.length && !ad.output_url && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Eye size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>
                No preview content yet. Ad creatives and the landing page will appear here once generated.
              </p>
            </div>
          )}
          {canRegenerate && ad.status === "draft" && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Layers size={32} style={{ color: "var(--color-card-border)", margin: "0 auto 12px" }} />
              <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.9rem" }}>
                A <strong style={{ color: "var(--color-input-text)" }}>strategy</strong> must be generated before creatives can be produced.
              </p>
            </div>
          )}

        </div>
      )}

      {/* ── Footer refresh ── */}
      <div style={{ paddingTop: 32, paddingBottom: 24 }}>
        <button
          onClick={() => { setLoading(true); load(); }}
          className="btn--ghost"
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem" }}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

    </PageWithSidebar>

    {previewDoc && <DocPreviewModal doc={previewDoc} adId={id} onClose={() => setPreviewDoc(null)} />}
    </>
  );
}
