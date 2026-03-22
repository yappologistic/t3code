import { describe, expect, it } from "vitest";

import { formatCopilotRequestCost, getCopilotModelMultiplier } from "./copilotBilling";

describe("copilotBilling", () => {
  it("supports current Copilot Gemini preview slugs and older aliases", () => {
    expect(getCopilotModelMultiplier("gemini-3-pro-preview")).toBe(1);
    expect(getCopilotModelMultiplier("gemini-3-pro")).toBe(1);
    expect(getCopilotModelMultiplier("gemini-3-flash-preview")).toBe(0.33);
    expect(getCopilotModelMultiplier("gemini-3.1-pro-preview")).toBe(1);
    expect(formatCopilotRequestCost("gemini-3-flash-preview")).toContain("0.33x");
  });
});
