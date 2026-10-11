import { useEffect, useState } from 'react';
import type { AppSettings, AssetsManifest } from '../shared/types';
import { DEFAULT_SETTINGS, keyName } from './preferences';
import { ui } from './i18n';
import type { UiSound } from '../audio';
export function Settings({ settings, manifest, change, feedback }: { settings: AppSettings; manifest: AssetsManifest | null; change: (settings: AppSettings) => void; feedback?: (cue: UiSound) => void }) {
 const t = ui[settings.language];
 const [tab, setTab] = useState<'sound' | 'display' | 'controls'>('sound');
 const [seat, setSeat] = useState(0);
 const [capture, setCapture] = useState<string | null>(null);
 const [error, setError] = useState('');
 const patch = (value: Partial<AppSettings>) => change({ ...settings, ...value });
 useEffect(() => {
  if (!capture) return;
  const handler = (event: KeyboardEvent) => {
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.code === 'Escape') { setCapture(null); feedback?.('back'); return; }
    const conflict = settings.keyboardBindings.some((bindings, i) => Object.entries(bindings).some(([action, key]) => key === event.code && (i !== seat || action !== capture)));
    if (conflict) { setError(t.bindingConflict); feedback?.('error'); return; }
    const bindings = settings.keyboardBindings.map((b, i) => i === seat ? { ...b, [capture]: event.code } : b);
    patch({ keyboardBindings: bindings }); setCapture(null); setError(''); feedback?.('confirm');
  };
  window.addEventListener('keydown', handler, true);
  return () => window.removeEventListener('keydown', handler, true);
 }, [capture, settings, seat, t]);
 const actions = ['left','right','down','jump','punch','special','guard','combo'] as const;
 return <div className="settings-layout">
  <nav className="settings-tabs" aria-label={t.settings}><button className={tab === 'sound' ? 'selected' : ''} onClick={() => setTab('sound')}>♪ {t.sound}</button><button className={tab === 'display' ? 'selected' : ''} onClick={() => setTab('display')}>◈ {t.display}</button><button className={tab === 'controls' ? 'selected' : ''} onClick={() => setTab('controls')}>✚ {t.controls}</button></nav>
  <section className="settings-panel">
   {tab === 'sound' && <>
    <div className="setting-title"><span>♪</span><h2>{t.sound}</h2></div>
    <label className="volume-field"><span>{t.music}<b>{Math.round(settings.musicVolume * 100)}%</b></span><input type="range" min="0" max="1" step=".01" value={settings.musicVolume} onChange={e => patch({ musicVolume: Number(e.target.value) })} /></label>
    <label className="volume-field"><span>{t.effects}<b>{Math.round(settings.effectsVolume * 100)}%</b></span><input type="range" min="0" max="1" step=".01" value={settings.effectsVolume} onChange={e => patch({ effectsVolume: Number(e.target.value) })} /></label>
    <label className="field-label"><span>{t.playlist}</span><select value={settings.playlist} onChange={e => patch({ playlist: e.target.value as AppSettings['playlist'] })}>{(['remake', 'original'] as const).map(playlist => <option key={playlist} value={playlist}>{t[playlist]}{manifest ? ` · ${manifest.audio[playlist].length} ${t.tracks}` : ''}</option>)}</select></label>
    <p className="setting-note">{t.soundtrackHint}</p>
   </>}
   {tab === 'display' && <>
    <div className="setting-title"><span>◈</span><h2>{t.display}</h2></div>
    <label className="field-label"><span>{t.language}</span><select value={settings.language} onChange={e => patch({ language: e.target.value as AppSettings['language'] })}><option value="es">Español</option><option value="en">English</option></select></label>
    <label className="field-label"><span>{t.camera}</span><select value={settings.camera} onChange={e => patch({ camera: e.target.value as AppSettings['camera'] })}><option value="adaptive">{t.adaptive}</option><option value="fixed">{t.fixed}</option></select></label>
    <label className="toggle-field"><span>{t.motion}</span><input type="checkbox" checked={settings.reducedMotion} onChange={e => patch({ reducedMotion: e.target.checked })} /><span className="toggle-track" /></label>
    <p className="setting-note">{t.cameraHint}</p>
   </>}
   {tab === 'controls' && <>
    <div className="setting-title"><span>✚</span><h2>{t.controls}</h2></div><p className="help-text">{t.controlsHint}</p>
    <div className="keyboard-seat-tabs">{[0,1,2,3].map(i => <button className={seat === i ? 'selected' : ''} key={i} onClick={() => { setSeat(i); setCapture(null); }}>P{i + 1}</button>)}</div>
    <div className="bindings-grid">{actions.map(action => <button className={`binding-button ${capture === action ? 'capturing' : ''}`} key={action} onClick={() => { setCapture(action); setError(''); }}><span>{t[action]}</span><kbd>{capture === action ? '…' : keyName(settings.keyboardBindings[seat]?.[action] ?? '')}</kbd></button>)}</div>
    {(error || capture) && <p className="validation-hint" role="status">{error || t.pressKey}</p>}
    <button className="text-button" onClick={() => { patch({ keyboardBindings: structuredClone(DEFAULT_SETTINGS.keyboardBindings) }); setError(''); setCapture(null); }}>{t.restoreKeyboard}</button>
    <h3 className="controller-setting-heading">{t.gamepadBindings}</h3><div className="gamepad-bindings">{(['jump','punch','special','combo','guard'] as const).map(action => <label className="field-label" key={action}><span>{t[action]}</span><select value={settings.gamepadBindings[action]} onChange={e => {
      const button = Number(e.target.value); const bindings = { ...settings.gamepadBindings };
      const occupied = Object.keys(bindings).find(key => key !== action && bindings[key] === button);
      if (occupied) bindings[occupied] = bindings[action];
      bindings[action] = button; patch({ gamepadBindings: bindings });
    }}>{Array.from({length: 17}, (_, i) => <option value={i} key={i}>{i === 0 ? '0 · A / ✕' : i === 1 ? '1 · B / ○' : i === 2 ? '2 · X / □' : i === 3 ? '3 · Y / △' : `${i}`}</option>)}</select></label>)}</div>
    <label className="volume-field"><span>{t.deadZone}<b>{Math.round(((settings as AppSettings & { gamepadDeadZone?: number }).gamepadDeadZone ?? .22) * 100)}%</b></span><input type="range" min=".1" max=".5" step=".01" value={(settings as AppSettings & { gamepadDeadZone?: number }).gamepadDeadZone ?? .22} onChange={e => change({ ...settings, gamepadDeadZone: Number(e.target.value) } as AppSettings)} /></label>
   </>}
  </section>
 </div>;
}
