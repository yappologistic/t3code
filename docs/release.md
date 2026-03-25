# Release Checklist

This document covers how to run desktop releases from one tag, first without signing, then with signing.

## Local desktop builds for your own machine

If you just want a release artifact for your own platform, you do not need to publish a GitHub release.

Start from the repo root:

```bash
bun install
```

Build commands:

- macOS Apple Silicon DMG:
  - `bun run dist:desktop:dmg:arm64`
- macOS Intel DMG:
  - `bun run dist:desktop:dmg:x64`
- Linux x64 AppImage:
  - `bun run dist:desktop:linux`
- Windows x64 NSIS installer:
  - `bun run dist:desktop:win`

All artifacts are written to `./release`.

If you need a custom target or arch, use the generic entrypoint:

```bash
bun run dist:desktop:artifact -- --platform <mac|linux|win> --target <target> --arch <arch>
```

Examples:

- `bun run dist:desktop:artifact -- --platform mac --target dmg --arch universal`
- `bun run dist:desktop:artifact -- --platform linux --target AppImage --arch arm64`
- `bun run dist:desktop:artifact -- --platform win --target nsis --arch x64`

Practical guidance:

- Build macOS artifacts on macOS.
- Build Linux artifacts on Linux.
- Build Windows artifacts on Windows.
- Unsigned local builds are the normal default.
- Add `--signed` only when you have the signing credentials configured for that platform.

Recommended local verification before sharing artifacts:

- Run `bun run fmt`, `bun run lint`, `bun run typecheck`, and `bun run test` from the repo root.
- Install the browser test runtime with `bun run --cwd apps/web test:browser:install`, then run `bun run --cwd apps/web test:browser`.
- Run `bun run test:desktop-smoke` after the desktop build so Electron launch, bundled backend bootstrap, and the backend ready marker are all rechecked on the target OS.
- The desktop smoke test is intentionally narrow: it verifies launch-time startup and the backend readiness handshake, not full renderer interaction or installer behavior.
- Use `apps/desktop/README.md` together with this release guide when debugging desktop startup or packaging issues.

## What the workflow does

- Trigger: push tag matching `v*.*.*`, or run the workflow manually with `workflow_dispatch`.
- Runs quality gates first: lint, typecheck, test, browser tests, and a Linux desktop build/smoke pass.
- Builds four artifacts in parallel:
  - macOS `arm64` DMG and ZIP, named `CUT3-macOS-<version>-<arch>.<ext>`
  - macOS `x64` DMG and ZIP, named `CUT3-macOS-<version>-<arch>.<ext>`
  - Linux `x64` AppImage, named `CUT3-linux-<version>-<arch>.<ext>`
  - Windows `x64` NSIS installer, named `CUT3-windows-<version>-<arch>.<ext>`
- Publishes one GitHub Release with all produced files.
  - Versions with a suffix after `X.Y.Z` (for example `1.2.3-alpha.1`) are published as GitHub prereleases.
  - Only plain `X.Y.Z` releases are marked as the repository's latest release.
  - Desktop prerelease artifacts launch as `CUT3`, the same as stable builds.
  - The GitHub Release title is `CUT3 v<version>`.
- Includes Electron auto-update metadata (for example `latest*.yml` and `*.blockmap`) in release assets.
- Optionally publishes the CLI package (`apps/server`, npm package `cut3`) when explicitly enabled.
- Signing is optional and auto-detected per platform from secrets.

## Desktop auto-update notes

- Runtime updater: `electron-updater` in `apps/desktop/src/main.ts`.
- Update UX:
  - Background checks run on startup delay + interval.
  - No automatic download or install.
  - The desktop UI shows a rocket update button when an update is available; click once to download, click again after download to restart/install.
- Provider: GitHub Releases (`provider: github`) configured at build time.
- Repository slug source:
  - `CUT3_DESKTOP_UPDATE_REPOSITORY` (format `owner/repo`), if set.
  - otherwise `GITHUB_REPOSITORY` from GitHub Actions.
- Temporary private-repo auth workaround:
  - set `CUT3_DESKTOP_UPDATE_GITHUB_TOKEN` (or `GH_TOKEN`) in the desktop app runtime environment.
  - the app forwards it as an `Authorization: Bearer <token>` request header for updater HTTP calls.
- Required release assets for updater:
  - platform installers (`.exe`, `.dmg`, `.AppImage`, plus macOS `.zip` for Squirrel.Mac update payloads)
  - `latest*.yml` metadata
  - `*.blockmap` files (used for differential downloads)
- macOS metadata note:
  - `electron-updater` reads `latest-mac.yml` for both Intel and Apple Silicon.
  - The workflow merges the per-arch mac manifests into one `latest-mac.yml` before publishing the GitHub Release.

## 0) Optional npm OIDC trusted publishing setup (CLI)

The workflow only publishes the CLI when you explicitly opt in:

- `workflow_dispatch` with `publish_cli=true`, or
- repository variable `CUT3_PUBLISH_CLI=true` for tag-triggered releases.

When enabled, it publishes the CLI with `bun publish` from `apps/server` after
bumping the package version to the release tag version.

Checklist:

1. Confirm npm org/user owns package `cut3`.
2. In npm package settings, configure Trusted Publisher:
   - Provider: GitHub Actions
   - Repository: this repo
   - Workflow file: `.github/workflows/release.yml`
   - Environment (if used): match your npm trusted publishing config
3. Ensure npm account and org policies allow trusted publishing for the package.
4. Create release tag `vX.Y.Z` and push; workflow will, when CLI publishing is enabled:
   - set `apps/server/package.json` version to `X.Y.Z`
   - build web + server
   - run `bun publish --access public`

## 1) Dry-run release without signing

Use this first to validate the GitHub release pipeline.

1. Confirm no signing secrets are required for this test.
2. Create a test tag:
   - `git tag v0.0.0-test.1`
   - `git push CUT3 v0.0.0-test.1`
3. Wait for `.github/workflows/release.yml` to finish.
4. Verify the GitHub Release contains all platform artifacts.
5. Download each artifact and sanity-check installation on each OS.
6. Run `bun run test:desktop-smoke` on each platform-specific build machine before distributing any locally built artifact.

## 2) Apple signing + notarization setup (macOS)

Required secrets used by the workflow:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

Checklist:

1. Apple Developer account access:
   - Team has rights to create Developer ID certificates.
2. Create `Developer ID Application` certificate.
3. Export certificate + private key as `.p12` from Keychain.
4. Base64-encode the `.p12` and store as `CSC_LINK`.
5. Store the `.p12` export password as `CSC_KEY_PASSWORD`.
6. In App Store Connect, create an API key (Team key).
7. Add API key values:
   - `APPLE_API_KEY`: contents of the downloaded `.p8`
   - `APPLE_API_KEY_ID`: Key ID
   - `APPLE_API_ISSUER`: Issuer ID
8. Re-run a tag release and confirm macOS artifacts are signed/notarized.

Notes:

- `APPLE_API_KEY` is stored as raw key text in secrets.
- The workflow writes it to a temporary `AuthKey_<id>.p8` file at runtime.

## 3) Azure Trusted Signing setup (Windows)

Required secrets used by the workflow:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_TRUSTED_SIGNING_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`
- `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`

Checklist:

1. Create Azure Trusted Signing account and certificate profile.
2. Record ATS values:
   - Endpoint
   - Account name
   - Certificate profile name
   - Publisher name
3. Create/choose an Entra app registration (service principal).
4. Grant service principal permissions required by Trusted Signing.
5. Create a client secret for the service principal.
6. Add Azure secrets listed above in GitHub Actions secrets.
7. Re-run a tag release and confirm Windows installer is signed.

## 4) Ongoing release checklist

1. Ensure `main` is green in CI.
2. Bump app version as needed.
3. Create release tag: `vX.Y.Z`.
4. Push tag.
5. Verify workflow steps:
   - preflight passes
   - all matrix builds pass
   - release job uploads expected files
6. Smoke test downloaded artifacts.
7. Confirm the downloaded app reaches the desktop backend ready state before manual UI checks begin.

## 5) Troubleshooting

- macOS build unsigned when expected signed:
  - Check all Apple secrets are populated and non-empty.
- Windows build unsigned when expected signed:
  - Check all Azure ATS and auth secrets are populated and non-empty.
- Build fails with signing error:
  - Retry with secrets removed to confirm unsigned path still works.
  - Re-check certificate/profile names and tenant/client credentials.
