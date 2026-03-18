# Quick start

```bash
# Development (with hot reload)
bun run dev

# Desktop development
bun run dev:desktop

# Desktop development on an isolated port set
T3CODE_DEV_INSTANCE=feature-xyz bun run dev:desktop

# Production
bun run build
bun run start

# Build a shareable macOS .dmg (arm64 by default)
bun run dist:desktop:dmg

# Build a specific desktop artifact for your current platform
bun run dist:desktop:artifact -- --platform mac --target dmg --arch arm64

# Linux x64 AppImage
bun run dist:desktop:linux

# Windows x64 installer
bun run dist:desktop:win

# Or from any project directory after publishing:
npx t3
```

## Local desktop release builds

If you want to cut your own desktop build instead of waiting for somebody else to publish a release:

- Run `bun install` once at the repo root.
- Use the script for your platform:
  - macOS Apple Silicon: `bun run dist:desktop:dmg:arm64`
  - macOS Intel: `bun run dist:desktop:dmg:x64`
  - Linux x64: `bun run dist:desktop:linux`
  - Windows x64: `bun run dist:desktop:win`
- Find the output in `./release`.

Use the matching host OS when possible. Cross-platform packaging is not the default workflow for this repo.

## After startup

- Open **Settings** to configure appearance, including theme presets, per-mode palette/font controls, an English/Persian language switch, and an optional chat background image, plus provider binary overrides, OpenRouter and Kimi API keys, OpenCode binary selection, and model preferences.
- Use the **OpenRouter Free Models** card in Settings to review the current OpenRouter catalog entries that are both free-locked and CUT3-compatible, then pin any of them into the picker.
- Save extra GitHub Copilot, OpenCode, Kimi, custom Codex ids, or currently listed OpenRouter `:free` model ids if you want them in the picker and `/model` suggestions.
- For Codex, choose a default service tier in Settings, use the top-level OpenRouter section in the model picker when you want `openrouter/free` or another current free OpenRouter model, and adjust reasoning / `Fast Mode` per turn from the composer. OpenRouter models can advertise reasoning support, but CUT3 does not expose Codex-specific reasoning-effort levels for them. If CUT3 has to retry a pinned OpenRouter free model through `openrouter/free`, the chat shows a warning banner instead of switching silently.
- Pick `Full access` or `Supervised` in the toolbar depending on whether you want direct execution or approval-gated actions.
- Switch between `Chat` and `Plan` when you want plan-first collaboration with the plan sidebar.

See [provider-settings.md](provider-settings.md) for the current settings surface and [runtime-modes.md](runtime-modes.md) for the execution controls.
