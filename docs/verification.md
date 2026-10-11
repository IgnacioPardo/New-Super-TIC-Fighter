# Verification record

No unit tests are part of this project. Verification uses the complete application, actual browser workers, running Cloudflare room service, browser transports, visual review, builds, and type checks.

## Completed during implementation

- Imported fighter layers, original effects, original and remake music collections, and eighteen sound effects with file hashes and source corrections.
- Simulation implementation passes TypeScript checking. Source review checked combat timing, attack values, guard direction, hit protection, platform geometry, effect dimensions, and stock outcomes.
- Room service exercised through real WebSockets in local Wrangler: 2+2 seat ownership, relay authority, reconnect/resume, result and rematch.
- Chromium with real RTCDataChannels exercised direct inputs/snapshots and forced relay fallback.

## Still to verify before release

- Integrated application keyboard and emulated gamepad flows, matches, practice, setup, language, customization, pause/results/rematch.
- All three environments and bot traversal in complete matches.
- Multiple complete browser clients: direct and relay, 2+2 and 2+1+1, bot seats, ready/config invalidation, pause/resume, guest/host interruption, fresh-round recovery.
- Cross-browser and actual Arc hands-on review; actual controller hardware claims only after testing named devices.
- Public HTTPS deployment and a real session involving the owner and friends, including Argentina-network latency observations.
- New background generation after the approved API key becomes available.

Each completion below should name what ran and its limits; headless or injected gamepad checks do not establish physical-controller compatibility.
