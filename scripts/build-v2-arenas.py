"""Original vector scenery for v2. No generated-image API or external art."""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/backgrounds'
def svg(body,w=1366,h=768):
 return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs>
 <linearGradient id="wall" x2="0" y2="1"><stop stop-color="#18283c"/><stop offset="1" stop-color="#070e1d"/></linearGradient>
 <linearGradient id="metal" x2="0" y2="1"><stop stop-color="#4c6570"/><stop offset=".15" stop-color="#1d3845"/><stop offset="1" stop-color="#101a2a"/></linearGradient>
 <radialGradient id="shade"><stop offset=".2" stop-color="#030816" stop-opacity="0"/><stop offset="1" stop-color="#030816" stop-opacity=".72"/></radialGradient>
 <pattern id="peg" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.5" fill="#577881" opacity=".22"/></pattern>
 <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#608696" stroke-opacity=".15"/></pattern>
 </defs><path fill="url(#wall)" d="M0 0H{w}V{h}H0Z"/>{body}<path fill="url(#shade)" d="M0 0H{w}V{h}H0Z"/></svg>'''
def board(x,y,s,label,color='#246c5c'):
 pins=''.join(f'<path d="M{a} 0v-8m0 100v8"/>' for a in range(15,130,12))
 return f'''<g transform="translate({x} {y}) scale({s})"><rect width="145" height="100" rx="5" fill="{color}" stroke="#5a9d90" stroke-width="2"/><g stroke="#758887" stroke-width="5">{pins}</g><rect x="45" y="24" width="53" height="48" fill="#111e2b" stroke="#4a616a" stroke-width="3"/><path d="M12 20h25v10M105 63h22v20M18 72h15V44M108 32h22" fill="none" stroke="#73ac95" stroke-width="2"/><rect x="-5" y="34" width="27" height="30" fill="#7d8b8d"/><circle cx="124" cy="16" r="4" fill="#a2ca93"/><text x="72" y="87" text-anchor="middle" font-family="monospace" font-size="10" fill="#b8d4ca">{label}</text></g>'''
embedded='<path d="M0 88H1366V480H0Z" fill="#263c42"/><path d="M0 88H1366V480H0Z" fill="url(#peg)"/>'
embedded+='<g fill="#5f797b"><rect x="170" y="37" width="330" height="8"/><rect x="875" y="37" width="330" height="8"/></g><path d="M190 48L100 510H550L480 48M895 48L810 510H1275L1185 48" fill="#668d86" opacity=".035"/>'
embedded+='<g stroke="#132532" stroke-width="9" fill="none"><path d="M46 126h135v105h108v-74h169"/><path d="M1315 108h-85v217h-80v-74h-102"/></g><g stroke="#627777" stroke-width="3" fill="none"><path d="M46 126h135v105h108v-74h169"/><path d="M1315 108h-85v217h-80v-74h-102"/></g>'
embedded+=board(470,145,1.2,'ESP32')+board(695,170,.95,'ARDUINO')+board(930,350,.7,'Raspberry Pi')
embedded+='<g fill="url(#metal)" stroke="#415660" stroke-width="2"><rect x="40" y="477" width="500" height="32"/><rect x="780" y="477" width="550" height="32"/><rect x="70" y="510" width="165" height="258"/><rect x="1130" y="510" width="170" height="258"/></g>'
for x in [82,1142]:
 for y in [536,608,680]:embedded+=f'<rect x="{x}" y="{y}" width="142" height="56" fill="#172b37" stroke="#304b57"/><path d="M{x+48} {y+12}h46" stroke="#607b80" stroke-width="3"/>'
embedded+='<rect x="95" y="365" width="170" height="110" rx="7" fill="#162333" stroke="#647784" stroke-width="4"/><rect x="110" y="381" width="125" height="70" fill="#193f42"/><path d="M116 428h22l10-23 12 44 13-41 12 22h43" fill="none" stroke="#669c82" stroke-width="2"/><circle cx="246" cy="397" r="7" fill="#667b80"/><circle cx="246" cy="430" r="7" fill="#667b80"/>'
embedded+='<path d="M310 473l20-78h45l28 78" fill="#203344" stroke="#587381" stroke-width="3"/><path d="M345 392v-38l42-31" fill="none" stroke="#769189" stroke-width="7"/><path d="M385 324l31-36" stroke="#be9968" stroke-width="5"/><path d="M0 768V689l620-121 746 125v75" fill="#080f1b"/>'
OUT.joinpath('embedded.svg').write_text(svg(embedded))
virtual='<path d="M0 70H1366M0 650H1366" stroke="#526785" stroke-width="3"/><rect x="0" y="70" width="1366" height="580" fill="url(#grid)"/>'
for x in [130,1160]:virtual+=f'<path d="M{x} 80v570h70V80" fill="#203048" stroke="#465b76" stroke-width="3"/><path d="M{x+18} 110v500" stroke="#8972aa" stroke-width="5" opacity=".6"/>'
virtual+='<g transform="translate(683 335)"><ellipse rx="230" ry="220" fill="#1a1b37" stroke="#5c4b7b" stroke-width="20"/><ellipse rx="206" ry="195" fill="#101d33" stroke="#9482b3" stroke-opacity=".5" stroke-width="3"/><ellipse rx="184" ry="174" fill="#132536" stroke="#4d828d" stroke-opacity=".7" stroke-width="2"/><path d="M-170 0H170M0-162V162M-123-118L123 118M-123 118L123-118" fill="none" stroke="#65919d" opacity=".16"/><path d="M-65-55L35-85 95-30V55L-6 89-65 30Z" fill="#27445a" fill-opacity=".6" stroke="#7099aa" stroke-width="2"/><path d="M-65-55L-6-4 95-30M-6-4V89" fill="none" stroke="#7099aa" stroke-width="2"/></g>'
virtual+='<g fill="url(#metal)" stroke="#58647b" stroke-width="3"><path d="M42 572h255l40 123H0Z"/><path d="M1069 572h255l42 123h-337Z"/></g><g fill="#17273b" stroke="#586a85" stroke-width="3"><path d="M75 496h171v79H75Z"/><path d="M1114 496h171v79h-171Z"/></g><path d="M94 517h130M94 530h76M1135 517h124M1135 530h90" stroke="#7896ac" stroke-width="3" opacity=".5"/><path d="M180 50h1005M250 736h855" stroke="#445671" stroke-width="8"/>'
OUT.joinpath('virtual.svg').write_text(svg(virtual))
arcade='<path d="M0 110H2400V720H0Z" fill="#172039"/><path d="M0 120H2400M0 140H2400" stroke="#785078" stroke-width="4"/><path d="M0 720H2400V1000H0Z" fill="#0b1223"/>'
for i in range(10):
 x=30+i*244;c=['#8a687e','#537d91','#7f8167'][i%3]
 arcade+=f'<g transform="translate({x} 305)"><path d="M0 0h173l15 35-13 167 27 67-15 146H-8L-21 269 2 202-12 35Z" fill="#111c31" stroke="{c}" stroke-width="4"/><path d="M9 13h151v44H9Z" fill="{c}" opacity=".6"/><path d="M15 72h140l-8 119H22Z" fill="#263b50" stroke="#4f6579" stroke-width="5"/><path d="M30 91h109M39 109h80M58 128h43" stroke="{c}" stroke-width="7"/><path d="M10 205h145l24 52H-8Z" fill="#294055"/><circle cx="32" cy="239" r="10" fill="#708895"/><circle cx="109" cy="229" r="6" fill="{c}"/><circle cx="131" cy="244" r="6" fill="{c}"/><rect x="55" y="307" width="62" height="54" fill="#080e1b" stroke="#4b5d74"/><path d="M70 325h32" stroke="#52677d" stroke-width="3"/></g>'
for x in range(-1000,3500,180):arcade+=f'<path d="M1200 715L{x} 1000" stroke="#537f89" opacity=".2"/>'
for y in [770,845,947]:arcade+=f'<path d="M0 {y}H2400" stroke="#6e577d" stroke-width="2" opacity=".24"/>'
arcade+='<path d="M860 188h680v73H860Z" fill="#263047" stroke="#71617e" stroke-width="4"/><text x="1200" y="238" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="43" letter-spacing="12" fill="#8e9da9">TIC ARCADE</text>'
OUT.joinpath('arcade.svg').write_text(svg(arcade,2400,1000))
manifest=ROOT/'public/assets/manifest.json'
data=json.loads(manifest.read_text())
for arena in ['embedded','virtual','arcade']:data['backgrounds'][arena]=f'/assets/backgrounds/{arena}.svg'
manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
