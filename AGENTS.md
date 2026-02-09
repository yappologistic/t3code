# AGENTS.md

## Project Snapshot
CodeThing is a minimal GUI for using code agents like Codex and Claude Code (coming soon).

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities
1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Package Roles
- `apps/desktop`: Electron main/preload runtime. Owns provider orchestration, process/session lifecycle, and native IPC boundaries.
- `apps/renderer`: React/Vite UI. Owns session UX, conversation/event rendering, and client-side state.
- `packages/contracts`: Shared Zod schemas and TypeScript contracts for provider events, IPC payloads, and model/session types.

## Codex App Server (Important)
CodeThing is currently Codex-first. The desktop app starts `codex app-server` (JSON-RPC over stdio) per provider session, then streams structured events into the renderer through the provider APIs.

How we use it in this codebase:
- Session startup/resume and turn lifecycle are brokered in `apps/desktop/src/codexAppServerManager.ts`.
- Provider dispatch and thread event logging are coordinated in `apps/desktop/src/providerManager.ts`.
- Renderer consumes provider event streams via `nativeApi.providers.onEvent`.

Docs:
- Codex App Server docs: https://developers.openai.com/codex/sdk/#app-server

## Reference Repos
- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.
