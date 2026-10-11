import { Avatar } from './Avatar';
import type { AppSettings, AssetsManifest, MatchSnapshot } from '../shared/types';
import { disciplineInfo, formatLives, names } from './i18n';
export function formatClock(seconds: number) { const s = Math.max(0, Math.ceil(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
export function HUD({ snapshot, settings, manifest }: { snapshot: MatchSnapshot; settings: AppSettings; manifest: AssetsManifest | null }) {
 return <div className="match-hud" style={{'--seat-count': snapshot.config.players.length} as React.CSSProperties}>{snapshot.config.players.map((seat, index) => {
  const fighter = snapshot.fighters.find(f => f.id === seat.id);
  const damage = Math.round(fighter?.damage ?? 0), lives = fighter?.lives ?? snapshot.config.lives;
  return <article key={seat.id} className={`hud-fighter ${fighter?.eliminated ? 'eliminated' : ''} ${fighter && fighter.stun > 0 ? 'hurt' : ''}`} style={{ '--fighter-color': disciplineInfo[seat.discipline].color } as React.CSSProperties}>
   <Avatar portrait appearance={seat.appearance} manifest={manifest} discipline={seat.discipline} hurt={!!fighter && fighter.stun > 0} eliminated={fighter?.eliminated} />
   <div className="hud-details"><div className="hud-name"><span>P{index + 1}</span><strong>{seat.name}</strong>{snapshot.config.mode === 'teams' && <b className={`team-badge team-${seat.team}`}>{seat.team === 0 ? '◆ A' : '● B'}</b>}</div><span className="hud-discipline">{names[seat.discipline][settings.language]}</span><div className="hud-values"><strong className={damage >= 100 ? 'danger' : damage >= 60 ? 'warning' : ''}>{damage}<small>%</small></strong><div className="stock-display" aria-label={formatLives(lives, settings.language)}>{snapshot.config.practice ? '∞' : lives <= 5 ? Array.from({length: snapshot.config.lives}, (_, i) => <i key={i} className={i < lives ? 'filled' : ''} />) : <><i className="filled" /><b>×{lives}</b></>}<span className="stock-count">{snapshot.config.practice ? '' : `×${lives}`}</span></div></div></div>
  </article>;
 })}</div>;
}
