# Authoritative public feasibility evidence

2026-10-11: local Wrangler workerd, four independent Node WebSocket clients with synthetic Classic inputs; 30 seconds wall time. This is actual service simulation, not Argentina Internet or physical controller evidence.

- 1,800 server ticks, 600 snapshots, 30,002 ms: **59.996 Hz / 20 Hz**.
- 272 ms accumulated measured tick work (performance clock wall duration), maximum 4 ms; production billed CPU was not measured.
- Snapshot intervals p50 49.95 ms, p95 51.56 ms, p99 52.46 ms. Maximum timer lateness 9.26 ms; no catchup ticks or dropped time.
- Loopback ping RTT p50 0.65 ms, p95 2.43 ms. **This does not predict Argentina latency.**
- Full JSON snapshots: 9,875,773 application bytes to all four peers, approximately 82,293 bytes/player/second. Transport compression and production bandwidth were not measured.
- During an earlier hot reload with a Classic snapshot lacking hidden runtime, the DO returned an honest interrupted result rather than resuming invented state. V2 checkpoints can restore full runtime once the simulation implementation is integrated.

Run `STF_SERVER_URL=... STF_FEASIBILITY_KEY=... node scripts/public-feasibility.mjs`. The `/api/feasibility` endpoint requires a configured secret `PUBLIC_FEASIBILITY_KEY` and matching `X-Feasibility-Key` header. Do not place that key in client code or committed files. This route remains unavailable without the secret.

Initial public admission remains disabled unless `PUBLIC_ENABLED=true`. Four concurrent matches, 64 lobby sockets and 1,200 human player-minutes/day are conservative initial caps. Deployed pacing, production billed CPU, jitter/loss/background/restart, Argentina separate-network play and 8-client Royale remain required acceptance evidence.

## Deployed Cloudflare check

On 2026-10-11 the same four-client Classic exercise ran against the separate `new-super-tic-fighter-v2-preview` Worker over the Internet from this Mac. After correcting a deployed-runtime timer stall, it completed 1,800 ticks and 600 snapshots in 30,014 ms: **59.97 Hz authority / 19.99 Hz snapshots**, with zero protocol errors, no dropped simulation time and no catch-up ticks. Snapshot arrival intervals were p50 50.05 ms, p95 70.68 ms, p99 122.71 ms. Round-trip ping was p50 **169.86 ms**, p95 **204.71 ms**. Application payload averaged about **142 KB/player/second** for this run.

The first deployed attempt stalled because Cloudflare freezes `Date.now()` and `performance.now()` between I/O, whereas local workerd did not. A fractional deadline produced zero-delay callbacks without clock progress. The authority now advances at least one fixed simulation step per scheduled callback, uses positive 17/17/16 ms delays and bounds catch-up. [Cloudflare runtime clock documentation](https://developers.cloudflare.com/workers/runtime-apis/performance/).

The deployed performance clock also reported zero tick duration; this is **not a measurement of zero CPU cost**. Production billed CPU and memory duration must be read from provider telemetry. No claim about separate Argentina networks or physical input follows from four synthetic clients on one machine. The sanitized evidence is `docs/evidence/v2-online/cloudflare-classic-feasibility.json`.
