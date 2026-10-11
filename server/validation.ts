import type { InputFrame, MatchConfig, PlayerSeat } from '../src/shared/types';
export function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function secret(): string { return Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join(''); }
const disciplines = new Set(['networks','design','code','hardware','ai','robotics','iot','vr','games','printing']);
const arenas = new Set(['classic','lab','pc','embedded','virtual','arcade']);
export function validSeat(value: unknown, kind: 'human'|'bot' = 'human'): value is PlayerSeat {
  if (!record(value) || value.kind !== kind || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value.id)) return false;
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 24 || !disciplines.has(String(value.discipline)) || (value.team !== 0 && value.team !== 1)) return false;
  if (!record(value.appearance) || !['hair','shirt','pants'].every(key => Number.isInteger((value.appearance as Record<string,unknown>)[key]) && Number((value.appearance as Record<string,unknown>)[key]) >= 0 && Number((value.appearance as Record<string,unknown>)[key]) <= 3)) return false;
  return typeof value.device === 'string' && value.device.length <= 32 && (kind !== 'bot' || ['easy','normal','hard','dummy'].includes(String(value.difficulty)));
}
export function maxSeats(config: MatchConfig): number { return (config as MatchConfig & {gameMode?:string}).gameMode === 'royale' ? 8 : 4; }
export function validConfig(value: unknown, publicMatch = false): value is MatchConfig {
  if (!record(value) || !Array.isArray(value.players) || !['ffa','teams'].includes(String(value.mode)) || !arenas.has(String(value.arena))) return false;
  if (value.ruleset !== undefined && !['classic','expanded'].includes(String(value.ruleset))) return false;
  if (value.gameMode !== undefined && !['stock','timed','hill','royale','survival','training'].includes(String(value.gameMode))) return false;
  if (value.bestOf !== undefined && ![1,3,5].includes(Number(value.bestOf))) return false;
  if (value.items !== undefined && typeof value.items !== 'boolean' || value.hazards !== undefined && typeof value.hazards !== 'boolean') return false;
  if(value.ruleset!=='expanded' && value.players.some(player=>record(player)&&!['networks','design','code','hardware'].includes(String(player.discipline))))return false;
  if(publicMatch&&value.mode==='teams'&&[0,1].some(team=>(value.players as unknown[]).filter(player=>record(player)&&player.team===team).length!==2))return false;
  const max = value.gameMode === 'royale' ? 8 : 4;
  return value.players.length <= max && new Set(value.players.map(player => record(player) ? player.id : '')).size === value.players.length &&
    value.players.every(player => validSeat(player, record(player) && player.kind === 'bot' ? 'bot' : 'human') && (!publicMatch || player.kind === 'human')) &&
    Number.isInteger(value.lives) && Number(value.lives)>=1 && Number(value.lives)<=9 && Number.isInteger(value.timeLimit) && Number(value.timeLimit)>=0 && Number(value.timeLimit)<=1800 &&
    typeof value.friendlyFire==='boolean' && value.practice===false && Number.isInteger(value.seed) && Number(value.seed)>=0 && Number(value.seed)<=0xffffffff &&
    (!publicMatch || value.gameMode !== 'training' && value.gameMode !== 'survival' && Number(value.timeLimit)>0 && Number(value.timeLimit)<=300);
}
export function validFrames(value:unknown, owned:Set<string>, maximum = 24): value is InputFrame[] {
  return Array.isArray(value) && value.length>0 && value.length<=maximum && value.every(frame => record(frame) && owned.has(String(frame.seatId)) && Number.isSafeInteger(frame.tick) && Number(frame.tick)>=0 &&
    ['left','right','down','jump','punch','special','guard','combo'].every(key=>typeof frame[key]==='boolean') && (frame.dodge===undefined || typeof frame.dodge==='boolean'));
}
export function json(value: unknown, status=200): Response { return Response.json(value,{status,headers:{'Cache-Control':'no-store'}}); }
