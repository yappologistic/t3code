import { describe, expect, it, vi } from "vitest";

import {
  extractOpenRouterFreeModels,
  isCut3CompatibleOpenRouterModelOption,
  isOpenRouterGuaranteedFreeSlug,
  isOpenRouterFreeModelEntry,
  OPENROUTER_MODELS_API_URL,
  readOpenRouterFreeModelCatalog,
  supportsOpenRouterNativeToolCalling,
  supportsOpenRouterReasoningEffortControl,
} from "./openRouterModels";

describe("openRouterModels", () => {
  it("only treats the router alias and :free slugs as pricing-locked free picks", () => {
    expect(isOpenRouterGuaranteedFreeSlug("openrouter/free")).toBe(true);
    expect(isOpenRouterGuaranteedFreeSlug("google/gemma-3n-e4b-it:free")).toBe(true);
    expect(isOpenRouterGuaranteedFreeSlug("openrouter/hunter-alpha")).toBe(false);
    expect(isOpenRouterGuaranteedFreeSlug("openai/gpt-4.1")).toBe(false);
  });

  it("treats zero-priced and :free catalog rows as free", () => {
    expect(
      isOpenRouterFreeModelEntry({
        id: "openrouter/hunter-alpha",
        pricing: {
          prompt: "0",
          completion: "0",
          request: "0",
        },
      }),
    ).toBe(true);

    expect(
      isOpenRouterFreeModelEntry({
        id: "google/gemma-3n-e4b-it:free",
        pricing: {
          prompt: "0.0000001",
          completion: "0.0000002",
        },
      }),
    ).toBe(true);

    expect(
      isOpenRouterFreeModelEntry({
        id: "openai/gpt-4.1",
        pricing: {
          prompt: "0.000002",
          completion: "0.000008",
        },
      }),
    ).toBe(false);
  });

  it("extracts and sorts the current free model catalog with the router first", () => {
    expect(
      extractOpenRouterFreeModels({
        data: [
          {
            id: "openrouter/free",
            name: "Free Models Router",
            description: "Routes to the current free OpenRouter pool.",
            context_length: 200_000,
            pricing: {
              prompt: "0",
              completion: "0",
            },
            supported_parameters: ["include_reasoning", "reasoning", "tool_choice", "tools"],
            architecture: {
              input_modalities: ["text", "image"],
            },
          },
          {
            id: "openrouter/hunter-alpha",
            name: "Hunter Alpha",
            context_length: 128_000,
            pricing: {
              prompt: "0",
              completion: "0",
            },
          },
          {
            id: "z-ai/glm-4.5-air:free",
            name: "GLM 4.5 Air",
            context_length: 65_536,
            pricing: {
              prompt: "0.0000001",
              completion: "0.0000002",
            },
            supported_parameters: ["reasoning", "tools"],
            architecture: {
              input_modalities: ["text", "image"],
            },
          },
          {
            id: "openai/gpt-4.1",
            name: "GPT-4.1",
            context_length: 128_000,
            pricing: {
              prompt: "0.000002",
              completion: "0.000008",
            },
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        slug: "openrouter/free",
        source: "router",
        name: "Free Models Router",
        description: "Routes to the current free OpenRouter pool.",
        contextLength: 200_000,
        supportsTools: true,
        supportsToolChoice: true,
        supportsImages: true,
        supportsReasoning: true,
      }),
      expect.objectContaining({
        slug: "z-ai/glm-4.5-air:free",
        name: "GLM 4.5 Air",
        supportsTools: true,
        supportsToolChoice: false,
        supportsImages: true,
        supportsReasoning: true,
      }),
      expect.objectContaining({
        slug: "openrouter/hunter-alpha",
        name: "Hunter Alpha",
        contextLength: 128_000,
        supportsReasoning: false,
      }),
    ]);
  });

  it("only keeps explicit free variants with full native tool-calling support in the CUT3 picker", () => {
    const models = extractOpenRouterFreeModels({
      data: [
        {
          id: "openrouter/free",
          name: "Free Models Router",
          pricing: { prompt: "0", completion: "0" },
          supported_parameters: ["tool_choice", "tools", "reasoning"],
        },
        {
          id: "openrouter/hunter-alpha",
          name: "Hunter Alpha",
          pricing: { prompt: "0", completion: "0" },
          supported_parameters: ["tool_choice", "tools", "reasoning"],
        },
        {
          id: "google/gemma-3-4b-it:free",
          name: "Gemma 3 4B",
          pricing: { prompt: "0.0000001", completion: "0.0000002" },
          supported_parameters: [],
        },
        {
          id: "z-ai/glm-4.5-air:free",
          name: "GLM 4.5 Air",
          pricing: { prompt: "0.0000001", completion: "0.0000002" },
          supported_parameters: ["tools", "reasoning"],
        },
        {
          id: "openai/gpt-oss-120b:free",
          name: "GPT OSS 120B",
          pricing: { prompt: "0.0000001", completion: "0.0000002" },
          supported_parameters: ["tool_choice", "tools", "reasoning"],
        },
      ],
    });

    expect(models.filter(isCut3CompatibleOpenRouterModelOption).map((model) => model.slug)).toEqual(
      ["openrouter/free", "openai/gpt-oss-120b:free"],
    );
  });

  it("requires both tools and tool_choice for native tool calling", () => {
    expect(
      supportsOpenRouterNativeToolCalling({ supportsTools: true, supportsToolChoice: true }),
    ).toBe(true);
    expect(
      supportsOpenRouterNativeToolCalling({ supportsTools: true, supportsToolChoice: false }),
    ).toBe(false);
    expect(
      supportsOpenRouterNativeToolCalling({ supportsTools: false, supportsToolChoice: true }),
    ).toBe(false);
    expect(supportsOpenRouterNativeToolCalling(null)).toBe(false);
  });

  it("does not expose Codex-specific reasoning effort controls for OpenRouter models", () => {
    expect(
      supportsOpenRouterReasoningEffortControl({
        slug: "openai/gpt-oss-120b:free",
        name: "OpenAI: gpt-oss-120b (free)",
        description: null,
        contextLength: 131_072,
        supportsTools: true,
        supportsToolChoice: true,
        supportsImages: false,
        supportsReasoning: true,
        source: "catalog",
      }),
    ).toBe(false);
    expect(supportsOpenRouterReasoningEffortControl(null)).toBe(false);
  });

  it("falls back to the router entry when the catalog fetch fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));

    await expect(readOpenRouterFreeModelCatalog(fetchImpl)).resolves.toEqual({
      status: "unavailable",
      fetchedAt: expect.any(String),
      message: "network down",
      models: [
        expect.objectContaining({
          slug: "openrouter/free",
        }),
      ],
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      OPENROUTER_MODELS_API_URL,
      expect.objectContaining({
        headers: {
          Accept: "application/json",
        },
      }),
    );
  });

  it("reuses the last known-good catalog when the live fetch fails", async () => {
    const storage = new Map<string, string>();
    storage.set(
      "cut3:openrouter-free-models-cache:v1",
      JSON.stringify({
        fetchedAt: "2026-03-27T10:00:00.000Z",
        models: [
          {
            slug: "openrouter/free",
            name: "OpenRouter Free Router",
            description: null,
            contextLength: 200000,
            supportsTools: true,
            supportsToolChoice: true,
            supportsImages: true,
            supportsReasoning: true,
            source: "router",
          },
          {
            slug: "openai/gpt-oss-120b:free",
            name: "GPT OSS 120B",
            description: null,
            contextLength: 131072,
            supportsTools: true,
            supportsToolChoice: true,
            supportsImages: false,
            supportsReasoning: true,
            source: "catalog",
          },
        ],
      }),
    );
    const previousWindow = (globalThis as { window?: unknown }).window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    try {
      const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));

      await expect(readOpenRouterFreeModelCatalog(fetchImpl)).resolves.toEqual({
        status: "available",
        fetchedAt: "2026-03-27T10:00:00.000Z",
        source: "cache",
        staleReason: "network down",
        models: [
          expect.objectContaining({ slug: "openrouter/free" }),
          expect.objectContaining({ slug: "openai/gpt-oss-120b:free" }),
        ],
      });
    } finally {
      if (previousWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window");
      } else {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: previousWindow,
        });
      }
    }
  });
});
