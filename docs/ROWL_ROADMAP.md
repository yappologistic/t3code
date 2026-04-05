# ROWL Roadmap

## Implementation Roadmap for the Agentic Engineering Control Room

This document outlines the phased implementation plan for Rowl, moving from the current CUT3 foundation to the full vision of a multi-provider, multi-project, simultaneous agent workspace.

---

## Phase 1: Context Management Foundation (Priority: CRITICAL)

### Why First?

Context is the foundation of everything. Without proper context management, all other features suffer. The AI cannot work effectively with poor context, and users cannot trust outputs they don't understand.

### Features

#### 1.1 Tombstone Context Trimming

**Problem:** Current `/compact` command uses basic summarization which loses nuance and doesn't show users what was removed.

**Valo Solution:** Surgical trimming with "tombstones" - markers that show exactly what was trimmed, allowing retrieval and maintaining conversation coherence.

**Implementation:**

```
Location: apps/server/src/orchestration/Services/ContextManager.ts (new)

Interface:
- trimContext(messages, budget): { trimmed: Message[], tombstones: Tombstone[] }
- restoreFromTombstone(tombstoneId): Message
- getContextBudget(threadId): ContextBudget

Tombstone Schema:
{
  id: string
  originalContent: string (full content)
  trimReason: "context_limit" | "relevance" | "user_preference"
  position: { before: number, after: number }
  createdAt: timestamp
  metadata: { tokensRemoved: number, category: "reasoning" | "tool_output" | "conversation" }
}
```

**Implementation Steps:**

1. Create `packages/contracts/src/context.ts` with Tombstone schema
2. Create `apps/server/src/orchestration/Services/ContextManager.ts` with trim/restore logic
3. Modify `ProviderRuntimeIngestion.ts` to use ContextManager before sending to providers
4. Add UI for viewing/restoring tombstones in `MessagesTimeline.tsx`
5. Add `/tombstones` slash command to list and restore trimmed content

**Complexity:** Medium
**Impact:** High (foundational for trust and context preservation)

#### 1.2 Context Budget System

**Problem:** No visibility into how much context is being used vs. available.

**Implementation:**

```
Location: apps/server/src/orchestration/Services/ContextBudgetService.ts (new)

Interface:
- getBudget(threadId): ContextBudget
- setBudget(threadId, limit): void
- alertThreshold(threadId, percentage): void
- getBudgetBreakdown(threadId): { system: number, history: number, attachments: number }
```

**UI Integration:**

- Show context meter in composer (like a fuel gauge)
- Breakdown tooltip showing context categories
- Warning at 80%, critical at 95%

**Complexity:** Medium
**Impact:** Medium

#### 1.3 Selective Context Injection

**Problem:** Sometimes you want to pull context from another thread or project.

**Implementation:**

- Add `/inject` slash command: `/inject thread:<threadId> message:<messageId>`
- Add cross-thread reference UI in message context menu
- Implement context injection as a special message type that gets expanded on send

**Complexity:** Medium
**Impact:** Medium

---

## Phase 2: Guardian System (Priority: HIGH)

### Why Second?

Guardian is lightweight, high-impact, and can run in the background while you work on other features. It addresses the "AI forgetting what it can do" problem that frustrates users.

### Features

#### 2.1 Guardian Background Service

**Problem:** Claude and other models can "forget" their capabilities during conversation, leading to "I can't do that" when they actually can.

**Valo Solution:** Background Haiku process watching Claude's output for patterns like "I can't do X" or "you need to run this command yourself", then reminding Claude of capabilities.

**Implementation:**

```
Location: apps/server/src/guardian/Services/GuardianService.ts (new)

Interface:
- startGuardian(sessionId): void
- stopGuardian(sessionId): void
- processOutput(sessionId, output): GuardianSuggestion[]
- acknowledgeSuggestion(suggestionId): void

GuardianSuggestion Schema:
{
  id: string
  sessionId: string
  patternMatched: string
  suggestion: string
  capability: string
  confidence: number
  createdAt: timestamp
  acknowledged: boolean
}
```

**Pattern Matching:**

```typescript
const GUARDIAN_PATTERNS = [
  {
    pattern: /I can't (?:do|run|execute|use)/i,
    capability: "tool_use",
    suggestion: "You have access to shell, read, write, and edit tools",
  },
  {
    pattern: /you(?:'ll| will) need to run this yourself/i,
    capability: "automation",
    suggestion: "You can execute commands directly",
  },
  {
    pattern: /I don't have access to.*file system/i,
    capability: "file_access",
    suggestion: "You have full file system access via tools",
  },
  {
    pattern: /can't modify.*files?/i,
    capability: "file_write",
    suggestion: "You can use write and edit tools to modify files",
  },
];
```

**Implementation Steps:**

1. Create `packages/contracts/src/guardian.ts` with GuardianSuggestion schema
2. Create `apps/server/src/guardian/Services/GuardianService.ts`
3. Create `apps/server/src/guardian/Layers/OutputWatcher.ts` for streaming output analysis
4. Integrate with `ProviderRuntimeIngestion.ts` to watch provider outputs
5. Add Guardian UI panel in ChatView (collapsible sidebar showing active suggestions)
6. Add `/guardian` slash command to toggle on/off

**Complexity:** Low-Medium
**Impact:** High (directly improves AI capability utilization)

#### 2.2 Guardian Learning

**Problem:** Fixed patterns miss many cases.

**Implementation:**

- Allow users to add custom guardian patterns via settings
- Track which suggestions were accepted/rejected to learn preferences
- Store pattern preferences per-project

**Complexity:** Medium
**Impact:** Medium

---

## Phase 3: ValoVoice Pipeline (Priority: HIGH)

### Why Third?

Voice input is a major quality-of-life improvement for vibe coding. It's not about transcribing—it's about having a faster, more natural input that can be enhanced with codebase awareness.

### Features

#### 3.1 Voice Input Infrastructure

**Problem:** Native speech-to-text is slow and not code-aware.

**Valo Solution:** Faster Whisper + Haiku as cleanup layer. Haiku adds codebase context to transcription, translates speech patterns to proper coding terms.

**Implementation:**

```
Location: apps/server/src/voice/Services/VoiceService.ts (new)

Interface:
- startRecording(projectId): streamId
- stopRecording(streamId): AudioSegment
- transcribe(streamId, options): Transcription
- enhanceWithContext(transcription, projectContext): EnhancedTranscription

EnhancedTranscription:
{
  original: string
  enhanced: string
  corrections: { original: string, corrected: string, reason: string }[]
  codeReferences: { term: string, file: string, line: number }[]
}
```

**Implementation Steps:**

1. Create `packages/contracts/src/voice.ts` with voice schemas
2. Create `apps/server/src/voice/Services/VoiceService.ts` with Faster Whisper integration
3. Create `apps/server/src/voice/Services/ContextEnhancer.ts` using Haiku for code-aware cleanup
4. Add WebSocket endpoint for streaming audio
5. Add voice input UI in ComposerPromptEditor (microphone button)
6. Add voice settings in Settings (model selection, language, etc.)

**Complexity:** High (requires native module integration)
**Impact:** Very High (transforms input experience)

#### 3.2 Voice Command Recognition

**Problem:** Voice input should understand commands like "run this" or "explain what I just said".

**Implementation:**

- Add voice command prefix detection ("computer, run this")
- Map voice commands to slash commands
- Add visual feedback for recognized commands

**Complexity:** Medium
**Impact:** Medium

---

## Phase 4: Multi-Agent Simultaneous Orchestration (Priority: HIGH)

### Why Fourth?

This is what separates "better chat" from "control room". Running agents in parallel on complex tasks.

### Features

#### 4.1 Agent Session Coordinator

**Problem:** Current architecture routes to one provider at a time per thread.

**Implementation:**

```
Location: apps/server/src/multiagent/Services/AgentCoordinator.ts (new)

Interface:
- createAgentSession(projectId, provider, config): agentSessionId
- coordinateAgents(projectId, taskGraph): CoordinationResult
- getAgentStatus(agentSessionId): AgentStatus
- terminateAgent(agentSessionId): void

TaskGraph:
{
  nodes: { id: string, task: string, provider: ProviderType, dependsOn: string[] }[]
  execution: "parallel" | "sequential" | "dependency_based"
}
```

**Implementation Steps:**

1. Extend `ProviderService.ts` to support multiple concurrent sessions
2. Create `apps/server/src/multiagent/Services/AgentCoordinator.ts`
3. Create `apps/server/src/multiagent/Layers/TaskRouter.ts` for distributing tasks
4. Add multi-agent UI in project sidebar showing all active agents
5. Add agent timeline view showing task dependencies

**Complexity:** High (requires architectural changes to provider layer)
**Impact:** Very High (enables parallel workflows)

#### 4.2 Process Isolation

**Problem:** Agent crashes can take down the whole system.

**Valo Solution:** Paginated subprocess management with isolation boundaries.

**Implementation:**

- Create `apps/server/src/multiagent/Services/ProcessManager.ts`
- Implement subprocess pagination with event stream isolation
- Add crash recovery with state restoration
- Add resource monitoring per agent

**Complexity:** High
**Impact:** High (reliability)

#### 4.3 Agent Communication Protocol

**Problem:** Agents need to coordinate without overwriting each other's context.

**Implementation:**

- Add inter-agent message types to `orchestration.ts`
- Create agent inbox/outbox system
- Add shared context regions for agent-to-agent communication
- Implement "agent can read X but not write" permissions

**Complexity:** High
**Impact:** High (foundational for multi-agent)

---

## Phase 5: Visual Orchestration Dashboard (Priority: MEDIUM)

### Why Fifth?

Visibility is a core part of the control room philosophy. Need to see everything at a glance.

### Features

#### 5.1 Project Dashboard

**Problem:** Need a unified view of all projects, threads, and agents.

**Implementation:**

```
Location: apps/web/src/components/Dashboard/DashboardView.tsx (new)

Features:
- Project cards with status, last activity, active agents
- Quick actions: open project, create thread, spawn agent
- Activity feed showing recent events across all projects
- Context budget overview per project
```

**Implementation Steps:**

1. Create `apps/web/src/components/Dashboard/` directory
2. Create `DashboardView.tsx` with project overview
3. Create `AgentStatusPanel.tsx` for active agent monitoring
4. Create `ActivityFeed.tsx` for real-time event stream
5. Add dashboard route in TanStack Router

**Complexity:** Medium
**Impact:** Medium

#### 5.2 Agent Process Monitor

**Problem:** Can't see what agents are doing in real-time.

**Implementation:**

- Add streaming output panel per agent
- Show tool calls, reasoning, token usage
- Add "pause", "resume", "interrupt" controls
- Add cost tracking per agent

**Complexity:** Medium
**Impact:** High

#### 5.3 Timeline View

**Problem:** Need to see the full history of a project/thread.

**Implementation:**

- Create horizontal timeline view of all events
- Color-coded by agent/provider
- Zoomable/pannable
- Exportable as JSON/MD

**Complexity:** Medium
**Impact:** Medium

---

## Phase 6: Apply/Review System (Priority: HIGH)

### Why Sixth?

Structured review is how you maintain quality with AI-generated content.

### Features

#### 6.1 Review Queue

**Problem:** AI outputs go directly into the codebase without structured review.

**Implementation:**

```
Location: apps/server/src/review/Services/ReviewQueue.ts (new)

Interface:
- createReview(reviewable): reviewId
- approveReview(reviewId): void
- rejectReview(reviewId, reason): void
- requestChanges(reviewId, changes): void

Review States: pending | approved | rejected | changes_requested
```

**Implementation Steps:**

1. Create `packages/contracts/src/review.ts` with Review schemas
2. Create `apps/server/src/review/Services/ReviewQueue.ts`
3. Create review API endpoints in `wsServer.ts`
4. Add review UI panel in ChatView (shows pending reviews)
5. Add diff view for reviewing file changes

**Complexity:** Medium
**Impact:** High (quality control)

#### 6.2 Structured Diff Panel

**Problem:** Current diff panel is basic.

**Implementation:**

- Side-by-side diff with syntax highlighting
- Inline comment threads on specific lines
- Approve/reject per-file in multi-file changes
- "Apply selected" to apply only approved files

**Complexity:** Medium
**Impact:** Medium

#### 6.3 Checkpoint Integration

**Problem:** Need to rollback when reviews reject changes.

**Implementation:**

- Auto-create checkpoint before applying AI changes
- Add rollback UI in review panel
- Add checkpoint comparison in diff view

**Complexity:** Low-Medium
**Impact:** High

---

## Phase 7: Enhanced Testing Infrastructure (Priority: MEDIUM)

### Why Seventh?

Valo has 66+ tests per feature. CUT3 has minimal tests. This is a reliability gap.

### Features

#### 7.1 Test Coverage Goals

**Problem:** Current test coverage is minimal.

**Implementation:**

- Establish minimum 66 tests per major feature
- Use multi-agent verification (researcher, reviewer, challenger agents)
- Add property-based testing for context management
- Add integration tests for WebSocket protocol

**Test Structure:**

```
Feature: Context Management
├── Unit Tests
│   ├── TombstoneManager.test.ts (15 tests)
│   ├── ContextTrimmer.test.ts (20 tests)
│   └── ContextBudgetService.test.ts (10 tests)
├── Integration Tests
│   ├── ContextIntegration.test.ts (10 tests)
│   └── MultiProviderContext.test.ts (8 tests)
└── E2E Tests
    └── TombstoneWorkflow.test.ts (3 tests)
```

**Complexity:** Medium
**Impact:** High (reliability)

---

## Phase 8: Content Canvas (Future - LOW Priority)

### Why Eighth?

The vision extends beyond code. But code first.

### Features

#### 8.1 Flashboards Integration

**Problem:** Need visual canvas for video/image workflow.

**Implementation:**

- Add canvas project type
- Integrate Flashboards-style drag-and-drop
- Link canvas elements to code artifacts
- Add AI generation for images/video

**Complexity:** High
**Impact:** Low (future)

#### 8.2 Flora Integration

**Problem:** Need AI image generation in workflow.

**Implementation:**

- Add Flora as a provider
- Support image generation as a tool
- Add image review to review queue
- Link generated images to code projects

**Complexity:** High
**Impact:** Low (future)

---

## Priority Matrix

| Phase | Feature                         | Complexity | Impact    | Priority |
| ----- | ------------------------------- | ---------- | --------- | -------- |
| 1     | Context Management (Tombstones) | Medium     | High      | CRITICAL |
| 1     | Context Budget System           | Medium     | Medium    | HIGH     |
| 2     | Guardian System                 | Low-Medium | High      | HIGH     |
| 3     | ValoVoice Pipeline              | High       | Very High | HIGH     |
| 4     | Multi-Agent Orchestration       | High       | Very High | HIGH     |
| 5     | Visual Dashboard                | Medium     | Medium    | MEDIUM   |
| 6     | Apply/Review System             | Medium     | High      | HIGH     |
| 7     | Testing Infrastructure          | Medium     | High      | MEDIUM   |
| 8     | Content Canvas                  | High       | Low       | LOW      |

---

## Quick Wins (Can Start Immediately)

1. **Guardian System** - Low complexity, high impact, can be added in 1-2 weeks
2. **Context Budget UI** - Just visualization, minimal backend changes
3. **Enhanced Diff Panel** - Mostly frontend work
4. **Slash Command Expansion** - Low complexity, high usability

---

## Implementation Notes

### Architecture Principles

1. **Event Sourcing First** - All new features should use event sourcing like existing orchestration layer
2. **Provider Adapter Pattern** - Continue using adapters for new provider integrations
3. **Process Isolation** - Multi-agent must isolate processes to prevent cascade failures
4. **Schema Contracts** - All new features need contracts in `packages/contracts`

### Testing Requirements

Per AGENTS.md:

- All new code must pass `bun run fmt`, `bun run lint`, `bun run typecheck`
- Use `bun run test` (Vitest) for all tests
- 66+ tests per major feature
- Multi-agent verification for critical paths

### Documentation Requirements

- Update relevant `.docs/*.md` files when adding features
- Keep `AGENTS.md` aligned with new conventions
- Document all new slash commands in README.md

---

_Last updated: Based on Valo transcript analysis and Rowl codebase review_
