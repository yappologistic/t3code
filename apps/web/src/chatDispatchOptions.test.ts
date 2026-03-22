import { describe, expect, it } from "vitest";

import { buildModelOptionsForSend } from "./chatDispatchOptions";

describe("buildModelOptionsForSend", () => {
  it("preserves codex reasoning effort and fast mode for codex dispatches", () => {
    expect(
      buildModelOptionsForSend({
        provider: "codex",
        model: "gpt-5-codex",
        composerEffort: "medium",
        codexFastModeEnabled: true,
        copilotReasoningProbe: null,
        openRouterSupportsReasoningEffort: false,
      }),
    ).toEqual({
      codex: {
        reasoningEffort: "medium",
        fastMode: true,
      },
    });
  });

  it("passes Copilot xhigh reasoning through when the probe supports it", () => {
    expect(
      buildModelOptionsForSend({
        provider: "copilot",
        model: "gpt-5.4",
        composerEffort: "xhigh",
        codexFastModeEnabled: false,
        copilotReasoningProbe: {
          status: "supported",
          fetchedAt: "2026-03-01T00:00:00.000Z",
          model: "gpt-5.4",
          options: ["low", "medium", "high", "xhigh"],
          currentValue: "high",
        },
        openRouterSupportsReasoningEffort: false,
      }),
    ).toEqual({
      copilot: {
        reasoningEffort: "xhigh",
      },
    });
  });

  it("falls back to the matching Copilot probe value when the draft effort is unsupported", () => {
    expect(
      buildModelOptionsForSend({
        provider: "copilot",
        model: "gpt-4.1",
        composerEffort: "xhigh",
        codexFastModeEnabled: false,
        copilotReasoningProbe: {
          status: "supported",
          fetchedAt: "2026-03-01T00:00:00.000Z",
          model: "gpt-4.1",
          options: ["low", "medium"],
          currentValue: "medium",
        },
        openRouterSupportsReasoningEffort: false,
      }),
    ).toEqual({
      copilot: {
        reasoningEffort: "medium",
      },
    });
  });

  it("omits Copilot reasoning options when the available probe is for another model", () => {
    expect(
      buildModelOptionsForSend({
        provider: "copilot",
        model: "gpt-4.1",
        composerEffort: "medium",
        codexFastModeEnabled: false,
        copilotReasoningProbe: {
          status: "supported",
          fetchedAt: "2026-03-01T00:00:00.000Z",
          model: "claude-sonnet-4",
          options: ["low", "medium"],
          currentValue: "low",
        },
        openRouterSupportsReasoningEffort: false,
      }),
    ).toBeUndefined();
  });
});
