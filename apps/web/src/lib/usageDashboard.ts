import type { ProviderKind } from "@t3tools/contracts";

import {
  doesThreadContextUsageSnapshotMatchSelection,
  parseThreadContextUsageSnapshot,
  type ThreadContextUsageSnapshot,
} from "./contextWindow";

export type UsageDashboardSnapshotState = {
  latestSnapshot: ThreadContextUsageSnapshot | null;
  matchingSnapshot: ThreadContextUsageSnapshot | null;
  hasSelectionMismatch: boolean;
};

export type UsageTokenBreakdown = {
  totalTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
};

export type UsageSpendState = {
  totalCostUsd: number | null;
  source: "snapshot" | "usage" | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readNumber(
  record: Record<string, unknown> | null,
  keys: ReadonlyArray<string>,
): number | null {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readUsageEnvelope(snapshot: ThreadContextUsageSnapshot | null) {
  const usage = asRecord(snapshot?.usage);
  const nestedUsage = asRecord(usage?.tokenUsage ?? usage?.token_usage ?? null);
  const lastUsage = asRecord(
    usage?.last ??
      usage?.lastTokenUsage ??
      usage?.last_token_usage ??
      nestedUsage?.last ??
      nestedUsage?.lastTokenUsage ??
      nestedUsage?.last_token_usage ??
      null,
  );
  const modelUsage = asRecord(snapshot?.modelUsage ?? null);

  return {
    usage,
    nestedUsage,
    lastUsage,
    modelUsage,
  };
}

function firstNumber(
  records: ReadonlyArray<Record<string, unknown> | null>,
  keys: ReadonlyArray<string>,
): number | null {
  for (const record of records) {
    const value = readNumber(record, keys);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

export function describeUsageDashboardSnapshot(input: {
  provider: ProviderKind;
  model: string | null | undefined;
  tokenUsage?: unknown;
  requireExactModelMatch?: boolean;
}): UsageDashboardSnapshotState {
  const latestSnapshot = parseThreadContextUsageSnapshot(input.tokenUsage);
  const matchingSnapshot = doesThreadContextUsageSnapshotMatchSelection(
    latestSnapshot,
    input.provider,
    input.model,
    input.requireExactModelMatch ?? false,
  )
    ? latestSnapshot
    : null;

  return {
    latestSnapshot,
    matchingSnapshot,
    hasSelectionMismatch: latestSnapshot !== null && matchingSnapshot === null,
  };
}

export function describeUsageTokenBreakdown(
  snapshot: ThreadContextUsageSnapshot | null,
): UsageTokenBreakdown {
  const envelope = readUsageEnvelope(snapshot);
  const preferredRecords =
    snapshot?.kind === "thread"
      ? [envelope.lastUsage, envelope.usage, envelope.nestedUsage, envelope.modelUsage]
      : [envelope.usage, envelope.nestedUsage, envelope.modelUsage, envelope.lastUsage];

  const inputTokens = firstNumber(preferredRecords, [
    "inputOther",
    "input_other",
    "inputTokens",
    "input_tokens",
    "promptTokens",
    "prompt_tokens",
    "promptTokenCount",
    "prompt_token_count",
    "inputTokenCount",
    "input_token_count",
  ]);
  const outputTokens = firstNumber(preferredRecords, [
    "output",
    "outputTokens",
    "output_tokens",
    "completionTokens",
    "completion_tokens",
    "candidateTokens",
    "candidate_token_count",
    "candidatesTokenCount",
    "candidates_token_count",
    "outputTokenCount",
    "output_token_count",
  ]);
  const reasoningTokens = firstNumber(preferredRecords, [
    "reasoningTokens",
    "reasoning_tokens",
    "reasoningOutputTokens",
    "reasoning_output_tokens",
    "thoughtTokens",
    "thought_tokens",
    "thought_token_count",
    "thoughtsTokenCount",
    "thoughts_token_count",
  ]);
  const cacheReadTokens = firstNumber(preferredRecords, [
    "cachedInputTokens",
    "cached_input_tokens",
    "cacheReadInputTokens",
    "cache_read_input_tokens",
    "inputCacheRead",
    "input_cache_read",
    "cachedReadTokens",
    "cached_read_tokens",
    "cachedContentTokenCount",
    "cached_content_token_count",
  ]);
  const cacheWriteTokens = firstNumber(preferredRecords, [
    "cacheCreationInputTokens",
    "cache_creation_input_tokens",
    "inputCacheCreation",
    "input_cache_creation",
    "cachedWriteTokens",
    "cached_write_tokens",
  ]);
  const directTotal = firstNumber(preferredRecords, [
    "used",
    "contextTokens",
    "context_tokens",
    "totalTokens",
    "total_tokens",
    "totalTokenCount",
    "total_token_count",
    "total",
  ]);
  const fallbackTotal = [
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
  ]
    .filter((value): value is number => value !== null)
    .reduce((sum, value) => sum + value, 0);
  const totalTokens = directTotal ?? (fallbackTotal > 0 ? fallbackTotal : null);

  return {
    totalTokens,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
  };
}

export function describeUsageSpendState(
  snapshot: ThreadContextUsageSnapshot | null,
): UsageSpendState {
  if (!snapshot) {
    return { totalCostUsd: null, source: null };
  }

  if (typeof snapshot.totalCostUsd === "number" && Number.isFinite(snapshot.totalCostUsd)) {
    return {
      totalCostUsd: snapshot.totalCostUsd,
      source: "snapshot",
    };
  }

  const envelope = readUsageEnvelope(snapshot);
  const totalCostUsd = firstNumber(
    [envelope.lastUsage, envelope.usage, envelope.nestedUsage, envelope.modelUsage],
    ["totalCostUsd", "total_cost_usd"],
  );
  if (totalCostUsd !== null) {
    return {
      totalCostUsd,
      source: "usage",
    };
  }

  const nestedCostTotal = firstNumber(
    [
      asRecord(envelope.lastUsage?.cost ?? null),
      asRecord(envelope.usage?.cost ?? null),
      asRecord(envelope.nestedUsage?.cost ?? null),
      asRecord(envelope.modelUsage?.cost ?? null),
    ],
    ["total"],
  );
  if (nestedCostTotal !== null) {
    return {
      totalCostUsd: nestedCostTotal,
      source: "usage",
    };
  }

  return {
    totalCostUsd: null,
    source: null,
  };
}
