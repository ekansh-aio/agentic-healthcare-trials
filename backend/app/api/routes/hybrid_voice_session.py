"""
Hybrid Voice Session — custom WebSocket conversation pipeline.

TTS strategy (single-model per utterance — no ensemble):
  • Fillers  → eleven_flash_v2          (~75 ms TTFB, buffered, short phrases)
  • Greeting → eleven_flash_v2          (fast start when patient connects)
  • Responses→ eleven_v3_conversational (EL streaming WS, first chunk ~200 ms
                                         after first LLM token — snappy gap)

Why no ensemble: TTS models generate prosody from their full input text.
Splitting a response across two separate synthesis calls produces an audible
acoustic seam — the first model synthesises a speech-FINAL ending, the second
starts with speech-INITIAL energy. Single-model synthesis gives naturally
consistent prosody throughout.

Streaming pipeline (per turn):
  1. VAD triggers → Flash filler fires (~75 ms) + ASR starts in parallel.
  2. Filler audio streams to browser; ASR transcribes (~400 ms).
  3. Claude streaming API starts; tokens flow to ElevenLabs streaming WS.
  4. ElevenLabs emits audio chunks ~200 ms after first tokens arrive.
  5. Audio chunks forwarded to browser as they arrive.
  Gap = filler_end (~975 ms) – first_v3_chunk (~900 ms) ≈ 0 ms overlap.

Wire protocol
─────────────
Browser → Backend  (binary):      Raw PCM 16 000 Hz 16-bit LE mono
Browser → Backend  (text/JSON):   {"type": "interrupt"}

Backend → Browser  (binary):      Raw PCM 16 000 Hz 16-bit LE mono
Backend → Browser  (text/JSON):
    {"type": "session_ready", "first_message": "...", "voice_id": "...", "voice_name": "..."}
    {"type": "transcript",    "role": "user",  "text": "..."}
    {"type": "agent_start"}
    {"type": "agent_end",     "text": "..."}
    {"type": "error",         "detail": "..."}

Authentication: pass JWT as ?token=<jwt> query param.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import math
import random
import struct
from typing import Optional

import httpx
import websockets as _ws_lib
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bedrock import get_async_client, get_model
from app.core.config import settings
from app.core.security import decode_token
from app.db.database import get_db
from app.models.models import (
    Advertisement,
    CallTranscript,
    Company,
    SkillConfig,
    SurveyResponse,
    VoiceSession,
)
from app.services.ai.voicebot_agent import AUSTRALIAN_VOICES, _voice_for_style
from app.services.ai.fusion_tts import normalize_pcm, pcm_to_wav, _fetch_tts_pcm

logger = logging.getLogger(__name__)

router = APIRouter()

ELEVENLABS_ASR_URL   = "https://api.elevenlabs.io/v1/speech-to-text"
_ELEVENLABS_TTS_URL  = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
_EL_STREAM_WS_URL    = (
    "wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input"
    "?model_id={model_id}&output_format=pcm_16000&xi_api_key={api_key}"
)

FLASH_MODEL      = settings.ELEVENLABS_FLASH_MODEL        # eleven_flash_v2
EXPRESSIVE_MODEL = settings.ELEVENLABS_EXPRESSIVE_MODEL   # eleven_v3_conversational
SAMPLE_RATE      = 16_000

_VOICE_SETTINGS = {
    "stability": 0.55,
    "similarity_boost": 0.82,
    "style": 0.35,
    "use_speaker_boost": False,
}

# 2-word fillers (~900 ms each) — long enough to cover ASR + LLM + v3 TTFB.
# Flash synthesises them in ~75 ms so the browser hears something immediately.
_THINKING_FILLERS = [
    "Hmm, sure.",
    "Ah, right.",
    "Mmm, okay.",
    "Right, sure.",
    "Of course.",
    "Absolutely.",
]


# ─────────────────────────────────────────────────────────────────────────────
# VAD
# ─────────────────────────────────────────────────────────────────────────────

def _rms(pcm_bytes: bytes) -> float:
    n = len(pcm_bytes) // 2
    if n == 0:
        return 0.0
    samples = struct.unpack(f"<{n}h", pcm_bytes[: n * 2])
    return math.sqrt(sum(s * s for s in samples) / n)


# ─────────────────────────────────────────────────────────────────────────────
# ASR
# ─────────────────────────────────────────────────────────────────────────────

async def _transcribe(pcm_bytes: bytes) -> str:
    """Send buffered PCM to ElevenLabs STT. Returns '' on failure."""
    if not pcm_bytes:
        return ""
    wav = pcm_to_wav(pcm_bytes, sample_rate=SAMPLE_RATE)
    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY or ""}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                ELEVENLABS_ASR_URL,
                headers=headers,
                files={"file": ("audio.wav", io.BytesIO(wav), "audio/wav")},
                data={"model_id": "scribe_v1"},
            )
            if not resp.is_success:
                logger.warning("ASR %s: %s", resp.status_code, resp.text[:200])
                return ""
            return resp.json().get("text", "").strip()
    except Exception as exc:
        logger.warning("ASR exception: %s", exc)
        return ""


# ─────────────────────────────────────────────────────────────────────────────
# LLM
# ─────────────────────────────────────────────────────────────────────────────

async def _generate_response(system_prompt: str, history: list[dict]) -> str:
    client = get_async_client()
    model = get_model()
    response = await client.messages.create(
        model=model,
        max_tokens=512,
        system=system_prompt,
        messages=history,
    )
    return response.content[0].text if response.content else ""


# ─────────────────────────────────────────────────────────────────────────────
# TTS helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _synth_flash(text: str, voice_id: str) -> bytes:
    """Synthesise a short phrase with Flash and return normalised PCM (buffered)."""
    pcm = await _fetch_tts_pcm(text, voice_id, FLASH_MODEL)
    return normalize_pcm(pcm)


async def _stream_tts_to_ws(
    text: str,
    voice_id: str,
    model_id: str,
    websocket: WebSocket,
    chunk_size: int = 4096,
) -> None:
    """
    Stream ElevenLabs TTS PCM chunks directly to the browser as they arrive.

    The browser's AudioContext schedules each arriving chunk immediately after
    the previous one via schedRef — there is no gap within a response because
    all chunks come from a single synthesis call (consistent prosody throughout).
    """
    if not text.strip():
        return
    url = _ELEVENLABS_TTS_URL.format(voice_id=voice_id)
    payload = {"text": text, "model_id": model_id, "voice_settings": _VOICE_SETTINGS}
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY or "",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST", url,
            json=payload,
            headers=headers,
            params={"output_format": "pcm_16000"},
        ) as resp:
            if not resp.is_success:
                body = await resp.aread()
                raise ValueError(
                    f"ElevenLabs TTS [{model_id}] {resp.status_code}: "
                    f"{body.decode(errors='replace')}"
                )
            async for chunk in resp.aiter_bytes(chunk_size):
                if chunk:
                    await websocket.send_bytes(chunk)


async def _stream_llm_tts_pipeline(
    system_prompt: str,
    history: list[dict],
    voice_id: str,
    websocket: WebSocket,
) -> str:
    """
    Pipeline: Claude streaming tokens → ElevenLabs streaming WS → browser.

    ElevenLabs starts emitting audio ~200 ms after the first tokens arrive,
    so the first chunk reaches the browser before the filler finishes playing —
    the gap between filler end and response start collapses to near zero.

    Returns the full agent text for appending to history.
    """
    url = _EL_STREAM_WS_URL.format(
        voice_id=voice_id,
        model_id=EXPRESSIVE_MODEL,
        api_key=settings.ELEVENLABS_API_KEY or "",
    )
    full_text = ""

    async with _ws_lib.connect(url) as el_ws:
        # Initialise voice session with settings
        await el_ws.send(json.dumps({"text": " ", "voice_settings": _VOICE_SETTINGS}))

        async def _pipe_audio() -> None:
            """Forward ElevenLabs audio chunks to the browser as they arrive."""
            try:
                while True:
                    raw = await el_ws.recv()
                    data = json.loads(raw)
                    if data.get("audio"):
                        await websocket.send_bytes(base64.b64decode(data["audio"]))
                    if data.get("isFinal"):
                        return
            except Exception:
                pass

        audio_task = asyncio.create_task(_pipe_audio())

        client   = get_async_client()
        model_id = get_model()
        try:
            async with client.messages.stream(
                model=model_id,
                max_tokens=512,
                system=system_prompt,
                messages=history,
            ) as stream:
                async for chunk in stream.text_stream:
                    full_text += chunk
                    await el_ws.send(json.dumps({"text": chunk}))
        except Exception as exc:
            logger.error("LLM stream error: %s", exc)
            audio_task.cancel()
            return full_text

        # Signal ElevenLabs to flush and close
        await el_ws.send(json.dumps({"text": " ", "flush": True}))
        try:
            await asyncio.wait_for(audio_task, timeout=30.0)
        except asyncio.TimeoutError:
            logger.warning("TTS pipeline audio drain timed out")

    return full_text


# ─────────────────────────────────────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _create_voice_session(db: AsyncSession, advertisement_id: str) -> VoiceSession:
    session = VoiceSession(
        advertisement_id=advertisement_id,
        status="active",
        caller_metadata={"type": "inbound", "source": "browser_hybrid"},
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def _finalise_session(
    db: AsyncSession, session: VoiceSession, history: list[dict]
) -> None:
    try:
        for i, turn in enumerate(history):
            db.add(CallTranscript(
                session_id=session.id,
                speaker=turn["role"],
                text=turn["content"],
                turn_index=i,
                timestamp_ms=0,
            ))
        session.status = "ended"
        await db.commit()
    except Exception as exc:
        logger.warning("Could not finalise session %s: %s", session.id, exc)


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.websocket("/advertisements/{advertisement_id}/voice/ws")
async def hybrid_voice_ws(
    websocket: WebSocket,
    advertisement_id: str,
    token: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Full-duplex voice session.

    Per-turn flow:
      1. VAD detects end of speech
      2. Flash filler fires immediately (~75 ms) — patient hears the agent "thinking"
      3. ASR transcribes the buffered audio (runs in parallel with filler)
      4. Claude generates the full response
      5. v3_conversational streams the response chunk-by-chunk to the browser
         (single synthesis call → consistent prosody, no acoustic seams)
    """
    # ── Auth ──────────────────────────────────────────────────────────────────
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    try:
        payload = decode_token(token)
        if not payload.get("sub"):
            raise ValueError("no sub")
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    # ── Load campaign ─────────────────────────────────────────────────────────
    ad_result = await db.execute(
        select(Advertisement).where(Advertisement.id == advertisement_id)
    )
    ad = ad_result.scalar_one_or_none()
    if not ad:
        await websocket.send_text(json.dumps({"type": "error", "detail": "Campaign not found"}))
        await websocket.close()
        return

    bot_config: dict = ad.bot_config or {}

    # Voice selection
    publisher_voice_id = bot_config.get("voice_id")
    if publisher_voice_id:
        matched_profile = next(
            (v for v in AUSTRALIAN_VOICES if v["id"] == publisher_voice_id), None
        )
        voice_id = publisher_voice_id
        voice_name = (
            matched_profile["name"] if matched_profile
            else bot_config.get("bot_name", "Assistant")
        )
    else:
        profile = _voice_for_style(bot_config.get("conversation_style", "warm"))
        voice_id = profile["id"]
        voice_name = profile["name"]

    company_res = await db.execute(select(Company).where(Company.id == ad.company_id))
    company = company_res.scalar_one_or_none()
    company_name = company.name if company else "our organization"

    default_first_message = (
        f"Hi. This is {voice_name} from {company_name}. "
        f"Thanks a lot for expressing interest in our study. "
        f"How are you doing today?"
    )
    first_message = bot_config.get("first_message") or default_first_message

    from app.services.ai.voicebot_agent import VoicebotAgentService
    svc = VoicebotAgentService(db)
    system_prompt = await svc._build_system_prompt(ad, allow_audio_tags=True)

    # ── Session ───────────────────────────────────────────────────────────────
    voice_session = await _create_voice_session(db, advertisement_id)

    # ── Greet — Flash for fast first impression ───────────────────────────────
    await websocket.send_text(json.dumps({
        "type": "session_ready",
        "first_message": first_message,
        "voice_id": voice_id,
        "voice_name": voice_name,
    }))
    await websocket.send_text(json.dumps({"type": "agent_start"}))
    try:
        await _stream_tts_to_ws(first_message, voice_id, FLASH_MODEL, websocket)
    except Exception as exc:
        logger.warning("Greeting TTS failed: %s", exc)
    await websocket.send_text(json.dumps({"type": "agent_end", "text": first_message}))

    # History must start with a user message (Anthropic API requirement).
    # The synthetic "[call started]" seeds proper user/assistant alternation.
    history: list[dict] = [
        {"role": "user",      "content": "[call started]"},
        {"role": "assistant", "content": first_message},
    ]

    # ── VAD state ─────────────────────────────────────────────────────────────
    rms_threshold = float(settings.FUSION_VAD_RMS_THRESHOLD)
    silence_samples_threshold = (settings.FUSION_VAD_SILENCE_MS * SAMPLE_RATE) // 1000

    speech_buffer = bytearray()
    silence_samples = 0
    speech_detected = False

    # ── Conversation loop ─────────────────────────────────────────────────────
    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.receive" and "text" in message:
                try:
                    ctrl = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue
                if ctrl.get("type") == "interrupt":
                    speech_buffer.clear()
                    silence_samples = 0
                    speech_detected = False
                continue

            if message.get("type") != "websocket.receive" or "bytes" not in message:
                continue

            raw: bytes = message["bytes"]
            if not raw:
                continue

            chunk_rms = _rms(raw)

            if chunk_rms >= rms_threshold:
                speech_detected = True
                silence_samples = 0
                speech_buffer.extend(raw)
            else:
                if not speech_detected:
                    continue

                silence_samples += len(raw) // 2
                speech_buffer.extend(raw)

                if silence_samples < silence_samples_threshold:
                    continue

                # ── End of speech ─────────────────────────────────────────────
                pcm_snapshot = bytes(speech_buffer)
                speech_buffer.clear()
                silence_samples = 0
                speech_detected = False

                if len(pcm_snapshot) < SAMPLE_RATE // 4:
                    continue  # < 250 ms — noise burst, skip

                # Step 1: filler (Flash, ~75 ms TTFB) + ASR run in parallel.
                filler_text = random.choice(_THINKING_FILLERS)
                filler_task = asyncio.create_task(
                    _synth_flash(filler_text, voice_id), name="filler_tts"
                )
                asr_task = asyncio.create_task(
                    _transcribe(pcm_snapshot), name="asr"
                )

                # Step 2: send filler to browser as soon as it's synthesised.
                try:
                    filler_audio = await asyncio.wait_for(filler_task, timeout=3.0)
                    for i in range(0, len(filler_audio), 4096):
                        await websocket.send_bytes(filler_audio[i : i + 4096])
                except Exception as exc:
                    logger.warning("Filler TTS failed: %s", exc)

                # Step 3: transcript
                transcript = await asr_task
                if not transcript:
                    continue

                logger.info("User: %s", transcript)
                await websocket.send_text(json.dumps({
                    "type": "transcript", "role": "user", "text": transcript,
                }))
                history.append({"role": "user", "content": transcript})

                # Steps 4+5: LLM tokens stream directly into ElevenLabs WS TTS.
                # First audio chunk reaches browser ~200 ms after first LLM token —
                # before the filler finishes playing, so the gap is near zero.
                await websocket.send_text(json.dumps({"type": "agent_start"}))
                try:
                    agent_text = await _stream_llm_tts_pipeline(
                        system_prompt, history, voice_id, websocket
                    )
                except Exception as exc:
                    logger.error("LLM/TTS pipeline error: %s", exc)
                    await websocket.send_text(json.dumps({
                        "type": "error", "detail": "Response generation failed"
                    }))
                    history.append({"role": "assistant", "content": ""})
                    await websocket.send_text(json.dumps({"type": "agent_end", "text": ""}))
                    continue

                # Always append assistant turn to keep history alternating.
                history.append({"role": "assistant", "content": agent_text or ""})
                if agent_text:
                    logger.info("Agent: %s", agent_text[:120])

                await websocket.send_text(json.dumps({
                    "type": "agent_end", "text": agent_text or ""
                }))

    except WebSocketDisconnect:
        logger.info("Voice session disconnected (ad=%s)", advertisement_id)
    except Exception as exc:
        logger.error("Voice session error (ad=%s): %s", advertisement_id, exc)
    finally:
        await _finalise_session(db, voice_session, history)
