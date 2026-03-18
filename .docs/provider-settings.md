# Provider settings

CUT3 stores app settings locally on the current device. Open **Settings** in the app to manage appearance, provider-specific paths, model options, and response defaults.

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
  - Authentication stays in OpenCode itself via `opencode auth login`; CUT3 does not store OpenCode credentials in this phase
  - When the top-level CUT3 OpenRouter key is set, new OpenCode sessions also inherit it as `OPENROUTER_API_KEY` so OpenCode provider configs can reference it through `{env:OPENROUTER_API_KEY}`
- **Kimi Code**
  - Custom binary path
  - Optional API key stored locally and injected into new Kimi CLI sessions

Leave a binary field blank to use the provider executable from your `PATH`.

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
- Additional Codex model ids you want to save manually
- Additional OpenRouter `:free` model ids from the current live catalog

OpenCode also advertises runtime-discovered models through ACP. CUT3 merges those live models into the picker after an OpenCode session starts, and keeps a built-in `OpenCode Default` option so a first session can start without CUT3 guessing a vendor-specific `provider/model` id.

Saved custom model ids appear in:

- the main model picker
- `/model` command suggestions

The app normalizes entries before saving them, ignores built-in duplicates, and refuses OpenRouter slugs that are not explicit free variants.

If you add an OpenRouter API key in Settings, CUT3 launches Codex with per-session OpenRouter overrides whenever you pick `openrouter/free` or another saved OpenRouter `:free` slug such as `google/gemma-3n-e4b-it:free`. Native Codex models still use your normal Codex authentication.

## Composer controls

The composer exposes provider-aware turn controls.

### Reasoning effort

- **Codex**: `Low`, `Medium`, `High`, `Extra High`
- **GitHub Copilot**: provider-supported reasoning values, currently surfaced as `Low`, `Medium`, or `High`
- **OpenCode**: no reasoning-effort picker is shown
- **Kimi Code**: no reasoning-effort picker is shown

Reasoning choices are scoped by provider. CUT3 still shows a Reasoning badge for OpenRouter models that advertise reasoning support, but it does not expose Codex-style reasoning-effort levels for OpenRouter models because the OpenRouter catalog does not currently describe which effort values are valid per model.

### Codex fast mode

Codex also has a per-turn `Fast Mode` toggle in the composer controls. This is separate from the app-level Codex service-tier default:

- **Service tier** is your default preference for new Codex turns.
- **Fast Mode** is an explicit per-turn Codex model option.

`Fast Mode` is only shown for native Codex models, not OpenRouter-routed models.

### Context window UI

CUT3 hides the "token context left" UI for OpenRouter-routed models because the routed model can change and the remaining-context display is not reliable enough there.

### OpenCode MCP visibility

OpenCode can use MCP servers from its own config, but CUT3 does not yet inspect or list those configured servers in `server.getConfig`. The OpenCode runtime still sees them when `opencode acp` loads your normal OpenCode configuration.

## Related docs

- [../README.md](../README.md)
- [./codex-prerequisites.md](./codex-prerequisites.md)
- [./runtime-modes.md](./runtime-modes.md)
