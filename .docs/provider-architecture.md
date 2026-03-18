# Provider architecture

The web app communicates with the server via WebSocket using typed request/response envelopes from `@t3tools/contracts`.

- **Requests**: `{ id, body }`, where `body` is a tagged payload with a `_tag` matching the operation.
- **Responses**: `{ id, result? , error? }`
- **Push events**: `{ type: "push", channel, data }`

Current push channels include:

- `orchestration.domainEvent`
- `terminal.event`
- `server.welcome`
- `server.configUpdated`

Request bodies cover more than provider lifecycle calls. The WebSocket surface currently includes:

- orchestration commands and diff/snapshot queries
- project registry search/write operations
- shell/editor integration
- git operations
- terminal operations
- server metadata, Copilot reasoning probing, and keybinding updates

Provider-native runtime details are hidden behind the server provider layer:

- **Codex**: `codex app-server` over JSON-RPC stdio
- **GitHub Copilot**: ACP-backed runtime sessions
- **OpenCode**: ACP-backed runtime sessions through `opencode acp`
- **Kimi Code**: ACP-backed runtime sessions, with optional API-key-backed startup

Codex, GitHub Copilot, OpenCode, and Kimi Code are the currently implemented providers. `claudeCode` and `cursor` remain unavailable placeholders in the picker/UI for future support.

In the first OpenCode phase, CUT3 treats OpenCode auth and MCP configuration as provider-owned concerns. CUT3 launches `opencode acp`, consumes its ACP model/session events, and applies per-session runtime-mode overrides through `OPENCODE_CONFIG_CONTENT`, but it does not yet inspect OpenCode's configured MCP server list or proxy OpenCode's credential flows.

For the researched GLM Coding Plan and MiniMax roadmap, see [./glm-minimax-support-plan.md](./glm-minimax-support-plan.md).
