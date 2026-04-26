import re
from pathlib import Path

def clean(filepath):
    content = filepath.read_text(encoding='utf-8')
    
    # Remove any remaining config fragments
    content = re.sub(
        r',?\s*(config:\s*\{[^}]*\}|turn_detection:[^}]*\})\s*\},?',
        '',
        content,
        flags=re.DOTALL
    )
    
    # Clean up double commas
    content = re.sub(r',,+', ',', content)
    
    filepath.write_text(content, encoding='utf-8')
    print(f"[CLEANED] {filepath.parent.name}")

static_dir = Path("backend/static/pages")
for p in static_dir.iterdir():
    if (p / "index.html").exists():
        clean(p / "index.html")

print("\nDone - all files now use simplest config (backend handles interruption)")
