# Accounts and privacy

Guests can play without authentication. Optional Google, GitHub and passkeys use Better Auth with D1/Drizzle. Additional couch players remain guest seats; only the account's assigned primary seat receives verified online credit. The game does not import an old user database.

Production OAuth is owned by Ignacio Pardo:

- GitHub OAuth app: **New Super TIC Fighter**, application 3923559. Callback: `https://new-super-tic-fighter.new-super-tic-fighter.workers.dev/api/auth/callback/github`.
- Google project: **new-super-tic-fighter**, owned by the selected personal Google account. Web client: **New Super TIC Fighter Web**. Callback: `https://new-super-tic-fighter.new-super-tic-fighter.workers.dev/api/auth/callback/google`. Google Auth audience is External / In production; the app uses basic identity scopes and has no uploaded Google consent logo or sensitive API scopes.
- Public privacy information: `/privacy.html` (English and Spanish).

`AUTH_SECRET`, `AUTH_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are Cloudflare Worker secrets. Local copies are in ignored, owner-readable environment files. Never place them in frontend variables, source, test fixtures or logs. Preview has its own authentication secret and D1 database; production providers only allow the production callbacks.

Social sign-in creates an account. Linking another provider is an explicit authenticated action; matching an email does not silently link providers. Enroll a passkey after social sign-in and keep a provider for account recovery. Passkeys store public keys and device metadata, not biometrics or device passcodes. Cookie sessions expire after fourteen days.

Profile sync merges achievement sets and monotonic cosmetic progress. Guest import is explicit and idempotent; account progress and other couch guest storage remain separate. Local/practice statistics are distinct from server-verified online records. Clients cannot POST verified wins. Authoritative match result IDs prevent double credit.

For local verification use a temporary local D1 and generated development secret. Real provider tokens must not be sent to an unrelated development callback. `scripts/profile-service.mjs` documents its seeded identity and virtual authenticator; those checks do not substitute for real OAuth or physical passkey validation.
