import { CONTENT_VERSION, PROTOCOL_VERSION } from '../src/shared/types';
import type { InputFrame, MatchConfig, MatchResult, MatchSnapshot, PlayerSeat } from '../src/shared/types';
import { validSeat, validConfig, validFrames, maxSeats } from './validation';
import type { ClientMessage, RoomPhase, RoomState, Route, ServerMessage, SignalData } from '../src/network/types';

interface Member {
  peerId: string;
  reconnectToken: string;
  joinedAt: number;
  disconnectedAt?: number;
  lastDirectSeen?: number;
  players: PlayerSeat[];
  ready: boolean;
  seatReadiness?:Record<string,{ready:boolean;assetsReady:boolean}>;
  assetsReady: boolean;
  route: Route;
  pingMs?: number;
  protocolVersion: number;
  contentVersion: string;
}

interface StoredRoom {
  code: string;
  protocolVersion?:number;
  contentVersion?:string;
  hostToken: string;
  hostPeerId: string;
  createdAt: number;
  emptySince?: number;
  members: Member[];
  config: MatchConfig;
  phase: RoomPhase;
  matchId?: string;
  pauseReason?: string;
  resumeAt?: number;
  result?: MatchResult;
  finalSnapshot?: MatchSnapshot;
}

interface SocketAttachment { peerId?: string }
interface RateBucket { start: number; count: number; violations: number }

const MAX_PACKET_BYTES = 96 * 1024;
const MAX_BUFFERED_BYTES = 512 * 1024;
const RECONNECT_MS = 15_000;
const EMPTY_ROOM_MS = 15 * 60_000;
function token(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validResult(value: unknown, ids: Set<string>): value is MatchResult {
  return record(value) && Array.isArray(value.winners) && value.winners.length <= ids.size &&
    value.winners.every(id => typeof id === 'string' && ids.has(id)) &&
    ['last-standing', 'timeout', 'draw', 'interrupted'].includes(String(value.reason)) &&
    (value.winningTeam === undefined || value.winningTeam === 0 || value.winningTeam === 1);
}

function validFinalSnapshot(value: unknown, matchId: string, result: MatchResult, ids: Set<string>): value is MatchSnapshot {
  return record(value) && value.matchId === matchId && value.phase === 'finished' &&
    Number.isSafeInteger(value.tick) && Number(value.tick) >= 0 && Number.isFinite(value.elapsed) &&
    validConfig(value.config) && value.config.players.length === ids.size && value.config.players.every(player => ids.has(player.id)) &&
    record(value.result) && value.result.reason === result.reason && value.result.winningTeam === result.winningTeam &&
    Array.isArray(value.result.winners) && value.result.winners.length === result.winners.length &&
    value.result.winners.every((id: unknown) => typeof id === 'string' && result.winners.includes(id)) &&
    Array.isArray(value.fighters) && value.fighters.length === ids.size &&
    new Set(value.fighters.map((fighter: unknown) => record(fighter) ? fighter.id : '')).size === ids.size &&
    value.fighters.every((fighter: unknown) => record(fighter) && ids.has(String(fighter.id)) &&
      Number.isFinite(fighter.x) && Number.isFinite(fighter.y) && Number.isInteger(fighter.lives) && Number.isFinite(fighter.damage)) &&
    Array.isArray(value.effects) && Array.isArray(value.events);
}

function defaultConfig(): MatchConfig {
  return { ruleset:'expanded',gameMode:'stock',items:false,hazards:false,bestOf:3,mode: 'ffa', arena: 'classic', lives: 3, timeLimit: 300, friendlyFire: false, practice: false, seed: crypto.getRandomValues(new Uint32Array(1))[0], players: [] };
}

export class Room {
  private room: StoredRoom | undefined;
  private rejectedEdits=new WeakSet<WebSocket>();
  private rates = new WeakMap<WebSocket, Map<string, RateBucket>>();

  constructor(private state: DurableObjectState) {
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)');
    const row = this.state.storage.sql.exec('SELECT data FROM room WHERE id = 1').toArray()[0] as { data: string } | undefined;
    if (row) {this.room = JSON.parse(row.data) as StoredRoom;this.room.protocolVersion??=this.room.members[0]?.protocolVersion??1;this.room.contentVersion??=this.room.members[0]?.contentVersion??'stf-classic-1';}
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/internal/create' && request.method === 'POST') {
      if (this.room) return new Response(null, { status: 409 });
      const code = request.headers.get('X-Room-Code');
      if (!code || !/^[A-Z2-9]{10}$/.test(code)) return new Response(null, { status: 400 });
      this.room = { protocolVersion:PROTOCOL_VERSION,contentVersion:CONTENT_VERSION,code, hostToken: token(), hostPeerId: '', createdAt: Date.now(), emptySince: Date.now(), members: [], config: defaultConfig(), phase: 'lobby' };
      this.save();
      await this.scheduleAlarm();
      return Response.json({ code, hostToken: this.room.hostToken, protocolVersion: this.room.protocolVersion!, contentVersion: this.room.contentVersion! });
    }
    if (url.pathname === '/internal/ws' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      if (!this.room) return Response.json({ error: 'room_not_found' }, { status: 404 });
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.state.acceptWebSocket(server);
      server.serializeAttachment({} satisfies SocketAttachment);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response(null, { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || new TextEncoder().encode(data).length > MAX_PACKET_BYTES) {
      this.error(ws, 'packet_too_large', 'The room packet is too large.');
      ws.close(1009, 'packet too large');
      return;
    }
    let message: ClientMessage;
    try { message = JSON.parse(data) as ClientMessage; } catch { this.error(ws, 'invalid_json', 'Invalid room message.'); return; }
    if (!record(message) || typeof message.type !== 'string') { this.error(ws, 'invalid_message', 'Invalid room message.'); return; }
    if (!this.allowRate(ws, message.type)) return;
    if (message.type === 'hello') { await this.hello(ws, message); return; }
    const peerId = (ws.deserializeAttachment() as SocketAttachment | null)?.peerId;
    const member = this.room?.members.find(item => item.peerId === peerId);
    if (!member || !peerId) { this.error(ws, 'join_required', 'Join the room first.'); return; }
    this.rejectedEdits.delete(ws);
    await this.handle(ws, member, message);
    if ((message.type==='seats'||message.type==='config') && Number.isSafeInteger(message.editId)) this.send(ws,{type:'edit_ack',editId:message.editId!,accepted:!this.rejectedEdits.has(ws)});
  }

  async webSocketClose(ws: WebSocket): Promise<void> { await this.disconnect(ws); }
  async webSocketError(ws: WebSocket): Promise<void> { await this.disconnect(ws); }

  async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    if (room.emptySince && now - room.emptySince >= EMPTY_ROOM_MS) {
      this.state.storage.sql.exec('DELETE FROM room WHERE id = 1');
      this.room = undefined;
      return;
    }
    // If every browser loses signaling but their direct channels may still be alive,
    // preserve the round until one returns or the empty-room deadline expires.
    const allDirectAndOffline = !!room.emptySince && (room.phase === 'playing' || room.phase === 'paused') && room.members.length > 0 && room.members.every(member => member.route === 'direct');
    let changed = false;
    for (const member of [...room.members]) {
      if (allDirectAndOffline) break;
      if (!member.disconnectedAt || now - Math.max(member.disconnectedAt, member.lastDirectSeen ?? 0) < RECONNECT_MS) continue;
      if (member.peerId === room.hostPeerId && (room.phase === 'playing' || room.phase === 'paused')) {
        const result: MatchResult = { winners: [], reason: 'interrupted' };
        this.broadcast({ type: 'result', matchId: room.matchId!, result, controlId: crypto.randomUUID() });
        room.phase = 'lobby';
        room.result = result;
        room.finalSnapshot = undefined;
        room.matchId = undefined;
        room.pauseReason = undefined;
        room.resumeAt = undefined;
      } else if (room.phase === 'playing' || room.phase === 'paused') {
        this.broadcast({ type: 'forfeit', matchId: room.matchId!, peerId: member.peerId, seatIds: member.players.map(player => player.id), controlId: crypto.randomUUID() });
      }
      room.members = room.members.filter(item => item.peerId !== member.peerId);
      if (member.peerId === room.hostPeerId) {
        room.hostPeerId = room.members.find(item => this.connectionFor(item.peerId))?.peerId ?? '';
        room.hostToken = token();
      }
      changed = true;
    }
    if (changed) {
      if (room.phase === 'lobby' || room.phase === 'finished') {
        room.config.players = [...room.members.flatMap(member => member.players), ...room.config.players.filter(player => player.kind === 'bot')];
      }
      this.clearReadiness();
      this.save();
      this.broadcastState();
    }
    await this.scheduleAlarm();
  }

  private async hello(ws: WebSocket, message: Extract<ClientMessage, { type: 'hello' }>): Promise<void> {
    const room = this.room;
    if (!room) { this.error(ws, 'room_not_found', 'The room has expired.'); ws.close(1008); return; }
    if (message.protocolVersion !== room.protocolVersion || message.contentVersion !== room.contentVersion) {
      this.error(ws, 'version_mismatch', 'Game versions differ. Reload the game and try again.'); ws.close(1008); return;
    }
    if ((ws.deserializeAttachment() as SocketAttachment | null)?.peerId) { this.error(ws, 'already_joined', 'Already joined.'); return; }
    let member = room.members.find(item => item.peerId === message.peerId && item.reconnectToken === message.reconnectToken);
    if (message.reconnectToken && !member) { this.error(ws, 'reconnect_expired', 'Your reconnect window has expired. Join the lobby again.'); ws.close(1008); return; }
    const directOutage = !!room.emptySince && (room.phase === 'playing' || room.phase === 'paused') && room.members.every(item => item.route === 'direct');
    if (member && member.disconnectedAt && !directOutage && Date.now() - Math.max(member.disconnectedAt, member.lastDirectSeen ?? 0) > RECONNECT_MS) {
      this.error(ws, 'reconnect_expired', 'Your reconnect window has expired.'); ws.close(1008); return;
    }
    if (!member) {
      if (room.phase !== 'lobby') { this.error(ws, 'round_in_progress', 'New players can join between rounds.'); ws.close(1008); return; }
      if (room.members.length >= maxSeats(room.config)) { this.error(ws, 'room_full', 'The room is full.'); ws.close(1008); return; }
      if (!room.hostPeerId && message.hostToken !== room.hostToken) { this.error(ws, 'host_required', 'The host has not opened this room yet.'); ws.close(1008); return; }
      member = { peerId: crypto.randomUUID(), reconnectToken: token(), joinedAt: Date.now(), players: [], ready: false, assetsReady: false, route: room.hostPeerId ? 'connecting' : 'relay', protocolVersion: room.protocolVersion!, contentVersion: room.contentVersion! };
      room.members.push(member);
      if (!room.hostPeerId) room.hostPeerId = member.peerId;
    }
    const old = this.connectionFor(member.peerId);
    if (old && old !== ws) old.close(4001, 'reconnected elsewhere');
    if (directOutage) for (const other of room.members) if (other.peerId !== member.peerId && other.disconnectedAt) other.disconnectedAt = Date.now();
    member.disconnectedAt = undefined;
    member.lastDirectSeen = undefined;
    room.emptySince = undefined;
    ws.serializeAttachment({ peerId: member.peerId } satisfies SocketAttachment);
    this.save();
    this.send(ws, { type: 'welcome', state: this.publicState(member.peerId), peerId: member.peerId, reconnectToken: member.reconnectToken, ...(member.peerId === room.hostPeerId ? { hostToken: room.hostToken } : {}) });
    if (room.phase === 'finished' && room.matchId && room.result) {
      this.send(ws, { type: 'result', matchId: room.matchId, result: room.result, snapshot: room.finalSnapshot, controlId: crypto.randomUUID() });
    }
    this.broadcastState();
    await this.scheduleAlarm();
  }

  private async handle(ws: WebSocket, member: Member, message: ClientMessage): Promise<void> {
    const room = this.room!;
    const host = member.peerId === room.hostPeerId;
    switch (message.type) {
      case 'seats': {
        if (room.phase !== 'lobby' || !Array.isArray(message.players) || message.players.length > 4 || !message.players.every(player => validSeat(player, 'human'))) return this.error(ws, 'invalid_seats', 'Seats can be changed in the lobby only.');
        const players = message.players.map(player => ({ ...player, name: player.name.trim(), peerId: member.peerId, kind: 'human' as const, difficulty: undefined, ...(room.config.gameMode==='survival'?{team:0 as const}:{}) }));
        const all = [...room.members.filter(item => item.peerId !== member.peerId).flatMap(item => item.players), ...players, ...room.config.players.filter(player => player.kind === 'bot')];
        if (all.length > maxSeats(room.config) || new Set(all.map(player => player.id)).size !== all.length) return this.error(ws, 'invalid_seats', 'Seats must be unique and the room holds at most four fighters.');
        if(room.config.gameMode==='survival'&&all.filter(player=>player.kind==='human').length>2)return this.error(ws,'invalid_survival','Survival allows one or two human players.');
        member.players = players;
        room.config.players = all;
        this.clearReadiness();
        break;
      }
      case 'config': {
        if (!host || room.phase !== 'lobby' || !validConfig(message.config)) return this.error(ws, 'invalid_config', 'Only the host can change valid lobby settings.');
        const humans = room.members.flatMap(item => item.players);
        const proposedHumans = message.config.players.filter(player => player.kind === 'human');
        const bots = message.config.players.filter(player => player.kind === 'bot').map(player => ({ ...player, peerId: undefined, device: 'bot' }));
        const ids = [...humans, ...bots].map(player => player.id);
        if (humans.length !== proposedHumans.length || !humans.every(player => proposedHumans.some(other => other.id === player.id && other.peerId === player.peerId)) || ids.length > maxSeats(message.config) || new Set(ids).size !== ids.length) {
          return this.error(ws, 'invalid_roster', 'Register every human seat before setting room rules.');
        }
        if(message.config.gameMode==='survival'){
          if(humans.length<1||humans.length>2||!bots.length)return this.error(ws,'invalid_survival','Survival needs one or two humans and bot opponents.');
          for(const player of humans)player.team=0;for(const player of bots)player.team=1;
        }
        room.config = { ...message.config, ...(message.config.gameMode==='survival'?{mode:'teams' as const}:{}), players: [...humans, ...bots] };
        this.clearReadiness();
        break;
      }
      case 'seat_ready': {
        if(room.phase!=='lobby'||!member.players.some(p=>p.id===message.seatId)||typeof message.ready!=='boolean'||typeof message.assetsReady!=='boolean')return this.error(ws,'invalid_ready','Ready belongs to your own local fighter.');
        member.seatReadiness??={};member.seatReadiness[message.seatId]={ready:message.ready,assetsReady:message.assetsReady};
        member.ready=member.players.length>0&&member.players.every(p=>member.seatReadiness?.[p.id]?.ready);member.assetsReady=member.players.every(p=>member.seatReadiness?.[p.id]?.assetsReady);break;
      }
      case 'ready': {
        if (room.phase !== 'lobby' || typeof message.ready !== 'boolean' || typeof message.assetsReady !== 'boolean') return this.error(ws, 'invalid_ready', 'Ready is available in the lobby.');
        member.ready = message.ready;
        member.assetsReady = message.assetsReady;
        member.seatReadiness=Object.fromEntries(member.players.map(p=>[p.id,{ready:message.ready,assetsReady:message.assetsReady}]));
        break;
      }
      case 'route': {
        if (!['direct', 'relay', 'connecting', 'disconnected'].includes(message.route)) return this.error(ws, 'invalid_route', 'Invalid route.');
        member.route = message.route;
        member.pingMs = typeof message.pingMs === 'number' && Number.isFinite(message.pingMs) && message.pingMs >= 0 && message.pingMs < 60_000 ? Math.round(message.pingMs) : undefined;
        break;
      }
      case 'signal': {
        const target = room.members.find(item => item.peerId === message.to);
        if (!target || !this.validSignal(message.data) || (member.peerId !== room.hostPeerId && target.peerId !== room.hostPeerId)) return this.error(ws, 'invalid_signal', 'Invalid signaling target or packet.');
        const targetWs = this.connectionFor(target.peerId);
        if (targetWs) this.send(targetWs, { type: 'signal', from: member.peerId, data: message.data });
        return;
      }
      case 'input': {
        if (host || !Number.isSafeInteger(message.sequence) || !validFrames(message.frames, new Set(member.players.map(player => player.id)))) return this.error(ws, 'invalid_input', 'Input does not match your active seats.');
        // In-flight gameplay packets are routine during pause/result transitions.
        if (room.phase !== 'playing') return;
        if (message.matchId !== room.matchId) return this.error(ws, 'invalid_input', 'Input does not match the active round.');
        const targetWs = this.connectionFor(room.hostPeerId);
        if (targetWs) this.send(targetWs, { type: 'input', from: member.peerId, sequence: message.sequence, frames: message.frames }, true);
        return;
      }
      case 'snapshot': {
        if (!host || (room.phase !== 'playing' && room.phase !== 'paused') || message.matchId !== room.matchId || !Number.isSafeInteger(message.sequence) || !record(message.snapshot) || message.snapshot.matchId !== room.matchId || !Number.isInteger(message.snapshot.tick)) return this.error(ws, 'invalid_snapshot', 'Only the host can send snapshots for this round.');
        if (!record(message.acknowledgements) || !Object.values(message.acknowledgements).every(value => Number.isSafeInteger(value) && Number(value) >= 0)) return this.error(ws, 'invalid_snapshot', 'Invalid input acknowledgements.');
        if (!Array.isArray(message.targets) || message.targets.some(target => typeof target !== 'string' || !room.members.some(member => member.peerId === target && member.peerId !== room.hostPeerId))) return this.error(ws, 'invalid_snapshot', 'Invalid snapshot targets.');
        for (const peer of room.members) {
          if (peer.peerId === room.hostPeerId || !message.targets.includes(peer.peerId)) continue;
          const targetWs = this.connectionFor(peer.peerId);
          if (targetWs) this.send(targetWs, { type: 'snapshot', sequence: message.sequence, snapshot: message.snapshot, acknowledgements: message.acknowledgements }, true);
        }
        return;
      }
      case 'start': {
        if (!host || room.phase !== 'lobby') return this.error(ws, 'not_host', 'Only the host can start a lobby round.');
        const error = this.startError();
        if (error) return this.error(ws, error[0], error[1]);
        room.matchId = crypto.randomUUID();
        room.phase = 'playing';
        room.result = undefined;
        room.finalSnapshot = undefined;
        room.pauseReason = undefined;
        this.broadcast({ type: 'start', matchId: room.matchId, config: room.config, controlId: crypto.randomUUID() });
        break;
      }
      case 'pause': {
        if (room.phase !== 'playing') return;
        room.phase = 'paused';
        room.pauseReason = typeof message.reason === 'string' ? message.reason.slice(0, 100) : 'Paused by a player';
        room.resumeAt = undefined;
        this.broadcast({ type: 'pause', matchId: room.matchId!, reason: room.pauseReason, controlId: crypto.randomUUID() });
        break;
      }
      case 'resume': {
        if (!host || room.phase !== 'paused' || room.members.some(item => item.disconnectedAt && !(item.route === 'direct' && Date.now() - Math.max(item.disconnectedAt, item.lastDirectSeen ?? 0) < RECONNECT_MS))) return this.error(ws, 'cannot_resume', 'The host can resume when all active players are connected.');
        room.phase = 'playing';
        room.pauseReason = undefined;
        room.resumeAt = Date.now() + 3000;
        this.broadcast({ type: 'resume', matchId: room.matchId!, resumeAt: room.resumeAt, controlId: crypto.randomUUID() });
        break;
      }
      case 'result': {
        if (!host || (room.phase !== 'playing' && room.phase !== 'paused') || !validResult(message.result, new Set(room.config.players.map(player => player.id)))) return this.error(ws, 'invalid_result', 'Only the host can report a valid round result.');
        if (message.snapshot !== undefined && !validFinalSnapshot(message.snapshot, room.matchId!, message.result, new Set(room.config.players.map(player => player.id)))) return this.error(ws, 'invalid_result', 'Final snapshot does not match the round result.');
        room.phase = 'finished';
        room.result = message.result;
        room.finalSnapshot = message.snapshot;
        this.broadcast({ type: 'result', matchId: room.matchId!, result: message.result, snapshot: message.snapshot, controlId: crypto.randomUUID() });
        break;
      }
      case 'rematch': {
        if (!host || room.phase !== 'finished') return this.error(ws, 'cannot_rematch', 'Only the host can return a finished room to the lobby.');
        room.phase = 'lobby';
        room.matchId = undefined;
        room.result = undefined;
        room.finalSnapshot = undefined;
        room.resumeAt = undefined;
        room.config.players = [...room.members.flatMap(item => item.players), ...room.config.players.filter(player => player.kind === 'bot')];
        this.clearReadiness();
        break;
      }
      case 'peer_alive': {
        const target = room.members.find(item => item.peerId === message.peerId);
        if (!target || target.peerId === member.peerId || member.route !== 'direct' || target.route !== 'direct' || (member.peerId !== room.hostPeerId && target.peerId !== room.hostPeerId)) return this.error(ws, 'invalid_peer', 'Invalid direct peer status.');
        const firstHeartbeat = !!target.disconnectedAt && (!target.lastDirectSeen || Date.now() - target.lastDirectSeen >= RECONNECT_MS);
        target.lastDirectSeen = Date.now();
        this.save();
        if (firstHeartbeat) this.broadcastState();
        if (target.disconnectedAt) await this.scheduleAlarm();
        return;
      }
      case 'ping': {
        if (!Number.isFinite(message.nonce)) return;
        this.send(ws, { type: 'pong', nonce: message.nonce, now: Date.now() });
        return;
      }
      default: return this.error(ws, 'unknown_message', 'Unknown room message.');
    }
    this.save();
    this.broadcastState();
  }

  private startError(): [string, string] | undefined {
    const room = this.room!;
    const players = room.config.players;
    if (players.length < 2 || players.length > maxSeats(room.config) || new Set(players.map(player => player.id)).size !== players.length) return ['invalid_roster', 'Choose a valid number of unique fighters for this mode.'];
    if(room.config.gameMode==='survival'&&(players.filter(player=>player.kind==='human').length<1||players.filter(player=>player.kind==='human').length>2||!players.some(player=>player.kind==='bot')))return ['invalid_survival','Survival needs one or two humans and bot opponents.'];
    if (room.config.gameMode!=='survival' && room.config.mode === 'teams' && (players.filter(player => player.team === 0).length < 2 || players.filter(player => player.team === 1).length < 2)) return ['invalid_teams', 'Team matches need at least two fighters on each side.'];
    const humans = room.members.filter(member => member.players.length > 0);
    if (humans.some(member => member.disconnectedAt || !this.connectionFor(member.peerId))) return ['player_disconnected', 'Wait for every player to reconnect.'];
    if (humans.some(member => !member.ready || !member.assetsReady)) return ['not_ready', 'Every player must be ready with required assets loaded.'];
    if (humans.some(member => member.protocolVersion !== room.protocolVersion || member.contentVersion !== room.contentVersion)) return ['version_mismatch', 'A player needs to reload the game.'];
    if (humans.some(member => member.peerId !== room.hostPeerId && member.route !== 'direct' && member.route !== 'relay')) return ['route_unavailable', 'Wait for a direct or relay route to every guest.'];
    return undefined;
  }

  private validSignal(data: unknown): data is SignalData {
    if (!record(data)) return false;
    if (record(data.description)) return ['offer', 'answer', 'rollback', 'pranswer'].includes(String(data.description.type)) && typeof data.description.sdp === 'string' && data.description.sdp.length < 64_000;
    if (record(data.candidate)) return typeof data.candidate.candidate === 'string' && data.candidate.candidate.length < 8_000;
    return false;
  }

  private async disconnect(ws: WebSocket): Promise<void> {
    const peerId = (ws.deserializeAttachment() as SocketAttachment | null)?.peerId;
    const room = this.room;
    const member = room?.members.find(item => item.peerId === peerId);
    if (!room || !member || this.connectionFor(member.peerId)) return;
    const hasRelayDependency = member.route !== 'direct' || (member.peerId === room.hostPeerId && room.members.some(item => item.peerId !== member.peerId && item.players.length > 0 && item.route !== 'direct'));
    member.disconnectedAt = Date.now();
    if (member.route !== 'direct') member.route = 'disconnected';
    if (room.phase === 'playing' && hasRelayDependency) {
      room.phase = 'paused';
      room.pauseReason = member.peerId === room.hostPeerId ? 'Host connection interrupted' : 'Player connection interrupted';
      room.resumeAt = undefined;
      this.broadcast({ type: 'pause', matchId: room.matchId!, reason: room.pauseReason, controlId: crypto.randomUUID() });
    }
    if (!room.members.some(item => this.connectionFor(item.peerId))) room.emptySince = Date.now();
    this.save();
    this.broadcastState();
    await this.scheduleAlarm();
  }

  private connectionFor(peerId: string): WebSocket | undefined {
    return this.state.getWebSockets().find(socket => socket.readyState === WebSocket.OPEN && (socket.deserializeAttachment() as SocketAttachment | null)?.peerId === peerId);
  }

  private publicState(forPeer: string): RoomState {
    const room = this.room!;
    const peers = room.members.map(member => ({ peerId: member.peerId, connected: !!this.connectionFor(member.peerId) || (!!member.disconnectedAt && member.route === 'direct' && Date.now() - (member.lastDirectSeen ?? 0) < RECONNECT_MS), isHost: member.peerId === room.hostPeerId, route: member.route, ...(member.pingMs === undefined ? {} : { pingMs: member.pingMs }) }));
    return {
      protocolVersion:room.protocolVersion,contentVersion:room.contentVersion,seatReadiness:Object.assign({},...room.members.map(m=>m.seatReadiness??Object.fromEntries(m.players.map(p=>[p.id,{ready:m.ready,assetsReady:m.assetsReady}])))),
      code: room.code, peerId: forPeer, hostPeerId: room.hostPeerId, players: room.config.players,
      config: room.config, readiness: Object.fromEntries(room.members.map(member => [member.peerId, { ready: member.ready, assetsReady: member.assetsReady }])),
      phase: room.phase, matchId: room.matchId, peers, routes: Object.fromEntries(peers.map(peer => [peer.peerId, peer.route])),
      pauseReason: room.pauseReason, resumeAt: room.resumeAt, result: room.result,
    };
  }

  private broadcastState(): void {
    for (const member of this.room?.members ?? []) {
      const ws = this.connectionFor(member.peerId);
      if (ws) this.send(ws, { type: 'room', state: this.publicState(member.peerId) });
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const ws of this.state.getWebSockets()) if (ws.readyState === WebSocket.OPEN && (ws.deserializeAttachment() as SocketAttachment | null)?.peerId) this.send(ws, message);
  }

  private send(ws: WebSocket, message: ServerMessage, gameplay = false): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      if (gameplay) return; // a later update supersedes stale gameplay
      ws.close(1013, 'room connection overloaded');
      return;
    }
    ws.send(JSON.stringify(message));
  }

  private error(ws: WebSocket, code: string, message: string): void { this.rejectedEdits.add(ws);this.send(ws, { type: 'error', code, message }); }

  private allowRate(ws: WebSocket, type: string): boolean {
    const limits: Record<string, number> = { input: 40, snapshot: 25, signal: 60, ping: 3 };
    const limit = limits[type] ?? 12;
    let buckets = this.rates.get(ws);
    if (!buckets) { buckets = new Map(); this.rates.set(ws, buckets); }
    const now = Date.now();
    const bucket = buckets.get(type) ?? { start: now, count: 0, violations: 0 };
    if (now - bucket.start >= 1000) { bucket.start = now; bucket.count = 0; }
    bucket.count++;
    buckets.set(type, bucket);
    if (bucket.count <= limit) return true;
    bucket.violations++;
    if (bucket.violations > 10) ws.close(1008, 'rate limit');
    else this.error(ws, 'rate_limited', 'Too many room messages.');
    return false;
  }

  private clearReadiness(): void { for (const member of this.room?.members ?? []) {member.ready = false;member.seatReadiness=Object.fromEntries(member.players.map(p=>[p.id,{ready:false,assetsReady:member.assetsReady}]));} }

  private save(): void {
    if (this.room) this.state.storage.sql.exec('INSERT INTO room (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', JSON.stringify(this.room));
  }

  private async scheduleAlarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const allDirectAndOffline = !!room.emptySince && (room.phase === 'playing' || room.phase === 'paused') && room.members.length > 0 && room.members.every(member => member.route === 'direct');
    const deadlines = allDirectAndOffline ? [] : room.members.filter(member => member.disconnectedAt).map(member => Math.max(member.disconnectedAt!, member.lastDirectSeen ?? 0) + RECONNECT_MS);
    if (room.emptySince) deadlines.push(room.emptySince + EMPTY_ROOM_MS);
    if (deadlines.length) await this.state.storage.setAlarm(Math.max(Date.now() + 100, Math.min(...deadlines)));
    else await this.state.storage.deleteAlarm();
  }
}
