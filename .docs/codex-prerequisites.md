# Codex prerequisites

- Install Codex CLI so `codex` is on your PATH.
- Use Codex CLI `0.37.0` or newer. Older versions are rejected by CUT3.
- Authenticate Codex before running CUT3 if you plan to use native Codex-hosted models (for example via API key or ChatGPT auth supported by Codex).
- CUT3 starts the server via `codex app-server` per session.

Optional app settings for Codex:

- Override the Codex binary path if you do not want to use the `codex` executable from `PATH`.
- Override the Codex home path if you keep Codex state in a non-default location.
- Add an OpenRouter API key if you want to use Codex with `openrouter/free` or specific OpenRouter `:free` model ids.
- Set the default Codex service tier in Settings.
- Use the **OpenRouter Free Models** settings card to browse the live OpenRouter entries that are both free-locked and compatible with CUT3's native tool-calling path (`tools` plus `tool_choice`), then pin them into the picker. If the next live refresh fails, CUT3 falls back to the last known-good compatible catalog and marks it as stale instead of collapsing the list.
- Save extra OpenRouter `:free` model ids such as `google/gemma-3n-e4b-it:free` or custom Codex model ids if you want them in the model picker and `/model` suggestions.
- Use the composer controls to choose Codex reasoning effort and per-turn `Fast Mode`. OpenRouter models may advertise reasoning support, but CUT3 does not expose Codex-specific reasoning-effort levels for those free models.

## Troubleshooting

- If a Codex session fails immediately, verify the configured binary override and confirm `codex --version` is `0.37.0` or newer.
- If you override the Codex home path, make sure it points at the Codex state directory you want CUT3 to use.
- If `openrouter/free` or another OpenRouter model fails to start, verify the OpenRouter API key in Settings, confirm the model id exists on OpenRouter's current free catalog, and make sure the selected model advertises both `tools` and `tool_choice` if you pinned it manually.
- If OpenRouter reports `Invalid Responses API request`, the model id can still be valid. Current Codex releases require the Responses API for custom providers, so CUT3 now surfaces that error directly instead of silently rerouting. Retry the turn, switch to another free model, or use `openrouter/free` if OpenRouter's route is temporarily rejecting multi-turn tool/history payloads.
