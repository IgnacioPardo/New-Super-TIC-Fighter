export function Icon({ name }: { name: 'settings' | 'fullscreen' | 'sound' }) {
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">{name === 'fullscreen' ? <path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6" /> : name === 'sound' ? <><path d="M3 9h4l5-4v14l-5-4H3zM16 8c3 2 3 6 0 8M19 5c5 4 5 10 0 14" /></> : <><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3z" /><circle cx="12" cy="12" r="3" /></>}</svg>;
}
