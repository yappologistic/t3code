import { describe, expect, it } from "vitest";

import { getModelPickerOptionDisplayParts } from "./modelPickerOptionDisplay";

describe("getModelPickerOptionDisplayParts", () => {
  it("splits provider-scoped model slugs into provider and model chunks", () => {
    expect(
      getModelPickerOptionDisplayParts({
        slug: "anthropic/claude-3-7-sonnet-latest",
        name: "anthropic/claude-3-7-sonnet-latest",
      }),
    ).toEqual({
      providerLabel: "anthropic",
      modelLabel: "claude-3-7-sonnet-latest",
      usesScopedLayout: true,
    });
  });

  it("keeps the OpenCode default option chunked by provider and model", () => {
    expect(
      getModelPickerOptionDisplayParts({
        slug: "opencode/default",
        name: "Default",
      }),
    ).toEqual({
      providerLabel: "opencode",
      modelLabel: "default",
      usesScopedLayout: true,
    });
  });

  it("falls back to the display name for unscoped model slugs", () => {
    expect(
      getModelPickerOptionDisplayParts({
        slug: "gpt-5.4",
        name: "GPT-5.4",
      }),
    ).toEqual({
      providerLabel: null,
      modelLabel: "GPT-5.4",
      usesScopedLayout: false,
    });
  });
});
