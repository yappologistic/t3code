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
        piSupportsReasoning: false,
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
        piSupportsReasoning: false,
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
        piSupportsReasoning: false,
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
        piSupportsReasoning: false,
      }),
    ).toBeUndefined();
  });

  it("preserves Pi defaults when no reasoning level is selected", () => {
    expect(
      buildModelOptionsForSend({
        provider: "pi",
        model: "openai/gpt-5.4",
        composerEffort: null,
        codexFastModeEnabled: false,
        copilotReasoningProbe: null,
        openRouterSupportsReasoningEffort: false,
        piSupportsReasoning: true,
      }),
    ).toBeUndefined();
  });

  it("sends Pi thinking-level overrides when a reasoning-capable Pi model is selected", () => {
    expect(
      buildModelOptionsForSend({
        provider: "pi",
        model: "openai/gpt-5.4",
        composerEffort: "xhigh",
        codexFastModeEnabled: false,
        copilotReasoningProbe: null,
        openRouterSupportsReasoningEffort: false,
        piSupportsReasoning: true,
      }),
    ).toEqual({
      pi: {
        thinkingLevel: "xhigh",
      },
    });
  });

  it("does not send Pi thinking levels that are outside the configured session options", () => {
    expect(
      buildModelOptionsForSend({
        provider: "pi",
        model: "openai/gpt-5.4",
        composerEffort: "xhigh",
        codexFastModeEnabled: false,
        copilotReasoningProbe: null,
        openRouterSupportsReasoningEffort: false,
        piSupportsReasoning: true,
        piReasoningOptions: ["off", "minimal", "low", "medium", "high"],
      }),
    ).toBeUndefined();
  });
});
