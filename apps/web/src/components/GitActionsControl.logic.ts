import type { GitRunStackedActionResult, GitStackedAction, GitStatusResult } from "@t3tools/contracts";

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

export function describeGitResult(result: GitRunStackedActionResult): string {
  const parts: string[] = [];

  if (result.commit.status === "created") {
    parts.push(result.commit.subject ?? "Committed changes");
  }

  if (result.push.status === "pushed") {
    parts.push(
      result.push.upstreamBranch
        ? `Pushed to ${result.push.upstreamBranch}`
        : "Pushed",
    );
  }

  if (result.pr.status === "created") {
    parts.push(result.pr.number ? `Created PR #${result.pr.number}` : "Created PR");
  } else if (result.pr.status === "opened_existing") {
    parts.push(result.pr.number ? `PR #${result.pr.number}` : "Opened existing PR");
  }

  return parts.join(" · ") || "No changes needed.";
}

export function buildMenuItems(
  gitStatus: GitStatusResult | null,
  isBusy: boolean,
): GitActionMenuItem[] {
  if (!gitStatus) return [];

  const hasBranch = gitStatus.branch !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.openPr !== null;
  const isBehind = gitStatus.behindCount > 0;
  const canCommit = !isBusy && hasChanges;
  const canPush =
    !isBusy &&
    hasBranch &&
    !hasChanges &&
    !isBehind &&
    (gitStatus.aheadCount > 0 || !gitStatus.hasUpstream);
  const canCreatePr =
    !isBusy &&
    hasBranch &&
    !hasChanges &&
    !hasOpenPr &&
    gitStatus.aheadCount > 0 &&
    gitStatus.hasUpstream &&
    !isBehind;
  const canOpenPr = !isBusy && hasOpenPr;

  return [
    {
      id: "commit",
      label: "Commit",
      disabled: !canCommit,
      icon: "commit",
      kind: "open_dialog",
      dialogAction: "commit",
    },
    {
      id: "push",
      label: "Push",
      disabled: !canPush,
      icon: "push",
      kind: "open_dialog",
      dialogAction: "push",
    },
    hasOpenPr
      ? {
          id: "pr",
          label: "Open PR",
          disabled: !canOpenPr,
          icon: "pr",
          kind: "open_pr",
        }
      : {
          id: "pr",
          label: "Create PR",
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
): GitQuickAction {
  if (isBusy) {
    return { label: "Running...", disabled: true, kind: "show_hint", hint: "Git action in progress." };
  }

  if (!gitStatus) {
    return {
      label: "Git actions",
      disabled: true,
      kind: "show_hint",
      hint: "Git status is unavailable.",
    };
  }

  const hasBranch = gitStatus.branch !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.openPr !== null;
  const isBehind = gitStatus.behindCount > 0;
  const canPush = hasBranch && !hasChanges && !isBehind;

  if (!hasChanges && hasOpenPr && gitStatus.aheadCount === 0 && !isBehind) {
    return { label: "Open PR", disabled: false, kind: "open_pr" };
  }

  if (!hasChanges && isBehind) {
    return {
      label: "Pull",
      disabled: false,
      kind: "run_pull",
    };
  }

  if (!hasChanges && canPush && (gitStatus.aheadCount > 0 || !gitStatus.hasUpstream)) {
    if (hasOpenPr) {
      return { label: "Push", disabled: false, kind: "run_action", action: "commit_push" };
    }
    return {
      label: "Push & create PR",
      disabled: false,
      kind: "run_action",
      action: "commit_push_pr",
    };
  }

  if (hasChanges) {
    return { label: "Commit", disabled: false, kind: "run_action", action: "commit" };
  }

  if (hasOpenPr) {
    return { label: "Open PR", disabled: false, kind: "open_pr" };
  }

  if (hasBranch && gitStatus.hasUpstream && !isBehind) {
    if (gitStatus.aheadCount > 0) {
      return { label: "Create PR", disabled: false, kind: "run_action", action: "commit_push_pr" };
    }
    return {
      label: "Commit",
      disabled: true,
      kind: "show_hint",
      hint: "Branch is up to date. Nothing to commit, push, pull, or open as a PR.",
    };
  }

  if (!hasBranch) {
    return {
      label: "Detached HEAD",
      disabled: false,
      kind: "show_hint",
      hint: "Create and checkout a branch before pushing or opening a PR.",
    };
  }

  return { label: "Commit", disabled: true, kind: "show_hint", hint: "No git action needed." };
}

export function requiresDefaultBranchConfirmation(
  action: GitStackedAction,
  isDefaultBranch: boolean,
): boolean {
  if (!isDefaultBranch) return false;
  return action === "commit_push" || action === "commit_push_pr";
}

