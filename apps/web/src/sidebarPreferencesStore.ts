import { ProjectId, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { filterArchivedIds, type SidebarProjectSortMode } from "./lib/threadOrdering";

const SIDEBAR_PREFERENCES_STORAGE_KEY = "rowl:sidebar-preferences:v1";

interface PersistedSidebarPreferencesState {
  pinnedProjectIds: ProjectId[];
  archivedProjectIds: ProjectId[];
  pinnedThreadIds: ThreadId[];
  archivedThreadIds: ThreadId[];
  projectSortMode: SidebarProjectSortMode;
}

interface SidebarPreferencesState {
  pinnedProjectIds: ReadonlySet<ProjectId>;
  archivedProjectIds: ReadonlySet<ProjectId>;
  pinnedThreadIds: ReadonlySet<ThreadId>;
  archivedThreadIds: ReadonlySet<ThreadId>;
  projectSortMode: SidebarProjectSortMode;
  setProjectPinned: (projectId: ProjectId, pinned: boolean) => void;
  setProjectArchived: (projectId: ProjectId, archived: boolean) => void;
  setThreadPinned: (threadId: ThreadId, pinned: boolean) => void;
  setThreadArchived: (threadId: ThreadId, archived: boolean) => void;
  setProjectSortMode: (mode: SidebarProjectSortMode) => void;
  pruneMissing: (input: {
    projectIds: readonly ProjectId[];
    threadIds: readonly ThreadId[];
  }) => void;
}

const EMPTY_PROJECT_IDS: ProjectId[] = [];
const EMPTY_THREAD_IDS: ThreadId[] = [];

function withToggledId<TId extends string>(
  current: ReadonlySet<TId>,
  id: TId,
  enabled: boolean,
): Set<TId> {
  const next = new Set(current);
  if (enabled) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return next;
}

export const useSidebarPreferencesStore = create<SidebarPreferencesState>()(
  persist(
    (set) => ({
      pinnedProjectIds: new Set<ProjectId>(),
      archivedProjectIds: new Set<ProjectId>(),
      pinnedThreadIds: new Set<ThreadId>(),
      archivedThreadIds: new Set<ThreadId>(),
      projectSortMode: "recent",
      setProjectPinned: (projectId, pinned) => {
        set((state) => ({
          pinnedProjectIds: withToggledId(state.pinnedProjectIds, projectId, pinned),
        }));
      },
      setProjectArchived: (projectId, archived) => {
        set((state) => ({
          archivedProjectIds: withToggledId(state.archivedProjectIds, projectId, archived),
        }));
      },
      setThreadPinned: (threadId, pinned) => {
        set((state) => ({
          pinnedThreadIds: withToggledId(state.pinnedThreadIds, threadId, pinned),
        }));
      },
      setThreadArchived: (threadId, archived) => {
        set((state) => ({
          archivedThreadIds: withToggledId(state.archivedThreadIds, threadId, archived),
        }));
      },
      setProjectSortMode: (projectSortMode) => {
        set((state) => (state.projectSortMode === projectSortMode ? state : { projectSortMode }));
      },
      pruneMissing: ({ projectIds, threadIds }) => {
        set((state) => {
          const nextPinnedProjectIds = filterArchivedIds({
            ids: state.pinnedProjectIds,
            knownIds: projectIds,
          });
          const nextArchivedProjectIds = filterArchivedIds({
            ids: state.archivedProjectIds,
            knownIds: projectIds,
          });
          const nextPinnedThreadIds = filterArchivedIds({
            ids: state.pinnedThreadIds,
            knownIds: threadIds,
          });
          const nextArchivedThreadIds = filterArchivedIds({
            ids: state.archivedThreadIds,
            knownIds: threadIds,
          });

          if (
            nextPinnedProjectIds.size === state.pinnedProjectIds.size &&
            nextArchivedProjectIds.size === state.archivedProjectIds.size &&
            nextPinnedThreadIds.size === state.pinnedThreadIds.size &&
            nextArchivedThreadIds.size === state.archivedThreadIds.size
          ) {
            return state;
          }

          return {
            pinnedProjectIds: nextPinnedProjectIds,
            archivedProjectIds: nextArchivedProjectIds,
            pinnedThreadIds: nextPinnedThreadIds,
            archivedThreadIds: nextArchivedThreadIds,
          };
        });
      },
    }),
    {
      name: SIDEBAR_PREFERENCES_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedSidebarPreferencesState => ({
        pinnedProjectIds: [...state.pinnedProjectIds],
        archivedProjectIds: [...state.archivedProjectIds],
        pinnedThreadIds: [...state.pinnedThreadIds],
        archivedThreadIds: [...state.archivedThreadIds],
        projectSortMode: state.projectSortMode,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as PersistedSidebarPreferencesState | undefined) ?? {
          pinnedProjectIds: EMPTY_PROJECT_IDS,
          archivedProjectIds: EMPTY_PROJECT_IDS,
          pinnedThreadIds: EMPTY_THREAD_IDS,
          archivedThreadIds: EMPTY_THREAD_IDS,
          projectSortMode: "recent" as const,
        };

        return {
          ...currentState,
          pinnedProjectIds: new Set(persisted.pinnedProjectIds),
          archivedProjectIds: new Set(persisted.archivedProjectIds),
          pinnedThreadIds: new Set(persisted.pinnedThreadIds),
          archivedThreadIds: new Set(persisted.archivedThreadIds),
          projectSortMode: persisted.projectSortMode,
        } satisfies SidebarPreferencesState;
      },
    },
  ),
);
