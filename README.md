# CUT3

<p align="center">
  <img src="./CUT3.png" alt="CUT3" width="144" />
</p>

CUT3 is a minimal web GUI for coding agents. It currently supports Codex, GitHub Copilot, OpenCode, Kimi Code, and the Pi agent harness. The picker also shows Gemini as coming soon, while Claude Code and Cursor remain unavailable placeholders.

## Screenshot

![CUT3 screenshot](./CUT3.png)

## Supported providers

- Codex
- GitHub Copilot
- OpenCode
- Kimi Code
- Pi

Gemini is intentionally shown as coming soon in the provider picker. Claude Code and Cursor are also visible there as unavailable placeholders. None of those three are wired up for sessions yet.

## How to use

> [!WARNING]
> Install at least one supported provider runtime before starting CUT3. Codex, GitHub Copilot, OpenCode, and Kimi Code still depend on their native CLIs plus whatever auth or API keys they require. Pi is embedded directly in CUT3, but it still needs Pi auth/config under `~/.pi/agent` (or the equivalent Pi environment variables) before Pi-backed sessions can start:
>
> - [Codex CLI](https://github.com/openai/codex)
> - [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent)
> - [OpenCode CLI](https://opencode.ai/docs)
> - [Kimi Code CLI](https://www.kimi.com/code/docs/en/)
> - [Pi agent harness](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)

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

Once the app is running, choose Codex, GitHub Copilot, OpenCode, Kimi Code, or Pi from the provider picker before starting a session. If this is your first run and CUT3 does not know any projects yet, the empty chat view now walks you through adding a project folder and immediately opens the first draft thread for it.

## Workspace instructions and slash commands

CUT3 now recognizes three repo-owned workspace surfaces:

- `AGENTS.md` at the workspace root. When it exists, CUT3 wraps every new provider turn with those workspace instructions on the server side.
- `.cut3/commands/*.md` for repo-local slash-command templates.
- `.cut3/skills/<name>/SKILL.md` for repo-local skills that can be attached per turn from the composer.

From the composer:

- Run built-in slash commands such as `/new` (`/clear`), `/compact` (`/summarize`), `/share`, `/unshare`, `/undo`, `/redo`, `/export`, `/details`, `/init`, `/plan`, `/default`, `/model`, and `/mcp` (when the active provider supports MCP).
- Type `/` to see those built-in commands plus any templates discovered from `.cut3/commands/*.md`.
- Open the Skills picker to attach repo-local skills discovered from `.cut3/skills/<name>/SKILL.md`. Skill files must include `name` and `description` frontmatter, and `name` must match the lowercase hyphenated directory name.
- Attach up to **8 images per message** with the paperclip button, drag-and-drop, or paste. CUT3 accepts image files only, enforces a **10 MB per image** limit, shows inline previews in the composer and thread timeline, and includes attachment names in bootstrap/export summaries.
- When a turn is already running, use the composer follow-up controls to **Queue** the next message or **Steer** the run so CUT3 interrupts the current turn and sends your new follow-up next. Press `Enter` to use the current Queue/Steer mode, or `Cmd/Ctrl+Enter` to use the opposite mode for that one follow-up.
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
- **Provider overrides**: set custom binary paths for Codex, Copilot, OpenCode, or Kimi, plus an optional Codex home path, a shared OpenRouter API key, and a Kimi API key. Pi is embedded through CUT3's Node dependency instead of a separate binary override; CUT3 reads Pi auth/models config from `~/.pi/agent`, keeps Pi packages, AGENTS files, system prompts, extensions, skills, prompt templates, and themes disabled so workspace instructions still come only from CUT3, and now surfaces authenticated Pi provider/model ids directly in the picker and `/model` suggestions instead of only showing a static `pi/default` placeholder. OpenCode account authentication still happens outside CUT3 through `opencode auth login` and `opencode auth logout`, while MCP server auth/debug remains server-specific through commands like `opencode mcp auth <server>` and `opencode mcp debug <server>`. The OpenCode settings panel inspects the resolved OpenCode config paths plus `opencode auth list`, `opencode mcp list`, and `opencode mcp auth list` so CUT3 can show current credentials, provider-specific MCP status (including disabled and auth-gated entries), and copyable recovery commands. Kimi CLI authentication can use either `kimi login` or the in-shell `/login` flow when you are not using an API key, and new OpenCode sessions now inherit that shared OpenRouter key as `OPENROUTER_API_KEY` when the OpenCode provider config expects it.
- **OpenRouter free models**: review the current OpenRouter entries that are explicitly free-locked and compatible with CUT3's native tool-calling path (`tools` plus `tool_choice`), keep the built-in `openrouter/free` router handy, and pin any listed model into the picker. CUT3 now keeps a last-known-good OpenRouter free-model catalog locally so the picker and settings can stay usable even when the next live catalog refresh fails.
- **Custom model slugs**: save extra model ids for GitHub Copilot, OpenCode, Kimi, Pi provider/model ids such as `github-copilot/claude-sonnet-4.5`, custom Codex models, or current OpenRouter `:free` slugs so they appear in the model picker and `/model` suggestions.
- **Picker controls**: the chat composer now uses a searchable grouped model picker with direct `Usage`, `Provider readiness`, and `Manage models` actions.
- **Favorites, recents, and visibility**: pin favorite models so they stay at the top of the picker, let CUT3 surface recent model choices ahead of the long tail, and hide or restore discovered/saved models without deleting them. Hidden models are removed from both the picker and `/model` suggestions until you show them again.
- **Thread defaults**: choose whether new draft threads start in `Local` or `New worktree`, and set thread sharing to `Manual`, `Auto` (create a share link after a new server-backed thread settles), or `Disabled` for new links.
- **Codex service tier**: choose `Automatic`, `Fast`, or `Flex` as the default service tier for new Codex turns.
- **Per-turn controls**: the composer exposes provider-aware reasoning controls where CUT3 has a provider-specific contract today. Codex and GitHub Copilot expose provider-specific reasoning levels, Codex also supports a per-turn `Fast Mode` toggle, and Pi now surfaces its live model reasoning capability plus Pi thinking levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`) for reasoning-capable Pi models while still preserving Pi defaults until you choose an override.
- **Usage dashboard**: click the composer context ring or the picker `Usage` action to open a unified usage dashboard for the current selection, including documented/live context limits, token breakdowns from the latest matching runtime snapshot, latest reported spend when the provider exposes it, and GitHub Copilot quota details.
- **Response visibility**: choose whether assistant messages stream token-by-token and whether tool/work-log entries stay visible in the main timeline.
- **Permission policies**: save persistent app-wide or project-scoped approval rules with `allow`, `ask`, or `deny` actions, request-kind filters, request-type/detail matching, and Build/Plan/Review presets.

The chat model picker now shows OpenRouter as its own top-level section, with the built-in `openrouter/free` router plus the current OpenRouter `:free` models that CUT3 can safely use for native tool-calling turns. The picker is searchable, grouped by provider, and can open in-chat provider setup and model-management surfaces without sending you into Settings first.

For the full details, see [.docs/provider-settings.md](.docs/provider-settings.md).

## Runtime and interaction modes

The chat toolbar exposes two additional execution controls:

- **Runtime mode**: choose `Full access` for direct execution or `Supervised` for in-app command/file approvals.
- **Interaction mode**: switch between normal `Chat` turns and `Plan` turns for plan-first collaboration.

Runtime mode sets the default sandbox and approval posture for new sessions. Persistent permission policies from Settings can still auto-allow, ask, or deny specific requests on top of that default when a provider raises an approval. Pi is the main exception to CUT3's usual external-runtime sandbox story: `Supervised` still gates Pi tools through the same approval UX, but Pi itself is embedded through CUT3's Node SDK rather than a separate OS sandbox.

When a plan is active, CUT3 can keep it open in a sidebar and export it by copying, downloading markdown, or saving it into the workspace. For Pi, CUT3 drives that mode by sending explicit plan-first instructions and switching Pi onto a read-only tool set for the turn.

Threads also expose collaboration and history controls directly in the chat surface. Use the thread actions menu or the composer slash commands (`/share`, `/unshare`, `/compact`, `/undo`, `/redo`, `/export`, `/details`) to manage the current thread. Shared snapshots open in a dedicated read-only route that can import the snapshot into another local project. Use `Undo` and `Redo` in the thread header to move through recent restore snapshots, use `Fork thread here` on individual messages to branch from that point, and use the diff panel to fork from a completed checkpoint. The sidebar now supports project/thread search, pinning, active/all/archived filters, project recent/manual sort, and thread archiving, while each project shows the 10 most recent matching threads before `Show more` expands the rest. When a provider emits task lifecycle events, CUT3 shows a compact task panel above the timeline.

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
