"""Author SVG platform trim for new arenas at exact collision dimensions."""
from pathlib import Path
import json
root = Path(__file__).resolve().parent.parent
out = root / 'public/assets/platforms'
for arena in ['lab', 'pc']:
    for index, width in enumerate([800,500,250]):
        parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="50" viewBox="0 0 {width} 50">']
        if arena == 'lab':
            parts += ['<defs><linearGradient id="wood" x2="0" y2="1"><stop stop-color="#d8ba82"/><stop offset=".23" stop-color="#a88552"/><stop offset="1" stop-color="#634631"/></linearGradient><linearGradient id="metal" x2="0" y2="1"><stop stop-color="#60756e"/><stop offset=".4" stop-color="#243b37"/><stop offset="1" stop-color="#142522"/></linearGradient></defs>',f'<path d="M0 0H{width}V12H0Z" fill="url(#wood)"/>',f'<path d="M0 0H{width}V3H0Z" fill="#fae8b6"/>',f'<path d="M5 12H{width-5}V48H5Z" fill="url(#metal)"/>',f'<path d="M8 15H{width-8}M8 45H{width-8}" stroke="#779388" stroke-width="2"/>']
            for x in range(25,width-15,75):
                parts += [f'<path d="M{x} 19h45v21h-45z" fill="#182a27" stroke="#445b52"/>',f'<circle cx="{x+4}" cy="23" r="1.5" fill="#a1b5a1"/><circle cx="{x+41}" cy="36" r="1.5" fill="#a1b5a1"/>']
            for x in range(50,width-40,170):
                parts += [f'<path d="M{x} 6h70" stroke="#84623d" opacity=".55"/>',f'<path d="M{x+20} 25h22v9h-22z" fill="#0d1a18"/><path d="M{x+24} 28h14" stroke="#d2aa62"/><circle cx="{x+48}" cy="29" r="2" fill="#72ecb8"/>']
        else:
            parts += [f'<path d="M0 0H{width}V48H0Z" fill="#113d36"/>',f'<path d="M0 0H{width}V3H0Z" fill="#a8f3bf"/>',f'<path d="M0 46H{width}V50H0Z" fill="#081e20"/>',f'<path d="M0 7H{width}M0 42H{width}" stroke="#477f55" stroke-width="2"/>']
            for x in range(15,width-20,85):
                parts += [f'<path d="M{x} 12h20l8 8h28v10h-16l-10 8H{x}" fill="none" stroke="#bb9450" stroke-width="2"/>',f'<rect x="{x+24}" y="15" width="28" height="18" rx="2" fill="#14252c" stroke="#627d71"/>',f'<path d="M{x+29} 19h18M{x+29} 23h18" stroke="#304749"/>',f'<circle cx="{x+5}" cy="16" r="2" fill="#77ebce"/><circle cx="{x+62}" cy="35" r="3" fill="#192a28" stroke="#b39455"/>']
                for pin in range(5):
                    parts += [f'<path d="M{x+27+pin*5} 12v3m0 18v3" stroke="#c7b880" stroke-width="2"/>']
        parts.append('</svg>')
        (out / f'{arena}-{index}.svg').write_text(''.join(parts))
manifest_path = root / 'public/assets/manifest.json'
manifest=json.loads(manifest_path.read_text())
manifest['arenaPlatforms']={arena:[f'/assets/platforms/{arena}-{i}.svg' for i in range(3)] for arena in ['lab','pc']}
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
