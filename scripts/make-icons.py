# Regenerates the icon variants from assets/icon.png:
#   docs/images/icon.png (README), src/UI/logo.js (window logo), header.js @icon (userscript icon)
# Usage: python3 scripts/make-icons.py   (needs Pillow)
import base64, io, re
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
icon = Image.open(root / 'assets/icon.png').convert('RGBA')

def sized(n):
    return icon.resize((n, n), Image.LANCZOS)

def data_uri(n):
    buf = io.BytesIO()
    sized(n).save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

sized(256).save(root / 'docs/images/icon.png', optimize=True)
(root / 'src/UI/logo.js').write_text(
    "// MeowEngine logo (generated from assets/icon.png by scripts/make-icons.py).\n"
    f"export const LOGO = '{data_uri(64)}';\n")
header = root / 'header.js'
header.write_text(re.sub(r'// @icon\s+\S+', '// @icon         ' + data_uri(48), header.read_text()))
print('icons updated')
