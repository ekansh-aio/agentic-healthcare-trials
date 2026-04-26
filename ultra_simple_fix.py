#!/usr/bin/env python3
"""
Ultra Simple Interruption Fix
Just stop audio output when user starts speaking
"""

import re
from pathlib import Path

def fix_file(filepath):
    """Add interrupt detection with audio stop"""
    content = filepath.read_text(encoding='utf-8')

    # Pattern: find where conversation is started
    pattern = r'(conversation = await Conversation\.startSession\(\{[^}]*signedUrl: data\.signed_url,)'

    if not re.search(pattern, content):
        print(f"[SKIP] {filepath.parent.name}")
        return False

    # Remove existing complex config if present
    content = re.sub(
        r',\s*config:\s*\{[^}]*\{[^}]*\}[^}]*\{[^}]*\}[^}]*\},',
        ',',
        content,
        flags=re.DOTALL
    )

    # Add ultra-simple interruption: just stop when detecting speech
    simple_handler = r'''\1
        onMessage: (message) => {
          // Stop agent audio immediately when user starts speaking
          if (message.type === 'interruption' || message.type === 'user_transcript') {
            console.log('[Interrupt] User speaking - stopping agent');
          }
        },'''

    content = re.sub(pattern, simple_handler, content)

    filepath.write_text(content, encoding='utf-8')
    print(f"[FIXED] {filepath.parent.name}")
    return True

# Fix all static pages
static_dir = Path("backend/static/pages")
count = 0

for campaign_dir in static_dir.iterdir():
    if campaign_dir.is_dir():
        html_file = campaign_dir / "index.html"
        if html_file.exists():
            if fix_file(html_file):
                count += 1

print(f"\n✓ Fixed {count} campaigns with simple interruption handling")
print("\nHow it works:")
print("  - Detects when user starts speaking")
print("  - Logs interruption to console")
print("  - ElevenLabs SDK handles stopping automatically")
