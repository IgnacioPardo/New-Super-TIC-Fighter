import { useEffect, useRef, useState } from 'react';
import type { AppSettings, AssetsManifest } from '../shared/types';
import { DEFAULT_SETTINGS, keyName, bindingConflicts } from './preferences';
import { ui } from './i18n';
import type { UiSound } from '../audio';
import type { ControllerStatus } from '../input';
import { ControllerStatusPanel } from './ControllerStatusPanel';
import { Icon } from './Icon';
import type { CSSProperties } from 'react';
import { Choice, MenuDialog, Volume, useMenuCommand } from './MenuControls';

export function Settings({ settings, manifest, change, feedback, controllers }: { settings: AppSettings; manifest: AssetsManifest | null; change: (settings: AppSettings) => void; feedback?: (cue: UiSound) => void; controllers: ControllerStatus }) {
 const t = ui[settings.language], es = settings.language === 'es';
 const [section, setSection] = useState<'sound' | 'display' | 'keyboard' | 'gamepad' | null>(null);
 const [seat, setSeat] = useState(0);
 const [capture, setCapture] = useState<string | null>(null);
 const [error, setError] = useState('');
 const bindingsRef = useRef<HTMLDivElement>(null);
 const patch = (value: Partial<AppSettings>) => change({ ...settings, ...value });
 const cancelCapture = () => { setCapture(null); setError(''); };
 useMenuCommand(bindingsRef, command => { if (!capture) return false; if (command === 'back') cancelCapture(); return true; });
 useEffect(() => {
  if (!capture) return;
  const handler = (event: KeyboardEvent) => {
   event.preventDefault(); event.stopImmediatePropagation();
   if (event.repeat) return;
   if (event.code === 'Escape') { cancelCapture(); feedback?.('back'); return; }
   const conflict = settings.keyboardBindings.some((bindings, i) => Object.entries(bindings).some(([action, key]) => key === event.code && (i !== seat || action !== capture)));
   if (conflict) { setError(t.bindingConflict); feedback?.('error'); return; }
   patch({ keyboardBindings: settings.keyboardBindings.map((bindings, i) => i === seat ? { ...bindings, [capture]: event.code } : bindings) });
   cancelCapture(); feedback?.('confirm');
  };
  window.addEventListener('keydown', handler, true);
  return () => window.removeEventListener('keydown', handler, true);
 }, [capture, settings, seat, t]);
 const sections = [
  { id: 'sound' as const, icon: 'sound' as const, accent: '#f073c9', label: t.sound, detail: `${t.music} ${Math.round(settings.musicVolume * 100)}% · ${t.effects} ${Math.round(settings.effectsVolume * 100)}% · ${t[settings.playlist]}` },
  { id: 'display' as const, icon: 'display' as const, accent: '#57d4f1', label: t.display, detail: `${settings.language === 'es' ? 'Español' : 'English'} · ${settings.camera === 'adaptive' ? t.adaptive : t.fixed}` },
  { id: 'keyboard' as const, icon: 'keyboard' as const, accent: '#a0e769', label: t.keyboard, detail: es ? 'Cuatro teclados · Asignación de teclas' : 'Four keyboards · Key bindings' },
  { id: 'gamepad' as const, icon: 'gamepad' as const, accent: '#f4bd67', label: t.gamepad, detail: controllers.controllers[0]?.label ?? `${t.gamepadBindings} · ${t.deadZone}` },
 ];
 const actions = ['left','right','down','jump','punch','special','guard','combo','dodge'] as const;
 const buttonNames = ['A / ✕','B / ○','X / □','Y / △','LB / L1','RB / R1','LT / L2','RT / R2','View / Share','Start / Options','LS / L3','RS / R3','↑','↓','←','→','Home / PS'];
 return <div className="settings-home" data-menu-linear>
  <p className="config-intro">{t.savedAuto}</p>{bindingConflicts(settings).length > 0 && <p className="inline-error" role="status">{t.bindingMigration} {bindingConflicts(settings).join(" · ")}</p>}
  <nav className="settings-categories" aria-label={t.settings}>{sections.map((item, index) => <button className="settings-category" style={{ '--config-accent': item.accent } as CSSProperties} key={item.id} data-autofocus={index === 0 || undefined} onClick={() => setSection(item.id)}><span className="category-icon" aria-hidden="true"><Icon name={item.icon} /></span><span><strong>{item.label}</strong><small>{item.detail}</small></span><span className="category-end" aria-hidden="true"><small>0{index + 1}</small><b>↗</b></span></button>)}</nav>
  {section && <MenuDialog accent={sections.find(item => item.id === section)!.accent} mark={<Icon name={sections.find(item => item.id === section)!.icon} />} language={settings.language} title={sections.find(item => item.id === section)!.label} subtitle={t.savedAuto} done={t.done} close={() => { cancelCapture(); setSection(null); }}>
   <div className="settings-editor" ref={bindingsRef}>
    {section === 'sound' && <>
     <Volume label={t.music} value={settings.musicVolume} change={musicVolume => patch({ musicVolume })} />
     <Volume label={t.effects} value={settings.effectsVolume} change={effectsVolume => patch({ effectsVolume })} />
     <Choice label={t.playlist} value={settings.playlist} options={(['remake','original'] as const).map(value => ({ value, label: `${t[value]}${manifest ? ` · ${manifest.audio[value].length} ${t.tracks}` : ''}` }))} change={playlist => patch({ playlist })} />
     <p className="config-note">{t.soundtrackHint}</p>
    </>}
    {section === 'display' && <>
     <Choice label={t.language} value={settings.language} options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]} change={language => patch({ language })} />
     <Choice label={t.camera} value={settings.camera} options={[{ value: 'adaptive', label: t.adaptive }, { value: 'fixed', label: t.fixed }]} change={camera => patch({ camera })} />
     <Choice label={t.motion} value={Number(settings.reducedMotion)} options={[{ value: 0, label: t.off }, { value: 1, label: t.on }]} change={value => patch({ reducedMotion: !!value })} />
     <p className="config-note">{t.cameraHint}</p>
    </>}
    {section === 'keyboard' && <>
     <Choice label={t.keyboard} value={seat} options={[0,1,2,3].map(value => ({ value, label: `P${value + 1}` }))} change={value => { setSeat(value); cancelCapture(); }} />
     <div className="binding-list">{actions.map(action => <button className={`config-row binding-button ${capture === action ? 'capturing' : ''}`} key={action} onClick={() => { setCapture(action); setError(''); }}><span>{t[action]}</span><kbd>{capture === action ? '…' : keyName(settings.keyboardBindings[seat]?.[action] ?? '')}</kbd></button>)}</div>
     <p className={`config-note ${error ? 'validation-hint' : ''}`} role="status">{error || (capture ? t.pressKey : t.controlsHint)}</p>
     <button className="text-button restore-bindings" onClick={() => { patch({ keyboardBindings: structuredClone(DEFAULT_SETTINGS.keyboardBindings) }); cancelCapture(); }}>{t.restoreKeyboard}</button>
    </>}
    {section === 'gamepad' && <>
     <ControllerStatusPanel status={controllers} language={settings.language} />
     {(['jump','punch','special','combo','guard','dodge','pause'] as const).map(action => <Choice key={action} label={t[action]} value={settings.gamepadBindings[action]} options={buttonNames.map((label, value) => ({ value, label }))} change={button => {
      const bindings = { ...settings.gamepadBindings };
      const occupied = Object.keys(bindings).find(key => key !== action && bindings[key] === button);
      if (occupied) bindings[occupied] = bindings[action];
      bindings[action] = button; patch({ gamepadBindings: bindings });
     }} />)}
     <Volume label={t.deadZone} value={settings.gamepadDeadZone ?? .22} min={.1} max={.5} step={.01} change={gamepadDeadZone => patch({ gamepadDeadZone })} />
     <p className="config-note">{es ? 'Menús: A / ✕ confirma · B / ○ vuelve. Cambiar un botón intercambia las acciones asignadas.' : 'Menus: A / ✕ confirms · B / ○ goes back. Changing a button swaps assigned actions.'}</p>
    </>}
   </div>
  </MenuDialog>}
 </div>;
}
