# Hosting and maintenance · v2

The game uses Cloudflare **Free only**. No paid service, paid TURN server or custom domain is enabled. Production is [the game Worker](https://new-super-tic-fighter.new-super-tic-fighter.workers.dev); integration uses [an isolated preview](https://new-super-tic-fighter-v2-preview.new-super-tic-fighter.workers.dev).

## Authority and storage

- React/Tailwind present menus and HUD; Phaser presents arenas, fighters and sound.
- The independent simulation runs in a client worker for local play and prediction, and in **MatchDO** for public authority. It advances at 60 Hz, batches input at 20 Hz and broadcasts snapshots at 20 Hz. Public clients cannot declare damage, winners or bracket advancement.
- **LobbyDO** owns presence, parties, compatible queue selection, capacity reservation and admission. **TournamentDO** owns brackets, schedules, verified advancement and league standings.
- **Room** retains private P2P signaling, coordination and WebSocket relay. Its browser host owns private combat; public matches never fall back to that authority.
- **D1/Drizzle** stores optional accounts, passkeys, profiles, cosmetic progress, idempotent verified results and tournament indexes. Preview uses `new-super-tic-fighter-preview`; production uses `new-super-tic-fighter-profiles`. Credentials are Worker secrets. See [accounts](accounts.md).

Protocol/content v2 reject incompatible clients with a refresh action. Existing v1 rooms can drain, but old clients cannot partially join v2 matches. Save migrations preserve existing controls and flag dodge-binding conflicts.

## Free capacity

Admission starts with **four active public matches**, **64 lobby sockets** and **1,200 human-player-minutes per UTC day**. Capacity is reserved before a match, reconciled to actual elapsed time and apportioned across midnight. Queue/capacity/reset information is visible. Limits are application safety margins, not a guarantee against all provider-wide traffic.

Cloudflare Free currently includes 100,000 Durable Object requests and 13,000 GB-s/day. Incoming WebSocket messages use a 20:1 request-billing ratio; outgoing messages are uncharged. At 20 Hz and 1,200 human-minutes, input messages alone represent about 72,000 request equivalents. Handshakes, metadata, checkpoints, auth and private-room traffic also consume allowances. A minimum two-human public workload uses at most roughly 36,000 active match-seconds before overhead, around 4,608 GB-s at 128 MB per active object. These are planning estimates, not billed usage measurements. [Provider pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

Idle lobby, tournament, waiting-match and finished-match WebSockets use hibernation-compatible auto responses. Active simulation timers cannot hibernate. Idle tournaments with no runnable match stop polling and resume on activity. The public client uses passive idle checks; active matches measure ping separately. [WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

Cloudflare may reject operations if a Free limit is exhausted; there is no automatic paid upgrade. Static/couch/Solo play remains available independently of matchmaking. Inspect provider telemetry after sustained use and lower application admission caps if other traffic uses the account's remaining allowance.

## Location and observed pacing

No South American simulation server is promised. Cloudflare documents its South America hint as mapping to Eastern North America; objects are explicitly placed with that reality in mind. [Location documentation](https://developers.cloudflare.com/durable-objects/reference/data-location/).

Deployed four-client Classic and later two-/four-match Expanded/Royale samples sustained about 60 authority ticks/s. This Mac saw median round trips around 170–196 ms. See [initial feasibility](public-feasibility.md) and the [v2 verification report](verification-v2.md) for snapshot jitter, bandwidth, exact evidence and limitations. CPU time cannot be inferred from zero-valued `performance.now()` durations in the deployed I/O-frozen clock.

## Builds, migrations and deployment status

The existing Cloudflare GitHub app remains connected only to the private game repository. Production tracks `main`; its build/deployment check appears on GitHub. The separate **Verify game** workflow runs type/build checks and complete browser/service flows, without unit tests. Cloudflare does not wait for GitHub Actions, so PR verification must pass before merging.

- [GitHub verification](https://github.com/IgnacioPardo/New-Super-TIC-Fighter/actions/workflows/verify.yml)
- [GitHub deployments](https://github.com/IgnacioPardo/New-Super-TIC-Fighter/deployments)
- [Cloudflare deployments](https://dash.cloudflare.com/98f3f5983afc3baf9aa40f441412fee0/workers/services/view/new-super-tic-fighter/production/deployments)

Production commands:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler d1 migrations apply new-super-tic-fighter-profiles --remote
python3 scripts/make-audio-headers.py --check
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm build
pnpm exec wrangler deploy
```

`wrangler.jsonc` declares Room, MatchDO, LobbyDO and TournamentDO SQLite migrations. D1 migrations `0001_profiles.sql` and `0002_tournaments.sql` were applied to both production and preview. Only set `PUBLIC_ENABLED=true` after the service checks; false disables new public admissions. `/api/feasibility` additionally requires a private `PUBLIC_FEASIBILITY_KEY`; production does not need that diagnostic secret.

Use `pnpm run deploy` (with `run`) for the project's build/deploy script. Bare `pnpm deploy` is a different package-manager operation.

## Recovery and rollback

Public disconnects neutralize input and retain a fifteen-second seat window. Match checkpoints serialize timers, resources, deployables, objectives, hidden runtime and random state. A recoverable process restart rebases the clock and input sequence; missing/incompatible state aborts without inventing winners. Results and bracket advancement are idempotent. Private host failure retains the existing honest interrupted-round behavior.

Keep the prior Git revision and Cloudflare deployment available. Roll back code only with attention to protocol compatibility and persisted Durable Object classes; never delete production D1 data or a durable class to force a rollback. Stop admission for maintenance if needed. No original archive is a deployment input, and `.assetsignore` excludes operating-system metadata.
