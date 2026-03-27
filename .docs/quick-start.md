# Quick start

```bash
# Development (with hot reload)
bun run dev

# Desktop development
bun run dev:desktop

# Desktop development on an isolated port set
CUT3_DEV_INSTANCE=feature-xyz bun run dev:desktop

# Production
bun run build
bun run start

# Build a shareable macOS .dmg (defaults to the current host arch)
bun run dist:desktop:dmg

# Build a specific desktop artifact for your current platform
bun run dist:desktop:artifact -- --platform mac --target dmg --arch arm64

# Linux x64 AppImage
bun run dist:desktop:linux

# Windows x64 installer
bun run dist:desktop:win

# Or from any project directory after publishing:
bunx cut3
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

- Open **Settings** to configure appearance, including theme presets, per-mode palette/font controls, an English/Persian language switch, and an optional chat background image, plus provider binary overrides, OpenRouter and Kimi API keys, OpenCode binary selection, Pi guidance, model preferences, thread sharing mode (`Manual`, `Auto`, `Disabled`), and whether tool/work-log entries stay visible in the main timeline. If you use Kimi without an API key, authenticate in Kimi Code CLI with `kimi login` or the in-shell `/login` flow. If you want to use Pi, authenticate it outside CUT3 through the Pi CLI (`pi` or `bunx pi`) and `/login`, or populate `~/.pi/agent/auth.json` / provider env vars first.
- Use **Settings > Permission policies** to save app-wide or project-scoped approval rules when you want CUT3 to automatically `allow`, `ask`, or `deny` repeated approval requests.
- Use the **OpenRouter Free Models** card in Settings to review the current OpenRouter catalog entries that are both free-locked and CUT3-compatible, then pin any of them into the picker. If the next live refresh fails, CUT3 now falls back to the last known-good catalog and labels it as stale instead of collapsing the list unexpectedly.
- Save extra GitHub Copilot, OpenCode, Kimi, Pi provider/model ids, custom Codex ids, or currently listed OpenRouter `:free` model ids if you want them in the picker and `/model` suggestions. You can also pin favorites in `Manage models`, and CUT3 now keeps recent picks near the top of the picker so repeated model switches take fewer steps.
- For Codex, choose a default service tier in Settings, use the top-level OpenRouter section in the model picker when you want `openrouter/free` or another current free OpenRouter model, and adjust reasoning / `Fast Mode` per turn from the composer. OpenRouter models can advertise reasoning support, but CUT3 does not expose Codex-specific reasoning-effort levels for them. Pi reasoning-capable models now also expose Pi thinking levels from the composer while leaving Pi's own default thinking untouched until you choose an override. If CUT3 has to retry a pinned OpenRouter free model through `openrouter/free`, the chat shows a warning banner instead of switching silently.
- Put repo-local skills in `.cut3/skills/<name>/SKILL.md` with `name` and `description` frontmatter, then select them from the composer Skills picker before sending a turn.
- Use the paperclip button, drag-and-drop, or paste to attach up to 8 images per message. CUT3 accepts image files only and limits each image to 10 MB.
- On a fresh install with no configured projects, the empty chat view now guides you through adding your first project folder and opens the first draft thread automatically.
- Pick `Full access` or `Supervised` in the toolbar depending on whether you want direct execution or approval-gated actions.
- Switch between `Chat` and `Plan` when you want plan-first collaboration with the plan sidebar.
- While a turn is running, use the composer Queue/Steer controls to line up the next follow-up. `Enter` uses the currently selected follow-up mode, and `Cmd/Ctrl+Enter` uses the opposite mode for that one message.
- Use the thread actions menu or composer slash commands such as `/share`, `/unshare`, `/compact`, `/undo`, `/redo`, `/export`, and `/details` to manage the current thread. Shared links open a read-only viewer that can import the snapshot into another local project.
- Use the thread header `Undo` and `Redo` controls, or the matching slash commands, to move through recent restore snapshots after destructive changes.
- Use `Fork thread here` on a message to branch from that point, and use the diff panel to fork from a completed checkpoint.
- Use the sidebar search box plus the `Active`, `All`, and `Archived` filters to find threads quickly. Projects and threads can be pinned or archived locally, projects can switch between recent and manual ordering, and each project shows the 10 most recent matching threads before you expand the rest.
- When a provider emits task lifecycle events, CUT3 shows a compact task panel above the conversation so you can track active and completed tasks without mixing them into the curated work log.

See [provider-settings.md](provider-settings.md) for the current settings surface and [runtime-modes.md](runtime-modes.md) for the execution controls.
