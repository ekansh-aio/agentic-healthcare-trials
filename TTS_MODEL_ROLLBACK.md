# TTS Model Rollback to eleven_multilingual_v2

**Date:** 2026-04-23
**Status:** ✅ COMPLETED
**Action:** Rolled back from eleven_v3_conversational to eleven_multilingual_v2

---

## Changes Summary

### 1. TTS Model Downgrade

**File:** `backend/app/core/config.py`

```python
# BEFORE:
ELEVENLABS_TTS_MODEL: str = "eleven_v3_conversational"

# AFTER:
ELEVENLABS_TTS_MODEL: str = "eleven_multilingual_v2"
```

---

## 2. Removed All Expressive Audio Tags

### Opening Messages (Now Clean)

All opening messages now use **clean text without any bracket audio tags**:

#### Before (with expressive tags):
```
"[takes a breath] Hi. This is Matilda from HealthCare Co. [short pause]
Thanks a lot for expressing interest in our study. [pause]
How are you doing today?"
```

#### After (clean):
```
"Hi. This is Matilda from HealthCare Co.
Thanks a lot for expressing interest in our study.
How are you doing today?"
```

### Files Updated:

1. **AI Recommendation Prompt** (Line 658-664)
   - Removed guidance about using `[takes a breath]`, `[short pause]`, `[pause]` tags
   - Updated example to show clean text only

2. **Fallback Message** (Line 683)
   - Removed all bracket tags from default fallback

3. **Default Message Template** (Lines 782-786)
   - Removed all bracket tags from runtime default

4. **System Prompt Examples** (Lines 1115-1189)
   - Removed entire section about audio expression tags
   - Removed bracket tags from all example responses
   - Updated hard rules to explicitly forbid bracket usage

---

## Why This Change?

### Issues with eleven_v3_conversational + Bracket Tags

1. **Literal Reading:** eleven_multilingual_v2 reads bracket tags literally
   - User would hear: "takes a breath Hi. This is..."
   - Instead of: natural breath sound

2. **Cleaner Output:** Without brackets, speech is more natural for v2
3. **Simplicity:** Easier to maintain, no need to manage audio tags
4. **Consistency:** All campaigns now have predictable, clean speech

### eleven_multilingual_v2 Advantages

- ✅ **Stable and reliable** TTS model
- ✅ **Natural prosody** without explicit tags
- ✅ **Clean speech** output
- ✅ **Multi-language support** (including Australian English)
- ✅ **Lower complexity** in message templates

---

## Impact on Voice Quality

### What Changed:

| Aspect | eleven_v3_conversational | eleven_multilingual_v2 |
|--------|-------------------------|------------------------|
| **Audio Tags** | Supported `[takes a breath]` etc. | ❌ Not supported (reads literally) |
| **Natural Pauses** | Explicit via tags | ✅ Automatic from punctuation |
| **Expressiveness** | High (with tags) | Medium (natural) |
| **Reliability** | Newer model | Battle-tested |
| **Complexity** | High (tag management) | Low (plain text) |

### What Remains the Same:

- ✅ Voice quality is still high
- ✅ Natural disfluencies ("um", "uh", "so...") still work
- ✅ Punctuation creates natural pauses
- ✅ Conversational tone preserved
- ✅ All voice profiles (Matilda, Charlie, Laura, etc.) still available

---

## Updated Voice Rules

### What Agents Should Do:

✅ **Use natural disfluencies:**
- "um", "uh", "so...", "I mean", "you know"
- "Mmm", "Ah", "Oh"
- "Yeah, yeah", "Right"

✅ **Use natural punctuation:**
- Periods for pauses: "Hi. This is Matilda."
- Commas for flow: "Thanks a lot, really appreciate it."
- Em dashes for emphasis: "The study — right — is focused on..."
- Ellipses for trailing: "So... the trial is about..."

❌ **Do NOT use:**
- Bracket tags: `[takes a breath]`, `[short pause]`, `[light chuckle]`
- XML tags: `<break>`, `<emphasis>`, `<prosody>`
- Any special audio markup

---

## Updated System Prompt Guidance

### Before (v3 with tags):

```
"━━ AUDIO EXPRESSION TAGS ━━
Use these to inject physical vocal cues:
  [takes a breath]    — before starting a new thought
  [short pause]       — mid-sentence beat
  [light chuckle]     — warm, soft laugh
  ...
```

### After (v2 clean):

```
"━━ NATURAL CONVERSATIONAL STYLE ━━
Speak naturally and conversationally. Use vocal disfluencies to sound human.

━━ VOCAL DISFLUENCIES & FILLER WORDS ━━
  • 'um,' 'uh,'       — genuine mid-sentence thinking pause
  • 'So...'           — trailing thought, natural transition
  • 'Mmm,'            — 'I hear you', warm and present
  ...

━━ HARD RULES ━━
  ✗ NEVER use square brackets or any special audio tags
  ✗ NEVER use XML tags like <break>, <emphasis>, <prosody>
  ✗ Use natural filler words — every response needs at least one
```

---

## Example Dialogue (Updated)

### Opening:
```
Agent: "Hi. This is Matilda from HealthCare Co.
        Thanks a lot for expressing interest in our study.
        How are you doing today?"

User:  "Good, thanks."
```

### Describing Study:
```
Agent: "So... this trial is focused on, uh, a treatment that's
        actually been getting quite a bit of attention lately.
        You've probably seen a thing or two about it in the media.
        Basically, it's designed to help with — right —
        managing blood sugar and weight."
```

### Empathy Moment:
```
Agent: "Mmm, yeah... those 3am wake-ups are genuinely exhausting,
        I imagine. That's actually exactly who this study is designed
        to help, so — you know — you're in the right place."
```

### Warm Reaction:
```
Agent: "Oh, that's brilliant! Based on everything you've told me,
        you sound like a really wonderful fit. The team will be in
        touch very soon — no worries at all."
```

---

## Testing the Changes

### 1. Re-provision Existing Campaigns

The model change and clean opening messages require re-provisioning:

```bash
# For each campaign:
curl -X POST http://localhost:8000/api/advertisements/{CAMPAIGN_ID}/voice-agent
```

### 2. Test Voice Call

1. Open voicebot landing page
2. Click "Start Voice Call"
3. Listen to opening message

**Expected:**
- Clean, natural speech
- No literal reading of brackets
- Natural pauses from punctuation
- Professional and conversational tone

**Should NOT hear:**
- "takes a breath Hi..."
- "short pause Thanks..."
- Any bracket text spoken literally

### 3. Verify Agent Responses

During conversation, verify that:
- ✅ Agent uses natural filler words ("um", "uh", "so...")
- ✅ Pauses occur naturally from punctuation
- ✅ No bracket text is spoken
- ✅ Speech flows conversationally

---

## Rollback (If Needed)

If you need to revert to eleven_v3_conversational with audio tags:

```bash
# Rollback config:
git checkout HEAD~1 backend/app/core/config.py

# Rollback voicebot service:
git checkout HEAD~1 backend/app/services/ai/voicebot_agent.py

# Re-provision all campaigns
```

**Note:** Only do this if you specifically need audio expression tags and want to manage that complexity.

---

## Related Changes

This is part of the comprehensive voice improvements:

1. ✅ **Interruption fixes** - Hybrid VAD, restored interrupt_threshold
2. ✅ **Opening message standardization** - "Hi. This is [name] from [company]..."
3. ✅ **TTS model rollback** - eleven_multilingual_v2 (this change)
4. ✅ **Clean text** - No expressive brackets

See also:
- `VOICE_OVERLAP_ANALYSIS.md` - Root cause analysis
- `FIX_IMPLEMENTATION_SUMMARY.md` - All interruption fixes
- `OPENING_MESSAGE_FIX.md` - Standardized greeting
- `ASR_QUALITY_CORRECTION.md` - API limitation fix

---

## Checklist

- [x] Changed TTS model to eleven_multilingual_v2
- [x] Removed brackets from AI recommendation prompt
- [x] Removed brackets from fallback message
- [x] Removed brackets from default message
- [x] Updated system prompt guidance
- [x] Removed bracket tag examples
- [x] Updated hard rules
- [ ] Re-provision existing campaigns
- [ ] Test voice calls
- [ ] Verify no literal bracket reading
- [ ] Collect user feedback

---

**Status:** ✅ Code updated, ready for re-provisioning

**Next Action:** Re-provision all voicebot campaigns to apply the clean v2 model and opening messages.

---

## Summary Table

| Component | Old Value | New Value | Status |
|-----------|-----------|-----------|--------|
| **TTS Model** | eleven_v3_conversational | eleven_multilingual_v2 | ✅ Updated |
| **Opening Message** | With `[brackets]` | Clean text | ✅ Updated |
| **AI Prompt** | Instructs to use tags | Instructs clean text | ✅ Updated |
| **System Prompt** | 75 lines about tags | 30 lines, no tags | ✅ Updated |
| **Example Responses** | With `[brackets]` | Clean text | ✅ Updated |

**All changes complete and ready for deployment!** 🚀
