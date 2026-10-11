# V2 interface verification

Verified on 2026-10-11. These checks exercise complete application flows; no unit tests or fabricated game results were used.

## Actual application and services

- `app-v2-solo.mjs`: the native worker counted three actual keyboard double-jumps and landings in Challenge 1, saved guest challenge progress, and displayed a contained completion dialog. Training recorded a performed input pattern, replayed it, advanced a paused frame and reset damage. Two actual one-stock losses completed a best-of-three at two wins.
- `app-v2-draw.mjs`: a real one-minute neutral Classic stock bout timed out tied. Both win counts stayed zero and the best-of-one replayed; no set winner was invented.
- `app-v2-public.mjs`: independent Chromium browser sessions used the running workerd Lobby/Match services to edit a fighter name, queue a duel, acknowledge every local seat, move a fighter, open a local pause/settings/guide menu while the other browser continued receiving playing ticks, resume, forfeit and receive the authoritative result. The public waiting screen exposes server rules and start ownership, without private invite links or match UUIDs.
- `app-network-lifecycle.mjs`: keyboard 2+2 teams used a forced relay, lost an actual guest WebSocket, reclaimed the same peer and resumed consuming inputs. Keyboard 2+1+1 recovered from host tab loss with an interrupted result and promoted lobby. Two human browsers plus two bots ran over the direct route. Host refresh returned an interrupted round to a playable lobby. Results survived guest refresh, host Next Bout returned to the same room, and controls still worked after leaving for Local. Two browsers entered private Survival together on team A with two bot opponents and the actual first wave.
- `app-v2-royale-hud.mjs`: actual eight-fighter worker matches with one and four local humans retained detailed local resource panels and compact opponent cards. Both desktop HUDs measured 168 px within the renderer's 180 px reservation; 390×844 also had no horizontal overflow. Readable 11 px air-resource labels and filled/hollow availability indicators fit four local panels at 1024×640 in ES and EN.
- The private room lifecycle also verified two rapid shared Lives edits before server acknowledgement: optimistic rule drafts retained the latest value and both browsers received the same acknowledged configuration.
- TypeScript and production Vite builds passed. The existing Phaser chunk remains above Vite's advisory 500 kB threshold.

## Injected devices and browser coverage

- `app-v2-seats.mjs` passed in Chromium, Firefox and WebKit with four injected standard controllers: simultaneous independent inline editors, discipline and appearance changes, native keyboard text entry coexisting with other seat edits, coordinator-only shared navigation, held-input release gating, explicit same-controller reconnect, nested Settings/Guide return with editor state retained, and readiness.
- The same flow checked 1366×768, 1024×640 and 390×844 without horizontal overflow. Names such as `Zoë / 日本語` retained readable text and keyboard focus.
- `app-feedback.mjs` used injected DualSense input with actual Web Audio and worker gameplay. It verified the new title order, visible controller focus, confirmation/back, assignment, movement, pause/settings/resume and audible feedback.

## Final responsive visual pass

- `app-v2-layout.mjs` passed 40 complete screen combinations: Solo, local Profile, connected Public, Tournaments entry and actual eight-fighter Royale, in ES/EN at 1366×768, 1024×640, 1440×1000 and 390×844. It used a production build with isolated local workerd/D1 state; it did not perturb the multiplayer load exercise.
- Every enabled menu control was reached by native Tab and automatically scrolled into view. No page horizontal overflow or clipped feature controls/text remained. Representative screenshots were inspected for each screen, both languages and all viewport classes; narrow Solo titles retain whole words and tournament input rows match the Settings controls.
- Royale remaining-fighter and shrinking-safe-zone information now appears below the match header within the renderer’s top reservation, rather than falling below the full-height stage. It describes the playable zone without exposing world coordinates. Screenshot/report output is under `tmp/qa/v2-layout/`; the ES/EN four-local 1024 px HUD images are `tmp/qa/v2-royale-{es,en}-4-local-1024.png`.

## Visible Training tools follow-up

- `app-v2-training.mjs` verified ES/EN against the actual local worker: collapsed live tools fit above the arena, expanded toolbar and input history are visible, the selected dummy receives 100% damage, and recorded injected stick movement appears in the history. At 1024×640 and 390×844 the overlay, Apply action and history remain within viewport and panel bounds.
- Injected controller Start opened the real pause dialog; D-pad selected the human target and 100% preset, A applied damage, and subsequent navigation reached frame advance and stepped the paused worker. The dummy remained at 0%, confirming seat targeting. The live tools are absent behind the pause modal.
- `app-v2-solo.mjs` passed the actual Challenge 1, Training recording/playback/frame/reset and two-win set flow after opening the collapsible toolbar. Jump input now waits for the worker’s airborne/cooldown/air-jump state rather than fixed timing.
- Type/build checks passed. Representative desktop, narrow and paused screenshots were inspected and copied to `tmp/qa/v2-training-final/` in the primary checkout before cleanup.

## Practical limits

Injected gamepad data does not certify physical DualSense or other hardware. These service browser sessions share one development host and are not a separate-network Argentina latency/reliability session. Physical Arc/controller acceptance, production OAuth/provider-link consent and production performance/capacity evidence belong to the release verification record. The completed initial challenge does not certify all twelve challenge objectives or a full eight-bout Arcade clear.
