# Scripts

- `bun run dev` — Starts contracts, server, and web in `turbo watch` mode.
- `bun run dev:server` — Starts just the WebSocket server (uses Bun TypeScript execution).
- `bun run dev:web` — Starts just the Vite dev server for the web app.
- Dev commands default `CUT3_STATE_DIR` to `~/.t3/dev` to keep dev state isolated from desktop/prod state.
- Separate `bun run dev:web` and `bun run dev:server` launches reuse one shared port offset per `CUT3_STATE_DIR`, so they stay on the same `377x` / `573x` pair instead of drifting apart.
- Override server CLI-equivalent flags from root dev commands with `--`, for example:
  `bun run dev -- --state-dir ~/.t3/another-dev-state`
- `bun run start` — Runs the production server (serves built web app as static files).
- `bun run build` — Builds contracts, web app, and server through Turbo.
- `bun run typecheck` — Strict TypeScript checks for all packages.
- `bun run test` — Runs workspace tests.
- `bun run test:desktop-smoke` — Launches the built Electron app, waits for the desktop backend ready marker, and fails fast on launch-time startup errors.
- `bun run dist:desktop:artifact -- --platform <mac|linux|win> --target <target> --arch <arch>` — Builds a desktop artifact for a specific platform/target/arch.
- `bun run dist:desktop:dmg` — Builds a shareable macOS `.dmg` into `./release`.
- `bun run dist:desktop:dmg:arm64` — Builds an Apple Silicon macOS `.dmg`.
- `bun run dist:desktop:dmg:x64` — Builds an Intel macOS `.dmg`.
- `bun run dist:desktop:linux` — Builds a Linux AppImage into `./release`.
- `bun run dist:desktop:win` — Builds a Windows NSIS installer into `./release`.

## Desktop `.dmg` packaging notes

- Default build is unsigned/not notarized for local sharing.
- The DMG build uses `assets/macos-icon-1024.png` as the production app icon source.
- Desktop production windows load the bundled UI from `t3://app/index.html` (not a `127.0.0.1` document URL).
- Desktop packaging includes `apps/server/dist` (the `t3` backend) and starts it on loopback with an auth token for WebSocket/API traffic.
- Your tester can still open it on macOS by right-clicking the app and choosing **Open** on first launch.
- To keep staging files for debugging package contents, run: `bun run dist:desktop:dmg -- --keep-stage`
- To allow code-signing/notarization when configured in CI/secrets, add: `--signed`.
- Windows `--signed` uses Azure Trusted Signing and expects:
  `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`,
  `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`, and `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`.
- Azure authentication env vars are also required (for example service principal with secret):
  `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

## Desktop smoke test guarantee

- `bun run test:desktop-smoke` exercises launch-time desktop integration only.
- The smoke test passes only after Electron reaches the bundled backend readiness marker (`[cut3-desktop-ready]{...}`) and no obvious startup exception appears in stdout or stderr.
- The smoke test does not validate full renderer interaction, menu flows, or update installation.
- For the architecture and logging details behind that contract, see `apps/desktop/README.md`.

## Running multiple dev instances

Set `CUT3_DEV_INSTANCE` to any value to deterministically shift all dev ports together.

- Default ports: server `3773`, web `5733`
- Shifted ports: `base + offset` (offset is hashed from `CUT3_DEV_INSTANCE`)
- Example: `CUT3_DEV_INSTANCE=branch-a bun run dev:desktop`

If you want full control instead of hashing, set `CUT3_PORT_OFFSET` to a numeric offset.
