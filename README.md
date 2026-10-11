# New Super TIC Fighter

A browser remake of the original Super TIC Fighter, with couch and online play, four computing disciplines, keyboard/gamepad support, and the original artwork and soundtrack.

Implementation is in progress. The accepted scope and delivery gates are in [the implementation plan](docs/implementation-plan.md).

## Development

Requires Node 24 and pnpm 12.

- Install: pnpm install
- Frontend: pnpm dev
- Room service: pnpm dev:server
- Type check and production build: pnpm build
- Whole-application checks: pnpm e2e

There are no unit tests. Original source archives are not modified. Hosting stays on Cloudflare Free.
