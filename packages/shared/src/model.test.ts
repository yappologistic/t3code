import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_BY_PROVIDER, MODEL_OPTIONS_BY_PROVIDER } from "@t3tools/contracts";

import {
  getDefaultModel,
  getModelContextWindowInfo,
  getModelDisplayName,
  getDefaultReasoningEffort,
  getModelOptions,
  getReasoningEffortOptions,
  isKnownModelSlug,
  isLegacyModelSlug,
  normalizeModelSlug,
  resolveModelSlug,
} from "./model";

describe("normalizeModelSlug", () => {
  it("maps known aliases to canonical slugs", () => {
    expect(normalizeModelSlug("gpt-5-codex")).toBe("gpt-5-codex");
    expect(normalizeModelSlug("5.3")).toBe("gpt-5.3-codex");
    expect(normalizeModelSlug("gpt-5.3")).toBe("gpt-5.3-codex");
    expect(normalizeModelSlug("gemini-3-flash", "copilot")).toBe("gemini-3-flash-preview");
    expect(normalizeModelSlug("gemini-3-pro", "copilot")).toBe("gemini-3-pro-preview");
    expect(normalizeModelSlug("gemini-3.1-pro", "copilot")).toBe("gemini-3.1-pro-preview");
    expect(normalizeModelSlug("gemini-3-pro-preview", "copilot")).toBe("gemini-3-pro-preview");
  });

  it("returns null for empty or missing values", () => {
    expect(normalizeModelSlug("")).toBeNull();
    expect(normalizeModelSlug("   ")).toBeNull();
    expect(normalizeModelSlug(null)).toBeNull();
    expect(normalizeModelSlug(undefined)).toBeNull();
  });

  it("preserves non-aliased model slugs", () => {
    expect(normalizeModelSlug("gpt-5.2")).toBe("gpt-5.2");
    expect(normalizeModelSlug("gpt-5.2-codex")).toBe("gpt-5.2-codex");
  });

  it("does not leak prototype properties as aliases", () => {
    expect(normalizeModelSlug("toString")).toBe("toString");
    expect(normalizeModelSlug("constructor")).toBe("constructor");
  });
});

describe("resolveModelSlug", () => {
  it("returns default only when the model is missing", () => {
    expect(resolveModelSlug(undefined)).toBe(DEFAULT_MODEL_BY_PROVIDER.codex);
    expect(resolveModelSlug(null)).toBe(DEFAULT_MODEL_BY_PROVIDER.codex);
  });

  it("preserves unknown custom models", () => {
    expect(resolveModelSlug("gpt-4.1")).toBe(DEFAULT_MODEL_BY_PROVIDER.codex);
    expect(resolveModelSlug("custom/internal-model")).toBe(DEFAULT_MODEL_BY_PROVIDER.codex);
  });

  it("resolves only supported model options", () => {
    for (const model of MODEL_OPTIONS_BY_PROVIDER.codex) {
      expect(resolveModelSlug(model.slug)).toBe(model.slug);
    }
  });
  it("keeps codex defaults for backward compatibility", () => {
    expect(getDefaultModel()).toBe(DEFAULT_MODEL_BY_PROVIDER.codex);
    expect(getModelOptions()).toEqual(MODEL_OPTIONS_BY_PROVIDER.codex);
  });

  it("returns provider-specific defaults and catalogs for copilot", () => {
    expect(getDefaultModel("copilot")).toBe(DEFAULT_MODEL_BY_PROVIDER.copilot);
    expect(getModelOptions("copilot")).toEqual(MODEL_OPTIONS_BY_PROVIDER.copilot);
    expect(resolveModelSlug("claude-sonnet-4.5", "copilot")).toBe("claude-sonnet-4.5");
    expect(resolveModelSlug("gemini-3-pro", "copilot")).toBe("gemini-3-pro-preview");
  });

  it("returns provider-specific defaults and catalogs for kimi", () => {
    expect(getDefaultModel("kimi")).toBe(DEFAULT_MODEL_BY_PROVIDER.kimi);
    expect(getModelOptions("kimi")).toEqual(MODEL_OPTIONS_BY_PROVIDER.kimi);
    expect(resolveModelSlug("kimi-for-coding", "kimi")).toBe("kimi-for-coding");
  });
});

describe("legacy model helpers", () => {
  it("keeps retired Copilot slugs available for historical inference only", () => {
    expect(isKnownModelSlug("goldeneye", "copilot")).toBe(false);
    expect(isKnownModelSlug("goldeneye", "copilot", { includeLegacy: true })).toBe(true);
    expect(isLegacyModelSlug("raptor-mini", "copilot")).toBe(true);
    expect(isLegacyModelSlug("gpt-5.4", "copilot")).toBe(false);
  });
});

describe("getModelDisplayName", () => {
  it("returns built-in catalog names", () => {
    expect(getModelDisplayName("gpt-5.4", "codex")).toBe("GPT-5.4");
    expect(getModelDisplayName("gpt-5-codex", "codex")).toBe("GPT-5 Codex");
    expect(getModelDisplayName("kimi-for-coding", "kimi")).toBe("Kimi for Coding");
  });

  it("formats raw Kimi ACP ids into readable labels", () => {
    expect(getModelDisplayName("kimi-code/kimi-for-coding,thinking", "kimi")).toBe(
      "Kimi for Coding · Thinking",
    );
    expect(getModelDisplayName("kimi-k2-thinking", "kimi")).toBe("Kimi K2 Thinking");
  });
});

describe("getModelContextWindowInfo", () => {
  it("returns provider-specific context-window metadata for documented models", () => {
    expect(getModelContextWindowInfo("gpt-5-codex", "codex")?.totalTokens).toBe(400_000);
    expect(getModelContextWindowInfo("gpt-5.4", "codex")?.totalTokens).toBe(1_000_000);
    expect(getModelContextWindowInfo("gpt-5.4", "copilot")?.totalTokens).toBe(1_000_000);
    expect(getModelContextWindowInfo("kimi-for-coding", "kimi")?.totalTokens).toBeUndefined();
  });

  it("preserves unknown totals when only a note is documented", () => {
    const info = getModelContextWindowInfo("claude-opus-4.6-fast", "copilot");
    expect(info?.totalTokens).toBeUndefined();
    expect(info?.note).toContain("does not publish a separate context-window limit");
  });

  it("returns null for missing metadata", () => {
    expect(getModelContextWindowInfo("custom/internal-model", "copilot")).toBeNull();
  });
});

describe("getReasoningEffortOptions", () => {
  it("returns codex reasoning options for codex", () => {
    expect(getReasoningEffortOptions("codex")).toEqual(["xhigh", "high", "medium", "low"]);
  });

  it("returns the live Copilot reasoning options, including xhigh", () => {
    expect(getReasoningEffortOptions("copilot")).toEqual(["low", "medium", "high", "xhigh"]);
  });
});

describe("getDefaultReasoningEffort", () => {
  it("returns provider-scoped defaults", () => {
    expect(getDefaultReasoningEffort("codex")).toBe("high");
    expect(getDefaultReasoningEffort("kimi")).toBeNull();
    expect(getDefaultReasoningEffort("copilot")).toBe("high");
  });
});
