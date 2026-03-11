import type {
  ProviderKind,
  ServerMcpServerAuthStatus,
  ServerMcpServerStatus,
  ServerProviderMcpStatus,
} from "@t3tools/contracts";

export interface ComposerMcpServerItemData {
  readonly id: string;
  readonly name: string;
  readonly provider: ProviderKind;
  readonly state: ServerMcpServerStatus["state"];
  readonly authStatus: ServerMcpServerAuthStatus;
  readonly description: string;
}

export function findProviderMcpStatus(
  providerMcpStatuses: ReadonlyArray<ServerProviderMcpStatus>,
  provider: ProviderKind,
): ServerProviderMcpStatus | null {
  return providerMcpStatuses.find((status) => status.provider === provider) ?? null;
}

export function providerSupportsMcp(
  providerMcpStatuses: ReadonlyArray<ServerProviderMcpStatus>,
  provider: ProviderKind,
): boolean {
  return findProviderMcpStatus(providerMcpStatuses, provider)?.supported ?? false;
}

function formatAuthStatus(authStatus: ServerMcpServerAuthStatus): string | null {
  switch (authStatus) {
    case "bearer_token":
      return "Bearer token";
    case "o_auth":
      return "OAuth";
    case "not_logged_in":
      return "Needs login";
    case "unsupported":
      return "No auth";
    default:
      return null;
  }
}

function formatCapabilities(server: ServerMcpServerStatus): string | null {
  if (server.toolCount > 0) {
    return server.toolCount === 1 ? "1 tool" : `${server.toolCount} tools`;
  }
  if (server.resourceCount > 0) {
    return server.resourceCount === 1 ? "1 resource" : `${server.resourceCount} resources`;
  }
  if (server.resourceTemplateCount > 0) {
    return server.resourceTemplateCount === 1
      ? "1 template"
      : `${server.resourceTemplateCount} templates`;
  }
  return null;
}

export function formatMcpServerDescription(server: ServerMcpServerStatus): string {
  if (!server.enabled) {
    return "Disabled in Codex config";
  }

  const parts = ["Enabled"];
  const authStatus = formatAuthStatus(server.authStatus);
  const capabilities = formatCapabilities(server);
  if (authStatus) {
    parts.push(authStatus);
  }
  if (capabilities) {
    parts.push(capabilities);
  }
  return parts.join(" · ");
}

export function buildComposerMcpServerItems(input: {
  readonly provider: ProviderKind;
  readonly providerMcpStatuses: ReadonlyArray<ServerProviderMcpStatus>;
  readonly query: string;
}): ReadonlyArray<ComposerMcpServerItemData> {
  const providerStatus = findProviderMcpStatus(input.providerMcpStatuses, input.provider);
  if (!providerStatus || !providerStatus.supported) {
    return [];
  }

  const query = input.query.trim().toLowerCase();
  return providerStatus.servers
    .filter((server) => {
      if (!query) {
        return true;
      }

      const authLabel = formatAuthStatus(server.authStatus)?.toLowerCase() ?? "";
      return (
        server.name.toLowerCase().includes(query) ||
        server.state.toLowerCase().includes(query) ||
        authLabel.includes(query)
      );
    })
    .map((server) => ({
      id: `mcp:${input.provider}:${server.name}`,
      name: server.name,
      provider: input.provider,
      state: server.state,
      authStatus: server.authStatus,
      description: formatMcpServerDescription(server),
    }));
}
