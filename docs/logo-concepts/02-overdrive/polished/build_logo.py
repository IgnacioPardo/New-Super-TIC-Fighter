from pathlib import Path
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely import affinity

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

def word(t,x,y,w,h,track=10,lean=.20,sweep=0,space=25):
    natural=sum(G[c][0] if c!=' ' else space for c in t)+track*(len(t)-1)
    sx=(w-h*lean)/natural;sy=h/100;cursor=0;parts=[]
    for c in t:
        if c==' ':cursor+=space+track;continue
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

def extrude(g,dx,dy):
    """Continuous swept edges avoid the stair steps of sampled translations."""
    pieces=[g,affinity.translate(g,xoff=dx,yoff=dy)]
    for p in (list(g.geoms) if hasattr(g,'geoms') else [g]):
        for ring in [p.exterior,*p.interiors]:
            points=list(ring.coords)
            for a,b in zip(points,points[1:]):
                edge=Polygon([a,b,(b[0]+dx,b[1]+dy),(a[0]+dx,a[1]+dy)])
                if edge.area>1e-8:pieces.append(edge)
    return unary_union(pieces)

# Same silhouette as the selected concept, with more even optical spacing.
top=word('SUPER TIC',210,218,1010,129,track=12,lean=.18,sweep=-.016,space=25)
# Q is the bespoke sweeping R terminal, not the displayed character.
bottom=word('FIGHTEQ',113,392,1120,201,track=11,lean=.21,sweep=-.023)
all_letters=unary_union([top,bottom])
extrusion=extrude(offset(all_letters,15),-11,19)

bevels=[]
for geom,key in [(top,'top'),(bottom,'fighter')]:
    # A single directional bevel preserves 02's volume without inset pinstripes.
    highlight=geom.difference(affinity.translate(geom,xoff=3.5,yoff=4.5))
    shade=geom.difference(affinity.translate(geom,xoff=-4.5,yoff=-6))
    bevels.extend([
        shape(geom,f'url(#{key}-face)'),
        shape(shade,'#2C96BF' if key=='top' else '#08619A'),
        shape(highlight,'#FFFFFF' if key=='top' else '#B3F0FF'),
    ])

def slanted_panel(x,y,w,h,lean=.18,slope=-.016):
    dx=-h*lean
    return Polygon([(x,y),(x+w,y+w*slope),
                    (x+w+dx,y+h+(w+dx)*slope),(x+dx,y+h+dx*slope)])

# Badge and accent ends share the approved .18 lean and -.016 top-row slope.
tab=slanted_panel(292,141,214,54)
new=word('NEW',0,0,150,33,track=12,lean=.18,sweep=-.016)
nb=new.bounds;tb=tab.bounds
new=affinity.translate(new,xoff=(tb[0]+tb[2]-nb[0]-nb[2])/2,
                      yoff=(tb[1]+tb[3]-nb[1]-nb[3])/2)
bars=[slanted_panel(527,166,119,9),slanted_panel(654,163.968,55,9)]

# A shallow, tapered quadratic arc ends before the R's descending terminal.
# It never crosses that terminal in the one-colour version.
PINK_SWEEP='M115 633 Q585 663 1038 604 Q625 676 105 648 Z'
SWEEP=PINK_SWEEP

# Deliberate layer order: one continuous extrusion, one keyline, one bevel.
art=f'''<g id="overdrive-lockup" transform="translate(44.5 0) rotate(-5 720 440)">
<g id="underline">
<path d="{SWEEP}" transform="translate(-3 7)" fill="#073C68" stroke="#07172B" stroke-width="3" stroke-linejoin="round"/>
<path d="{PINK_SWEEP}" fill="url(#pink-face)"/>
</g>
<g id="dimensional-lettering">
{shape(offset(extrusion,4),'#07172B')}
{shape(extrusion,'url(#depth-face)')}
{shape(offset(all_letters,15),'#071C32')}
{shape(offset(all_letters,10.5),'#F5FBFF')}
{shape(offset(all_letters,5.5),'#087BBC')}
{''.join(bevels)}
</g>
<g id="new-badge">
{shape(offset(extrude(tab,-2,5),3),'#081A30')}
{shape(extrude(tab,-2,5),'#9C1B60')}
{shape(tab,'url(#pink-face)')}
{shape(new,'#FFFFFF')}
</g>
<g id="speed-accents">
{shape(bars[0],'#2CC4F5')}{shape(bars[1],'#F13699')}
</g>
</g>'''

svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="860" viewBox="0 0 1440 860" role="img" aria-labelledby="title desc">
<title id="title">New Super TIC Fighter — Overdrive, polished</title>
<desc id="desc">Custom ascending arcade lettering: white SUPER TIC, blue FIGHTER, a compact pink NEW badge, and a curved pink underline. One consistent bevel and continuous geometric depth retain Overdrive's dimensional character with clearer contours.</desc>
<defs>
<linearGradient id="top-face" x1="0" y1="210" x2="0" y2="355" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset=".55" stop-color="#F3FCFF"/><stop offset="1" stop-color="#C6EEFA"/></linearGradient>
<linearGradient id="fighter-face" x1="0" y1="365" x2="0" y2="615" gradientUnits="userSpaceOnUse"><stop stop-color="#74DFFF"/><stop offset=".35" stop-color="#3CC5F5"/><stop offset=".66" stop-color="#149CD8"/><stop offset="1" stop-color="#086FAE"/></linearGradient>
<linearGradient id="depth-face" x1="0" y1="210" x2="0" y2="650" gradientUnits="userSpaceOnUse"><stop stop-color="#08659B"/><stop offset="1" stop-color="#06416F"/></linearGradient>
<linearGradient id="pink-face" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FF51AE"/><stop offset="1" stop-color="#E82A8F"/></linearGradient>
</defs>{art}</svg>'''
(OUT/'overdrive-polished.svg').write_text(svg)

mono_art=f'''<g transform="translate(44.5 0) rotate(-5 720 440)">{shape(top,'currentColor')}{shape(bottom,'currentColor')}<path d="{d(tab)} {d(new)}" fill="currentColor" fill-rule="evenodd"/><path d="{PINK_SWEEP}" fill="currentColor"/>{shape(bars[0],'currentColor')}{shape(bars[1],'currentColor')}</g>'''
mono=f'''<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="860" viewBox="0 0 1440 860" color="#FFFFFF" role="img" aria-labelledby="title"><title id="title">New Super TIC Fighter — Overdrive, polished one colour</title>{mono_art}</svg>'''
(OUT/'overdrive-polished-mono.svg').write_text(mono)
print('Saved polished vector masters to',OUT)

# Responsive family: every version is derived from the same custom glyphs.
defs=svg[svg.index('<defs>')+6:svg.index('</defs>')]
def document(title,body,box,definitions=''):
    x,y,w,h=box
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w:.2f}" height="{h:.2f}" viewBox="{x:.2f} {y:.2f} {w:.2f} {h:.2f}" role="img" aria-labelledby="title"><title id="title">{title}</title><defs>{definitions}</defs>{body}</svg>'''
def world(g):
    return affinity.translate(affinity.rotate(g,-5,origin=(720,440)),xoff=44.5)
def box_for(g,pad=18):
    x0,y0,x1,y1=g.bounds
    return (x0-pad,y0-pad,x1-x0+2*pad,y1-y0+2*pad)
def save(name,title,body,box,definitions=''):
    (OUT/name).write_text(document(title,body,box,definitions))

# Sweep stays inside these padded bounds; the F tip defines the lower edge.
primary_bounds=world(unary_union([offset(extrusion,4),offset(extrude(tab,-2,5),3),*bars]))
primary_box=box_for(primary_bounds,20)
save('overdrive-primary.svg','New Super TIC Fighter — primary logo',art,primary_box,defs)
flat=art.replace(''.join(bevels),shape(top,'#F5FAFF')+shape(bottom,'#1BABE8')).replace('url(#pink-face)','#F23899').replace('url(#depth-face)','#075388')
save('overdrive-flat.svg','New Super TIC Fighter — flat colour',flat,primary_box,defs)

# Compact: remove fine accent rails, underline and all depth; retain the name.
compact=f'''<g transform="translate(44.5 0) rotate(-5 720 440)">
{shape(offset(all_letters,13),'#071C32')}{shape(offset(all_letters,9),'#F5FAFF')}
{shape(offset(all_letters,4),'#087BBC')}{shape(top,'#F5FAFF')}{shape(bottom,'#20ACEA')}
{shape(offset(tab,3),'#071C32')}{shape(tab,'#F23899')}{shape(new,'#FFFFFF')}</g>'''
compact_box=box_for(world(unary_union([offset(all_letters,13),offset(tab,3)])),16)
save('overdrive-compact.svg','New Super TIC Fighter — compact logo',compact,compact_box)

for name,color in [('overdrive-mono-light.svg','#FFFFFF'),('overdrive-mono-dark.svg','#071C32')]:
    save(name,'New Super TIC Fighter — one colour',mono_art.replace('currentColor',color),primary_box)

# Short header signature. Full name is provided by the surrounding page/alt text.
short_top=word('TIC',0,0,258,100,track=12,lean=.20)
short_bottom=word('FIGHTER',295,0,630,100,track=11,lean=.20)
short_all=unary_union([short_top,short_bottom])
horizontal=shape(offset(short_all,4),'#071C32')+shape(short_top,'#F5FAFF')+shape(short_bottom,'#23B5F1')
save('overdrive-horizontal.svg','New Super TIC Fighter — TIC Fighter header signature',horizontal,box_for(short_all,8))

# Square icon: the extended F is drawn from the selected logo, optically centred.
f=word('F',0,0,340,330,track=0,lean=.21,sweep=-.023)
f=affinity.rotate(f,-5,origin='center')
fx0,fy0,fx1,fy1=f.bounds
f=affinity.scale(f,xfact=322/(fx1-fx0),yfact=354/(fy1-fy0),origin=(fx0,fy0))
fx0,fy0,fx1,fy1=f.bounds
f=affinity.translate(f,xoff=94-fx0,yoff=68-fy0)
# Companion slash repeats the title's lean and ascending baseline.
slash=Polygon([(292,387),(396,376),(376,423),(270,435)])
icon_defs='<linearGradient id="icon-blue" x1="0" y1="68" x2="0" y2="422" gradientUnits="userSpaceOnUse"><stop stop-color="#64D6FF"/><stop offset="1" stop-color="#0786CD"/></linearGradient>'
mark=shape(slash,'#F23899')+shape(offset(f,8),'#F5FAFF')+shape(f,'url(#icon-blue)')
save('overdrive-mark.svg','New Super TIC Fighter — F symbol',mark,(0,0,512,512),icon_defs)
tile='<rect width="512" height="512" rx="104" fill="#101827"/>'
save('overdrive-icon.svg','New Super TIC Fighter — app icon',tile+mark,(0,0,512,512),icon_defs)

# Micro redraw: flat broad strokes, no nested keyline, one two-pixel accent.
micro='''<rect width="16" height="16" rx="3" fill="#101827"/>
<path d="M4 3 H13 L12 6 H8 L7.5 8 H11 L10 10 H7 L6 13.5 L3 14 L4.4 6 H3.5 Z" fill="#55D1FF"/>
<path d="M10 12 H13 L12 14 H9 Z" fill="#F23899"/>'''
save('overdrive-icon-micro.svg','New Super TIC Fighter — small icon',micro,(0,0,16,16))
# Maskable icon has an opaque full bleed and its mark within the central circle.
maskable='<rect width="512" height="512" fill="#101827"/><g transform="translate(76.8 76.8) scale(.7)">'+mark+'</g>'
save('overdrive-icon-maskable.svg','New Super TIC Fighter — maskable app icon',maskable,(0,0,512,512),icon_defs)
save('overdrive-mark-mono.svg','New Super TIC Fighter — one colour F symbol',shape(slash,'#FFFFFF')+shape(f,'#FFFFFF'),(0,0,512,512))
print('Saved responsive wordmarks, icon, flat colour and monochrome assets.')
