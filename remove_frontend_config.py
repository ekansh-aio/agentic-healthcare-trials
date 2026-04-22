import re
from pathlib import Path

def simplify(filepath):
    """Remove frontend config - let backend handle interruption"""
    content = filepath.read_text(encoding='utf-8')
    
    # Remove the entire config object we added
    before = content
    content = re.sub(
        r',\s*config:\s*\{[^}]+\{[^}]+\}[^}]+\{[^}]+\}[^}]+\},',
        ',',
        content,
        flags=re.DOTALL
    )
    
    if content != before:
        filepath.write_text(content, encoding='utf-8')
        print(f"[REMOVED CONFIG] {filepath.parent.name}")
        return True
    return False

static_dir = Path("backend/static/pages")
count = sum(simplify(p / "index.html") for p in static_dir.iterdir() if (p / "index.html").exists())
print(f"\n✓ Removed complex config from {count} files")
print("Backend turn_detection will now handle everything")
