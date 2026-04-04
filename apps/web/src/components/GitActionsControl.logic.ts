import type {
  GitRunStackedActionResult,
  GitStackedAction,
  GitStatusResult,
} from "@t3tools/contracts";
import { type AppLanguage } from "../appLanguage";

export type GitActionIconName = "commit" | "push" | "pr";

export type GitDialogAction = "commit" | "push" | "create_pr";

export interface GitActionMenuItem {
  id: "commit" | "push" | "pr";
  label: string;
  disabled: boolean;
  icon: GitActionIconName;
  kind: "open_dialog" | "open_pr";
  dialogAction?: GitDialogAction;
}

export interface GitQuickAction {
  label: string;
  disabled: boolean;
  kind: "run_action" | "run_pull" | "open_pr" | "show_hint";
  action?: GitStackedAction;
  hint?: string;
}

export interface DefaultBranchActionDialogCopy {
  title: string;
  description: string;
  continueLabel: string;
}

export type DefaultBranchConfirmableAction = "commit_push" | "commit_push_pr";

const SHORT_SHA_LENGTH = 7;
const TOAST_DESCRIPTION_MAX = 72;
const PREFERRED_REMOTE_NAME = "Rowl";

function getGitActionLogicCopy(language: AppLanguage) {
  if (language === "fa") {
    return {
      preparingFeatureBranch: "در حال آماده سازی شاخه ویژگی...",
      generatingCommitMessage: "در حال ساخت پیام commit...",
      committing: "در حال commit...",
      pushingTo: (target: string) => `در حال push به ${target}...`,
      pushing: "در حال push...",
      creatingPr: "در حال ساخت PR...",
      createdPr: "PR ساخته شد",
      openedPr: "PR باز شد",
      pushed: "push انجام شد",
      committed: "Commit شد",
      committedChanges: "تغییرات commit شد",
      done: "انجام شد",
      commit: "Commit",
      push: "Push",
      viewPr: "مشاهده PR",
      createPr: "ساخت PR",
      commitAndPush: "Commit و Push",
      commitPushPr: "Commit، Push و PR",
      pushCreatePr: "Push و ساخت PR",
      syncBranch: "همگام سازی شاخه",
      pull: "Pull",
      gitActionInProgress: "عملیات git در حال انجام است.",
      gitStatusUnavailable: "وضعیت git در دسترس نیست.",
      createAndCheckoutBranchBeforePushOrPr:
        "قبل از push یا باز کردن PR یک شاخه بسازید و checkout کنید.",
      addRemoteBeforePushOrPr: (remote: string) =>
        `پیش از push یا ساخت PR یک remote با نام "${remote}" اضافه کنید.`,
      noLocalCommitsToPush: "هیچ commit محلی برای push وجود ندارد.",
      branchDiverged: "شاخه از upstream جدا شده است. اول rebase/merge کنید.",
      branchUpToDateNoAction: "شاخه به روز است. اقدامی لازم نیست.",
      commitPushDefaultBranchTitle: "Commit و push به شاخه پیش فرض؟",
      pushDefaultBranchTitle: "Push به شاخه پیش فرض؟",
      commitPushCreatePrDefaultBranchTitle: "Commit، push و ساخت PR از شاخه پیش فرض؟",
      pushCreatePrDefaultBranchTitle: "Push و ساخت PR از شاخه پیش فرض؟",
      commitAndPushChangesSummary: "این عمل تغییرات را commit و push می کند",
      pushLocalCommitsSummary: "این عمل commit های محلی را push می کند",
      commitPushCreatePrSummary: "این عمل commit می کند، push می کند و یک PR می سازد",
      pushLocalCommitsCreatePrSummary: "این عمل commit های محلی را push می کند و یک PR می سازد",
      defaultBranchDescription: (branch: string, summary: string) =>
        `${summary} روی "${branch}" انجام می شود. می توانید روی همین شاخه ادامه دهید یا یک شاخه ویژگی بسازید و همین عمل را آنجا اجرا کنید.`,
      continueCommitAndPushTo: (branch: string) => `Commit و push به ${branch}`,
      continuePushTo: (branch: string) => `Push به ${branch}`,
      continueCommitPushPr: "Commit، push و ساخت PR",
      continuePushPr: "Push و ساخت PR",
    };
  }

  return {
    preparingFeatureBranch: "Preparing feature branch...",
    generatingCommitMessage: "Generating commit message...",
    committing: "Committing...",
    pushingTo: (target: string) => `Pushing to ${target}...`,
    pushing: "Pushing...",
    creatingPr: "Creating PR...",
    createdPr: "Created PR",
    openedPr: "Opened PR",
    pushed: "Pushed",
    committed: "Committed",
    committedChanges: "Committed changes",
    done: "Done",
    commit: "Commit",
    push: "Push",
    viewPr: "View PR",
    createPr: "Create PR",
    commitAndPush: "Commit & push",
    commitPushPr: "Commit, push & PR",
    pushCreatePr: "Push & create PR",
    syncBranch: "Sync branch",
    pull: "Pull",
    gitActionInProgress: "Git action in progress.",
    gitStatusUnavailable: "Git status is unavailable.",
    createAndCheckoutBranchBeforePushOrPr:
      "Create and checkout a branch before pushing or opening a PR.",
    addRemoteBeforePushOrPr: (remote: string) =>
      `Add a "${remote}" remote before pushing or creating a PR.`,
    noLocalCommitsToPush: "No local commits to push.",
    branchDiverged: "Branch has diverged from upstream. Rebase/merge first.",
    branchUpToDateNoAction: "Branch is up to date. No action needed.",
    commitPushDefaultBranchTitle: "Commit & push to default branch?",
    pushDefaultBranchTitle: "Push to default branch?",
    commitPushCreatePrDefaultBranchTitle: "Commit, push & create PR from default branch?",
    pushCreatePrDefaultBranchTitle: "Push & create PR from default branch?",
    commitAndPushChangesSummary: "This action will commit and push changes",
    pushLocalCommitsSummary: "This action will push local commits",
    commitPushCreatePrSummary: "This action will commit, push, and create a PR",
    pushLocalCommitsCreatePrSummary: "This action will push local commits and create a PR",
    defaultBranchDescription: (branch: string, summary: string) =>
      `${summary} on "${branch}". You can continue on this branch or create a feature branch and run the same action there.`,
    continueCommitAndPushTo: (branch: string) => `Commit & push to ${branch}`,
    continuePushTo: (branch: string) => `Push to ${branch}`,
    continueCommitPushPr: "Commit, push & create PR",
    continuePushPr: "Push & create PR",
  };
}

function shortenSha(sha: string | undefined): string | null {
  if (!sha) return null;
  return sha.slice(0, SHORT_SHA_LENGTH);
}

function truncateText(
  value: string | undefined,
  maxLength = TOAST_DESCRIPTION_MAX,
): string | undefined {
  if (!value) return undefined;
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return "...".slice(0, maxLength);
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function buildGitActionProgressStages(
  input: {
    action: GitStackedAction;
    hasCustomCommitMessage: boolean;
    hasWorkingTreeChanges: boolean;
    forcePushOnly?: boolean;
    pushTarget?: string;
    featureBranch?: boolean;
  },
  language: AppLanguage = "en",
): string[] {
  const copy = getGitActionLogicCopy(language);
  const branchStages = input.featureBranch ? [copy.preparingFeatureBranch] : [];
  const shouldIncludeCommitStages =
    !input.forcePushOnly && (input.action === "commit" || input.hasWorkingTreeChanges);
  const commitStages = !shouldIncludeCommitStages
    ? []
    : input.hasCustomCommitMessage
      ? [copy.committing]
      : [copy.generatingCommitMessage, copy.committing];
  const pushStage = input.pushTarget ? copy.pushingTo(input.pushTarget) : copy.pushing;
  if (input.action === "commit") {
    return [...branchStages, ...commitStages];
  }
  if (input.action === "commit_push") {
    return [...branchStages, ...commitStages, pushStage];
  }
  return [...branchStages, ...commitStages, pushStage, copy.creatingPr];
}

const withDescription = (title: string, description: string | undefined) =>
  description ? { title, description } : { title };

export function summarizeGitResult(
  result: GitRunStackedActionResult,
  language: AppLanguage = "en",
): {
  title: string;
  description?: string;
} {
  const copy = getGitActionLogicCopy(language);
  if (result.pr.status === "created" || result.pr.status === "opened_existing") {
    const prNumber = result.pr.number ? ` #${result.pr.number}` : "";
    const title = `${result.pr.status === "created" ? copy.createdPr : copy.openedPr}${prNumber}`;
    return withDescription(title, truncateText(result.pr.title));
  }

  if (result.push.status === "pushed") {
    const shortSha = shortenSha(result.commit.commitSha);
    const branch = result.push.upstreamBranch ?? result.push.branch;
    const pushedCommitPart = shortSha ? ` ${shortSha}` : "";
    const branchPart = branch ? ` to ${branch}` : "";
    return withDescription(
      `${copy.pushed}${pushedCommitPart}${branchPart}`,
      truncateText(result.commit.subject),
    );
  }

  if (result.commit.status === "created") {
    const shortSha = shortenSha(result.commit.commitSha);
    const title = shortSha ? `${copy.committed} ${shortSha}` : copy.committedChanges;
    return withDescription(title, truncateText(result.commit.subject));
  }

  return { title: copy.done };
}

export function buildMenuItems(
  gitStatus: GitStatusResult | null,
  isBusy: boolean,
  hasPreferredRemote = true,
  language: AppLanguage = "en",
): GitActionMenuItem[] {
  const copy = getGitActionLogicCopy(language);
  if (!gitStatus) return [];

  const hasBranch = gitStatus.branch !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isBehind = gitStatus.behindCount > 0;
  const canPushWithoutUpstream = hasPreferredRemote && !gitStatus.hasUpstream;
  const canCommit = !isBusy && hasChanges;
  const canPush =
    !isBusy &&
    hasBranch &&
    !hasChanges &&
    !isBehind &&
    gitStatus.aheadCount > 0 &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);
  const canCreatePr =
    !isBusy &&
    hasBranch &&
    !hasChanges &&
    !hasOpenPr &&
    gitStatus.aheadCount > 0 &&
    !isBehind &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);
  const canOpenPr = !isBusy && hasOpenPr;

  return [
    {
      id: "commit",
      label: copy.commit,
      disabled: !canCommit,
      icon: "commit",
      kind: "open_dialog",
      dialogAction: "commit",
    },
    {
      id: "push",
      label: copy.push,
      disabled: !canPush,
      icon: "push",
      kind: "open_dialog",
      dialogAction: "push",
    },
    hasOpenPr
      ? {
          id: "pr",
          label: copy.viewPr,
          disabled: !canOpenPr,
          icon: "pr",
          kind: "open_pr",
        }
      : {
          id: "pr",
          label: copy.createPr,
          disabled: !canCreatePr,
          icon: "pr",
          kind: "open_dialog",
          dialogAction: "create_pr",
        },
  ];
}

export function resolveQuickAction(
  gitStatus: GitStatusResult | null,
  isBusy: boolean,
  isDefaultBranch = false,
  hasPreferredRemote = true,
  language: AppLanguage = "en",
): GitQuickAction {
  const copy = getGitActionLogicCopy(language);
  if (isBusy) {
    return {
      label: copy.commit,
      disabled: true,
      kind: "show_hint",
      hint: copy.gitActionInProgress,
    };
  }

  if (!gitStatus) {
    return {
      label: copy.commit,
      disabled: true,
      kind: "show_hint",
      hint: copy.gitStatusUnavailable,
    };
  }

  const hasBranch = gitStatus.branch !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isAhead = gitStatus.aheadCount > 0;
  const isBehind = gitStatus.behindCount > 0;
  const isDiverged = isAhead && isBehind;

  if (!hasBranch) {
    return {
      label: copy.commit,
      disabled: true,
      kind: "show_hint",
      hint: copy.createAndCheckoutBranchBeforePushOrPr,
    };
  }

  if (hasChanges) {
    if (isDiverged || isBehind) {
      return { label: copy.commit, disabled: false, kind: "run_action", action: "commit" };
    }
    if (!gitStatus.hasUpstream && !hasPreferredRemote) {
      return { label: copy.commit, disabled: false, kind: "run_action", action: "commit" };
    }
    if (hasOpenPr || isDefaultBranch) {
      return {
        label: copy.commitAndPush,
        disabled: false,
        kind: "run_action",
        action: "commit_push",
      };
    }
    return {
      label: copy.commitPushPr,
      disabled: false,
      kind: "run_action",
      action: "commit_push_pr",
    };
  }

  if (!gitStatus.hasUpstream) {
    if (!hasPreferredRemote) {
      if (hasOpenPr && !isAhead) {
        return { label: copy.viewPr, disabled: false, kind: "open_pr" };
      }
      return {
        label: copy.push,
        disabled: true,
        kind: "show_hint",
        hint: copy.addRemoteBeforePushOrPr(PREFERRED_REMOTE_NAME),
      };
    }
    if (!isAhead) {
      if (hasOpenPr) {
        return { label: copy.viewPr, disabled: false, kind: "open_pr" };
      }
      return {
        label: copy.push,
        disabled: true,
        kind: "show_hint",
        hint: copy.noLocalCommitsToPush,
      };
    }
    if (hasOpenPr || isDefaultBranch) {
      return { label: copy.push, disabled: false, kind: "run_action", action: "commit_push" };
    }
    return {
      label: copy.pushCreatePr,
      disabled: false,
      kind: "run_action",
      action: "commit_push_pr",
    };
  }

  if (isDiverged) {
    return {
      label: copy.syncBranch,
      disabled: true,
      kind: "show_hint",
      hint: copy.branchDiverged,
    };
  }

  if (isBehind) {
    return {
      label: copy.pull,
      disabled: false,
      kind: "run_pull",
    };
  }

  if (isAhead) {
    if (hasOpenPr || isDefaultBranch) {
      return { label: copy.push, disabled: false, kind: "run_action", action: "commit_push" };
    }
    return {
      label: copy.pushCreatePr,
      disabled: false,
      kind: "run_action",
      action: "commit_push_pr",
    };
  }

  if (hasOpenPr && gitStatus.hasUpstream) {
    return { label: copy.viewPr, disabled: false, kind: "open_pr" };
  }

  return {
    label: copy.commit,
    disabled: true,
    kind: "show_hint",
    hint: copy.branchUpToDateNoAction,
  };
}

export function requiresDefaultBranchConfirmation(
  action: GitStackedAction,
  isDefaultBranch: boolean,
): boolean {
  if (!isDefaultBranch) return false;
  return action === "commit_push" || action === "commit_push_pr";
}

export function resolveDefaultBranchActionDialogCopy(
  input: {
    action: DefaultBranchConfirmableAction;
    branchName: string;
    includesCommit: boolean;
  },
  language: AppLanguage = "en",
): DefaultBranchActionDialogCopy {
  const copy = getGitActionLogicCopy(language);
  const branchLabel = input.branchName;

  if (input.action === "commit_push") {
    if (input.includesCommit) {
      return {
        title: copy.commitPushDefaultBranchTitle,
        description: copy.defaultBranchDescription(branchLabel, copy.commitAndPushChangesSummary),
        continueLabel: copy.continueCommitAndPushTo(branchLabel),
      };
    }
    return {
      title: copy.pushDefaultBranchTitle,
      description: copy.defaultBranchDescription(branchLabel, copy.pushLocalCommitsSummary),
      continueLabel: copy.continuePushTo(branchLabel),
    };
  }

  if (input.includesCommit) {
    return {
      title: copy.commitPushCreatePrDefaultBranchTitle,
      description: copy.defaultBranchDescription(branchLabel, copy.commitPushCreatePrSummary),
      continueLabel: copy.continueCommitPushPr,
    };
  }
  return {
    title: copy.pushCreatePrDefaultBranchTitle,
    description: copy.defaultBranchDescription(branchLabel, copy.pushLocalCommitsCreatePrSummary),
    continueLabel: copy.continuePushPr,
  };
}

// Re-export from shared for backwards compatibility in this module's exports
export { resolveAutoFeatureBranchName } from "@t3tools/shared/git";
