# Hosting and maintenance

The deployment is one Cloudflare Worker with Static Assets and a SQLite Durable Object per room. The browser host runs combat; the Durable Object handles room coordination, signaling, and optional relay. No paid TURN or dedicated game server is required.

Use a **Cloudflare Free** account. Do not enable paid Workers, paid Durable Objects, a purchased domain, or paid runner allowances. `wrangler.jsonc` declares the static bundle, room binding, and initial SQLite migration. The public address uses the account's free `workers.dev` subdomain.

## Live deployment

The game is live at [new-super-tic-fighter.new-super-tic-fighter.workers.dev](https://new-super-tic-fighter.new-super-tic-fighter.workers.dev). The account's Free plan was confirmed on 2026-10-11.

- [GitHub verification](https://github.com/IgnacioPardo/New-Super-TIC-Fighter/actions/workflows/verify.yml)
- [GitHub deployments](https://github.com/IgnacioPardo/New-Super-TIC-Fighter/deployments)
- [Cloudflare project and deployments](https://dash.cloudflare.com/98f3f5983afc3baf9aa40f441412fee0/workers/services/view/new-super-tic-fighter/production/deployments)

Production version `8776a50a-1cdd-41fc-a7a1-4d23d760b1b9` includes the complete-arena camera fix and MP3 streaming fix. HTTPS, health, five complete online lifecycle scenarios, direct WebRTC, forced relay, reconnect, refreshed final scoreboards, and rematches have been verified on the public service. All three arenas passed spawn, fall, respawn, and resize checks on the deployed game. All 25 MP3 assets passed HTTP range and source-byte checks. Actual Chromium, Firefox, and WebKit audio playback, seeking, and restart passed; Chromium also sought beyond its buffered segment under throttled networking. A first Firefox probe timed out before receiving media; three subsequent explicit playback checks passed, without assigning a cause to the earlier timeout.

Physical controllers, native Safari hardware, and an owner/friends session on separate networks remain acceptance checks. Automated clients on this Mac do not certify those conditions. See [verification](verification.md).

## Automatic builds

The Cloudflare GitHub app is connected to this private repository only. Production tracks `main`; preview builds are disabled. The owner approved Cloudflare's standard generated build token, stored by Cloudflare. No deployment credential is committed or copied into GitHub Actions secrets.

Cloudflare builds use `NODE_VERSION=24` and `PNPM_VERSION=12.4.2`, with these commands:

```sh
python3 scripts/make-audio-headers.py --check && pnpm exec tsc -p tsconfig.server.json --noEmit && pnpm run build
pnpm exec wrangler deploy
```

Cloudflare reports its own build/deployment check on GitHub. The separate **Verify game** workflow checks types, production build, complete application/browser and room-service flows, and HTTP music delivery. It contains no unit tests. The integration PR passed this workflow before merging. Both systems run after pushes to main; Cloudflare does not wait for the separate GitHub workflow, so future runtime changes should be merged only after PR verification passes.

## Manual deployment

1. Run the complete production checks described in the README and review `docs/verification.md`.
2. Authenticate Wrangler to the owner's Cloudflare account. The owner completes any login or new authorization prompt in Arc; credentials must not be pasted into chat or committed.
3. Confirm the account is on the Free plan. Build and deploy with `pnpm run deploy`.
4. Verify the returned HTTPS URL, `/api/health`, room create/join, a complete two-browser match, direct and forced relay, reconnect, all three arenas, and music playback.
5. Check response headers and MP3 range requests on the deployed address. Static media should remain available independently of room traffic. Record the URL and verification in this file once deployment succeeds.

Use `pnpm run deploy`, including `run`: bare `pnpm deploy` invokes pnpm's different workspace deployment command.

## Updates and rollback

Normal updates rebuild `dist` and deploy the same Worker. Do not include the transport exercise's temporary browser fixtures in a release; the script cleans those up, and a fresh Vite build clears `dist`.

Deploy after active play sessions end: clients carry explicit protocol/content versions, and live rooms are not a persistent save system. Keep the prior known-good Git revision and Cloudflare deployment version available for rollback. A future protocol/content change must update the corresponding version and document its compatibility policy.

Keep API tokens, Wrangler credentials, `.env` files, generated bundles, test screenshots, and local room storage out of Git. Imported source archives remain read-only and are not deployment inputs; the selected runtime assets and provenance manifest are committed.

## Free-service limits

Room creation, signaling, and relay use the account's free quotas. Most static asset delivery uses asset-first routing. MP3 requests pass through the Worker to implement accurate byte-range streaming and also consume Worker request allowance. Sustained relay traffic consumes the room quota faster than direct WebRTC; exhaustion should surface as a connection error while couch/practice remain usable. There is no automatic paid upgrade configured.

The deployment uses a South America-oriented architecture with direct peer traffic preferred. Cloudflare's available Durable Object placement can put relay traffic outside South America, so measure actual friend-session latency instead of promising a regional ping.

Current provider links, planning estimates, and their assumptions are in the [accepted plan](implementation-plan.md#staying-within-free-hosting). Record actual production usage after the owner/friend playtest.
