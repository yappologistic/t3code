import {
  type GitStackedAction,
  type NativeApi,
} from "@t3tools/contracts";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { ChevronDownIcon, CloudUploadIcon, GitCommitIcon, InfoIcon } from "lucide-react";
import { GitHubIcon } from "./Icons";
import {
  buildMenuItems,
  type GitActionIconName,
  type GitActionMenuItem,
  type GitDialogAction,
  type GitQuickAction,
  describeGitResult,
  requiresDefaultBranchConfirmation,
  resolveQuickAction,
} from "./GitActionsControl.logic";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Group, GroupSeparator } from "~/components/ui/group";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { Textarea } from "~/components/ui/textarea";
import { toastManager } from "~/components/ui/toast";

interface GitActionsControlProps {
  api: NativeApi | undefined;
  gitCwd: string | null;
}

function GitActionItemIcon({ icon }: { icon: GitActionIconName }) {
  if (icon === "commit") return <GitCommitIcon />;
  if (icon === "push") return <CloudUploadIcon />;
  return <GitHubIcon />;
}

function GitQuickActionIcon({ quickAction }: { quickAction: GitQuickAction }) {
  if (quickAction.kind === "open_pr") return <GitHubIcon className="size-4" />;
  if (quickAction.kind === "run_pull") return <InfoIcon className="size-4" />;
  if (quickAction.kind === "run_action") {
    if (quickAction.action === "commit") return <GitCommitIcon className="size-4" />;
    if (quickAction.action === "commit_push") return <CloudUploadIcon className="size-4" />;
    return <GitHubIcon className="size-4" />;
  }
  if (quickAction.label === "Commit") return <GitCommitIcon className="size-4" />;
  return <InfoIcon className="size-4" />;
}

function getGitStatusQueryKey(gitCwd: string | null): readonly ["git", "status", string | null] {
  return ["git", "status", gitCwd];
}

function gitStatusQueryOptions(api: NativeApi | undefined, gitCwd: string | null) {
  return queryOptions({
    queryKey: getGitStatusQueryKey(gitCwd),
    queryFn: async () => {
      if (!api || !gitCwd) {
        throw new Error("Git status is unavailable.");
      }
      return api.git.status({ cwd: gitCwd });
    },
    enabled: !!api && !!gitCwd,
  });
}

export default function GitActionsControl({ api, gitCwd }: GitActionsControlProps) {
  const queryClient = useQueryClient();
  const [activeDialogAction, setActiveDialogAction] = useState<GitDialogAction | null>(null);
  const [dialogCommitMessage, setDialogCommitMessage] = useState("");

  const { data: gitStatus = null, error: gitStatusError } = useQuery(
    gitStatusQueryOptions(api, gitCwd),
  );

  const { data: branchList = null } = useQuery({
    queryKey: ["git", "branches", gitCwd],
    queryFn: async () => {
      if (!api || !gitCwd) throw new Error("Git branches are unavailable.");
      return api.git.listBranches({ cwd: gitCwd });
    },
    enabled: !!api && !!gitCwd,
  });

  const runImmediateGitActionMutation = useMutation({
    mutationFn: async ({
      action,
      commitMessage,
    }: {
      action: GitStackedAction;
      commitMessage?: string;
    }) => {
      if (!api || !gitCwd) {
        throw new Error("Git action is unavailable.");
      }
      return api.git.runStackedAction({ cwd: gitCwd, action, ...(commitMessage ? { commitMessage } : {}) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["git"] });
    },
  });
  const pullMutation = useMutation({
    mutationFn: async () => {
      if (!api || !gitCwd) throw new Error("Git pull is unavailable.");
      return api.git.pull({ cwd: gitCwd });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["git"] });
    },
  });

  const isGitActionRunning = runImmediateGitActionMutation.isPending || pullMutation.isPending;
  const isDefaultBranch = useMemo(() => {
    const currentBranch = gitStatus?.branch;
    if (!currentBranch) return false;
    const current = branchList?.branches.find((branch) => branch.name === currentBranch);
    return current?.isDefault ?? (currentBranch === "main" || currentBranch === "master");
  }, [branchList?.branches, gitStatus?.branch]);

  const gitActionMenuItems = useMemo(
    () => buildMenuItems(gitStatus, isGitActionRunning),
    [gitStatus, isGitActionRunning],
  );
  const quickAction = useMemo(
    () => resolveQuickAction(gitStatus, isGitActionRunning),
    [gitStatus, isGitActionRunning],
  );

  const refreshGitStatus = useCallback(async () => {
    if (!api || !gitCwd) return;
    await queryClient.invalidateQueries({ queryKey: ["git"] });
  }, [api, gitCwd, queryClient]);

  const maybeConfirmPushToDefaultBranch = useCallback(
    async (action: GitStackedAction): Promise<boolean> => {
      if (!api) return false;
      if (!requiresDefaultBranchConfirmation(action, isDefaultBranch) || !gitStatus?.branch) {
        return true;
      }
      return api.dialogs.confirm(
        `Push to default branch "${gitStatus.branch}"? This will update the shared base branch.`,
      );
    },
    [api, gitStatus?.branch, isDefaultBranch],
  );

  const openExistingPr = useCallback(async () => {
    if (!api) {
      toastManager.add({ type: "error", title: "Link opening is unavailable." });
      return;
    }
    const prUrl = gitStatus?.openPr?.url ?? null;
    if (!prUrl) {
      toastManager.add({ type: "error", title: "No open PR found." });
      return;
    }
    const promise = api.shell.openExternal(prUrl);
    toastManager.promise(promise, {
      loading: { title: "Opening PR..." },
      success: { title: "PR opened" },
      error: (err) => ({
        title: "Unable to open PR link",
        description: err instanceof Error ? err.message : "An error occurred.",
      }),
    });
    void promise.catch(() => undefined);
  }, [api, gitStatus?.openPr?.url]);

  const runGitActionWithToast = useCallback(
    async ({
      action,
      commitMessage,
    }: {
      action: GitStackedAction;
      commitMessage?: string;
    }) => {
      const confirmed = await maybeConfirmPushToDefaultBranch(action);
      if (!confirmed) return;

      const promise = runImmediateGitActionMutation.mutateAsync({
        action,
        ...(commitMessage ? { commitMessage } : {}),
      });
      toastManager.promise(promise, {
        loading: {
          title:
            action === "commit"
              ? "Committing..."
              : action === "commit_push"
                ? "Pushing..."
                : "Creating PR...",
        },
        success: (result) => {
          const prUrl = result.pr.url ?? gitStatus?.openPr?.url;
          const shouldOfferCreatePrCta =
            action === "commit_push" &&
            !prUrl &&
            result.push.status === "pushed";
          return {
            title: "Done",
            description: describeGitResult(result),
            ...(prUrl
              ? {
                  timeout: 10_000,
                  actionProps: {
                    children: "Open PR",
                    onClick: () => void api?.shell.openExternal(prUrl),
                  },
                }
              : shouldOfferCreatePrCta
                ? {
                    timeout: 10_000,
                    actionProps: {
                      children: "Create PR",
                      onClick: () => setActiveDialogAction("create_pr"),
                    },
                  }
                : {}),
          };
        },
        error: (err) => ({
          title: "Action failed",
          description: err instanceof Error ? err.message : "An error occurred.",
        }),
      });
      void promise.catch(() => undefined);
    },
    [
      api,
      gitStatus?.openPr?.url,
      maybeConfirmPushToDefaultBranch,
      runImmediateGitActionMutation,
      setActiveDialogAction,
    ],
  );

  const runQuickAction = useCallback(() => {
    if (quickAction.kind === "open_pr") {
      void openExistingPr();
      return;
    }
    if (quickAction.kind === "run_pull") {
      const promise = pullMutation.mutateAsync();
      toastManager.promise(promise, {
        loading: { title: "Pulling..." },
        success: (result) => ({
          title: result.status === "pulled" ? "Pulled" : "Already up to date",
          description:
            result.status === "pulled"
              ? `Updated ${result.branch} from ${result.upstreamBranch ?? "upstream"}`
              : `${result.branch} is already synchronized.`,
        }),
        error: (err) => ({
          title: "Pull failed",
          description: err instanceof Error ? err.message : "An error occurred.",
        }),
      });
      void promise.catch(() => undefined);
      return;
    }
    if (quickAction.kind === "show_hint") {
      toastManager.add({
        type: "info",
        title: quickAction.label,
        description: quickAction.hint,
      });
      return;
    }
    if (quickAction.action) {
      void runGitActionWithToast({ action: quickAction.action });
    }
  }, [openExistingPr, pullMutation, quickAction, runGitActionWithToast]);

  const openDialogForMenuItem = useCallback(
    (item: GitActionMenuItem) => {
      if (item.disabled) return;
      if (item.kind === "open_pr") {
        void openExistingPr();
        return;
      }
      if (item.dialogAction) {
        setActiveDialogAction(item.dialogAction);
      }
    },
    [openExistingPr],
  );

  const runDialogAction = useCallback(() => {
    if (!activeDialogAction) return;
    const action: GitStackedAction =
      activeDialogAction === "commit"
        ? "commit"
        : activeDialogAction === "push"
          ? "commit_push"
          : "commit_push_pr";
    const commitMessage =
      activeDialogAction === "commit" ? dialogCommitMessage.trim() : "";
    setActiveDialogAction(null);
    void runGitActionWithToast({
      action,
      ...(commitMessage ? { commitMessage } : {}),
    });
  }, [activeDialogAction, dialogCommitMessage, runGitActionWithToast]);

  const dialogTitle =
    activeDialogAction === "commit"
      ? "Commit changes"
      : activeDialogAction === "push"
        ? "Push branch"
        : "Create pull request";
  const dialogDescription =
    activeDialogAction === "commit"
      ? "Review and confirm your commit. Leave the message blank to auto-generate one."
      : activeDialogAction === "push"
        ? "Push this branch now. If this is the default branch, you'll be asked to confirm."
        : "Create a pull request using generated title/body content.";

  if (!gitCwd) return null;

  return (
    <>
      <Group aria-label="Git actions">
        <Button
          variant="outline"
          size="xs"
          disabled={isGitActionRunning || quickAction.disabled}
          onClick={runQuickAction}
        >
          <GitQuickActionIcon quickAction={quickAction} />
          {quickAction.label}
        </Button>
        <GroupSeparator />
        <Menu
          onOpenChange={(open) => {
            if (open) void refreshGitStatus();
          }}
        >
          <MenuTrigger
            render={<Button aria-label="Git action options" size="icon-xs" variant="outline" />}
            disabled={isGitActionRunning}
          >
            <ChevronDownIcon aria-hidden="true" className="size-4" />
          </MenuTrigger>
          <MenuPopup align="end" sideOffset={4}>
            {gitActionMenuItems.map((item) => (
              <MenuItem
                key={`${item.id}-${item.label}`}
                disabled={item.disabled}
                onClick={() => {
                  openDialogForMenuItem(item);
                }}
              >
                <GitActionItemIcon icon={item.icon} />
                {item.label}
              </MenuItem>
            ))}
            {gitStatus?.branch === null && (
              <p className="px-2 py-1.5 text-xs text-warning">
                Detached HEAD: create and checkout a branch to enable push and PR actions.
              </p>
            )}
            {gitStatus &&
              gitStatus.branch !== null &&
              !gitStatus.hasWorkingTreeChanges &&
              gitStatus.behindCount > 0 && (
                <p className="px-2 py-1.5 text-xs text-warning">
                  Behind upstream. Pull/rebase first.
                </p>
              )}
            {gitStatusError && (
              <p className="px-2 py-1.5 text-xs text-destructive">{gitStatusError.message}</p>
            )}
          </MenuPopup>
        </Menu>
      </Group>

      <Dialog
        open={activeDialogAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialogAction(null);
            setDialogCommitMessage("");
          }
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <div className="rounded-lg border border-input bg-muted/40 p-3 text-xs">
              <p>
                <span className="font-medium">Branch:</span>{" "}
                {gitStatus?.branch ?? "(detached HEAD)"}
              </p>
              <p>
                <span className="font-medium">Working tree:</span>{" "}
                {gitStatus?.hasWorkingTreeChanges ? "Has changes" : "Clean"}
              </p>
              <p>
                <span className="font-medium">Ahead/behind:</span>{" "}
                {gitStatus ? `${gitStatus.aheadCount}/${gitStatus.behindCount}` : "unknown"}
              </p>
            </div>
            {activeDialogAction === "commit" && (
              <div className="space-y-1">
                <p className="text-xs font-medium">Commit message (optional)</p>
                <Textarea
                  value={dialogCommitMessage}
                  onChange={(event) => setDialogCommitMessage(event.target.value)}
                  placeholder="Leave empty to auto-generate"
                  size="sm"
                />
              </div>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveDialogAction(null);
                setDialogCommitMessage("");
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={runDialogAction}>
              {activeDialogAction === "commit"
                ? "Commit"
                : activeDialogAction === "push"
                  ? "Push"
                  : "Create PR"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
