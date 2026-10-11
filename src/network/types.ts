import type { InputFrame, MatchConfig, MatchResult, MatchSnapshot, PlayerSeat } from '../shared/types';

export type RoomPhase = 'lobby' | 'playing' | 'paused' | 'finished';
export type Route = 'connecting' | 'direct' | 'relay' | 'disconnected';

export interface RoomPeer {
  peerId: string;
  connected: boolean;
  isHost: boolean;
  route: Route;
  pingMs?: number;
}

export interface RoomState {
  code: string;
  peerId: string;
  hostPeerId: string;
  players: PlayerSeat[];
  config: MatchConfig;
  readiness: Record<string, { ready: boolean; assetsReady: boolean }>;
  phase: RoomPhase;
  seatReadiness?: Record<string, {ready:boolean; assetsReady:boolean}>;
  protocolVersion?: number;
  contentVersion?: string;
  matchId?: string;
  peers: RoomPeer[];
  routes: Record<string, Route>;
  pauseReason?: string;
  resumeAt?: number;
  result?: MatchResult;
}

export interface TransportStatus {
  peerId: string;
  route: Route;
  pingMs?: number;
  connected: boolean;
  reason?: string;
}

export interface RoomCallbacks {
  onEditAck?: (editId:number, accepted:boolean) => void;
  onRoomState?: (state: RoomState) => void;
  onInput?: (peerId: string, frames: InputFrame[]) => void;
  onSnapshot?: (snapshot: MatchSnapshot, sequence: number, acknowledgements: Record<string, number>) => void;
  onStart?: (matchId: string, config: MatchConfig) => void;
  onPause?: (reason: string) => void;
  onResume?: (resumeAt: number) => void;
  onResult?: (result: MatchResult, snapshot?: MatchSnapshot) => void;
  onForfeit?: (seatIds: string[]) => void;
  onError?: (code: string, message: string) => void;
  onStatus?: (status: TransportStatus) => void;
}

export interface RoomClientOptions extends RoomCallbacks {
  baseUrl?: string;
}

export interface RoomCredentials {
  peerId?: string;
  reconnectToken?: string;
  hostToken?: string;
}

export type SignalData =
  | { description: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit };

export type ClientMessage =
  | { type: 'hello'; protocolVersion: number; contentVersion: string; peerId?: string; reconnectToken?: string; hostToken?: string }
  | { type: 'seats'; players: PlayerSeat[]; editId?:number }
  | { type: 'config'; config: MatchConfig; editId?:number }
  | { type: 'ready'; ready: boolean; assetsReady: boolean }
  | { type: 'seat_ready'; seatId:string; ready:boolean; assetsReady:boolean }
  | { type: 'route'; route: Route; pingMs?: number }
  | { type: 'signal'; to: string; data: SignalData }
  | { type: 'input'; matchId: string; sequence: number; frames: InputFrame[] }
  | { type: 'snapshot'; matchId: string; sequence: number; snapshot: MatchSnapshot; acknowledgements: Record<string, number>; targets: string[] }
  | { type: 'start' }
  | { type: 'pause'; reason?: string }
  | { type: 'resume' }
  | { type: 'result'; result: MatchResult; snapshot?: MatchSnapshot }
  | { type: 'rematch' }
  | { type: 'ping'; nonce: number }
  | { type: 'peer_alive'; peerId: string };

export type ServerMessage =
  | { type: 'edit_ack'; editId:number; accepted:boolean }
  | { type: 'welcome'; state: RoomState; peerId: string; reconnectToken: string; hostToken?: string }
  | { type: 'room'; state: RoomState }
  | { type: 'signal'; from: string; data: SignalData }
  | { type: 'input'; from: string; sequence: number; frames: InputFrame[] }
  | { type: 'snapshot'; sequence: number; snapshot: MatchSnapshot; acknowledgements: Record<string, number> }
  | { type: 'start'; matchId: string; config: MatchConfig; controlId: string }
  | { type: 'pause'; matchId: string; reason: string; controlId: string }
  | { type: 'resume'; matchId: string; resumeAt: number; controlId: string }
  | { type: 'result'; matchId: string; result: MatchResult; snapshot?: MatchSnapshot; controlId: string }
  | { type: 'forfeit'; matchId: string; peerId: string; seatIds: string[]; controlId: string }
  | { type: 'pong'; nonce: number; now: number }
  | { type: 'error'; code: string; message: string };
