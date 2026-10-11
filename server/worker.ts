import { CONTENT_VERSION, PROTOCOL_VERSION } from '../src/shared/types';
import { Room } from './room';

export { Room };

interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
  ALLOWED_ORIGINS?: string;
}

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
  return (env.ALLOWED_ORIGINS ?? '').split(',').map(item => item.trim()).includes(origin);
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!sameAllowedOrigin(request, env)) return json({ error: 'origin_not_allowed' }, 403);

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ ok: true, protocolVersion: PROTOCOL_VERSION, contentVersion: CONTENT_VERSION });
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
