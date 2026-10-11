"""Declare MP3 sizes for streaming Workers responses; --check detects stale metadata."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'public/assets/manifest.json').read_text())
audio = manifest['audio']
paths = [audio['intro'], *audio['original'], *audio['remake']]
begin = '# BEGIN GENERATED MP3 LENGTHS'
end = '# END GENERATED MP3 LENGTHS'
headers = root / 'public/_headers'
current = headers.read_text()
prefix = current.split(begin, 1)[0].rstrip()
suffix = current.split(end, 1)[1] if end in current else '\n'
lines = [begin, '# ASSETS.fetch omits inferred Content-Length; ranges need explicit sizes.']
for path in dict.fromkeys(paths):
    if not path.startswith('/assets/audio/') or not path.endswith('.mp3'):
        raise SystemExit(f'Unexpected music path: {path}')
    lines.extend([path, f'  Content-Length: {(root / "public" / path.lstrip("/")).stat().st_size}'])
lines.append(end)
updated = prefix + '\n\n' + '\n'.join(lines) + suffix
if args.check:
    if current != updated:
        raise SystemExit('MP3 header sizes are stale. Run python3 scripts/make-audio-headers.py.')
    print(f'MP3 header sizes verified for {len(set(paths))} tracks.')
else:
    headers.write_text(updated)
    print(f'MP3 header sizes updated for {len(set(paths))} tracks.')
