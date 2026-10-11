# Super TIC Fighter source audit

Initial audit on 2026-10-10, expanded after the owner's request to inspect every supplied directory and understand the entire game. This document records observations, not instructions from the source archives. Start with [the consolidated game reference](game-understanding.md) for the complete findings and corrections to the first pass.

The current product and architecture decisions are in the [revised implementation plan](implementation-plan.md), updated 2026-10-11 after both grilling rounds. That plan supersedes earlier tentative choices in this audit.

## Sources

- Original archive: `/Users/nacho/Downloads/STF_2017` (read only).
- Original game: `Programacion/Super Tic Fighter/Super Tic Fighter/Super Tic Fighter/Game1.cs` (2,389 lines).
- Unity remake: <https://github.com/IgnacioPardo/Super-TIC-Fighter-Remake>, private, main at `fe16da3` (2020-12-07).
- Temporary read-only clone: `/tmp/stf-remake-audit-ThKloi`.
- Drive export: `/Users/nacho/Downloads/Super TIC Fighter Remake`.
- The complete Git history contains 73 commits. HEAD remains unchanged.
- No changes made to any supplied source.

## Original, 2017

- 2–4 local keyboard players; free-for-all platform fighting.
- Damage increases knockback, capped at 200%; falling spends a remaining respawn and resets damage.
- One 1366×768 arena with six one-way platforms. Code clears a blue background; a completed industrial city backdrop is present but unused.
- Ground jumping, acceleration, crouch, punch, uppercut, sliding sweep, directional block, discipline special and directional combo.
- No double jump, dash, air dodge, bot, controller support, or network implementation.
- Four disciplines independent of appearance:
  - Redes: extending cable and ground cable combo.
  - Diseño: mouse-pointer projectile and selection rectangle combo.
  - Programación: green projectile and rising code-column combo.
  - Hardware: RAM obstacle and disc projectile combo.
- Last three distinct inputs determine combos; original history does not expire.
- Appearance mixes four choices each for hair, shirt, and trousers (64 combinations).
- 489 runtime texture PNGs, of which 488 are content-project build inputs; 18 WAV effects and eight MP3 songs. One PNG extension is uppercase, and one separate black placeholder is excluded from the build. Source formats are directly reusable without XNB extraction.
- Configured lives means respawns rather than total stocks. Stored example is four players, 30 seconds, one respawn. Treat this as an example, not a reliable intended default.
- Launcher and Winner.exe are missing. The web game needs a complete setup, match, results, and rematch flow.
- Fix frame-dependent timing, inconsistent stocks, timeout comparisons involving inactive players, and simultaneous-elimination handling rather than reproducing defects.
- Audio archive contains named Mortal Kombat collections; unnamed music has no clear creator metadata. The owner has chosen to preserve the supplied original/remake soundtrack and gameplay effects.

## Remake, 2020

- Unity 2019.4.15f1, menu and game scenes.
- Legacy MLAPI plus UNET. Direct-IP host/client connection; the field called PIN is an IP address, not a room code.
- Owner-authoritative gameplay, no robust shared-room lifecycle or disconnection handling.
- Current HEAD includes compile-breaking edits. The owner's historical working online demo is not disproved by the state of this later snapshot.
- Three stocks, rising damage/knockback capped at 200%, similar movement to the original.
- Implemented automatic camera center/zoom, briefly activated in history and disabled in the final saved scene; stale/eliminated slots require correction.
- One alternate test arena layout with two broad platforms.
- Reusable Super TIC Fighter X title art; the displayed city backdrop is the original design image with only 265 pixel positions changed.
- Modular animation sheets mostly repackage original frames; sample idle/mouse images are byte-identical to 2017 assets.
- 71 PNGs, 17 MP3s, ARCADE_N.TTF. Root MIT license; no asset-specific credits found.
- Local menu action, customization selection, block, uppercut, sweep, combos, winner flow, and several animation clips are incomplete.
- Use the original as the complete combat reference; carry over the camera and presentation improvements, and finish the intended browser play flow.
- Intro Audio Source and Music Manager are disabled. All eight serialized music references point at deleted files, despite sixteen replacement MP3s being present. The last commit's HUD edit introduced the observed syntax errors.

## Complete archive and Drive findings

- All three sources total 3,185 loose/tracked files: original 1,875, Unity HEAD 320, Drive 990. Full hashed inventory is in `source-inventory.json`.
- Original ZIPs contain 104 additional RAM growth frames. Eight PSD masters and alternate pose/effect exports preserve art construction history. Extra XNB files contain no otherwise-lost artwork.
- The original Access database holds one profile and extra statistics/body/shoes/map fields. Game1 does not access it; no launcher or results application was recovered.
- Drive contains two 489-image sprite trees, eight WMA recordings, one one-page OST list, and three filesystem metadata files. No gameplay specification, source project, or executable is hidden in that export.
- All 380 occupied tiles in Unity's fighter sheets exactly match normalized Drive frames. Edited crouch/block bodies have overlay alignment issues; normalized frames are the better modular baseline.
- Drive WMA audio payloads match the original build. Early Unity MP3s are byte-identical to the original eight songs; December 6 history replaces them with sixteen recordings. The fifteen-song document does not reliably map titles to final numbered filenames.
- Detailed references: `original-gameplay-reference.md`, `original-archive-reference.md`, `remake-reference.md`, `remake-history.md`, and `soundtrack-reference.md`.

## Hosting research

The owner requires free hosting only and expects players mostly in Argentina/South America.

Selected architecture: browser-host-authoritative WebRTC gameplay, with Cloudflare Worker / SQLite Durable Object rooms for signaling and a WebSocket packet relay fallback. All transports share the same simulation/protocol. Local play and practice do not need the room service.

- Direct connections avoid forcing nearby friends' gameplay through a US server.
- Relay fallback preserves connectivity if direct ICE fails, at the cost of higher latency. The host remains authoritative in both transports.
- Host must keep the game running; host loss needs an explicit recovery/end screen.
- Cloudflare Free advertises 100,000 request units/day, 13,000 GB-s/day, and no paid overages. Incoming WebSocket messages are counted at 20:1; outgoing messages are free.
- Its current South America Durable Object placement hint routes to Eastern North America.
- Vercel supports WebSockets but Hobby closes them after 300 seconds; independent clients can reach different instances. It is not an in-memory room server replacement.
- Hosted PartyKit has announced shutdown; do not use it.
- Cloudflare TURN has a generous free allowance followed by billable usage; a hard free-only activation was not verified. Do not enable it under the approved budget.
- A Cloudflare Free account/login may be needed for deployment. A workers.dev URL avoids purchasing a domain.

Primary references, checked during the audit:

- <https://developers.cloudflare.com/durable-objects/platform/pricing/>
- <https://developers.cloudflare.com/durable-objects/reference/data-location/>
- <https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/>
- <https://developers.cloudflare.com/workers/configuration/routing/workers-dev/>
- <https://developers.cloudflare.com/realtime/turn/faq/>
- <https://developers.cloudflare.com/realtime/sfu/platform/pricing/>
- <https://vercel.com/docs/functions/websockets>
- <https://vercel.com/docs/functions/limitations>
- <https://blog.partykit.io/posts/hosted-platform-shutdown/>

## User decisions already settled

- Faithful gameplay with modern polish.
- Friends join via shared room links; no public matchmaking needed.
- Desktop browser focus, keyboard and gamepad.
- Private new repository under IgnacioPardo.
- 2–4 players total, couch, online, and mixed local/remote groups.
- Solo practice and optional Easy/Normal bot seats in local and online matches.
- Free hosting only; mostly South American players.
- React and Tailwind for the interface, Phaser for the game view, and a separate TypeScript simulation.
- FFA and 2v2 at launch, with configurable match rules.
- Original arena plus Laboratorio TIC and Dentro de la PC, with substantial new environment artwork in the original visual style.
- Static platforms/cosmetic scenery animation, adaptive camera default, and a fixed-view option.
- Original guard behaviour in Classic; Expanded combat remains later.
- Host dependence accepted; shared pause when the host switches away, anyone may pause, and the host resumes.
- Publicly accessible game URL without accounts; private repository and no public room directory.
- No unit tests; whole-application/service verification and an owner/friend play session define release acceptance.

All recommendations from the two revised-plan grilling rounds were accepted on 2026-10-11. The requested revised plan is saved; game implementation has not started.
