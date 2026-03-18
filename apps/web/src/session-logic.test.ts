import { EventId, MessageId, TurnId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  deriveActiveWorkStartedAt,
  deriveActivePlanState,
  deriveConfiguredModelOptions,
  deriveConfiguredModelOptionsFromActivityGroups,
  deriveLatestModelRerouteNotice,
  getProviderPickerBackingProvider,
  getProviderPickerKindForSelection,
  PROVIDER_OPTIONS,
  derivePendingApprovals,
  derivePendingUserInputs,
  deriveTimelineEntries,
  deriveWorkLogEntries,
  findLatestProposedPlan,
  hasToolActivityForTurn,
  isLatestTurnSettled,
} from "./session-logic";

function makeActivity(overrides: {
  id?: string;
  createdAt?: string;
  kind?: string;
  summary?: string;
  tone?: OrchestrationThreadActivity["tone"];
  payload?: Record<string, unknown>;
  turnId?: string;
  sequence?: number;
}): OrchestrationThreadActivity {
  const payload = overrides.payload ?? {};
  return {
    id: EventId.makeUnsafe(overrides.id ?? crypto.randomUUID()),
    createdAt: overrides.createdAt ?? "2026-02-23T00:00:00.000Z",
    kind: overrides.kind ?? "tool.started",
    summary: overrides.summary ?? "Tool call",
    tone: overrides.tone ?? "tool",
    payload,
    turnId: overrides.turnId ? TurnId.makeUnsafe(overrides.turnId) : null,
    ...(overrides.sequence !== undefined ? { sequence: overrides.sequence } : {}),
  };
}

describe("derivePendingApprovals", () => {
  it("tracks open approvals and removes resolved ones", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "approval-open",
        createdAt: "2026-02-23T00:00:01.000Z",
        kind: "approval.requested",
        summary: "Command approval requested",
        tone: "approval",
        payload: {
          requestId: "req-1",
          requestKind: "command",
          detail: "bun run lint",
        },
      }),
      makeActivity({
        id: "approval-close",
        createdAt: "2026-02-23T00:00:02.000Z",
        kind: "approval.resolved",
        summary: "Approval resolved",
        tone: "info",
        payload: { requestId: "req-2" },
      }),
      makeActivity({
        id: "approval-closed-request",
        createdAt: "2026-02-23T00:00:01.500Z",
        kind: "approval.requested",
        summary: "File-change approval requested",
        tone: "approval",
        payload: { requestId: "req-2", requestKind: "file-change" },
      }),
    ];

    expect(derivePendingApprovals(activities)).toEqual([
      {
        requestId: "req-1",
        requestKind: "command",
        createdAt: "2026-02-23T00:00:01.000Z",
        detail: "bun run lint",
      },
    ]);
  });

  it("maps canonical requestType payloads into pending approvals", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "approval-open-request-type",
        createdAt: "2026-02-23T00:00:01.000Z",
        kind: "approval.requested",
        summary: "Command approval requested",
        tone: "approval",
        payload: {
          requestId: "req-request-type",
          requestType: "command_execution_approval",
          detail: "pwd",
        },
      }),
    ];

    expect(derivePendingApprovals(activities)).toEqual([
      {
        requestId: "req-request-type",
        requestKind: "command",
        createdAt: "2026-02-23T00:00:01.000Z",
        detail: "pwd",
      },
    ]);
  });

  it("clears stale pending approvals when provider reports unknown pending request", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "approval-open-stale",
        createdAt: "2026-02-23T00:00:01.000Z",
        kind: "approval.requested",
        summary: "Command approval requested",
        tone: "approval",
        payload: {
          requestId: "req-stale-1",
          requestKind: "command",
        },
      }),
      makeActivity({
        id: "approval-failed-stale",
        createdAt: "2026-02-23T00:00:02.000Z",
        kind: "provider.approval.respond.failed",
        summary: "Provider approval response failed",
        tone: "error",
        payload: {
          requestId: "req-stale-1",
          detail: "Unknown pending permission request: req-stale-1",
        },
      }),
    ];

    expect(derivePendingApprovals(activities)).toEqual([]);
  });

  it("ignores approvals from before the active session started", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "approval-old",
        createdAt: "2026-02-23T00:00:01.000Z",
        kind: "approval.requested",
        summary: "Old approval requested",
        tone: "approval",
        payload: {
          requestId: "req-old",
          requestKind: "command",
        },
      }),
      makeActivity({
        id: "approval-new",
        createdAt: "2026-02-23T00:00:03.000Z",
        kind: "approval.requested",
        summary: "New approval requested",
        tone: "approval",
        payload: {
          requestId: "req-new",
          requestKind: "file-change",
        },
      }),
    ];

    expect(derivePendingApprovals(activities, "2026-02-23T00:00:02.000Z")).toEqual([
      {
        requestId: "req-new",
        requestKind: "file-change",
        createdAt: "2026-02-23T00:00:03.000Z",
      },
    ]);
  });
});

describe("derivePendingUserInputs", () => {
  it("tracks open structured prompts and removes resolved ones", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "user-input-open",
        createdAt: "2026-02-23T00:00:01.000Z",
        kind: "user-input.requested",
        summary: "User input requested",
        tone: "info",
        payload: {
          requestId: "req-user-input-1",
          questions: [
            {
              id: "sandbox_mode",
              header: "Sandbox",
              question: "Which mode should be used?",
              options: [
                {
                  label: "workspace-write",
                  description: "Allow workspace writes only",
                },
              ],
            },
          ],
        },
      }),
      makeActivity({
        id: "user-input-resolved",
        createdAt: "2026-02-23T00:00:02.000Z",
        kind: "user-input.resolved",
        summary: "User input submitted",
        tone: "info",
        payload: {
          requestId: "req-user-input-2",
          answers: {
            sandbox_mode: "workspace-write",
          },
        },
      }),
      makeActivity({
        id: "user-input-open-2",
        createdAt: "2026-02-23T00:00:01.500Z",
        kind: "user-input.requested",
        summary: "User input requested",
        tone: "info",
        payload: {
          requestId: "req-user-input-2",
          questions: [
            {
              id: "approval",
              header: "Approval",
              question: "Continue?",
              options: [
                {
                  label: "yes",
                  description: "Continue execution",
                },
              ],
            },
          ],
        },
      }),
    ];

    expect(derivePendingUserInputs(activities)).toEqual([
      {
        requestId: "req-user-input-1",
        createdAt: "2026-02-23T00:00:01.000Z",
        questions: [
          {
            id: "sandbox_mode",
            header: "Sandbox",
            question: "Which mode should be used?",
            options: [
              {
                label: "workspace-write",
                description: "Allow workspace writes only",
              },
            ],
          },
        ],
      },
    ]);
  });

  it("ignores structured prompts from before the active session started", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "user-input-old",
        createdAt: "2026-02-23T00:00:01.000Z",
        kind: "user-input.requested",
        summary: "Old user input requested",
        tone: "info",
        payload: {
          requestId: "req-user-old",
          questions: [
            {
              id: "old",
              header: "Old",
              question: "Old question?",
              options: [{ label: "yes", description: "Yes" }],
            },
          ],
        },
      }),
      makeActivity({
        id: "user-input-new",
        createdAt: "2026-02-23T00:00:03.000Z",
        kind: "user-input.requested",
        summary: "New user input requested",
        tone: "info",
        payload: {
          requestId: "req-user-new",
          questions: [
            {
              id: "new",
              header: "New",
              question: "New question?",
              options: [{ label: "ok", description: "Continue" }],
            },
          ],
        },
      }),
    ];

    expect(derivePendingUserInputs(activities, "2026-02-23T00:00:02.000Z")).toEqual([
      {
        requestId: "req-user-new",
        createdAt: "2026-02-23T00:00:03.000Z",
        questions: [
          {
            id: "new",
            header: "New",
            question: "New question?",
            options: [{ label: "ok", description: "Continue" }],
          },
        ],
      },
    ]);
  });
});

describe("deriveConfiguredModelOptions", () => {
  it("returns the latest configured model catalog for the requested provider", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "session-configured-copilot",
        createdAt: "2026-02-23T00:00:01.000Z",
        kind: "session.configured",
        summary: "Session configured",
        tone: "info",
        payload: {
          provider: "copilot",
          config: {
            currentModelId: "claude-sonnet-4.5",
            availableModels: [{ modelId: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" }],
          },
        },
      }),
      makeActivity({
        id: "session-configured-kimi-old",
        createdAt: "2026-02-23T00:00:02.000Z",
        kind: "session.configured",
        summary: "Session configured",
        tone: "info",
        payload: {
          provider: "kimi",
          config: {
            currentModelId: "kimi-for-coding",
            availableModels: [{ modelId: "kimi-for-coding", name: "Kimi for Coding" }],
          },
        },
      }),
      makeActivity({
        id: "session-configured-kimi-new",
        createdAt: "2026-02-23T00:00:03.000Z",
        kind: "session.configured",
        summary: "Session configured",
        tone: "info",
        payload: {
          provider: "kimi",
          config: {
            currentModelId: "kimi-k2-thinking",
            availableModels: [
              { modelId: "kimi-for-coding", name: "Kimi for Coding" },
              { modelId: "kimi-k2-thinking", name: "Kimi K2 Thinking" },
            ],
          },
        },
      }),
    ];

    expect(deriveConfiguredModelOptions(activities, "kimi")).toEqual([
      { slug: "kimi-for-coding", name: "Kimi for Coding" },
      { slug: "kimi-k2-thinking", name: "Kimi K2 Thinking" },
    ]);
    expect(deriveConfiguredModelOptions(activities, "copilot")).toEqual([
      { slug: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    ]);
  });

  it("reuses the newest configured catalog across different threads", () => {
    const olderThreadActivities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "session-configured-kimi-old",
        createdAt: "2026-02-23T00:00:02.000Z",
        kind: "session.configured",
        summary: "Session configured",
        tone: "info",
        payload: {
          provider: "kimi",
          config: {
            currentModelId: "kimi-for-coding",
            availableModels: [{ modelId: "kimi-for-coding", name: "Kimi for Coding" }],
          },
        },
      }),
    ];
    const newerThreadActivities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "session-configured-kimi-new",
        createdAt: "2026-02-23T00:00:03.000Z",
        kind: "session.configured",
        summary: "Session configured",
        tone: "info",
        payload: {
          provider: "kimi",
          config: {
            currentModelId: "kimi-k2-thinking",
            availableModels: [
              { modelId: "kimi-for-coding", name: "Kimi for Coding" },
              { modelId: "kimi-k2-thinking", name: "Kimi K2 Thinking" },
            ],
          },
        },
      }),
    ];

    expect(
      deriveConfiguredModelOptionsFromActivityGroups(
        [olderThreadActivities, newerThreadActivities],
        "kimi",
      ),
    ).toEqual([
      { slug: "kimi-for-coding", name: "Kimi for Coding" },
      { slug: "kimi-k2-thinking", name: "Kimi K2 Thinking" },
    ]);
  });

  it("formats raw Kimi current model ids when ACP omits display names", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "session-configured-kimi-raw",
        createdAt: "2026-02-23T00:00:03.000Z",
        kind: "session.configured",
        summary: "Session configured",
        tone: "info",
        payload: {
          provider: "kimi",
          config: {
            currentModelId: "kimi-code/kimi-for-coding,thinking",
            availableModels: [],
          },
        },
      }),
    ];

    expect(deriveConfiguredModelOptions(activities, "kimi")).toEqual([
      {
        slug: "kimi-code/kimi-for-coding,thinking",
        name: "Kimi for Coding · Thinking",
      },
    ]);
  });
});

describe("deriveActivePlanState", () => {
  it("returns the latest plan update for the active turn", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "plan-old",
        createdAt: "2026-02-23T00:00:01.000Z",
        kind: "turn.plan.updated",
        summary: "Plan updated",
        tone: "info",
        turnId: "turn-1",
        payload: {
          explanation: "Initial plan",
          plan: [{ step: "Inspect code", status: "pending" }],
        },
      }),
      makeActivity({
        id: "plan-latest",
        createdAt: "2026-02-23T00:00:02.000Z",
        kind: "turn.plan.updated",
        summary: "Plan updated",
        tone: "info",
        turnId: "turn-1",
        payload: {
          explanation: "Refined plan",
          plan: [{ step: "Implement Codex user input", status: "inProgress" }],
        },
      }),
    ];

    expect(deriveActivePlanState(activities, TurnId.makeUnsafe("turn-1"))).toEqual({
      createdAt: "2026-02-23T00:00:02.000Z",
      turnId: "turn-1",
      explanation: "Refined plan",
      steps: [{ step: "Implement Codex user input", status: "inProgress" }],
    });
  });
});

describe("findLatestProposedPlan", () => {
  it("prefers the latest proposed plan for the active turn", () => {
    expect(
      findLatestProposedPlan(
        [
          {
            id: "plan:thread-1:turn:turn-1",
            turnId: TurnId.makeUnsafe("turn-1"),
            planMarkdown: "# Older",
            createdAt: "2026-02-23T00:00:01.000Z",
            updatedAt: "2026-02-23T00:00:01.000Z",
          },
          {
            id: "plan:thread-1:turn:turn-1",
            turnId: TurnId.makeUnsafe("turn-1"),
            planMarkdown: "# Latest",
            createdAt: "2026-02-23T00:00:01.000Z",
            updatedAt: "2026-02-23T00:00:02.000Z",
          },
          {
            id: "plan:thread-1:turn:turn-2",
            turnId: TurnId.makeUnsafe("turn-2"),
            planMarkdown: "# Different turn",
            createdAt: "2026-02-23T00:00:03.000Z",
            updatedAt: "2026-02-23T00:00:03.000Z",
          },
        ],
        TurnId.makeUnsafe("turn-1"),
      ),
    ).toEqual({
      id: "plan:thread-1:turn:turn-1",
      turnId: "turn-1",
      planMarkdown: "# Latest",
      createdAt: "2026-02-23T00:00:01.000Z",
      updatedAt: "2026-02-23T00:00:02.000Z",
    });
  });

  it("falls back to the most recently updated proposed plan", () => {
    const latestPlan = findLatestProposedPlan(
      [
        {
          id: "plan:thread-1:turn:turn-1",
          turnId: TurnId.makeUnsafe("turn-1"),
          planMarkdown: "# First",
          createdAt: "2026-02-23T00:00:01.000Z",
          updatedAt: "2026-02-23T00:00:01.000Z",
        },
        {
          id: "plan:thread-1:turn:turn-2",
          turnId: TurnId.makeUnsafe("turn-2"),
          planMarkdown: "# Latest",
          createdAt: "2026-02-23T00:00:02.000Z",
          updatedAt: "2026-02-23T00:00:03.000Z",
        },
      ],
      null,
    );

    expect(latestPlan?.planMarkdown).toBe("# Latest");
  });
});

describe("deriveWorkLogEntries", () => {
  it("omits tool started entries and keeps completed entries", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "tool-complete",
        createdAt: "2026-02-23T00:00:03.000Z",
        summary: "Tool call complete",
        kind: "tool.completed",
      }),
      makeActivity({
        id: "tool-start",
        createdAt: "2026-02-23T00:00:02.000Z",
        summary: "Tool call",
        kind: "tool.started",
      }),
    ];

    const entries = deriveWorkLogEntries(activities, undefined);
    expect(entries.map((entry) => entry.id)).toEqual(["tool-complete"]);
  });

  it("omits task start and completion lifecycle entries", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "task-start",
        createdAt: "2026-02-23T00:00:01.000Z",
        kind: "task.started",
        summary: "default task started",
        tone: "info",
      }),
      makeActivity({
        id: "task-progress",
        createdAt: "2026-02-23T00:00:02.000Z",
        kind: "task.progress",
        summary: "Updating files",
        tone: "info",
      }),
      makeActivity({
        id: "task-complete",
        createdAt: "2026-02-23T00:00:03.000Z",
        kind: "task.completed",
        summary: "Task completed",
        tone: "info",
      }),
    ];

    const entries = deriveWorkLogEntries(activities, undefined);
    expect(entries.map((entry) => entry.id)).toEqual(["task-progress"]);
  });

  it("filters by turn id when provided", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({ id: "turn-1", turnId: "turn-1", summary: "Tool call", kind: "tool.started" }),
      makeActivity({
        id: "turn-2",
        turnId: "turn-2",
        summary: "Tool call complete",
        kind: "tool.completed",
      }),
      makeActivity({ id: "no-turn", summary: "Checkpoint captured", tone: "info" }),
    ];

    const entries = deriveWorkLogEntries(activities, TurnId.makeUnsafe("turn-2"));
    expect(entries.map((entry) => entry.id)).toEqual(["turn-2"]);
  });

  it("omits checkpoint captured info entries", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "checkpoint",
        createdAt: "2026-02-23T00:00:01.000Z",
        summary: "Checkpoint captured",
        tone: "info",
      }),
      makeActivity({
        id: "tool-complete",
        createdAt: "2026-02-23T00:00:02.000Z",
        summary: "Ran command",
        tone: "tool",
        kind: "tool.completed",
      }),
    ];

    const entries = deriveWorkLogEntries(activities, undefined);
    expect(entries.map((entry) => entry.id)).toEqual(["tool-complete"]);
  });

  it("orders work log by activity sequence when present", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "second",
        createdAt: "2026-02-23T00:00:03.000Z",
        sequence: 2,
        summary: "Tool call complete",
        kind: "tool.completed",
      }),
      makeActivity({
        id: "first",
        createdAt: "2026-02-23T00:00:04.000Z",
        sequence: 1,
        summary: "Tool call complete",
        kind: "tool.completed",
      }),
    ];

    const entries = deriveWorkLogEntries(activities, undefined);
    expect(entries.map((entry) => entry.id)).toEqual(["first", "second"]);
  });

  it("extracts command text for command tool activities", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "command-tool",
        kind: "tool.completed",
        summary: "Ran command",
        payload: {
          itemType: "command_execution",
          data: {
            item: {
              command: ["bun", "run", "lint"],
            },
          },
        },
      }),
    ];

    const [entry] = deriveWorkLogEntries(activities, undefined);
    expect(entry?.command).toBe("bun run lint");
  });

  it("keeps compact Codex tool metadata used for icons and labels", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "tool-with-metadata",
        kind: "tool.completed",
        summary: "bash",
        payload: {
          itemType: "command_execution",
          title: "bash",
          status: "completed",
          detail: '{ "dev": "vite dev --port 3000" } <exited with exit code 0>',
          data: {
            item: {
              command: ["bun", "run", "dev"],
              result: {
                content: '{ "dev": "vite dev --port 3000" } <exited with exit code 0>',
                exitCode: 0,
              },
            },
          },
        },
      }),
    ];

    const [entry] = deriveWorkLogEntries(activities, undefined);
    expect(entry).toMatchObject({
      command: "bun run dev",
      detail: '{ "dev": "vite dev --port 3000" }',
      itemType: "command_execution",
      toolTitle: "bash",
    });
  });

  it("extracts changed file paths for file-change tool activities", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "file-tool",
        kind: "tool.completed",
        summary: "File change",
        payload: {
          itemType: "file_change",
          data: {
            item: {
              changes: [
                { path: "apps/web/src/components/ChatView.tsx" },
                { filename: "apps/web/src/session-logic.ts" },
              ],
            },
          },
        },
      }),
    ];

    const [entry] = deriveWorkLogEntries(activities, undefined);
    expect(entry?.changedFiles).toEqual([
      "apps/web/src/components/ChatView.tsx",
      "apps/web/src/session-logic.ts",
    ]);
  });
});

describe("deriveTimelineEntries", () => {
  it("includes proposed plans alongside messages and work entries in chronological order", () => {
    const entries = deriveTimelineEntries(
      [
        {
          id: MessageId.makeUnsafe("message-1"),
          role: "assistant",
          text: "hello",
          createdAt: "2026-02-23T00:00:01.000Z",
          streaming: false,
        },
      ],
      [
        {
          id: "plan:thread-1:turn:turn-1",
          turnId: TurnId.makeUnsafe("turn-1"),
          planMarkdown: "# Ship it",
          createdAt: "2026-02-23T00:00:02.000Z",
          updatedAt: "2026-02-23T00:00:02.000Z",
        },
      ],
      [
        {
          id: "work-1",
          createdAt: "2026-02-23T00:00:03.000Z",
          label: "Ran tests",
          tone: "tool",
        },
      ],
    );

    expect(entries.map((entry) => entry.kind)).toEqual(["message", "proposed-plan", "work"]);
    expect(entries[1]).toMatchObject({
      kind: "proposed-plan",
      proposedPlan: {
        planMarkdown: "# Ship it",
      },
    });
  });
});

describe("hasToolActivityForTurn", () => {
  it("returns false when turn id is missing", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({ id: "tool-1", turnId: "turn-1", kind: "tool.completed", tone: "tool" }),
    ];

    expect(hasToolActivityForTurn(activities, undefined)).toBe(false);
    expect(hasToolActivityForTurn(activities, null)).toBe(false);
  });

  it("returns true only for matching tool activity in the target turn", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({ id: "tool-1", turnId: "turn-1", kind: "tool.completed", tone: "tool" }),
      makeActivity({ id: "info-1", turnId: "turn-2", kind: "turn.completed", tone: "info" }),
    ];

    expect(hasToolActivityForTurn(activities, TurnId.makeUnsafe("turn-1"))).toBe(true);
    expect(hasToolActivityForTurn(activities, TurnId.makeUnsafe("turn-2"))).toBe(false);
  });
});

describe("deriveLatestModelRerouteNotice", () => {
  it("returns the newest reroute notice for the active turn", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "reroute-old",
        createdAt: "2026-02-23T00:00:03.000Z",
        kind: "model.rerouted",
        summary: "Model rerouted",
        tone: "info",
        turnId: "turn-1",
        payload: {
          fromModel: "openai/gpt-oss-120b:free",
          toModel: "openrouter/free",
          reason: "OpenRouter ran out of free capacity.",
        },
      }),
      makeActivity({
        id: "reroute-new",
        createdAt: "2026-02-23T00:00:04.000Z",
        kind: "model.rerouted",
        summary: "Model rerouted",
        tone: "info",
        turnId: "turn-2",
        payload: {
          fromModel: "qwen/qwen3-coder:free",
          toModel: "openrouter/free",
          reason: "OpenRouter could not serve the pinned model.",
        },
      }),
    ];

    expect(deriveLatestModelRerouteNotice(activities, TurnId.makeUnsafe("turn-2"))).toEqual({
      createdAt: "2026-02-23T00:00:04.000Z",
      turnId: "turn-2",
      fromModel: "qwen/qwen3-coder:free",
      toModel: "openrouter/free",
      reason: "OpenRouter could not serve the pinned model.",
    });
  });

  it("returns null when no reroute notice matches the current turn", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        id: "reroute-other-turn",
        createdAt: "2026-02-23T00:00:03.000Z",
        kind: "model.rerouted",
        summary: "Model rerouted",
        tone: "info",
        turnId: "turn-1",
        payload: {
          fromModel: "openai/gpt-oss-120b:free",
          toModel: "openrouter/free",
          reason: "OpenRouter ran out of free capacity.",
        },
      }),
    ];

    expect(deriveLatestModelRerouteNotice(activities, TurnId.makeUnsafe("turn-2"))).toBeNull();
  });
});

describe("isLatestTurnSettled", () => {
  const latestTurn = {
    turnId: TurnId.makeUnsafe("turn-1"),
    startedAt: "2026-02-27T21:10:00.000Z",
    completedAt: "2026-02-27T21:10:06.000Z",
  } as const;

  it("returns false while the same turn is still active in a running session", () => {
    expect(
      isLatestTurnSettled(latestTurn, {
        orchestrationStatus: "running",
        activeTurnId: TurnId.makeUnsafe("turn-1"),
      }),
    ).toBe(false);
  });

  it("returns false while any turn is running to avoid stale latest-turn banners", () => {
    expect(
      isLatestTurnSettled(latestTurn, {
        orchestrationStatus: "running",
        activeTurnId: TurnId.makeUnsafe("turn-2"),
      }),
    ).toBe(false);
  });

  it("returns true once the session is no longer running that turn", () => {
    expect(
      isLatestTurnSettled(latestTurn, {
        orchestrationStatus: "ready",
        activeTurnId: undefined,
      }),
    ).toBe(true);
  });

  it("returns false when turn timestamps are incomplete", () => {
    expect(
      isLatestTurnSettled(
        {
          turnId: TurnId.makeUnsafe("turn-1"),
          startedAt: null,
          completedAt: "2026-02-27T21:10:06.000Z",
        },
        null,
      ),
    ).toBe(false);
  });
});

describe("deriveActiveWorkStartedAt", () => {
  const latestTurn = {
    turnId: TurnId.makeUnsafe("turn-1"),
    startedAt: "2026-02-27T21:10:00.000Z",
    completedAt: "2026-02-27T21:10:06.000Z",
  } as const;

  it("prefers the in-flight turn start when the latest turn is not settled", () => {
    expect(
      deriveActiveWorkStartedAt(
        latestTurn,
        {
          orchestrationStatus: "running",
          activeTurnId: TurnId.makeUnsafe("turn-1"),
        },
        "2026-02-27T21:11:00.000Z",
      ),
    ).toBe("2026-02-27T21:10:00.000Z");
  });

  it("falls back to sendStartedAt once the latest turn is settled", () => {
    expect(
      deriveActiveWorkStartedAt(
        latestTurn,
        {
          orchestrationStatus: "ready",
          activeTurnId: undefined,
        },
        "2026-02-27T21:11:00.000Z",
      ),
    ).toBe("2026-02-27T21:11:00.000Z");
  });

  it("uses sendStartedAt for a fresh send after the prior turn completed", () => {
    expect(
      deriveActiveWorkStartedAt(
        {
          turnId: TurnId.makeUnsafe("turn-1"),
          startedAt: "2026-02-27T21:10:00.000Z",
          completedAt: "2026-02-27T21:10:06.000Z",
        },
        null,
        "2026-02-27T21:11:00.000Z",
      ),
    ).toBe("2026-02-27T21:11:00.000Z");
  });
});

describe("PROVIDER_OPTIONS", () => {
  it("keeps Claude Code and Cursor visible as unavailable placeholders in the stack base", () => {
    const claude = PROVIDER_OPTIONS.find((option) => option.value === "claudeCode");
    const cursor = PROVIDER_OPTIONS.find((option) => option.value === "cursor");
    expect(PROVIDER_OPTIONS).toEqual([
      { value: "codex", label: "Codex", available: true },
      { value: "openrouter", label: "OpenRouter", available: true },
      { value: "copilot", label: "GitHub Copilot", available: true },
      { value: "kimi", label: "Kimi Code", available: true },
      { value: "opencode", label: "OpenCode", available: true },
      { value: "claudeCode", label: "Claude Code", available: false },
      { value: "cursor", label: "Cursor", available: false },
    ]);
    expect(claude).toEqual({
      value: "claudeCode",
      label: "Claude Code",
      available: false,
    });
    expect(cursor).toEqual({
      value: "cursor",
      label: "Cursor",
      available: false,
    });
  });
});

describe("getProviderPickerBackingProvider", () => {
  it("maps OpenRouter back to Codex while keeping other available providers stable", () => {
    expect(getProviderPickerBackingProvider("codex")).toBe("codex");
    expect(getProviderPickerBackingProvider("openrouter")).toBe("codex");
    expect(getProviderPickerBackingProvider("copilot")).toBe("copilot");
    expect(getProviderPickerBackingProvider("kimi")).toBe("kimi");
    expect(getProviderPickerBackingProvider("opencode")).toBe("opencode");
    expect(getProviderPickerBackingProvider("claudeCode")).toBeNull();
  });
});

describe("getProviderPickerKindForSelection", () => {
  it("surfaces OpenRouter-routed Codex models as the OpenRouter picker section", () => {
    expect(getProviderPickerKindForSelection("codex", "openrouter/free")).toBe("openrouter");
    expect(getProviderPickerKindForSelection("codex", "gpt-5")).toBe("codex");
    expect(getProviderPickerKindForSelection("copilot", "claude-sonnet-4.6")).toBe("copilot");
    expect(getProviderPickerKindForSelection("opencode", "opencode/default")).toBe("opencode");
  });
});
