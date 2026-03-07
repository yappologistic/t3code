import { describe, expect, it } from "vitest";

import { isCopilotModelAvailable, readAvailableCopilotModelIds } from "./copilotAcpManager";

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
});
