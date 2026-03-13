# Provider settings

CUT3 stores app settings locally on the current device. Open **Settings** in the app to manage appearance, provider-specific paths, model options, and response defaults.

## Appearance

The **Appearance** area currently includes:

- **Theme preference**: `System`, `Light`, or `Dark`
- **Chat background image**:
  - add/change/remove a background image for the chat surface
  - adjust its `Fade` and `Blur`
  - stored locally on the current device
  - limited to `10MB` per image
- **Custom theme presets**:
  - built-in presets including Catppuccin variants, GitHub Dark variants, Nord, Visual Studio 2017 Dark, T3 Chat Theme, and Lilac
  - presets apply app UI colors, diff colors, and syntax-highlighting theme selection together

The chat background image controls are separate from the color theme preset. You can mix the default theme or any preset with a custom chat background.

## Provider overrides

The **Providers** section supports local overrides for each provider runtime:

- **Codex**
  - Custom binary path
  - Custom Codex home path
- **GitHub Copilot**
  - Custom binary path
- **Kimi Code**
  - Custom binary path
  - Optional API key stored locally and injected into new Kimi CLI sessions

Leave a binary field blank to use the provider executable from your `PATH`.

## Models

The **Models** section currently exposes two kinds of model-related settings.

### Codex service tier

Codex has a default service-tier preference for new turns:

- `Automatic`: do not force a service tier
- `Fast`: request the fast service tier when supported
- `Flex`: request the flex service tier when supported

This is an app-level default. It applies when starting new Codex turns from the composer.

### Custom model slugs

T3 Code supports saved custom model ids for:

- **GitHub Copilot**
- **Kimi Code**

Saved custom model ids appear in:

- the main model picker
- `/model` command suggestions

The app normalizes entries before saving them and ignores built-in duplicates.

Codex currently uses the built-in catalog only. T3 Code still normalizes common Codex aliases such as `5.4` and `5.3-spark` to their canonical built-in model ids.

## Composer controls

The composer exposes provider-aware turn controls.

### Reasoning effort

- **Codex**: `Low`, `Medium`, `High`, `Extra High`
- **GitHub Copilot**: provider-supported reasoning values, currently surfaced as `Low`, `Medium`, or `High`
- **Kimi Code**: no reasoning-effort picker is shown

Reasoning choices are scoped by provider, so switching providers updates the available options.

### Codex fast mode

Codex also has a per-turn `Fast Mode` toggle in the composer controls. This is separate from the app-level Codex service-tier default:

- **Service tier** is your default preference for new Codex turns.
- **Fast Mode** is an explicit per-turn Codex model option.

## Related docs

- [../README.md](../README.md)
- [./codex-prerequisites.md](./codex-prerequisites.md)
- [./runtime-modes.md](./runtime-modes.md)
