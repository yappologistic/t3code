import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vitest";

import { CopilotAcpManager, readCopilotReasoningEffortSelector } from "./copilotAcpManager";

describe("copilotAcpManager reasoning selector", () => {
  it("keeps xhigh options from ACP config metadata", () => {
    expect(
      readCopilotReasoningEffortSelector([
        {
          id: "reasoning_effort",
          type: "select",
          title: "Reasoning effort",
          category: "thought_level",
          currentValue: "xhigh",
          options: [
            { title: "Low", value: "low" },
            { title: "Medium", value: "medium" },
            { title: "High", value: "high" },
            { title: "Extra High", value: "xhigh" },
          ],
        } as any,
      ]),
    ).toEqual({
      id: "reasoning_effort",
      currentValue: "xhigh",
      options: ["low", "medium", "high", "xhigh"],
    });
  });
});

describe("copilotAcpManager lifecycle", () => {
  it("treats starting sessions as active for hasSession checks", async () => {
    const manager = new CopilotAcpManager();
    const threadId = ThreadId.makeUnsafe("thread-copilot-starting");

    (manager as any).startingSessions.set(threadId, {
      session: {
        provider: "copilot",
        status: "connecting",
        runtimeMode: "approval-required",
        threadId,
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
      },
    });

    await expect(manager.hasSession(threadId)).resolves.toBe(true);
  });

  it("stops sessions that are still starting", async () => {
    const manager = new CopilotAcpManager();
    const threadId = ThreadId.makeUnsafe("thread-copilot-stop");
    const context = {
      session: {
        provider: "copilot",
        status: "connecting",
        runtimeMode: "approval-required",
        threadId,
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
      },
    };
    (manager as any).startingSessions.set(threadId, context);
    const disposeContext = vi.spyOn(manager as any, "disposeContext").mockResolvedValue(undefined);

    await manager.stopSession(threadId);

    expect(disposeContext).toHaveBeenCalledWith(context);
  });
});
