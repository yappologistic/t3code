import type {
  ServerCopilotReasoningProbe,
  ServerCopilotReasoningProbeInput,
  ServerCopilotUsage,
  ServerOpenCodeState,
  ServerOpenCodeStateInput,
} from "@t3tools/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

function buildUnavailableCopilotUsage(message: string): ServerCopilotUsage {
  return {
    status: "unavailable",
    fetchedAt: new Date().toISOString(),
    message,
  } satisfies ServerCopilotUsage;
}

async function readCopilotUsageSafely(): Promise<ServerCopilotUsage> {
  try {
    const api = ensureNativeApi();
    return await api.server.getCopilotUsage();
  } catch (error) {
    const detail = error instanceof Error ? error.message.trim() : String(error).trim();
    return buildUnavailableCopilotUsage(
      detail.length > 0
        ? `GitHub Copilot quota request failed: ${detail}`
        : "GitHub Copilot quota request failed.",
    );
  }
}

function buildUnavailableOpenCodeState(
  input: ServerOpenCodeStateInput,
  message: string,
): ServerOpenCodeState {
  return {
    status: "unavailable",
    fetchedAt: new Date().toISOString(),
    checkedCwd: input.cwd?.trim() || ".",
    binaryPath: input.binaryPath?.trim() || "opencode",
    credentials: [],
    models: [],
    message,
  } satisfies ServerOpenCodeState;
}

async function readOpenCodeStateSafely(
  input: ServerOpenCodeStateInput,
): Promise<ServerOpenCodeState> {
  try {
    const api = ensureNativeApi();
    return await api.server.getOpenCodeState(input);
  } catch (error) {
    const detail = error instanceof Error ? error.message.trim() : String(error).trim();
    return buildUnavailableOpenCodeState(
      input,
      detail.length > 0
        ? `OpenCode runtime query failed: ${detail}`
        : "OpenCode runtime query failed.",
    );
  }
}

export const serverQueryKeys = {
  all: ["server"] as const,
  config: () => ["server", "config"] as const,
  copilotUsage: () => ["server", "copilotUsage"] as const,
  copilotReasoningProbe: (input: ServerCopilotReasoningProbeInput) =>
    ["server", "copilotReasoningProbe", input.model, input.binaryPath ?? null] as const,
  openCodeState: (input: ServerOpenCodeStateInput) =>
    [
      "server",
      "openCodeState",
      input.cwd ?? null,
      input.binaryPath ?? null,
      input.refreshModels ?? false,
    ] as const,
};

export function serverConfigQueryOptions() {
  return queryOptions({
    queryKey: serverQueryKeys.config(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.server.getConfig();
    },
    staleTime: Infinity,
  });
}

export function serverCopilotUsageQueryOptions(enabled = true) {
  return queryOptions({
    queryKey: serverQueryKeys.copilotUsage(),
    queryFn: readCopilotUsageSafely,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    enabled,
    retry: false,
  });
}

export function serverCopilotReasoningProbeQueryOptions(
  input: ServerCopilotReasoningProbeInput,
  enabled = true,
) {
  return queryOptions<ServerCopilotReasoningProbe>({
    queryKey: serverQueryKeys.copilotReasoningProbe(input),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.server.probeCopilotReasoning(input);
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    enabled,
    retry: false,
  });
}

export function serverOpenCodeStateQueryOptions(input: ServerOpenCodeStateInput, enabled = true) {
  return queryOptions<ServerOpenCodeState>({
    queryKey: serverQueryKeys.openCodeState(input),
    queryFn: () => readOpenCodeStateSafely(input),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    enabled,
    retry: false,
  });
}
