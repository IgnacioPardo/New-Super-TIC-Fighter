"""Code-authored vector scenery; no image-generation service or external media.
Rebuild with Python's standard library. The browser rasterizes SVG at asset load.
"""
from pathlib import Path
import json, math
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT/'public/assets/backgrounds'
DEFS = '''<defs>
<linearGradient id="wall" x2="0" y2="1"><stop stop-color="#6b776f"/><stop offset="1" stop-color="#293b3c"/></linearGradient>
<linearGradient id="floor" x2="0" y2="1"><stop stop-color="#28373a"/><stop offset="1" stop-color="#0c171f"/></linearGradient>
<linearGradient id="sun" x2="1" y2="1"><stop stop-color="#e3be8c"/><stop offset=".45" stop-color="#987d69"/><stop offset="1" stop-color="#465a61"/></linearGradient>
<linearGradient id="desk" x2="0" y2="1"><stop stop-color="#8f7b5a"/><stop offset=".35" stop-color="#594d3c"/><stop offset="1" stop-color="#293436"/></linearGradient>
<linearGradient id="board" x2="0" y2="1"><stop stop-color="#234a40"/><stop offset="1" stop-color="#0a2429"/></linearGradient>
<linearGradient id="chip" x2="0" y2="1"><stop stop-color="#344147"/><stop offset=".1" stop-color="#15242a"/><stop offset="1" stop-color="#071219"/></linearGradient>
<radialGradient id="vignette"><stop offset=".2" stop-color="#08111d" stop-opacity=".2"/><stop offset="1" stop-color="#020c17" stop-opacity=".76"/></radialGradient>
<filter id="grain"><feTurbulence baseFrequency=".65" numOctaves="3" stitchTiles="stitch" type="fractalNoise"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".12"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter>
</defs>'''
def rect(x,y,w,h,fill,extra=''):
 return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" {extra}/>'
def line(x1,y1,x2,y2,color,width=1):
 return f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{color}" stroke-width="{width}"/>'
def start():return ['<svg xmlns="http://www.w3.org/2000/svg" width="1366" height="768" viewBox="0 0 1366 768">',DEFS]
lab=start()+[rect(0,0,1366,768,'url(#wall)'),rect(0,450,1366,318,'url(#floor)')]
# Architectural perspective, broad afternoon windows, ceiling lights, green board.
for x in [45,250]:
 lab += [rect(x,85,165,270,'#1a3034'),rect(x+9,95,147,248,'url(#sun)')]
 for k in [1,2]:lab.append(line(x+8,95+k*82,x+157,95+k*82,'#365052',8))
 lab.append(line(x+82,95,x+82,343,'#365052',8))
 lab.append(f'<path d="M{x+9} 343L{x+156} 343L{x+480} 620L{x+140} 620Z" fill="#c6a873" opacity=".08"/>')
lab += [rect(508,111,590,222,'#4e4c3c'),rect(519,122,568,198,'#183c37'),rect(505,330,603,8,'#797461')]
for row in range(5):
 for col in range(8):
  x=545+col*63;y=151+row*31
  lab.append(f'<path d="M{x} {y}h{18+(row+col)%4*8}m8 6h17" stroke="#8caaa0" stroke-width="1.2" opacity=".13"/>')
lab += [rect(0,40,1366,13,'#243d40'),line(0,450,1366,450,'#11262c',9)]
for x in [260,835]:
 lab += [f'<path d="M{x} 25l270 0l-18 19H{x-24}Z" fill="#a9b0a0" opacity=".6"/>',line(x+4,31,x+238,31,'#e4dcbd',5)]
for x in range(-900,2200,210):lab.append(line(680,455,x,768,'#527072',1))
for y in [489,542,613,710]:lab.append(line(0,y,1366,y,'#3a5359',2))
def computer(x,y,scale):
 p=[f'<g transform="translate({x} {y}) scale({scale})">']
 p += [rect(0,0,93,79,'#8b8775','rx="5"'),rect(8,8,77,55,'#111f29','rx="3"'),rect(13,13,67,43,'#29464c'),rect(39,78,17,19,'#5e655c'),rect(22,94,53,5,'#7c7d68')]
 p += [line(19,26,65,26,'#6a9a8d',2),line(19,33,50,33,'#528478',2),rect(109,13,38,87,'#555f58','rx="3"'),rect(115,21,26,4,'#1d2e31'),rect(-5,107,102,13,'#58695f')]
 for row in range(2):
  for col in range(10):p.append(rect(col*8,109+row*5,5,2,'#2b4241'))
 p += [f'<circle cx="135" cy="78" r="2" fill="#99c37d"/>',f'<path d="M135 100q20 30-23 40m-67-40q-20 23 4 48" stroke="#132b32" fill="none" stroke-width="3"/>','</g>']
 return p
# Rear rows remain scenery behind the collision plane, subdued for fighter contrast.
for row,(y,scale) in enumerate([(358,.57),(447,.79),(620,1.05)]):
 xs=[455,660,865,1070] if row==0 else [60,325,780,1070] if row==1 else [-55,1110]
 for x in xs:
  lab += [rect(x-25,y+95*scale,205*scale,13*scale,'url(#desk)'),rect(x-10,y+108*scale,8*scale,100*scale,'#243c3d'),rect(x+150*scale,y+108*scale,8*scale,100*scale,'#243c3d')]
  lab += computer(x,y,scale)
# Wall-mounted conduit and distant equipment give the room a recognizable school-lab silhouette.
lab += [f'<path d="M1190 49v341h125v203" fill="none" stroke="#172e35" stroke-width="8"/>',rect(1180,130,130,178,'#263a3c'),rect(1192,144,106,150,'#14282f')]
for y in range(155,280,20):lab += [rect(1202,y,85,12,'#344749'),rect(1271,y+3,4,3,'#82aaa0')]
lab += [rect(0,0,1366,768,'url(#vignette)'),rect(0,0,1366,768,'#34504b','opacity=".1" filter="url(#grain)"'),'</svg>']
(OUT/'lab.svg').write_text(''.join(lab))
pc=start()+[rect(0,0,1366,768,'url(#board)')]
# Copper traces have deliberate right-angle routes and through-board vias.
for i in range(38):
 y=24+i*19;x=(i*83)%350;end=810+(i*31)%510
 pc += [f'<path d="M0 {y}h{x}l34 34h{max(20,end-x-85)}l45-45H1366" fill="none" stroke="{["#617358","#956f40","#426b54"][i%3]}" stroke-width="{2+i%2}" opacity=".55"/>']
 for vx in [x+34,end-8]:pc.append(f'<circle cx="{vx}" cy="{y+34}" r="5" fill="#0c292c" stroke="#9b8554" stroke-width="2"/>')
# Giant cooler at upper left and ribbon cable at right frame an open central fight plane.
pc += ['<g transform="translate(150 139)">',rect(-140,-140,280,280,'#10232b','rx="22"'),'<circle r="125" fill="#08191f" stroke="#41565a" stroke-width="8"/>']
for i in range(9):pc.append(f'<path transform="rotate({i*40})" d="M0-22C20-115 70-135 101-66C60-56 49-14 15 12Z" fill="#334b50" stroke="#4b6263" stroke-width="2"/>')
pc += ['<circle r="30" fill="#4c5d5b"/><circle r="22" fill="#1c353b"/>','</g>']
for x,y,w,h in [(1035,49,215,145),(63,486,201,166),(962,525,270,135),(498,72,211,111)]:
 pc += [rect(x,y,w,h,'url(#chip)','rx="6"'),rect(x+7,y+7,w-14,h-14,'none','stroke="#465b5a" stroke-width="2"')]
 for px in range(x+12,x+w-8,14):pc+=[rect(px,y-12,6,12,'#929583'),rect(px,y+h,6,12,'#929583')]
 for py in range(y+12,y+h-8,14):pc+=[rect(x-12,py,12,6,'#929583'),rect(x+w,py,12,6,'#929583')]
 for j in range(3):pc.append(line(x+22,y+29+j*9,x+w-35-(j%2)*21,y+29+j*9,'#556761',2))
for i in range(13):
 x=1250+i*6
 pc.append(f'<path d="M{x} 0v180q-20 55-75 75t-75 100v100" fill="none" stroke="{["#69776b","#394f50","#b08054"][i%3]}" stroke-width="5"/>')
for x,y in [(355,77),(397,103),(879,119),(898,637),(380,642),(45,375),(1299,606)]:
 pc += [f'<ellipse cx="{x}" cy="{y+20}" rx="20" ry="9" fill="#081b20"/>',rect(x-19,y-26,38,45,'#29454a'),f'<ellipse cx="{x}" cy="{y-26}" rx="19" ry="9" fill="#8a998c"/>',line(x-11,y-26,x+11,y-26,'#456267',2),line(x,y-33,x,y-19,'#456267',2)]
for i in range(22):
 x=18+(i*157)%1320;y=50+(i*79)%660
 pc += [rect(x,y,15,9,'#152e32'),rect(x+3,y+2,9,5,'#a48d58')]
for x,y in [(424,96),(976,213),(1204,479),(238,677)]:
 pc += [f'<circle cx="{x}" cy="{y}" r="12" fill="#48bba4" opacity=".08"/><circle cx="{x}" cy="{y}" r="3" fill="#87cdb7"/>']
pc += [rect(0,0,1366,768,'url(#vignette)'),rect(0,0,1366,768,'#456149','opacity=".1" filter="url(#grain)"'),'</svg>']
(OUT/'pc.svg').write_text(''.join(pc))
manifest_path=ROOT/'public/assets/manifest.json'
manifest=json.loads(manifest_path.read_text())
manifest['backgrounds'].update(lab='/assets/backgrounds/lab.svg',pc='/assets/backgrounds/pc.svg')
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
