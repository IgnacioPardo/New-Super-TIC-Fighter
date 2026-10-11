# Menu presentation revision

Recorded 2026-10-11 for the post-v2 menu revision. The owner explicitly retained Settings as the visual reference and requested improvements to the other screens. Settings and its dialogs are excluded from the new menu presentation class. Original artwork and SVG icons are retained. The two display fonts and their bundled license are recorded in asset provenance.

## Observed application checks

- Client TypeScript and production Vite build passed. No unit tests were added.
- `app-v2-title.mjs`: 24 Spanish/English title and Online-hub layouts, including 1366×768, 1024×640, 1440×1000, 390×844, 667×375 and 1280×480. Exactly three title choices, all visible controls within the viewport, no document scrolling from wheel input, and Back restores Online focus.
- An additional rendered-browser review traversed 96 Spanish/English Profile, Solo, public-lobby and tournament page layouts at the four primary desktop/narrow sizes. Visible controls and text stayed in the viewport, with no document overflow or page errors. This includes guest identity/styles/account, challenge selection, public Play/Party/Players and tournament browse/create/rules pages. No competition was created by this layout review.
- `app-reader-pages.mjs` passed in Chromium. Every Settings editor and Guide page stayed reachable; saved preferences, binding-capture cancellation and restored focus were retained. Native Arc separately confirmed the unchanged Settings appearance.
- `app-v2-roster-pages.mjs` exercised four injected controllers editing simultaneously, keyboard text entry retaining focus, all appearance pages, controller-owned narrow paging and an actual eight-fighter worker match with four local HUD panels. A compact-editor overlap exposed during the pass was corrected before the successful rerun.
- `app-menus.mjs` passed with settings navigation, persistence, conflicting bindings, injected gamepad remapping/repeat, modal focus and Tab behavior, four-player team setup/readiness, pause/settings/resume and offline practice.
- Eight Spanish/English fighter-card layouts passed a separate label-fit and portrait-alignment check at the four primary sizes. Portrait space adapts to available card height; readiness and coordinator controls remain outside it.
- `profile-service.mjs` passed against the compiled UI and a disposable real Worker/D1 service: guest and signed-in profile storage, protected verified statistics, sign-out, virtual WebAuthn enrollment/login/removal and OAuth error returns. No browser page errors occurred.

Local reports/screenshots are retained under `tmp/qa/art-direction/`, `tmp/qa/v2-title/`, `tmp/qa/v2-layout/` and `tmp/qa/accounts-art-direction/`. Controller inputs above are injected Gamepad API data, not physical hardware. The account exercise uses a seeded identity and virtual authenticator; actual production provider and physical Touch ID evidence is recorded separately in [account verification](v2-account-verification.md). The owner-deferred v2 DualSense and separate-network Argentina gameplay checks remain open.
