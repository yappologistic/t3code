import type { GitBranch } from "@t3tools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useNativeApi } from "../hooks/useNativeApi";
import { useStore } from "../store";
import { Button } from "./ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
} from "./ui/combobox";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";

interface BranchToolbarProps {
  envMode: "local" | "worktree";
  onEnvModeChange: (mode: "local" | "worktree") => void;
  envLocked: boolean;
}

export default function BranchToolbar({ envMode, onEnvModeChange, envLocked }: BranchToolbarProps) {
  const { state, dispatch } = useStore();
  const api = useNativeApi();
  const queryClient = useQueryClient();

  const [isBranchMenuOpen, setIsBranchMenuOpen] = useState(false);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  const activeThread = state.threads.find((thread) => thread.id === state.activeThreadId);
  const activeProject = state.projects.find((project) => project.id === activeThread?.projectId);
  const activeThreadId = activeThread?.id;
  const activeThreadBranch = activeThread?.branch ?? null;
  const activeWorktreePath = activeThread?.worktreePath ?? null;
  const branchCwd = activeWorktreePath ?? activeProject?.cwd;

  // ── Queries ───────────────────────────────────────────────────────────

  const branchesQuery = useQuery({
    queryKey: ["git", "branches", branchCwd],
    queryFn: () => api!.git.listBranches({ cwd: branchCwd! }),
    enabled: !!api && !!branchCwd,
  });

  const branches = branchesQuery.data?.branches ?? [];
  const branchNames = branches.map((branch) => branch.name);
  const branchByName = new Map(branches.map((branch) => [branch.name, branch]));
  // Default to true while loading — showing "Initialize git" during a fetch is wrong,
  // and worktrees are inherently git repos.
  const isRepo = branchesQuery.data?.isRepo ?? !branchesQuery.isLoading;

  // ── Mutations ─────────────────────────────────────────────────────────

  const checkoutMutation = useMutation({
    mutationFn: (branch: string) => api!.git.checkout({ cwd: branchCwd!, branch }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["git", "branches", branchCwd] }),
    onError: (error) => {
      setThreadError(error instanceof Error ? error.message : "Failed to checkout branch.");
      setIsBranchMenuOpen(true);
    },
  });

  const createBranchMutation = useMutation({
    mutationFn: (branch: string) =>
      api!.git
        .createBranch({ cwd: branchCwd!, branch })
        .then(() => api!.git.checkout({ cwd: branchCwd!, branch })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["git", "branches", branchCwd] }),
    onError: (error) =>
      setThreadError(error instanceof Error ? error.message : "Failed to create branch."),
  });

  const initMutation = useMutation({
    mutationFn: () => api!.git.init({ cwd: branchCwd! }),
    onSuccess: () => {
      setThreadError(null);
      queryClient.invalidateQueries({ queryKey: ["git", "branches", branchCwd] });
    },
    onError: (error) =>
      setThreadError(error instanceof Error ? error.message : "Failed to initialize git repo."),
  });

  // ── Effects ───────────────────────────────────────────────────────────

  // Keep thread branch synced to git current branch for local threads.
  const queryBranches = branchesQuery.data?.branches;
  useEffect(() => {
    if (!activeThreadId || activeWorktreePath) return;
    const current = queryBranches?.find((branch) => branch.current);
    if (!current) return;
    if (current.name === activeThreadBranch) return;
    dispatch({
      type: "SET_THREAD_BRANCH",
      threadId: activeThreadId,
      branch: current.name,
      worktreePath: null,
    });
  }, [activeThreadId, activeWorktreePath, activeThreadBranch, queryBranches, dispatch]);

  useEffect(() => {
    if (isBranchMenuOpen) return;
    setIsCreatingBranch(false);
    setNewBranchName("");
  }, [isBranchMenuOpen]);

  // ── Helpers ───────────────────────────────────────────────────────────

  const setThreadError = (error: string | null) => {
    if (!activeThreadId) return;
    dispatch({ type: "SET_ERROR", threadId: activeThreadId, error });
  };

  const setThreadBranch = (branch: string | null, worktreePath: string | null) => {
    if (!activeThreadId) return;
    // If the effective cwd is about to change, stop the running session so the
    // next message creates a new one with the correct cwd.
    const sessionId = activeThread?.session?.sessionId;
    if (sessionId && worktreePath !== activeWorktreePath) {
      void api?.providers.stopSession({ sessionId }).catch(() => undefined);
    }
    dispatch({ type: "SET_THREAD_BRANCH", threadId: activeThreadId, branch, worktreePath });
  };

  const selectBranch = (branch: GitBranch) => {
    if (!api || !activeThreadId || !branchCwd) return;

    // For new worktree mode, selecting a branch picks the base branch.
    if (envMode === "worktree" && !envLocked && !activeWorktreePath) {
      setThreadError(null);
      setThreadBranch(branch.name, null);
      setIsBranchMenuOpen(false);
      return;
    }

    // If the branch already lives in a worktree, redirect there instead of
    // trying to checkout (which git would reject with "already used by worktree").
    if (branch.worktreePath) {
      const isMainWorktree = branch.worktreePath === activeProject?.cwd;
      setThreadError(null);
      // Main worktree → switch back to local (project cwd, worktreePath=null).
      // Secondary worktree → point the thread at that worktree path.
      setThreadBranch(branch.name, isMainWorktree ? null : branch.worktreePath);
      setIsBranchMenuOpen(false);
      return;
    }

    checkoutMutation.mutate(branch.name, {
      onSuccess: () => {
        setThreadError(null);
        setThreadBranch(branch.name, activeWorktreePath);
        setIsBranchMenuOpen(false);
      },
    });
  };

  const createBranch = () => {
    const name = newBranchName.trim();
    if (!api || !activeThreadId || !branchCwd || !name) return;
    createBranchMutation.mutate(name, {
      onSuccess: () => {
        setThreadError(null);
        setThreadBranch(name, activeWorktreePath);
        setNewBranchName("");
        setIsCreatingBranch(false);
        setIsBranchMenuOpen(false);
      },
    });
  };

  if (!activeThread || !activeProject) return null;

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pb-3 pt-1">
      <div className="flex items-center gap-2">
        {envLocked || activeWorktreePath ? (
          <span className="border border-transparent px-[calc(--spacing(2)-1px)] text-sm font-medium text-muted-foreground/70 sm:text-xs">
            {activeWorktreePath ? "Worktree" : "Local"}
          </span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground/70 hover:text-foreground/80"
            size="xs"
            onClick={() => onEnvModeChange(envMode === "local" ? "worktree" : "local")}
          >
            {envMode === "worktree" ? "New worktree" : "Local"}
          </Button>
        )}
      </div>

      {!isRepo ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[12px] text-muted-foreground/70 transition-colors duration-150 hover:bg-accent hover:text-foreground/80 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!branchCwd || initMutation.isPending}
          onClick={() => initMutation.mutate()}
        >
          {initMutation.isPending ? "Initializing\u2026" : "Initialize git"}
        </button>
      ) : (
        <Combobox
          items={branchNames}
          autoHighlight
          onOpenChange={(open) => setIsBranchMenuOpen(open)}
          open={isBranchMenuOpen}
          value={activeThread.branch}
        >
          <ComboboxTrigger
            render={<Button variant="ghost" size="xs" />}
            className="text-muted-foreground/70 hover:text-foreground/80"
            disabled={branchesQuery.isLoading}
          >
            <span className="max-w-[240px] truncate">
              {activeThread.branch
                ? envMode === "worktree" && !activeWorktreePath
                  ? `From ${activeThread.branch}`
                  : activeThread.branch
                : "Select branch"}
            </span>
            <ChevronDownIcon />
          </ComboboxTrigger>
          <ComboboxPopup align="end" side="top" className="w-64">
            <div className="border-b">
              <ComboboxInput
                className="rounded-b-none before:rounded-b-none [&_input]:font-sans"
                placeholder="Search branches..."
                showClear
                showTrigger={false}
                size="sm"
              />
            </div>
            <ComboboxEmpty>No branches found.</ComboboxEmpty>

            <ComboboxList className="max-h-56">
              {(branchName) => {
                const branch = branchByName.get(branchName);
                if (!branch) return null;

                const hasSecondaryWorktree =
                  branch.worktreePath && branch.worktreePath !== activeProject.cwd;
                return (
                  <ComboboxItem
                    hideIndicator
                    key={branchName}
                    value={branchName}
                    className={branchName === activeThread.branch ? "bg-accent text-foreground" : undefined}
                    onClick={() => selectBranch(branch)}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="truncate">{branchName}</span>
                      {(branch.current || branch.isDefault || hasSecondaryWorktree) && (
                        <span className="shrink-0 text-[10px] text-muted-foreground/45">
                          {branch.current
                            ? "current"
                            : hasSecondaryWorktree
                              ? "worktree"
                              : "default"}
                        </span>
                      )}
                    </div>
                  </ComboboxItem>
                );
              }}
            </ComboboxList>
            {envMode === "local" && (
              <>
                {isCreatingBranch ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      createBranch();
                    }}
                  >
                    <InputGroup className="rounded-t-none before:rounded-t-none">
                      <InputGroupInput
                        className="[&_input]:font-sans"
                        size="sm"
                        placeholder="branch-name"
                        type="text"
                        value={newBranchName}
                        onChange={(event) => setNewBranchName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.stopPropagation();
                            setIsCreatingBranch(false);
                            setNewBranchName("");
                          }
                        }}
                        autoFocus
                      />
                      <InputGroupAddon align="inline-end">
                        <Button
                          size="xs"
                          variant="secondary"
                          type="submit"
                          disabled={!newBranchName.trim() || createBranchMutation.isPending}
                        >
                          Create
                        </Button>
                      </InputGroupAddon>
                    </InputGroup>
                  </form>
                ) : (
                  <Button
                    size="sm"
                    className="w-full justify-start h-9 rounded-t-none rounded-b-lg before:rounded-t-none"
                    variant="outline"
                    onClick={() => setIsCreatingBranch(true)}
                  >
                    <PlusIcon />
                    New branch
                  </Button>
                )}
              </>
            )}
          </ComboboxPopup>
        </Combobox>
      )}
    </div>
  );
}
