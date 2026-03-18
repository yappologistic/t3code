# Workspace layout

- `/apps/server`: Node.js HTTP/WebSocket server. Serves the built web app, owns orchestration/project/git/terminal APIs, and routes provider sessions for Codex, GitHub Copilot, OpenCode, and Kimi Code.
- `/apps/web`: React + Vite UI. Session control, conversation rendering, composer/settings controls, plan sidebar flows, and terminal/diff surfaces. Connects to the server via WebSocket.
- `/apps/desktop`: Electron shell. Spawns a desktop-scoped `t3` backend process, loads the shared web app, and exposes native dialogs, menus, and updater flows.
- `/apps/marketing`: Astro marketing site.
- `/packages/contracts`: Shared Effect Schema schemas and TypeScript contracts for orchestration, WebSocket protocol, keybindings, and model/session types.
- `/packages/shared`: Shared runtime/browser utilities used across the repo.
- `/scripts`: Monorepo build, dev-runner, release, and packaging helpers.
