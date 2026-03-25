# CI quality gates

- `.github/workflows/ci.yml` now runs the core repo quality gates on `ubuntu-24.04`: `bun run fmt:check`, `bun run lint`, `bun run typecheck`, `bun run test`, and the browser suite via `bun run --cwd apps/web test:browser`.
- The same CI workflow also runs a desktop smoke matrix on Linux, macOS, and Windows. Each matrix job builds `bun run build:desktop`, verifies the preload bundle markers, and runs `bun run test:desktop-smoke` (`xvfb-run -a` on Linux).
- `.github/workflows/release.yml` still builds macOS (`arm64` and `x64`), Linux (`x64`), and Windows (`x64`) desktop artifacts from a single `v*.*.*` tag and publishes one GitHub release.
- The release workflow preflight now reruns the browser suite plus the Linux desktop build/smoke path before the per-platform packaging matrix starts, so tags fail fast on UI or Electron startup regressions.
- The release workflow auto-enables signing only when secrets are present: Apple credentials for macOS and Azure Trusted Signing credentials for Windows. Without secrets, it still releases unsigned artifacts.
- CLI npm publishing is optional and no longer blocks GitHub Releases; enable it with the `publish_cli` workflow-dispatch input or the `CUT3_PUBLISH_CLI=true` repository variable.
- See `docs/release.md` for the full release/signing checklist.
