import type { GitStackedAction, NativeApi } from "@t3tools/contracts";
import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

export const gitQueryKeys = {
  all: ["git"] as const,
  status: (cwd: string | null) => ["git", "status", cwd] as const,
  branches: (cwd: string | null) => ["git", "branches", cwd] as const,
};

export function invalidateGitQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: gitQueryKeys.all });
}

export function gitStatusQueryOptions(api: NativeApi | undefined, cwd: string | null) {
  return queryOptions({
    queryKey: gitQueryKeys.status(cwd),
    queryFn: async () => {
      if (!api || !cwd) {
        throw new Error("Git status is unavailable.");
      }
      return api.git.status({ cwd });
    },
    enabled: !!api && !!cwd,
  });
}

export function gitBranchesQueryOptions(api: NativeApi | undefined, cwd: string | null) {
  return queryOptions({
    queryKey: gitQueryKeys.branches(cwd),
    queryFn: async () => {
      if (!api || !cwd) {
        throw new Error("Git branches are unavailable.");
      }
      return api.git.listBranches({ cwd });
    },
    enabled: !!api && !!cwd,
  });
}

export function gitInitMutationOptions(input: {
  api: NativeApi | undefined;
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async () => {
      if (!input.api || !input.cwd) throw new Error("Git init is unavailable.");
      return input.api.git.init({ cwd: input.cwd });
    },
    onSuccess: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitCheckoutMutationOptions(input: {
  api: NativeApi | undefined;
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async (branch: string) => {
      if (!input.api || !input.cwd) throw new Error("Git checkout is unavailable.");
      return input.api.git.checkout({ cwd: input.cwd, branch });
    },
    onSuccess: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitCreateBranchAndCheckoutMutationOptions(input: {
  api: NativeApi | undefined;
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async (branch: string) => {
      if (!input.api || !input.cwd) throw new Error("Git branch creation is unavailable.");
      await input.api.git.createBranch({ cwd: input.cwd, branch });
      return input.api.git.checkout({ cwd: input.cwd, branch });
    },
    onSuccess: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitRunStackedActionMutationOptions(input: {
  api: NativeApi | undefined;
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async ({
      action,
      commitMessage,
    }: {
      action: GitStackedAction;
      commitMessage?: string;
    }) => {
      if (!input.api || !input.cwd) {
        throw new Error("Git action is unavailable.");
      }
      return input.api.git.runStackedAction({
        cwd: input.cwd,
        action,
        ...(commitMessage ? { commitMessage } : {}),
      });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitPullMutationOptions(input: {
  api: NativeApi | undefined;
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async () => {
      if (!input.api || !input.cwd) throw new Error("Git pull is unavailable.");
      return input.api.git.pull({ cwd: input.cwd });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitCreateWorktreeMutationOptions(input: {
  api: NativeApi | undefined;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async ({
      cwd,
      branch,
      newBranch,
    }: {
      cwd: string;
      branch: string;
      newBranch: string;
    }) => {
      if (!input.api) {
        throw new Error("Git worktree creation is unavailable.");
      }
      return input.api.git.createWorktree({ cwd, branch, newBranch });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}

export function gitRemoveWorktreeMutationOptions(input: {
  api: NativeApi | undefined;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationFn: async ({ cwd, path }: { cwd: string; path: string }) => {
      if (!input.api) {
        throw new Error("Git worktree removal is unavailable.");
      }
      return input.api.git.removeWorktree({ cwd, path });
    },
    onSettled: async () => {
      await invalidateGitQueries(input.queryClient);
    },
  });
}
