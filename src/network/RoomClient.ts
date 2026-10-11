import { wireSnapshot } from './snapshot';
import { CONTENT_VERSION, PROTOCOL_VERSION } from '../shared/types';
import type { InputFrame, MatchConfig, MatchResult, MatchSnapshot, PlayerSeat } from '../shared/types';
import type { ClientMessage, RoomClientOptions, RoomCredentials, RoomState, Route, ServerMessage, SignalData, TransportStatus } from './types';

interface PeerLink {
  peerId: string;
  pc: RTCPeerConnection;
  control?: RTCDataChannel;
  gameplay?: RTCDataChannel;
  route: Route;
  fallbackTimer?: ReturnType<typeof setTimeout>;
  retryTimer?: ReturnType<typeof setTimeout>;
  candidates: RTCIceCandidateInit[];
  pingMs?: number;
}

interface DirectPacket {
  type: 'input' | 'snapshot' | 'ping' | 'pong' | 'start' | 'pause' | 'resume' | 'result' | 'forfeit';
  from?: string;
  sequence?: number;
  frames?: InputFrame[];
  snapshot?: MatchSnapshot;
  acknowledgements?: Record<string, number>;
  nonce?: number;
  matchId?: string;
  controlId?: string;
  config?: MatchConfig;
  reason?: string;
  resumeAt?: number;
  result?: MatchResult;
  peerId?: string;
  seatIds?: string[];
}

const MAX_GAMEPLAY_BUFFER = 64 * 1024;
const RTC_TIMEOUT_MS = 5_000;
const RECONNECT_WINDOW_MS = 15_000;

function websocketUrl(baseUrl: string, code: string): string {
  const url = new URL(`/api/rooms/${code}/ws`, baseUrl || location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

function apiUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl || location.href).href;
}

function credentialKey(code: string): string { return `stf-room-${code}`; }
function sequenceKey(code: string): string { return `stf-room-sequence-${code}`; }

function storedSequence(code: string): number {
  try {
    const value = Number(sessionStorage.getItem(sequenceKey(code)));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}

function storedCredentials(code: string): RoomCredentials | undefined {
  try {
    const value = sessionStorage.getItem(credentialKey(code));
    return value ? JSON.parse(value) as RoomCredentials : undefined;
  } catch { return undefined; }
}

function rememberCredentials(code: string, value: RoomCredentials): void {
  try { sessionStorage.setItem(credentialKey(code), JSON.stringify(value)); } catch { /* private browsing may disable storage */ }
}

function validDirectInput(frames: InputFrame[], state: RoomState, from: string): boolean {
  if (!Array.isArray(frames) || !frames.length || frames.length > 12) return false;
  const owned = new Set(state.players.filter(player => player.kind === 'human' && player.peerId === from).map(player => player.id));
  return frames.every(frame => owned.has(frame.seatId) && Number.isInteger(frame.tick) && frame.tick >= 0 &&
    ['left', 'right', 'down', 'jump', 'punch', 'special', 'guard', 'combo'].every(key => typeof frame[key as keyof InputFrame] === 'boolean') && (frame.dodge===undefined || typeof frame.dodge==='boolean'));
}

/** Browser-side room connection. The caller owns simulation timing and local prediction. */
export class RoomClient {
  private readonly options: RoomClientOptions;
  private readonly baseUrl: string;
  private socket?: WebSocket;
  private room?: RoomState;
  private code?: string;
  private credentials?: RoomCredentials;
  private retryStoredJoin = false;
  private links = new Map<string, PeerLink>();
  private closed = false;
  private forcedRelay = false;
  private reconnectStarted = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private guestFallbackTimer?: ReturnType<typeof setTimeout>;
  private guestFallbackExpired = false;
  private pingTimer?: ReturnType<typeof setInterval>;
  private sequence = 0;
  private lastInputSequences = new Map<string, number>();
  private lastSnapshots = new Map<string, number>();
  private finalSnapshot?: MatchSnapshot;
  private pendingWelcome?: { resolve: (state: RoomState) => void; reject: (error: Error) => void };
  private lastControl = new Set<string>();

  constructor(options: RoomClientOptions = {}) {
    this.options = options;
    this.baseUrl = options.baseUrl ?? '';
  }

  get state(): RoomState | undefined { return this.room; }
  get peerId(): string | undefined { return this.room?.peerId; }
  get isHost(): boolean { return !!this.room && this.room.peerId === this.room.hostPeerId; }

  async create(): Promise<RoomState> {
    this.close();
    this.closed = false;
    const response = await fetch(apiUrl(this.baseUrl, '/api/rooms'), { method: 'POST' });
    if (!response.ok) throw new Error(`Room creation failed (${response.status}).`);
    const created = await response.json() as { code: string; hostToken: string };
    if (!/^[A-Z2-9]{10}$/.test(created.code) || typeof created.hostToken !== 'string') throw new Error('Invalid room creation response.');
    this.credentials = { hostToken: created.hostToken };
    this.retryStoredJoin = false;
    rememberCredentials(created.code, this.credentials);
    return this.connect(created.code);
  }

  async join(code: string, credentials?: RoomCredentials): Promise<RoomState> {
    this.close();
    this.closed = false;
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z2-9]{10}$/.test(normalized)) throw new Error('Room codes have ten letters or digits.');
    const stored = credentials ? undefined : storedCredentials(normalized);
    this.retryStoredJoin = !!stored;
    this.credentials = credentials ?? stored ?? {};
    return this.connect(normalized);
  }

  setSeats(players: PlayerSeat[], editId?:number): void { this.send({ type: 'seats', players, editId }); }
  setConfig(config: MatchConfig, editId?:number): void { this.send({ type: 'config', config, editId }); }
  setReady(ready: boolean, assetsReady = ready): void { this.send({ type: 'ready', ready, assetsReady }); }
  setSeatReady(seatId:string, ready:boolean, assetsReady=ready):void { this.send({type:'seat_ready',seatId,ready,assetsReady}); }
  start(): void { this.send({ type: 'start' }); }
  pause(reason?: string): void {
    if (this.send({ type: 'pause', reason })) return;
    if (!this.room?.matchId) return;
    const packet: DirectPacket = { type: 'pause', matchId: this.room.matchId, reason: reason ?? 'Paused by a player', controlId: crypto.randomUUID() };
    if (this.isHost) this.acceptControl(packet);
    else this.sendDirectToHost(packet);
  }
  resume(): void {
    if (this.send({ type: 'resume' }) || !this.isHost || !this.room?.matchId) return;
    this.acceptControl({ type: 'resume', matchId: this.room.matchId, resumeAt: Date.now() + 3000, controlId: crypto.randomUUID() });
  }
  rematch(): void { this.send({ type: 'rematch' }); }
  reportResult(result: MatchResult, snapshot?: MatchSnapshot): void {
    if (snapshot && snapshot.matchId === this.room?.matchId && snapshot.phase === 'finished') this.finalSnapshot = snapshot;
    if (this.send({ type: 'result', result, snapshot }) || !this.isHost || !this.room?.matchId) return;
    this.acceptControl({ type: 'result', matchId: this.room.matchId, result, snapshot, controlId: crypto.randomUUID() });
  }

  sendInputs(frames: InputFrame[]): void {
    if (!this.room || this.isHost || this.room.phase !== 'playing' || !this.room.matchId || !frames.length) return;
    const owned = new Set(this.room.players.filter(player => player.kind === 'human' && player.peerId === this.room!.peerId).map(player => player.id));
    const valid = frames.filter(frame => owned.has(frame.seatId)).slice(0, 12);
    if (!valid.length) return;
    const sequence = this.nextSequence();
    const host = this.room.hostPeerId;
    const link = this.links.get(host);
    if (link?.route === 'direct' && this.room.routes[host] === 'direct' && this.sendGameplay(link, { type: 'input', matchId: this.room.matchId, sequence, frames: valid })) return;
    this.send({ type: 'input', matchId: this.room.matchId, sequence, frames: valid });
  }

  sendSnapshot(snapshot: MatchSnapshot): void {
    snapshot=wireSnapshot(snapshot);
    if (!this.room || !this.isHost || snapshot.matchId !== this.room.matchId) return;
    const sequence = this.nextSequence();
    const targets: string[] = [];
    const acknowledgements = Object.fromEntries(this.lastInputSequences);
    for (const peer of this.room.peers) {
      if (peer.peerId === this.room.peerId) continue;
      const link = this.links.get(peer.peerId);
      if (link?.route === 'direct' && peer.route === 'direct' && this.sendGameplay(link, { type: 'snapshot', matchId: snapshot.matchId, sequence, snapshot, acknowledgements })) continue;
      if (peer.connected) targets.push(peer.peerId);
    }
    if (targets.length) this.send({ type: 'snapshot', matchId: snapshot.matchId, sequence, snapshot, acknowledgements, targets });
  }

  setForcedRelay(forced: boolean): void {
    if (this.forcedRelay === forced) return;
    this.forcedRelay = forced;
    if (forced) {
      if (this.guestFallbackTimer) clearTimeout(this.guestFallbackTimer);
      this.guestFallbackTimer = undefined;
      for (const peerId of [...this.links.keys()]) this.disposeLink(peerId);
      this.reportRoute('relay');
      for (const peer of this.room?.peers ?? []) if (peer.peerId !== this.room?.peerId) this.status(peer.peerId, 'relay', true);
    } else {
      this.guestFallbackExpired = false;
      this.reportRoute('connecting');
      this.syncPeers();
    }
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.guestFallbackTimer) clearTimeout(this.guestFallbackTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = undefined;
    this.guestFallbackTimer = undefined;
    this.guestFallbackExpired = false;
    this.pingTimer = undefined;
    this.pendingWelcome?.reject(new Error('Room connection closed.'));
    this.pendingWelcome = undefined;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) { socket.onclose = null; socket.close(); }
    for (const peerId of [...this.links.keys()]) this.disposeLink(peerId);
    this.room = undefined;
    this.code = undefined;
    this.lastInputSequences.clear();
    this.lastSnapshots.clear();
    this.finalSnapshot = undefined;
    this.lastControl.clear();
  }

  private connect(code: string): Promise<RoomState> {
    this.code = code;
    this.sequence = Math.max(this.sequence, storedSequence(code));
    return new Promise((resolve, reject) => {
      this.pendingWelcome = { resolve, reject };
      this.openSocket(code);
    });
  }

  private openSocket(code: string): void {
    if (this.closed) return;
    let ws: WebSocket;
    try { ws = new WebSocket(websocketUrl(this.baseUrl, code)); }
    catch (error) { this.connectionFailed(error instanceof Error ? error.message : 'Could not open room connection.'); return; }
    this.socket = ws;
    ws.onopen = () => {
      const credentials = this.credentials ?? {};
      this.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, contentVersion: CONTENT_VERSION, ...credentials });
      if (!this.pingTimer) this.pingTimer = setInterval(() => this.ping(), 3000);
    };
    ws.onmessage = event => this.receive(event.data);
    ws.onerror = () => { /* onclose gives the actionable connection state */ };
    ws.onclose = () => {
      if (this.socket !== ws || this.closed) return;
      this.socket = undefined;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = undefined;
      if (!this.room) { this.connectionFailed('Room connection closed before joining.'); return; }
      for (const peer of this.room.peers) {
        if (peer.peerId === this.room.peerId) continue;
        const link = this.links.get(peer.peerId);
        if (link?.route !== 'direct') {
          this.status(peer.peerId, 'disconnected', false, 'Relay connection interrupted');
          this.options.onPause?.('Relay connection interrupted');
        }
      }
      if (!this.reconnectStarted) this.reconnectStarted = Date.now();
      this.reconnect(code);
    };
  }

  private nextSequence(): number {
    const sequence = ++this.sequence;
    if (this.code) {
      try { sessionStorage.setItem(sequenceKey(this.code), String(sequence)); } catch { /* storage may be disabled */ }
    }
    return sequence;
  }

  private reconnect(code: string): void {
    if (this.closed) return;
    const elapsed = Date.now() - this.reconnectStarted;
    if (elapsed >= RECONNECT_WINDOW_MS) { this.connectionFailed('The 15-second reconnect window expired.'); return; }
    const delay = Math.min(2000, Math.max(300, 300 * 2 ** Math.floor(elapsed / 2500)));
    this.reconnectTimer = setTimeout(() => this.openSocket(code), delay);
  }

  private receive(data: unknown): void {
    if (typeof data !== 'string') return;
    let message: ServerMessage;
    try { message = JSON.parse(data) as ServerMessage; } catch { return; }
    switch (message.type) {
      case 'welcome': {
        const previous = this.room;
        this.room = message.state;
        this.credentials = { peerId: message.peerId, reconnectToken: message.reconnectToken, ...(message.hostToken ? { hostToken: message.hostToken } : {}) };
        rememberCredentials(message.state.code, this.credentials);
        this.reconnectStarted = 0;
        this.pendingWelcome?.resolve(message.state);
        this.pendingWelcome = undefined;
        this.options.onRoomState?.(message.state);
        this.syncPeers();
        if (this.forcedRelay && message.state.routes[message.peerId] !== 'relay') this.reportRoute('relay');
        if (previous?.matchId && previous.matchId === message.state.matchId && this.isHost) {
          if (previous.phase === 'paused' && message.state.phase === 'playing') this.send({ type: 'pause', reason: previous.pauseReason });
          if (previous.phase === 'playing' && previous.resumeAt && message.state.phase === 'paused') this.send({ type: 'resume' });
          if (previous.phase === 'finished' && previous.result && message.state.phase !== 'finished') this.send({ type: 'result', result: previous.result, snapshot: this.finalSnapshot });
        }
        break;
      }
      case 'edit_ack': this.options.onEditAck?.(message.editId,message.accepted); break;
      case 'room':
        this.room = message.state;
        this.options.onRoomState?.(message.state);
        this.syncPeers();
        break;
      case 'signal': void this.signal(message.from, message.data); break;
      case 'input': this.acceptInput(message.from, message.sequence, message.frames); break;
      case 'snapshot': this.acceptSnapshot(message.sequence, message.snapshot, message.acknowledgements); break;
      case 'start': this.acceptControl(message); break;
      case 'pause': this.acceptControl(message); break;
      case 'resume': this.acceptControl(message); break;
      case 'result': this.acceptControl(message); break;
      case 'forfeit': this.acceptControl(message); break;
      case 'pong': {
        const pingMs = Math.max(0, Math.round(performance.now() - message.nonce));
        if (this.room && !this.isHost) {
          const direct = this.links.get(this.room.hostPeerId);
          this.reportRoute(direct?.route === 'direct' ? 'direct' : 'relay', direct?.route === 'direct' ? direct.pingMs : pingMs);
        }
        break;
      }
      case 'error':
        if (message.code === 'reconnect_expired' && this.retryStoredJoin && this.code && !this.room) {
          this.retryStoredJoin = false;
          this.credentials = {};
          try { sessionStorage.removeItem(credentialKey(this.code)); } catch { /* storage may be disabled */ }
          const previous = this.socket;
          this.socket = undefined;
          if (previous) { previous.onclose = null; previous.close(); }
          this.openSocket(this.code);
          break;
        }
        this.options.onError?.(message.code, message.message);
        if (this.pendingWelcome) { this.pendingWelcome.reject(new Error(message.message)); this.pendingWelcome = undefined; }
        break;
    }
  }

  private acceptControl(message: Extract<ServerMessage, { type: 'start' | 'pause' | 'resume' | 'result' | 'forfeit' }> | DirectPacket): void {
    if (!this.room) return;
    if (message.type !== 'start' && message.matchId !== this.room.matchId) return;
    const key = message.controlId ?? (message.type === 'start' ? `start:${message.matchId}` : message.type === 'resume' ? `resume:${message.resumeAt}` : message.type === 'result' ? `result:${message.matchId}:${JSON.stringify(message.result)}` : message.type === 'forfeit' ? `forfeit:${message.peerId}` : `pause:${message.reason}:${message.matchId}`);
    if (this.lastControl.has(key)) return;
    this.lastControl.add(key);
    if (this.lastControl.size > 32) this.lastControl.delete(this.lastControl.values().next().value!);
    if (message.type === 'start' && message.matchId && message.config) { this.finalSnapshot = undefined; this.room.matchId = message.matchId; this.room.phase = 'playing'; this.options.onStart?.(message.matchId, message.config); }
    if (message.type === 'pause') { this.room.phase = 'paused'; this.room.pauseReason = message.reason ?? 'Paused'; this.options.onPause?.(this.room.pauseReason); }
    if (message.type === 'resume' && message.resumeAt) { this.room.phase = 'playing'; this.room.resumeAt = message.resumeAt; this.room.pauseReason = undefined; this.options.onResume?.(message.resumeAt); }
    if (message.type === 'result' && message.result) {
      this.room.phase = 'finished'; this.room.result = message.result;
      const finalSnapshot = message.snapshot;
      const snapshot = finalSnapshot && finalSnapshot.matchId === this.room.matchId && finalSnapshot.phase === 'finished' ? finalSnapshot : undefined;
      if (snapshot) this.finalSnapshot = snapshot;
      this.options.onResult?.(message.result, snapshot);
    }
    if (message.type === 'forfeit' && message.seatIds) this.options.onForfeit?.(message.seatIds);
    this.options.onRoomState?.(this.room);
    if (this.isHost) this.broadcastDirectControl(message);
  }

  private acceptInput(from: string, sequence: number, frames: InputFrame[]): void {
    if (!this.room || !this.isHost || this.room.phase !== 'playing' || !Number.isSafeInteger(sequence) || sequence < 0 || !validDirectInput(frames, this.room, from)) return;
    if (sequence <= (this.lastInputSequences.get(from) ?? -1)) return;
    this.lastInputSequences.set(from, sequence);
    this.options.onInput?.(from, frames);
  }

  private acceptSnapshot(sequence: number, snapshot: MatchSnapshot, acknowledgements: Record<string, number> = {}): void {
    if (!this.room || this.isHost || !Number.isSafeInteger(sequence) || sequence < 0 || snapshot?.matchId !== this.room.matchId) return;
    // Unreliable direct snapshots can arrive after a reliable pause/result
    // control. Never let an older phase reopen a finished or paused round.
    if (this.room.phase === 'lobby' || this.room.phase === 'finished' && snapshot.phase !== 'finished' ||
        this.room.phase === 'paused' && (snapshot.phase === 'playing' || snapshot.phase === 'countdown') ||
        this.room.phase === 'playing' && this.room.resumeAt && snapshot.phase === 'paused') return;
    if (sequence <= (this.lastSnapshots.get(snapshot.matchId) ?? -1)) return;
    this.lastSnapshots.set(snapshot.matchId, sequence);
    this.options.onSnapshot?.(snapshot, sequence, acknowledgements);
  }

  private syncPeers(): void {
    const room = this.room;
    if (!room) return;
    for (const peer of room.peers) {
      if (peer.peerId === room.peerId) continue;
      if (!peer.connected && this.links.get(peer.peerId)?.route !== 'direct') {
        this.status(peer.peerId, 'disconnected', false, 'Peer disconnected');
        continue;
      }
      if (this.forcedRelay) {
        this.status(peer.peerId, 'relay', true);
        if (room.routes[room.peerId] !== 'relay') this.reportRoute('relay');
        continue;
      }
      if (this.isHost && !this.links.has(peer.peerId)) void this.makeOffer(peer.peerId);
      if (!this.isHost && peer.peerId === room.hostPeerId && !this.links.has(peer.peerId)) {
        this.status(peer.peerId, this.guestFallbackExpired ? 'relay' : 'connecting', true);
        if (typeof RTCPeerConnection === 'undefined') { this.guestFallbackExpired = true; this.reportRoute('relay'); }
        else if (!this.guestFallbackExpired && !this.guestFallbackTimer) this.guestFallbackTimer = setTimeout(() => {
          this.guestFallbackTimer = undefined;
          if (!this.links.get(peer.peerId) || this.links.get(peer.peerId)?.route !== 'direct') {
            this.guestFallbackExpired = true;
            this.reportRoute('relay');
            this.status(peer.peerId, 'relay', true, 'Direct connection timed out');
          }
        }, RTC_TIMEOUT_MS);
      }
    }
    for (const peerId of [...this.links.keys()]) if (!room.peers.some(peer => peer.peerId === peerId)) this.disposeLink(peerId);
  }

  private newLink(peerId: string): PeerLink {
    this.disposeLink(peerId);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] });
    const link: PeerLink = { peerId, pc, route: 'connecting', candidates: [] };
    this.links.set(peerId, link);
    pc.onicecandidate = event => { if (event.candidate) this.send({ type: 'signal', to: peerId, data: { candidate: event.candidate.toJSON() } }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') this.fallback(peerId, 'Direct connection lost');
    };
    pc.ondatachannel = event => this.attachChannel(peerId, event.channel);
    link.fallbackTimer = setTimeout(() => this.fallback(peerId, 'Direct connection timed out'), RTC_TIMEOUT_MS);
    this.status(peerId, 'connecting', true);
    return link;
  }

  private async makeOffer(peerId: string): Promise<void> {
    if (this.forcedRelay || !this.room || typeof RTCPeerConnection === 'undefined') { this.status(peerId, 'relay', true); this.reportRoute('relay'); return; }
    let link: PeerLink;
    try { link = this.newLink(peerId); } catch { this.status(peerId, 'relay', true, 'Direct connection unavailable'); this.reportRoute('relay'); return; }
    this.attachChannel(peerId, link.pc.createDataChannel('control', { ordered: true }));
    this.attachChannel(peerId, link.pc.createDataChannel('gameplay', { ordered: false, maxRetransmits: 0 }));
    try {
      await link.pc.setLocalDescription(await link.pc.createOffer());
      this.send({ type: 'signal', to: peerId, data: { description: link.pc.localDescription!.toJSON() } });
    } catch { this.fallback(peerId, 'Direct connection failed'); }
  }

  private async signal(from: string, data: SignalData): Promise<void> {
    if (this.forcedRelay || !this.room || (from !== this.room.hostPeerId && !this.isHost) || typeof RTCPeerConnection === 'undefined') return;
    let link = this.links.get(from);
    if ('description' in data) {
      if (data.description.type === 'offer' && !this.isHost) {
        if (this.guestFallbackTimer) clearTimeout(this.guestFallbackTimer);
        this.guestFallbackTimer = undefined;
        this.guestFallbackExpired = false;
        try { link = this.newLink(from); } catch { this.reportRoute('relay'); return; }
      }
      if (!link) return;
      try {
        await link.pc.setRemoteDescription(data.description);
        for (const candidate of link.candidates.splice(0)) await link.pc.addIceCandidate(candidate);
        if (data.description.type === 'offer') {
          await link.pc.setLocalDescription(await link.pc.createAnswer());
          this.send({ type: 'signal', to: from, data: { description: link.pc.localDescription!.toJSON() } });
        }
      } catch { this.fallback(from, 'Direct negotiation failed'); }
    } else if ('candidate' in data) {
      if (!link) return;
      if (!link.pc.remoteDescription) link.candidates.push(data.candidate);
      else try { await link.pc.addIceCandidate(data.candidate); } catch { /* stale candidate */ }
    }
  }

  private attachChannel(peerId: string, channel: RTCDataChannel): void {
    const link = this.links.get(peerId);
    if (!link) { channel.close(); return; }
    if (channel.label === 'control') link.control = channel;
    else if (channel.label === 'gameplay') link.gameplay = channel;
    else { channel.close(); return; }
    channel.onopen = () => this.maybeDirect(peerId);
    channel.onclose = () => this.fallback(peerId, 'Direct channel closed');
    channel.onerror = () => this.fallback(peerId, 'Direct channel failed');
    channel.onmessage = event => this.receiveDirect(peerId, channel.label, event.data);
  }

  private maybeDirect(peerId: string): void {
    const link = this.links.get(peerId);
    if (!link || this.forcedRelay || link.control?.readyState !== 'open' || link.gameplay?.readyState !== 'open') return;
    if (link.fallbackTimer) clearTimeout(link.fallbackTimer);
    if (this.guestFallbackTimer) clearTimeout(this.guestFallbackTimer);
    this.guestFallbackTimer = undefined;
    this.guestFallbackExpired = false;
    link.fallbackTimer = undefined;
    link.route = 'direct';
    this.status(peerId, 'direct', true);
    if (!this.isHost) this.reportRoute('direct');
    else this.reportHostRoute();
    this.sendDirectControl(peerId, { type: 'ping', nonce: performance.now() });
  }

  private fallback(peerId: string, reason: string): void {
    const link = this.links.get(peerId);
    if (!link || link.route === 'relay') return;
    link.route = 'relay';
    if (link.fallbackTimer) clearTimeout(link.fallbackTimer);
    this.status(peerId, 'relay', true, reason);
    if (!this.isHost) this.reportRoute('relay');
    else this.reportHostRoute();
    if (!this.forcedRelay && this.isHost && this.socket?.readyState === WebSocket.OPEN) {
      link.retryTimer = setTimeout(() => { this.disposeLink(peerId); void this.makeOffer(peerId); }, 5000);
    }
  }

  private receiveDirect(peerId: string, channel: string, data: unknown): void {
    if (typeof data !== 'string' || data.length > MAX_GAMEPLAY_BUFFER) return;
    let packet: DirectPacket;
    try { packet = JSON.parse(data) as DirectPacket; } catch { return; }
    if (packet.type === 'ping' && channel === 'control' && typeof packet.nonce === 'number') { this.sendDirectControl(peerId, { type: 'pong', nonce: packet.nonce }); return; }
    if (packet.type === 'pong' && channel === 'control' && typeof packet.nonce === 'number') {
      const link = this.links.get(peerId);
      if (link) {
        link.pingMs = Math.max(0, Math.round(performance.now() - packet.nonce));
        this.status(peerId, link.route, true, undefined, link.pingMs);
        if (!this.isHost) this.reportRoute(link.route, link.pingMs);
      }
      return;
    }
    if (packet.type === 'input' && channel === 'gameplay' && this.isHost && packet.matchId === this.room?.matchId && packet.sequence !== undefined && packet.frames) this.acceptInput(peerId, packet.sequence, packet.frames);
    if (packet.type === 'snapshot' && channel === 'gameplay' && !this.isHost && peerId === this.room?.hostPeerId && packet.matchId === this.room?.matchId && packet.sequence !== undefined && packet.snapshot) this.acceptSnapshot(packet.sequence, packet.snapshot, packet.acknowledgements);
    if (channel === 'control' && ['start', 'pause', 'resume', 'result', 'forfeit'].includes(packet.type) && peerId === this.room?.hostPeerId) this.acceptControl(packet);
    if (channel === 'control' && packet.type === 'pause' && this.isHost && packet.matchId === this.room?.matchId) {
      if (!this.send({ type: 'pause', reason: packet.reason })) this.acceptControl({ ...packet, controlId: packet.controlId ?? crypto.randomUUID() });
    }
  }

  private sendDirectControl(peerId: string, packet: DirectPacket): void {
    const channel = this.links.get(peerId)?.control;
    if (channel?.readyState === 'open' && channel.bufferedAmount < MAX_GAMEPLAY_BUFFER) channel.send(JSON.stringify(packet));
  }

  private sendDirectToHost(packet: DirectPacket): void { if (this.room) this.sendDirectControl(this.room.hostPeerId, packet); }

  private broadcastDirectControl(packet: DirectPacket): void {
    for (const [peerId, link] of this.links) if (link.route === 'direct') this.sendDirectControl(peerId, packet);
  }

  private sendGameplay(link: PeerLink, packet: DirectPacket): boolean {
    const channel = link.gameplay;
    if (channel?.readyState !== 'open') return false;
    if (channel.bufferedAmount > MAX_GAMEPLAY_BUFFER) {
      this.status(link.peerId, 'direct', true, 'Direct queue congested; next update will resynchronize');
      return true; // stale update is superseded next tick
    }
    channel.send(JSON.stringify(packet));
    return true;
  }

  private disposeLink(peerId: string): void {
    const link = this.links.get(peerId);
    if (!link) return;
    this.links.delete(peerId);
    if (link.fallbackTimer) clearTimeout(link.fallbackTimer);
    if (link.retryTimer) clearTimeout(link.retryTimer);
    link.control?.close();
    link.gameplay?.close();
    link.pc.close();
  }

  private reportRoute(route: Route, pingMs?: number): void { this.send({ type: 'route', route, pingMs }); }

  private reportHostRoute(): void {
    if (!this.isHost) return;
    const guestIds = this.room!.peers.filter(peer => peer.peerId !== this.room!.peerId && peer.connected).map(peer => peer.peerId);
    const route: Route = guestIds.every(peerId => this.links.get(peerId)?.route === 'direct') ? 'direct' : guestIds.some(peerId => this.links.get(peerId)?.route === 'relay') ? 'relay' : 'connecting';
    this.reportRoute(route);
  }

  private status(peerId: string, route: Route, connected: boolean, reason?: string, pingMs?: number): void {
    const status: TransportStatus = { peerId, route, connected, reason, pingMs };
    this.options.onStatus?.(status);
  }

  private send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    if (this.socket.bufferedAmount > MAX_GAMEPLAY_BUFFER && (message.type === 'input' || message.type === 'snapshot')) {
      this.status(this.room?.hostPeerId ?? '', 'relay', true, 'Relay queue congested; next update will resynchronize');
      return false;
    }
    if (this.socket.bufferedAmount > MAX_GAMEPLAY_BUFFER * 8) {
      this.socket.close(1013, 'room connection overloaded');
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private ping(): void {
    this.send({ type: 'ping', nonce: performance.now() });
    for (const [peerId, link] of this.links) if (link.route === 'direct') {
      this.sendDirectControl(peerId, { type: 'ping', nonce: performance.now() });
      this.send({ type: 'peer_alive', peerId });
    }
  }

  private connectionFailed(message: string): void {
    this.pendingWelcome?.reject(new Error(message));
    this.pendingWelcome = undefined;
    this.options.onError?.('connection_failed', message);
  }
}
