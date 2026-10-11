import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { passkey } from '@better-auth/passkey';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';
import { COSMETICS, cosmeticXP, emptyProgress, mergeProgress, sanitizeProgress } from '../src/features/profile/progress';
import type { MatchConfig, MatchResult } from '../src/shared/types';

export interface AuthEnv {
 DB?: D1Database; AUTH_SECRET?: string; AUTH_ORIGIN?: string;
 GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; GITHUB_CLIENT_ID?: string; GITHUB_CLIENT_SECRET?: string;
}
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export function createAuth(env: AuthEnv, origin: string) {
 if (!env.DB || !env.AUTH_SECRET) return null;
 const baseURL = env.AUTH_ORIGIN ?? origin;
 return betterAuth({
  appName: 'New Super TIC Fighter', baseURL, basePath: '/api/auth', secret: env.AUTH_SECRET,
  database: drizzleAdapter(drizzle(env.DB, { schema }), { provider: 'sqlite', schema, transaction: false }),
  trustedOrigins: [baseURL], emailAndPassword: { enabled: false },
  // Linking requires an authenticated, explicit OAuth flow; provider emails need not match.
  account: { accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: true } },
  onAPIError: { errorURL: `${baseURL}/?screen=profile` },
  socialProviders: {
   ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } : {}),
   ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } } : {}),
  },
  plugins: [passkey({ rpID: new URL(baseURL).hostname, rpName: 'New Super TIC Fighter', origin: baseURL })],
  rateLimit: { enabled: true, storage: 'database', window: 60, max: 60 },
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
 });
}
export async function getAccountIdentity(request: Request, env: AuthEnv): Promise<{ userId: string; handle: string } | null> {
 const auth = createAuth(env, new URL(request.url).origin);
 if (!auth) return null;
 const session = await auth.api.getSession({ headers: request.headers });
 if (!session) return null;
 const row = await env.DB!.prepare('SELECT handle FROM profile WHERE user_id = ?').bind(session.user.id).first<{ handle: string }>();
 return { userId: session.user.id, handle: row?.handle ?? `Fighter ${session.user.id.slice(0,4)}` };
}
async function readProfile(env: AuthEnv, userId: string) {
 await env.DB!.prepare('INSERT OR IGNORE INTO profile (user_id, handle, updated_at) VALUES (?, ?, ?)').bind(userId, `Fighter ${userId.slice(0,4)}`, Date.now()).run();
 const row = await env.DB!.prepare('SELECT handle, cosmetic, local_progress FROM profile WHERE user_id = ?').bind(userId).first<{ handle: string; cosmetic: string; local_progress: string }>();
 const stats = await env.DB!.prepare('SELECT COUNT(*) AS matches, COALESCE(SUM(won),0) AS wins, COALESCE(SUM(xp),0) AS xp FROM verified_result WHERE user_id = ?').bind(userId).first<{ matches: number; wins: number; xp: number }>();
 let local = emptyProgress(); try { local = sanitizeProgress(JSON.parse(row?.local_progress ?? '{}')); } catch { /* Old malformed progress cannot prevent account recovery. */ }
 return { userId, handle: row!.handle, cosmetic: row!.cosmetic, local, verified: stats ?? { matches: 0, wins: 0, xp: 0 } };
}
export async function handleAccountRequest(request: Request, env: AuthEnv): Promise<Response | null> {
 const url = new URL(request.url);
 if (url.pathname === '/api/auth-config' && request.method === 'GET') return response({ enabled: !!(env.DB && env.AUTH_SECRET), google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), github: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET), passkey: !!(env.DB && env.AUTH_SECRET) });
 if (!url.pathname.startsWith('/api/auth/') && url.pathname !== '/api/profile') return null;
 const auth = createAuth(env, url.origin);
 if (!auth) return response({ error: 'accounts_unavailable' }, 503);
 if (url.pathname.startsWith('/api/auth/')) return auth.handler(request);
 const identity = await getAccountIdentity(request, env);
 if (!identity) return response({ error: 'sign_in_required' }, 401);
 if (request.method === 'GET') return response(await readProfile(env, identity.userId));
 if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
 if (request.headers.get('Origin') !== (env.AUTH_ORIGIN ?? url.origin)) return response({ error: 'origin_not_allowed' }, 403);
 if (!request.headers.get('Content-Type')?.startsWith('application/json')) return response({ error: 'json_required' }, 415);
 const text = await request.text(); if (text.length > 8192) return response({ error: 'request_too_large' }, 413);
 let patch: Record<string, unknown>; try { patch = JSON.parse(text); } catch { return response({ error: 'invalid_profile' }, 400); }
 if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return response({ error: 'invalid_profile' }, 400);
 const current = await readProfile(env, identity.userId);
 const handle = typeof patch.handle === 'string' ? patch.handle.trim().replace(/[\p{Cc}\p{Cf}]/gu, '').slice(0, 24) : current.handle;
 if (!handle) return response({ error: 'handle_required' }, 400);
 const local = mergeProgress(current.local, sanitizeProgress(patch.local));
 const cosmetic = typeof patch.cosmetic === 'string' ? COSMETICS.find(item => item.id === patch.cosmetic && item.xp <= cosmeticXP(local,current.verified.xp))?.id : current.cosmetic;
 if (!cosmetic) return response({ error: 'cosmetic_locked' }, 400);
 await env.DB!.prepare('UPDATE profile SET handle = ?, cosmetic = ?, local_progress = ?, updated_at = ? WHERE user_id = ?').bind(handle, cosmetic, JSON.stringify(local), Date.now(), identity.userId).run();
 return response(await readProfile(env, identity.userId));
}
/** Called only by authoritative Match DOs. User IDs originate from authenticated connection admission. */
export async function recordVerifiedResult(env: AuthEnv, matchId: string, result: MatchResult, config: MatchConfig, seatUserIds: Record<string, string>): Promise<void> {
 if (!env.DB || result.reason === 'interrupted' || config.practice || config.players.some(seat => seat.kind === 'bot')) return;
 const users = new Set<string>();
 const statements: D1PreparedStatement[] = [];
 for (const seat of config.players) {
  const userId = seatUserIds[seat.id]; if (!userId || users.has(userId)) continue;
  users.add(userId);
  const won = result.winners.includes(seat.id);
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO verified_result (id, match_id, user_id, won, xp, played_at, mode) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(`${matchId}:${userId}`,matchId,userId,won ? 1 : 0,won ? 100 : 35,Date.now(),config.gameMode ?? 'stock'));
 }
 if (statements.length) await env.DB.batch(statements);
}
