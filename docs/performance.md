# Foreground cadence and practice lifecycle check

Actual complete application / worker flow, 2026-10-11. No isolated simulation or
unit tests. Primary stable preview: `http://127.0.0.1:4173`, before the UI redesign
rebuild. Chromium 156.0.8078.4, isolated Playwright headless session with synthetic
UI input, document visible throughout. Hardware: Apple M4, Mac16,1, 10 CPU cores,
16 GiB RAM, macOS 26.6.2. Headless WebGL used SwiftShader; this is not an Arc or
native-GPU performance measurement.

During a 25-second practice window, 1,500 simulation ticks covered 25.0000 seconds
of simulated time in 24.9971 seconds of wall time: 60.007 Hz. Snapshot arrival
intervals: median 16.7 ms, p95 18.1 ms, p99 18.6 ms, max 70.7 ms. The minimum was
0 ms when delayed main-thread messages arrived together; that does not establish
a simulation catch-up burst. Browser rAF intervals: median 16.7 ms, p95/p99
16.8 ms, max 50.1 ms. No hidden-document snapshots or uncaught page errors.

Ten pause→RESET cycles each reached a fresh playing match identity. Baseline and
all ten resets had one live DOM canvas, three live Worker instances (the local
simulation plus persistent online authority/prediction workers), 24 window,
17 document, and 8 canvas listeners observable via non-once add/remove tracking.
The cumulative worker creation count was also three. Listener properties such
as worker `onmessage`/`onerror` were counted separately. These observations do
not establish heap/GPU garbage collection or measure every browser listener.

Leaving to lobby removed the canvas and reduced observable window/document
listeners to 19/6. Reopening restored one canvas, the same three workers, and
24 window listeners, but document listeners increased to 18. An independent
complete application flow on the unchanged secondary 5174 production preview
confirmed one extra Phaser `visibilitychange` listener per GameView recreation:
document totals 15→16→17→18→19→20. Added callbacks match Phaser's visibility
handler. Its installed 4.2.1 `core/VisibilityHandler.js` registers that closure;
`Game.runDestroy` removes Game event listeners but does not unregister the DOM
closure. Reported to the root/UI owners for a renderer lifecycle fix.

After the reproducible Phaser dependency patch and combined build, the UI
owner's six mounted-game checks passed. An independently launched, staggered
whole-application run also passed six mounts: all had 17 document/24 window
listeners, one canvas, and three live workers; lobby had 5 document/19 window
listeners and no canvas. No uncaught page errors. The independent evidence is
`/tmp/stf-listener-independent-patched.json` and
`/tmp/stf-listener-independent-patched.log`.

Initial asset accounting covers cold-cache HTTP responses from navigation until
the first visible practice match plus 300 ms, including short sound effects
loaded after the real UI gesture. Excluded streaming intro/playlist music and
generated `blob:` image responses (which are local image decodes, not downloads).
The 143 HTTP responses totaled 5,615,367 decoded body bytes. Gzipping those actual
response bodies with Node's default gzip produced an estimate of 3,531,317 bytes
(3.53 MB decimal), below the approximately 5 MB compressed target. There were
131 unique requested URLs; retaining repeated HTTP requests makes the reported
estimate conservative for this flow. Some JS responses were actually served
with `Content-Encoding: gzip`; PNG/WAV responses also included identity encoding.
The 3.53 MB figure is a compression estimate, not deployed CDN wire traffic and
not a relabeling of localhost uncompressed bytes.

The independently verified final combined build, including the UI redesign,
recorded 246 cold-cache non-music HTTP responses (131 unique URLs), with
6,403,558 decoded bytes and a 4,233,840-byte gzip estimate (4.23 MB decimal).
It also excluded 102 generated blob responses. This newer estimate remains
below approximately 5 MB and is the release-build figure; it conservatively
includes repeated HTTP requests and does not include HTTP headers.

Raw evidence: `/tmp/stf-cadence-resources-playtest.json` (arrival/frame samples,
all reset states, response-body sizes, and corrected `httpOnlyInitialSize`),
`/tmp/stf-listener-lifecycle-playtest.json` (callback identity comparison), and
the execution output from `/tmp/stf-listener-lifecycle-playtest.cjs` (five
recreations). No repository files changed for this check.
