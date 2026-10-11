import type { AuthEnv } from './accounts';

/** Shared bindings. All services use Cloudflare Free; admission is bounded in LobbyDO. */
export interface Env extends AuthEnv {
  ROOMS: DurableObjectNamespace;
  LOBBY: DurableObjectNamespace;
  MATCHES: DurableObjectNamespace;
  TOURNAMENTS: DurableObjectNamespace;
  ASSETS: Fetcher;
  ALLOWED_ORIGINS?: string;
  PUBLIC_ENABLED?: string;
  PUBLIC_FEASIBILITY_KEY?: string;
  DB?: D1Database;
}
