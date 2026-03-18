# GLM and MiniMax support plan

## Goal

Add a concrete, low-risk path for supporting:

- Z.AI GLM Coding Plan sessions in CUT3
- MiniMax coding-plan sessions in CUT3

The key constraint is billing and quota semantics, not just model compatibility. CUT3 needs to use a supported coding tool runtime so these products behave like their vendor docs describe.

## Status update

The generic `opencode` provider described in this plan is now implemented in CUT3.

Current shipped state:

- CUT3 exposes `OpenCode` as a first-class provider in the picker and server contracts.
- The server runs `opencode acp` through `apps/server/src/opencodeAcpManager.ts`.
- OpenCode model lists flow back into CUT3 through ACP `session.configured` events, and CUT3 also ships an `OpenCode Default` sentinel so the first session can start without guessing a vendor-specific `provider/model` id.
- `approval-required` runtime mode currently maps to OpenCode permission prompts for `edit` and `bash` through `OPENCODE_CONFIG_CONTENT`.
- Authentication still stays outside CUT3 through `opencode auth login`, and CUT3 does not yet inspect OpenCode-configured MCP servers in `server.getConfig`.

## What the upstream docs imply

### Z.AI GLM Coding Plan

- The plan is only usable inside supported coding tools.
- Direct API calls do not consume Coding Plan quota.
- Supported tools include Claude Code, Roo Code, Kilo Code, Cline, OpenCode, Crush, Goose, and OpenClaw.
- The Claude Code guide uses Anthropic-style environment variables, with `ANTHROPIC_BASE_URL` pointed at Z.AI and default Claude model mappings redirected to GLM models.
- The OpenCode guide routes users through `opencode auth login`, with a distinct `Z.AI Coding Plan` provider choice.

### MiniMax coding tools

- MiniMax documents Claude Code as the recommended end-user setup.
- MiniMax also documents OpenCode, Cline, Roo Code, Kilo Code, Codex CLI, and others.
- MiniMax explicitly marks Codex CLI as not recommended and pins it to an older version because of compatibility issues.
- MiniMax's Anthropic-compat docs and its M2.7 coding-tools guide are not fully aligned: the coding-tools page configures `MiniMax-M2.7` through Anthropic-style Claude Code settings, while the Anthropic compatibility page still claims only older MiniMax model families are supported. CUT3 should treat that as an upstream documentation conflict and avoid making the Anthropic-compat path the first implementation target for MiniMax.

### OpenCode runtime surface

- OpenCode exposes `opencode acp`, an ACP server over stdio using JSON-RPC / nd-JSON.
- OpenCode also has a JS/TS SDK and a server mode, but ACP is the cleanest fit for CUT3's existing provider architecture.
- OpenCode credentials live in `~/.local/share/opencode/auth.json` when users authenticate through `opencode auth login`.
- OpenCode supports config overrides through `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, and `OPENCODE_CONFIG_CONTENT`, which means CUT3 can add per-session runtime overrides without mutating the user's global config.

## Runtime decision

### Reject as the primary path: direct API adapters

Do not add direct Z.AI or MiniMax API adapters in CUT3 for the first pass.

Reasons:

- Z.AI states that Coding Plan quota only applies inside supported coding tools.
- A direct CUT3 API adapter would bypass the supported-tool requirement and turn GLM usage into ordinary API billing.
- MiniMax's direct API path is usable in general, but it does not solve the Z.AI quota constraint, so it does not give CUT3 one shared implementation path.

### Reject as the primary path: Codex reuse

Do not try to support these plans by reusing CUT3's existing Codex runtime.

Reasons:

- Z.AI does not document Codex as a supported Coding Plan tool.
- MiniMax documents Codex CLI as not recommended and version-sensitive.
- Reusing Codex would still not solve the Z.AI tool-only quota requirement.

### Viable but defer: Claude Code provider

Claude Code is a real option, and both Z.AI and MiniMax document it.

However, it is not the best first target for CUT3 because:

- CUT3 currently has no Claude runtime implementation, only a picker placeholder.
- Claude Code does not give CUT3 the same clean ACP/app-server integration surface that Copilot, Kimi, and OpenCode do.
- A Claude-first integration would require a new runtime driver based on `claude -p`, `stream-json`, or the Claude Agent SDK instead of reusing CUT3's existing ACP patterns.

Claude Code should stay on the roadmap, but it should be a follow-up provider project, not the first implementation used to unlock GLM and MiniMax support.

### Primary recommendation: OpenCode ACP

Implement GLM and MiniMax support on top of a new `opencode` provider in CUT3.

Reasons:

- Both Z.AI and MiniMax document OpenCode.
- OpenCode has an ACP server that matches CUT3's current Copilot and Kimi integration family.
- OpenCode already supports provider auth and model selection for Z.AI and MiniMax in its own docs.
- OpenCode config can be overridden per session, which gives CUT3 a clean path for runtime-mode mapping and future provider-specific presets.

## Product shape

### Phase 1 product surface

Ship a generic `OpenCode` provider first.

Rationale:

- It keeps the server contract honest: the runtime is OpenCode, not Z.AI or MiniMax directly.
- It avoids guessing vendor-specific provider ids before CUT3 has validated a real OpenCode session end to end.
- It unlocks both GLM and MiniMax as soon as the user has authenticated OpenCode for those providers.

In practice, phase 1 support means:

- Users install OpenCode and authenticate it outside CUT3 with `opencode auth login`.
- Users select `Z.AI Coding Plan` or `MiniMax` during that auth flow, exactly as the vendor docs describe.
- CUT3 starts `opencode acp` sessions and consumes the model list OpenCode exposes.

### Phase 2 UX polish

After the generic OpenCode runtime is stable, CUT3 can decide whether to add picker aliases such as `GLM Coding Plan` and `MiniMax` that both map to the `opencode` runtime.

Do not do this in phase 1.

Rationale:

- It is a UI polish decision, not a runtime requirement.
- It depends on confirmed provider ids and model naming conventions from live OpenCode sessions.
- It is easier to add once the underlying runtime is already tested.

## Implementation phases

### Phase 0: shared ACP cleanup

Before adding a third ACP-backed CLI, extract the common ACP session lifecycle from the existing managers.

Current evidence:

- `apps/server/src/copilotAcpManager.ts`
- `apps/server/src/kimiAcpManager.ts`

Both managers duplicate the same broad responsibilities:

- spawning a child process
- establishing an ACP connection
- translating ACP tool calls and approvals into CUT3 runtime events
- resuming sessions and forwarding turn lifecycle events

Planned work:

- extract a shared ACP CLI runtime helper under `apps/server/src/provider` or a nearby server-local module
- keep provider-specific argument/env/config logic small and isolated
- avoid adding `opencode` as a third copy-pasted ACP manager

### Phase 1: add `opencode` as a provider kind

Planned file targets:

- `packages/contracts/src/orchestration.ts`
- `packages/shared/src/model.ts`
- `apps/server/src/provider/Layers/ProviderService.ts`
- `apps/server/src/serverLayers.ts`
- `apps/web/src/session-logic.ts`
- `apps/web/src/components/chat/ProviderModelPicker.tsx`

Planned behavior:

- add `opencode` to the provider kind contract
- register an `OpenCodeAdapter` on the server
- expose `OpenCode` in the web picker as an actual provider, not a placeholder
- add an OpenCode icon mapping and model list handling in the web app

### Phase 2: implement `OpenCodeAcpManager`

Planned server file:

- `apps/server/src/opencodeAcpManager.ts`

Startup strategy:

- spawn `opencode acp`
- pass the current workspace `cwd`
- use runtime-specific env overrides rather than editing the user's global OpenCode config

Important runtime overrides CUT3 should own:

- `OPENCODE_CONFIG_CONTENT` for per-session config
- provider-independent permission settings that map CUT3 runtime modes to OpenCode permissions

Runtime-mode mapping:

- `full-access` -> OpenCode permissions stay fully allowed
- `approval-required` -> CUT3 injects an OpenCode permission config that requires approval for edit and bash operations

Do not require CUT3 to write `~/.config/opencode/opencode.json`.

### Phase 3: authentication and onboarding

For the first implementation, keep authentication outside CUT3.

Planned behavior:

- CUT3 only needs an OpenCode binary-path override in settings for phase 1
- onboarding copy should tell users to run `opencode auth login` first
- GLM users select `Z.AI Coding Plan` in OpenCode's auth flow
- MiniMax users select `MiniMax` in OpenCode's auth flow

Why this is the right first cut:

- OpenCode already stores credentials in its own auth file
- CUT3 does not need to guess provider ids or duplicate OpenCode's credential UX on day one
- it reduces the amount of secret-storage work needed before shipping usable support

### Phase 4: optional CUT3-managed provider presets

Only after phase 3 works, add CUT3-managed startup presets.

These presets can use `OPENCODE_CONFIG_CONTENT` so CUT3 can override session config without mutating global files.

Examples of future preset work:

- constrain the visible provider/model set for a GLM-focused session
- add default runtime-mode permissions
- pin a default model per preset
- inject custom provider config for vendors that need explicit `baseURL` or model metadata

This phase is especially relevant if CUT3 later wants top-level `GLM Coding Plan` and `MiniMax` picker entries instead of one generic `OpenCode` entry.

## Testing plan

### Server/runtime tests

Add tests that mirror the current ACP-backed provider coverage.

Targets:

- manager argument/env generation
- runtime-mode permission mapping
- model-list propagation from ACP to CUT3
- approval flow translation
- resume cursor handling

Do not make tests depend on a live OpenCode install.

Use a mock ACP subprocess or a minimal test harness, the same way CUT3 already isolates provider runtime behavior in tests.

### Web tests

Add coverage for:

- provider picker availability
- model picker behavior for OpenCode models
- settings persistence for the OpenCode binary override

### Verification commands

Before the work is considered complete, the repo-standard verification loop still applies:

- `bun run fmt`
- `bun run lint`
- `bun run typecheck`
- `bun run test`

## Documentation updates that should ship with the code

When the implementation starts, update these docs together with the code:

- `README.md`
- `.docs/provider-architecture.md`
- `.docs/provider-settings.md`
- `AGENTS.md`

Docs need to be explicit that phase-1 GLM/MiniMax support runs through OpenCode, not through direct vendor-specific CUT3 adapters.

## Open questions to resolve during implementation

1. Which OpenCode provider ids are exposed for `Z.AI`, `Z.AI Coding Plan`, and `MiniMax` in a live authenticated session?
2. Does OpenCode's ACP surface expose all model metadata CUT3 needs for reasoning and model-picker presentation, or will CUT3 need small local overrides?
3. Which OpenCode permission settings best match CUT3's `supervised` mode without making approvals too noisy?
4. Should CUT3 expose a generic `OpenCode` provider permanently, or only use it as the backing runtime for future GLM/MiniMax picker aliases?

These are implementation-time questions, not blockers for the architectural decision.

## Acceptance criteria

The plan is satisfied when CUT3 can do all of the following:

- launch OpenCode through ACP from a CUT3 session
- show OpenCode-exposed models in CUT3's picker
- run a session with a user-authenticated Z.AI Coding Plan account through OpenCode
- run a session with a user-authenticated MiniMax account through OpenCode
- preserve CUT3 runtime-mode behavior with sensible permission mapping
- pass `bun run fmt`, `bun run lint`, `bun run typecheck`, and `bun run test`

## Follow-up project: Claude Code provider

Once OpenCode support exists, CUT3 can separately decide whether to activate the existing Claude Code placeholder.

That should be tracked as a different project with a different goal:

- expose a first-class Claude runtime in CUT3
- support the vendor-recommended Claude Code setup path for users who specifically want Claude Code

It should not block the first working GLM and MiniMax support path.
