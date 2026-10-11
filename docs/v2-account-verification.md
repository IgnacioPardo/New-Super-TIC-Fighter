# V2 account service verification

On 2026-10-11, `scripts/profile-service.mjs` passed against the compiled application and a real local Cloudflare workerd service with a disposable D1 database. Playwright controlled isolated Chromium. No unit tests were used. An additional logout audit found stale signed-in name/style fields in the guest form; commit `85aa71c` fixed restoration from the guest identity/style store and guest XP validation. The final run verifies that correction.

Run after `pnpm build`:

```sh
node scripts/profile-service.mjs
```

The script chooses an unused local port, creates a temporary Wrangler configuration and database, and removes both after shutting down its service. `STF_ACCOUNT_PORT` can select a port; `STF_QA_OUTPUT` selects the output directory, defaulting to `tmp/qa/accounts`. It loads an explicitly empty environment file from the temporary directory. It does not read `.env.local`, access production D1, change external OAuth settings, or print session cookies, authenticator private keys or fixture secrets.

## Actual flows exercised

- Guest public-name save and unlocked Copper selection work without a session. Authenticated profile access and passkey enrollment options reject anonymous requests with 401. Google/GitHub actions remain disabled when providers are unconfigured.
- A signed-in profile loads its server progress separately from guest and couch-player stores. The visible import action merges challenge IDs by union and numeric records by maximum. Repeating the import is idempotent; guest and couch progress remain intact.
- Signed-in public-name and cosmetic changes persist in D1. Fresh progress in the account's local store merges on profile refresh, unlocks Neon at 600 XP, and persists without losing earlier challenge records.
- The profile service rejects a locked cosmetic (400), foreign Origin (403), non-JSON payload (415), malformed JSON (400), and oversized payload (413). Sending forged verified matches/wins/XP leaves all verified statistics at zero.
- The visible Add passkey action runs a real WebAuthn registration ceremony with a CDP virtual CTAP2 authenticator, resident credentials and user verification. The browser lists the enrolled passkey.
- Sign out restores the saved guest name and Copper style, clears the local active-account marker and revokes the original session server-side; replaying its original cookie receives 401. After deleting the local account-progress cache, Sign in with passkey runs the authentication ceremony, advances the authenticator counter, creates a new session and restores the account name, Neon style and merged progress from D1.
- The visible Remove action deletes the passkey from the service. The seeded recovery-provider association remains. Guest imports, practice/local records and forged API input do not increment verified online stats. Browser page errors: zero.

The retained report is `docs/evidence/v2-accounts/local-passkey-roundtrip.json`. Screenshots of the enrolled and authenticated profile are produced in the output directory. Their identity and progress are disposable fixtures.

## Coverage boundaries

The initial user, session and Google recovery-provider row are deliberately seeded in local D1; this does not verify a real Google/GitHub consent exchange or provider linking. Subsequent passkey registration and login execute the real service/browser cryptographic ceremonies, using simulated authenticator hardware. This is not evidence of a physical Touch ID/security-key/phone passkey, Arc's native passkey prompt, production HTTPS configuration, synced passkeys across devices, or external OAuth recovery. Those flows need their own actual verification.

## Production OAuth follow-up

On 2026-10-11, native Arc completed real Google consent with the owner's approval against the production domain. The callback returned to the game with Google linked. The authenticated state survived a refresh; sign-out restored guest actions, and a new Google sign-in restored the linked account.

The subsequent owner-approved GitHub linking attempt exposed `email_does_not_match`: the two providers use different email addresses. Explicit authenticated linking now permits different verified provider emails while implicit linking remains disabled. Better Auth still validates the OAuth exchange and rejects a provider identity already owned by another user. This follows its [manual account-linking configuration](https://www.better-auth.com/docs/concepts/users-accounts#manually-linking-accounts). Provider errors now return to the game's translated profile UI instead of the library's developer error page.

The full disposable account-service/browser exercise passed again after that correction, including guest/profile storage, virtual passkey round-trip, rejection of anonymous linking, and usable OAuth error returns. The production retry then completed explicit GitHub linking in native Arc: both providers appeared on the same game account, and signing out and signing in through GitHub restored that account.

The owner physically enrolled a passkey through macOS Passwords and Touch ID. Arc listed the credential in the game. After sign-out, the game opened the native “Touch ID to Use Passkey” prompt; the owner completed the biometric step, and the same profile and both recovery providers returned. This is observed physical enrollment and sign-in, separate from the virtual-authenticator exercise. Cross-device passkey sync and cross-device progress remain unverified. The release's sanitized `production-oauth.json` records these outcomes without account identifiers or credentials. The full GitHub workflow for the deployed account fix also completed successfully: run `38160990594`.

Client-local achievements are intentionally eligible only for cosmetic progression and are not trusted competitive results. This exercise verifies that boundary at the profile endpoint; authoritative multiplayer verified-result persistence is covered by the separate service competition exercises.
