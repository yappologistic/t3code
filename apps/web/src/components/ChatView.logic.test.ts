import { describe, expect, it } from "vitest";

import { resolveComposerEffortForProvider } from "./ChatView.logic";

describe("resolveComposerEffortForProvider", () => {
  it("keeps explicit Pi thinking-level overrides that were chosen while Pi was active", () => {
    expect(
      resolveComposerEffortForProvider({
        provider: "pi",
        effort: "high",
        effortProvider: "pi",
      }),
    ).toBe("high");
  });

  it("drops non-Pi reasoning selections when switching into Pi so Pi keeps its own defaults", () => {
    expect(
      resolveComposerEffortForProvider({
        provider: "pi",
        effort: "high",
        effortProvider: "codex",
      }),
    ).toBeNull();
  });

  it("keeps shared reasoning selections for non-Pi providers", () => {
    expect(
      resolveComposerEffortForProvider({
        provider: "copilot",
        effort: "low",
        effortProvider: null,
      }),
    ).toBe("low");
  });
});
