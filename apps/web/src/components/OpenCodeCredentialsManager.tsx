import type { ServerMcpServerAuthStatus, ServerOpenCodeConfigSource } from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useMemo, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  KeyIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  ServerIcon,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { serverOpenCodeStateQueryOptions, serverQueryKeys } from "~/lib/serverReactQuery";
import { formatMcpServerDescription } from "~/mcpServers";
import { useAppSettings } from "~/appSettings";
import { formatShellCommandBinary, shellQuote } from "./OpenCodeCredentialsManager.logic";

function formatConfigSourceLabel(kind: ServerOpenCodeConfigSource["kind"]): string {
  switch (kind) {
    case "global-config":
      return "Global config";
    case "custom-config":
      return "Custom config";
    case "project-config":
      return "Project config";
    case "global-directory":
      return "Global .opencode";
    case "custom-directory":
      return "Custom config dir";
    case "project-directory":
      return "Project .opencode";
  }
}

function formatMcpAuthActionLabel(authStatus: ServerMcpServerAuthStatus): string | null {
  switch (authStatus) {
    case "not_logged_in":
      return "Copy auth";
    case "o_auth":
      return "Copy logout";
    default:
      return null;
  }
}

export const OpenCodeCredentialsManager = memo(function OpenCodeCredentialsManager() {
  const { settings } = useAppSettings();
  const queryClient = useQueryClient();
  const [lastCopiedCommandId, setLastCopiedCommandId] = useState<string | null>(null);
  const binaryPath = settings.opencodeBinaryPath?.trim() || undefined;
  const binaryCommand = formatShellCommandBinary(binaryPath);
  const hasSharedOpenRouterKey = settings.openRouterApiKey.trim().length > 0;
  const { copyToClipboard, isCopied } = useCopyToClipboard<{ id: string }>({
    onCopy: ({ id }) => setLastCopiedCommandId(id),
  });

  const openCodeStateQuery = useQuery(
    serverOpenCodeStateQueryOptions({
      binaryPath,
      refreshModels: false,
    }),
  );

  const credentials = useMemo(
    () =>
      openCodeStateQuery.data?.status === "available" ? openCodeStateQuery.data.credentials : [],
    [openCodeStateQuery.data],
  );

  const models = useMemo(
    () => (openCodeStateQuery.data?.status === "available" ? openCodeStateQuery.data.models : []),
    [openCodeStateQuery.data],
  );
  const mcpServers = openCodeStateQuery.data?.mcpServers ?? [];
  const configSources = openCodeStateQuery.data?.configSources ?? [];
  const mcpSupported = openCodeStateQuery.data?.mcpSupported ?? false;

  const uniqueProviderIds = useMemo(() => {
    const seen = new Set<string>();
    for (const model of models) {
      seen.add(model.providerId);
    }
    return [...seen].toSorted();
  }, [models]);

  const stateMessage = openCodeStateQuery.data?.message?.trim() || null;

  const handleRefreshRuntime = async () => {
    const refreshedState = await queryClient.fetchQuery(
      serverOpenCodeStateQueryOptions({
        binaryPath,
        refreshModels: true,
      }),
    );
    queryClient.setQueryData(
      serverQueryKeys.openCodeState({ binaryPath, refreshModels: false }),
      refreshedState,
    );
    await queryClient.invalidateQueries({ queryKey: serverQueryKeys.config() });
  };

  const renderCopyCommandButton = (input: {
    readonly id: string;
    readonly label: string;
    readonly command: string;
  }) => {
    const copied = isCopied && lastCopiedCommandId === input.id;
    return (
      <Button
        key={input.id}
        size="xs"
        variant="outline"
        onClick={() => copyToClipboard(input.command, { id: input.id })}
      >
        {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
        <span>{copied ? "Copied" : input.label}</span>
      </Button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="mb-2 flex items-center gap-2">
          <KeyIcon className="size-4 text-muted-foreground" />
          <h3 className="text-xs font-medium text-foreground">OpenCode runtime</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Rowl reads <code>{binaryCommand} auth list</code>, <code>{binaryCommand} mcp list</code>,
          and <code>{binaryCommand} mcp auth list</code>. OpenCode still owns the actual login,
          logout, and OAuth flows.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {renderCopyCommandButton({
            id: "opencode-auth-login",
            label: "Copy login",
            command: `${binaryCommand} auth login`,
          })}
          {renderCopyCommandButton({
            id: "opencode-auth-logout",
            label: "Copy logout",
            command: `${binaryCommand} auth logout`,
          })}
        </div>
        <p
          className={
            hasSharedOpenRouterKey
              ? "mt-2 text-xs text-emerald-600 dark:text-emerald-400"
              : "mt-2 text-xs text-muted-foreground"
          }
        >
          {hasSharedOpenRouterKey
            ? "New OpenCode sessions will inherit the shared OpenRouter key as OPENROUTER_API_KEY."
            : "Add the OpenRouter key above if your OpenCode config expects OPENROUTER_API_KEY."}
        </p>
        {stateMessage ? (
          <p
            className={
              openCodeStateQuery.data?.status === "unavailable"
                ? "mt-2 text-xs text-destructive"
                : "mt-2 text-xs text-muted-foreground"
            }
          >
            {stateMessage}
          </p>
        ) : (
          <></>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-foreground">Providers</h3>
          <Button
            size="xs"
            variant="ghost"
            onClick={handleRefreshRuntime}
            disabled={openCodeStateQuery.isFetching}
          >
            {openCodeStateQuery.isFetching ? (
              <LoaderCircleIcon className="size-3 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-3" />
            )}
          </Button>
        </div>
        {openCodeStateQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-3 animate-spin" />
            Loading...
          </div>
        ) : credentials.length === 0 ? (
          <p className="text-xs text-muted-foreground">No stored provider credentials found.</p>
        ) : (
          <div className="space-y-1">
            {credentials.map((cred) => (
              <div key={`${cred.name}-${cred.authType}`} className="rounded bg-muted/50 px-2 py-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{cred.name}</span>
                    <span className="text-xs text-muted-foreground">({cred.authType})</span>
                  </div>
                  {renderCopyCommandButton({
                    id: `provider-login:${cred.name}`,
                    label: "Copy provider login",
                    command: `${binaryCommand} auth login --provider ${shellQuote(cred.name)}`,
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <ServerIcon className="size-4 text-muted-foreground" />
          <h3 className="text-xs font-medium text-foreground">Config sources</h3>
        </div>
        {configSources.length === 0 ? (
          <p className="text-xs text-muted-foreground">No OpenCode config paths were resolved.</p>
        ) : (
          <div className="space-y-1">
            {configSources.map((source) => (
              <div key={`${source.kind}:${source.path}`} className="rounded bg-muted/50 px-2 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {formatConfigSourceLabel(source.kind)}
                  </span>
                  <span
                    className={
                      source.exists
                        ? "text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                        : "text-[11px] text-muted-foreground"
                    }
                  >
                    {source.exists ? "Found" : "Missing"}
                  </span>
                </div>
                <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                  {source.path}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-foreground">MCP servers</h3>
          <span className="text-[11px] text-muted-foreground">
            {mcpSupported ? `${mcpServers.length} detected` : "Inspection unavailable"}
          </span>
        </div>
        {!mcpSupported ? (
          <p className="text-xs text-muted-foreground">
            Rowl could not inspect OpenCode MCP servers from this runtime snapshot.
          </p>
        ) : mcpServers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No configured MCP servers found in the resolved OpenCode configuration.
          </p>
        ) : (
          <div className="space-y-1">
            {mcpServers.map((server) => {
              const mcpAuthActionLabel = formatMcpAuthActionLabel(server.authStatus);
              const mcpAuthCommand =
                server.authStatus === "not_logged_in"
                  ? `${binaryCommand} mcp auth ${shellQuote(server.name)}`
                  : server.authStatus === "o_auth"
                    ? `${binaryCommand} mcp logout ${shellQuote(server.name)}`
                    : null;

              return (
                <div key={server.name} className="rounded bg-muted/50 px-2 py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{server.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatMcpServerDescription(server, "opencode")}
                        </span>
                      </div>
                      {server.target ? (
                        <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                          {server.target}
                        </div>
                      ) : null}
                      {server.message ? (
                        <div
                          className={
                            server.connectionStatus === "failed"
                              ? "mt-1 text-xs text-destructive"
                              : "mt-1 text-xs text-muted-foreground"
                          }
                        >
                          {server.message}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {mcpAuthActionLabel && mcpAuthCommand
                        ? renderCopyCommandButton({
                            id: `mcp-auth:${server.name}:${server.authStatus}`,
                            label: mcpAuthActionLabel,
                            command: mcpAuthCommand,
                          })
                        : null}
                      {server.connectionStatus === "failed"
                        ? renderCopyCommandButton({
                            id: `mcp-debug:${server.name}`,
                            label: "Copy debug",
                            command: `${binaryCommand} mcp debug ${shellQuote(server.name)}`,
                          })
                        : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-foreground">
            Models ({uniqueProviderIds.length} providers, {models.length} total)
          </h3>
        </div>
        {models.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No models yet. Run <code>{binaryCommand} auth login</code> for a provider or refresh
            after updating your config.
          </p>
        ) : (
          <div className="max-h-40 overflow-y-auto rounded bg-muted/50 p-2">
            {uniqueProviderIds.map((providerId) => (
              <div key={providerId} className="mb-2">
                <div className="text-xs font-medium text-foreground mb-1">{providerId}</div>
                <div className="pl-2 space-y-0.5">
                  {models
                    .filter((m) => m.providerId === providerId)
                    .map((model) => (
                      <div key={model.slug} className="text-xs text-muted-foreground">
                        {model.modelId}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
