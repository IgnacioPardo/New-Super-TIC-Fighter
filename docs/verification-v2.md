# V2 release candidate verification

Recorded 2026-10-11. This document distinguishes implemented behavior, exercised application/service flows, and owner acceptance. No unit tests were added. Original source archives remain read-only.

## Release status

The candidate implements the accepted [v2 specification](implementation-plan-v2.md). The owner explicitly deferred the physical v2 Arc/DualSense check and an Argentina match across separate Internet connections until later. These remain acceptance gates; the v1 physical confirmation is not relabeled as v2 evidence. The version remains `2.0.0-rc.1` until those checks and the remaining release coverage below are complete.

## Observed checks

| Area | Actual execution | Limits |
| --- | --- | --- |
| Compilation | Client and server TypeScript checks, audio-header consistency, production Vite bundle | Build success alone does not establish gameplay quality |
| Expanded combat/content | Complete shared simulation authorities for ten kits, six arenas, objectives, five items, bounded deployables and bot recovery; 600 consecutive checkpoint-restored ticks compared with uninterrupted authorities | Selected edge scenarios deliberately seed engine states |
| Rendered combat | Ten full browser applications with actual keyboard inputs, readiness, worker simulation, grounded/airborne Special, airborne Signature recovery and aerial punch; 50 captures across six arenas; zero page errors | Isolated Chromium keyboard input, not physical controller input |
| Independent setup | Four injected gamepads editing concurrently, keyboard text coexistence, coordinator dialog ownership, reconnect/reclaim and nested navigation; Chromium, Firefox and WebKit | Injected controllers; WebKit is not native Safari |
| Private mixed/co-op UI | Actual 2+2 relay, 2+1+1 host-loss recovery, direct human/bot play, refresh/results/rematch and two-browser Survival first wave | Both browsers share one Mac; deliberate socket interruption |
| Royale presentation | Eight active worker fighters, actual keyboard movement/jump, camera following, direction-correct separated offscreen names, detailed local resource panels and compact opponents | Synthetic keyboard input; remaining physical check is separate |
| Fixed title hierarchy | Three primary choices, nested Online modes, visible utilities; 24 ES/EN title/hub layouts including 1024×640, 390×844 and 667×375; wheel input does not scroll the page, Back restores Online focus | Native Arc also observed the new title and fixed scroll behavior; longer feature screens have separate verification |
| Fixed entry/results | Private Create/Join forms preserve drafts; actual worker result renders Podium/Scoreboard tabs, keeps set score/rematch visible; ES/EN at four desktop/narrow sizes with no page overflow. Eight complete public Royale browsers, seven UI forfeits and an authoritative winner exercise both four-row score pages and finishing places | Royale exercise uses one local service/network; deliberate forfeits verify presentation and authority, not balance |
| Native Training UI | Deployed preview in actual Arc: opened/collapsed live tools, applied 100% CPU damage and observed HUD/status update, paused and returned to Solo | Keyboard/mouse computer use; physical controller remains deferred |
| Solo and sets | Actual three-double-jump challenge completion and persisted achievement; Training recording/playback, frame advance and reset; two winning bouts complete a best-of-three set | Full human completion of all twelve challenges and all eight Arcade bouts is not established by this sample |
| Public UI | Two independent browser clients queue a duel, edit/acknowledge fighter details, ready each seat, move through server snapshots, pause locally, navigate Settings/Guide/resume, and forfeit into authoritative results | Both browsers share the development Mac/network |
| Terminal public results | Two complete browser clients against the local service; delayed 18 genuine prediction callbacks across a server-confirmed forfeit, retained the results screen, zero page errors. Retired prediction workers cannot overwrite terminal authority; control messages are not discarded by input backpressure | Deliberately scheduled callback backlog; this does not establish the sole cause of the earlier CI timeout |
| Tournament UI | Four independent browser contexts create/enter a bracket, play six authoritative BO3 bouts with deliberate UI forfeits, advance three bracket games, produce a champion and restore a tournament deep link; zero page errors | Forfeits exercise result ownership/advancement, not combat balance |
| Private/public services | 2+2 seats, ownership/readiness, P2P/relay fallback, Royale admission, secure team tournament registration, spectators, capacity ceilings and durable process recovery | Service clients and outages are synthetic; see online report |
| Deployed Classic | Four clients, 30 seconds, 1,800 ticks/600 snapshots, approximately 59.97 Hz, zero errors/dropped time | One Argentina network; production CPU clock readings are not billing measurements |
| Deployed Expanded | Eight-client Royale plus three concurrent duels held approximately 60 Hz; zero errors/catchup/dropped time; deployed 2+2 party match produced two authoritative winners | Two bounded 15-second load windows, not a sustained production soak |
| Browser network disruption | Eight independently rendered Royale clients with synthetic input/snapshot loss, real browser offline/reconnect, and a five-second page freeze; all resumed with zero page/protocol errors | Same Mac/network. Minimized Chromium still reported visible; true hidden-page throttling and OS sleep are not established |
| Desktop cadence | Actual M4 GPU, headed Chromium, complete Royale worker/rendering; two 25–26-second windows near 60 Hz simulation, warmed WebGL clear p95 9.1 ms | First window had a 159 ms callback hitch; no sustained soak or physical latency claim |
| Account storage/passkeys | Disposable local D1/Worker plus full browser application; virtual WebAuthn enrollment, logout, fresh passkey login and deletion; idempotent guest upgrade, separate couch progress, protected verified statistics and validation failures | Identity/provider bootstrap is a fixture. This does not prove real Google/GitHub consent or physical passkeys |

Detailed evidence and provenance:

- [Gameplay and authored asset provenance](v2-gameplay-verification.md), with reports under `evidence/v2-gameplay/`.
- [Interface, independent seat ownership and complete UI flows](v2-interface-verification.md).
- [Online authority, deployed load, interruption and capacity evidence](v2-online-verification.md), with sanitized reports under `evidence/v2-online/`.
- [Account and virtual-passkey exercise](v2-account-verification.md), with `evidence/v2-accounts/local-passkey-roundtrip.json`.
- [V2 desktop cadence and its measurement limits](v2-performance.md), with both raw reports retained.
- [Historical v1 controller verification](controller-verification.md) and [v1 performance measurements](performance.md), retained with their original scope.

## Paged Settings and Guide

The actual rendered application passed `scripts/app-reader-pages.mjs` in English with Chromium, Firefox and WebKit at 1366×768, 1024×640, 1440×1000 and 390×844. Spanish Chromium passed the same four sizes. Every Settings editor and Guide page was traversed: nine keyboard actions, seven controller bindings and all ten disciplines remained reachable. Visible content stayed inside the viewport, the document had no vertical scrolling, and no page errors occurred. Chromium was rerun after integrating the shared viewport shell and Pager focus repair.

The flows verified persisted volume changes, Escape/B capture cancellation, editor focus restoration, Guide D-pad page/tab navigation and returning to Settings without losing preferences. Additional Chromium `app-menus.mjs` and `app-feedback.mjs` runs passed binding conflicts, native Tab trapping, remapping, pause/settings/resume, real worker fighter movement and Web Audio playback. Client typecheck and production build passed. Controller input came from injected Gamepad API fixtures; this is browser navigation coverage, not physical DualSense or native Safari certification.

## Material performance observations

Deployed four-match snapshot interval p95 was about 78–86 ms. Connection-lifetime ping RTT p50 was 170–196 ms and p95 238–388 ms. This is enough latency to require a real player judgment of prediction/reconciliation; no South American server locality is promised.

Royale JSON application traffic measured approximately 230 KB per player per second (about 1.84 Mbps before transport compression/overhead); duels used approximately 68 KB/s. The public cap remains four simultaneous matches, 64 lobby connections and 1,200 human-player-minutes/day. Reservations/refunds and admission rejection were exercised; natural daily exhaustion/rollover and production billed CPU/storage were not measured. No paid service was enabled.

## Remaining acceptance coverage

- Owner-deferred physical v2 DualSense play in Arc and a real separate-network Argentina match.
- Real production Google/GitHub sign-in, explicit linking, physical passkey and cross-device progress, recorded separately when exercised.
- Sustained reference-desktop rendering/input-response measurements and human balance/playability across the complete roster/modes.
- Native Safari, additional physical gamepads, true OS sleep/wake, production eviction and natural free-tier daily rollover.

Automated results must never be relabeled as physical playtests, independent household networks, production billing or real provider authentication. Failed/interrupted rounds have no fabricated winner; public servers remain authoritative.

Native Arc also exercised the deployed paged Settings and Guide: three-choice title, keyboard page navigation, wheel input, one-layer Escape, and opening Guide from Settings. The visible controls stayed within the window. This was native mouse/keyboard input, separate from the injected controller coverage.
