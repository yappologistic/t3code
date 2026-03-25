# Provider settings

CUT3 stores app settings locally on the current device. Open **Settings** in the app to manage appearance, provider-specific paths, model options, thread defaults, and response defaults.

## Appearance

The **Appearance** area currently includes:

- **Theme preference**: `System`, `Light`, or `Dark`
- **Interface language**:
  - choose `English` or `Persian`
  - the setting is stored locally on the current device
  - Persian also updates the document language/direction and locale-aware time formatting used by the shared web UI
- **Per-appearance base theme editor**:
  - separate saved base settings for light mode and dark mode
  - editable accent, background, foreground, contrast, UI font stack, code font stack, and UI font size
  - optional translucent sidebar surface and pointer cursor toggle
  - import/export as JSON for the selected light or dark theme
- **Chat background image**:
  - add/change/remove a background image for the chat surface
  - adjust its `Fade` and `Blur`
  - stored locally on the current device
  - limited to `10MB` per image
- **Custom theme presets**:
  - built-in presets including Catppuccin variants, GitHub Dark variants, Nord, Visual Studio 2017 Dark, T3 Chat Theme, and Lilac
  - presets apply app UI colors, diff colors, and syntax-highlighting theme selection together

The chat background image controls are separate from the base appearance editor and custom theme preset. You can mix the default theme or any preset with a custom chat background.

## Provider overrides

The **Providers** section supports local overrides for each provider runtime:

- **Codex**
  - Custom binary path
  - Custom Codex home path
  - Optional OpenRouter API key used only for Codex sessions that route through OpenRouter
- **GitHub Copilot**
  - Custom binary path
- **OpenCode**
  - Custom binary path
  - OpenCode account authentication stays in OpenCode itself via `opencode auth login` and `opencode auth logout`; CUT3 does not store those credentials in this phase
  - MCP server auth/debug remains server-specific in OpenCode via commands such as `opencode mcp auth <server>` and `opencode mcp debug <server>`
  - The OpenCode settings panel inspects `opencode auth list`, `opencode mcp list`, `opencode mcp auth list`, and the resolved OpenCode config paths so users can see current provider credentials, MCP connectivity, and copyable auth/debug commands without leaving CUT3
  - When the top-level CUT3 OpenRouter key is set, new OpenCode sessions also inherit it as `OPENROUTER_API_KEY` so OpenCode provider configs can reference it through `{env:OPENROUTER_API_KEY}`
- **Kimi Code**
  - Custom binary path
  - Optional API key stored locally and injected into new Kimi CLI sessions
  - Without an API key, authenticate in Kimi Code CLI itself with `kimi login` or by starting `kimi` and running `/login`
- **Pi**
  - No separate binary override in CUT3; Pi is embedded through `@mariozechner/pi-coding-agent`
  - Pi auth and model discovery still come from `~/.pi/agent` (`auth.json`, `models.json`, Pi env vars, or the external `pi` / `/login` flow)
  - CUT3 intentionally disables Pi packages, AGENTS files, system prompts, extensions, skills, prompt templates, and themes on this path so workspace instructions still come only from CUT3

Leave a binary field blank to use the provider executable from your `PATH`.

## Thread and response defaults

Settings also keeps a few cross-provider behavior defaults:

- **Default thread workspace mode**
  - `Local`
  - `New worktree`
- **Thread sharing mode**
  - `Manual`: create share links only when you explicitly choose `/share` or the thread action
  - `Auto`: create a share link automatically after a new server-backed thread settles for the first time
  - `Disabled`: block creation of new share links from CUT3 until you change the setting again
- **Stream assistant messages**
  - Show token-by-token output while a turn is in progress
- **Show tool details**
  - Show or hide work-log entries in the main timeline without affecting the separate task panel or approval prompts

## Models

The **Models** section currently exposes three kinds of model-related settings.

### Codex service tier

Codex has a default service-tier preference for new turns:

- `Automatic`: do not force a service tier
- `Fast`: request the fast service tier when supported
- `Flex`: request the flex service tier when supported

This is an app-level default. It applies when starting new Codex turns from the composer.

### OpenRouter free models

CUT3 now shows OpenRouter free models in their own settings card and their own top-level section inside the model picker.

- CUT3 always includes the built-in `openrouter/free` router.
- The settings page fetches OpenRouter's live model catalog, but CUT3 only lists models that are explicitly free-locked (`openrouter/free` or `:free`) and advertise the full native tool-calling surface CUT3 needs (`tools` plus `tool_choice`).
- You can pin any listed OpenRouter free model into the picker and `/model` suggestions with one click.
- If the live catalog cannot be fetched, CUT3 surfaces that state in Settings instead of silently hiding it.
- If a pinned OpenRouter `:free` model cannot be served because the route is unavailable, overloaded, rate-limited, or filtered out by provider/privacy constraints, CUT3 automatically retries the turn through `openrouter/free` and shows a warning banner so the turn does not silently drift onto a billed model. CUT3 does not auto-retry Responses API validation failures or payment/credit errors, because those need explicit user action instead of a silent reroute.
- OpenRouter free models still depend on OpenRouter account limits. New accounts only get a small free allowance, purchased credits raise the daily free-model limit, and negative balances can still produce `402 Payment Required` even for `openrouter/free`.

### Custom model slugs

CUT3 supports saved custom model ids for:

- **GitHub Copilot**
- **OpenCode** provider/model ids such as `z-ai/glm-4.5` or `minimax/MiniMax-M2.7`
- **Kimi Code**
- **Pi** provider/model ids such as `github-copilot/claude-sonnet-4.5` or `openai/gpt-5-mini`
- Additional Codex model ids you want to save manually
- Additional OpenRouter `:free` model ids from the current live catalog

OpenCode also advertises runtime-discovered models through ACP. CUT3 merges those live models into the picker after an OpenCode session starts, and keeps a built-in `Default` option under OpenCode so a first session can start without CUT3 guessing a vendor-specific `provider/model` id. Pi now exposes authenticated provider/model ids from local `~/.pi/agent` auth/models state directly in the picker and `/model` suggestions before the first Pi turn, while still keeping `pi/default` available as a compatibility fallback for threads or settings that intentionally rely on Pi choosing its own default provider/model.

Saved custom model ids appear in:

- the main model picker
- `/model` command suggestions

The app normalizes entries before saving them, ignores built-in duplicates, and refuses OpenRouter slugs that are not explicit free variants.

If you add an OpenRouter API key in Settings, CUT3 launches Codex with per-session OpenRouter overrides whenever you pick `openrouter/free` or another saved OpenRouter `:free` slug such as `google/gemma-3n-e4b-it:free`. Native Codex models still use your normal Codex authentication.

### Chat picker controls

The chat composer now exposes a richer model picker instead of only nested provider submenus.

- The picker is searchable across provider names, model labels, and raw model slugs.
- Models are grouped by provider, with OpenRouter kept as its own top-level section.
- `Connect provider` opens an in-chat setup panel that shows provider health, lets you add or update the shared OpenRouter key and Kimi API key, reminds you that OpenCode auth still lives in `opencode auth login` / `opencode auth logout`, and shows Pi guidance for the external `pi` / `bunx pi` + `/login` flow plus `~/.pi/agent` auth/config.
- `Manage models` opens an in-chat model management surface with per-model visibility toggles.
- Hidden models are removed from both the main picker and `/model` suggestions, but they stay saved locally so you can restore them later with `Show all`.

## Composer controls

The composer exposes provider-aware turn controls.

### Reasoning effort

- **Codex**: `Low`, `Medium`, `High`, `Extra High`
- **GitHub Copilot**: provider-supported reasoning values from the live ACP session, currently including `Extra High` on recent Copilot CLI builds when the selected model exposes it
- **OpenCode**: no reasoning-effort picker is shown
- **Kimi Code**: no reasoning-effort picker is shown
- **Pi**: reasoning-capable Pi models now expose Pi thinking levels in the composer (`Default`, `off`, `minimal`, `low`, `medium`, `high`, `xhigh`). CUT3 reads Pi's live model reasoning flag from the authenticated Pi catalog, then uses the embedded Pi SDK session to apply and clamp the selected level against the active model's capabilities.

Reasoning choices are scoped by provider. CUT3 still shows a Reasoning badge for OpenRouter models that advertise reasoning support, but it does not expose Codex-style reasoning-effort levels for OpenRouter models because the OpenRouter catalog does not currently describe which effort values are valid per model.

### Codex fast mode

Codex also has a per-turn `Fast Mode` toggle in the composer controls. This is separate from the app-level Codex service-tier default:

- **Service tier** is your default preference for new Codex turns.
- **Fast Mode** is an explicit per-turn Codex model option.

`Fast Mode` is only shown for native Codex models, not OpenRouter-routed models.

### Context window UI

CUT3 hides the "token context left" UI for OpenRouter-routed models because the routed model can change and the remaining-context display is not reliable enough there.

### Workspace instructions and command templates

The composer now surfaces repo-owned workspace behavior directly:

- CUT3 ships built-in slash commands for common thread actions, including `/new`, `/compact`, `/share`, `/unshare`, `/undo`, `/redo`, `/export`, `/details`, `/init`, `/plan`, `/default`, `/model`, and `/mcp` when the active provider supports MCP.
- CUT3 checks the active workspace root for `AGENTS.md` and shows whether it is currently available.
- `/init` drafts or updates `AGENTS.md` using the current workspace shape, then saves it through the same guarded project-write path used by other workspace actions.
- CUT3 loads repo-local slash-command templates from `.cut3/commands/*.md`.
- Template frontmatter supports `description`, optional `provider`, optional `model`, optional `interactionMode`, optional `runtimeMode`, and optional `sendImmediately`.
- Template bodies can interpolate `$ARGUMENTS` and `$1` through `$9`.
- When `sendImmediately: true` is set, CUT3 expands the template and dispatches the turn directly. Otherwise it expands into the composer for review before sending.

### Repo-local skills

CUT3 also discovers repo-local skills from `.cut3/skills/<name>/SKILL.md`.

- The directory name and frontmatter `name` must match and use the same lowercase hyphenated skill-name format.
- `SKILL.md` frontmatter must include string `name` and `description` fields.
- The composer Skills picker lists discovered skills, surfaces invalid skill files as issues, and lets you attach one or more skills to the next turn.
- Applied skills are sent with the turn request and echoed back in the thread UI so the latest-turn banner can show which skills were used.

### Permission policies

Settings now includes a `Permission policies` section for durable approval rules.

- Rules can be scoped to the whole app or the current project.
- Each rule can `allow`, `ask`, or `deny`.
- Matching can combine request-kind filters with raw request-type terms and free-text detail matching.
- Rules are evaluated top to bottom, so ordering matters.
- Build, Plan, and Review presets provide starter rules that can be cloned and reordered.
- Runtime mode still sets the default sandbox and approval posture for a new session; permission policies only decide how individual pending approvals should be handled once a request exists.

### OpenCode MCP visibility

CUT3 now inspects OpenCode MCP state through `opencode mcp list` and `opencode mcp auth list`, exposes those entries in `server.getConfig`, and shows the resolved OpenCode config sources in Settings. That inspection keeps disabled, auth-gated, failed, and connected OpenCode MCP entries separated so the composer `/mcp` browser and the Settings panel reflect the active OpenCode provider state instead of collapsing everything into a single generic list. OpenCode still owns the actual OAuth flow and credential storage, so CUT3 only reports status and offers copyable CLI commands such as `opencode mcp auth <server>` and `opencode mcp debug <server>`.

## Related docs

- [../README.md](../README.md)
- [./codex-prerequisites.md](./codex-prerequisites.md)
- [./runtime-modes.md](./runtime-modes.md)
