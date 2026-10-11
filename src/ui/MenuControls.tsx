import { useEffect, useId, useRef } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import type { MenuCommand } from '../input';
import type { Language } from '../shared/types';
import { ui } from './i18n';

export const menuTargets = (root: Element) => Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href], [tabindex="0"]'))
 .filter(item => item.tabIndex >= 0 && item.getClientRects().length && !item.closest('[inert]'));

export function useMenuCommand<T extends HTMLElement>(ref: RefObject<T | null>, handle: (command: MenuCommand) => boolean) {
 useEffect(() => {
  const element = ref.current;
  const listener = (event: Event) => {
   if (!event.defaultPrevented && handle((event as CustomEvent<MenuCommand>).detail)) { event.preventDefault(); event.stopPropagation(); }
  };
  element?.addEventListener('menu-command', listener);
  return () => element?.removeEventListener('menu-command', listener);
 }, [ref, handle]);
}

/** A single focus stop per value, with the same left/right behavior for every device. */
export function Choice<T extends string | number>({ label, value, options, change, disabled = false, swatches }: {
 label: string; value: T; options: { value: T; label: string }[]; change: (value: T) => void; disabled?: boolean; swatches?: string[];
}) {
 const ref = useRef<HTMLDivElement>(null);
 const index = Math.max(0, options.findIndex(option => option.value === value));
 const adjust = (direction: number) => { if (!disabled && options.length) change(options[(index + direction + options.length) % options.length].value); };
 useMenuCommand(ref, command => {
  if (command !== 'left' && command !== 'right') return false;
  adjust(command === 'left' ? -1 : 1); return true;
 });
 return <div className={`config-row choice-row ${disabled ? 'is-disabled' : ''}`} ref={ref}>
  <button type="button" className="choice-main" disabled={disabled} aria-label={`${label}: ${options[index]?.label ?? ''}`} onClick={() => adjust(1)}>
   <span>{label}</span><strong>{swatches && <span className="choice-swatches" aria-hidden="true">{swatches.map((color, i) => <i key={color} className={index === i ? 'selected' : ''} style={{ background: color }} />)}</span>}{options[index]?.label}</strong>
  </button>
  <div className="choice-arrows"><button type="button" tabIndex={-1} disabled={disabled} aria-label={`${label} −`} onClick={() => { adjust(-1); ref.current?.querySelector<HTMLButtonElement>('.choice-main')?.focus(); }}>‹</button><button type="button" tabIndex={-1} disabled={disabled} aria-label={`${label} +`} onClick={() => { adjust(1); ref.current?.querySelector<HTMLButtonElement>('.choice-main')?.focus(); }}>›</button></div>
 </div>;
}

export function Volume({ label, value, change, min = 0, max = 1, step = .05 }: { label: string; value: number; change: (value: number) => void; min?: number; max?: number; step?: number }) {
 return <label className="config-row volume-field"><span>{label}<b>{Math.round(value * 100)}%</b></span><input style={{ '--range-fill': `${(value - min) / (max - min) * 100}%` } as CSSProperties} aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event => change(Number(event.target.value))} /></label>;
}

export function MenuTabs<T extends string>({ value, options, change, label }: { value: T; options: { value: T; label: string }[]; change: (value: T) => void; label: string }) {
 const ref = useRef<HTMLDivElement>(null);
 useMenuCommand(ref, command => {
  if (command === 'left' || command === 'right') {
   const index = options.findIndex(option => option.value === value);
   const next = (index + (command === 'left' ? -1 : 1) + options.length) % options.length;
   change(options[next].value); ref.current?.querySelectorAll('button')[next]?.focus(); return true;
  }
  return false;
 });
 return <div className="config-tabs" role="tablist" aria-label={label} ref={ref}>{options.map(option => <button type="button" role="tab" aria-selected={value === option.value} tabIndex={value === option.value ? 0 : -1} key={option.value} onClick={() => change(option.value)}>{option.label}</button>)}</div>;
}

export function MenuDialog({ title, subtitle, close, children, done, language, mark = 'STF', accent = '#57d4f1' }: { title: string; subtitle?: string; close: () => void; children: ReactNode; done: string; language: Language; mark?: ReactNode; accent?: string }) {
 const ref = useRef<HTMLElement>(null);
 const titleId = useId();
 useMenuCommand(ref, command => { if (command === 'back' || command === 'pause') { close(); return true; } return false; });
 useEffect(() => {
  const previous = document.activeElement as HTMLElement | null;
  const dialog = ref.current!;
  const overflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  // Inert the surrounding UI so pointer, Tab and assistive navigation stay in this editor.
  const siblings: HTMLElement[] = [];
  let current: HTMLElement = dialog.parentElement!;
  while (current.parentElement && current !== document.body) {
   for (const sibling of current.parentElement.children) if (sibling !== current && sibling instanceof HTMLElement && !sibling.inert) { sibling.inert = true; siblings.push(sibling); }
   current = current.parentElement;
  }
  (dialog.querySelector<HTMLElement>('[data-dialog-autofocus]') ?? menuTargets(dialog)[1] ?? menuTargets(dialog)[0])?.focus();
  const trap = (event: KeyboardEvent) => {
   if (event.key !== 'Tab') return;
   const targets = menuTargets(dialog), index = targets.indexOf(document.activeElement as HTMLElement);
   if (event.shiftKey && index <= 0) { event.preventDefault(); targets.at(-1)?.focus(); }
   else if (!event.shiftKey && (index === targets.length - 1 || index === -1)) { event.preventDefault(); targets[0]?.focus(); }
  };
  dialog.addEventListener('keydown', trap);
  return () => { document.body.style.overflow = overflow; siblings.forEach(element => { element.inert = false; }); dialog.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus(); else document.querySelector<HTMLElement>('main [data-autofocus]')?.focus(); };
 }, []);
 return <div className="config-shade"><section className="config-dialog" style={{ '--config-accent': accent } as CSSProperties} role="dialog" aria-modal="true" aria-labelledby={titleId} data-menu-dialog data-menu-linear ref={ref}>
  <header className="config-dialog-heading"><span className="config-dialog-mark" aria-hidden="true">{mark}</span><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="small-button" onClick={close}>{done} <span aria-hidden="true">↩</span></button></header>
  {children}
  <p className="config-editor-help"><span className="keyboard-menu-help">{ui[language].configHelp}</span><span className="gamepad-menu-help">{ui[language].gamepadHelp}</span></p>
 </section></div>;
}
