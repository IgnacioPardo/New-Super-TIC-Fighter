# Verification record

No unit tests are part of this project. Verification uses the complete application, actual browser workers, running Cloudflare room service, browser transports, visual review, builds, and type checks.

## Completed during implementation

- Imported fighter layers, original effects, original and remake music collections, and eighteen sound effects with file hashes and source corrections.
- Simulation implementation passes TypeScript checking. Source review checked combat timing, attack values, guard direction, hit protection, platform geometry, effect dimensions, and stock outcomes.
- Room service exercised through real WebSockets in local Wrangler: 2+2 seat ownership, relay authority, reconnect/resume, result and rematch.
- Chromium with real RTCDataChannels exercised direct inputs/snapshots and forced relay fallback.
- Two complete browser applications entered a real online match; guest movement reached host authority, and repeated shared pause/resume worked.
- Chromium, Firefox, and WebKit displayed a live Phaser canvas and ran the real simulation worker. Injected gamepad movement, pause, frozen match time, same-device reclaim, and refusal to reclaim a different controller ID passed. This is API-level coverage, not a physical-controller certification.
- A real same-tab guest navigation away from a 2+2 match paused the round. Rejoining with the original session credentials restored the paused match screen, retained the same peer identity, and allowed the host to resume both clients.
- Complete match playtests exercised all four disciplines, the eleven attacks and guard, the original combo sequence and dedicated combo, action buffering, one-minute timeout draw, fresh-match rematch reset, and a four-bot team result. Bot traversal is still being tuned across the arenas.
- All three arena scenes rendered from the imported classic artwork and the two code-authored SVG environments. Image API generation was canceled by the owner; no image API requests were made.

## Still to verify before release

- Recheck integrated setup, controls, language, and all key flows after the game-menu/HUD redesign.
- All three environments and bot traversal in complete matches.
- Multiple complete browser clients: direct and relay, 2+2 and 2+1+1, bot seats, ready/config invalidation, pause/resume, guest/host interruption, fresh-round recovery.
- Cross-browser and actual Arc hands-on review; actual controller hardware claims only after testing named devices.
- Public HTTPS deployment and a real session involving the owner and friends, including Argentina-network latency observations.

Each completion below should name what ran and its limits; headless or injected gamepad checks do not establish physical-controller compatibility.
