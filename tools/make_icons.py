"""Erzeugt die App-Icons (Filamentspule + Barcode) in docs/.
Aufruf: python3 tools/make_icons.py   (benötigt Pillow)"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "docs"
S = 1024  # in hoher Auflösung zeichnen, dann verkleinern

img = Image.new("RGB", (S, S), "#111111")
d = ImageDraw.Draw(img)
cx, cy = S // 2, int(S * 0.43)

# Spule: Außenflansch, Filamentwicklung, Nabe
d.ellipse([cx - 330, cy - 330, cx + 330, cy + 330], fill="#2b2b2b")
d.ellipse([cx - 300, cy - 300, cx + 300, cy + 300], fill="#2e7d32")
for r in range(290, 130, -28):  # Wicklungsringe
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline="#43a047", width=8)
d.ellipse([cx - 130, cy - 130, cx + 130, cy + 130], fill="#2b2b2b")
d.ellipse([cx - 60, cy - 60, cx + 60, cy + 60], fill="#111111")
# loses Filamentende
d.line([(cx + 295, cy + 40), (cx + 370, cy + 190), (cx + 400, cy + 300)], fill="#43a047", width=22, joint="curve")

# Barcode-Streifen unten
bx0, by0, by1 = int(S * 0.22), int(S * 0.80), int(S * 0.92)
d.rounded_rectangle([bx0 - 30, by0 - 24, S - bx0 + 30, by1 + 24], radius=24, fill="#eeeeee")
pattern = [3, 1, 2, 1, 1, 3, 2, 1, 1, 2, 3, 1, 1, 1, 2, 2, 1, 3, 1, 2, 2, 1, 1, 3]
unit = (S - 2 * bx0) / sum(pattern)
x = bx0
for i, w in enumerate(pattern):
    if i % 2 == 0:
        d.rectangle([int(x), by0, int(x + w * unit) - 1, by1], fill="#111111")
    x += w * unit

for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
    img.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
    print("geschrieben:", OUT / name)
