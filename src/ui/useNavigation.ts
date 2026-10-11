import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { menuTargets } from './MenuControls';

interface NavigationFrame<S> { screen: S; target: number; scroll: number }
/** Each entry remembers the shared cursor and scroll, independent of seat cursors. */
export function useNavigation<S extends string>(initial: () => S, root: RefObject<HTMLElement | null>) {
 const [screen, setScreen] = useState<S>(initial);
 const current = useRef(screen); current.current = screen;
 const stack = useRef<NavigationFrame<S>[]>([]);
 const restore = useRef<NavigationFrame<S> | null>(null);
 const navigate = useCallback((next: S) => {
  if (next === current.current) return;
  const targets = root.current ? menuTargets(root.current) : [];
  stack.current.push({screen:current.current,target:Math.max(0,targets.indexOf(document.activeElement as HTMLElement)),scroll:window.scrollY});
  setScreen(next);
 }, [root]);
 const pop = useCallback((fallback: S) => {
  const previous = stack.current.pop(); restore.current = previous ?? null;
  setScreen(previous?.screen ?? fallback);
 }, []);
 const replace = useCallback((next: S) => { setScreen(next); }, []);
 const reset = useCallback((next: S) => { stack.current = []; restore.current = null; setScreen(next); }, []);
 useLayoutEffect(() => {
  window.dispatchEvent(new Event('menu-transition'));
  const frame = restore.current; restore.current = null;
  if (frame && root.current) {
   root.current.setAttribute('data-navigation-restored','true');
   menuTargets(root.current)[frame.target]?.focus({preventScroll:true}); window.scrollTo(0,frame.scroll);
  } else window.scrollTo(0,0);
 }, [screen,root]);
 return {screen,navigate,pop,replace,reset,hasHistory:() => stack.current.length > 0, contains:(candidate:S) => stack.current.some(frame => frame.screen === candidate)};
}
