"""Create a multi-image favicon, verify exports, and package the brand family."""
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED
from PIL import Image

out=Path(__file__).resolve().parent
sizes=[16,32,48]
payloads=[(out/f'overdrive-icon-{size}.png').read_bytes() for size in sizes]
offset=6+16*len(sizes)
directory=[]
for size,payload in zip(sizes,payloads):
    directory.append(struct.pack('<BBBBHHII',size,size,0,0,1,32,len(payload),offset))
    offset+=len(payload)
(out/'favicon.ico').write_bytes(struct.pack('<HHH',0,1,len(sizes))+b''.join(directory)+b''.join(payloads))

for path in out.glob('*.svg'):
    ET.parse(path)
for path in out.glob('overdrive-*.png'):
    im=Image.open(path)
    if im.mode=='RGBA' and 'preview' not in path.name and 'icon-' not in path.name:
        alpha=im.getchannel('A')
        bounds=alpha.getbbox()
        assert bounds and min(bounds[:2])>0 and bounds[2]<im.width and bounds[3]<im.height, (path.name,bounds)
        assert alpha.getextrema()==(0,255),path.name
assert Image.open(out/'use-cases-social-card.png').size==(1200,630)
assert Image.open(out/'use-cases-avatar-circle.png').size==(512,512)
with Image.open(out/'favicon.ico') as ico:
    assert ico.ico.sizes()=={(16,16),(32,32),(48,48)}

archive=out.parent/'overdrive-brand-kit.zip'
allowed={'.svg','.png','.html','.md','.py','.mjs','.ico','.json'}
paths=sorted(p for p in out.iterdir() if p.is_file() and p.suffix in allowed)
with ZipFile(archive,'w',ZIP_DEFLATED) as z:
    for path in paths:
        z.write(path,'overdrive-brand-kit/'+path.name)
with ZipFile(archive) as z:
    assert z.testzip() is None
print(f'Verified SVG XML, transparent bounds, favicon sizes, and ZIP integrity. {len(paths)} files: {archive}')
