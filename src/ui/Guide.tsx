import type { AppSettings, AssetsManifest } from '../shared/types';
import { Avatar } from './Avatar';
import { disciplineInfo, disciplines, names, ui } from './i18n';
import { keyName } from './preferences';
export function Guide({ settings, manifest }: { settings: AppSettings; manifest: AssetsManifest | null }) {
 const t = ui[settings.language], lang = settings.language;
 return <div className="guide-layout">
  <section className="guide-basics"><p className="lead-text">{t.guideIntro}</p><div className="guide-rule"><span>↟</span><p>{t.movementGuide}</p></div><div className="guide-rule"><span>↗</span><p>{t.stanceGuide}</p></div><div className="guide-rule"><span>◇</span><p>{t.guardGuide}</p></div><div className="guide-rule"><span>↯</span><p>{t.comboGuide}</p></div><div className="guide-rule"><span>◆</span><p>{t.teamsGuide}</p></div></section>
  <section className="guide-disciplines">{disciplines.map((d, index) => <article key={d} className="discipline-guide" style={{ '--fighter-color': disciplineInfo[d].color } as React.CSSProperties}><Avatar appearance={{hair:index,shirt:index,pants:index}} discipline={d} manifest={manifest} /><div><span className="discipline-kicker">{disciplineInfo[d].symbol} TIC {index + 1}</span><h2>{names[d][lang]}</h2><dl><div><dt>{t.special}</dt><dd>{disciplineInfo[d].special[lang]}</dd></div><div><dt>{t.combo}</dt><dd>{disciplineInfo[d].combo[lang]}</dd></div></dl></div></article>)}</section>
  <section className="guide-controls"><h2>{t.controls}</h2><div className="keyboard-guide">{settings.keyboardBindings.map((bindings, index) => <div key={index}><b>P{index + 1}</b>{(['left','right','jump','down','punch','special','guard','combo'] as const).map(action => <span key={action}><kbd>{keyName(bindings[action])}</kbd>{t[action]}</span>)}</div>)}</div><p className="help-text">{t.controllerGuide}</p></section>
 </div>;
}
