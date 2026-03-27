import { DEFAULT_MODEL_BY_PROVIDER, type ProjectId, type ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import { useAppSettings } from "../appSettings";
import { useNewThreadActions } from "./useNewThread";
import { compareThreadsByRecency } from "../lib/threadOrdering";
import { newCommandId, newProjectId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { useSidebarPreferencesStore } from "../sidebarPreferencesStore";

function titleFromWorkspacePath(cwd: string): string {
  return cwd.split(/[/\\]/).findLast((segment) => segment.trim().length > 0) ?? cwd;
}

export function useProjectCreationActions() {
  const { settings } = useAppSettings();
  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);
  const archivedThreadIds = useSidebarPreferencesStore((store) => store.archivedThreadIds);
  const { openNewThread } = useNewThreadActions();
  const navigate = useNavigate();
  const [newCwd, setNewCwd] = useState("");
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [addProjectError, setAddProjectError] = useState<string | null>(null);

  const openThread = useCallback(
    async (threadId: ThreadId) => {
      await navigate({
        to: "/$threadId",
        params: { threadId },
      });
    },
    [navigate],
  );

  const focusBestProjectTarget = useCallback(
    async (projectId: ProjectId) => {
      const latestThread = threads
        .filter((thread) => thread.projectId === projectId && !archivedThreadIds.has(thread.id))
        .toSorted(compareThreadsByRecency)[0];

      if (latestThread) {
        await openThread(latestThread.id);
        return;
      }

      await openNewThread(projectId, {
        envMode: settings.defaultThreadEnvMode,
      });
    },
    [archivedThreadIds, openNewThread, openThread, settings.defaultThreadEnvMode, threads],
  );

  const clearProjectCreationError = useCallback(() => {
    setAddProjectError(null);
  }, []);

  const addProjectFromPath = useCallback(
    async (rawCwd: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      const cwd = rawCwd.trim();
      if (!cwd || isAddingProject) {
        return { ok: false, message: "Workspace path is required." };
      }
      const api = readNativeApi();
      if (!api) {
        return { ok: false, message: "Native API not found." };
      }

      setIsAddingProject(true);
      setAddProjectError(null);
      try {
        const existing = projects.find((project) => project.cwd === cwd);
        if (existing) {
          await focusBestProjectTarget(existing.id);
          setNewCwd("");
          return { ok: true };
        }

        const projectId = newProjectId();
        await api.orchestration.dispatchCommand({
          type: "project.create",
          commandId: newCommandId(),
          projectId,
          title: titleFromWorkspacePath(cwd),
          workspaceRoot: cwd,
          defaultModel: DEFAULT_MODEL_BY_PROVIDER.codex,
          createdAt: new Date().toISOString(),
        });
        await openNewThread(projectId, {
          envMode: settings.defaultThreadEnvMode,
        }).catch(() => undefined);
        setNewCwd("");
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to add project.";
        setAddProjectError(message);
        return { ok: false, message };
      } finally {
        setIsAddingProject(false);
      }
    },
    [
      focusBestProjectTarget,
      isAddingProject,
      openNewThread,
      projects,
      settings.defaultThreadEnvMode,
    ],
  );

  const pickProjectFolder = useCallback(async (): Promise<string | null> => {
    const api = readNativeApi();
    if (!api || isPickingFolder) {
      return null;
    }

    setIsPickingFolder(true);
    try {
      return await api.dialogs.pickFolder();
    } catch {
      return null;
    } finally {
      setIsPickingFolder(false);
    }
  }, [isPickingFolder]);

  const canAddProject = useMemo(
    () => newCwd.trim().length > 0 && !isAddingProject,
    [isAddingProject, newCwd],
  );

  return {
    addProjectError,
    addProjectFromPath,
    canAddProject,
    clearProjectCreationError,
    isAddingProject,
    isPickingFolder,
    newCwd,
    pickProjectFolder,
    setNewCwd,
  } as const;
}
