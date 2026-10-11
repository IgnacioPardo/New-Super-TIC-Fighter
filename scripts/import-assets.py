"""Reproducibly import the owner's runtime media without modifying historical sources."""
from pathlib import Path
from PIL import Image
import argparse, colorsys, hashlib, json, re, shutil, subprocess, sys

parser = argparse.ArgumentParser()
parser.add_argument('--drive', type=Path, default=Path('/Users/nacho/Downloads/Super TIC Fighter Remake'))
parser.add_argument('--original', type=Path, default=Path('/Users/nacho/Downloads/STF_2017'))
parser.add_argument('--remake', type=Path, default=Path('/tmp/stf-remake-audit-ThKloi'))
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = root / 'public/assets'
drive = args.drive / 'Sprites Sin editar'
remake = args.remake / 'Assets'
original = args.original / 'Programacion/Super Tic Fighter/Super Tic Fighter/Super Tic FighterContent'
for d in ('fighters', 'effects', 'backgrounds', 'platforms', 'portraits', 'audio/original', 'audio/remake', 'audio/effects'):
    (out / d).mkdir(parents=True, exist_ok=True)
provenance = []

def record(src, dest, correction=None):
    provenance.append({'source': str(src), 'sourceSha256': hashlib.sha256(src.read_bytes()).hexdigest(),
                       'output': str(dest.relative_to(root)), 'correction': correction})

def copy(src, target):
    dest = out / target
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    record(src, dest)
    return '/assets/' + target

mapping = json.loads((root / 'docs/evidence/drive-to-unity-sheet-matches.json').read_text())
sheets = {'frameWidth': 60, 'frameHeight': 96, 'columns': 7, 'hair': [], 'shirt': [], 'pants': []}
for name, frames in mapping.items():
    key = 'body' if name == 'Cuerpos.png' else {'Pelo':'hair', 'Remera':'shirt', 'Pantalon':'pants'}[re.sub(r'\d+\.png$', '', name)]
    index = None if key == 'body' else int(re.search(r'\d+', name)[0])
    image = Image.new('RGBA', (420, 576))
    dest = out / 'fighters' / (key + (str(index) if index is not None else '') + '.png')
    for frame in frames:
        src = drive / frame['matches'][0]
        tile = Image.open(src).convert('RGBA')
        correction = None
        if src.name == 'Golpe1_Pelo0.png':
            pixels = []
            for r, g, b, a in tile.getdata():
                h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                rr, gg, bb = colorsys.hsv_to_rgb((h + 50 / 360) % 1, s, v)
                pixels.append((round(rr * 255), round(gg * 255), round(bb * 255), a))
            tile.putdata(pixels)
            correction = 'Trello 35: hair-0 hue restored (+50 degrees), original silhouette/alpha retained'
        if src.name.startswith('Redes1_'):
            shifted = Image.new('RGBA', (60, 96))
            shifted.paste(tile, (-1, 0))
            tile = shifted
            correction = 'Trello 35: overlay x offset -1'
        image.paste(tile, (frame['col'] * 60, frame['row'] * 96))
        record(src, dest, correction)
    image.save(dest, optimize=True)
    url = '/assets/fighters/' + dest.name
    if key == 'body': sheets[key] = url
    else:
        while len(sheets[key]) <= index: sheets[key].append('')
        sheets[key][index] = url

poses = {
    'crouch':[0], 'sweep':[1], 'walk':list(range(2,9)),
    'combo-design':[9,10], 'combo-hardware':[11,12,13],
    'combo-networks':[14,15], 'combo-code':[14,15],
    'guard':[16], 'punch':[17,18,19,20], 'hurt':[21,24],
    'idle':[25,26], 'jump':[27], 'special-design':[28,29],
    'special-hardware':[30,31,32], 'special-code':[33,34],
    'special-networks':[35,36], 'uppercut':[37],
}
effect_paths = {'cable':'Redes/Spam','cables':'Redes/Combo','mouse':'Diseno/Spam','selection':'Diseno/Combo',
                'ball':'Programacion/Spam','column':'Programacion/Combo','ram':'Hardware/Spam','disc':'Hardware/Combo'}
effects = {}
for kind, folder in effect_paths.items():
    files = sorted((drive / 'Ataques' / folder).glob('*.png'), key=lambda p: int(re.search(r'\d+', p.stem)[0]) if re.search(r'\d+', p.stem) else 0)
    effects[kind] = [copy(p, f'effects/{kind}-{i}.png') for i,p in enumerate(files)]
platforms = [copy(drive / f'Escenarios/Mapa1/Plataformas/Plataforma{i}.png', f'platforms/classic-{i}.png') for i in range(3)]
portraits = [copy(drive / f'HUD/Retrato{h}-{s}.png', f'portraits/{h}-{s}.png') for h in range(4) for s in range(4)]
background = copy(remake / 'Backgrounds/Map1.png', 'backgrounds/classic.png')
audio = {
    'intro': copy(remake / 'OST/intro.mp3', 'audio/intro.mp3'),
    'original': [copy(original / f'Sonidos/Cancion {i}.mp3', f'audio/original/{i:02d}.mp3') for i in range(8)],
    'remake': [copy(remake / f'Music/Cancion{i}.mp3', f'audio/remake/{i:02d}.mp3') for i in range(16)],
    'effects': {p.stem:copy(p, f'audio/effects/{p.name}') for p in sorted((original / 'Sonidos').glob('*.wav'))},
}
manifest = {
    'sheets':sheets, 'poses':poses, 'effects':effects, 'platforms':platforms, 'portraits':portraits,
    'arenaPlatforms':{arena:[f'/assets/platforms/{arena}-{i}.svg' for i in range(3)] for arena in ['lab','pc']},
    'backgrounds':{'classic':background, 'lab':'/assets/backgrounds/lab.svg','pc':'/assets/backgrounds/pc.svg'},
    'font':copy(remake / 'ARCADE_N.TTF','arcade.ttf'), 'logo':copy(remake / 'STFX.png','logo.png'), 'audio':audio,
}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
(root / 'docs/asset-provenance.json').write_text(json.dumps(provenance, indent=2)+'\n')
subprocess.run([sys.executable, str(root / 'scripts/import-branding.py')], check=True)
subprocess.run([sys.executable, str(root / 'scripts/make-audio-headers.py')], check=True)
print(f'Imported {len(provenance)} source records; {sum(len(v) for v in effects.values())} effect frames and {len(audio["effects"])} sound effects.')
