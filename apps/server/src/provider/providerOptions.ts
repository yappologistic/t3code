import type { ProviderStartOptions } from "@t3tools/contracts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeProviderOptionsForPersistence(
  providerOptions: ProviderStartOptions | undefined,
): ProviderStartOptions | undefined {
  if (!providerOptions) {
    return undefined;
  }

  const kimi = providerOptions.kimi?.binaryPath
    ? { kimi: { binaryPath: providerOptions.kimi.binaryPath } }
    : {};
  const opencode = providerOptions.opencode?.binaryPath
    ? { opencode: { binaryPath: providerOptions.opencode.binaryPath } }
    : {};
  const next = {
    ...(providerOptions.codex
      ? {
          codex: {
            ...(providerOptions.codex.binaryPath
              ? { binaryPath: providerOptions.codex.binaryPath }
              : {}),
            ...(providerOptions.codex.homePath ? { homePath: providerOptions.codex.homePath } : {}),
          },
        }
      : {}),
    ...(providerOptions.copilot ? { copilot: providerOptions.copilot } : {}),
    ...kimi,
    ...opencode,
  } satisfies ProviderStartOptions;

  return Object.keys(next).length > 0 ? next : undefined;
}

export function sanitizeProviderOptionsRecordForPersistence(
  providerOptions: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(providerOptions)) {
    return undefined;
  }

  const next: Record<string, unknown> = {};

  if (isRecord(providerOptions.codex)) {
    const codex: Record<string, unknown> = {};
    if (typeof providerOptions.codex.binaryPath === "string") {
      codex.binaryPath = providerOptions.codex.binaryPath;
    }
    if (typeof providerOptions.codex.homePath === "string") {
      codex.homePath = providerOptions.codex.homePath;
    }
    if (Object.keys(codex).length > 0) {
      next.codex = codex;
    }
  }

  if (isRecord(providerOptions.copilot)) {
    const copilot: Record<string, unknown> = {};
    if (typeof providerOptions.copilot.binaryPath === "string") {
      copilot.binaryPath = providerOptions.copilot.binaryPath;
    }
    if (Object.keys(copilot).length > 0) {
      next.copilot = copilot;
    }
  }

  if (isRecord(providerOptions.kimi)) {
    const kimi: Record<string, unknown> = {};
    if (typeof providerOptions.kimi.binaryPath === "string") {
      kimi.binaryPath = providerOptions.kimi.binaryPath;
    }
    if (Object.keys(kimi).length > 0) {
      next.kimi = kimi;
    }
  }

  if (isRecord(providerOptions.opencode)) {
    const opencode: Record<string, unknown> = {};
    if (typeof providerOptions.opencode.binaryPath === "string") {
      opencode.binaryPath = providerOptions.opencode.binaryPath;
    }
    if (Object.keys(opencode).length > 0) {
      next.opencode = opencode;
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}
