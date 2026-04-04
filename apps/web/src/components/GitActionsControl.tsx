import type { GitStackedAction, GitStatusResult, ThreadId } from "@t3tools/contracts";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, CloudUploadIcon, GitCommitIcon, InfoIcon } from "lucide-react";
import { type AppLanguage } from "../appLanguage";
import { useAppSettings } from "../appSettings";
import { GitHubIcon } from "./Icons";
import {
  buildGitActionProgressStages,
  buildMenuItems,
  type GitActionIconName,
  type GitActionMenuItem,
  type GitQuickAction,
  type DefaultBranchConfirmableAction,
  requiresDefaultBranchConfirmation,
  resolveDefaultBranchActionDialogCopy,
  resolveQuickAction,
  summarizeGitResult,
} from "./GitActionsControl.logic";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Textarea } from "~/components/ui/textarea";
import { toastManager } from "~/components/ui/toast";
import { openInPreferredEditor } from "~/editorPreferences";
import {
  gitBranchesQueryOptions,
  gitInitMutationOptions,
  gitMutationKeys,
  gitPullMutationOptions,
  gitRunStackedActionMutationOptions,
  gitStatusQueryOptions,
  invalidateGitQueries,
} from "~/lib/gitReactQuery";
import { resolvePathLinkTarget } from "~/terminal-links";
import { readNativeApi } from "~/nativeApi";

interface GitActionsControlProps {
  gitCwd: string | null;
  activeThreadId: ThreadId | null;
}

interface PendingDefaultBranchAction {
  action: DefaultBranchConfirmableAction;
  branchName: string;
  includesCommit: boolean;
  commitMessage?: string;
  forcePushOnlyProgress: boolean;
  onConfirmed?: () => void;
  filePaths?: string[];
}

type GitActionToastId = ReturnType<typeof toastManager.add>;
const PREFERRED_REMOTE_NAME = "Rowl";

function getGitActionsUiCopy(language: AppLanguage) {
  if (language === "fa") {
    return {
      genericError: "خطایی رخ داد.",
      gitActionInProgress: "عملیات git در حال انجام است.",
      gitStatusUnavailable: "وضعیت git در دسترس نیست.",
      worktreeCleanBeforeCommit: "worktree پاک است. قبل از commit تغییر ایجاد کنید.",
      commitUnavailable: "در حال حاضر Commit در دسترس نیست.",
      detachedHeadBeforePush: "Detached HEAD: قبل از push یک شاخه را checkout کنید.",
      commitOrStashBeforePush: "پیش از push، تغییرات محلی را commit یا stash کنید.",
      behindUpstreamBeforePush: "شاخه از upstream عقب است. پیش از push pull/rebase کنید.",
      addPreferredRemoteBeforePush: (remote: string) =>
        `پیش از push یک remote با نام "${remote}" اضافه کنید.`,
      noLocalCommitsToPush: "هیچ commit محلی برای push وجود ندارد.",
      pushUnavailable: "در حال حاضر Push در دسترس نیست.",
      viewPrUnavailable: "در حال حاضر مشاهده PR در دسترس نیست.",
      detachedHeadBeforeCreatePr: "Detached HEAD: قبل از ساخت PR یک شاخه را checkout کنید.",
      commitBeforeCreatePr: "پیش از ساخت PR تغییرات محلی را commit کنید.",
      addPreferredRemoteBeforeCreatePr: (remote: string) =>
        `پیش از ساخت PR یک remote با نام "${remote}" اضافه کنید.`,
      noLocalCommitsForPr: "هیچ commit محلی برای قرار دادن در PR وجود ندارد.",
      behindUpstreamBeforeCreatePr: "شاخه از upstream عقب است. پیش از ساخت PR pull/rebase کنید.",
      createPrUnavailable: "در حال حاضر ساخت PR در دسترس نیست.",
      commitDialogTitle: "Commit تغییرات",
      commitDialogDescription:
        "commit خود را بررسی و تایید کنید. اگر پیام را خالی بگذارید به صورت خودکار ساخته می شود.",
      linkOpeningUnavailable: "باز کردن پیوند در دسترس نیست.",
      noOpenPrFound: "هیچ PR بازی پیدا نشد.",
      unableToOpenPrLink: "باز کردن پیوند PR ممکن نشد",
      runningGitAction: "در حال اجرای عملیات git...",
      actionFailed: "عملیات انجام نشد",
      pushAction: "Push",
      viewPrAction: "مشاهده PR",
      createPrAction: "ساخت PR",
      pulling: "در حال pull...",
      pulled: "pull انجام شد",
      alreadyUpToDate: "از قبل به روز است",
      updatedFrom: (branch: string, upstream: string) => `${branch} از ${upstream} به روز شد`,
      alreadySynchronized: (branch: string) => `${branch} از قبل همگام است.`,
      pullFailed: "pull انجام نشد",
      editorOpeningUnavailable: "باز کردن ویرایشگر در دسترس نیست.",
      unableToOpenFile: "باز کردن فایل ممکن نشد",
      initializing: "در حال مقداردهی اولیه...",
      initializeGit: "مقداردهی اولیه Git",
      gitActions: "اقدام های Git",
      gitActionOptions: "گزینه های اقدام های Git",
      detachedHeadWarningMenu:
        "Detached HEAD: برای فعال شدن push و PR یک شاخه بسازید و checkout کنید.",
      behindUpstreamWarningMenu: "از upstream عقب هستید. اول pull/rebase کنید.",
      refreshingGitStatus: "در حال تازه سازی وضعیت git...",
      branch: "شاخه",
      detachedHead: "(detached HEAD)",
      warningDefaultBranch: "هشدار: شاخه پیش فرض",
      files: "فایل ها",
      done: "تمام",
      edit: "ویرایش",
      none: "هیچ کدام",
      excluded: "حذف شده",
      commitMessageOptional: "پیام commit (اختیاری)",
      leaveEmptyToAutoGenerate: "خالی بگذارید تا خودکار ساخته شود",
      cancel: "لغو",
      commitOnNewBranch: "Commit روی شاخه جدید",
      commit: "Commit",
      runActionOnDefaultBranch: "اقدام روی شاخه پیش فرض انجام شود؟",
      abort: "لغو",
      continue: "ادامه",
      checkoutFeatureBranchAndContinue: "checkout شاخه ویژگی و ادامه",
    };
  }

  return {
    genericError: "An error occurred.",
    gitActionInProgress: "Git action in progress.",
    gitStatusUnavailable: "Git status is unavailable.",
    worktreeCleanBeforeCommit: "Worktree is clean. Make changes before committing.",
    commitUnavailable: "Commit is currently unavailable.",
    detachedHeadBeforePush: "Detached HEAD: checkout a branch before pushing.",
    commitOrStashBeforePush: "Commit or stash local changes before pushing.",
    behindUpstreamBeforePush: "Branch is behind upstream. Pull/rebase before pushing.",
    addPreferredRemoteBeforePush: (remote: string) => `Add a "${remote}" remote before pushing.`,
    noLocalCommitsToPush: "No local commits to push.",
    pushUnavailable: "Push is currently unavailable.",
    viewPrUnavailable: "View PR is currently unavailable.",
    detachedHeadBeforeCreatePr: "Detached HEAD: checkout a branch before creating a PR.",
    commitBeforeCreatePr: "Commit local changes before creating a PR.",
    addPreferredRemoteBeforeCreatePr: (remote: string) =>
      `Add a "${remote}" remote before creating a PR.`,
    noLocalCommitsForPr: "No local commits to include in a PR.",
    behindUpstreamBeforeCreatePr: "Branch is behind upstream. Pull/rebase before creating a PR.",
    createPrUnavailable: "Create PR is currently unavailable.",
    commitDialogTitle: "Commit changes",
    commitDialogDescription:
      "Review and confirm your commit. Leave the message blank to auto-generate one.",
    linkOpeningUnavailable: "Link opening is unavailable.",
    noOpenPrFound: "No open PR found.",
    unableToOpenPrLink: "Unable to open PR link",
    runningGitAction: "Running git action...",
    actionFailed: "Action failed",
    pushAction: "Push",
    viewPrAction: "View PR",
    createPrAction: "Create PR",
    pulling: "Pulling...",
    pulled: "Pulled",
    alreadyUpToDate: "Already up to date",
    updatedFrom: (branch: string, upstream: string) => `Updated ${branch} from ${upstream}`,
    alreadySynchronized: (branch: string) => `${branch} is already synchronized.`,
    pullFailed: "Pull failed",
    editorOpeningUnavailable: "Editor opening is unavailable.",
    unableToOpenFile: "Unable to open file",
    initializing: "Initializing...",
    initializeGit: "Initialize Git",
    gitActions: "Git actions",
    gitActionOptions: "Git action options",
    detachedHeadWarningMenu:
      "Detached HEAD: create and checkout a branch to enable push and PR actions.",
    behindUpstreamWarningMenu: "Behind upstream. Pull/rebase first.",
    refreshingGitStatus: "Refreshing git status...",
    branch: "Branch",
    detachedHead: "(detached HEAD)",
    warningDefaultBranch: "Warning: default branch",
    files: "Files",
    done: "Done",
    edit: "Edit",
    none: "none",
    excluded: "Excluded",
    commitMessageOptional: "Commit message (optional)",
    leaveEmptyToAutoGenerate: "Leave empty to auto-generate",
    cancel: "Cancel",
    commitOnNewBranch: "Commit on new branch",
    commit: "Commit",
    runActionOnDefaultBranch: "Run action on default branch?",
    abort: "Abort",
    continue: "Continue",
    checkoutFeatureBranchAndContinue: "Checkout feature branch & continue",
  };
}

function getMenuActionDisabledReason({
  item,
  gitStatus,
  isBusy,
  hasPreferredRemote,
  language,
}: {
  item: GitActionMenuItem;
  gitStatus: GitStatusResult | null;
  isBusy: boolean;
  hasPreferredRemote: boolean;
  language: AppLanguage;
}): string | null {
  const copy = getGitActionsUiCopy(language);
  if (!item.disabled) return null;
  if (isBusy) return copy.gitActionInProgress;
  if (!gitStatus) return copy.gitStatusUnavailable;

  const hasBranch = gitStatus.branch !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isAhead = gitStatus.aheadCount > 0;
  const isBehind = gitStatus.behindCount > 0;

  if (item.id === "commit") {
    if (!hasChanges) {
      return copy.worktreeCleanBeforeCommit;
    }
    return copy.commitUnavailable;
  }

  if (item.id === "push") {
    if (!hasBranch) {
      return copy.detachedHeadBeforePush;
    }
    if (hasChanges) {
      return copy.commitOrStashBeforePush;
    }
    if (isBehind) {
      return copy.behindUpstreamBeforePush;
    }
    if (!gitStatus.hasUpstream && !hasPreferredRemote) {
      return copy.addPreferredRemoteBeforePush(PREFERRED_REMOTE_NAME);
    }
    if (!isAhead) {
      return copy.noLocalCommitsToPush;
    }
    return copy.pushUnavailable;
  }

  if (hasOpenPr) {
    return copy.viewPrUnavailable;
  }
  if (!hasBranch) {
    return copy.detachedHeadBeforeCreatePr;
  }
  if (hasChanges) {
    return copy.commitBeforeCreatePr;
  }
  if (!gitStatus.hasUpstream && !hasPreferredRemote) {
    return copy.addPreferredRemoteBeforeCreatePr(PREFERRED_REMOTE_NAME);
  }
  if (!isAhead) {
    return copy.noLocalCommitsForPr;
  }
  if (isBehind) {
    return copy.behindUpstreamBeforeCreatePr;
  }
  return copy.createPrUnavailable;
}

function GitActionItemIcon({ icon }: { icon: GitActionIconName }) {
  if (icon === "commit") return <GitCommitIcon />;
  if (icon === "push") return <CloudUploadIcon />;
  return <GitHubIcon />;
}

function GitQuickActionIcon({ quickAction }: { quickAction: GitQuickAction }) {
  const iconClassName = "size-3.5";
  if (quickAction.kind === "open_pr") return <GitHubIcon className={iconClassName} />;
  if (quickAction.kind === "run_pull") return <InfoIcon className={iconClassName} />;
  if (quickAction.kind === "run_action") {
    if (quickAction.action === "commit") return <GitCommitIcon className={iconClassName} />;
    if (quickAction.action === "commit_push") return <CloudUploadIcon className={iconClassName} />;
    return <GitHubIcon className={iconClassName} />;
  }
  if (quickAction.label === "Commit") return <GitCommitIcon className={iconClassName} />;
  return <InfoIcon className={iconClassName} />;
}

export default function GitActionsControl({ gitCwd, activeThreadId }: GitActionsControlProps) {
  const {
    settings: { language },
  } = useAppSettings();
  const gitCopy = useMemo(() => getGitActionsUiCopy(language), [language]);
  const threadToastData = useMemo(
    () => (activeThreadId ? { threadId: activeThreadId } : undefined),
    [activeThreadId],
  );
  const queryClient = useQueryClient();
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const [dialogCommitMessage, setDialogCommitMessage] = useState("");
  const [excludedFiles, setExcludedFiles] = useState<ReadonlySet<string>>(new Set());
  const [isEditingFiles, setIsEditingFiles] = useState(false);
  const [pendingDefaultBranchAction, setPendingDefaultBranchAction] =
    useState<PendingDefaultBranchAction | null>(null);

  const { data: gitStatus = null, error: gitStatusError } = useQuery(gitStatusQueryOptions(gitCwd));

  const { data: branchList = null } = useQuery(gitBranchesQueryOptions(gitCwd));
  // Default to true while loading so we don't flash init controls.
  const isRepo = branchList?.isRepo ?? true;
  const hasPreferredRemote = branchList?.hasPreferredRemote ?? false;
  const currentBranch = branchList?.branches.find((branch) => branch.current)?.name ?? null;
  const isGitStatusOutOfSync =
    !!gitStatus?.branch && !!currentBranch && gitStatus.branch !== currentBranch;

  useEffect(() => {
    if (!isGitStatusOutOfSync) return;
    void invalidateGitQueries(queryClient);
  }, [isGitStatusOutOfSync, queryClient]);

  const gitStatusForActions = isGitStatusOutOfSync ? null : gitStatus;

  const allFiles = gitStatusForActions?.workingTree.files ?? [];
  const selectedFiles = allFiles.filter((f) => !excludedFiles.has(f.path));
  const allSelected = excludedFiles.size === 0;
  const noneSelected = selectedFiles.length === 0;

  const initMutation = useMutation(gitInitMutationOptions({ cwd: gitCwd, queryClient }));

  const runImmediateGitActionMutation = useMutation(
    gitRunStackedActionMutationOptions({ cwd: gitCwd, queryClient }),
  );
  const pullMutation = useMutation(gitPullMutationOptions({ cwd: gitCwd, queryClient }));

  const isRunStackedActionRunning =
    useIsMutating({ mutationKey: gitMutationKeys.runStackedAction(gitCwd) }) > 0;
  const isPullRunning = useIsMutating({ mutationKey: gitMutationKeys.pull(gitCwd) }) > 0;
  const isGitActionRunning = isRunStackedActionRunning || isPullRunning;
  const isDefaultBranch = useMemo(() => {
    const branchName = gitStatusForActions?.branch;
    if (!branchName) return false;
    const current = branchList?.branches.find((branch) => branch.name === branchName);
    return current?.isDefault ?? (branchName === "main" || branchName === "master");
  }, [branchList?.branches, gitStatusForActions?.branch]);

  const gitActionMenuItems = useMemo(
    () => buildMenuItems(gitStatusForActions, isGitActionRunning, hasPreferredRemote, language),
    [gitStatusForActions, hasPreferredRemote, isGitActionRunning, language],
  );
  const quickAction = useMemo(
    () =>
      resolveQuickAction(
        gitStatusForActions,
        isGitActionRunning,
        isDefaultBranch,
        hasPreferredRemote,
        language,
      ),
    [gitStatusForActions, hasPreferredRemote, isDefaultBranch, isGitActionRunning, language],
  );
  const quickActionDisabledReason = quickAction.disabled
    ? (quickAction.hint ?? gitCopy.gitStatusUnavailable)
    : null;
  const pendingDefaultBranchActionCopy = pendingDefaultBranchAction
    ? resolveDefaultBranchActionDialogCopy(
        {
          action: pendingDefaultBranchAction.action,
          branchName: pendingDefaultBranchAction.branchName,
          includesCommit: pendingDefaultBranchAction.includesCommit,
        },
        language,
      )
    : null;

  const openExistingPr = useCallback(async () => {
    const api = readNativeApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: gitCopy.linkOpeningUnavailable,
        data: threadToastData,
      });
      return;
    }
    const prUrl = gitStatusForActions?.pr?.state === "open" ? gitStatusForActions.pr.url : null;
    if (!prUrl) {
      toastManager.add({
        type: "error",
        title: gitCopy.noOpenPrFound,
        data: threadToastData,
      });
      return;
    }
    void api.shell.openExternal(prUrl).catch((err) => {
      toastManager.add({
        type: "error",
        title: gitCopy.unableToOpenPrLink,
        description: err instanceof Error ? err.message : gitCopy.genericError,
        data: threadToastData,
      });
    });
  }, [
    gitCopy.genericError,
    gitCopy.linkOpeningUnavailable,
    gitCopy.noOpenPrFound,
    gitCopy.unableToOpenPrLink,
    gitStatusForActions?.pr?.state,
    gitStatusForActions?.pr?.url,
    threadToastData,
  ]);

  const runGitActionWithToast = useCallback(
    async ({
      action,
      commitMessage,
      forcePushOnlyProgress = false,
      onConfirmed,
      skipDefaultBranchPrompt = false,
      statusOverride,
      featureBranch = false,
      isDefaultBranchOverride,
      progressToastId,
      filePaths,
    }: {
      action: GitStackedAction;
      commitMessage?: string;
      forcePushOnlyProgress?: boolean;
      onConfirmed?: () => void;
      skipDefaultBranchPrompt?: boolean;
      statusOverride?: GitStatusResult | null;
      featureBranch?: boolean;
      isDefaultBranchOverride?: boolean;
      progressToastId?: GitActionToastId;
      filePaths?: string[];
    }) => {
      const actionStatus = statusOverride ?? gitStatusForActions;
      const actionBranch = actionStatus?.branch ?? null;
      const actionIsDefaultBranch =
        isDefaultBranchOverride ?? (featureBranch ? false : isDefaultBranch);
      const includesCommit =
        !forcePushOnlyProgress && (action === "commit" || !!actionStatus?.hasWorkingTreeChanges);
      if (
        !skipDefaultBranchPrompt &&
        requiresDefaultBranchConfirmation(action, actionIsDefaultBranch) &&
        actionBranch
      ) {
        if (action !== "commit_push" && action !== "commit_push_pr") {
          return;
        }
        setPendingDefaultBranchAction({
          action,
          branchName: actionBranch,
          includesCommit,
          ...(commitMessage ? { commitMessage } : {}),
          forcePushOnlyProgress,
          ...(onConfirmed ? { onConfirmed } : {}),
          ...(filePaths ? { filePaths } : {}),
        });
        return;
      }
      onConfirmed?.();

      const progressStages = buildGitActionProgressStages(
        {
          action,
          hasCustomCommitMessage: !!commitMessage?.trim(),
          hasWorkingTreeChanges: !!actionStatus?.hasWorkingTreeChanges,
          forcePushOnly: forcePushOnlyProgress,
          featureBranch,
        },
        language,
      );
      const resolvedProgressToastId =
        progressToastId ??
        toastManager.add({
          type: "loading",
          title: progressStages[0] ?? gitCopy.runningGitAction,
          timeout: 0,
          data: threadToastData,
        });

      if (progressToastId) {
        toastManager.update(progressToastId, {
          type: "loading",
          title: progressStages[0] ?? gitCopy.runningGitAction,
          timeout: 0,
          data: threadToastData,
        });
      }

      let stageIndex = 0;
      const stageInterval = setInterval(() => {
        stageIndex = Math.min(stageIndex + 1, progressStages.length - 1);
        toastManager.update(resolvedProgressToastId, {
          title: progressStages[stageIndex] ?? gitCopy.runningGitAction,
          type: "loading",
          timeout: 0,
          data: threadToastData,
        });
      }, 1100);

      const stopProgressUpdates = () => {
        clearInterval(stageInterval);
      };

      const promise = runImmediateGitActionMutation.mutateAsync({
        action,
        ...(commitMessage ? { commitMessage } : {}),
        ...(featureBranch ? { featureBranch } : {}),
        ...(filePaths ? { filePaths } : {}),
      });

      try {
        const result = await promise;
        stopProgressUpdates();
        const resultToast = summarizeGitResult(result, language);

        const existingOpenPrUrl =
          actionStatus?.pr?.state === "open" ? actionStatus.pr.url : undefined;
        const prUrl = result.pr.url ?? existingOpenPrUrl;
        const shouldOfferOpenPrCta =
          (action === "commit_push" || action === "commit_push_pr") &&
          !!prUrl &&
          (!actionIsDefaultBranch ||
            result.pr.status === "created" ||
            result.pr.status === "opened_existing");
        const shouldOfferCreatePrCta =
          action === "commit_push" &&
          !prUrl &&
          result.push.status === "pushed" &&
          !actionIsDefaultBranch;
        const closeResultToast = () => {
          toastManager.close(resolvedProgressToastId);
        };

        toastManager.update(resolvedProgressToastId, {
          type: "success",
          title: resultToast.title,
          description: resultToast.description,
          timeout: 0,
          data: {
            ...threadToastData,
            dismissAfterVisibleMs: 10_000,
          },
          ...(shouldOfferOpenPrCta
            ? {
                actionProps: {
                  children: gitCopy.viewPrAction,
                  onClick: () => {
                    const api = readNativeApi();
                    if (!api) return;
                    closeResultToast();
                    void api.shell.openExternal(prUrl);
                  },
                },
              }
            : shouldOfferCreatePrCta
              ? {
                  actionProps: {
                    children: gitCopy.createPrAction,
                    onClick: () => {
                      closeResultToast();
                      void runGitActionWithToast({
                        action: "commit_push_pr",
                        forcePushOnlyProgress: true,
                        statusOverride: actionStatus,
                        isDefaultBranchOverride: actionIsDefaultBranch,
                      });
                    },
                  },
                }
              : {}),
        });
      } catch (err) {
        stopProgressUpdates();
        toastManager.update(resolvedProgressToastId, {
          type: "error",
          title: gitCopy.actionFailed,
          description: err instanceof Error ? err.message : gitCopy.genericError,
          data: threadToastData,
        });
      }
    },

    [
      isDefaultBranch,
      runImmediateGitActionMutation,
      setPendingDefaultBranchAction,
      threadToastData,
      gitStatusForActions,
      gitCopy,
      language,
    ],
  );

  const continuePendingDefaultBranchAction = useCallback(() => {
    if (!pendingDefaultBranchAction) return;
    const { action, commitMessage, forcePushOnlyProgress, onConfirmed, filePaths } =
      pendingDefaultBranchAction;
    setPendingDefaultBranchAction(null);
    void runGitActionWithToast({
      action,
      ...(commitMessage ? { commitMessage } : {}),
      forcePushOnlyProgress,
      ...(onConfirmed ? { onConfirmed } : {}),
      ...(filePaths ? { filePaths } : {}),
      skipDefaultBranchPrompt: true,
    });
  }, [pendingDefaultBranchAction, runGitActionWithToast]);

  const checkoutNewBranchAndRunAction = useCallback(
    (actionParams: {
      action: GitStackedAction;
      commitMessage?: string;
      forcePushOnlyProgress?: boolean;
      onConfirmed?: () => void;
      filePaths?: string[];
    }) => {
      void runGitActionWithToast({
        ...actionParams,
        featureBranch: true,
        skipDefaultBranchPrompt: true,
      });
    },
    [runGitActionWithToast],
  );

  const checkoutFeatureBranchAndContinuePendingAction = useCallback(() => {
    if (!pendingDefaultBranchAction) return;
    const { action, commitMessage, forcePushOnlyProgress, onConfirmed, filePaths } =
      pendingDefaultBranchAction;
    setPendingDefaultBranchAction(null);
    checkoutNewBranchAndRunAction({
      action,
      ...(commitMessage ? { commitMessage } : {}),
      forcePushOnlyProgress,
      ...(onConfirmed ? { onConfirmed } : {}),
      ...(filePaths ? { filePaths } : {}),
    });
  }, [pendingDefaultBranchAction, checkoutNewBranchAndRunAction]);

  const runDialogActionOnNewBranch = useCallback(() => {
    if (!isCommitDialogOpen) return;
    const commitMessage = dialogCommitMessage.trim();

    setIsCommitDialogOpen(false);
    setDialogCommitMessage("");
    setExcludedFiles(new Set());
    setIsEditingFiles(false);

    checkoutNewBranchAndRunAction({
      action: "commit",
      ...(commitMessage ? { commitMessage } : {}),
      ...(!allSelected ? { filePaths: selectedFiles.map((f) => f.path) } : {}),
    });
  }, [
    allSelected,
    isCommitDialogOpen,
    dialogCommitMessage,
    checkoutNewBranchAndRunAction,
    selectedFiles,
  ]);

  const runQuickAction = useCallback(() => {
    if (quickAction.kind === "open_pr") {
      void openExistingPr();
      return;
    }
    if (quickAction.kind === "run_pull") {
      const promise = pullMutation.mutateAsync();
      toastManager.promise(promise, {
        loading: { title: gitCopy.pulling, data: threadToastData },
        success: (result) => ({
          title: result.status === "pulled" ? gitCopy.pulled : gitCopy.alreadyUpToDate,
          description:
            result.status === "pulled"
              ? gitCopy.updatedFrom(result.branch, result.upstreamBranch ?? "upstream")
              : gitCopy.alreadySynchronized(result.branch),
          data: threadToastData,
        }),
        error: (err) => ({
          title: gitCopy.pullFailed,
          description: err instanceof Error ? err.message : gitCopy.genericError,
          data: threadToastData,
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
        data: threadToastData,
      });
      return;
    }
    if (quickAction.action) {
      void runGitActionWithToast({ action: quickAction.action });
    }
  }, [gitCopy, openExistingPr, pullMutation, quickAction, runGitActionWithToast, threadToastData]);

  const openDialogForMenuItem = useCallback(
    (item: GitActionMenuItem) => {
      if (item.disabled) return;
      if (item.kind === "open_pr") {
        void openExistingPr();
        return;
      }
      if (item.dialogAction === "push") {
        void runGitActionWithToast({ action: "commit_push", forcePushOnlyProgress: true });
        return;
      }
      if (item.dialogAction === "create_pr") {
        void runGitActionWithToast({ action: "commit_push_pr" });
        return;
      }
      setExcludedFiles(new Set());
      setIsEditingFiles(false);
      setIsCommitDialogOpen(true);
    },
    [openExistingPr, runGitActionWithToast, setIsCommitDialogOpen],
  );

  const runDialogAction = useCallback(() => {
    if (!isCommitDialogOpen) return;
    const commitMessage = dialogCommitMessage.trim();
    setIsCommitDialogOpen(false);
    setDialogCommitMessage("");
    setExcludedFiles(new Set());
    setIsEditingFiles(false);
    void runGitActionWithToast({
      action: "commit",
      ...(commitMessage ? { commitMessage } : {}),
      ...(!allSelected ? { filePaths: selectedFiles.map((f) => f.path) } : {}),
    });
  }, [
    allSelected,
    dialogCommitMessage,
    isCommitDialogOpen,
    runGitActionWithToast,
    selectedFiles,
    setDialogCommitMessage,
    setIsCommitDialogOpen,
  ]);

  const openChangedFileInEditor = useCallback(
    (filePath: string) => {
      const api = readNativeApi();
      if (!api || !gitCwd) {
        toastManager.add({
          type: "error",
          title: gitCopy.editorOpeningUnavailable,
          data: threadToastData,
        });
        return;
      }
      const target = resolvePathLinkTarget(filePath, gitCwd);
      void openInPreferredEditor(api, target).catch((error) => {
        toastManager.add({
          type: "error",
          title: gitCopy.unableToOpenFile,
          description: error instanceof Error ? error.message : gitCopy.genericError,
          data: threadToastData,
        });
      });
    },
    [
      gitCopy.editorOpeningUnavailable,
      gitCopy.genericError,
      gitCopy.unableToOpenFile,
      gitCwd,
      threadToastData,
    ],
  );

  if (!gitCwd) return null;

  return (
    <>
      {!isRepo ? (
        <Button
          variant="outline"
          size="xs"
          disabled={initMutation.isPending}
          onClick={() => initMutation.mutate()}
        >
          {initMutation.isPending ? gitCopy.initializing : gitCopy.initializeGit}
        </Button>
      ) : (
        <Group aria-label={gitCopy.gitActions}>
          {quickActionDisabledReason ? (
            <Popover>
              <PopoverTrigger
                openOnHover
                render={
                  <Button
                    aria-disabled="true"
                    className="cursor-not-allowed rounded-e-none border-e-0 opacity-64 before:rounded-e-none"
                    size="xs"
                    variant="outline"
                  />
                }
              >
                <GitQuickActionIcon quickAction={quickAction} />
                <span className="sr-only @sm/header-actions:not-sr-only @sm/header-actions:ml-0.5">
                  {quickAction.label}
                </span>
              </PopoverTrigger>
              <PopoverPopup tooltipStyle side="bottom" align="start">
                {quickActionDisabledReason}
              </PopoverPopup>
            </Popover>
          ) : (
            <Button
              variant="outline"
              size="xs"
              disabled={isGitActionRunning || quickAction.disabled}
              onClick={runQuickAction}
            >
              <GitQuickActionIcon quickAction={quickAction} />
              <span className="sr-only @sm/header-actions:not-sr-only @sm/header-actions:ml-0.5">
                {quickAction.label}
              </span>
            </Button>
          )}
          <GroupSeparator className="hidden @sm/header-actions:block" />
          <Menu
            onOpenChange={(open) => {
              if (open) void invalidateGitQueries(queryClient);
            }}
          >
            <MenuTrigger
              render={
                <Button aria-label={gitCopy.gitActionOptions} size="icon-xs" variant="outline" />
              }
              disabled={isGitActionRunning}
            >
              <ChevronDownIcon aria-hidden="true" className="size-4" />
            </MenuTrigger>
            <MenuPopup align="end" className="w-full">
              {gitActionMenuItems.map((item) => {
                const disabledReason = getMenuActionDisabledReason({
                  item,
                  gitStatus: gitStatusForActions,
                  isBusy: isGitActionRunning,
                  hasPreferredRemote,
                  language,
                });
                if (item.disabled && disabledReason) {
                  return (
                    <Popover key={`${item.id}-${item.label}`}>
                      <PopoverTrigger
                        openOnHover
                        nativeButton={false}
                        render={<span className="block w-max cursor-not-allowed" />}
                      >
                        <MenuItem className="w-full" disabled>
                          <GitActionItemIcon icon={item.icon} />
                          {item.label}
                        </MenuItem>
                      </PopoverTrigger>
                      <PopoverPopup tooltipStyle side="left" align="center">
                        {disabledReason}
                      </PopoverPopup>
                    </Popover>
                  );
                }

                return (
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
                );
              })}
              {gitStatusForActions?.branch === null && (
                <p className="px-2 py-1.5 text-xs text-warning">
                  {gitCopy.detachedHeadWarningMenu}
                </p>
              )}
              {gitStatusForActions &&
                gitStatusForActions.branch !== null &&
                !gitStatusForActions.hasWorkingTreeChanges &&
                gitStatusForActions.behindCount > 0 &&
                gitStatusForActions.aheadCount === 0 && (
                  <p className="px-2 py-1.5 text-xs text-warning">
                    {gitCopy.behindUpstreamWarningMenu}
                  </p>
                )}
              {isGitStatusOutOfSync && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {gitCopy.refreshingGitStatus}
                </p>
              )}
              {gitStatusError && (
                <p className="px-2 py-1.5 text-xs text-destructive">{gitStatusError.message}</p>
              )}
            </MenuPopup>
          </Menu>
        </Group>
      )}

      <Dialog
        open={isCommitDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCommitDialogOpen(false);
            setDialogCommitMessage("");
            setExcludedFiles(new Set());
            setIsEditingFiles(false);
          }
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{gitCopy.commitDialogTitle}</DialogTitle>
            <DialogDescription>{gitCopy.commitDialogDescription}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <div className="space-y-3 rounded-lg border border-input bg-muted/40 p-3 text-xs">
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
                <span className="text-muted-foreground">{gitCopy.branch}</span>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {gitStatusForActions?.branch ?? gitCopy.detachedHead}
                  </span>
                  {isDefaultBranch && (
                    <span className="text-right text-warning text-xs">
                      {gitCopy.warningDefaultBranch}
                    </span>
                  )}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isEditingFiles && allFiles.length > 0 && (
                      <Checkbox
                        checked={allSelected}
                        indeterminate={!allSelected && !noneSelected}
                        onCheckedChange={() => {
                          setExcludedFiles(
                            allSelected ? new Set(allFiles.map((f) => f.path)) : new Set(),
                          );
                        }}
                      />
                    )}
                    <span className="text-muted-foreground">{gitCopy.files}</span>
                    {!allSelected && !isEditingFiles && (
                      <span className="text-muted-foreground">
                        ({selectedFiles.length} of {allFiles.length})
                      </span>
                    )}
                  </div>
                  {allFiles.length > 0 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setIsEditingFiles((prev) => !prev)}
                    >
                      {isEditingFiles ? gitCopy.done : gitCopy.edit}
                    </Button>
                  )}
                </div>
                {!gitStatusForActions || allFiles.length === 0 ? (
                  <p className="font-medium">{gitCopy.none}</p>
                ) : (
                  <div className="space-y-2">
                    <ScrollArea className="h-44 rounded-md border border-input bg-background">
                      <div className="space-y-1 p-1">
                        {allFiles.map((file) => {
                          const isExcluded = excludedFiles.has(file.path);
                          return (
                            <div
                              key={file.path}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1 font-mono text-xs transition-colors hover:bg-accent/50"
                            >
                              {isEditingFiles && (
                                <Checkbox
                                  checked={!excludedFiles.has(file.path)}
                                  onCheckedChange={() => {
                                    setExcludedFiles((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(file.path)) {
                                        next.delete(file.path);
                                      } else {
                                        next.add(file.path);
                                      }
                                      return next;
                                    });
                                  }}
                                />
                              )}
                              <button
                                type="button"
                                className="flex flex-1 items-center justify-between gap-3 text-left truncate"
                                onClick={() => openChangedFileInEditor(file.path)}
                              >
                                <span
                                  className={`truncate${isExcluded ? " text-muted-foreground" : ""}`}
                                >
                                  {file.path}
                                </span>
                                <span className="shrink-0">
                                  {isExcluded ? (
                                    <span className="text-muted-foreground">
                                      {gitCopy.excluded}
                                    </span>
                                  ) : (
                                    <>
                                      <span className="text-success">+{file.insertions}</span>
                                      <span className="text-muted-foreground"> / </span>
                                      <span className="text-destructive">-{file.deletions}</span>
                                    </>
                                  )}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                    <div className="flex justify-end font-mono">
                      <span className="text-success">
                        +{selectedFiles.reduce((sum, f) => sum + f.insertions, 0)}
                      </span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-destructive">
                        -{selectedFiles.reduce((sum, f) => sum + f.deletions, 0)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">{gitCopy.commitMessageOptional}</p>
              <Textarea
                value={dialogCommitMessage}
                onChange={(event) => setDialogCommitMessage(event.target.value)}
                placeholder={gitCopy.leaveEmptyToAutoGenerate}
                size="sm"
              />
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsCommitDialogOpen(false);
                setDialogCommitMessage("");
                setExcludedFiles(new Set());
                setIsEditingFiles(false);
              }}
            >
              {gitCopy.cancel}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={noneSelected}
              onClick={runDialogActionOnNewBranch}
            >
              {gitCopy.commitOnNewBranch}
            </Button>
            <Button size="sm" disabled={noneSelected} onClick={runDialogAction}>
              {gitCopy.commit}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={pendingDefaultBranchAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDefaultBranchAction(null);
          }
        }}
      >
        <DialogPopup className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {pendingDefaultBranchActionCopy?.title ?? gitCopy.runActionOnDefaultBranch}
            </DialogTitle>
            <DialogDescription>{pendingDefaultBranchActionCopy?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPendingDefaultBranchAction(null)}>
              {gitCopy.abort}
            </Button>
            <Button variant="outline" size="sm" onClick={continuePendingDefaultBranchAction}>
              {pendingDefaultBranchActionCopy?.continueLabel ?? gitCopy.continue}
            </Button>
            <Button size="sm" onClick={checkoutFeatureBranchAndContinuePendingAction}>
              {gitCopy.checkoutFeatureBranchAndContinue}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
