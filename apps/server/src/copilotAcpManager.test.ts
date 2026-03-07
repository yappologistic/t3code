import { EventEmitter } from "node:events";

import { ApprovalRequestId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  CopilotAcpManager,
  isCopilotModelAvailable,
  readAvailableCopilotModelIds,
  readCopilotReasoningEffortSelector,
} from "./copilotAcpManager";

class FakeChildStderr extends EventEmitter {
  setEncoding(_encoding: string) {}
}

class FakeChildProcess extends EventEmitter {
  readonly stderr = new FakeChildStderr();
}

describe("copilotAcpManager model availability", () => {
  it("reads ACP-advertised model ids", () => {
    expect(
      readAvailableCopilotModelIds({
        currentModelId: "claude-sonnet-4.5",
        availableModels: [
          { modelId: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
          { modelId: "gpt-5.4", name: "GPT-5.4" },
        ],
      }),
    ).toEqual(["claude-sonnet-4.5", "gpt-5.4"]);
  });

  it("treats requested models as unavailable when ACP advertises a different model set", () => {
    expect(
      isCopilotModelAvailable(
        {
          currentModelId: "claude-sonnet-4.5",
          availableModels: [{ modelId: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" }],
        },
        "grok-code-fast-1",
      ),
    ).toBe(false);
  });

  it("allows requested models when ACP has not advertised any model set yet", () => {
    expect(isCopilotModelAvailable(null, "claude-sonnet-4.5")).toBe(true);
  });

  it("reads ACP-advertised Copilot reasoning selectors", () => {
    expect(
      readCopilotReasoningEffortSelector([
        {
          type: "select",
          id: "reasoning_effort",
          name: "Reasoning Effort",
          category: "thought_level",
          currentValue: "xhigh",
          options: [
            { value: "low", name: "low" },
            { value: "medium", name: "medium" },
            { value: "high", name: "high" },
            { value: "xhigh", name: "xhigh" },
            { value: "unsupported", name: "unsupported" },
          ],
        },
      ]),
    ).toEqual({
      id: "reasoning_effort",
      currentValue: null,
      options: ["low", "medium", "high"],
    });
  });

  it("supports grouped ACP reasoning selectors", () => {
    expect(
      readCopilotReasoningEffortSelector([
        {
          type: "select",
          id: "reasoning_effort",
          name: "Reasoning Effort",
          category: "thought_level",
          currentValue: "high",
          options: [
            {
              group: "standard",
              name: "Standard",
              options: [
                { value: "low", name: "low" },
                { value: "medium", name: "medium" },
                { value: "high", name: "high" },
              ],
            },
          ],
        },
      ]),
    ).toEqual({
      id: "reasoning_effort",
      currentValue: "high",
      options: ["low", "medium", "high"],
    });
  });

  it("does not widen single-use approvals into session approvals", async () => {
    const manager = new CopilotAcpManager();
    const threadId = ThreadId.makeUnsafe("thread-approval");
    const requestId = ApprovalRequestId.makeUnsafe("request-approval");
    const resolve = vi.fn();

    (manager as any).sessions.set(threadId, {
      session: {
        provider: "copilot",
        status: "ready",
        runtimeMode: "approval-required",
        cwd: "/tmp",
        threadId,
        createdAt: "2026-03-07T12:00:00.000Z",
        updatedAt: "2026-03-07T12:00:00.000Z",
      },
      child: {} as never,
      connection: {} as never,
      acpSessionId: "session-1",
      models: null,
      configOptions: null,
      pendingApprovals: new Map([
        [
          requestId,
          {
            requestId,
            toolCallId: "tool-1",
            turnId: undefined,
            requestType: "command_execution_approval",
            options: [
              {
                optionId: "allow-always",
                kind: "allow_always",
              },
            ],
            resolve,
          },
        ],
      ]),
      toolSnapshots: new Map(),
      currentTurnId: undefined,
      turnInFlight: false,
      stopping: false,
    });

    await manager.respondToRequest(threadId, requestId, "accept");

    expect(resolve).toHaveBeenCalledWith({
      outcome: { outcome: "cancelled" },
    });
  });

  it("rejects overlapping turns for a single Copilot session", async () => {
    const manager = new CopilotAcpManager();
    const threadId = ThreadId.makeUnsafe("thread-running");
    const pendingPrompt = Promise.withResolvers<{ stopReason: "completed" }>();

    (manager as any).sessions.set(threadId, {
      session: {
        provider: "copilot",
        status: "ready",
        runtimeMode: "approval-required",
        cwd: "/tmp",
        threadId,
        createdAt: "2026-03-07T12:00:00.000Z",
        updatedAt: "2026-03-07T12:00:00.000Z",
      },
      child: {} as never,
      connection: {
        prompt: vi.fn(() => pendingPrompt.promise),
      },
      acpSessionId: "session-1",
      models: null,
      configOptions: null,
      pendingApprovals: new Map(),
      toolSnapshots: new Map(),
      currentTurnId: undefined,
      turnInFlight: false,
      stopping: false,
    });

    const firstTurnPromise = manager.sendTurn({ threadId, input: "hello" });

    await expect(manager.sendTurn({ threadId, input: "again" })).rejects.toThrow(
      "GitHub Copilot already has a turn in progress for this session.",
    );

    pendingPrompt.resolve({ stopReason: "completed" });

    await expect(firstTurnPromise).resolves.toMatchObject({ threadId });
  });

  it("converts child process spawn errors into session exit events", () => {
    const manager = new CopilotAcpManager();
    const threadId = ThreadId.makeUnsafe("thread-child-error");
    const child = new FakeChildProcess();
    const events: Array<{ type: string; payload?: Record<string, unknown> }> = [];

    const context = {
      session: {
        provider: "copilot",
        status: "ready",
        runtimeMode: "approval-required",
        cwd: "/tmp",
        threadId,
        createdAt: "2026-03-07T12:00:00.000Z",
        updatedAt: "2026-03-07T12:00:00.000Z",
      },
      child: child as never,
      connection: {
        closed: Promise.resolve(),
      } as never,
      acpSessionId: "session-1",
      models: null,
      configOptions: null,
      pendingApprovals: new Map(),
      toolSnapshots: new Map(),
      currentTurnId: undefined,
      turnInFlight: false,
      stopping: false,
    };

    manager.on("event", (event) => {
      events.push(event as { type: string; payload?: Record<string, unknown> });
    });

    (manager as any).sessions.set(threadId, context);
    (manager as any).attachProcessListeners(context);

    expect(() => {
      child.emit("error", new Error("spawn ENOENT"));
    }).not.toThrow();

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "session.exited",
          payload: expect.objectContaining({
            reason: "spawn ENOENT",
            exitKind: "error",
            recoverable: false,
          }),
        }),
      ]),
    );
    expect((manager as any).sessions.has(threadId)).toBe(false);
  });
});
