import { describe, expect, it } from "vitest";

import type { Thread } from "./types";
import { resolveForkThreadDraftSettings } from "./threadForking";

function makeThread(overrides?: Partial<Thread>): Thread {
  return {
    id: "thread-1" as never,
    codexThreadId: null,
    projectId: "project-1" as never,
    title: "Thread",
    goal: null,
    provider: "opencode",
    model: "anthropic/claude-sonnet-4",
    runtimeMode: "approval-required",
    interactionMode: "plan",
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
    ...overrides,
  };
}

describe("resolveForkThreadDraftSettings", () => {
  it("uses the persisted thread provider, model, and modes", () => {
    expect(resolveForkThreadDraftSettings(makeThread())).toEqual({
      provider: "opencode",
      model: "anthropic/claude-sonnet-4",
      runtimeMode: "approval-required",
      interactionMode: "plan",
    });
  });

  it("prefers the active session provider when it differs from the stored provider", () => {
    expect(
      resolveForkThreadDraftSettings(
        makeThread({
          provider: "codex",
          session: {
            provider: "copilot",
            status: "running",
            activeTurnId: undefined,
            createdAt: "2026-03-01T00:00:00.000Z",
            updatedAt: "2026-03-01T00:00:01.000Z",
            orchestrationStatus: "running",
          },
        }),
      ),
    ).toEqual({
      provider: "copilot",
      model: "anthropic/claude-sonnet-4",
      runtimeMode: "approval-required",
      interactionMode: "plan",
    });
  });
});
