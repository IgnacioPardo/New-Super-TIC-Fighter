"""Compose README artwork from the project's existing runtime assets.

Run from any directory with Python 3 and Pillow:
    python3 /path/to/STF/docs/readme/generate-banner.py

Sources: public/assets/backgrounds/classic.png, fighters/*.png, arcade.ttf,
and manifest.json. Original source paths/hashes are recorded in
docs/asset-provenance.json. This is promotional layout artwork, not a
gameplay screenshot. No historical source files are modified.
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "public/assets"
WIDTH, HEIGHT = 1600, 720
NAVY = (12, 17, 31)
WHITE = "#f3f6ff"
PINK = "#fb73b9"
CYAN = "#52c6fd"

background = ImageOps.fit(
    Image.open(ASSETS / "backgrounds/classic.png").convert("RGB"),
    (WIDTH, HEIGHT),
)
canvas = Image.blend(background, Image.new("RGB", background.size, NAVY), 0.87)
draw = ImageDraw.Draw(canvas)


def font(size):
    return ImageFont.truetype(str(ASSETS / "arcade.ttf"), size)


def label(position, text, size, color=WHITE):
    draw.text(position, text, font=font(size), fill=color)


# Sparse cabinet-style trim, with the remake's blue / white / pink palette.
draw.rectangle((0, 0, WIDTH, 7), fill=CYAN)
draw.rectangle((WIDTH - 350, 0, WIDTH, 7), fill=PINK)
draw.line((68, 637, 1532, 637), fill="#33425a", width=2)
label((72, 66), "NEW", 24, PINK)
label((72, 154), "SUPER TIC", 65, "#203c57")
label((68, 148), "SUPER TIC", 65)
label((72, 246), "FIGHTER", 80, "#203c57")
label((68, 240), "FIGHTER", 80)
label((72, 377), "FOUR DISCIPLINES.", 22, CYAN)
label((72, 419), "ONE LAST LIFE.", 22, PINK)
label((72, 539), "ESTE GOLPE COMPILA.", 17)
label((72, 665), "ORIGINAL SPRITES. CLASSIC COMBAT.", 16, "#a7b8d2")

# Composite the first idle pose, then enlarge with nearest-neighbour sampling
# to preserve the source pixels. The base sheet carries appearance zero.
manifest = json.loads((ASSETS / "manifest.json").read_text())
frame = manifest["poses"]["idle"][0]
sheet = manifest["sheets"]
fw, fh, cols = sheet["frameWidth"], sheet["frameHeight"], sheet["columns"]
left, top = (frame % cols) * fw, (frame // cols) * fh
crop = (left, top, left + fw, top + fh)
disciplines = [
    ("NETWORKS", CYAN),
    ("DESIGN", PINK),
    ("CODE", "#86ec8f"),
    ("HARDWARE", "#fbc565"),
]

for index, (name, color) in enumerate(disciplines):
    x = 780 + index * 190
    draw.rectangle((x, 145, x + 168, 558), fill="#162137")
    draw.rectangle((x, 145, x + 168, 149), fill=color)
    label((x + 14, 167), f"0{index + 1}", 16, color)

    fighter = Image.open(ASSETS / "fighters/body.png").convert("RGBA").crop(crop)
    if index:
        for layer in ("pants", "shirt", "hair"):
            overlay = Image.open(ASSETS / f"fighters/{layer}{index - 1}.png")
            fighter.alpha_composite(overlay.convert("RGBA").crop(crop))
    if index > 1:
        fighter = ImageOps.mirror(fighter)
    fighter = fighter.resize((fw * 3, fh * 3), Image.Resampling.NEAREST)
    canvas.paste(fighter, (x - 6, 227), fighter)

    draw.line((x + 12, 520, x + 156, 520), fill=color, width=3)
    text_width = draw.textlength(name, font=font(13))
    label((x + (168 - text_width) / 2, 537), name, 13, color)

label((1151, 70), "IN DEVELOPMENT", 16, "#a7b8d2")
canvas.save(Path(__file__).with_name("banner.png"), optimize=True)
