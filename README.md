# CUT3

<p align="center">
  <img src="./CUT3.png" alt="CUT3" width="144" />
</p>

CUT3 is a minimal web GUI for coding agents. It currently supports Codex, GitHub Copilot, and Kimi Code, with Claude Code coming soon.

## Screenshot

![CUT3 screenshot](./CUT3.png)

## Supported providers

- Codex
- GitHub Copilot
- Kimi Code

## How to use

> [!WARNING]
> Install and authenticate at least one supported provider CLI before starting CUT3:
>
> - [Codex CLI](https://github.com/openai/codex)
> - [GitHub Copilot CLI](https://docs.github.com/copilot/how-tos/use-copilot-agents/coding-agent/using-the-github-copilot-coding-agent-in-the-cli)
> - [Kimi Code CLI](https://www.kimi.com/code/docs/en/)

```bash
npx t3
```

You can also just install the desktop app. It's cooler.

If this fork does not currently publish desktop releases, build one locally with the commands below.

If you want the upstream published app instead, use the [upstream Releases page](https://github.com/pingdotgg/t3code/releases).

Once the app is running, choose Codex, GitHub Copilot, or Kimi Code from the provider picker before starting a session.

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
- **Provider overrides**: set custom binary paths for Codex, Copilot, or Kimi, plus an optional Codex home path and Kimi API key.
- **Custom model slugs**: save extra model ids for GitHub Copilot and Kimi so they appear in the model picker and `/model` suggestions.
- **Codex service tier**: choose `Automatic`, `Fast`, or `Flex` as the default service tier for new Codex turns.
- **Per-turn controls**: the composer exposes provider-aware reasoning controls, and Codex also supports a per-turn `Fast Mode` toggle.

For the full details, see [.docs/provider-settings.md](.docs/provider-settings.md).

## Runtime and interaction modes

The chat toolbar exposes two additional execution controls:

- **Runtime mode**: choose `Full access` for direct execution or `Supervised` for in-app command/file approvals.
- **Interaction mode**: switch between normal `Chat` turns and `Plan` turns for plan-first collaboration.

When a plan is active, CUT3 can keep it open in a sidebar and export it by copying, downloading markdown, or saving it into the workspace.

For the full details, see [.docs/runtime-modes.md](.docs/runtime-modes.md).

## Additional docs

- [Codex prerequisites](.docs/codex-prerequisites.md)
- [Quick start](.docs/quick-start.md)
- [Runtime modes](.docs/runtime-modes.md)

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

## If you REALLY want to contribute still.... read this first

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
