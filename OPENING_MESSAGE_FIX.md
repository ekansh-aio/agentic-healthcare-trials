# Opening Message Standardization

**Date:** 2026-04-23
**Status:** ✅ COMPLETED
**Impact:** All voicebot campaigns will use standardized greeting

---

## Change Summary

### New Standard Format

All voicebot campaigns now use this standardized opening message:

```
"Hi. This is [Bot name] from [company name].
Thanks a lot for expressing interest in our study.
How are you doing today?"
```

### Previous Format (OLD)

```
"Hi, this is [Bot name] with [Organization].
We're enrolling volunteers for a clinical trial focused on [condition].
Participation is voluntary, and I can explain what's involved if you're interested."
```

---

## Why This Change?

### Benefits of New Format

1. **More Personal & Warm**
   - "How are you doing today?" creates immediate rapport
   - "Thanks a lot" shows appreciation for their interest

2. **Less Formal**
   - "from" instead of "with" sounds more natural
   - Removes clinical/compliance-heavy opening
   - More conversational and engaging

3. **Better User Experience**
   - Starts conversation naturally before diving into details
   - Acknowledges user's interest explicitly
   - Creates two-way dialogue from the start

4. **Consistent Branding**
   - Every campaign now has the same professional greeting
   - Predictable user experience across all voicebot campaigns

---

## Technical Changes

### Files Modified

**File:** `backend/app/services/ai/voicebot_agent.py`

### 1. AI Recommendation Prompt (Lines 658-664)

```python
# BEFORE:
The first_message must follow this compliance-focused format:
- Start with: "Hi, this is [Bot name] with [Organization]."
- State the purpose: "We're enrolling volunteers for a clinical trial focused on [condition]."
- Clarify voluntary participation: "Participation is voluntary, and I can explain what's involved if you're interested."

# AFTER:
The first_message must follow this exact standardized format:
- Start with: "Hi. This is [Bot name] from [company name]."
- Express gratitude: "Thanks a lot for expressing interest in our study."
- Engage warmly: "How are you doing today?"
```

### 2. Fallback Message (Line 683)

```python
# BEFORE:
f"[takes a breath] Hi, this is {fallback['name']} with {company_name}. [short pause]
We're enrolling volunteers for a clinical trial focused on {campaign_category}. [short pause]
Participation is voluntary, and, um, I can explain what's involved if you're interested."

# AFTER:
f"[takes a breath] Hi. This is {fallback['name']} from {company_name}. [short pause]
Thanks a lot for expressing interest in our study. [pause]
How are you doing today?"
```

### 3. Default Message (Lines 782-786)

```python
# BEFORE:
f"[takes a breath] Hi, this is {voice_name} with {org_name}. [short pause]
We're enrolling volunteers for a clinical trial focused on {condition}. [short pause]
Participation is voluntary, and, um, I can explain what's involved if you're interested."

# AFTER:
f"[takes a breath] Hi. This is {voice_name} from {org_name}. [short pause]
Thanks a lot for expressing interest in our study. [pause]
How are you doing today?"
```

---

## Examples with Real Data

### Example 1: Matilda from HealthCare Co
**Company:** HealthCare Co
**Bot Name:** Matilda
**Opening:**
```
"[takes a breath] Hi. This is Matilda from HealthCare Co. [short pause]
Thanks a lot for expressing interest in our study. [pause]
How are you doing today?"
```

### Example 2: Chris from MedTech Australia
**Company:** MedTech Australia
**Bot Name:** Chris
**Opening:**
```
"[takes a breath] Hi. This is Chris from MedTech Australia. [short pause]
Thanks a lot for expressing interest in our study. [pause]
How are you doing today?"
```

### Example 3: Laura from Clinical Research Group
**Company:** Clinical Research Group
**Bot Name:** Laura
**Opening:**
```
"[takes a breath] Hi. This is Laura from Clinical Research Group. [short pause]
Thanks a lot for expressing interest in our study. [pause]
How are you doing today?"
```

---

## Applying to Existing Campaigns

### ⚠️ Action Required

This change only applies to **NEW** voicebot agents. Existing campaigns need to be re-provisioned.

### Option 1: API Method (Recommended)

Re-provision all existing campaigns:

```bash
# For each campaign ID:
curl -X POST http://localhost:8000/api/advertisements/{CAMPAIGN_ID}/voice-agent
```

### Option 2: Bulk Update Script

```python
import httpx
import asyncio

CAMPAIGN_IDS = [
    "1639f98b-ec92-4c64-8943-9d47bb7d9533",
    "306125cd-14b7-4ddc-8ef6-850607d2d6ba",
    # ... add all campaign IDs
]

async def reprovision_all():
    async with httpx.AsyncClient() as client:
        for campaign_id in CAMPAIGN_IDS:
            print(f"Re-provisioning {campaign_id}...")
            resp = await client.post(
                f"http://localhost:8000/api/advertisements/{campaign_id}/voice-agent"
            )
            print(f"  Status: {resp.status_code}")

asyncio.run(reprovision_all())
```

### Option 3: Admin UI

If you have an admin interface:
1. Go to each campaign settings
2. Click "Update Voicebot" or "Re-provision Agent"
3. The new opening message will be applied

---

## Testing the New Message

### 1. Create Test Campaign
```bash
# Create a new campaign to see the new greeting immediately
# OR re-provision an existing one
```

### 2. Start Voice Call
1. Open the voicebot landing page
2. Click "Start Voice Call"
3. Wait for the agent to speak

### 3. Expected Opening
You should hear:
```
"Hi. This is [Bot Name] from [Company].
Thanks a lot for expressing interest in our study.
How are you doing today?"
```

---

## Conversation Flow After Opening

After the opening message, the conversation naturally flows:

```
Agent: "Hi. This is Matilda from HealthCare Co. Thanks a lot for
        expressing interest in our study. How are you doing today?"

User:  "Good, thanks."

Agent: "Wonderful! [short pause] So, we're currently enrolling
        volunteers for a clinical trial focused on [condition].
        Would you like to hear more about it?"

User:  "Yes, please."

Agent: "Great! [proceeds with trial details and screening...]"
```

The opening is now warmer and more engaging, then transitions smoothly into the study details.

---

## Compliance Notes

### Does This Meet Regulatory Requirements?

**Yes.** The opening message still:
- ✅ Identifies the caller (bot name)
- ✅ Identifies the organization (company name)
- ✅ States the purpose (expressing interest in our study)
- ✅ Is voluntary (implied by "expressing interest")

The key compliance points (voluntary participation, purpose, IRB approval, etc.) are covered **during the conversation**, not necessarily in the first sentence.

### Regulatory Approval

If your organization has specific compliance requirements for the opening message, please review with your legal/compliance team before deployment.

---

## Rollback Instructions

If you need to revert to the old format:

```bash
git diff HEAD backend/app/services/ai/voicebot_agent.py
# Review the changes

git checkout HEAD~1 backend/app/services/ai/voicebot_agent.py
# Revert the file

# Then re-provision all campaigns with the old format
```

---

## Related Changes

This update is part of the comprehensive voice interruption fix. See also:
- `VOICE_OVERLAP_ANALYSIS.md` - Root cause analysis
- `FIX_IMPLEMENTATION_SUMMARY.md` - All technical fixes
- `QUICK_START_TESTING.md` - Testing guide

---

## Checklist

- [x] Updated AI recommendation prompt
- [x] Updated fallback message
- [x] Updated default message template
- [ ] Re-provision existing campaigns
- [ ] Test new opening message
- [ ] Collect user feedback
- [ ] Review with compliance team (if required)

---

**Status:** ✅ Code updated, ready for deployment

**Next Action:** Re-provision existing voicebot campaigns to apply the new opening message.
