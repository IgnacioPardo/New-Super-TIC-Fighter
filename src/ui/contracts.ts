import type { InputFrame, MatchConfig, MatchSnapshot, PlayerSeat } from '../shared/types';

export interface OnlineMember { id: string; name: string; ready: boolean; connected: boolean; seatIds: string[] }
export interface OnlineState {
  status: 'idle' | 'connecting' | 'lobby' | 'playing' | 'reconnecting' | 'error';
  code?: string; peerId?: string; isHost: boolean; config?: MatchConfig;
  members: OnlineMember[]; route?: 'direct' | 'relay' | 'connecting'; ping?: number;
  error?: string; snapshot?: MatchSnapshot; pauseReason?: string;
  pendingEdits?: boolean; seatReadiness?: Record<string, boolean | { ready: boolean; assetsReady: boolean }>; authority?: 'peer' | 'server';
}
/** This bridge lets the room client provide authority without putting networking in menu components. */
export interface OnlineBridge {
  state: OnlineState;
  snapshotRef?: { current: MatchSnapshot | null };
  create(name: string): Promise<void>;
  join(code: string, name: string): Promise<void>;
  leave(): void;
  updateConfig(config: MatchConfig): void;
  updateSeat(seat: PlayerSeat): void;
  claimSeat(seat: PlayerSeat): void;
  ready(ready: boolean): void;
  setSeatReady?(id: string, ready: boolean, assetsReady?: boolean): void;
  start(): void;
  pause(): void;
  resume(): void;
  rematch(): void;
  sendInputs(inputs: InputFrame[]): void;
  forceRelay?(force: boolean): void;
}
