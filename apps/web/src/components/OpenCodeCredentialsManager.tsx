import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, memo } from "react";
import { LoaderCircleIcon, RefreshCwIcon, KeyIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { serverOpenCodeStateQueryOptions, serverQueryKeys } from "~/lib/serverReactQuery";
import { useAppSettings } from "~/appSettings";

export const OpenCodeCredentialsManager = memo(function OpenCodeCredentialsManager() {
  const { settings } = useAppSettings();
  const queryClient = useQueryClient();
  const binaryPath = settings.opencodeBinaryPath?.trim() || undefined;
  const hasSharedOpenRouterKey = settings.openRouterApiKey.trim().length > 0;

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

  const uniqueProviderIds = useMemo(() => {
    const seen = new Set<string>();
    for (const model of models) {
      seen.add(model.providerId);
    }
    return [...seen].toSorted();
  }, [models]);

  const stateMessage = openCodeStateQuery.data?.message?.trim() || null;

  const handleRefreshModels = async () => {
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
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="mb-2 flex items-center gap-2">
          <KeyIcon className="size-4 text-muted-foreground" />
          <h3 className="text-xs font-medium text-foreground">Credentials</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Manage provider credentials in a terminal with <code>opencode auth login</code> and{" "}
          <code>opencode auth logout</code>. CUT3 only reads the current state here.
        </p>
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
            onClick={handleRefreshModels}
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
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{cred.name}</span>
                  <span className="text-xs text-muted-foreground">({cred.authType})</span>
                </div>
              </div>
            ))}
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
            No models yet. Run <code>opencode auth login</code> for a provider or refresh after
            updating your config.
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
