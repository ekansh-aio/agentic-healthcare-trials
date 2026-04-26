#!/usr/bin/env python3
"""
Apply Enhanced Interruption Fix - Force update to hybrid mode with better config
Replaces old turn_detection config with enhanced version
"""

import os
import re
from pathlib import Path

def update_html_file(filepath):
    """Replace old config with enhanced interruption config"""
    print(f"\n[*] Updating: {filepath}")

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"    [ERROR] Error reading file: {e}")
        return False

    # Check if this is a voicebot page
    if 'Conversation.startSession' not in content:
        print(f"    [SKIP] Not a voicebot page")
        return False

    original_content = content

    # Pattern to match the entire old config block (including old turn_detection)
    old_pattern = r'''(Conversation\.startSession\(\{\s*signedUrl:\s*data\.signed_url,)\s*config:\s*\{[^}]*audio:\s*\{[^}]*input:\s*\{[^}]*\}[^}]*output:\s*\{[^}]*\}[^}]*\}[^}]*turn_detection:\s*\{[^}]*\}[^}]*\},?'''

    # New enhanced config
    new_config = r'''\1
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
        },'''

    # Try to replace the config
    content_new, count = re.subn(old_pattern, new_config, content, flags=re.DOTALL)

    if count == 0:
        print(f"    [SKIP] Could not find config pattern to replace")
        return False

    if content_new == original_content:
        print(f"    [SKIP] No changes needed")
        return False

    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content_new)
        print(f"    [UPDATED] Enhanced interruption config applied!")
        return True
    except Exception as e:
        print(f"    [ERROR] Error writing file: {e}")
        return False

def main():
    print("=" * 70)
    print("Enhanced Interruption Fix - Hybrid Mode + Optimized Settings")
    print("=" * 70)

    base_dir = Path(__file__).parent
    outputs_dir = base_dir / "backend" / "outputs"
    static_dir = base_dir / "backend" / "static" / "pages"

    updated_count = 0
    total_count = 0

    # Update generated websites in outputs/
    print(f"\n[SEARCH] Updating files in: {outputs_dir}")
    if outputs_dir.exists():
        for htmlpath in outputs_dir.glob("*/*/website/index.html"):
            total_count += 1
            if update_html_file(htmlpath):
                updated_count += 1

    # Update hosted websites in static/pages/
    print(f"\n[SEARCH] Updating files in: {static_dir}")
    if static_dir.exists():
        for htmlpath in static_dir.glob("*/index.html"):
            total_count += 1
            if update_html_file(htmlpath):
                updated_count += 1

    # Summary
    print("\n" + "=" * 70)
    print(f"DONE!")
    print(f"   Total files checked: {total_count}")
    print(f"   Files updated: {updated_count}")
    print("=" * 70)

    if updated_count > 0:
        print("\n[SUCCESS] Enhanced interruption fix applied!")
        print("\nChanges:")
        print("   ✓ Output echo cancellation: true → false")
        print("   ✓ Turn detection mode: server → hybrid")
        print("   ✓ Added client-side VAD with 400ms silence detection")
        print("   ✓ Added onInterrupt handler with explicit stopAudio()")
        print("\nNext steps:")
        print("   1. Test voicebot by opening landing page")
        print("   2. Interrupt the agent mid-sentence")
        print("   3. Agent should stop within 50-200ms")
    else:
        print("\n[INFO] No files needed updating")
        print("Possible reasons:")
        print("   - Files already have enhanced config")
        print("   - Config pattern not found (manual update needed)")

if __name__ == "__main__":
    main()
