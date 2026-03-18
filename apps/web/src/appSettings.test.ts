import { describe, expect, it } from "vitest";

import {
  DEFAULT_APP_LANGUAGE_SETTING,
  DEFAULT_CHAT_BACKGROUND_IMAGE_BLUR_PX,
  DEFAULT_CHAT_BACKGROUND_IMAGE_FADE_PERCENT,
  getAppSettingsSnapshot,
  DEFAULT_TIMESTAMP_FORMAT,
  getAppModelOptions,
  getSlashModelOptions,
  MAX_CHAT_BACKGROUND_IMAGE_BLUR_PX,
  MAX_CHAT_BACKGROUND_IMAGE_DATA_URL_LENGTH,
  normalizeCustomModelSlugs,
  resolveAppModelSelection,
  sanitizePersistedAppSettingsForStorage,
  supportsCustomModels,
} from "./appSettings";

describe("normalizeCustomModelSlugs", () => {
  it("normalizes Codex custom models, keeps free OpenRouter slugs, and removes built-ins", () => {
    expect(
      normalizeCustomModelSlugs([
        " custom-internal-model ",
        "gpt-5.3-codex",
        "openrouter/free",
        "google/gemma-3n-e4b-it:free",
        "5.3",
        "custom-internal-model",
        "",
        null,
      ]),
    ).toEqual(["custom-internal-model", "google/gemma-3n-e4b-it:free"]);
  });

  it("drops OpenRouter slugs that are not locked to the router alias or :free", () => {
    expect(
      normalizeCustomModelSlugs([
        "openrouter/hunter-alpha",
        "meta-llama/llama-3.3-70b-instruct",
        "openrouter/free",
        "meta-llama/llama-3.3-70b-instruct:free",
      ]),
    ).toEqual(["meta-llama/llama-3.3-70b-instruct:free"]);
  });

  it("normalizes aliases, removes built-ins, and deduplicates supported providers", () => {
    expect(
      normalizeCustomModelSlugs(
        [" custom/internal-model ", "claude-sonnet-4.5", "custom/internal-model", "", null],
        "copilot",
      ),
    ).toEqual(["custom/internal-model"]);
  });
});

describe("getAppModelOptions", () => {
  it("includes Codex built-ins, the OpenRouter free router, and saved custom model ids", () => {
    const options = getAppModelOptions("codex", ["custom-internal-model"]);

    expect(options.map((option) => option.slug)).toEqual([
      "gpt-5.4",
      "gpt-5-codex",
      "gpt-5.3-codex",
      "gpt-5.3-codex-spark",
      "gpt-5.2-codex",
      "gpt-5.2",
      "openrouter/free",
      "custom-internal-model",
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

  it("supports opencode model catalogs and custom entries", () => {
    const options = getAppModelOptions("opencode", ["z-ai/glm-4.5"]);

    expect(options[0]).toEqual({
      slug: "opencode/default",
      name: "OpenCode Default",
      isCustom: false,
    });
    expect(options.at(-1)).toEqual({
      slug: "z-ai/glm-4.5",
      name: "z-ai/glm-4.5",
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

  it("keeps the selected Codex custom model in the picker catalog", () => {
    const options = getAppModelOptions("codex", [], "custom-selected-model");

    expect(options.at(-1)).toEqual({
      slug: "custom-selected-model",
      name: "custom-selected-model",
      isCustom: true,
    });
  });
});

describe("resolveAppModelSelection", () => {
  it("keeps saved Codex custom models selected", () => {
    expect(resolveAppModelSelection("codex", ["galapagos-alpha"], "galapagos-alpha")).toBe(
      "galapagos-alpha",
    );
  });

  it("falls back to the provider default when no model is selected", () => {
    expect(resolveAppModelSelection("codex", [], "")).toBe("gpt-5.4");
    expect(resolveAppModelSelection("copilot", [], "")).toBe("claude-sonnet-4.5");
    expect(resolveAppModelSelection("kimi", [], "")).toBe("kimi-for-coding");
    expect(resolveAppModelSelection("opencode", [], "")).toBe("opencode/default");
  });
});
describe("getSlashModelOptions", () => {
  it("includes saved Codex custom models in /model suggestions", () => {
    const options = getSlashModelOptions("codex", ["custom-internal-model"], "", "gpt-5.3-codex");

    expect(options.some((option) => option.slug === "custom-internal-model")).toBe(true);
  });

  it("filters slash-model suggestions across Codex built-ins and custom names", () => {
    const options = getSlashModelOptions(
      "codex",
      ["openai/gpt-oss-120b:free"],
      "oss",
      "gpt-5.3-codex",
    );

    expect(options.map((option) => option.slug)).toEqual(["openai/gpt-oss-120b:free"]);
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
  it("supports custom model catalogs for every current provider", () => {
    expect(supportsCustomModels("codex")).toBe(true);
    expect(supportsCustomModels("copilot")).toBe(true);
    expect(supportsCustomModels("kimi")).toBe(true);
    expect(supportsCustomModels("opencode")).toBe(true);
  });
});

describe("sanitizePersistedAppSettingsForStorage", () => {
  it("removes provider API keys before writing settings to storage", () => {
    const sanitized = sanitizePersistedAppSettingsForStorage({
      ...getAppSettingsSnapshot(),
      openRouterApiKey: "sk-or-secret",
      kimiApiKey: "sk-kimi-secret",
    });

    expect(sanitized.openRouterApiKey).toBe("");
    expect(sanitized.kimiApiKey).toBe("");
    expect(sanitized.kimiBinaryPath).toBe(getAppSettingsSnapshot().kimiBinaryPath);
  });

  it("preserves non-secret chat background settings", () => {
    const sanitized = sanitizePersistedAppSettingsForStorage({
      ...getAppSettingsSnapshot(),
      chatBackgroundImageDataUrl: "data:image/png;base64,abc123",
      chatBackgroundImageAssetId: "background-asset-123",
      chatBackgroundImageName: "wallpaper.png",
      chatBackgroundImageFadePercent: 42,
      chatBackgroundImageBlurPx: 8,
    });

    expect(sanitized.chatBackgroundImageDataUrl).toBe("data:image/png;base64,abc123");
    expect(sanitized.chatBackgroundImageAssetId).toBe("background-asset-123");
    expect(sanitized.chatBackgroundImageName).toBe("wallpaper.png");
    expect(sanitized.chatBackgroundImageFadePercent).toBe(42);
    expect(sanitized.chatBackgroundImageBlurPx).toBe(8);
  });

  it("returns a stable snapshot reference when storage has not changed", () => {
    const localStorage = {
      getItem: () => null,
      setItem: () => undefined,
    };

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });

    try {
      const first = getAppSettingsSnapshot();
      const second = getAppSettingsSnapshot();

      expect(second).toBe(first);
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });
});

describe("chat background settings defaults", () => {
  it("uses empty defaults for the optional chat background fields", () => {
    const snapshot = getAppSettingsSnapshot();

    expect(snapshot.chatBackgroundImageDataUrl).toBe("");
    expect(snapshot.chatBackgroundImageAssetId).toBe("");
    expect(snapshot.chatBackgroundImageName).toBe("");
    expect(snapshot.chatBackgroundImageFadePercent).toBe(
      DEFAULT_CHAT_BACKGROUND_IMAGE_FADE_PERCENT,
    );
    expect(snapshot.chatBackgroundImageBlurPx).toBe(DEFAULT_CHAT_BACKGROUND_IMAGE_BLUR_PX);
    expect(MAX_CHAT_BACKGROUND_IMAGE_DATA_URL_LENGTH).toBeGreaterThan(0);
    expect(MAX_CHAT_BACKGROUND_IMAGE_BLUR_PX).toBeGreaterThan(0);
  });
});

describe("timestamp format defaults", () => {
  it("defaults timestamp format to locale", () => {
    expect(DEFAULT_TIMESTAMP_FORMAT).toBe("locale");
  });
});

describe("language defaults", () => {
  it("defaults app language to English", () => {
    expect(DEFAULT_APP_LANGUAGE_SETTING).toBe("en");
    expect(getAppSettingsSnapshot().language).toBe("en");
  });
});
