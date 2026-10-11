"""Publish the selected Overdrive assets without modifying their design masters."""
from pathlib import Path
import hashlib
import json
import shutil

root = Path(__file__).resolve().parents[1]
source = root / 'docs/logo-concepts/02-overdrive/polished'
output = root / 'public/assets/branding'
output.mkdir(parents=True, exist_ok=True)
assets = {
    'overdrive-primary.svg': 'overdrive.svg',
    'overdrive-horizontal.svg': 'overdrive-horizontal.svg',
    'overdrive-icon.svg': 'overdrive-icon.svg',
    'overdrive-icon-micro.svg': 'overdrive-icon-micro.svg',
    'overdrive-icon-180.png': 'apple-touch-icon.png',
    'favicon.ico': 'favicon.ico',
    'use-cases-social-card.png': 'social-card.png',
}
provenance_path = root / 'docs/asset-provenance.json'
provenance = json.loads(provenance_path.read_text())
outputs = {str((output / name).relative_to(root)) for name in assets.values()}
provenance = [entry for entry in provenance if entry['output'] not in outputs]
for master, name in assets.items():
    src, dest = source / master, output / name
    shutil.copyfile(src, dest)
    provenance.append({
        'source': str(src.relative_to(root)),
        'sourceSha256': hashlib.sha256(src.read_bytes()).hexdigest(),
        'output': str(dest.relative_to(root)),
        'correction': 'Owner-selected, code-authored Overdrive branding. Copied unchanged from the refined master; historical logo and source artwork retained.',
    })
provenance_path.write_text(json.dumps(provenance, indent=2) + '\n')
manifest_path = root / 'public/assets/manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['logo'] = '/assets/branding/overdrive.svg'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Published {len(assets)} refined Overdrive brand assets.')
