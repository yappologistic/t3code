import { type DraftThreadEnvMode } from "../composerDraftStore";

export interface NewThreadDraftContextOptions {
  branch?: string | null;
  worktreePath?: string | null;
  envMode?: DraftThreadEnvMode;
}

export function buildNewThreadDraftContextPatch(
  options: NewThreadDraftContextOptions | undefined,
): {
  branch?: string | null;
  worktreePath?: string | null;
  envMode?: DraftThreadEnvMode;
} | null {
  const hasBranchOption = options?.branch !== undefined;
  const hasWorktreePathOption = options?.worktreePath !== undefined;
  const hasEnvModeOption = options?.envMode !== undefined;

  if (!hasBranchOption && !hasWorktreePathOption && !hasEnvModeOption) {
    return null;
  }

  if (options?.envMode === "local") {
    return {
      branch: hasBranchOption ? (options.branch ?? null) : null,
      worktreePath: hasWorktreePathOption ? (options.worktreePath ?? null) : null,
      envMode: "local",
    };
  }

  return {
    ...(hasBranchOption ? { branch: options?.branch ?? null } : {}),
    ...(hasWorktreePathOption ? { worktreePath: options?.worktreePath ?? null } : {}),
    ...(hasEnvModeOption ? { envMode: options?.envMode } : {}),
  };
}
