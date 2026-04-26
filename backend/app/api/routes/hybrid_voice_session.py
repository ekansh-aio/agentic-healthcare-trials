"""
Hybrid Voice Session — custom WebSocket conversation pipeline.

Model: eleven_flash_v2_5 throughout (<100ms TTFB).
Expressiveness comes from literal vocal disfluencies ("umm", "ah", "hmm")
injected by the LLM via system-prompt instructions — no audio tags needed.

Pipeline per turn:
  1. Browser sends PCM audio (16 000 Hz, 16-bit mono)
  2. Server-side VAD detects end of speech (RMS silence threshold)
  3. ── IMMEDIATELY ── synthesise a short thinking filler ("Hmm...", "Ah...")
     and stream it to the browser while steps 4–5 run in the background
  4. ElevenLabs ASR transcribes the buffered audio
  5. Claude generates the response (disfluencies baked into the system prompt)
  6. Flash TTS streams the response — browser plays it right after the filler

This means the user hears the agent "thinking" within ~75ms of finishing
their sentence, eliminating the dead-air gap caused by ASR + LLM latency.

Wire protocol
─────────────
Browser → Backend  (binary):      Raw PCM 16 000 Hz 16-bit LE mono
Browser → Backend  (text/JSON):   {"type": "interrupt"}

Backend → Browser  (binary):      Raw PCM 16 000 Hz 16-bit LE mono
Backend → Browser  (text/JSON):
    {"type": "session_ready", "first_message": "...", "voice_id": "..."}
    {"type": "transcript",    "role": "user",  "text": "..."}
    {"type": "agent_start",   "text": "..."}
    {"type": "agent_end"}
    {"type": "error",         "detail": "..."}

Authentication: pass JWT as ?token=<jwt> query param.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import math
import random
import struct
from typing import Optional

import httpx
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
from app.services.ai.fusion_tts import normalize_pcm, pcm_to_wav, _fetch_tts_pcm, stream_fusion_tts

logger = logging.getLogger(__name__)

router = APIRouter()

ELEVENLABS_ASR_URL = "https://api.elevenlabs.io/v1/speech-to-text"
FLASH_MODEL = settings.ELEVENLABS_FLASH_MODEL   # "eleven_flash_v2"
SAMPLE_RATE = 16_000                             # Hz — browser must capture at this rate

# Fillers the agent uses while "thinking" (played during ASR + LLM latency window)
# Kept very short so they finish before the actual response is ready.
_THINKING_FILLERS = [
    "Hmm...",
    "Ah...",
    "Mmm...",
    "Right...",
    "Umm...",
    "Oh...",
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
# Flash TTS helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _synth_flash(text: str, voice_id: str) -> bytes:
    """Synthesise text with eleven_flash_v2_5 and return normalised PCM."""
    pcm = await _fetch_tts_pcm(text, voice_id, FLASH_MODEL)
    return normalize_pcm(pcm)


async def _stream_flash(text: str, voice_id: str, websocket: WebSocket, chunk: int = 4096) -> None:
    """Synthesise and stream flash TTS to the browser. Swallows errors gracefully."""
    try:
        audio = await _synth_flash(text, voice_id)
        for i in range(0, len(audio), chunk):
            await websocket.send_bytes(audio[i : i + chunk])
    except Exception as exc:
        logger.warning("Flash TTS stream error: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _create_voice_session(db: AsyncSession, advertisement_id: str) -> VoiceSession:
    session = VoiceSession(
        advertisement_id=advertisement_id,
        status="active",
        caller_metadata={"type": "inbound", "source": "browser_flash"},
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
async def flash_voice_ws(
    websocket: WebSocket,
    advertisement_id: str,
    token: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Full-duplex voice session using eleven_flash_v2_5 + vocal disfluency fillers.

    Instant filler flow:
      VAD triggers → immediately synthesise "Hmm..." / "Ah..." (≈75ms) and
      stream it while ASR + LLM run in the background. Agent sounds like it's
      thinking rather than frozen. Actual response follows seamlessly.
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
        profile = next(
            (v for v in AUSTRALIAN_VOICES if v["id"] == publisher_voice_id),
            AUSTRALIAN_VOICES[0],
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

    # Build system prompt (reuses voicebot_agent logic — disfluencies already baked in)
    from app.services.ai.voicebot_agent import VoicebotAgentService
    svc = VoicebotAgentService(db)
    system_prompt = await svc._build_system_prompt(ad, allow_audio_tags=True)

    # ── Session ───────────────────────────────────────────────────────────────
    voice_session = await _create_voice_session(db, advertisement_id)

    # ── Greet ─────────────────────────────────────────────────────────────────
    await websocket.send_text(json.dumps({
        "type": "session_ready",
        "first_message": first_message,
        "voice_id": voice_id,
        "voice_name": voice_name,
    }))
    await websocket.send_text(json.dumps({"type": "agent_start", "text": first_message}))
    async for pcm_chunk in stream_fusion_tts(first_message, voice_id):
        await websocket.send_bytes(pcm_chunk)
    await websocket.send_text(json.dumps({"type": "agent_end"}))

    history: list[dict] = [{"role": "assistant", "content": first_message}]

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

            # Control frame
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
                    continue  # pre-speech silence — ignore

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

                # Step 1: launch thinking filler TTS and ASR in parallel.
                # The filler (~75ms) bridges the dead-air window while ASR
                # (~300–500ms) and LLM (~200–400ms) do their work.
                filler_text = random.choice(_THINKING_FILLERS)
                filler_task = asyncio.create_task(
                    _synth_flash(filler_text, voice_id),
                    name="filler_tts",
                )
                asr_task = asyncio.create_task(
                    _transcribe(pcm_snapshot),
                    name="asr",
                )

                # Step 2: stream filler as soon as it's ready
                try:
                    filler_audio = await asyncio.wait_for(filler_task, timeout=3.0)
                    chunk_size = 4096
                    for i in range(0, len(filler_audio), chunk_size):
                        await websocket.send_bytes(filler_audio[i : i + chunk_size])
                except Exception as exc:
                    logger.warning("Filler TTS failed: %s", exc)

                # Step 3: wait for transcript
                transcript = await asr_task
                if not transcript:
                    continue

                logger.info("User: %s", transcript)
                await websocket.send_text(json.dumps({
                    "type": "transcript",
                    "role": "user",
                    "text": transcript,
                }))
                history.append({"role": "user", "content": transcript})

                # Step 4: LLM response (Claude with disfluency-rich system prompt)
                try:
                    agent_text = await _generate_response(system_prompt, history)
                except Exception as exc:
                    logger.error("LLM error: %s", exc)
                    await websocket.send_text(json.dumps({
                        "type": "error", "detail": "Response generation failed"
                    }))
                    continue

                if not agent_text:
                    continue

                history.append({"role": "assistant", "content": agent_text})
                logger.info("Agent: %s", agent_text[:120])

                # Step 5: stream fusion TTS response
                # Opener (~first sentence) → flash (immediate, <100ms)
                # Continuation → eleven_v3 (expressive, audio tags rendered)
                await websocket.send_text(json.dumps({
                    "type": "agent_start", "text": agent_text
                }))
                try:
                    async for pcm_chunk in stream_fusion_tts(agent_text, voice_id):
                        await websocket.send_bytes(pcm_chunk)
                except Exception as exc:
                    logger.warning("Fusion TTS stream error: %s", exc)
                await websocket.send_text(json.dumps({"type": "agent_end"}))

    except WebSocketDisconnect:
        logger.info("Voice session disconnected (ad=%s)", advertisement_id)
    except Exception as exc:
        logger.error("Voice session error (ad=%s): %s", advertisement_id, exc)
    finally:
        await _finalise_session(db, voice_session, history)
