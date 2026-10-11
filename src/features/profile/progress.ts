export interface LocalProgress {
 version: 1; completedChallenges: string[]; arcadeClears: number; survivalBest: number; matches: number; wins: number;
}
export const emptyProgress = (): LocalProgress => ({ version: 1, completedChallenges: [], arcadeClears: 0, survivalBest: 0, matches: 0, wins: 0 });
export function sanitizeProgress(value: unknown): LocalProgress {
 const p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
 const count = (key: string, max = 100000) => typeof p[key] === 'number' && Number.isFinite(p[key]) ? Math.max(0, Math.min(max, Math.floor(p[key] as number))) : 0;
 return { version: 1, completedChallenges: Array.isArray(p.completedChallenges) ? [...new Set(p.completedChallenges.filter((id): id is string => typeof id === 'string' && /^challenge-(?:[1-9]|1[0-2])$/.test(id)))] : [], arcadeClears: count('arcadeClears'), survivalBest: count('survivalBest', 1000), matches: count('matches'), wins: count('wins') };
}
export function mergeProgress(a: LocalProgress, b: LocalProgress): LocalProgress {
 return { version: 1, completedChallenges: [...new Set([...a.completedChallenges, ...b.completedChallenges])], arcadeClears: Math.max(a.arcadeClears,b.arcadeClears), survivalBest: Math.max(a.survivalBest,b.survivalBest), matches: Math.max(a.matches,b.matches), wins: Math.max(a.wins,b.wins) };
}
export function loadProgress(profileId = 'guest'): LocalProgress {
 try { return sanitizeProgress(JSON.parse(localStorage.getItem(`stf-progress:${profileId}`) ?? '{}')); } catch { return emptyProgress(); }
}
export function saveProgress(progress: LocalProgress, profileId = 'guest'): void {
 localStorage.setItem(`stf-progress:${profileId}`, JSON.stringify(sanitizeProgress(progress)));
 window.dispatchEvent(new Event('stf-progress'));
}
export const COSMETICS = [
 { id: 'original', es: 'Original', en: 'Original', color: '#80cff1', xp: 0 },
 { id: 'copper', es: 'Cobre', en: 'Copper', color: '#eda66c', xp: 200 },
 { id: 'neon', es: 'Neón', en: 'Neon', color: '#96f5ac', xp: 600 },
 { id: 'prism', es: 'Prisma', en: 'Prism', color: '#c5a0ff', xp: 1200 },
] as const;
export function cosmeticXP(p: LocalProgress, verifiedXP = 0): number { return p.completedChallenges.length * 100 + p.arcadeClears * 200 + p.survivalBest * 20 + verifiedXP; }
