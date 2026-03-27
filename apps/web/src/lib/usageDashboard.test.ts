import { describe, expect, it } from "vitest";

import {
  describeUsageDashboardSnapshot,
  describeUsageSpendState,
  describeUsageTokenBreakdown,
} from "./usageDashboard";

describe("describeUsageDashboardSnapshot", () => {
  it("flags when the latest snapshot does not match the current selection", () => {
    expect(
      describeUsageDashboardSnapshot({
        provider: "copilot",
        model: "claude-sonnet-4.6",
        tokenUsage: {
          provider: "copilot",
          kind: "turn",
          model: "gpt-5.4",
          usage: { totalTokens: 12_000 },
        },
      }),
    ).toMatchObject({
      latestSnapshot: {
        provider: "copilot",
        kind: "turn",
        model: "gpt-5.4",
        usage: { totalTokens: 12_000 },
      },
      matchingSnapshot: null,
      hasSelectionMismatch: true,
    });
  });
});

describe("describeUsageTokenBreakdown", () => {
  it("prefers Codex thread `last` usage for the latest working-set breakdown", () => {
    expect(
      describeUsageTokenBreakdown({
        kind: "thread",
        usage: {
          modelContextWindow: 400_000,
          total: {
            totalTokens: 180_000,
            inputTokens: 120_000,
            cachedInputTokens: 20_000,
            outputTokens: 40_000,
          },
          last: {
            totalTokens: 121_900,
            inputTokens: 92_000,
            cachedInputTokens: 8_000,
            outputTokens: 21_900,
          },
        },
      }),
    ).toEqual({
      totalTokens: 121_900,
      inputTokens: 92_000,
      outputTokens: 21_900,
      reasoningTokens: null,
      cacheReadTokens: 8_000,
      cacheWriteTokens: null,
    });
  });

  it("reads Kimi nested token_usage breakdown fields", () => {
    expect(
      describeUsageTokenBreakdown({
        kind: "turn",
        usage: {
          token_usage: {
            input_other: 4_500,
            output: 900,
            input_cache_read: 350,
            input_cache_creation: 250,
          },
        },
      }),
    ).toEqual({
      totalTokens: 6_000,
      inputTokens: 4_500,
      outputTokens: 900,
      reasoningTokens: null,
      cacheReadTokens: 350,
      cacheWriteTokens: 250,
    });
  });
});

describe("describeUsageSpendState", () => {
  it("prefers explicit totalCostUsd captured on the snapshot", () => {
    expect(
      describeUsageSpendState({
        kind: "turn",
        totalCostUsd: 0.42,
        usage: {
          cost: {
            total: 0.1,
          },
        },
      }),
    ).toEqual({
      totalCostUsd: 0.42,
      source: "snapshot",
    });
  });

  it("falls back to provider usage cost totals when explicit snapshot cost is absent", () => {
    expect(
      describeUsageSpendState({
        kind: "turn",
        usage: {
          cost: {
            total: 0.1,
          },
        },
      }),
    ).toEqual({
      totalCostUsd: 0.1,
      source: "usage",
    });
  });
});
