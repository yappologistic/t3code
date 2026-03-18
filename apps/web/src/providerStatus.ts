import {
  type OrchestrationSessionStatus,
  type ProviderKind,
  type ServerProviderStatus,
} from "@t3tools/contracts";

function isProviderKind(value: string | null | undefined): value is ProviderKind {
  return value === "codex" || value === "copilot" || value === "kimi" || value === "opencode";
}

export function findProviderStatus(
  providerStatuses: ReadonlyArray<ServerProviderStatus>,
  provider: ProviderKind,
): ServerProviderStatus | null {
  return providerStatuses.find((status) => status.provider === provider) ?? null;
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
}): ServerProviderStatus | null {
  const status = resolveProviderStatusForChat(input);
  if (!status) {
    return null;
  }

  if (status.provider === input.sessionProvider && isSuccessfulSessionStatus(input.sessionStatus)) {
    return null;
  }

  return status;
}
