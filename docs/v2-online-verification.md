# V2 online verification — 2026-10-11

The exercises below ran real Worker/Durable Object services. Node clients generated inputs and outages. Independent WebSockets represent independent browser identities, but these runs did not use physical controllers or separate Internet connections.

## Deployed Classic feasibility

The first Cloudflare deployment exposed a real failure: `Date.now()`/`performance.now()` remained unchanged inside timer work, producing zero simulation ticks and repeated rate-limit errors. Local workerd had concealed that production behavior. The fix assigns at least one step to each timer callback and uses bounded 17/17/16 ms scheduling, with logical simulation time for stale inputs and disconnects. No zero-delay polling remains. Cloudflare documents its clock behavior in [Performance APIs](https://developers.cloudflare.com/workers/runtime-apis/performance/).

Root's subsequent actual Cloudflare preview run, from the Argentina development Mac with four synthetic Classic clients, passed: 1,800 ticks and 600 snapshots in 30.014 server seconds; 59.972 server Hz and 59.414 Hz on an independent client clock including the final state fetch. No errors or dropped simulation time occurred. Snapshot interval p95 was 70.682 ms, p99 122.714 ms; ping RTT p50 169.859 ms, p95 204.707 ms. JSON application traffic was approximately 141,670 bytes/player/second. The committed Classic evidence lives in `docs/evidence/v2-online/cloudflare-classic-feasibility.json` in the integrated release branch.

Production CPU metrics were zero because those clocks cannot measure synchronous work; they are not evidence of zero CPU cost. These observations establish deployed pacing, not a production billing guarantee or two-network Argentina playtest.

## Deployed Expanded load

`public-deployed-load.mjs` ran against the isolated preview Worker and its isolated D1 database. Eight independent Royale peers used all six Expanded disciplines plus Networks and Hardware. Synthetic neutral inputs were batched at 20 Hz; active combat pulses were exercised in the separate local Royale run. Two 15-second observation windows measured Royale plus one duel, then Royale plus three duels. This sample ran before the later lobby latency-preference change.

| Sample | Server tick rate | Client observed rate | Snapshot p95 | Dropped time |
| --- | --- | --- | --- | --- |
| Two concurrent matches, Royale | 60.014 Hz | 60.111 Hz | 68.632 ms | 0 |
| Two concurrent matches, duel | 59.991 Hz | 60.111 Hz | 67.321 ms | 0 |
| Four concurrent matches, Royale | 60.003 Hz | 59.881 Hz | 78.137 ms | 0 |
| Four concurrent matches, three duels | 59.986–60.049 Hz | 59.945–60.073 Hz | 78.382–85.810 ms | 0 |

The sample reported zero errors and catchup ticks. Independent client durations include state-fetch latency; counters and client timestamps span slightly different request boundaries, so approximately 60 Hz is the meaningful result. Ping samples accumulated over each connection's lifetime: p50 170–196 ms and p95 238–388 ms in the four-match report. Royale application JSON traffic was approximately 229,744 bytes/player/second, roughly 1.84 Mbps before transport overhead/compression; duels were approximately 67,900 bytes/player/second. This is a material bandwidth requirement.

A subsequent deployed 2+2 couch-party match admitted four human seats and produced two authoritative team winners. Successful fixtures consumed 10.4665 human-player-minutes and released every reservation. An aborted harness run had advanced synthetic ticks before admission completed; it consumed 10.0045 minutes, the server rejected those invalid inputs, and the harness was corrected before the successful measurements. See [complete sanitized deployed load evidence](evidence/v2-online/cloudflare-expanded-load.json). No production player pool or paid service was used.

## Local running-service exercises

| Exercise | Actual result | Synthetic portion |
| --- | --- | --- |
| `public-service.mjs` | Compatible duel admission, reserved capacity, ownership and forged-result rejection, reconnect without global pause, authoritative forfeits, stable stored results and quota refund | Input packets and disconnect |
| `private-v2-service.mjs` | Two couch seats on each of two peers, serialized edit acknowledgements, per-seat readiness/ownership, readiness invalidation, Expanded roster/arena and eight-seat Royale admission | Client seat edits and readiness |
| `network-browser.mjs` | Chromium direct WebRTC inputs/snapshots, signaling recovery and forced relay fallback | Injected signaling failure/relay choice |
| `public-roster-capacity.mjs` | Preserved 2+2 public team parties; oversized teams rejected; eight-client Expanded Royale; four reservations; fifth duel admitted after release; 64 lobby sockets admitted and 65th rejected; external result route rejected | Fighter inputs, forfeits and connection population |
| `public-recovery.mjs` | Real workerd process killed and restarted against its durable storage; Expanded runtime restored; input sequence resumed and new input acknowledged; remaining player continued; disconnected player forfeited after 15 seconds; result ID remained stable | Process outage and input packets |
| `tournament-service.mjs` | Four-entry elimination completed six authoritative BO3 bouts and three bracket games; D1 public listing; four-entry round robin created six pairs; shared-browser entrants avoided simultaneous separate matches; private event omitted from listing | Entrants and forfeit outcomes |
| `tournament-teams-service.mjs` | Four teams each containing two independent browsers admitted by party leader credentials; follower rejected; progress omitted tokens; six authoritative BO3 bouts produced champion; eight read-only spectators accepted and ninth rejected | Entrants, controls and forfeit outcomes |
| `public-latency-service.mjs` | Server-issued nonce handshake; forged nonce ignored; oldest compatible party retained; closer measured RTT parties preferred; available-player list excluded active seats and exposed only safe fields | Delayed probe replies simulate 400/420/440/460/1,400 ms preferences |

The eight-client local Royale used Robotics, AI, IoT, VR, Games, Printing, Networks and Hardware on Arcade Circuit. It produced 541 ticks and 180 snapshots over 9,025 ms, with zero dropped time. It retained full Expanded runtime and server survival placements, including first eliminated eighth and survivor first. Local measured tick work totalled 146 ms with a 7 ms maximum; this is local wall-clock work, not billed production CPU.

The controlled process recovery restarted in 1,550 ms. This run observed no rollback at its chosen storage boundary; recovery is allowed to roll back to the most recent five-second checkpoint. Simulation's separate restoration exercise verifies hidden-runtime equivalence; this online exercise verifies persistent service restoration and resumed control. An earlier incomplete checkpoint produced an honest interrupted outcome rather than fabricated state.

Server TypeScript and the owned network/OnlineBridge source TypeScript checks passed. The integrated root branch owns final whole-application build and UI verification. No unit tests were added.

## Quota and service behavior

Public admission reserves human-player minutes before match creation. The cap is four simultaneous matches, 64 lobby connections and 1,200 human-player-minutes per UTC day. Reservations include the bounded readiness window, are split across UTC midnight, refund unused duration on authoritative completion, and conservatively consume their reserved allowance when a lost match expires. Results/releases are idempotent. Passive socket pings use Durable Object auto responses; only active simulation/input work keeps gameplay objects awake.

The cap, reservation/refund, socket admission, and fifth-match resumption paths were exercised with running local services. A full day of natural quota exhaustion, midnight rollover, production hibernation billing, and production checkpoint eviction were not measured. Free-tier budget estimates must remain separate from observed usage. Cloudflare's [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) counts incoming WebSocket messages at a 20:1 ratio and does not charge outgoing messages, but application and storage traffic still need deployed usage monitoring.

Latency is a matchmaking preference measured by server-issued random nonce round trips; client-supplied clock values are never accepted. Selection keeps the oldest matchable compatible party and favors nearby measurements without a hard latency or region exclusion. All initial objects request ENAM; this is not a guarantee of geographical proximity. Public available-player metadata contains only fighter ID, display name, party size and queue state, capped at 64 entries.

## Remaining acceptance evidence

Physical controller play, two truly separate Argentina Internet connections, sustained balance playtests, injected WAN jitter/loss/background/sleep, a natural daily-budget rollover, and production billed CPU/storage usage remain outside these service exercises. Authentication provider, passkey and account-link flows belong to root's separate account verification report. Private eight-seat validation is not a completed private eight-player browser fight.
