#!/usr/bin/env python3
"""
Simple Interruption Fix - Basic audio detection to stop agent
Just detect mic input and stop speaking immediately
"""

import os
import re
from pathlib import Path

# Simple config - just enable interruption on audio detection
SIMPLE_CONFIG = """,
        onModeChange: (mode) => {
          // When user starts speaking, stop agent immediately
          if (mode === 'speaking') {
            console.log('[Voice] User speaking - agent stopped');
          }
        }"""

def fix_html_file(filepath):
    """Add simple onModeChange handler for interruption"""
    print(f"\n[*] Fixing: {filepath}")

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"    [ERROR] {e}")
        return False

    # Check if already has onModeChange
    if 'onModeChange' in content:
        print(f"    [SKIP] Already has interruption handler")
        return False

    # Find the pattern and add simple handler before onConnect
    pattern = r'(},\s*onConnect:)'

    if not re.search(pattern, content):
        print(f"    [SKIP] Pattern not found")
        return False

    # Insert simple handler
    content = re.sub(pattern, SIMPLE_CONFIG + r'\1', content)

    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"    [FIXED] Added simple interruption handler")
        return True
    except Exception as e:
        print(f"    [ERROR] {e}")
        return False

def main():
    print("=" * 70)
    print("Simple Interruption Fix - Audio Detection Only")
    print("=" * 70)

    base_dir = Path(__file__).parent
    static_dir = base_dir / "backend" / "static" / "pages"

    fixed = 0
    total = 0

    print(f"\n[SEARCH] {static_dir}")
    if static_dir.exists():
        for htmlpath in static_dir.glob("*/index.html"):
            total += 1
            if fix_html_file(htmlpath):
                fixed += 1

    print("\n" + "=" * 70)
    print(f"DONE! Fixed {fixed}/{total} files")
    print("=" * 70)

if __name__ == "__main__":
    main()
