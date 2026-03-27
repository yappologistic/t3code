import type { ProviderKind } from "@t3tools/contracts";
import {
  getModelContextWindowInfo,
  isCodexOpenRouterModel,
  normalizeModelSlug,
} from "@t3tools/shared/model";

export type ThreadContextUsageSnapshot = {
  provider?: string;
  kind?: "thread" | "turn";
  observedAt?: string;
  model?: string;
  usage?: unknown;
  modelUsage?: Record<string, unknown>;
  totalCostUsd?: number;
};

export type ContextWindowState = {
  totalTokens: number | null;
  totalLabel: string | null;
  note: string | null;
  usedTokens: number | null;
  usedLabel: string | null;
  remainingTokens: number | null;
  remainingLabel: string | null;
  usageScope: "thread" | "turn" | null;
};

export const OPENCODE_MODELS_DEV_CONTEXT_NOTE =
  "OpenCode uses provider/model metadata from models.dev and reads limit.context when the selected model publishes it.";

export function getDocumentedContextWindowOverride(input: {
  provider: ProviderKind;
  model: string | null | undefined;
  opencodeContextLengthsBySlug?: ReadonlyMap<string, number | null>;
}) {
  if (input.provider !== "opencode") {
    return {};
  }

  const normalizedModel = normalizeModelSlug(input.model, "opencode");
  if (!normalizedModel) {
    return {};
  }

  const documentedTotalTokens = input.opencodeContextLengthsBySlug?.get(normalizedModel) ?? null;
  if (documentedTotalTokens === null) {
    return {};
  }

  return {
    documentedTotalTokens,
    documentedNote: OPENCODE_MODELS_DEV_CONTEXT_NOTE,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readNumber(record: Record<string, unknown>, keys: ReadonlyArray<string>): number | null {
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

function extractTokenCountFromUsageRecord(record: Record<string, unknown> | null): number | null {
  if (!record) {
    return null;
  }

  const total = readNumber(record, [
    "used",
    "contextTokens",
    "context_tokens",
    "totalTokens",
    "total_tokens",
    "totalTokenCount",
    "total_token_count",
    "total",
  ]);
  if (total !== null) {
    return total;
  }

  const parts = [
    readNumber(record, [
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
    ]),
    readNumber(record, [
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
    ]),
    readNumber(record, [
      "reasoningTokens",
      "reasoning_tokens",
      "reasoningOutputTokens",
      "reasoning_output_tokens",
      "thoughtTokens",
      "thought_tokens",
      "thought_token_count",
      "thoughtsTokenCount",
      "thoughts_token_count",
    ]),
    readNumber(record, ["cachedInputTokens", "cached_input_tokens"]),
    readNumber(record, ["cacheCreationInputTokens", "cache_creation_input_tokens"]),
    readNumber(record, ["cacheReadInputTokens", "cache_read_input_tokens"]),
    readNumber(record, ["inputCacheRead", "input_cache_read"]),
    readNumber(record, ["inputCacheCreation", "input_cache_creation"]),
    readNumber(record, ["cachedReadTokens", "cached_read_tokens"]),
    readNumber(record, ["cachedWriteTokens", "cached_write_tokens"]),
    readNumber(record, ["cachedContentTokenCount", "cached_content_token_count"]),
  ].filter((value): value is number => value !== null);

  if (parts.length === 0) {
    return extractTokenCountFromUsageRecord(
      asRecord(record.tokenUsage ?? record.token_usage ?? null),
    );
  }

  return parts.reduce((sum, value) => sum + value, 0);
}

function extractContextWindowLimitFromUsageRecord(
  record: Record<string, unknown> | null,
): number | null {
  if (!record) {
    return null;
  }

  const limit = readNumber(record, [
    "size",
    "maxContextTokens",
    "max_context_tokens",
    "modelContextWindow",
    "model_context_window",
    "contextWindow",
    "context_window",
    "maxContextSize",
    "max_context_size",
  ]);
  if (limit !== null) {
    return limit;
  }

  return extractContextWindowLimitFromUsageRecord(
    asRecord(
      record.tokenUsage ??
        record.token_usage ??
        record.last ??
        record.lastTokenUsage ??
        record.last_token_usage ??
        record.total ??
        record.totalTokenUsage ??
        record.total_token_usage ??
        null,
    ),
  );
}

export function parseThreadContextUsageSnapshot(value: unknown): ThreadContextUsageSnapshot | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const modelUsage = asRecord(record.modelUsage ?? record.model_usage ?? null);
  const observedAtValue = record.observedAt ?? record.observed_at ?? null;
  const observedAt = typeof observedAtValue === "string" ? observedAtValue : undefined;
  const totalCostUsd = readNumber(record, ["totalCostUsd", "total_cost_usd"]);

  const structuredSnapshot: ThreadContextUsageSnapshot = {
    ...(typeof record.provider === "string" ? { provider: record.provider } : {}),
    ...(record.kind === "thread" || record.kind === "turn" ? { kind: record.kind } : {}),
    ...(observedAt ? { observedAt } : {}),
    ...(typeof record.model === "string" ? { model: record.model } : {}),
    ...(record.usage !== undefined ? { usage: record.usage } : {}),
    ...(modelUsage ? { modelUsage } : {}),
    ...(totalCostUsd !== null ? { totalCostUsd } : {}),
  };

  if (
    structuredSnapshot.provider !== undefined ||
    structuredSnapshot.kind !== undefined ||
    structuredSnapshot.observedAt !== undefined ||
    structuredSnapshot.model !== undefined ||
    structuredSnapshot.usage !== undefined ||
    structuredSnapshot.modelUsage !== undefined ||
    structuredSnapshot.totalCostUsd !== undefined
  ) {
    return structuredSnapshot;
  }

  // Older persisted sessions may store the provider payload directly instead of the
  // wrapped snapshot shape. Treat the full object as usage so existing conversations
  // can still surface current/remaining context.
  const inferredKind =
    record.last !== undefined ||
    record.lastTokenUsage !== undefined ||
    record.last_token_usage !== undefined ||
    record.modelContextWindow !== undefined ||
    record.model_context_window !== undefined ||
    record.context_usage !== undefined ||
    record.context_tokens !== undefined ||
    record.max_context_tokens !== undefined ||
    record.sessionUpdate === "usage_update" ||
    record.tokenUsage !== undefined ||
    record.token_usage !== undefined
      ? "thread"
      : "turn";

  return {
    kind: inferredKind,
    usage: value,
  };
}

export function formatCompactTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) {
    return "Unknown";
  }
  if (tokens >= 1_000_000) {
    const value = tokens / 1_000_000;
    return `${
      Number.isInteger(value)
        ? value.toFixed(0)
        : value
            .toFixed(2)
            .replace(/\.0+$/, "")
            .replace(/(\.\d*[1-9])0+$/, "$1")
    }M`;
  }
  if (tokens >= 1_000) {
    const value = tokens / 1_000;
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(tokens);
}

export function shouldHideContextWindowForModel(
  provider: ProviderKind,
  model: string | null | undefined,
): boolean {
  return provider === "codex" && isCodexOpenRouterModel(model);
}

function formatCompactUsedTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) {
    return "Unknown";
  }
  if (tokens >= 1_000_000) {
    return formatCompactTokenCount(tokens);
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(tokens);
}

export function doesThreadContextUsageSnapshotMatchSelection(
  snapshot: ThreadContextUsageSnapshot | null,
  provider: ProviderKind,
  model: string | null | undefined,
  requireExactModelMatch = false,
): boolean {
  if (!snapshot) {
    return false;
  }
  if (snapshot.provider && snapshot.provider !== provider) {
    return false;
  }

  const selectedModel = normalizeModelSlug(model, provider);
  const snapshotModel = normalizeModelSlug(snapshot.model, provider);
  if (requireExactModelMatch && selectedModel && !snapshotModel) {
    return false;
  }
  if (selectedModel && snapshotModel && selectedModel !== snapshotModel) {
    return false;
  }

  return true;
}

export function extractUsedContextTokens(
  snapshot: ThreadContextUsageSnapshot | null,
): number | null {
  if (!snapshot) {
    return null;
  }

  if (snapshot.kind === "thread") {
    const usageRecord = asRecord(snapshot.usage);
    const lastUsage = asRecord(
      usageRecord?.last ??
        usageRecord?.lastTokenUsage ??
        usageRecord?.last_token_usage ??
        asRecord(usageRecord?.tokenUsage ?? usageRecord?.token_usage ?? null)?.last ??
        asRecord(usageRecord?.tokenUsage ?? usageRecord?.token_usage ?? null)?.lastTokenUsage ??
        asRecord(usageRecord?.tokenUsage ?? usageRecord?.token_usage ?? null)?.last_token_usage ??
        null,
    );
    const threadUsageTotal = extractTokenCountFromUsageRecord(lastUsage);
    if (threadUsageTotal !== null) {
      return threadUsageTotal;
    }
  }

  const usageTotal = extractTokenCountFromUsageRecord(asRecord(snapshot.usage));
  if (usageTotal !== null) {
    return usageTotal;
  }

  return extractTokenCountFromUsageRecord(snapshot.modelUsage ?? null);
}

export function describeContextWindowState(input: {
  provider: ProviderKind;
  model: string | null | undefined;
  tokenUsage?: unknown;
  documentedTotalTokens?: number | null;
  documentedNote?: string | null;
  requireExactModelMatch?: boolean;
}): ContextWindowState {
  const info = getModelContextWindowInfo(input.model, input.provider);
  const snapshot = parseThreadContextUsageSnapshot(input.tokenUsage);
  const matchingSnapshot = doesThreadContextUsageSnapshotMatchSelection(
    snapshot,
    input.provider,
    input.model,
    input.requireExactModelMatch ?? false,
  )
    ? snapshot
    : null;
  const runtimeContextWindow = extractContextWindowLimitFromUsageRecord(
    asRecord(matchingSnapshot?.usage),
  );
  const usedTokens = extractUsedContextTokens(matchingSnapshot);
  const totalTokens =
    input.documentedTotalTokens ?? runtimeContextWindow ?? info?.totalTokens ?? null;
  const remainingTokens =
    totalTokens !== null && usedTokens !== null ? Math.max(totalTokens - usedTokens, 0) : null;

  return {
    totalTokens,
    totalLabel: totalTokens !== null ? formatCompactTokenCount(totalTokens) : null,
    note: input.documentedNote ?? info?.note ?? null,
    usedTokens,
    usedLabel: usedTokens !== null ? formatCompactUsedTokenCount(usedTokens) : null,
    remainingTokens,
    remainingLabel: remainingTokens !== null ? formatCompactUsedTokenCount(remainingTokens) : null,
    usageScope: matchingSnapshot?.kind ?? null,
  };
}
