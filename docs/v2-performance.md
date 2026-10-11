# V2 desktop rendering observations

Recorded 2026-10-11 using the complete built application, actual simulation worker and synthetic keyboard events. No unit tests. The browser was isolated headed Playwright Chromium at 1366×768 on the reference Apple M4 Mac; WebGL reported `ANGLE Metal Renderer: Apple M4`. This is hardware-accelerated Chromium evidence, not physical Arc/DualSense input evidence.

The match used Expanded Royale on Arcade Circuit with one keyboard fighter and seven Hard bots. Eight configured fighters remained in the snapshot; eliminations were not separately sampled, so this is not proof that eight fighters survived throughout either window. Reduced motion was enabled. Both bounded windows remained in the playing phase, produced no page errors and were never hidden.

| Observation | Initial 25.03 seconds | After 3-second warmup, 26.35 seconds |
| --- | --- | --- |
| Simulation frequency | 60.001 Hz | 60.005 Hz |
| Browser animation callback interval, p95 / maximum | 9.1 / 158.6 ms | 9.2 / 9.4 ms |
| Connected game WebGL color-clear interval, p95 / maximum | Not instrumented | 9.1 / 10.4 ms |
| Worker snapshot delivery interval, p95 / maximum | 17.8 / 165.9 ms | 19.2 / 25.5 ms |

The first window contained a visible scheduling hitch; it is retained rather than discarded. The second run added an observational wrapper around the game's connected WebGL color clears, avoiding the mistaken inference that requestAnimationFrame callbacks alone prove actual render submissions. This is CPU-side render cadence, not display scanout or GPU completion timing. The approximately 120 Hz render submissions coexist with the 60 Hz simulation.

The first instant synthetic jump taps produced no usable response samples. With 80 ms key holds, the second run recorded one keydown-to-worker-jump-event response at 5.9 ms. One accepted jump cannot establish an input-latency distribution. Neither report measures physical controller, screen, network or end-to-end latency.

Reproduce with `STF_APP_URL=http://127.0.0.1:5193 STF_HEADED=1 node scripts/app-v2-cadence.mjs` against the built game. Raw sanitized reports are in [evidence/v2-performance](evidence/v2-performance/). Server frequency, snapshot traffic and Internet round-trip measurements are separately documented in [online verification](v2-online-verification.md).

A longer rendering soak with effects enabled, measured active-fighter counts, physical input and human playability remains acceptance coverage. These short observations support the desktop target without declaring sustained production performance complete.
