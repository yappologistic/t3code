import { describe, expect, it } from "vitest";

import { applyModelsDevContextWindows, parseOpenCodeModelsOutput } from "./OpenCodeState";

describe("parseOpenCodeModelsOutput", () => {
  it("parses provider-scoped model ids from OpenCode CLI output", () => {
    expect(
      parseOpenCodeModelsOutput(`
        minimax-coding-plan/MiniMax-M2.7
        openai/gpt-5.1-codex
      `),
    ).toEqual([
      {
        slug: "minimax-coding-plan/MiniMax-M2.7",
        providerId: "minimax-coding-plan",
        modelId: "MiniMax-M2.7",
      },
      {
        slug: "openai/gpt-5.1-codex",
        providerId: "openai",
        modelId: "gpt-5.1-codex",
      },
    ]);
  });
});

describe("applyModelsDevContextWindows", () => {
  it("enriches provider-scoped OpenCode models with models.dev context limits", () => {
    const models = [
      {
        slug: "minimax-coding-plan/MiniMax-M2.7",
        providerId: "minimax-coding-plan",
        modelId: "MiniMax-M2.7",
      },
      {
        slug: "openai/gpt-5.1-codex",
        providerId: "openai",
        modelId: "gpt-5.1-codex",
      },
    ];

    const catalog = {
      "minimax-coding-plan": {
        models: {
          "MiniMax-M2.7": {
            limit: {
              context: 204_800,
            },
          },
        },
      },
      openai: {
        models: {
          "gpt-5.1-codex": {
            limit: {
              context: 400_000,
            },
          },
        },
      },
    };

    expect(applyModelsDevContextWindows(models, catalog)).toEqual([
      {
        slug: "minimax-coding-plan/MiniMax-M2.7",
        providerId: "minimax-coding-plan",
        modelId: "MiniMax-M2.7",
        contextWindowTokens: 204_800,
      },
      {
        slug: "openai/gpt-5.1-codex",
        providerId: "openai",
        modelId: "gpt-5.1-codex",
        contextWindowTokens: 400_000,
      },
    ]);
  });

  it("matches models.dev entries case-insensitively when provider output casing drifts", () => {
    const models = [
      {
        slug: "minimax-coding-plan/minimax-m2.7",
        providerId: "minimax-coding-plan",
        modelId: "minimax-m2.7",
      },
    ];

    const catalog = {
      "minimax-coding-plan": {
        models: {
          "MiniMax-M2.7": {
            limit: {
              context: 204_800,
            },
          },
        },
      },
    };

    expect(applyModelsDevContextWindows(models, catalog)).toEqual([
      {
        slug: "minimax-coding-plan/minimax-m2.7",
        providerId: "minimax-coding-plan",
        modelId: "minimax-m2.7",
        contextWindowTokens: 204_800,
      },
    ]);
  });
});
