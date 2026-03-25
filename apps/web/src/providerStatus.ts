import {
  type OrchestrationSessionStatus,
  type ProviderKind,
  type ServerProviderStatus,
} from "@t3tools/contracts";

export interface ProviderStatusModelOption {
  slug: string;
  name: string;
  supportsReasoning?: boolean;
  supportsImageInput?: boolean;
  contextWindowTokens?: number;
}

function isProviderKind(value: string | null | undefined): value is ProviderKind {
  return (
    value === "codex" ||
    value === "copilot" ||
    value === "kimi" ||
    value === "opencode" ||
    value === "pi"
  );
}

export function getProviderDisplayLabel(provider: ProviderKind): string {
  switch (provider) {
    case "codex":
      return "Codex";
    case "copilot":
      return "GitHub Copilot";
    case "kimi":
      return "Kimi Code";
    case "opencode":
      return "OpenCode";
    case "pi":
      return "Pi";
  }
}

export function getProviderStatusTitle(provider: ProviderKind): string {
  return `${getProviderDisplayLabel(provider)} provider status`;
}

export function getDefaultProviderStatusMessage(status: ServerProviderStatus): string {
  const providerLabel = getProviderDisplayLabel(status.provider);
  return status.status === "error"
    ? `${providerLabel} provider is unavailable.`
    : `${providerLabel} provider has limited availability.`;
}

export function findProviderStatus(
  providerStatuses: ReadonlyArray<ServerProviderStatus>,
  provider: ProviderKind,
): ServerProviderStatus | null {
  return providerStatuses.find((status) => status.provider === provider) ?? null;
}

export function getProviderStatusModelOptions(
  status: ServerProviderStatus | null,
): ProviderStatusModelOption[] {
  const options: ProviderStatusModelOption[] = [];
  const seen = new Set<string>();

  for (const entry of status?.availableModels ?? []) {
    const slug = entry.slug.trim();
    const name = entry.name.trim();
    if (!slug || !name || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    options.push({
      slug,
      name,
      ...(entry.supportsReasoning !== undefined
        ? { supportsReasoning: entry.supportsReasoning }
        : {}),
      ...(entry.supportsImageInput !== undefined
        ? { supportsImageInput: entry.supportsImageInput }
        : {}),
      ...(entry.contextWindowTokens !== undefined
        ? { contextWindowTokens: entry.contextWindowTokens }
        : {}),
    });
  }

  return options;
}

export function resolveProviderStatusForChat(input: {
  readonly providerStatuses: ReadonlyArray<ServerProviderStatus>;
  readonly selectedProvider: ProviderKind;
  readonly sessionProvider?: string | null;
}): ServerProviderStatus | null {
  const provider = isProviderKind(input.sessionProvider)
    ? input.sessionProvider
    : input.selectedProvider;
  return findProviderStatus(input.providerStatuses, provider);
}

function isSuccessfulSessionStatus(status: OrchestrationSessionStatus | null | undefined): boolean {
  return (
    status === "starting" || status === "running" || status === "ready" || status === "interrupted"
  );
}

export function resolveVisibleProviderStatusForChat(input: {
  readonly providerStatuses: ReadonlyArray<ServerProviderStatus>;
  readonly selectedProvider: ProviderKind;
  readonly sessionProvider?: string | null;
  readonly sessionStatus?: OrchestrationSessionStatus | null;
  readonly selectedModelUsesOpenRouter?: boolean;
}): ServerProviderStatus | null {
  const status = resolveProviderStatusForChat(input);
  if (!status) {
    return null;
  }

  if (status.provider === "codex" && input.selectedModelUsesOpenRouter) {
    return status;
  }

  if (status.provider === input.sessionProvider && isSuccessfulSessionStatus(input.sessionStatus)) {
    return null;
  }

  return status;
}
