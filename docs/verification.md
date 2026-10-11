# Verification record

Verified on 2026-10-11. No unit tests were written or run. Verification uses the complete application, actual browser workers, the running Cloudflare room service, real browser transports, visual review, production builds, and type checks.

## Completed

- Client and server TypeScript checks, frozen dependency installation, production build, and Cloudflare deployment dry-run pass. GitHub Actions also passed the combined application/browser workflow on the integrated release branch; the final commit is checked again before merge.
- Imported fighter layers, original effects, original and remake music collections, and eighteen sound effects have source provenance and file hashes. Audio loading, playback state, volume persistence, and lazy music requests are exercised; this does not claim a human listening review of every track.
- Complete matches exercised all four disciplines, eleven attacks and guard, the original combo sequence and dedicated combo, action buffering, one-minute timeout draw, fresh-match rematch reset, and a four-bot team result. Detailed combat evidence is in `src/simulation/PLAYTEST.md`.
- Easy and Normal bots traversed all three arenas. Six map/difficulty runs had no observed unforced falls; Normal bots reached the upper PC platforms. This is bounded playtesting, not a guarantee of flawless bot decisions.
- All three arena scenes render. The classic stage uses imported artwork; Lab and PC use code-authored SVG environments and matching platforms. The owner canceled image generation; no image API requests were made.
- The integrated arcade title, fighter selection bays, match HUD, pause, guide, and results were visually reviewed at 1366×768 and 1920×1080. Native Arc hands-on review entered a Lab practice match, exercised keyboard movement/attacks, and paused it.
- Settings and menu flows exercised ES/EN, key-remap conflict rejection and restoration, camera/reduced-motion preferences, persistent volume settings, gamepad menu navigation and escape from text fields. Practice worked with the online API returning an error.
- Chromium, Firefox, and WebKit displayed a live Phaser canvas and ran the real simulation worker. Injected gamepad movement, pause, frozen match time, same-device reclaim, and refusal to reclaim a different controller ID passed. Controller claims are cleared between rounds. These are API-level checks, not physical-controller certification.
- Real RTCDataChannels carried direct inputs/snapshots; forced WebSocket relay also passed. The transport exercise covered room signaling loss while direct channels remained available.
- Five full-application multiplayer scenarios passed together with no uncaught page errors: mixed 2+2 teams with forced relay and same-tab guest reconnect; 2+1+1 with host loss and fresh lobby recovery; two humans plus two bots; host refresh interruption and lobby recovery; and a natural one-stock result followed by guest refresh, exact final scoreboard recovery, rematch, and local keyboard play after leaving online.
- Reconnect verification checked real guest movement and host input acknowledgements after restoring the same peer identity. Result verification checked exact authoritative stocks, damage, winner, and visible scoreboards on both clients.
- Foreground simulation cadence, ten practice resets, and six game-view recreations were measured. A Phaser visibility-listener leak was fixed with a reproducible dependency patch; independent repeated-mount checks stayed at one canvas, three workers, and stable listener counts. Hardware, measurement limits, and initial transfer estimates are in `docs/performance.md`.

- The camera now anchors its framing to the complete arena. All three stages were visually checked at spawn, during an offstage fall, after respawn, and after live resizing at 1366×768, 1440×1000, 1920×1080, and 1680×1050. The canvas remained centered and landing surfaces stayed in view.
- Actual production clients passed the same five online lifecycle scenarios plus an unforced direct WebRTC match. A 370-second shared UI pause retained the exact match/time and resumed through the normal countdown without catch-up. This did not establish a genuinely frozen renderer or hidden tab.

## Production and acceptance gates

### Separate intro, local verification — 11 October 2026

- `pnpm build` and `pnpm e2e:intro` pass. The intro exercises ordinary keys, Enter/Space, click on the background, simultaneous simulated A+Start without a second activation, return via Escape, ES/EN, reduced motion, and room-link bypass/code preservation.
- Visually reviewed at 1440×810, 1366×768, 390×844, 667×375 and 1280×480. The complete intro fits each viewport and the continue prompt remains visible. [Desktop capture](evidence/intro-screen.png).
- Measured the existing title screen before/after the change: poster, menu, fighter group, tagline, hero-logo and overall title bounds were unchanged at 1440×810. Its existing markup, styling and logo were preserved.
- Menu/settings/practice regression, a real two-browser online match with authoritative movement and shared pause/resume, and the Chromium/Firefox/WebKit device flows pass. Controller events were injected; this is not physical-controller certification. No new unit tests were introduced.
- These intro checks ran against the local app. This entry does not claim deployment of the intro.

### Refined logo integration, local verification — 11 October 2026

- Integrated the unchanged Overdrive primary in the title artwork slot, matching the existing intro. Desktop headers use the horizontal signature; headers at 760 px and below use the square icon. Browser/touch icons, share metadata and README banner are updated. The NES composition remains a concept; no menu or fighter layout was replaced.
- Compared title screen, poster, menu, fighter group and tagline bounds before/after at 1440×810, 1920×1080, 390×844 and 667×375: all unchanged within 0.15 CSS px. [Desktop capture](evidence/branding/title-1440.png), [mobile capture](evidence/branding/title-390.png), [measured evidence](evidence/branding/verification.json).
- Production bundle branding checks passed in Chromium, Firefox and WebKit: all seven brand assets return image responses; responsive header sources and aspect ratios are correct; icons are declared; header controls do not overlap; the accessible brand button returns from settings to the title. No uncaught page errors were observed.
- Existing intro, menu/settings and practice flows pass against the local production preview. All three browser engines also passed live canvas/worker rendering, simulated-controller movement, pause and same-device reclaim. Controller input was injected, not physical hardware.
- TypeScript and Vite production build pass. One initial bundle attempt failed to resolve the installed Phaser dependency; the subsequent build succeeded without a source or dependency change. Existing Phaser chunk-size warning remains. The full asset reimport was not run because it requires historical source archives; the standalone brand publisher and its byte-for-byte outputs were verified.
- This integration was verified locally, not deployed. The share image's public URL will become available with deployment; the local asset and metadata were checked.

### Title composition sizing refinement — 11 October 2026

- Enlarged the title logo by 18% on desktop and 12% on mobile; reduced the title fighters by approximately 10%. The intro and gameplay sprite sizes are unchanged.
- Visually reviewed desktop/mobile captures and measured the existing title, poster, menu, fighter platform and tagline at 1440×810, 1920×1080, 390×844 and 667×375: layout anchors remain unchanged. Updated the branding evidence images. Production build passes.

### Soundtrack update, local verification

Soundtrack update, locally verified on 2026-10-11: added the requested Facundo Pereyra 8-bit Rata Blanca track to Remake and assigned owner-confirmed Original 04 (Danger Zone) to title/menu playback. Production build, client/server types, MP3 header validation, all 26 files' Worker HTTP/range checks, and the existing complete settings/menu flow passed. `pnpm e2e:audio-playback` passed in Chromium, Firefox, and WebKit against the local Worker: native audio decoding, title/menu looping, playlist independence, pause/settings/resume, all 17 Remake tracks once per shuffle cycle, natural ended transitions after seeking, no immediate repeat across cycles, and return/reload. A full asset import into a temporary output tree reproduced the runtime manifest and provenance. These are automated playback checks, not a human listening review or a deployment of this update.

### Remaining acceptance gates

- Public HTTPS deployment, production media range/header checks, and full multiplayer verification on the deployed service are recorded separately in `docs/hosting.md` when completed.
- Physical Xbox/PlayStation controllers and native Safari hardware have not been certified. WebKit automation and injected gamepad events do not establish hardware compatibility.
- A real session involving the owner and friends on separate networks remains the acceptance gate, including Argentina/South America latency observations. Same-machine browser clients do not establish those network conditions.
- Long host background/sleep/wake sessions and free-quota exhaustion have not been verified in production. Browser-hosted combat intentionally interrupts when its authority disappears; seamless host migration is outside the accepted scope.
