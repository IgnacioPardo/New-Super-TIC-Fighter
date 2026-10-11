import { useEffect, useRef, type RefObject } from 'react';
import type { UiSound } from '../audio';

/** Pointer and native control feedback; controller focus movement is emitted by the menu router. */
export function useUiFeedback(root: RefObject<HTMLElement | null>, play: (cue: UiSound) => void) {
 const callback = useRef(play);
 callback.current = play;
 useEffect(() => {
  const element = root.current;
  if (!element) return;
  let hovered: Element | null = null;
  let tabbedAt = -Infinity;
  const control = (event: Event) => event.target instanceof Element ? event.target.closest<HTMLElement>('button, select, input, summary, a[href]') : null;
  const enabled = (target: HTMLElement | null) => target && !target.matches(':disabled, [aria-disabled="true"]') && !target.closest('[inert]');
  const click = (event: Event) => {
   const target = control(event);
   if (!enabled(target) || !target || target.matches('select, input:not([type="checkbox"]):not([type="radio"])')) return;
   const explicit = target.dataset.uiSound;
   if (explicit === 'silent') return;
   const cue: UiSound = explicit as UiSound || (target.matches('summary') ? target.parentElement?.hasAttribute('open') ? 'close' : 'open' : target.matches('.ready-button') ? target.classList.contains('confirmed') ? 'unready' : 'ready' : target.matches('input, .swatch, .arena-card') ? 'change' : 'confirm');
   callback.current(cue);
  };
  const change = (event: Event) => {
   const target = control(event);
   if (enabled(target) && target?.matches('select, input[type="range"]')) callback.current('change');
  };
  const pointer = (event: PointerEvent) => {
   if (event.pointerType === 'touch' || !navigator.userActivation?.hasBeenActive) return;
   const target = control(event);
   if (target && target !== hovered && enabled(target) && target.matches('button, summary, a[href]')) callback.current('navigate');
   hovered = target;
  };
  const key = (event: KeyboardEvent) => { if (event.key === 'Tab') tabbedAt = performance.now(); };
  const focus = () => { if (performance.now() - tabbedAt < 150) callback.current('navigate'); };
  element.addEventListener('keydown', key, true);
  element.addEventListener('focusin', focus);
  element.addEventListener('click', click, true);
  element.addEventListener('change', change, true);
  element.addEventListener('input', change, true);
  element.addEventListener('pointerover', pointer);
  return () => {
   element.removeEventListener('keydown', key, true);
   element.removeEventListener('focusin', focus);
   element.removeEventListener('click', click, true);
   element.removeEventListener('change', change, true);
   element.removeEventListener('input', change, true);
   element.removeEventListener('pointerover', pointer);
  };
 }, [root]);
}
