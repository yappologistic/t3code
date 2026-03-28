import { DEFAULT_RUNTIME_MODE, ProjectId, ThreadId } from "@t3tools/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import { type DraftThreadEnvMode, useComposerDraftStore } from "../composerDraftStore";
import { newThreadId } from "../lib/utils";
import { buildNewThreadDraftContextPatch } from "../lib/newThreadDraftContext";
import { useStore } from "../store";

export interface NewThreadOptions {
  branch?: string | null;
  worktreePath?: string | null;
  envMode?: DraftThreadEnvMode;
}

export function useNewThreadActions() {
  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);
  const getDraftThreadByProjectId = useComposerDraftStore(
    (store) => store.getDraftThreadByProjectId,
  );
  const getDraftThread = useComposerDraftStore((store) => store.getDraftThread);
  const setProjectDraftThreadId = useComposerDraftStore((store) => store.setProjectDraftThreadId);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const clearProjectDraftThreadId = useComposerDraftStore(
    (store) => store.clearProjectDraftThreadId,
  );
  const navigate = useNavigate();
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const activeThread = useMemo(
    () => (routeThreadId ? threads.find((thread) => thread.id === routeThreadId) : undefined),
    [routeThreadId, threads],
  );
  const activeDraftThread = routeThreadId ? getDraftThread(routeThreadId) : null;
  const defaultProjectId =
    activeThread?.projectId ?? activeDraftThread?.projectId ?? projects[0]?.id ?? null;

  const openNewThread = useCallback(
    (projectId: ProjectId, options?: NewThreadOptions): Promise<void> => {
      const draftContextPatch = buildNewThreadDraftContextPatch(options);
      const storedDraftThread = getDraftThreadByProjectId(projectId);
      if (storedDraftThread) {
        return (async () => {
          if (draftContextPatch) {
            setDraftThreadContext(storedDraftThread.threadId, draftContextPatch);
          }
          setProjectDraftThreadId(projectId, storedDraftThread.threadId);
          if (routeThreadId === storedDraftThread.threadId) {
            return;
          }
          await navigate({
            to: "/$threadId",
            params: { threadId: storedDraftThread.threadId },
          });
        })();
      }

      clearProjectDraftThreadId(projectId);

      const routeDraftThread = routeThreadId ? getDraftThread(routeThreadId) : null;
      if (routeDraftThread && routeThreadId && routeDraftThread.projectId === projectId) {
        if (draftContextPatch) {
          setDraftThreadContext(routeThreadId, draftContextPatch);
        }
        setProjectDraftThreadId(projectId, routeThreadId);
        return Promise.resolve();
      }

      const nextThreadId = newThreadId();
      const createdAt = new Date().toISOString();
      return (async () => {
        setProjectDraftThreadId(projectId, nextThreadId, {
          createdAt,
          branch: options?.branch ?? null,
          worktreePath: options?.worktreePath ?? null,
          envMode: options?.envMode ?? "local",
          runtimeMode: DEFAULT_RUNTIME_MODE,
        });

        await navigate({
          to: "/$threadId",
          params: { threadId: nextThreadId },
        });
      })();
    },
    [
      clearProjectDraftThreadId,
      getDraftThread,
      getDraftThreadByProjectId,
      navigate,
      routeThreadId,
      setDraftThreadContext,
      setProjectDraftThreadId,
    ],
  );

  const openDefaultNewThread = useCallback((): Promise<void> => {
    if (!defaultProjectId) {
      return Promise.resolve();
    }

    return openNewThread(defaultProjectId);
  }, [defaultProjectId, openNewThread]);

  return {
    activeDraftThread,
    activeThread,
    defaultProjectId,
    openDefaultNewThread,
    openNewThread,
  };
}
