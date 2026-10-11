import { CONTENT_VERSION, PROTOCOL_VERSION } from '../src/shared/types';
import { Room } from './room';
import { MatchDO } from './match';
import { LobbyDO } from './lobby';
import type { Env } from './env';
import { secret } from './validation';
import type { MatchAdmission } from './match';
import { handleAccountRequest, getAccountIdentity } from './accounts';

export { Room, MatchDO, LobbyDO };


const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SIZE = 10;

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_SIZE));
  return Array.from(bytes, byte => ALPHABET[byte & 31]).join('');
}

function sameAllowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // command-line clients do not send Origin
  const url = new URL(request.url);
  if (origin === url.origin) return true;
  try {
    const source = new URL(origin);
    const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (loopback.has(url.hostname) && loopback.has(source.hostname)) return true;
  } catch { return false; }
  return (env.ALLOWED_ORIGINS ?? '').split(',').map(item => item.trim()).includes(origin);
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

function audioRange(value: string, size: number): { start: number; end: number } | 'unsatisfiable' | undefined {
  // Multiple ranges and malformed units may be ignored; media elements use one range.
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return;
  const length = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (!suffix || !length) return 'unsatisfiable';
    return { start: suffix >= length ? 0 : size - Number(suffix), end: size - 1 };
  }
  const start = BigInt(match[1]);
  const end = match[2] ? BigInt(match[2]) : length - 1n;
  if (start >= length || end < start) return 'unsatisfiable';
  return { start: Number(start), end: end >= length ? size - 1 : Number(end) };
}

function matchesIfRange(value: string, headers: Headers): boolean {
  if (value.startsWith('"')) return value === headers.get('ETag');
  const modified = headers.get('Last-Modified');
  return !!modified && Number.isFinite(Date.parse(value)) && Date.parse(value) === Date.parse(modified);
}

function audioSlice(body: ReadableStream<Uint8Array>, start: number, end: number): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let offset = 0;
  let stopped = false;
  const stop = async (reason?: unknown) => {
    if (stopped) return;
    stopped = true;
    try { await reader.cancel(reason); } finally { reader.releaseLock(); }
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) {
            stopped = true;
            reader.releaseLock();
            controller.error(new Error('Audio asset ended before the requested range.'));
            return;
          }
          const chunkStart = offset;
          offset += value.byteLength;
          if (offset <= start) continue;
          controller.enqueue(value.subarray(Math.max(0, start - chunkStart), Math.min(value.byteLength, end + 1 - chunkStart)));
          if (offset > end) {
            controller.close();
            await stop();
          }
          return;
        }
      } catch (error) {
        if (!stopped) {
          controller.error(error);
          await stop(error);
        }
      }
    },
    cancel: stop,
  });
}

async function audioAsset(request: Request, assets: Fetcher): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return assets.fetch(request);
  const sourceHeaders = new Headers(request.headers);
  sourceHeaders.delete('Range');
  sourceHeaders.delete('If-Range');
  sourceHeaders.set('Accept-Encoding', 'identity');
  // A GET body preserves workerd's length metadata when its HTTP layer handles HEAD.
  const asset = await assets.fetch(new Request(request, { method: 'GET', headers: sourceHeaders }));
  if (asset.status !== 200 || asset.headers.get('Content-Type')?.split(';')[0] !== 'audio/mpeg') return asset;
  const headers = new Headers(asset.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', `${headers.get('Cache-Control') ?? 'public, max-age=86400'}, no-transform`);
  const full = () => new Response(asset.body, { status: 200, headers });
  const value = request.headers.get('Range');
  const validator = request.headers.get('If-Range');
  // Range applies to GET. HEAD retains the full representation's headers and no body.
  if (!value || request.method === 'HEAD' || (validator && !matchesIfRange(validator, headers))) return full();
  const size = Number(headers.get('Content-Length'));
  if (!headers.has('Content-Length') || !Number.isSafeInteger(size) || size < 0 || (headers.has('Content-Encoding') && headers.get('Content-Encoding') !== 'identity')) return full();
  const range = audioRange(value, size);
  if (!range) return full();
  if (range === 'unsatisfiable') {
    await asset.body?.cancel();
    headers.set('Content-Range', `bytes */${size}`);
    headers.set('Content-Length', '0');
    return new Response(null, { status: 416, headers });
  }
  if (!asset.body) return full();
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  headers.set('Content-Length', String(range.end - range.start + 1));
  // workerd derives Content-Length from the body; setting the header alone is ignored.
  const { readable, writable } = new FixedLengthStream(range.end - range.start + 1);
  void audioSlice(asset.body, range.start, range.end).pipeTo(writable).catch(() => {
    // pipeTo propagates any source error to the response stream through abort.
  });
  return new Response(readable, { status: 206, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/assets/audio/') && url.pathname.endsWith('.mp3')) return audioAsset(request, env.ASSETS);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!sameAllowedOrigin(request, env)) return json({ error: 'origin_not_allowed' }, 403);

    const accountResponse = await handleAccountRequest(request, env);
    if (accountResponse) return accountResponse;

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ ok: true, protocolVersion: PROTOCOL_VERSION, contentVersion: CONTENT_VERSION });
    }

    if (url.pathname === '/api/lobby' && request.method === 'GET') return env.LOBBY.get(env.LOBBY.idFromName('global'), { locationHint: 'enam' }).fetch('https://internal/internal/state');
    if (url.pathname === '/api/lobby/ws' && request.method === 'GET') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({error:'websocket_required'},426);
      const identity = await getAccountIdentity(request, env);
      const headers = new Headers(request.headers); headers.delete('X-Verified-User');
      if (identity) headers.set('X-Verified-User',identity.userId);
      return env.LOBBY.get(env.LOBBY.idFromName('global'), { locationHint: 'enam' }).fetch(new Request('https://internal/internal/ws',{headers}));
    }
    const spectator = /^\/api\/activities\/([a-zA-Z0-9_-]{1,64})\/spectate$/.exec(url.pathname);
    if (spectator && request.method === 'GET') return env.LOBBY.get(env.LOBBY.idFromName('global')).fetch(`https://internal/internal/spectate?matchId=${spectator[1]}`);

    if (url.pathname === '/api/feasibility' && request.method === 'POST') {
      if (!env.PUBLIC_FEASIBILITY_KEY || request.headers.get('X-Feasibility-Key') !== env.PUBLIC_FEASIBILITY_KEY) return json({ error: 'feasibility_disabled' }, 403);
      const config = await request.json() as MatchAdmission['config'];
      const matchId = crypto.randomUUID();
      const peerIds = [...new Set(config.players.map(player => player.peerId))];
      const members = peerIds.map(peerId => ({ peerId: peerId!, token: secret(), seatIds: config.players.filter(p => p.peerId === peerId).map(p => p.id), connected: false, forfeited: false, lastSequence: 0, ready: {} }));
      const response = await env.MATCHES.get(env.MATCHES.idFromName(matchId), { locationHint: 'enam' }).fetch('https://internal/internal/create', { method: 'POST', body: JSON.stringify({ matchId, config, members }) });
      if (!response.ok) return response;
      return json({ matchId, tickets: members.map(member => ({ matchId, peerId: member.peerId, token: member.token, seatIds: member.seatIds, config })) }, 201);
    }
    const publicMatch = /^\/api\/matches\/([a-zA-Z0-9_-]{1,64})(\/ws)?$/.exec(url.pathname);
    if (publicMatch && request.method === 'GET') {
      if (publicMatch[2] && request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'websocket_required' }, 426);
      return env.MATCHES.get(env.MATCHES.idFromName(publicMatch[1]), { locationHint: 'enam' }).fetch(new Request(`https://internal/internal/${publicMatch[2] ? 'ws' : 'state'}`, { headers: request.headers }));
    }

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code), { locationHint: 'enam' });
        const response = await stub.fetch(new Request(`${url.origin}/internal/create`, { method: 'POST', headers: { 'X-Room-Code': code } }));
        if (response.status === 409) continue;
        if (!response.ok) return json({ error: 'room_creation_failed' }, 503);
        return json(await response.json(), 201);
      }
      return json({ error: 'room_creation_failed' }, 503);
    }

    const match = /^\/api\/rooms\/([A-Z2-9]{10})\/ws$/.exec(url.pathname);
    if (match && request.method === 'GET') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'websocket_required' }, 426);
      return env.ROOMS.get(env.ROOMS.idFromName(match[1]), { locationHint: 'enam' }).fetch(
        new Request(`${url.origin}/internal/ws`, { headers: request.headers }),
      );
    }

    return json({ error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;
