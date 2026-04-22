import re
from pathlib import Path

# Absolute simplest config - just tell it to detect interruptions
SIMPLE_CONFIG = """config: {
          turn_detection: {
            mode: 'server'
          }
        },
        """

def fix(filepath):
    content = filepath.read_text(encoding='utf-8')
    
    # Remove complex config, replace with simple one
    pattern = r'config:\s*\{[^}]*audio:[^}]*\}[^}]*turn_detection:[^}]*\}[^}]*\},'
    
    if re.search(pattern, content):
        content = re.sub(pattern, SIMPLE_CONFIG, content, flags=re.DOTALL)
        filepath.write_text(content, encoding='utf-8')
        print(f"[FIXED] {filepath.name}")
        return True
    return False

static_dir = Path("backend/static/pages")
fixed = sum(fix(p / "index.html") for p in static_dir.iterdir() if p.is_dir())
print(f"\nFixed {fixed} files with simple config")
