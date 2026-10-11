# Hosting and maintenance

The deployment is one Cloudflare Worker with Static Assets and a SQLite Durable Object per room. The browser host runs combat; the Durable Object handles room coordination, signaling, and optional relay. No paid TURN or dedicated game server is required.

Use a **Cloudflare Free** account. Do not enable paid Workers, paid Durable Objects, a purchased domain, or paid runner allowances. `wrangler.jsonc` declares the static bundle, room binding, and initial SQLite migration. The public address uses the account's free `workers.dev` subdomain.

## First deployment

1. Run the complete production checks described in the README and review `docs/verification.md`.
2. Authenticate Wrangler to the owner's Cloudflare account. The owner completes any login or new authorization prompt in Arc; credentials must not be pasted into chat or committed.
3. Confirm the account is on the Free plan. Build and deploy with `pnpm deploy`.
4. Verify the returned HTTPS URL, `/api/health`, room create/join, a complete two-browser match, direct and forced relay, reconnect, all three arenas, and music playback.
5. Check response headers and MP3 range requests on the deployed address. Static media should remain available independently of room traffic. Record the URL and verification in this file once deployment succeeds.

Authentication is the remaining external deployment prerequisite at the time this document was created. No deployment URL or production verification is claimed here yet.

## Updates and rollback

Normal updates rebuild `dist` and deploy the same Worker. Do not include the transport exercise's temporary browser fixtures in a release; the script cleans those up, and a fresh Vite build clears `dist`.

Deploy after active play sessions end: clients carry explicit protocol/content versions, and live rooms are not a persistent save system. Keep the prior known-good Git revision and Cloudflare deployment version available for rollback. A future protocol/content change must update the corresponding version and document its compatibility policy.

Keep API tokens, Wrangler credentials, `.env` files, generated bundles, test screenshots, and local room storage out of Git. Imported source archives remain read-only and are not deployment inputs; the selected runtime assets and provenance manifest are committed.

## Free-service limits

Room creation, signaling, and relay use the account's free quotas. Static asset delivery uses asset-first routing. Sustained relay traffic consumes the room quota faster than direct WebRTC; exhaustion should surface as a connection error while couch/practice remain usable. There is no automatic paid upgrade configured.

The deployment uses a South America-oriented architecture with direct peer traffic preferred. Cloudflare's available Durable Object placement can put relay traffic outside South America, so measure actual friend-session latency instead of promising a regional ping.

Current provider links, planning estimates, and their assumptions are in the [accepted plan](implementation-plan.md#staying-within-free-hosting). Record actual production usage after the owner/friend playtest.
