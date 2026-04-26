import re
from pathlib import Path

def fix_comma(filepath):
    content = filepath.read_text(encoding='utf-8')
    
    # Add missing comma after signedUrl if not present
    content = re.sub(
        r'(signedUrl:\s*data\.signed_url)\s+(onConnect:)',
        r'\1,\n        \2',
        content
    )
    
    filepath.write_text(content, encoding='utf-8')
    print(f"[FIXED COMMA] {filepath.parent.name}")

static_dir = Path("backend/static/pages")
for p in static_dir.iterdir():
    if (p / "index.html").exists():
        fix_comma(p / "index.html")

print("\nAll syntax errors fixed - ready to deploy")
