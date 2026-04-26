#!/usr/bin/env python3
"""
Fix Voice Interruption - Add client-side turn detection config
Fixes the overlapping voices issue in ElevenLabs Conversation.startSession
"""

import os
import re
from pathlib import Path

# Configuration to insert into Conversation.startSession
# FIXED: output echoCancellation disabled to prevent VAD interference
# ENHANCED: hybrid mode with client-side VAD for instant interruption
CONFIG_INSERT = """,
        config: {
          audio: {
            input: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            output: { echoCancellation: false }
          },
          turn_detection: {
            enabled: true,
            mode: 'hybrid',
            client: {
              enabled: true,
              threshold: 0.5,
              silence_ms: 400
            },
            server: {
              enabled: true,
              sensitivity: 'high'
            }
          }
        },
        onInterrupt: function() {
          console.log('[Interruption detected - stopping audio]');
          if (conversation && conversation.isPlaying) {
            conversation.stopAudio();
          }
        }"""

def fix_html_file(filepath):
    """Add client-side interruption config to Conversation.startSession"""
    print(f"\n[*] Checking: {filepath}")

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"    [ERROR] Error reading file: {e}")
        return False

    # Check if already fixed
    if 'turn_detection' in content and 'enabled: true' in content:
        print(f"    [OK] Already fixed - skipping")
        return False

    # Pattern: Conversation.startSession({ signedUrl: data.signed_url,
    pattern = r'(Conversation\.startSession\(\{\s*signedUrl:\s*data\.signed_url,)'

    if not re.search(pattern, content):
        print(f"    [SKIP] No Conversation.startSession found - skipping")
        return False

    # Insert config
    content_new = re.sub(pattern, r'\1' + CONFIG_INSERT, content)

    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content_new)
        print(f"    [FIXED] Added turn_detection config!")
        return True
    except Exception as e:
        print(f"    [ERROR] Error writing file: {e}")
        return False

def main():
    print("=" * 70)
    print("Voice Interruption Fix - Adding Turn Detection Config")
    print("=" * 70)

    # Find all website HTML files
    base_dir = Path(__file__).parent
    outputs_dir = base_dir / "backend" / "outputs"
    static_dir = base_dir / "backend" / "static" / "pages"

    fixed_count = 0
    total_count = 0

    # Fix generated websites in outputs/
    print(f"\n[SEARCH] Searching: {outputs_dir}")
    if outputs_dir.exists():
        for htmlpath in outputs_dir.glob("*/*/website/index.html"):
            total_count += 1
            if fix_html_file(htmlpath):
                fixed_count += 1

    # Fix hosted websites in static/pages/
    print(f"\n[SEARCH] Searching: {static_dir}")
    if static_dir.exists():
        for htmlpath in static_dir.glob("*/index.html"):
            total_count += 1
            if fix_html_file(htmlpath):
                fixed_count += 1

    # Summary
    print("\n" + "=" * 70)
    print(f"DONE!")
    print(f"   Total files checked: {total_count}")
    print(f"   Files fixed: {fixed_count}")
    print(f"   Already fixed: {total_count - fixed_count}")
    print("=" * 70)

    if fixed_count > 0:
        print("\n[SUCCESS] Voice interruption fix applied!")
        print("\nNext steps:")
        print("   1. Test your voicebot by opening the landing page")
        print("   2. Start a voice call and interrupt the agent mid-sentence")
        print("   3. The agent should stop immediately when you speak")
        print("   4. No more overlapping voices!")
    else:
        print("\n[OK] All files already have the fix applied!")

if __name__ == "__main__":
    main()
