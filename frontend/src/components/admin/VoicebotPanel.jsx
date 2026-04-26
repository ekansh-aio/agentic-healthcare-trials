import React, { useState, useEffect, useCallback, useRef } from "react";
import { SectionCard } from "../shared/Layout";
import { adsAPI } from "../../services/api";
import ConversationAnalysis from "./campaign/ConversationAnalysis";
import {
  Bot, Mic, PhoneCall, PhoneOff, Volume2, Wand2,
  Zap, Trash2, Check, CheckCircle2, Loader2, RefreshCw,
  X as XIcon,
} from "lucide-react";

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

export const VOICE_CATALOGUE = [
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", desc: "Warm · friendly · Australian female" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", desc: "Casual · approachable · Australian male" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura",   desc: "Upbeat · energetic · Australian female" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris",   desc: "Professional · measured · Australian male" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Aimee",  desc: "Friendly · natural · Australian female" },
];
const CONV_STYLES = ["professional", "friendly", "casual", "formal", "empathetic", "energetic"];
const VOICE_LANGUAGES = [
  { code: "en",    label: "English" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es",    label: "Spanish" },
  { code: "fr",    label: "French" },
  { code: "de",    label: "German" },
  { code: "it",    label: "Italian" },
  { code: "pt",    label: "Portuguese" },
  { code: "hi",    label: "Hindi" },
  { code: "ja",    label: "Japanese" },
  { code: "zh",    label: "Chinese" },
];

// Live voice widget — native WebSocket + Web Audio (no external SDK)
// Implements the ElevenLabs ConvAI WebSocket protocol directly:
//   • Captures mic at 16 kHz mono PCM-16, sends as base64 user_audio_chunk msgs
//   • Plays back base64 PCM-16 audio chunks received from ElevenLabs
//   • Handles interruption events (stops all queued sources) and ping/pong keepalive
function LiveVoiceWidget({ adId, isProvisioned }) {
  const [status,     setStatus]     = useState("idle"); // idle | connecting | connected
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error,      setError]      = useState(null);

  const wsRef        = useRef(null);
  const ctxRef       = useRef(null);
  const processorRef = useRef(null);
  const streamRef    = useRef(null);
  const schedRef     = useRef(0);
  const sourcesRef   = useRef([]);
  const closingRef   = useRef(false);
  const isSpeakingRef = useRef(false);

  const stopAllSources = useCallback(() => {
    sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    sourcesRef.current = [];
  }, []);

  const cleanupAudio = useCallback(() => {
    stopAllSources();
    if (processorRef.current) { try { processorRef.current.disconnect(); } catch {} processorRef.current = null; }
    if (streamRef.current)    { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (ctxRef.current)       { try { ctxRef.current.close(); } catch {} ctxRef.current = null; }
    schedRef.current = 0;
    isSpeakingRef.current = false;
    setIsSpeaking(false);
  }, [stopAllSources]);

  const stop = useCallback(() => {
    closingRef.current = true;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    cleanupAudio();
    setStatus("idle");
  }, [cleanupAudio]);

  useEffect(() => () => {
    closingRef.current = true;
    if (wsRef.current) wsRef.current.close();
    cleanupAudio();
  }, [cleanupAudio]);

  // Decode base64 PCM-16 chunk from ElevenLabs and schedule for playback
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
      sourcesRef.current.push(src);
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      src.onended = () => {
        sourcesRef.current = sourcesRef.current.filter(s => s !== src);
        if (!ctxRef.current || schedRef.current <= ctxRef.current.currentTime + 0.05) {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
        }
      };
    } catch {}
  }, []);

  const start = async () => {
    setStatus("connecting"); setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone not available — this feature requires HTTPS or localhost.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const { signed_url } = await adsAPI.getVoiceSessionToken(adId);

      const ctx = new AudioContext({ sampleRate: 16000 });
      ctxRef.current = ctx;

      closingRef.current = false;
      const ws = new WebSocket(signed_url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");

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
          for (let i = 0; i < f32.length; i++) {
            i16[i] = Math.round(Math.max(-1, Math.min(1, f32[i])) * 32767);
          }
          const u8 = new Uint8Array(i16.buffer);
          let b64 = "";
          for (let i = 0; i < u8.length; i += 8192) {
            b64 += String.fromCharCode(...u8.subarray(i, Math.min(i + 8192, u8.length)));
          }
          wsRef.current.send(JSON.stringify({ user_audio_chunk: btoa(b64) }));
        };
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "audio" && msg.audio_event?.audio_base_64) {
            playPCM(msg.audio_event.audio_base_64);
          } else if (msg.type === "interruption") {
            stopAllSources();
            schedRef.current = ctxRef.current?.currentTime ?? 0;
            isSpeakingRef.current = false;
            setIsSpeaking(false);
          } else if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", event_id: msg.ping_event?.event_id }));
          }
        } catch {}
      };

      ws.onerror = () => {
        stop();
        setError("Connection failed — check that the agent is provisioned and try again.");
      };
      ws.onclose = (evt) => {
        if (!closingRef.current) {
          cleanupAudio();
          setStatus("idle");
          if (evt.code !== 1000) {
            setError(`Session ended unexpectedly (code ${evt.code}) — try re-provisioning the agent.`);
          }
        }
        closingRef.current = false;
      };
    } catch (err) {
      cleanupAudio();
      setStatus("idle");
      if (err.name === "NotAllowedError") {
        setError("Microphone access denied — allow microphone access and try again.");
      } else {
        setError(err.message || "Failed to start session.");
      }
    }
  };

  if (!isProvisioned) {
    return (
      <div style={{ padding: "28px 0", textAlign: "center" }}>
        <Bot size={28} style={{ color: "var(--color-card-border)", margin: "0 auto 10px" }} />
        <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.85rem" }}>
          Provision the agent above before starting a voice session.
        </p>
      </div>
    );
  }

  if (status === "connected") {
    return (
      <div>
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "16px 18px", borderRadius: 10, marginBottom: 16,
          border: "1px solid rgba(34,197,94,0.25)",
          backgroundColor: "rgba(34,197,94,0.04)",
        }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              backgroundColor: "rgba(34,197,94,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {isSpeaking
                ? <Volume2 size={20} style={{ color: "#22c55e" }} />
                : <Mic     size={20} style={{ color: "#22c55e" }} />}
            </div>
            {isSpeaking && (
              <div style={{
                position: "absolute", inset: -5, borderRadius: "50%",
                border: "2px solid rgba(34,197,94,0.4)",
                animation: "pulse 1.2s ease-in-out infinite",
              }} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--color-input-text)" }}>
              {isSpeaking ? "Agent is speaking…" : "Listening — speak into your microphone"}
            </p>
            <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: 2 }}>
              Voice session active · live audio streaming
            </p>
          </div>
        </div>
        <ActionButton onClick={stop} variant="ghost" icon={<PhoneOff size={14} />}>
          End Session
        </ActionButton>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <ActionButton onClick={start} loading={status === "connecting"} icon={<PhoneCall size={14} />}>
          {status === "connecting" ? "Connecting…" : "Start Voice Session"}
        </ActionButton>
        {status === "idle" && (
          <p style={{ fontSize: "0.75rem", color: "var(--color-sidebar-text)" }}>
            Microphone access required
          </p>
        )}
      </div>
      {error && (
        <div style={{ padding: "8px 12px", borderRadius: 7, fontSize: "0.78rem", color: "#ef4444", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default function VoicebotPanel({ ad, adId, isPublisher, isStudyCoordinator, onConfigSaved }) {
  const canEdit = isPublisher || isStudyCoordinator;
  const cfg     = ad.bot_config || {};

  const [voiceId,    setVoiceId]    = useState(cfg.voice_id            || "XrExE9yKIg1WjnnlVkGX");
  const [firstMsg,   setFirstMsg]   = useState(cfg.first_message       || "[takes a breath] Hi, this is Matilda with [Organization]. [short pause] We're enrolling volunteers for a clinical trial focused on [condition]. [short pause] Participation is voluntary, and, um, I can explain what's involved if you're interested.");
  const [language,   setLanguage]   = useState(cfg.language            || "en");
  const [botName,    setBotName]    = useState(cfg.bot_name            || "");
  const [convStyle,  setConvStyle]  = useState(cfg.conversation_style  || "professional");
  const [compliance, setCompliance] = useState(cfg.compliance_notes    || "");

  // Persisted recommendation from strategy generation (_voice_rec in bot_config)
  const storedRec = cfg._voice_rec || null;

  // AI recommendation (manual re-run)
  const [recLoading, setRecLoading] = useState(false);
  const [recError,   setRecError]   = useState(null);
  const [recReason,  setRecReason]  = useState(
    storedRec ? `${storedRec.voice_name}: ${storedRec.reason}` : null
  );

  // Save config
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError,   setSaveError]   = useState(null);
  const [saveDone,    setSaveDone]    = useState(false);

  // Agent provisioning
  const [agentStatus,      setAgentStatus]      = useState(null);
  const [statusLoading,    setStatusLoading]    = useState(true);
  const [provisionLoading, setProvisionLoading] = useState(false);
  const [provisionError,   setProvisionError]   = useState(null);

  // Conversation history
  const [conversations, setConversations] = useState([]);
  const [convsLoading,  setConvsLoading]  = useState(false);
  const [convsError,    setConvsError]    = useState(null);
  const [selectedConv,  setSelectedConv]  = useState(null);
  // Map of conversation_id → { transcript, loading, error }
  const [transcriptMap, setTranscriptMap] = useState({});

  useEffect(() => {
    loadAgentStatus();
    loadConversations();
  }, [adId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAgentStatus = async () => {
    setStatusLoading(true);
    try { setAgentStatus(await adsAPI.getVoiceAgentStatus(adId)); } catch {}
    setStatusLoading(false);
  };

  const loadConversations = async () => {
    setConvsLoading(true);
    try {
      const r = await adsAPI.listVoiceConversations(adId);
      setConversations(r.conversations || []);
    } catch (e) { setConvsError(e.message); }
    setConvsLoading(false);
  };

  const handleRecommend = async () => {
    setRecLoading(true); setRecError(null); setRecReason(null);
    try {
      const rec = await adsAPI.getVoiceRecommendation(adId);
      setVoiceId(rec.voice_id);
      setConvStyle(rec.conversation_style);
      setFirstMsg(rec.first_message);
      setRecReason(`${rec.voice_name}: ${rec.reason}`);
    } catch (e) { setRecError(e.message); }
    setRecLoading(false);
  };

  const handleSaveConfig = async () => {
    setSaveLoading(true); setSaveError(null); setSaveDone(false);
    try {
      await adsAPI.updateBotConfig(adId, {
        voice_id:           voiceId,
        first_message:      firstMsg,
        language,
        bot_name:           botName   || undefined,
        conversation_style: convStyle,
        compliance_notes:   compliance || undefined,
      });
      setSaveDone(true);
      if (onConfigSaved) onConfigSaved();
    } catch (e) { setSaveError(e.message); }
    setSaveLoading(false);
  };

  const handleProvision = async () => {
    setProvisionLoading(true); setProvisionError(null);
    try {
      await adsAPI.provisionVoiceAgent(adId);
      await loadAgentStatus();
    } catch (e) { setProvisionError(e.message); }
    setProvisionLoading(false);
  };

  const handleDeleteAgent = async () => {
    setProvisionLoading(true); setProvisionError(null);
    try {
      await adsAPI.deleteVoiceAgent(adId);
      setAgentStatus({ provisioned: false });
    } catch (e) { setProvisionError(e.message); }
    setProvisionLoading(false);
  };

  const handleSelectConv = async (conv) => {
    const id = conv.conversation_id;
    if (selectedConv?.conversation_id === id) {
      setSelectedConv(null); return;
    }
    setSelectedConv(conv);
    if (!transcriptMap[id]) {
      setTranscriptMap(prev => ({ ...prev, [id]: { loading: true, data: null, error: null, analysis: null, analysisLoading: false, analysisError: null, audioUrl: null, audioLoading: true } }));
      // Fetch transcript and audio in parallel
      const [transcriptResult, audioResult] = await Promise.allSettled([
        adsAPI.getVoiceTranscript(id),
        adsAPI.fetchVoiceRecording(id).then(blob => URL.createObjectURL(blob)),
      ]);
      setTranscriptMap(prev => ({
        ...prev,
        [id]: {
          ...prev[id],
          loading: false,
          data: transcriptResult.status === "fulfilled" ? transcriptResult.value : null,
          error: transcriptResult.status === "rejected" ? transcriptResult.reason?.message : null,
          audioUrl: audioResult.status === "fulfilled" ? audioResult.value : null,
          audioLoading: false,
        },
      }));
    }
  };

  const handleAnalyzeConv = async (conversationId) => {
    setTranscriptMap(prev => ({ ...prev, [conversationId]: { ...prev[conversationId], analysisLoading: true, analysisError: null } }));
    try {
      const analysis = await adsAPI.analyzeVoiceConversation(conversationId);
      setTranscriptMap(prev => ({ ...prev, [conversationId]: { ...prev[conversationId], analysisLoading: false, analysis } }));
    } catch (e) {
      setTranscriptMap(prev => ({ ...prev, [conversationId]: { ...prev[conversationId], analysisLoading: false, analysisError: e.message } }));
    }
  };

  const inputStyle = {
    padding: "8px 10px", borderRadius: 8, width: "100%",
    border: "1px solid var(--color-card-border)",
    backgroundColor: "var(--color-input-bg)",
    color: "var(--color-input-text)",
    fontSize: "0.82rem", outline: "none",
  };
  const labelStyle = {
    display: "block", fontSize: "0.72rem", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.06em",
    color: "var(--color-sidebar-text)", marginBottom: 6,
  };

  const isProvisioned = agentStatus?.provisioned;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Bot Configuration ─────────────────────────────────────────────── */}
      <SectionCard
        title="Voice Agent Configuration"
        subtitle="Set the voice, personality, and opening message for your voicebot"
      >
        {/* AI recommendation — shown automatically if strategy was generated, or on manual request */}
        {canEdit && (
          <div style={{ marginBottom: 20 }}>
            {/* Persisted recommendation banner (set at strategy-generation time) */}
            {recReason && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 14px", borderRadius: 8, marginBottom: 12,
                backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.05)",
                border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.18)",
              }}>
                <Wand2 size={13} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-accent)", marginBottom: 2 }}>
                    AI Voice Recommendation
                  </p>
                  <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)", lineHeight: 1.5 }}>
                    {recReason}
                  </p>
                </div>
              </div>
            )}
            {/* Manual re-run button — only show when strategy exists */}
            {ad.strategy_json && (
              <ActionButton onClick={handleRecommend} loading={recLoading} variant="ghost" icon={<Wand2 size={13} />}>
                {recLoading ? "Analyzing…" : recReason ? "Re-run Recommendation" : "Get AI Recommendation"}
              </ActionButton>
            )}
            {recError && (
              <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 7, fontSize: "0.78rem", color: "#ef4444", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                {recError}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Voice */}
          <div>
            <label style={labelStyle}>Voice</label>
            <select value={voiceId} onChange={e => setVoiceId(e.target.value)} disabled={!canEdit} style={inputStyle}>
              {VOICE_CATALOGUE.map(v => (
                <option key={v.id} value={v.id}>{v.name} — {v.desc}</option>
              ))}
            </select>
          </div>

          {/* Conversation style */}
          <div>
            <label style={labelStyle}>Conversation Style</label>
            <select value={convStyle} onChange={e => setConvStyle(e.target.value)} disabled={!canEdit} style={inputStyle}>
              {CONV_STYLES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Agent name */}
          <div>
            <label style={labelStyle}>Agent Name</label>
            <input
              type="text" value={botName} onChange={e => setBotName(e.target.value)}
              placeholder="e.g. Health Assistant"
              disabled={!canEdit} style={inputStyle}
            />
          </div>

          {/* Language */}
          <div>
            <label style={labelStyle}>Language</label>
            <select value={language} onChange={e => setLanguage(e.target.value)} disabled={!canEdit} style={inputStyle}>
              {VOICE_LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>

          {/* Opening message */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Opening Message</label>
            <input
              type="text" value={firstMsg} onChange={e => setFirstMsg(e.target.value)}
              placeholder="Hello! How can I help you today?"
              disabled={!canEdit} style={inputStyle}
            />
          </div>

          {/* Compliance notes */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
              Compliance Notes
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, opacity: 0.6 }}>(optional)</span>
            </label>
            <textarea
              value={compliance} onChange={e => setCompliance(e.target.value)}
              placeholder="e.g. Do not make medical claims. Refer users to a healthcare professional."
              disabled={!canEdit} rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        </div>

        {canEdit && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <ActionButton onClick={handleSaveConfig} loading={saveLoading} icon={<Check size={14} />}>
              {saveLoading ? "Saving…" : "Save Configuration"}
            </ActionButton>
            {saveDone && (
              <span style={{ fontSize: "0.78rem", color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 size={13} /> Saved
              </span>
            )}
            {saveError && <span style={{ fontSize: "0.78rem", color: "#ef4444" }}>{saveError}</span>}
          </div>
        )}
      </SectionCard>

      {/* ── Agent Provisioning (Publisher only) ───────────────────────────── */}
      {isPublisher && (
        <SectionCard
          title="Voice Agent"
          subtitle="Provision and manage the live conversational AI agent"
        >
          {statusLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, color: "var(--color-sidebar-text)", fontSize: "0.82rem" }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Checking agent status…
            </div>
          ) : agentStatus && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
              padding: "10px 14px", borderRadius: 8,
              border: `1px solid ${isProvisioned ? "rgba(34,197,94,0.2)" : "var(--color-card-border)"}`,
              backgroundColor: isProvisioned ? "rgba(34,197,94,0.04)" : "var(--color-page-bg)",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: isProvisioned ? "#22c55e" : "#6b7280", flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)" }}>
                  {isProvisioned ? `Agent live — ${agentStatus.name || "Voice Agent"}` : "No agent provisioned"}
                </p>
                {isProvisioned && agentStatus.agent_id && (
                  <p style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)", marginTop: 1 }}>ID: {agentStatus.agent_id}</p>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ActionButton onClick={handleProvision} loading={provisionLoading} icon={<Zap size={14} />}>
              {provisionLoading ? "Provisioning…" : isProvisioned ? "Update Agent" : "Provision Agent"}
            </ActionButton>
            {isProvisioned && (
              <ActionButton onClick={handleDeleteAgent} loading={provisionLoading} variant="ghost" icon={<Trash2 size={14} />}>
                Delete Agent
              </ActionButton>
            )}
          </div>
          {provisionError && (
            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 7, fontSize: "0.78rem", color: "#ef4444", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              {provisionError}
            </div>
          )}
          {!isProvisioned && !statusLoading && (
            <p style={{ marginTop: 10, fontSize: "0.75rem", color: "var(--color-sidebar-text)" }}>
              Save the configuration above first, then click Provision to deploy the agent.
            </p>
          )}
        </SectionCard>
      )}

      {/* ── Live Voice Session (Publisher only) ───────────────────────────── */}
      {isPublisher && (
        <SectionCard
          title="Live Voice Session"
          subtitle="Test the agent with a real-time voice call directly in your browser"
        >
          <LiveVoiceWidget adId={adId} isProvisioned={isProvisioned} />
        </SectionCard>
      )}

      {/* ── Conversation History ───────────────────────────────────────────── */}
      <SectionCard
        title="Conversation History"
        subtitle="Past voice sessions"
      >
        {convsLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-sidebar-text)", fontSize: "0.82rem" }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Loading…
          </div>
        ) : convsError ? (
          <p style={{ fontSize: "0.82rem", color: "#ef4444" }}>{convsError}</p>
        ) : conversations.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <PhoneCall size={28} style={{ color: "var(--color-card-border)", margin: "0 auto 10px" }} />
            <p style={{ color: "var(--color-sidebar-text)", fontSize: "0.85rem" }}>No conversations yet.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {conversations.map(c => {
              const isOpen = selectedConv?.conversation_id === c.conversation_id;
              const tEntry = transcriptMap[c.conversation_id];
              return (
                <div key={c.conversation_id} style={{ borderRadius: 8, border: `1px solid ${isOpen ? "var(--color-accent)" : "var(--color-card-border)"}`, backgroundColor: "var(--color-card-bg)", overflow: "hidden", transition: "border-color 0.15s" }}>
                  {/* Tile header */}
                  <div
                    onClick={() => handleSelectConv(c)}
                    style={{ padding: "12px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <div>
                      <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-input-text)", fontFamily: "ui-monospace, monospace", margin: 0 }}>
                        {c.conversation_id?.slice(0, 16)}…
                      </p>
                      {c.start_time && (
                        <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", marginTop: 2, marginBottom: 0 }}>
                          {new Date(c.start_time * 1000).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", textTransform: "capitalize" }}>
                      {c.status}
                    </span>
                  </div>

                  {/* Inline transcript + recording + analysis (shown when selected) */}
                  {isOpen && (
                    <div style={{ borderTop: "1px solid var(--color-card-border)", backgroundColor: "var(--color-page-bg)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
                      {/* Voice recording player */}
                      <div>
                        <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)", marginBottom: 8 }}>
                          Recording
                        </p>
                        {tEntry?.audioLoading ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-sidebar-text)", fontSize: "0.78rem" }}>
                            <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Loading audio…
                          </div>
                        ) : tEntry?.audioUrl ? (
                          <audio controls src={tEntry.audioUrl} style={{ width: "100%", height: 36 }} />
                        ) : (
                          <p style={{ fontSize: "0.78rem", color: "var(--color-sidebar-text)" }}>No recording available.</p>
                        )}
                      </div>

                      {/* Transcript */}
                      <div>
                        <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sidebar-text)", marginBottom: 8 }}>
                          Transcript
                        </p>
                        {tEntry?.loading ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-sidebar-text)", fontSize: "0.78rem" }}>
                            <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Loading transcript…
                          </div>
                        ) : tEntry?.error ? (
                          <p style={{ fontSize: "0.78rem", color: "#ef4444" }}>{tEntry.error}</p>
                        ) : tEntry?.data ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                            {(tEntry.data.transcript || []).map((turn, i) => (
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

                      {/* AI Analysis */}
                      <div style={{ borderTop: "1px solid var(--color-card-border)", paddingTop: 14 }}>
                        {tEntry?.analysisError && (
                          <p style={{ fontSize: "0.78rem", color: "#ef4444", marginBottom: 8 }}>{tEntry.analysisError}</p>
                        )}
                        <ConversationAnalysis
                          analysis={tEntry?.analysis || null}
                          loading={tEntry?.analysisLoading || false}
                          onReanalyze={() => handleAnalyzeConv(c.conversation_id)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button onClick={loadConversations} className="btn--ghost" style={{ fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
