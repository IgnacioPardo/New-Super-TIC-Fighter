import type { InputFrame, MatchConfig, MatchResult, MatchSnapshot, PlayerSeat } from '../shared/types';

export type PublicPool = 'duel' | 'ffa' | 'teams' | 'royale';
export interface PoolPreference { pool: PublicPool; ruleset: 'classic' | 'expanded' }
export interface PublicCapacity {
  enabled: boolean; activeMatches: number; maxMatches: number; connections: number; maxConnections: number;
  usedPlayerMinutes: number; reservedPlayerMinutes: number; dailyPlayerMinutes: number; resetAt: number;
  queuedParties: number; reason?: 'disabled' | 'matches' | 'daily';
}
export interface PublicParty { id: string; leaderId: string; inviteCode: string; peerIds: string[]; players: PlayerSeat[]; queued: boolean; preference: PoolPreference }
export interface PublicActivity { id: string; pool: PublicPool; ruleset: 'classic' | 'expanded'; players: number; startedAt: number; spectatable: boolean }
export interface AvailablePlayer { id:string; name:string; partySize:number; queued:boolean }
export interface LobbyState { peerId: string; party: PublicParty; parties: { id: string; players: number; queued: boolean; preference: PoolPreference }[]; activities: PublicActivity[]; availablePlayers:AvailablePlayer[]; capacity: PublicCapacity; onlinePlayers: number }
export interface MatchTicket { matchId: string; peerId: string; token: string; seatIds: string[]; config: MatchConfig; tournamentId?: string; spectatorToken?: string }
export interface MatchMetrics {
  ticks: number; snapshots: number; wallMs: number; tickCpuMs: number; maxTickCpuMs: number; maxLatenessMs: number;
  catchupTicks: number; droppedTimeMs: number; bytesSent: number; inputPackets: number; checkpointCount: number;
}
export interface PublicMatchState {
  matchId: string; authority: 'server'; phase: 'waiting' | 'running' | 'finished'; config: MatchConfig;
  peers: { peerId: string; connected: boolean; seatIds: string[]; reconnectUntil?: number; forfeited: boolean }[];
  seatReadiness: Record<string, boolean>; snapshot?: MatchSnapshot; result?: MatchResult; metrics: MatchMetrics;
  resultId?: string; interrupted?: boolean; verified: true;
}
export type LobbyClientMessage =
  | { type: 'hello'; protocolVersion: number; contentVersion: string; peerId?: string; token?: string }
  | { type: 'seats'; players: PlayerSeat[] }
  | { type: 'party_join'; code: string }
  | { type: 'party_leave' }
  | { type: 'preference'; preference: PoolPreference }
  | { type: 'queue'; queued: boolean }
  | { type: 'latency_reply'; nonce:string }
  | { type: 'ping'; nonce: number };
export type LobbyServerMessage =
  | { type: 'welcome'; peerId: string; token: string; state: LobbyState }
  | { type: 'lobby'; state: LobbyState }
  | { type: 'match'; ticket: MatchTicket }
  | { type: 'latency_probe'; nonce:string }
  | { type: 'error'; code: string; message: string; refresh?: boolean }
  | { type: 'pong'; nonce: number; now: number };
export type MatchClientMessage =
  | { type: 'hello'; protocolVersion: number; contentVersion: string; peerId?: string; token: string; spectator?: boolean }
  | { type: 'ready'; seatId: string; ready: boolean; assetsReady: boolean }
  | { type: 'input'; sequence: number; frames: InputFrame[] }
  | { type: 'forfeit' }
  | { type: 'ping'; nonce: number };
export type MatchServerMessage =
  | { type: 'welcome'; peerId: string; state: PublicMatchState; spectator: boolean; inputSequence?:number }
  | { type: 'match'; state: PublicMatchState }
  | { type: 'recovery'; generation:number; snapshot:MatchSnapshot }
  | { type: 'snapshot'; sequence: number; snapshot: MatchSnapshot; serverTime: number }
  | { type: 'result'; resultId: string; result: MatchResult; snapshot: MatchSnapshot; verified: true }
  | { type: 'error'; code: string; message: string; refresh?: boolean }
  | { type: 'pong'; nonce: number; now: number };
export interface TournamentEntrant { id: string; name: string; browserIds: string[]; players: PlayerSeat[] }
export interface TournamentGame { id: string; round: number; entrants: [string, string]; phase: 'scheduled' | 'running' | 'finished'; matchId?: string; winner?: string; resultId?: string; wins: [number, number]; bout: number; seatEntrants?: Record<string,string>; koDifferential?: [number,number] }
export interface TournamentStanding { entrantId: string; wins: number; losses: number; koDifferential: number; rank: number }
export interface TournamentState { ownerId?:string; capacityLimit?:number; ruleset?:'classic'|'expanded'; id: string; name: string; kind: 'elimination' | 'round-robin'; visibility: 'public' | 'private'; team: boolean; phase: 'registration' | 'running' | 'finished'; entrants: TournamentEntrant[]; games: TournamentGame[]; standings: TournamentStanding[]; championIds: string[]; createdAt: number; capacity: PublicCapacity | null }
