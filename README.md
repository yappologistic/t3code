# CUT3

<p align="center">
  <img src="./CUT3.png" alt="CUT3" width="144" />
</p>

CUT3 is a minimal web GUI for coding agents. It currently supports Codex, GitHub Copilot, OpenCode, and Kimi Code. The picker also shows Gemini as coming soon, while Claude Code and Cursor remain unavailable placeholders.

## Screenshot

![CUT3 screenshot](./CUT3.png)

## Supported providers

- Codex
- GitHub Copilot
- OpenCode
- Kimi Code

Gemini is intentionally shown as coming soon in the provider picker. Claude Code and Cursor are also visible there as unavailable placeholders. None of those three are wired up for sessions yet.

## How to use

> [!WARNING]
> Install at least one supported provider CLI before starting CUT3. Some providers also need authentication or API keys; OpenCode can start with its built-in free/default catalog, but provider-backed sessions still depend on OpenCode's own auth/config:
>
> - [Codex CLI](https://github.com/openai/codex)
> - [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent)
> - [OpenCode CLI](https://opencode.ai/docs)
> - [Kimi Code CLI](https://www.kimi.com/code/docs/en/)

```bash
bun run start
```

If you bind CUT3 to a non-loopback host, set `CUT3_AUTH_TOKEN`. Off-box WebSocket clients are rejected unless they present that token.

Published npm package:

```bash
bunx cut3
```

You can also just install the desktop app. It's cooler.

If this fork does not currently publish desktop releases, build one locally with the commands below.

Published CUT3 builds are listed on the [CUT3 Releases page](https://github.com/yappologistic/t3code/releases).

Once the app is running, choose Codex, GitHub Copilot, OpenCode, or Kimi Code from the provider picker before starting a session.

## Workspace instructions and slash commands

CUT3 now recognizes two repo-owned workspace surfaces:

- `AGENTS.md` at the workspace root. When it exists, CUT3 wraps every new provider turn with those workspace instructions on the server side.
- `.cut3/commands/*.md` for repo-local slash-command templates.

From the composer:

- Run `/init` to create or update the workspace `AGENTS.md` through CUT3's guarded project write path.
- Type `/` to see built-in commands plus any templates discovered from `.cut3/commands/*.md`.
- Template frontmatter can set `description`, optional `provider`, optional `model`, optional `interactionMode`, optional `runtimeMode`, and optional `sendImmediately`.

Template bodies support `$ARGUMENTS` plus positional placeholders `$1` through `$9`.

## Build your own desktop release

If you do not want to wait for a GitHub release, you can build a desktop artifact locally for your own platform.

```bash
# Install dependencies first
bun install

# macOS Apple Silicon DMG
bun run dist:desktop:dmg:arm64

# macOS Intel DMG
bun run dist:desktop:dmg:x64

# Linux x64 AppImage
bun run dist:desktop:linux

# Windows x64 installer
bun run dist:desktop:win
```

Artifacts are written to `./release`.

Use the matching host OS when possible:

- Build macOS artifacts on macOS.
- Build Linux artifacts on Linux.
- Build Windows artifacts on Windows.

For the full local packaging and release notes, see [docs/release.md](docs/release.md) and [.docs/scripts.md](.docs/scripts.md).

## Provider settings and model controls

Open Settings in the app to configure provider-specific behavior on the current device.

- **Appearance**: choose the base light/dark/system mode, switch to integrated presets like Lilac, and configure a custom chat background image with adjustable fade and blur.
- **Language**: switch the settings experience and shared app shell between English and Persian. Persian also flips document direction and locale-aware time/date formatting in the web UI.
- **Provider overrides**: set custom binary paths for Codex, Copilot, OpenCode, or Kimi, plus an optional Codex home path, a shared OpenRouter API key, and a Kimi API key. OpenCode authentication still happens outside CUT3 through `opencode auth login`, `opencode auth logout`, and `opencode mcp auth`, but the OpenCode settings panel now inspects the resolved OpenCode config paths plus `opencode auth list`, `opencode mcp list`, and `opencode mcp auth list` so CUT3 can show current credentials, MCP status, and copyable recovery commands. Kimi CLI authentication can use either `kimi login` or the in-shell `/login` flow when you are not using an API key, and new OpenCode sessions now inherit that shared OpenRouter key as `OPENROUTER_API_KEY` when the OpenCode provider config expects it.
- **OpenRouter free models**: review the current OpenRouter entries that are explicitly free-locked and compatible with CUT3's native tool-calling path (`tools` plus `tool_choice`), keep the built-in `openrouter/free` router handy, and pin any listed model into the picker.
- **Custom model slugs**: save extra model ids for GitHub Copilot, OpenCode, Kimi, custom Codex models, or current OpenRouter `:free` slugs so they appear in the model picker and `/model` suggestions.
- **Picker controls**: the chat composer now uses a searchable grouped model picker with direct `Connect provider` and `Manage models` actions.
- **Model visibility**: hide or restore discovered and saved models without deleting them; hidden models are removed from both the picker and `/model` suggestions until you show them again.
- **Codex service tier**: choose `Automatic`, `Fast`, or `Flex` as the default service tier for new Codex turns.
- **Per-turn controls**: the composer exposes provider-aware reasoning controls, and Codex also supports a per-turn `Fast Mode` toggle.

The chat model picker now shows OpenRouter as its own top-level section, with the built-in `openrouter/free` router plus the current OpenRouter `:free` models that CUT3 can safely use for native tool-calling turns. The picker is searchable, grouped by provider, and can open in-chat provider setup and model-management surfaces without sending you into Settings first.

For the full details, see [.docs/provider-settings.md](.docs/provider-settings.md).

## Runtime and interaction modes

The chat toolbar exposes two additional execution controls:

- **Runtime mode**: choose `Full access` for direct execution or `Supervised` for in-app command/file approvals.
- **Interaction mode**: switch between normal `Chat` turns and `Plan` turns for plan-first collaboration.

When a plan is active, CUT3 can keep it open in a sidebar and export it by copying, downloading markdown, or saving it into the workspace.

Threads also expose fork and export controls directly in the chat surface. Use the thread actions menu to fork the current thread or export the full thread as markdown or JSON, use `Fork thread here` on individual messages to branch from that point, and use the diff panel to fork from a completed checkpoint. When a provider emits task lifecycle events, CUT3 shows a compact task panel above the timeline.

For the full details, see [.docs/runtime-modes.md](.docs/runtime-modes.md).

## Additional docs

- [Codex prerequisites](.docs/codex-prerequisites.md)
- [Desktop architecture and verification](apps/desktop/README.md)
- [GLM and MiniMax support plan](.docs/glm-minimax-support-plan.md)
- [Quick start](.docs/quick-start.md)
- [Runtime modes](.docs/runtime-modes.md)

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

## If you REALLY want to contribute still.... read this first

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.
If you are using coding agents while contributing, also read [AGENTS.md](./AGENTS.md) for the current documentation hygiene and delegation rules.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
