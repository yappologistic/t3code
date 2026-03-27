import { describe, expect, it } from "vitest";

import {
  mergeModelOptions,
  resolveModelForProviderPicker,
  findModelOptionBySlug,
  getProviderPickerSectionDescription,
  groupModelsByFamily,
  buildPickerProviderSections,
  type PickerModelOption,
} from "./modelPickerHelpers";

describe("mergeModelOptions", () => {
  it("concatenates non-overlapping option arrays", () => {
    const base: PickerModelOption[] = [{ slug: "a", name: "A" }];
    const extra: PickerModelOption[] = [{ slug: "b", name: "B" }];
    expect(mergeModelOptions(base, extra)).toEqual([
      { slug: "a", name: "A" },
      { slug: "b", name: "B" },
    ]);
  });

  it("deduplicates by slug keeping base position and merging metadata", () => {
    const base: PickerModelOption[] = [{ slug: "x", name: "Base X" }];
    const extra: PickerModelOption[] = [{ slug: "x", name: "Extra X", supportsReasoning: true }];
    const merged = mergeModelOptions(base, extra);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.name).toBe("Base X");
    expect(merged[0]!.supportsReasoning).toBe(true);
  });

  it("preserves contextWindowTokens from the first definition that has it", () => {
    const base: PickerModelOption[] = [{ slug: "m", name: "M", contextWindowTokens: 128_000 }];
    const extra: PickerModelOption[] = [{ slug: "m", name: "M2", contextWindowTokens: 256_000 }];
    const merged = mergeModelOptions(base, extra);
    expect(merged[0]!.contextWindowTokens).toBe(128_000);
  });
});

describe("resolveModelForProviderPicker", () => {
  const options: PickerModelOption[] = [
    { slug: "gpt-5.4", name: "GPT-5.4" },
    { slug: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
  ];

  it("resolves by exact slug match", () => {
    expect(resolveModelForProviderPicker("codex", "gpt-5.4", options)).toBe("gpt-5.4");
  });

  it("resolves by display name (case-insensitive)", () => {
    expect(resolveModelForProviderPicker("copilot", "claude sonnet 4.5", options)).toBe(
      "claude-sonnet-4.5",
    );
  });

  it("returns null for unrecognized value", () => {
    expect(resolveModelForProviderPicker("codex", "unknown-model", options)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveModelForProviderPicker("codex", "", options)).toBeNull();
  });
});

describe("findModelOptionBySlug", () => {
  const options: PickerModelOption[] = [
    { slug: "a", name: "A" },
    { slug: "b", name: "B" },
  ];

  it("finds by exact slug", () => {
    expect(findModelOptionBySlug(options, "a")).toEqual({ slug: "a", name: "A" });
  });

  it("returns null for missing slug", () => {
    expect(findModelOptionBySlug(options, "c")).toBeNull();
  });

  it("returns null for null/undefined slug", () => {
    expect(findModelOptionBySlug(options, null)).toBeNull();
    expect(findModelOptionBySlug(options, undefined)).toBeNull();
  });

  it("trims whitespace from the lookup slug", () => {
    expect(findModelOptionBySlug(options, "  b  ")).toEqual({ slug: "b", name: "B" });
  });
});

describe("getProviderPickerSectionDescription", () => {
  it("returns a non-empty description for every known available provider", () => {
    const providers = ["codex", "openrouter", "copilot", "kimi", "opencode", "pi"] as const;
    for (const provider of providers) {
      const description = getProviderPickerSectionDescription(provider);
      expect(description).toBeTruthy();
      expect(typeof description).toBe("string");
    }
  });
});

describe("groupModelsByFamily", () => {
  it("returns a single ungrouped family for ≤ 3 models", () => {
    const models: PickerModelOption[] = [
      { slug: "gpt-5.4", name: "GPT-5.4" },
      { slug: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    ];
    const families = groupModelsByFamily(models, "copilot");
    expect(families).toHaveLength(1);
    expect(families[0]!.key).toBe("__all__");
    expect(families[0]!.models).toHaveLength(2);
  });

  it("groups models by family for providers with many models", () => {
    const models: PickerModelOption[] = [
      { slug: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
      { slug: "claude-opus-4.6", name: "Claude Opus 4.6" },
      { slug: "gpt-5.4", name: "GPT-5.4" },
      { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
      { slug: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    ];
    const families = groupModelsByFamily(models, "copilot");
    expect(families.length).toBeGreaterThan(1);

    const claudeFamily = families.find((f) => f.key === "claude");
    expect(claudeFamily).toBeTruthy();
    expect(claudeFamily!.models).toHaveLength(2);

    const gptFamily = families.find((f) => f.key === "gpt");
    expect(gptFamily).toBeTruthy();
    expect(gptFamily!.models).toHaveLength(2);

    const geminiFamily = families.find((f) => f.key === "gemini");
    expect(geminiFamily).toBeTruthy();
    expect(geminiFamily!.models).toHaveLength(1);
  });

  it("puts unrecognized models in an __other__ group", () => {
    const models: PickerModelOption[] = [
      { slug: "gpt-5.4", name: "GPT-5.4" },
      { slug: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
      { slug: "some-custom-model", name: "Custom Model" },
      { slug: "another-model", name: "Another" },
    ];
    const families = groupModelsByFamily(models, "copilot");
    const otherFamily = families.find((f) => f.key === "__other__");
    expect(otherFamily).toBeTruthy();
    expect(otherFamily!.models).toHaveLength(2);
  });
});

describe("buildPickerProviderSections", () => {
  const availableOptions = [{ value: "codex" as const, label: "Codex", available: true as const }];
  const modelOptionsByProvider = {
    codex: [
      { slug: "gpt-5.4", name: "GPT-5.4" },
      { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
    ],
    copilot: [],
    kimi: [],
    opencode: [],
    pi: [],
  };

  it("builds sections for available providers", () => {
    const sections = buildPickerProviderSections({
      availableOptions,
      visibleModelOptionsByProvider: modelOptionsByProvider,
      openRouterModelOptions: [],
      opencodeModelOptions: [],
      favoriteModelsByProvider: { codex: [], copilot: [], kimi: [], opencode: [], pi: [] },
      recentModelsByProvider: { codex: [], copilot: [], kimi: [], opencode: [], pi: [] },
      lockedProvider: null,
      normalizedQuery: "",
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]!.option.value).toBe("codex");
    expect(sections[0]!.modelOptions).toHaveLength(2);
  });

  it("filters models by search query", () => {
    const sections = buildPickerProviderSections({
      availableOptions,
      visibleModelOptionsByProvider: modelOptionsByProvider,
      openRouterModelOptions: [],
      opencodeModelOptions: [],
      favoriteModelsByProvider: { codex: [], copilot: [], kimi: [], opencode: [], pi: [] },
      recentModelsByProvider: { codex: [], copilot: [], kimi: [], opencode: [], pi: [] },
      lockedProvider: null,
      normalizedQuery: "5.4",
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]!.modelOptions).toHaveLength(1);
    expect(sections[0]!.modelOptions[0]!.slug).toBe("gpt-5.4");
  });

  it("returns empty sections when query matches nothing", () => {
    const sections = buildPickerProviderSections({
      availableOptions,
      visibleModelOptionsByProvider: modelOptionsByProvider,
      openRouterModelOptions: [],
      opencodeModelOptions: [],
      favoriteModelsByProvider: { codex: [], copilot: [], kimi: [], opencode: [], pi: [] },
      recentModelsByProvider: { codex: [], copilot: [], kimi: [], opencode: [], pi: [] },
      lockedProvider: null,
      normalizedQuery: "zzz-no-match",
    });
    expect(sections).toHaveLength(0);
  });

  it("marks sections as locked when provider does not match lockedProvider", () => {
    const sections = buildPickerProviderSections({
      availableOptions,
      visibleModelOptionsByProvider: modelOptionsByProvider,
      openRouterModelOptions: [],
      opencodeModelOptions: [],
      favoriteModelsByProvider: { codex: [], copilot: [], kimi: [], opencode: [], pi: [] },
      recentModelsByProvider: { codex: [], copilot: [], kimi: [], opencode: [], pi: [] },
      lockedProvider: "copilot",
      normalizedQuery: "",
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]!.isDisabledByProviderLock).toBe(true);
  });

  it("prioritizes favorite and recent models before the rest", () => {
    const sections = buildPickerProviderSections({
      availableOptions,
      visibleModelOptionsByProvider: modelOptionsByProvider,
      openRouterModelOptions: [],
      opencodeModelOptions: [],
      favoriteModelsByProvider: {
        codex: ["gpt-5.3-codex"],
        copilot: [],
        kimi: [],
        opencode: [],
        pi: [],
      },
      recentModelsByProvider: {
        codex: ["gpt-5.4"],
        copilot: [],
        kimi: [],
        opencode: [],
        pi: [],
      },
      lockedProvider: null,
      normalizedQuery: "",
    });

    expect(sections[0]?.modelOptions.map((option) => option.slug)).toEqual([
      "gpt-5.3-codex",
      "gpt-5.4",
    ]);
  });
});
