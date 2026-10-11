# Audio, combat presentation and controller polish

The original sprite layers and soundtrack remain. Combat now uses authored hurt/attack poses at the correct times, contact shadows, stacked player names and bounded contact/lifecycle effects. Reduced motion suppresses moving bursts and protection flicker; camera framing and simulation rules are unchanged.

UI actions have semantic audio for navigation, confirmation, cancellation, settings, ready state, pause/resume and results. Combat uses balanced original effects plus 16 CC0 Kenney samples (330 KB), bounded polyphony and spatial contact feedback. Source licenses, hashes and transformations are recorded in `docs/audio-polish-sources.md`.

Controller focus remains visible after mouse input. Cross/A and Circle/B stay consistent in menus independently of combat remapping; native select/range controls respond to direction input. Entering a game assigns an available controller to the first human fighter. Device selection is visible on each human fighter card, and Settings reports browser-detected controllers and their most recent input. The raw DualSense fallback only handles the recognized macOS HID shape and leaves browser-standard mappings intact.

A full-match regression also found and fixed stale finished snapshots reopening Results when navigating from the title to Settings or Guide.

## Verification

No unit tests. TypeScript client/server checks, production build and generated music headers pass. Full application exercises use real rendering, workers, room WebSockets and browser audio. Controller injection is identified explicitly; it does not certify physical hardware.

- Chromium, Firefox and WebKit: live canvas, injected controller movement, pause, disconnect, quarantine of a different device and reclaim of the original device.
- Six four-bot presentation flows: three arenas with full/reduced motion, resize, pause/resume and lobby/remount.
- Integrated audio: first gesture, hover, click, selection, ready, pause/resume, actual match results and mute. Raw pre-gesture hover produced no audio/media starts; zero effects volume produced no voices. Visibility-handler state was injected. No browser errors; subjective listening is separate.
- HTTP against the running Cloudflare Worker: all 26 music tracks, exact bytes, GET/HEAD, range and conditional requests. Vite's static preview alone does not implement the Worker's media headers.
- Full online and menu/controller lifecycle scripts are part of `pnpm e2e` and run in GitHub Actions. Keyboard-only scenarios isolate themselves from physical controllers connected to the machine.

For the physical Arc diagnosis and its current verification state, see `docs/controller-verification.md`.
