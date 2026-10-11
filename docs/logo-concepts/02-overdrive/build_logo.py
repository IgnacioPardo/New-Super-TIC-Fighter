from pathlib import Path
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely import affinity
from html import escape

OUT=Path(__file__).resolve().parent
# New polygon lettering. The F and terminal R carry the sweeping silhouette.
G={
'S':(86,[[(19,0),(86,0),(86,23),(31,23),(27,27),(27,38),(67,38),(86,55),(86,82),(67,100),(0,100),(0,76),(54,76),(59,71),(59,63),(19,63),(0,46),(0,18)]]),
'U':(88,[[(0,0),(29,0),(29,70),(35,77),(54,77),(60,70),(60,0),(88,0),(88,80),(67,100),(21,100),(0,80)]]),
'P':(86,[[(0,0),(66,0),(86,18),(86,51),(67,70),(29,70),(29,100),(0,100)],[(29,23),(29,47),(53,47),(58,42),(58,28),(53,23)]]),
'E':(79,[[(0,0),(79,0),(79,23),(29,23),(29,38),(67,38),(67,60),(29,60),(29,77),(79,77),(79,100),(0,100)]]),
'R':(91,[[(0,0),(66,0),(86,18),(86,49),(67,68),(91,100),(57,100),(36,69),(29,69),(29,100),(0,100)],[(29,23),(29,46),(54,46),(58,42),(58,27),(54,23)]]),
'T':(92,[[(0,0),(92,0),(92,25),(61,25),(61,100),(30,100),(30,25),(0,25)]]),
'I':(34,[[(0,0),(34,0),(34,100),(0,100)]]),
'C':(87,[[(21,0),(87,0),(87,26),(35,26),(29,32),(29,68),(35,74),(87,74),(87,100),(21,100),(0,80),(0,20)]]),
'F':(100,[[(-12,-7),(104,-7),(95,22),(33,22),(33,41),(83,41),(75,65),(33,65),(33,99),(0,115),(0,22),(-12,22)]]),
'G':(96,[[(22,0),(96,0),(96,25),(35,25),(29,31),(29,69),(35,75),(66,75),(66,61),(49,61),(49,40),(96,40),(96,81),(75,100),(22,100),(0,80),(0,20)]]),
'H':(92,[[(0,0),(30,0),(30,37),(62,37),(62,0),(92,0),(92,100),(62,100),(62,64),(30,64),(30,100),(0,100)]]),
'Q':(121,[[(0,0),(66,0),(87,19),(87,48),(67,67),(113,105),(139,105),(109,128),(59,99),(35,69),(29,69),(29,100),(0,100)],[(29,23),(29,46),(52,46),(59,40),(59,29),(53,23)]]),
'N':(91,[[(0,0),(29,0),(63,57),(63,0),(91,0),(91,100),(62,100),(28,45),(28,100),(0,100)]]),
'W':(118,[[(0,0),(29,0),(38,66),(47,34),(72,34),(81,66),(89,0),(118,0),(101,100),(71,100),(59,67),(47,100),(17,100)]])}

def word(t,x,y,w,h,track=10,lean=.20,sweep=0):
    natural=sum(G[c][0] if c!=' ' else 43 for c in t)+track*(len(t)-1)
    sx=(w-h*lean)/natural;sy=h/100;cursor=0;parts=[]
    for c in t:
        if c==' ':cursor+=43+track;continue
        width,rings=G[c]
        transformed=[]
        for ring in rings:
            pts=[]
            for px,py in ring:
                gx=x+(cursor+px)*sx+(100-py)*sy*lean
                gy=y+py*sy+sweep*(gx-x)
                pts.append((gx,gy))
            transformed.append(pts)
        poly=Polygon(transformed[0],transformed[1:])
        if not poly.is_valid:poly=poly.buffer(0)
        parts.append(poly)
        cursor+=width+track
    return unary_union(parts)

def d(geom):
    if geom.is_empty:return ''
    if hasattr(geom,'geoms'):return ' '.join(d(p) for p in geom.geoms)
    if not hasattr(geom,'exterior'):return ''
    rings=[geom.exterior,*geom.interiors];out=[]
    for ring in rings:
        points=list(ring.coords)[:-1]
        out.append('M'+' L'.join(f'{x:.2f},{y:.2f}' for x,y in points)+' Z')
    return ' '.join(out)
def shape(geom,fill,extra=''):
    return f'<path d="{d(geom)}" fill="{fill}" fill-rule="evenodd" {extra}/>'
def offset(g,r):return g.buffer(r,join_style='mitre',mitre_limit=2)

top=word('SUPER TIC',210,218,1010,129,track=9,lean=.18,sweep=-.016)
# Q is the custom terminal R; rendered word is FIGHTER.
bottom=word('FIGHTEQ',113,392,1120,201,track=8,lean=.21,sweep=-.023)
new=word('NEW',307,146,168,39,track=12,lean=.19)
all_letters=unary_union([top,bottom])
extrusion=unary_union([affinity.translate(offset(all_letters,16),xoff=-i*.68,yoff=i) for i in range(0,27,2)])

bevels=[]
for geom,key in [(top,'top'),(bottom,'fighter')]:
    # Physical inner edge bands, so the bevel stays editable geometry.
    highlight=geom.difference(affinity.translate(geom,xoff=4,yoff=6))
    shade=geom.difference(affinity.translate(geom,xoff=-5,yoff=-8))
    inner=offset(geom,-5)
    bevels.append(shape(geom,f'url(#{key}-face)'))
    bevels.append(shape(shade,'#1586B9' if key=='top' else '#065C98'))
    bevels.append(shape(highlight,'#FFFFFF' if key=='top' else '#A4ECFF'))
    bevels.append(shape(inner,'none', 'stroke="#FFFFFF" stroke-width=".75" opacity=".28"'))

NEW_TAB='M285 128 H530 L514 194 H269 Z'
# One sweep belongs to the lockup, with a pink inset and two short end cuts.
SWEEP='M110 633 C467 679 903 671 1245 574 L1224 617 C840 716 411 711 88 671 Z'
PINK_SWEEP='M113 632 C478 677 914 664 1245 574 L1230 593 C868 691 442 698 102 650 Z'
art=f'''<g id="overdrive-lockup" transform="translate(44.5 0) rotate(-5 720 440)">
<path d="{SWEEP}" fill="#073B70" stroke="#101B30" stroke-width="7" stroke-linejoin="round"/>
<path d="{PINK_SWEEP}" fill="#F23899"/>
<path d="M253 656 C533 682 854 664 1074 618" fill="none" stroke="#FF9CCD" stroke-width="2.5"/>
{shape(offset(extrusion,5),'#08172C')}
{shape(extrusion,'#075388')}
{shape(affinity.translate(offset(all_letters,15),xoff=-6,yoff=9),'#128BCC')}
{shape(offset(all_letters,17),'#081A32')}
{shape(offset(all_letters,12),'#F5FAFF')}
{shape(offset(all_letters,6),'#076FA9')}
{''.join(bevels)}
<path d="M279 135 H529 L513 205 H261 Z" fill="#991458" stroke="#111A2D" stroke-width="6"/>
<path d="{NEW_TAB}" fill="url(#new-face)" stroke="#FFD7EB" stroke-width="2"/>
<path d="M289 133 H523" stroke="#FF9CCF" stroke-width="3"/>
{shape(new,'#FFFFFF')}
<path d="M550 170 L672 168.048 L670.02 179.08 L548.02 181.032 Z" fill="#27BCF9"/>
<path d="M680 167.92 L739 166.976 L737.02 178.008 L678.02 178.952 Z" fill="#F23899"/>
</g>'''
# Continuous caps and bevels; no textures, filters, or raster inserts.
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="860" viewBox="0 0 1440 860" role="img" aria-labelledby="title desc">
<title id="title">New Super TIC Fighter — Overdrive</title><desc id="desc">A rising arcade wordmark with custom extended F and R letterforms, bevelled white and blue lettering, a pink NEW tab, and a sweeping pink underline.</desc>
<defs>
<linearGradient id="top-face" x1="0" y1="230" x2="0" y2="370" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset=".48" stop-color="#F7FBFF"/><stop offset="1" stop-color="#A9E9FF"/></linearGradient>
<linearGradient id="fighter-face" x1="0" y1="378" x2="0" y2="610" gradientUnits="userSpaceOnUse"><stop stop-color="#71DCFF"/><stop offset=".43" stop-color="#27B7F5"/><stop offset=".435" stop-color="#159CE0"/><stop offset="1" stop-color="#0873B9"/></linearGradient>
<linearGradient id="new-face" x1="0" y1="128" x2="0" y2="196" gradientUnits="userSpaceOnUse"><stop stop-color="#FF58B5"/><stop offset="1" stop-color="#E6238A"/></linearGradient>
</defs>{art}</svg>'''
(OUT/'overdrive.svg').write_text(svg)
print('Saved',OUT/'overdrive.svg')

mono_art=f'''<g transform="translate(44.5 0) rotate(-5 720 440)">{shape(top,'#FFFFFF')}{shape(bottom,'#FFFFFF')}<path d="{NEW_TAB} {d(new)}" fill="#FFFFFF" fill-rule="evenodd"/><path d="{PINK_SWEEP}" fill="#FFFFFF"/></g>'''
mono=f'''<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="860" viewBox="0 0 1440 860" role="img" aria-labelledby="title"><title id="title">New Super TIC Fighter — Overdrive, one colour</title>{mono_art}</svg>'''
(OUT/'overdrive-mono.svg').write_text(mono)
