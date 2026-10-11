import type { AppSettings, AssetsManifest } from '../shared/types';
import { Avatar } from './Avatar';
import { disciplineInfo, disciplines, names, ui } from './i18n';
import { keyName } from './preferences';
export function Guide({ settings, manifest }: { settings: AppSettings; manifest: AssetsManifest | null }) {
 const t = ui[settings.language], lang = settings.language;
 return <div className="guide-layout">
  <section className="guide-basics" tabIndex={0}><p className="lead-text">{t.guideIntro}</p><div className="guide-rule"><span>↟</span><p>{lang === 'es' ? 'Classic: un salto. Expanded: doble salto, esquiva en tierra, un impulso aéreo y recuperación con Especial en el aire. Los recursos se restauran al aterrizar o reaparecer. Abajo acelera la caída; dirección + Golpe permite ataques aéreos.' : 'Classic: one jump. Expanded: double jump, ground dodge, one air dash and airborne Special recovery. Resources restore on landing or respawn. Down fast-falls; direction + Punch performs aerial attacks.'}</p></div><div className="guide-rule"><span>↗</span><p>{t.stanceGuide}</p></div><div className="guide-rule"><span>◇</span><p>{t.guardGuide}</p></div><div className="guide-rule"><span>↯</span><p>{t.comboGuide}</p></div><div className="guide-rule"><span>◆</span><p>{t.teamsGuide}</p></div></section>
  <section className="guide-disciplines" tabIndex={0}>{disciplines.map((d, index) => <article key={d} className="discipline-guide" style={{ '--fighter-color': disciplineInfo[d].color } as React.CSSProperties}><Avatar appearance={{hair:index%4,shirt:index%4,pants:index%4}} discipline={d} manifest={manifest} /><div><span className="discipline-kicker">{disciplineInfo[d].symbol} TIC {index + 1}</span><h2>{names[d][lang]}</h2><dl><div><dt>{t.special}</dt><dd>{disciplineInfo[d].special[lang]}</dd></div><div><dt>{t.combo}</dt><dd>{disciplineInfo[d].combo[lang]}</dd></div></dl></div></article>)}</section>
  <section className="guide-controls" tabIndex={0}><h2>{t.controls}</h2><div className="keyboard-guide">{settings.keyboardBindings.map((bindings, index) => <div key={index}><b>P{index + 1}</b>{(['left','right','jump','down','punch','special','guard','combo','dodge'] as const).map(action => <span key={action}><kbd>{keyName(bindings[action])}</kbd>{t[action]}</span>)}</div>)}</div><p className="help-text">{t.controllerGuide}</p></section>
 </div>;
}
