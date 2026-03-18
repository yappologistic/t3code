# Architecture

CUT3 ships as a shared web app plus an optional Electron desktop shell, backed by a Node.js server that exposes HTTP/WebSocket APIs and routes work to provider-specific runtimes.

```
┌──────────────────────────────┐
│ Browser                      │
│ or Electron desktop shell    │
└──────────────┬───────────────┘
            │ loads shared UI
┌──────────────▼───────────────┐
│ apps/web (React + Vite)      │
│ session UI, settings, plans  │
└──────────────┬───────────────┘
            │ HTTP + WebSocket
┌──────────────▼───────────────────────────────────┐
│ apps/server (Node.js)                            │
│ static hosting, ws transport, orchestration,     │
│ project/git/terminal APIs, ProviderService       │
└──────────────┬───────────────────────────────────┘
            │ provider adapters / managers
    ┌────────┬──────────┬──────────┬──────────┐
    │        │          │          │          │
┌─▼─────┐ ┌▼───────┐ ┌▼────────┐ ┌▼────────┐
│ Codex │ │Copilot │ │OpenCode │ │ Kimi    │
│ app-  │ │ ACP    │ │ ACP     │ │ ACP     │
│ server│ │ runtime│ │ runtime │ │ runtime │
└───────┘ └────────┘ └──────────┘ └─────────┘
```

- `apps/web` is the shared client surface for browser and desktop usage.
- `apps/desktop` starts a desktop-scoped `t3` backend, hosts the shared UI in Electron, and exposes native dialogs, menus, and updater flows.
- `apps/server` serves the built UI, validates WebSocket requests, owns orchestration, and routes provider-native work through the provider layer.
- Codex uses `codex app-server` over JSON-RPC stdio.
- GitHub Copilot, OpenCode, and Kimi Code use ACP-backed runtime managers.
