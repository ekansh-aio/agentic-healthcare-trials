import React, { useState, useEffect, useRef, useCallback } from "react";
import { adsAPI } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { hasType } from "./publisherUtils";
import {
  Mic, PhoneCall, PhoneOff, Volume2, Radio, Zap,
  Sparkles, CheckCircle2, AlertCircle, MessageSquare, X,
} from "lucide-react";

export default function VoicebotConfig({ ad }) {
  const existing = ad.bot_config || {};
  const { companyName } = useAuth();

  const [form, setForm] = useState({
    bot_name:      existing.bot_name      || "Assistant",
    voice_id:      existing.voice_id      || "XrExE9yKIg1WjnnlVkGX",
    first_message: existing.first_message || "",   // seeded after voices load so voice name resolves
    // conversation_style, language, compliance_notes are set by AI recommendation — not exposed to the user
  });

  // Australian voices fetched from ElevenLabs via the backend
  const [voices, setVoices] = useState([]);
  const [voicesLoading, setVoicesLoading] = useState(true);

  useEffect(() => {
    adsAPI.getAustralianVoices(ad.id)
      .then((data) => setVoices(data.voices || []))
      .catch(() => setVoices([]))
      .finally(() => setVoicesLoading(false));
  }, [ad.id]);

  const selectedVoiceName = voices.find((v) => v.voice_id === form.voice_id)?.name || form.bot_name || "Assistant";
  const defaultFirstMessage = `Hi. This is ${selectedVoiceName} from ${companyName || "your organization"}. Thanks a lot for expressing interest in our study. How are you doing today?`;

  // Seed first_message once voices have loaded (so voice name resolves correctly)
  useEffect(() => {
    if (!voicesLoading && !form.first_message) {
      setForm((p) => ({ ...p, first_message: defaultFirstMessage }));
    }
  }, [voicesLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const sourcesRef   = useRef([]);
  const closingRef   = useRef(false);
  const isSpeakingRef = useRef(false);  // ref mirror of isSpeaking for use inside closures

  const stopAllSources = useCallback(() => {
    sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    sourcesRef.current = [];
  }, []);

  const cleanupCall = useCallback(() => {
    stopAllSources();
    if (processorRef.current) { try { processorRef.current.disconnect(); } catch {} processorRef.current = null; }
    if (streamRef.current)    { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (ctxRef.current)       { try { ctxRef.current.close(); } catch {} ctxRef.current = null; }
    schedRef.current = 0;
    isSpeakingRef.current = false;
    setIsSpeaking(false);
  }, [stopAllSources]);

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
          else if (msg.type === "interruption") { stopAllSources(); schedRef.current = ctxRef.current?.currentTime ?? 0; isSpeakingRef.current = false; setIsSpeaking(false); }
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
      if (err.message?.includes("No ElevenLabs agent provisioned") || err.message?.includes("No voice agent provisioned") || err.message?.includes("agent provisioned")) {
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
    setForm((p) => ({ ...p, voice_id: recommendation.voice_id }));
    setRecommendation(null);
  };

  const handleProvision = async () => {
    setProvisioning(true);
    setStatusError(null);
    try {
      // Reset opening message to the standardised default before provisioning
      const provisionForm = { ...form, first_message: defaultFirstMessage };
      setForm(provisionForm);
      await adsAPI.updateBotConfig(ad.id, provisionForm);
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
                  <span style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "2px 8px" }}>
                    Style: {recommendation.style || recommendation.conversation_style}
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
          <select value={form.voice_id} onChange={(e) => setForm((p) => ({ ...p, voice_id: e.target.value }))} className="field-select" disabled={voicesLoading}>
            {voicesLoading && <option value="">Loading voices…</option>}
            {voices.map((v) => (
              <option key={v.voice_id} value={v.voice_id}>
                {v.name}{v.gender ? ` — ${v.gender.charAt(0).toUpperCase() + v.gender.slice(1)}` : ""}{v.description ? ` · ${v.description}` : ""} · Australian
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--color-muted)", display: "block", marginBottom: 4 }}>Opening Message</label>
          <input
            value={form.first_message}
            onChange={(e) => setForm((p) => ({ ...p, first_message: e.target.value }))}
            className="field-input"
            placeholder={defaultFirstMessage}
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
