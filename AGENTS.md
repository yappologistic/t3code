# CLAUDE.md

## Task Completion Requirements

- All of `bun run fmt`, `bun run lint`, and `bun run typecheck` must pass before considering tasks completed.
- Always use `bun run test` (runs Vitest), not bare `bun test`.
- Do not claim something works unless you verified it with the relevant tests, checks, or tool output.
- If a change affects user-visible behavior, settings, build steps, release steps, or developer workflows, update the relevant documentation in the same change as part of the implementation.
- Treat stale docs as a bug. A task is not complete until `README.md`, `CONTRIBUTING.md`, `.docs/*`, `docs/*`, and any task-specific guides touched by the change are accurate.
- Update `AGENTS.md` too when a task exposes a repeatable mistake, workflow correction, or durable lesson that should guide future work.
- Keep developer docs aligned with the current `CUT3_*` dev-runner env names. `dev:web` and `dev:server` are expected to share one port offset per `CUT3_STATE_DIR`, so docs should not describe them as independently drifting port selections.
- Keep `apps/web/vitest.browser.config.ts` explicitly prebundling `vitest/browser` and `vitest-browser-react`; cold-cache browser runs can otherwise fail before tests start because the optimized browser bundle imports raw Vitest browser helpers.
- Keep Linux Electron smoke runs CI-safe: GitHub-hosted Linux runners need the smoke harness to add `--no-sandbox`, or Electron exits before CUT3 can emit the desktop backend ready marker.
- Keep release hardening aligned across workflow + docs: reuse the preflight desktop bundle with `dist:desktop:artifact -- --skip-build` instead of rebuilding the JS pipeline in every packaging job, always publish/verify `SHA256SUMS`, gate signed macOS/Windows releases through the `CUT3_REQUIRE_SIGNING` policy instead of silently shipping unsigned artifacts when signing is expected, and keep manual `dry_run` releases non-mutating by skipping both GitHub Release publishing and the finalize version-bump push to `main`.
- Keep provider availability claims in docs and onboarding copy aligned with `apps/web/src/session-logic.ts` and its tests.
- Keep built-in composer slash command parsing, aliases, and menu suggestions aligned through `apps/web/src/composer-logic.ts`; do not duplicate the command list in multiple places and let them drift.
- Keep chat timeline rendering consolidated in `apps/web/src/components/chat/MessagesTimeline.tsx`; do not reintroduce an inline `MessagesTimeline` copy inside `apps/web/src/components/ChatView.tsx`.
- Keep OpenCode auth UX aligned with the real CLI surface: credentials are managed via `opencode auth login/logout`, while CUT3 only inspects OpenCode state and forwards the shared OpenRouter key to new OpenCode sessions as `OPENROUTER_API_KEY` when configured.
- Keep OpenCode MCP status parsing aligned with the real `opencode mcp list` / `opencode mcp auth list` output. Disabled, auth-gated, failed, and connected entries should stay distinguishable in CUT3 instead of being collapsed into a generic success/failure view.
- Keep approval UX labels precise: approval decision `cancel` only dismisses/cancels the pending approval prompt, not the running turn, so UI copy must never present it as a turn stop/interrupt action.
- Keep browser composer interrupt/approval controls optimistic and visibly pending until orchestration state catches up; stop/approve/decline clicks should produce immediate browser feedback instead of looking inert while websocket/provider roundtrips finish, and browser interrupt requests should resolve the best current turn id from session/latest activity instead of assuming a single field is current.
- Keep Kimi auth UX aligned with the official Kimi CLI docs: user-facing guidance should mention `kimi login` and the in-shell `/login` path, plus the CUT3 Kimi API key setting, instead of assuming only one auth flow.
- Keep Pi auth and discovery UX aligned with the real Pi surfaces: CUT3 embeds Pi through the Node SDK, but Pi credentials still live in `~/.pi/agent/auth.json` / Pi env vars or the external `pi` `/login` flow, and CUT3 should keep Pi packages, AGENTS files, system prompts, extensions, skills, prompt templates, and themes disabled so CUT3 injects workspace instructions only once.
- Keep Pi model discovery live in the chat UI: `server.getConfig` / provider refreshes must rerun provider health, and when Pi already exposes authenticated models from local `~/.pi/agent` state, the picker and `/model` suggestions should surface those provider/model ids instead of collapsing back to a static `pi/default` placeholder.
- Keep provider onboarding/readiness UX centralized in the chat provider-readiness surface plus shared provider health/state helpers; do not scatter provider-specific setup copy, login commands, or readiness summaries across multiple unrelated components.
- Keep model-picker ranking state centralized through app settings + shared model-preference helpers. Favorites, recents, hidden-model state, picker ordering, and `/model` suggestion ordering must stay aligned instead of each view inventing its own ranking rules.
- Keep Pi reasoning UX aligned with the real Pi SDK surface: CUT3 should trust Pi's live `model.reasoning` catalog flag plus `AgentSession.getAvailableThinkingLevels()` / `setThinkingLevel()` instead of hardcoding Codex-style assumptions, and should preserve Pi defaults until the user explicitly picks a thinking level override.
- Keep GitHub Copilot reasoning UX aligned with the real CLI/ACP surface: current Copilot CLI builds expose `xhigh` reasoning for some models, so contracts, probes, and composer docs must not clamp Copilot to only low/medium/high.
- Keep GitHub Copilot model slugs aligned with live ACP session metadata. Do not hard-code blanket slug rewrites; mirror whatever the runtime actually advertises, and treat stale picker-only entries that never appear in live Copilot/OpenCode model catalogs as bugs.
- When retiring built-in provider model slugs from picker catalogs, preserve legacy thread hydration and provider inference for historical snapshots/imports; removing a picker entry must not silently reclassify old provider threads or rewrite their stored model ids.
- Keep server-side fallback models aligned with `DEFAULT_MODEL_BY_PROVIDER` in `packages/contracts/src/model.ts`; do not hardcode older Codex defaults in bootstraps, managers, or internal helpers.
- Do not leave ad-hoc provider `console.log` debugging in runtime managers; provider/account payloads can leak into server logs.
- Keep provider event logging opt-in. Raw provider prompts, tool payloads, approval answers, and runtime output must not be persisted by default; use `CUT3_ENABLE_PROVIDER_EVENT_LOGS=1` only for deliberate local debugging.
- Keep provider exit failures visible end-to-end. If a runtime emits `session.exited` with a non-graceful reason, orchestration must preserve that reason in `thread.session.lastError` so OpenCode/Copilot/Kimi/Codex crashes do not look like silent clean stops.
- When testing hot orchestration streams backed by PubSub, avoid `fork + sleep` subscription races. Start the collector with an explicit readiness handshake (for example `Effect.forkScoped` plus `Effect.yieldNow`, or another deterministic subscription barrier) before dispatching commands.
- Keep interactive controls properly disabled during in-flight async operations (e.g. export, share, revoke): users must not be able to trigger conflicting actions while a prior action is still completing. Guard format toggles, download buttons, and secondary actions behind the relevant `isSaving`/`isRevoking` flags.
- Keep sidebar organization logic centralized. Pin/archive/search/filter/sort behavior should stay in shared helpers/stores (`apps/web/src/components/Sidebar.logic.ts`, `apps/web/src/lib/threadOrdering.ts`, `apps/web/src/sidebarPreferencesStore.ts`) instead of being reimplemented ad hoc inside multiple sidebar render branches.
- Keep project-creation and first-run onboarding flows centralized through the shared project-creation hook/component path. Empty-state onboarding and the sidebar add-project affordance should reuse the same project-create + first-thread navigation logic instead of drifting into separate implementations.
- Keep chat follow-up queue state centralized in `apps/web/src/threadSendQueue.ts` instead of duplicating per-thread queue bookkeeping inside individual composer controls.
- Keep ARIA semantics aligned with visual affordances: disclosure/expand buttons need `aria-expanded`, toggle-style buttons need `aria-pressed` or `role="radio"` with `aria-checked`, icon-only buttons need explicit `aria-label`, tree-like file lists need `role="tree"`, and controls revealed only on hover (e.g. terminal close buttons) must also be revealed on `focus-visible` so keyboard users can reach them.
- Keep `aria-label` values on interactive groups and their trigger buttons accurate and descriptive of the actual feature. Do not leave placeholder labels from copy-paste (e.g. "Subscription actions" for an editor picker, "Copy options" for an editor menu).
- When a button visually looks disabled (opacity, cursor-not-allowed), make it actually `disabled` so it is removed from tab order and does not fire click handlers. CSS-only faux-disabled states are a keyboard trap.

## Project Snapshot

CUT3 is a minimal web GUI for using coding agents. It currently supports Codex, GitHub Copilot, OpenCode, Kimi Code, and the Pi agent harness, with a visible Gemini coming-soon entry plus unavailable picker placeholders for Claude Code and Cursor.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## GPT-5.4 Prompt Guidance

<task_context>
You are working in the CUT3 monorepo.
Priorities:

1. Performance first.
2. Reliability first.
3. Predictable behavior under load, reconnects, and partial streams.
   Architecture:

- apps/server: provider sessions, orchestration, websocket server
- apps/web: React/Vite UI and session UX
- apps/desktop: Electron shell and desktop-native integrations
- packages/contracts: schemas/contracts only
- packages/shared: shared runtime utilities
  Do not make schema-only packages carry runtime logic.
  Prefer shared extraction over duplicated local fixes.
  </task_context>

<tool_persistence_rules>

- Use tools whenever they materially improve correctness, completeness, or grounding.
- Use subagents proactively for bounded exploration, parallel read-only work, or other delegable tasks that keep the main context window clear; prefer sub agents for easier bounded tasks such as repo scans, doc audits, and other low-risk side work.
- Do not stop early when another inspection, search, or validation step would materially improve the result.
- Keep going until the task is complete and verification passes.
- If a lookup or test result is partial or suspiciously narrow, retry with a different strategy.
  </tool_persistence_rules>

<dependency_checks>

- Before editing, inspect the relevant code paths and contracts.
- If you do not know something, research it first. Do not assume runtime behavior, APIs, library semantics, or repository conventions.
- Check source code and documentation before making implementation claims. Do not over-hallucinate or smooth over uncertainty.
- Do not skip prerequisite discovery just because the final change seems obvious.
- Resolve upstream/downstream dependencies before mutating code.
  </dependency_checks>

<completeness_contract>

- Treat the task as incomplete until all requested deliverables are handled or explicitly marked blocked.
- Keep an internal checklist of affected runtime paths, UI paths, contracts, and tests.
- Do not leave empty TODOs or placeholder follow-ups in fixes/features unless the user explicitly asked for staged work and the blocker is documented clearly.
- If something is blocked, state exactly what is missing.
  </completeness_contract>

<verification_loop>
Before finalizing:

- Check correctness against the user request.
- Check grounding against the codebase and tool outputs.
- Check formatting and repo conventions.
- Check whether tests/typecheck/lint relevant to the change should run.
- Check whether any docs are now stale and update them before finishing.
- Keep documentation current while working, not as an afterthought. Tracking reality in docs is part of the implementation.
- If the task included easy bounded work that could be delegated safely, prefer a GPT-5.4 Mini subagent for that side work and keep final synthesis, risky edits, and verification in the main agent.
- For localization changes, keep the settings schema, document `lang`/`dir`, and locale-aware date/time formatting aligned. Do not ship a language toggle that only changes labels.
- For mixed-language surfaces, do not flip the whole app shell to RTL just because one locale is RTL. Keep untranslated/shared shells LTR and scope RTL to the views that are actually localized, or English truncation and control ordering will regress.
- Check that async UI controls expose a visible loading state and actionable error recovery, not only a disabled state.
- For desktop startup, packaging, or release-flow changes, keep `apps/desktop/README.md`, `.docs/scripts.md`, `docs/release.md`, and the desktop smoke test aligned on what is actually guaranteed.
  </verification_loop>

<missing_context_gating>

- If required context is missing, do not guess.
- Prefer repo inspection first.
- Be direct and realistic about uncertainty, failures, and tradeoffs. Do not sugarcoat problems or overstate confidence.
- Ask only the minimal clarifying question when the answer cannot be derived locally.
  </missing_context_gating>

<output_contract>

- For implementation tasks: make the change, verify it, then summarize outcome and risks briefly.
- For review tasks: list findings first with file/line references.
- For no-change/planning tasks: provide the exact files and settings that would need changes.
  </output_contract>

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there are shared logic that can be extracted to a separate module. Duplicate logic across mulitple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

- `apps/server`: Node.js HTTP/WebSocket server. Serves the React web app, owns orchestration/project/git/terminal APIs, and routes provider sessions for Codex, GitHub Copilot, OpenCode, Kimi Code, and Pi.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, composer/settings controls, plan sidebar flows, and client-side state. Connects to the server via WebSocket.
- `apps/desktop`: Electron shell. Starts a desktop-scoped `t3` backend, loads the shared web app, and exposes native dialogs, menus, and desktop update flows.
- `packages/contracts`: Shared Effect Schema schemas and TypeScript contracts for provider events, WebSocket protocol, keybindings, and model/session types. Keep this package schema-only — no runtime logic.
- `packages/shared`: Shared runtime utilities consumed by both server and web. Uses explicit subpath exports (e.g. `@t3tools/shared/git`) — no barrel index.

## Provider Runtimes (Important)

CUT3 exposes one orchestration/WebSocket surface, then delegates provider-native runtime behavior to provider adapters and managers.

How we use it in this codebase:

- Codex sessions are brokered through `codex app-server` (JSON-RPC over stdio) in `apps/server/src/codexAppServerManager.ts`.
- GitHub Copilot sessions are brokered through ACP-backed runtime management in `apps/server/src/copilotAcpManager.ts`.
- OpenCode sessions are brokered through ACP-backed runtime management in `apps/server/src/opencodeAcpManager.ts`.
- Kimi Code sessions are brokered through ACP-backed runtime management in `apps/server/src/kimiAcpManager.ts`, including optional API-key-backed startup.
- Pi sessions are brokered through the embedded `@mariozechner/pi-coding-agent` Node SDK in `apps/server/src/piSdkManager.ts`, while CUT3 intentionally disables Pi's own resource discovery so repo instructions still come only from CUT3.
- Cross-provider routing and shared runtime event fan-out are coordinated in `apps/server/src/provider/Layers/ProviderService.ts`.
- WebSocket request handling and push channels are served from `apps/server/src/wsServer.ts`.
- The web app consumes orchestration domain events plus terminal/server push channels over WebSocket.
- For future tool-backed providers, prefer runtimes with a native app-server or ACP surface instead of inventing a bespoke terminal wrapper. This matters for plan-backed products like GLM Coding Plan, where direct API adapters do not satisfy the vendor's supported-tool quota rules.
- OpenCode's `opencode acp` is the current best-fit substrate for new plan-backed integrations because it matches CUT3's existing ACP provider pattern.

Docs:

- Codex App Server docs: https://developers.openai.com/codex/sdk/#app-server

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor
- Pi mono repo (`packages/coding-agent`): https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.
