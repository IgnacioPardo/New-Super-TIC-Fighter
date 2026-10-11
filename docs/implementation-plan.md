# New Super TIC Fighter — revised implementation plan

Updated: 11 October 2026, Buenos Aires.

**Decision status:** the recommendations from both grilling rounds are accepted. This document incorporates React and Tailwind, two new environments with substantial original scenery, optional bots in every mode, and the accepted interruption policies. There are no pending product decisions in this plan. Implementation is underway in the private repository; this remains the accepted specification.

## 1. Product, sources, and release commitments

Build a complete desktop browser version of Super TIC Fighter that preserves its original combat identity, human fighter sprites, computing disciplines, customization, soundtrack, and humour. Finish the online and presentation direction of the Unity remake and supply a coherent setup-to-rematch experience.

The first release includes:

- Two to four fighters in couch, online, or mixed local/remote groups. Human players use keyboards, gamepads, or both.
- Free-for-all and 2v2, with configurable lives, time, arena, and friendly fire.
- All four original disciplines and their complete Classic movesets.
- Independent hair, shirt, and trouser customization: 64 combinations per discipline.
- Three arenas: Clásico, Laboratorio TIC, and Dentro de la PC. The latter two receive distinct background, platform, and environmental artwork.
- Optional Easy or Normal bots in local and online matches, plus a dedicated practice mode.
- Spanish by default, an English switch, adaptive/fixed cameras, audio settings, controller-aware menus, results, and rematches.
- Free hosting only, a playable HTTPS URL, and a private repository named IgnacioPardo/New-Super-TIC-Fighter.
- Conventional commits and reviewed PRs. The owner receives playable milestones and concise validation reports; code review is handled by the implementation team.
- No unit tests. Validation uses complete application flows, full-service multiplayer exercises, builds/type checks, visual inspection, and playtesting.

The game site is accessible to anyone who has its URL. It has no login, public room directory, or public matchmaking. Mark the site noindex and avoid public promotion by default; this is discoverability management, not access control. The GitHub repository remains private.

Delivery is quality-driven, without a fixed deadline. Acceptance includes technical verification followed by a real session with the owner and friends.

### Evidence and precedence

The audit covered the original archive, all 73 commits of the Unity remake, the Drive export, and all 38 Trello cards, including ten archived cards. The source folders remain untouched.

- [Game understanding](game-understanding.md): identity, assets, interface, audio, and remake findings.
- [Original gameplay reference](original-gameplay-reference.md): attack values, formulas, timing, arena geometry, and source anchors.
- [Remake reference](remake-reference.md), [history](remake-history.md), and [soundtrack reference](soundtrack-reference.md).
- [Historical Trello board](https://trello.com/b/k1ksGI7c/super-tic-figher-remake).

This plan governs the new game. Historical documents describe evidence and intentions; they are not instructions to execute every old wishlist item. Trello's “Done” labels do not establish that a feature works in the final Unity snapshot.

The old Windows executable and Unity build have not been played on this Mac. Source-derived behaviour is the starting point; browser playtests establish the resulting feel.

## 2. Gameplay, content, and player experience

### Classic combat and deliberate corrections

Preserve the original movement scale and core rules:

- 1366 × 768 canonical arena coordinates, with a simulation independent of display resolution.
- Horizontal acceleration 3000 units/s², nominal run speed 600 units/s, jump velocity −1000 units/s, gravity 3000 units/s², and ordinary falling speed capped at 600 units/s. Preserve the separate launch velocities of attacks and the original 0.9-second jump cooldown.
- One jump, airborne steering, grounded attack initiation, crouching, uppercuts, sliding sweeps, and held directional guard.
- One-way platforms, no player body separation, no side/top blast zones, and a fixed bottom death threshold at Y = 1200.
- Damage increases knockback and caps at 200%. Attack launch formulas use the victim's percentage before the hit.
- Guard blocks ordinary frontal punches only. Specials, combos, uppercuts, and sweeps retain their original bypass behaviour. Explain this explicitly in the move guide.
- Preserve the original action-bound effects, projectile disappearance/persistence rules, delayed selection-box hit, rectangular hit regions, and hit-reaction protection from the gameplay reference.

| Discipline | Special | Combo |
|---|---|---|
| Redes | Extending/retracting UTP cable | Cables rising from a platform |
| Diseño | Fast mouse-pointer projectile | Delayed selection-box attack |
| Programación | Green code projectile | Rising code column |
| Hardware | Growing RAM obstacle | Spinning disc projectile |

Every discipline also has punch, uppercut, sweep, and guard. The shared mechanics and eight discipline attacks must all work locally and online.

Translate the observed 40-step/s combat cadence into explicit durations instead of executing the old counters at 60 Hz. Specials/combos retain approximately 0.20 seconds of preparation and 0.40 seconds of active time. Recovery remains punch 0.3 seconds, uppercut 0.7 seconds, special/sweep 0.8 seconds, and combo 1 second. Use the source reference for individual animation holds and delayed hit windows.

Correct accidental behaviours: frame-dependent clocks, life-count ambiguity, stale effects, incomplete resets, speed-limit overshoot, platform tunnelling, inactive-slot victory comparisons, recovery bypasses, and direction-dependent Hardware disc damage. The disc deals 6% in both directions. Resolve same-tick combat from a consistent pre-resolution state so trades are possible without dependence on network arrival order.

Keep logical standing/crouching/sweeping hit regions separate from normalized sprite canvas sizes. Preserve foot anchors during stance changes. Use swept platform landing checks so fast launches cannot tunnel through platforms.

Support both the original direction → crouch → standing special sequence and a dedicated combo button. The sequence has a 500 ms window; both entry methods obey recovery. Add a 100 ms action buffer, clear stale buffered actions on interruption/respawn, and consume a recognized combo sequence once.

Respawns use authored safe positions over platforms, reset all movement/action/effect/input-history state, and grant one second of clearly indicated protection. Attacking cancels that protection.

### Match configuration and outcomes

| Setting | Initial preset | Choices |
|---|---|---|
| Mode | Free-for-all | Free-for-all or 2v2 |
| Lives | 3 | 1–9 |
| Time limit | 5 minutes | 1, 2, 3, 5, 10, 15 minutes, or unlimited |
| Arena | Clásico | All three arenas |
| Friendly fire | Off | On/off in teams |
| Camera | Adaptive | Adaptive or fixed |

Remember the last settings locally. Online match settings belong to the room host; camera, language, sound, and device settings belong to each browser. Configuration changes after players ready up clear readiness. Lock the roster and rules for the duration of a round.

Three lives means three total attempts: 3 → 2 → 1 → 0 eliminated. Last surviving fighter/team wins. At timeout, FFA compares remaining lives; teams compare their combined remaining lives. Equal totals draw, with no damage tiebreak or sudden death. Simultaneous final eliminations also draw.

Teams require two occupied seats per side; seats can be human or bot. Lives are individual, with no shared pool or life lending. Friendly-fire-off attacks pass through teammates without being consumed. Show persistent team symbols/outlines independently of clothing colour.

### Three distinct arenas

Use the same physics scale, static one-way surfaces, and bottom death threshold in every arena. New maps must be traversable with the Classic single jump.

| Arena | Environment and artwork | Gameplay layout |
|---|---|---|
| Clásico | Original industrial skyline and steel girders | Original six-platform arrangement, preserved exactly |
| Laboratorio TIC | A computer classroom with desks, monitors, cables, and substantial new scenery/platform art | Symmetric central lower platform, two elevated flanks, and an upper centre, suited to teams |
| Dentro de la PC | Oversized chips, circuit boards, connectors, and cooling equipment, with substantial new scenery/platform art | Alternating centre and paired side platforms, emphasizing vertical positioning |

Following the owner’s decision to skip image generation, new environments use code-authored browser scenery and matching platform trim alongside the supplied retro artwork. Preserve the existing fighter artwork. Give each environment a distinct palette and silhouette; reduce background contrast behind the combat plane and ensure platform edges are unmistakable. Fans, monitors, and lights may animate cosmetically. Platforms do not move, and scenery does not damage or push fighters in this release.

Initial collision rectangles for the new layouts use the existing coordinate scale and 50-unit platform thickness:

- Laboratorio TIC: (283,600,800,50), (133,450,250,50), (983,450,250,50), (433,300,500,50).
- Dentro de la PC: (433,650,500,50), (183,500,250,50), (933,500,250,50), (433,350,500,50), (183,200,250,50), (933,200,250,50).

These are the initial gameplay layouts. Normal playtest tuning may adjust geometry without changing the approved themes or adding mechanics. Each map includes safe initial/respawn anchors, a preview, and bot navigation connections. Spawn selection keeps fighters above supporting platforms and separates opponents; team starts distribute teammates coherently.

Adaptive framing follows living fighters with bounded zoom, padding, and smooth movement. Projectiles and eliminated fighters do not affect framing. Keep useful landing space visible; use offscreen indicators at camera limits. Fixed view and reduced-motion options remain available. Render the HUD independently of the world camera.

### Original asset import and soundtrack

Use the Drive “Sprites Sin editar” normalized layers as the fighter baseline. Import the complete original discipline effects, portraits, platforms, and relevant remake branding. Pack lossless atlases with per-frame origins and a provenance manifest containing source paths/hashes and deliberate corrections.

Apply the verified Trello fixes:

- Recolour Golpe1_Pelo0 using the neighbouring hair-0 palette, preserving mask and alpha.
- Shift the nine Redes1 hair/shirt/trouser overlays left one pixel.
- Keep coherent normalized crouch, guard, and jump layers. The old Trello request does not define a complete replacement drawing; avoid mixing incompatible edited bodies and overlays.
- Exclude the solid-black placeholder, preserve intentional black selection-box pixels, and preserve translucent edges.

Adapt the remake's blue/white/pink identity to “New Super TIC Fighter.” Use arcade headings with readable supporting text and Spanish-character coverage. Compose animated HUD portraits from each selected appearance with stable framing and restrained hit/elimination states.

Preserve the original eight music recordings, the remake's sixteen-track collection, menu intro, and eighteen gameplay sound effects. Default to the Remake playlist; offer Original and Remake selection and shuffle without immediate repeats. Keep neutral labels where source filenames cannot be reliably matched to song titles.

Owner update, 2026-10-11: add Facundo Pereyra's 8-bit “La leyenda del Hada y el Mago” recording to the Remake playlist (seventeen tracks total). Always use the owner-confirmed Danger Zone recording, Original 04, for the title screen and menus, independently of the selected match playlist. Preserve the historical intro asset.

Use HTML audio for music and Web Audio for short effects. Load the selected music track on demand, never decode/preload the entire archive, and load short effects separately. Provide independent volume/mute controls and clear browser audio-unlock handling. A gamepad-first session can continue silently until a trusted browser gesture enables audio.

Deploy selected runtime media and new artwork; retain the larger design/archive materials as references outside the game bundle.

### React interface and controls

The primary journey is intro → title → Local / Online / Practice → player setup → match → results → rematch/lobby. The owner requested a separate intro on 11 October 2026 while preserving the existing title-screen layout. The intro uses the refined Overdrive logo, original fighters and a continue prompt; room invitation links bypass it.

The owner-selected refined Overdrive identity is also integrated in the title artwork slot, responsive header, browser/touch icons, share preview and repository banner. The title menu, fighter group and tagline retain their existing placement. The NES black-box artwork remains a separate concept study.

Player setup covers seat/device assignment, names, appearance, discipline, teams, bots, arena/rules, and readiness. Online setup adds room creation, shareable link/code, route, measured ping, reconnection status, and actionable errors. Every menu supports keyboard, pointer, and controller navigation.

Keep the four original keyboard presets and provide remapping with conflict detection. Add dedicated combo defaults V, L, K, and Numpad 0 for keyboard players 1–4 respectively. Escape opens pause. Disable gameplay capture while a text field is focused and release held inputs on focus loss.

| Standard gamepad control | Action |
|---|---|
| Left stick / D-pad | Horizontal movement; down crouches |
| Bottom face button | Jump / menu confirm |
| Left face button | Punch |
| Right face button | Special / menu back |
| Top face button | Combo |
| Right bumper | Guard |
| Start / Options | Pause |

Crouch+punch gives uppercut; crouch+special gives sweep. Provide button remapping, stick dead zones, repeat-safe menu navigation, and device-specific prompts where identifiable. Devices explicitly claim seats; reconnecting controllers require a safe reclaim flow and cannot silently take another player's slot.

Standard Xbox and PlayStation controllers are the launch baseline on desktop browsers. Generic mappings use remapping; compatibility claims must name the hardware/browser/OS actually verified.

Anyone can pause a local or online match. The online host controls resume with a three-second countdown. Pause freezes simulation and match time while room connections remain alive. Eliminated fighters remain visible in the HUD and watch until results.

### Bots and practice

Human and bot seats share the four-fighter limit and the same combat rules. The host selects optional bots before a round in local or online play, including 2v2. Do not automatically replace a disconnected human with a bot mid-round.

Easy and Normal use the same navigation/action logic with different reaction delays and mistake rates. Start with approximately 400 ms and 200 ms decision/reaction delays respectively; tune through complete matches. Normal navigates competently and can use every move. Neither difficulty gets damage, movement, recovery, or information advantages.

Use authored platform navigation connections and legal jump trajectories. Bots observe delayed public match state, select reachable opponents, recover toward safe platforms, and produce the same input actions as human players. They do not read pending opponent inputs.

Practice launches one human against a selectable bot, with an optional stationary training opponent, selectable disciplines/arena, and quick reset. Practice has unlimited respawns and no match timer.

## 3. Application stack and architecture

| Layer | Selected technology | Responsibility |
|---|---|---|
| Interface | React + TypeScript | Menus, lobby, customization, setup, HUD, results, settings |
| Styling | Tailwind CSS | STF typography/colour tokens, layouts, responsive sizing, focus states, transitions |
| Game view | Phaser 4.2.1 | Sprites, animation, arena, camera, particles, effects |
| Rules | Framework-independent TypeScript | Movement, collisions, combat, bots, lives, teams, outcomes |
| Simulation execution | Dedicated Web Worker | Fixed-step updates separated from rendering/menu work |
| Networking | WebRTC and WebSockets | Direct gameplay, room coordination, relay fallback |
| Backend | Cloudflare Workers + SQLite Durable Objects | Rooms, signaling, relay, reconnect metadata |
| Assets | Workers Static Assets | Application bundle, sprites, backgrounds, audio |
| Tooling | Vite, pnpm, GitHub | Development, builds, locked dependencies, PRs, deployment |

Pin compatible stable dependency versions and commit the lockfile when implementation begins. Use the official Phaser React/TypeScript integration pattern as a reference, with explicit lifecycle cleanup. Tailwind defines the game's own design tokens rather than importing a generic dashboard appearance.

### Ownership boundaries

- The simulation owns authoritative match state and runs fixed 60 Hz steps while the host is healthy. Rendering cadence never advances game rules.
- Phaser renders/interpolates snapshots. It does not own collision or authoritative physics.
- React owns UI state and sends typed commands such as change discipline, ready, start, pause, and rematch.
- Publish only UI-relevant changes to React: roster, damage, lives, clock display, connection status, and match phase. Do not put fighter transforms or the per-frame simulation loop in React state.
- A small typed event/command bridge connects React, the game view, the worker, and transport. There is one game instance per mounted session and explicit cleanup for listeners, workers, and connections.
- Input adapters convert keyboard/gamepad states into common per-seat actions. Local, remote, and bot inputs reach the same rules implementation.
- Rendering/audio react to confirmed event identities so correction or resynchronization cannot duplicate effects.
- No runtime account system, Access database migration, cloud statistics, or user-profile backend. Save browser preferences locally.

Keep connection establishment on the browser main thread and bridge packets to the simulation worker. Do not depend on transferring RTCDataChannel to a worker for cross-browser correctness. A worker reduces interference but does not turn a browser into an always-on game server.

Shared interfaces cover MatchConfig, PlayerSeat, InputFrame, MatchSnapshot, GameplayEvent, and TransportStatus. Include protocol/content versions and match identities so old packets and incompatible clients cannot enter a current round. Arena, attack, animation, and localization definitions remain data-driven.

The same simulation handles couch play, practice, and online authority. No Phaser-specific objects are stored in shared match state, preserving the option to host it on a dedicated server later.

## 4. Online architecture and free hosting

### Authority and responsiveness

The room creator initially hosts the authoritative simulation. Guests submit inputs for their assigned seats; the host decides hits, damage, lives, and outcomes. One browser may own multiple seats, enabling 2+2 and 2+1+1 groups.

Use direct WebRTC first. Cloudflare coordinates signaling and relays gameplay over WebSockets when direct connectivity fails. The host remains authoritative through either route. Select transport per peer; one relay-dependent guest does not force every connection onto relay.

- Sample inputs at 60 Hz and batch them at 30 Hz, retaining recent input redundancy.
- Send authoritative snapshots at 20 Hz. Include sequence/acknowledgement information and ignore obsolete state.
- Immediately predict local movement and attack startup/animation. Damage, knockback outcomes, lives, and victory are confirmed by the host.
- Reconcile the local prediction and interpolate remote fighters. Bound correction history and transport queues.
- Use reliable delivery for match/control messages and freshness-oriented delivery for gameplay updates. Relay backpressure drops superseded application updates and triggers resynchronization when necessary.
- Send one aggregated host snapshot message per relay tick for server fan-out, avoiding redundant incoming relay messages per guest.

No full rollback netcode or seamless in-match host migration in the first release. Host advantage, delayed hit confirmation, and occasional corrections are accepted tradeoffs for the selected architecture. Tune packet cadence based on complete-session measurements.

### Room service and lifecycle

Provide room creation, a room WebSocket endpoint, and a health/version endpoint. One Durable Object manages each room's membership, configuration, transport signaling, and relay.

Use unpredictable room codes, separate host/reconnect credentials, runtime message validation, seat ownership checks, message-size/rate limits, and origin checks. Guests cannot submit authoritative positions, damage, or results. Avoid logging credentials or raw connection candidates.

Room messages cover joining, assigning seats, customization, teams/bots, readiness, settings, signaling, start, pause/resume, relaying, results, and rematch. Store minimal membership/settings/reconnect metadata in SQLite; do not persist every gameplay packet or simulation frame.

Start only after every human browser has matching versions, required assets loaded, and a usable route. Attempt direct connection for up to five seconds before falling back to relay. Show the route and measured quality, with a forced-relay troubleshooting option.

Warn about poor connections and let friends decide whether to play; do not reject an otherwise functional match solely for high latency. Reject incompatible versions, invalid rosters, or missing required content with actionable messages.

### Pausing, reconnecting, and departing

- A hidden/minimized host tab immediately pauses everyone and displays the reason. After recovery, the host resumes with a three-second countdown.
- Guest focus loss releases held input. Controller loss releases input and requests the shared pause/reclaim flow.
- Freeze simulation/time on a confirmed connection interruption. Reserve affected guest seats for 15 seconds while trying transport recovery; restore from a full authoritative snapshot.
- After unrecoverable guest departure, forfeit that browser's human seats. The host can resume the valid remaining match or end the session; no automatic bot substitution.
- On host silence, allow up to 15 seconds for the same live host to recover. Host refresh/crash may destroy its match state; returning connectivity alone does not reconstruct that state.
- If the host cannot recover authoritative state, end the round without declaring a winner. Remaining members return to the lobby and can choose a host for a new round; this does not continue the interrupted match.
- Never simulate an accumulated catch-up burst after suspension, sleep, or reconnection.
- Already functioning direct gameplay can continue through a signaling-only outage. Relay interruption pauses affected matches.
- New participants join between rounds; credentialed reconnects can return during a round.
- Expire empty rooms after 15 minutes and clear their persistent metadata.

### Staying within free hosting

Deploy to Cloudflare Workers Free with SQLite Durable Objects and a free workers.dev address. Do not activate paid compute, storage, TURN, or a purchased domain.

Use asset-first routing so application/media delivery does not depend on room/API quota. Scope Worker execution to backend routes. Use hibernatable WebSockets, return from handlers promptly, and avoid server-side simulation intervals or pending work that prevents hibernation. Use alarms only for bounded cleanup/recovery bookkeeping.

Use the public stun:stun.cloudflare.com:3478 endpoint for direct connectivity. Relay is the application's WebSocket fallback.

Current provider limits include 20,000 static assets/version and 25 MiB/file; the supplied selected media fits. Static delivery is free. Free Durable Objects allow 100,000 request units/day and 13,000 GB-s/day, with incoming WebSocket messages metered at 20:1. Quota exhaustion fails operations rather than enabling paid overages.

A fully relayed four-browser room at the initial packet rates would consume roughly 19,800 request units/hour before other activity. This is a planning estimate, not guaranteed capacity. Measure actual deployed use and keep the UI honest about free-service limits.

Cloudflare currently places South America-hinted Durable Objects in Eastern North America. Direct WebRTC avoids that relay detour when peers can connect. Do not promise uniformly low latency for Argentina.

Couch/practice do not require the room backend. A backend failure must leave those modes usable. Check deployed music range/seek support; retain complete-file playback fallback and lazy loading.

The identified external deployment dependency is a Cloudflare Free account and deployment authorization. No credit card is required by the chosen plan. Report any account/authorization step needing owner interaction when the deployable build exists.

## 5. Implementation milestones and Git workflow

| Milestone | Work | Completion gate |
|---|---|---|
| 1. Repository and foundation | Private repo, specification/decision log, TypeScript/Vite/React/Tailwind shell, Phaser/worker bridge, commands, CI, asset manifest | Reproducible local production build, navigable shell, documented boundaries |
| 2. Early end-to-end slice | Original fighters/stage, movement and one attack, local seats, deployed room service, direct/forced-relay paths, audio proof | Real browsers can join the deployed slice; mixed seats and failure handling are exercised early |
| 3. Complete Classic combat | All disciplines/shared attacks, timing, collision, lives, teams, safe respawns, outcomes, original asset fixes | Full local matches reflect the source-derived reference and finish correctly |
| 4. Complete player experience | React flows, customization, gamepads, localization, settings, HUD, audio, practice, bot seats/difficulty, pause/rematch | A player can set up and finish local FFA/2v2/practice entirely through supported controls |
| 5. New environments | Complete Laboratorio TIC and Dentro de la PC scenery/platforms, layouts, previews, spawn/navigation data, camera polish | Both environments are visually distinct, readable, traversable, and usable by bots |
| 6. Complete online game | All combat/modes/content synchronized, readiness/version checks, prediction, relay recovery, departures, quota UX | Mixed four-seat sessions complete reliably over direct and relay routes |
| 7. Release validation | Browser/device/network matrix, production media checks, performance/memory, friend playtest, fixes, deployment guide | Technical gates and real play session pass; tag and deliver the first release |

Keep the networking slice early so free hosting and browser lifecycle behaviour are proven before extensive content polish. UI/assets and simulation/room work can proceed in parallel after interfaces are established.

Use focused branches and PRs. Subagents may own bounded work in isolated checkouts, with explicit shared interfaces and no simultaneous edits to the same subsystem. Review integration and user-visible behaviour before merging. Attach created PRs to the task. Use meaningful conventional commit subjects and coherent squash commits where appropriate.

GitHub CI runs type checks, production builds, and whole-application/service checks within available free runner allowances. Do not enable paid runner use. Run required checks locally if hosted free allowance is unavailable and record that evidence.

Commit selected runtime assets, conversion/import tooling, source hashes/credits, and new artwork provenance. Exclude source executables, caches, duplicate archive trees, secrets, and the unrelated profile database.

Preserve historical source folders. Normal tuning needed to meet this specification is part of implementation; scope changes such as moving hazards, different environments, or a new networking authority model require a revised decision.

## 6. Verification, release acceptance, and later roadmap

**No unit tests will be written or run.** Do not rename isolated simulation/function tests as integration tests. Use real application flows and full-service sessions, supported by type/build checks and focused static validation of imported content.

| Area | Required coverage |
|---|---|
| Combat fidelity | Every move/discipline in both directions; guard exceptions; preparation/recovery; interruption; input sequence and shortcut; cap; projectile rules; same-tick trades |
| Match outcomes | Every lives/time setting; real-time clock; respawns; elimination; simultaneous final falls; timeout ties; FFA/2v2; friendly fire; pause and rematch |
| Arenas/art | All appearance combinations across animation poses; Trello fixes; alpha/black pixels; safe spawns; reachable platforms; readable art; fixed/adaptive views; offscreen indicators |
| Bots | Easy/Normal, every discipline, all three arenas, FFA/teams, mixed human/bot rosters, no teammate targeting with friendly fire off, legal movement |
| Controls | Original keyboard presets, remapping/conflicts, keyboard+controller, multiple controllers, all menus, text focus, unplug/reclaim, held-input release |
| Online | Two/three/four human seats, four-browser sessions where available, 2+2 and 2+1+1, mixed bots, direct/relay/mixed routes, actual ICE failure, full rooms, version mismatch |
| Network/lifecycle | Latency, jitter/loss, Wi-Fi loss, signaling outage, relay outage, guest refresh, host refresh/crash, sleep/wake, host tab hidden/minimized, reconnection and forfeit |
| UI/audio | Spanish/English and accents, fullscreen/resizing, readiness, connection warnings/errors, sound unlock, mute/volume, playlist shuffle, seeking/restart/looping |
| Service limits | Quota/error responses and room cleanup; couch/practice and static media still work when backend routes fail |
| Performance | Smooth four-fighter matches, bounded queues/history/memory, repeated rematches, lazy music loading, no large resume catch-up bursts |

Use Arc for hands-on browser work. Isolated automated runs cover Chromium, Firefox, and WebKit; manually exercise actual Safari as well as Arc where available. Automated WebKit alone does not establish Safari/controller compatibility.

Validate Xbox and PlayStation hardware on the actual available browser/OS combinations. Emulated controller input does not count as a physical controller check. Record missing hardware/device coverage explicitly.

Exercise production builds with DevTools closed, including muted audio, the host hidden for more than six minutes, direct and forced relay, guest focus loss while holding inputs, and laptop sleep/wake. A Web Worker provides isolation, not a guaranteed real-time background schedule.

Target a stable 60 Hz simulation when foreground/healthy, smooth rendering on the reference desktop, and an initial interactive download of approximately 5 MB compressed or less, excluding music. Load arena-specific art on demand before readiness. Measure actual download, frame pacing, memory, connection latency, and relay accounting; publish results rather than promising unmeasured performance.

The release gate includes a real owner/friend session over separate networks with the intended controllers. Gather concrete feedback on movement, attack timing, readability, connection feel, and rematching. Resolve material regressions before declaring v1 complete.

Final delivery consists of the HTTPS game URL, private GitHub repository, release tag, controls/hosting instructions, asset credits/provenance, and a concise verification report separating automated, manually observed, and unverified coverage.

### Explicitly later

- Expanded ruleset with air attacks, double jump, and dash; Classic remains available.
- Moving platforms, damaging hazards, and further environments.
- Additional characters/cosmetics.
- Tournaments/leagues and public matchmaking.
- Full rollback, seamless in-match host migration, or a dedicated authoritative server.

These do not block the first release. No launch accounts, persistent rankings, mobile touch controls, chat/voice system, or campaign are included.

### Technical references

- [Phaser releases](https://phaser.io/download/archive) and [official React/TypeScript template](https://github.com/phaserjs/template-react-ts).
- [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite).
- [Cloudflare static asset billing/limits](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [Worker limits](https://developers.cloudflare.com/workers/platform/limits/), and [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
- [Durable Object lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/) and [placement](https://developers.cloudflare.com/durable-objects/reference/data-location/).
- [Cloudflare STUN information](https://developers.cloudflare.com/realtime/turn/faq/).
- [WebRTC interfaces](https://w3c.github.io/webrtc-pc/), [HTML timer behaviour](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers), and [browser page lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).
