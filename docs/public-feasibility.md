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
