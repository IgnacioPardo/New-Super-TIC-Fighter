# Combat art and screen corrections — 2026-10-11

The reported issues were visible placeholder rectangles/name labels for expanded abilities and pickups, and a fighter preview deliberately hidden when its inline editor opened. The subsequent screen review also found covered tournament controls, narrow-screen coordinator controls behind Ready, an oversized nested pause panel, and undersized scoreboard rows.

## Presentation changes

- Twenty hand-authored, pixel-aligned SVG sprites replace generic expanded combat shapes. Pickups have distinct silhouettes: USB drive, cooling fan, firewall shield, battery and overclock chip. Deployables depict an ESP32 board, Arduino board, Raspberry Pi hub, drone, bounce pad and printed block; mechanical, wireless, arcade and piston attacks receive their own art.
- Pickups, deployables and AI echoes no longer have floating names/countdowns. Expiring objects fade; damaged deployables show health. Small ownership accents remain. Active pickup effects use HUD icons with shrinking duration bars and accessible names.
- VR decoys use the owner's actual layered fighter art, tinted and translucent. AI echoes preserve their authored attack pose. Original classic sprites remain unchanged. This is a presentation change; combat authority, hitboxes, lifetimes and balance are unchanged.
- Customization keeps a full fighter visible beside the identity, updating as appearance options change. Short/narrow screens page the controls. Four controllers retain independent editors; keyboard text input keeps its focus.
- Tournament browsing pages two entries so the invitation form remains visible. Pause and scoreboard presentation are sized for their content. Settings retains its visual style.

Asset provenance is recorded in `asset-provenance.json`; the SVGs are the editable source. No external art pack or raster-image generation was used.

## Observed verification

- Client production build and server type check.
- Six expanded disciplines exercised through actual menu readiness, keyboard input and the simulation worker: IA, Robótica, IoT, Realidad Virtual, Videojuegos and Impresión 3D. Captured grounded attacks/signatures and airborne attacks; no browser errors.
- Browser pickup exercise uses deterministic match seeds with real simulation-owned spawns for all five items. It checks absence of floating object text, loaded assets, keyboard collection of the firewall and a decreasing HUD duration meter. This does not inject gameplay snapshots.
- Spanish/English layout review across 1366×768, 1024×640 and 390×844: solo, guest profile, public lobby, tournament browsing/creation, Settings, Guide, private-room entry and setup. Bounds, clipping, control hit-testing, keyboard reachability and wheel/no-page-scroll checks passed after fixes.
- Four injected controllers: simultaneous editing, visible previews, live hair updates, keyboard coexistence, appearance pages, narrow-screen seat ownership, and an actual eight-fighter Royale HUD. The expanded assertions are part of `scripts/app-v2-roster-pages.mjs`.
- Actual worker pause/resume and last-standing results, including podium/scoreboard, in both languages and multiple viewport sizes. Eight real clients also completed an authoritative local-service Royale: seven UI forfeits, all eight placements, four desktop rows per page and two mobile rows per page.

Local evidence: `tmp/qa/combat-art/`, `tmp/qa/v2-layout/`, `tmp/qa/v2-results/`, and `tmp/qa/screens-review-*.png`. These captures are verification output, not shipped assets.

## Scope of this evidence

This pass uses isolated Playwright browsers and injected controller input; it is not new physical DualSense coverage. Authenticated account states and active tournament brackets were not included in the representative visual review. The previously deferred physical-controller and separate-network Argentina multiplayer checks remain deferred. No unit tests were added or run.
