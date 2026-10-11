# New Super TIC Fighter

A browser remake of the original Super TIC Fighter, with couch and online play, four computing disciplines, keyboard/gamepad support, and the original artwork and soundtrack.

Implementation is in progress. The accepted scope and delivery gates are in [the implementation plan](docs/implementation-plan.md).

## Development

Requires Node 24 and pnpm 12.

- Install: pnpm install
- Frontend: pnpm dev
- Room service: pnpm dev:server
- Type check and production build: pnpm build
- Install isolated browser engines once: pnpm exec playwright install chromium firefox webkit
- Whole-application checks: pnpm e2e (with frontend and room service running)
- Room service and browser transport checks: pnpm e2e:transport (with room service running)

Application checks default to http://127.0.0.1:5173 and the room service to http://127.0.0.1:8787. Set STF_APP_URL to exercise a stable production preview, or STF_SERVER_URL to use another local room-service endpoint. The device exercise covers Chromium, Firefox, and WebKit with injected gamepads; STF_BROWSERS can select engines. It does not certify physical controllers. Each script launches isolated browser contexts and closes them afterward.

For a stable full-application verification session, run pnpm build, keep pnpm dev:server running, start pnpm preview --port 4173, and use STF_APP_URL=http://127.0.0.1:4173 pnpm e2e. Do not rebuild while a browser exercise is in flight.

There are no unit tests. Original source archives are not modified. Hosting stays on Cloudflare Free.
