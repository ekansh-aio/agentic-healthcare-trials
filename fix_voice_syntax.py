#!/usr/bin/env python3
"""
Fix Voice Syntax Errors - Correct the double comma and add missing comma
"""

import os
import re
from pathlib import Path

def fix_syntax_errors(filepath):
    """Fix JavaScript syntax errors in Conversation.startSession"""
    print(f"\n[*] Fixing: {filepath}")

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"    [ERROR] Error reading file: {e}")
        return False

    original_content = content

    # Fix 1: Remove double comma after signedUrl
    content = re.sub(
        r'signedUrl:\s*data\.signed_url,\s*,',
        'signedUrl: data.signed_url,',
        content
    )

    # Fix 2: Add missing comma after config object (before onConnect)
    content = re.sub(
        r'(sensitivity:\s*[\'"]high[\'"]\s*}\s*})\s*(onConnect:)',
        r'\1,\n        \2',
        content
    )

    if content != original_content:
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"    [FIXED] Syntax errors corrected!")
            return True
        except Exception as e:
            print(f"    [ERROR] Error writing file: {e}")
            return False
    else:
        print(f"    [SKIP] No syntax errors found")
        return False

def main():
    print("=" * 70)
    print("Voice Syntax Error Fix - Correcting JavaScript")
    print("=" * 70)

    base_dir = Path(__file__).parent
    outputs_dir = base_dir / "backend" / "outputs"
    static_dir = base_dir / "backend" / "static" / "pages"

    fixed_count = 0
    total_count = 0

    # Fix generated websites in outputs/
    print(f"\n[SEARCH] Fixing files in: {outputs_dir}")
    if outputs_dir.exists():
        for htmlpath in outputs_dir.glob("*/*/website/index.html"):
            if 'turn_detection' in htmlpath.read_text(encoding='utf-8'):
                total_count += 1
                if fix_syntax_errors(htmlpath):
                    fixed_count += 1

    # Fix hosted websites in static/pages/
    print(f"\n[SEARCH] Fixing files in: {static_dir}")
    if static_dir.exists():
        for htmlpath in static_dir.glob("*/index.html"):
            if 'turn_detection' in htmlpath.read_text(encoding='utf-8'):
                total_count += 1
                if fix_syntax_errors(htmlpath):
                    fixed_count += 1

    # Summary
    print("\n" + "=" * 70)
    print(f"DONE!")
    print(f"   Total files checked: {total_count}")
    print(f"   Files fixed: {fixed_count}")
    print("=" * 70)

    if fixed_count > 0:
        print("\n[SUCCESS] JavaScript syntax errors fixed!")
        print("\nNext: Run copy_to_static.sh and redeploy to production")
    else:
        print("\n[OK] No syntax errors found in files")

if __name__ == "__main__":
    main()
