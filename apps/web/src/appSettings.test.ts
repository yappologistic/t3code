import { describe, expect, it } from "vitest";

import {
  getAppModelOptions,
  getSlashModelOptions,
  normalizeCustomModelSlugs,
  resolveAppModelSelection,
  supportsCustomModels,
} from "./appSettings";

describe("normalizeCustomModelSlugs", () => {
  it("ignores saved custom Codex models", () => {
    expect(
      normalizeCustomModelSlugs([
        " custom/internal-model ",
        "gpt-5.3-codex",
        "5.3",
        "custom/internal-model",
        "",
        null,
      ]),
    ).toEqual([]);
  });

  it("normalizes aliases, removes built-ins, and deduplicates supported providers", () => {
    expect(
      normalizeCustomModelSlugs(
        [
          " custom/internal-model ",
          "claude-sonnet-4.5",
          "custom/internal-model",
          "",
          null,
        ],
        "copilot",
      ),
    ).toEqual(["custom/internal-model"]);
  });
});

describe("getAppModelOptions", () => {
  it("keeps Codex limited to the built-in catalog", () => {
    const options = getAppModelOptions("codex", ["custom/internal-model"]);

    expect(options.map((option) => option.slug)).toEqual([
      "gpt-5.4",
      "gpt-5.3-codex",
      "gpt-5.3-codex-spark",
      "gpt-5.2-codex",
      "gpt-5.2",
    ]);
  });

  it("supports copilot model catalogs and custom entries", () => {
    const options = getAppModelOptions("copilot", ["custom/copilot-model"]);

    expect(options.some((option) => option.slug === "claude-sonnet-4.5")).toBe(true);
    expect(options.some((option) => option.slug === "claude-sonnet-4.6")).toBe(true);
    expect(options.some((option) => option.slug === "gpt-5.4")).toBe(true);
    expect(options.some((option) => option.slug === "claude-opus-4.6")).toBe(true);
    expect(options.at(-1)).toEqual({
      slug: "custom/copilot-model",
      name: "custom/copilot-model",
      isCustom: true,
    });
  });

  it("supports kimi model catalogs and custom entries", () => {
    const options = getAppModelOptions("kimi", ["custom/kimi-model"]);

    expect(options.some((option) => option.slug === "kimi-for-coding")).toBe(true);
    expect(options.at(-1)).toEqual({
      slug: "custom/kimi-model",
      name: "Kimi Model",
      isCustom: true,
    });
  });

  it("formats friendly labels for kimi custom models with qualifiers", () => {
    const options = getAppModelOptions("kimi", ["moonshot/v1,k2,preview"]);

    expect(options.at(-1)).toEqual({
      slug: "moonshot/v1,k2,preview",
      name: "V1 · K2 · Preview",
      isCustom: true,
    });
  });

  it("does not keep unsupported Codex selections in the picker catalog", () => {
    const options = getAppModelOptions("codex", [], "custom/selected-model");

    expect(options.map((option) => option.slug)).toEqual([
      "gpt-5.4",
      "gpt-5.3-codex",
      "gpt-5.3-codex-spark",
      "gpt-5.2-codex",
      "gpt-5.2",
    ]);
  });
});

describe("resolveAppModelSelection", () => {
  it("falls back to the default for unsupported Codex models", () => {
    expect(resolveAppModelSelection("codex", ["galapagos-alpha"], "galapagos-alpha")).toBe(
      "gpt-5.4",
    );
  });

  it("falls back to the provider default when no model is selected", () => {
    expect(resolveAppModelSelection("codex", [], "")).toBe("gpt-5.4");
    expect(resolveAppModelSelection("copilot", [], "")).toBe("claude-sonnet-4.5");
    expect(resolveAppModelSelection("kimi", [], "")).toBe("kimi-for-coding");
  });
});

describe("getSlashModelOptions", () => {
  it("keeps Codex /model suggestions limited to the built-in catalog", () => {
    const options = getSlashModelOptions(
      "codex",
      ["custom/internal-model"],
      "",
      "gpt-5.3-codex",
    );

    expect(options.some((option) => option.slug === "custom/internal-model")).toBe(false);
  });

  it("filters slash-model suggestions across built-in Codex model names", () => {
    const options = getSlashModelOptions(
      "codex",
      ["openai/gpt-oss-120b"],
      "oss",
      "gpt-5.3-codex",
    );

    expect(options).toEqual([]);
  });

  it("still includes saved custom model slugs for supported providers", () => {
    const options = getSlashModelOptions(
      "copilot",
      ["custom/copilot-model"],
      "custom",
      "claude-sonnet-4.5",
    );

    expect(options.map((option) => option.slug)).toEqual(["custom/copilot-model"]);
  });
});

describe("supportsCustomModels", () => {
  it("disables custom model catalogs for Codex only", () => {
    expect(supportsCustomModels("codex")).toBe(false);
    expect(supportsCustomModels("copilot")).toBe(true);
    expect(supportsCustomModels("kimi")).toBe(true);
  });
});
