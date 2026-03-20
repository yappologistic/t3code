import {
  ArrowLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  GitPullRequestIcon,
  PlusIcon,
  RocketIcon,
  SettingsIcon,
  SquarePenIcon,
  TerminalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  DndContext,
  type DragCancelEvent,
  type CollisionDetection,
  PointerSensor,
  type DragStartEvent,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  DEFAULT_MODEL_BY_PROVIDER,
  type DesktopUpdateState,
  ProjectId,
  ThreadId,
  type GitStatusResult,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useAppSettings } from "../appSettings";
import { getAppLanguageDetails, type AppLanguage } from "../appLanguage";
import { isElectron } from "../env";
import { APP_BASE_NAME, APP_VERSION } from "../branding";
import { resolveServerHttpUrl } from "../lib/serverUrl";
import { isMacPlatform, newCommandId, newProjectId } from "../lib/utils";
import { useStore } from "../store";
import { shortcutLabelForCommand } from "../keybindings";
import { derivePendingApprovals, derivePendingUserInputs } from "../session-logic";
import { gitRemoveWorktreeMutationOptions, gitStatusQueryOptions } from "../lib/gitReactQuery";
import { useNewThreadActions } from "../hooks/useNewThread";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import { readNativeApi } from "../nativeApi";
import { useComposerDraftStore } from "../composerDraftStore";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { toastManager } from "./ui/toast";
import {
  getArm64IntelBuildWarningDescription,
  getDesktopUpdateActionError,
  getDesktopUpdateButtonTooltip,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
  shouldShowArm64IntelBuildWarning,
  shouldHighlightDesktopUpdateError,
  shouldShowDesktopUpdateButton,
  shouldToastDesktopUpdateActionResult,
} from "./desktopUpdate.logic";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleContent } from "./ui/collapsible";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenuAction,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { formatWorktreePathForDisplay, getOrphanedWorktreePathForThread } from "../worktreeCleanup";
import { isNonEmpty as isNonEmptyString } from "effect/String";
import {
  resolveSidebarNewThreadEnvMode,
  resolveThreadRowClassName,
  resolveThreadStatusPill,
  shouldClearThreadSelectionOnMouseDown,
} from "./Sidebar.logic";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";

const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];
const THREAD_PREVIEW_LIMIT = 6;

function getSidebarCopy(language: AppLanguage) {
  if (language === "fa") {
    return {
      genericError: "خطایی رخ داد.",
      unexpectedError: "خطایی غیرمنتظره رخ داد.",
      linkOpeningUnavailable: "باز کردن پیوند در دسترس نیست.",
      unableToOpenPrLink: "باز کردن پیوند PR ممکن نشد",
      failedToAddProject: "افزودن پروژه انجام نشد",
      addProjectUnexpectedError: "هنگام افزودن پروژه خطایی رخ داد.",
      threadTitleCannotBeEmpty: "عنوان رشته نمی تواند خالی باشد",
      failedToRenameThread: "تغییر نام رشته انجام نشد",
      keepingOrphanedWorktree: "worktree یتیم حفظ شد",
      orphanedWorktreeKeptForSafety: (path: string) =>
        `CUT3 نتوانست بررسی کند که ${path} تغییرات ثبت نشده دارد یا نه، بنابراین worktree برای ایمنی حفظ می شود.`,
      orphanedWorktreeWithChangesPrompt: (path: string) =>
        [
          "این رشته تنها رشته متصل به این worktree است:",
          path,
          "",
          "این worktree تغییرات ثبت نشده دارد.",
          "می خواهید آن را هم حذف کنید و این تغییرات برای همیشه دور ریخته شود؟",
        ].join("\n"),
      orphanedWorktreePrompt: (path: string) =>
        ["این رشته تنها رشته متصل به این worktree است:", path, "", "این worktree هم حذف شود؟"].join(
          "\n",
        ),
      unknownWorktreeRemoveError: "خطای نامشخص در حذف worktree.",
      threadDeletedWorktreeRemovalFailed: "رشته حذف شد، اما حذف worktree انجام نشد",
      couldNotRemoveWorktree: (path: string, message: string) => `حذف ${path} ممکن نشد. ${message}`,
      threadIdCopied: "شناسه رشته کپی شد",
      failedToCopyThreadId: "کپی شناسه رشته انجام نشد",
      renameThread: "تغییر نام رشته",
      markUnread: "علامت گذاری به عنوان خوانده نشده",
      copyThreadId: "کپی شناسه رشته",
      delete: "حذف",
      deleteThreadPrompt: (title: string) => `رشته "${title}" حذف شود؟`,
      deleteThreadWarning: "این کار تاریخچه گفتگوی این رشته را برای همیشه پاک می کند.",
      deleteThreadsPrompt: (count: number) =>
        count === 1 ? "این رشته حذف شود؟" : `${count} رشته حذف شوند؟`,
      deleteThreadsWarning: "این کار تاریخچه گفتگوی این رشته ها را برای همیشه پاک می کند.",
      removeProject: "حذف پروژه",
      projectIsNotEmpty: "پروژه خالی نیست",
      deleteProjectThreadsFirst: "پیش از حذف پروژه، همه رشته های این پروژه را حذف کنید.",
      removeProjectPrompt: (name: string) => `پروژه "${name}" حذف شود؟`,
      unknownProjectRemoveError: "خطای نامشخص در حذف پروژه.",
      failedToRemoveProject: (name: string) => `حذف "${name}" انجام نشد`,
      versionLabel: "نسخه",
      intelBuildOnAppleSilicon: "نسخه اینتل روی Apple Silicon",
      downloadArmBuild: "دانلود نسخه ARM",
      installArmBuild: "نصب نسخه ARM",
      projects: "پروژه ها",
      addProject: "افزودن پروژه",
      pickingFolder: "در حال انتخاب پوشه...",
      browseForFolder: "انتخاب پوشه",
      adding: "در حال افزودن...",
      add: "افزودن",
      cancel: "لغو",
      noProjectsYet: "هنوز پروژه ای وجود ندارد",
      back: "بازگشت",
      settings: "تنظیمات",
      createNewThreadInProject: (name: string) => `ساخت رشته جدید در ${name}`,
      newThread: (shortcutLabel: string | null) =>
        shortcutLabel ? `رشته جدید (${shortcutLabel})` : "رشته جدید",
      showMore: "نمایش بیشتر",
      showLess: "نمایش کمتر",
      terminalProcessRunning: "پردازش ترمینال در حال اجرا",
      prOpen: "PR باز",
      prClosed: "PR بسته",
      prMerged: "PR ادغام شده",
      prOpenTooltip: (number: number, title: string) => `#${number} PR باز: ${title}`,
      prClosedTooltip: (number: number, title: string) => `#${number} PR بسته: ${title}`,
      prMergedTooltip: (number: number, title: string) => `#${number} PR ادغام شده: ${title}`,
      pendingApproval: "در انتظار تایید",
      awaitingInput: "در انتظار ورودی",
      working: "در حال کار",
      connecting: "در حال اتصال",
      completed: "تکمیل شد",
      planReady: "طرح آماده است",
      updateAvailable: "به روزرسانی در دسترس است",
      updateDownloaded: "به روزرسانی دانلود شد",
      restartToInstallUpdate: "برای نصب، برنامه را از دکمه به روزرسانی دوباره راه اندازی کنید.",
      couldNotDownloadUpdate: "دانلود به روزرسانی انجام نشد",
      couldNotStartUpdateDownload: "شروع دانلود به روزرسانی انجام نشد",
      couldNotInstallUpdate: "نصب به روزرسانی انجام نشد",
    };
  }

  return {
    genericError: "An error occurred.",
    unexpectedError: "An unexpected error occurred.",
    linkOpeningUnavailable: "Link opening is unavailable.",
    unableToOpenPrLink: "Unable to open PR link",
    failedToAddProject: "Failed to add project",
    addProjectUnexpectedError: "An error occurred while adding the project.",
    threadTitleCannotBeEmpty: "Thread title cannot be empty",
    failedToRenameThread: "Failed to rename thread",
    keepingOrphanedWorktree: "Keeping orphaned worktree",
    orphanedWorktreeKeptForSafety: (path: string) =>
      `CUT3 could not verify whether ${path} has uncommitted changes, so the worktree will be kept for safety.`,
    orphanedWorktreeWithChangesPrompt: (path: string) =>
      [
        "This thread is the only one linked to this worktree:",
        path,
        "",
        "This worktree has uncommitted changes.",
        "Delete it too and permanently discard those changes?",
      ].join("\n"),
    orphanedWorktreePrompt: (path: string) =>
      [
        "This thread is the only one linked to this worktree:",
        path,
        "",
        "Delete the worktree too?",
      ].join("\n"),
    unknownWorktreeRemoveError: "Unknown error removing worktree.",
    threadDeletedWorktreeRemovalFailed: "Thread deleted, but worktree removal failed",
    couldNotRemoveWorktree: (path: string, message: string) =>
      `Could not remove ${path}. ${message}`,
    threadIdCopied: "Thread ID copied",
    failedToCopyThreadId: "Failed to copy thread ID",
    renameThread: "Rename thread",
    markUnread: "Mark unread",
    copyThreadId: "Copy Thread ID",
    delete: "Delete",
    deleteThreadPrompt: (title: string) => `Delete thread "${title}"?`,
    deleteThreadWarning: "This permanently clears conversation history for this thread.",
    deleteThreadsPrompt: (count: number) => `Delete ${count} thread${count === 1 ? "" : "s"}?`,
    deleteThreadsWarning: "This permanently clears conversation history for these threads.",
    removeProject: "Remove project",
    projectIsNotEmpty: "Project is not empty",
    deleteProjectThreadsFirst: "Delete all threads in this project before removing it.",
    removeProjectPrompt: (name: string) => `Remove project "${name}"?`,
    unknownProjectRemoveError: "Unknown error removing project.",
    failedToRemoveProject: (name: string) => `Failed to remove "${name}"`,
    versionLabel: "Version",
    intelBuildOnAppleSilicon: "Intel build on Apple Silicon",
    downloadArmBuild: "Download ARM build",
    installArmBuild: "Install ARM build",
    projects: "Projects",
    addProject: "Add project",
    pickingFolder: "Picking folder...",
    browseForFolder: "Browse for folder",
    adding: "Adding...",
    add: "Add",
    cancel: "Cancel",
    noProjectsYet: "No projects yet",
    back: "Back",
    settings: "Settings",
    createNewThreadInProject: (name: string) => `Create new thread in ${name}`,
    newThread: (shortcutLabel: string | null) =>
      shortcutLabel ? `New thread (${shortcutLabel})` : "New thread",
    showMore: "Show more",
    showLess: "Show less",
    terminalProcessRunning: "Terminal process running",
    prOpen: "PR open",
    prClosed: "PR closed",
    prMerged: "PR merged",
    prOpenTooltip: (number: number, title: string) => `#${number} PR open: ${title}`,
    prClosedTooltip: (number: number, title: string) => `#${number} PR closed: ${title}`,
    prMergedTooltip: (number: number, title: string) => `#${number} PR merged: ${title}`,
    pendingApproval: "Pending Approval",
    awaitingInput: "Awaiting Input",
    working: "Working",
    connecting: "Connecting",
    completed: "Completed",
    planReady: "Plan Ready",
    updateAvailable: "Update available",
    updateDownloaded: "Update downloaded",
    restartToInstallUpdate: "Restart the app from the update button to install it.",
    couldNotDownloadUpdate: "Could not download update",
    couldNotStartUpdateDownload: "Could not start update download",
    couldNotInstallUpdate: "Could not install update",
  };
}

function formatRelativeTime(iso: string, language: AppLanguage): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return language === "fa" ? "همین الان" : "just now";

  const formatter = new Intl.RelativeTimeFormat(getAppLanguageDetails(language).locale, {
    numeric: "auto",
  });

  if (minutes < 60) return formatter.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  return formatter.format(-Math.floor(hours / 24), "day");
}

interface TerminalStatusIndicator {
  label: string;
  colorClass: string;
  pulse: boolean;
}

interface PrStatusIndicator {
  label: string;
  colorClass: string;
  tooltip: string;
  url: string;
}

type ThreadPr = GitStatusResult["pr"];

function terminalStatusFromRunningIds(
  runningTerminalIds: string[],
  language: AppLanguage,
): TerminalStatusIndicator | null {
  if (runningTerminalIds.length === 0) {
    return null;
  }
  const copy = getSidebarCopy(language);
  return {
    label: copy.terminalProcessRunning,
    colorClass: "text-teal-600 dark:text-teal-300/90",
    pulse: true,
  };
}

function prStatusIndicator(pr: ThreadPr, language: AppLanguage): PrStatusIndicator | null {
  if (!pr) return null;

  const copy = getSidebarCopy(language);

  if (pr.state === "open") {
    return {
      label: copy.prOpen,
      colorClass: "text-emerald-600 dark:text-emerald-300/90",
      tooltip: copy.prOpenTooltip(pr.number, pr.title),
      url: pr.url,
    };
  }
  if (pr.state === "closed") {
    return {
      label: copy.prClosed,
      colorClass: "text-zinc-500 dark:text-zinc-400/80",
      tooltip: copy.prClosedTooltip(pr.number, pr.title),
      url: pr.url,
    };
  }
  if (pr.state === "merged") {
    return {
      label: copy.prMerged,
      colorClass: "text-violet-600 dark:text-violet-300/90",
      tooltip: copy.prMergedTooltip(pr.number, pr.title),
      url: pr.url,
    };
  }
  return null;
}

function localizeThreadStatusLabel(label: string, language: AppLanguage): string {
  const copy = getSidebarCopy(language);
  switch (label) {
    case "Pending Approval":
      return copy.pendingApproval;
    case "Awaiting Input":
      return copy.awaitingInput;
    case "Working":
      return copy.working;
    case "Connecting":
      return copy.connecting;
    case "Completed":
      return copy.completed;
    case "Plan Ready":
      return copy.planReady;
    default:
      return label;
  }
}

function BrandMark() {
  return <img src="/icon.png" alt="" className="size-5 shrink-0 rounded-md" />;
}

function ProjectFavicon({ cwd }: { cwd: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  const src = resolveServerHttpUrl(`/api/project-favicon?cwd=${encodeURIComponent(cwd)}`);

  if (status === "error") {
    return <FolderIcon className="size-3.5 shrink-0 text-sidebar-foreground/70" />;
  }

  return (
    <img
      src={src}
      alt=""
      className={`size-3.5 shrink-0 rounded-sm object-contain ${status === "loading" ? "hidden" : ""}`}
      onLoad={() => setStatus("loaded")}
      onError={() => setStatus("error")}
    />
  );
}

type SortableProjectHandleProps = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners">;

function SortableProjectItem({
  projectId,
  children,
}: {
  projectId: ProjectId;
  children: (handleProps: SortableProjectHandleProps) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id: projectId });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={`group/menu-item relative rounded-md ${
        isDragging ? "z-20 opacity-80" : ""
      } ${isOver && !isDragging ? "ring-1 ring-primary/40" : ""}`}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
    >
      {children({ attributes, listeners })}
    </li>
  );
}

export default function Sidebar() {
  const { isMobile, setOpenMobile } = useSidebar();
  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);
  const markThreadUnread = useStore((store) => store.markThreadUnread);
  const toggleProject = useStore((store) => store.toggleProject);
  const reorderProjects = useStore((store) => store.reorderProjects);
  const clearComposerDraftForThread = useComposerDraftStore((store) => store.clearThreadDraft);
  const getDraftThreadByProjectId = useComposerDraftStore(
    (store) => store.getDraftThreadByProjectId,
  );
  const terminalStateByThreadId = useTerminalStateStore((state) => state.terminalStateByThreadId);
  const clearTerminalState = useTerminalStateStore((state) => state.clearTerminalState);
  const clearProjectDraftThreadId = useComposerDraftStore(
    (store) => store.clearProjectDraftThreadId,
  );
  const clearProjectDraftThreadById = useComposerDraftStore(
    (store) => store.clearProjectDraftThreadById,
  );
  const { openNewThread } = useNewThreadActions();
  const navigate = useNavigate();
  const isOnSettings = useLocation({ select: (loc) => loc.pathname === "/settings" });
  const { settings: appSettings } = useAppSettings();
  const sidebarCopy = useMemo(() => getSidebarCopy(appSettings.language), [appSettings.language]);
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const { data: keybindings = EMPTY_KEYBINDINGS } = useQuery({
    ...serverConfigQueryOptions(),
    select: (config) => config.keybindings,
  });
  const queryClient = useQueryClient();
  const removeWorktreeMutation = useMutation(gitRemoveWorktreeMutationOptions({ queryClient }));
  const [addingProject, setAddingProject] = useState(false);
  const [newCwd, setNewCwd] = useState("");
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [addProjectError, setAddProjectError] = useState<string | null>(null);
  const addProjectInputRef = useRef<HTMLInputElement | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<ThreadId | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [expandedThreadListsByProject, setExpandedThreadListsByProject] = useState<
    ReadonlySet<ProjectId>
  >(() => new Set());
  const renamingCommittedRef = useRef(false);
  const renamingInputRef = useRef<HTMLInputElement | null>(null);
  const dragInProgressRef = useRef(false);
  const suppressProjectClickAfterDragRef = useRef(false);
  const [desktopUpdateState, setDesktopUpdateState] = useState<DesktopUpdateState | null>(null);
  const selectedThreadIds = useThreadSelectionStore((s) => s.selectedThreadIds);
  const toggleThreadSelection = useThreadSelectionStore((s) => s.toggleThread);
  const rangeSelectTo = useThreadSelectionStore((s) => s.rangeSelectTo);
  const clearSelection = useThreadSelectionStore((s) => s.clearSelection);
  const removeFromSelection = useThreadSelectionStore((s) => s.removeFromSelection);
  const setSelectionAnchor = useThreadSelectionStore((s) => s.setAnchor);
  const shouldBrowseForProjectImmediately = isElectron;
  const shouldShowProjectPathEntry = addingProject && !shouldBrowseForProjectImmediately;
  const projectCwdById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.cwd] as const)),
    [projects],
  );
  const navigateToThread = useCallback(
    (threadId: ThreadId) => {
      if (isMobile) {
        setOpenMobile(false);
      }
      void navigate({
        to: "/$threadId",
        params: { threadId },
      });
    },
    [isMobile, navigate, setOpenMobile],
  );
  const threadGitTargets = useMemo(
    () =>
      threads.map((thread) => ({
        threadId: thread.id,
        branch: thread.branch,
        cwd: thread.worktreePath ?? projectCwdById.get(thread.projectId) ?? null,
      })),
    [projectCwdById, threads],
  );
  const threadGitStatusCwds = useMemo(
    () => [
      ...new Set(
        threadGitTargets
          .filter((target) => target.branch !== null)
          .map((target) => target.cwd)
          .filter((cwd): cwd is string => cwd !== null),
      ),
    ],
    [threadGitTargets],
  );
  const threadGitStatusQueries = useQueries({
    queries: threadGitStatusCwds.map((cwd) => ({
      ...gitStatusQueryOptions(cwd),
      staleTime: 30_000,
      refetchInterval: 60_000,
    })),
  });
  const prByThreadId = useMemo(() => {
    const statusByCwd = new Map<string, GitStatusResult>();
    for (let index = 0; index < threadGitStatusCwds.length; index += 1) {
      const cwd = threadGitStatusCwds[index];
      if (!cwd) continue;
      const status = threadGitStatusQueries[index]?.data;
      if (status) {
        statusByCwd.set(cwd, status);
      }
    }

    const map = new Map<ThreadId, ThreadPr>();
    for (const target of threadGitTargets) {
      const status = target.cwd ? statusByCwd.get(target.cwd) : undefined;
      const branchMatches =
        target.branch !== null && status?.branch !== null && status?.branch === target.branch;
      map.set(target.threadId, branchMatches ? (status?.pr ?? null) : null);
    }
    return map;
  }, [threadGitStatusCwds, threadGitStatusQueries, threadGitTargets]);

  const openPrLink = useCallback(
    (event: React.MouseEvent<HTMLElement>, prUrl: string) => {
      event.preventDefault();
      event.stopPropagation();

      const api = readNativeApi();
      if (!api) {
        toastManager.add({
          type: "error",
          title: sidebarCopy.linkOpeningUnavailable,
        });
        return;
      }

      void api.shell.openExternal(prUrl).catch((error) => {
        toastManager.add({
          type: "error",
          title: sidebarCopy.unableToOpenPrLink,
          description: error instanceof Error ? error.message : sidebarCopy.genericError,
        });
      });
    },
    [sidebarCopy.genericError, sidebarCopy.linkOpeningUnavailable, sidebarCopy.unableToOpenPrLink],
  );

  const focusMostRecentThreadForProject = useCallback(
    (projectId: ProjectId) => {
      const latestThread = threads
        .filter((thread) => thread.projectId === projectId)
        .toSorted((a, b) => {
          const byDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          if (byDate !== 0) return byDate;
          return b.id.localeCompare(a.id);
        })[0];
      if (!latestThread) return;

      navigateToThread(latestThread.id);
    },
    [navigateToThread, threads],
  );

  const addProjectFromPath = useCallback(
    async (rawCwd: string) => {
      const cwd = rawCwd.trim();
      if (!cwd || isAddingProject) return;
      const api = readNativeApi();
      if (!api) return;

      setIsAddingProject(true);
      const finishAddingProject = () => {
        setIsAddingProject(false);
        setNewCwd("");
        setAddProjectError(null);
        setAddingProject(false);
      };

      try {
        const existing = projects.find((project) => project.cwd === cwd);
        if (existing) {
          focusMostRecentThreadForProject(existing.id);
          finishAddingProject();
          return;
        }

        const projectId = newProjectId();
        const createdAt = new Date().toISOString();
        const title = cwd.split(/[/\\]/).findLast(isNonEmptyString) ?? cwd;
        await api.orchestration.dispatchCommand({
          type: "project.create",
          commandId: newCommandId(),
          projectId,
          title,
          workspaceRoot: cwd,
          defaultModel: DEFAULT_MODEL_BY_PROVIDER.codex,
          createdAt,
        });
        await openNewThread(projectId, {
          envMode: appSettings.defaultThreadEnvMode,
        }).catch(() => undefined);
      } catch (error) {
        const description =
          error instanceof Error ? error.message : sidebarCopy.addProjectUnexpectedError;
        setIsAddingProject(false);
        if (shouldBrowseForProjectImmediately) {
          toastManager.add({
            type: "error",
            title: sidebarCopy.failedToAddProject,
            description,
          });
        } else {
          setAddProjectError(description);
        }
        return;
      }
      finishAddingProject();
    },
    [
      focusMostRecentThreadForProject,
      isAddingProject,
      openNewThread,
      projects,
      shouldBrowseForProjectImmediately,
      appSettings.defaultThreadEnvMode,
      sidebarCopy.addProjectUnexpectedError,
      sidebarCopy.failedToAddProject,
    ],
  );

  const handleAddProject = () => {
    void addProjectFromPath(newCwd);
  };

  const canAddProject = newCwd.trim().length > 0 && !isAddingProject;

  const handlePickFolder = async () => {
    const api = readNativeApi();
    if (!api || isPickingFolder) return;
    setIsPickingFolder(true);
    let pickedPath: string | null = null;
    try {
      pickedPath = await api.dialogs.pickFolder();
    } catch {
      // Ignore picker failures and leave the current thread selection unchanged.
    }
    if (pickedPath) {
      await addProjectFromPath(pickedPath);
    } else if (!shouldBrowseForProjectImmediately) {
      addProjectInputRef.current?.focus();
    }
    setIsPickingFolder(false);
  };

  const handleStartAddProject = () => {
    setAddProjectError(null);
    if (shouldBrowseForProjectImmediately) {
      void handlePickFolder();
      return;
    }
    setAddingProject((prev) => !prev);
  };

  const cancelRename = useCallback(() => {
    setRenamingThreadId(null);
    renamingInputRef.current = null;
  }, []);

  const commitRename = useCallback(
    async (threadId: ThreadId, newTitle: string, originalTitle: string) => {
      const finishRename = () => {
        setRenamingThreadId((current) => {
          if (current !== threadId) return current;
          renamingInputRef.current = null;
          return null;
        });
      };

      const trimmed = newTitle.trim();
      if (trimmed.length === 0) {
        toastManager.add({ type: "warning", title: sidebarCopy.threadTitleCannotBeEmpty });
        finishRename();
        return;
      }
      if (trimmed === originalTitle) {
        finishRename();
        return;
      }
      const api = readNativeApi();
      if (!api) {
        finishRename();
        return;
      }
      try {
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId,
          title: trimmed,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: sidebarCopy.failedToRenameThread,
          description: error instanceof Error ? error.message : sidebarCopy.genericError,
        });
      }
      finishRename();
    },
    [
      sidebarCopy.failedToRenameThread,
      sidebarCopy.genericError,
      sidebarCopy.threadTitleCannotBeEmpty,
    ],
  );

  /**
   * Delete a single thread: stop session, close terminal, dispatch delete,
   * clean up drafts/state, and optionally remove orphaned worktree.
   * Callers handle thread-level confirmation; this still prompts for worktree removal.
   */
  const deleteThread = useCallback(
    async (
      threadId: ThreadId,
      opts: { deletedThreadIds?: ReadonlySet<ThreadId> } = {},
    ): Promise<void> => {
      const api = readNativeApi();
      if (!api) return;
      const thread = threads.find((t) => t.id === threadId);
      if (!thread) return;

      const threadProject = projects.find((project) => project.id === thread.projectId);
      // When bulk-deleting, exclude the other threads being deleted so
      // getOrphanedWorktreePathForThread correctly detects that no surviving
      // threads will reference this worktree.
      const deletedIds = opts.deletedThreadIds;
      const survivingThreads =
        deletedIds && deletedIds.size > 0
          ? threads.filter((t) => t.id === threadId || !deletedIds.has(t.id))
          : threads;
      const orphanedWorktreePath = getOrphanedWorktreePathForThread(survivingThreads, threadId);
      const displayWorktreePath = orphanedWorktreePath
        ? formatWorktreePathForDisplay(orphanedWorktreePath)
        : null;
      const canDeleteWorktree = orphanedWorktreePath !== null && threadProject !== undefined;
      let shouldDeleteWorktree = false;
      let worktreeRemovalForce = false;

      if (canDeleteWorktree && orphanedWorktreePath && threadProject) {
        try {
          const worktreeStatus = await queryClient.fetchQuery({
            ...gitStatusQueryOptions(orphanedWorktreePath),
            staleTime: 0,
          });
          const hasWorkingTreeChanges = worktreeStatus.hasWorkingTreeChanges;

          shouldDeleteWorktree = await api.dialogs.confirm(
            hasWorkingTreeChanges
              ? sidebarCopy.orphanedWorktreeWithChangesPrompt(
                  displayWorktreePath ?? orphanedWorktreePath,
                )
              : sidebarCopy.orphanedWorktreePrompt(displayWorktreePath ?? orphanedWorktreePath),
          );
          worktreeRemovalForce = hasWorkingTreeChanges;
        } catch (error) {
          console.warn("Skipping orphaned worktree removal after thread deletion", {
            threadId,
            projectCwd: threadProject.cwd,
            worktreePath: orphanedWorktreePath,
            error,
          });
          toastManager.add({
            type: "info",
            title: sidebarCopy.keepingOrphanedWorktree,
            description: sidebarCopy.orphanedWorktreeKeptForSafety(
              displayWorktreePath ?? orphanedWorktreePath,
            ),
          });
        }
      }

      if (thread.session && thread.session.status !== "closed") {
        await api.orchestration
          .dispatchCommand({
            type: "thread.session.stop",
            commandId: newCommandId(),
            threadId,
            createdAt: new Date().toISOString(),
          })
          .catch(() => undefined);
      }

      const allDeletedIds = deletedIds ?? new Set<ThreadId>();
      const shouldNavigateToFallback = routeThreadId === threadId;
      const fallbackThreadId =
        threads.find((entry) => entry.id !== threadId && !allDeletedIds.has(entry.id))?.id ?? null;
      await api.orchestration.dispatchCommand({
        type: "thread.delete",
        commandId: newCommandId(),
        threadId,
      });
      try {
        await api.terminal.close({ threadId, deleteHistory: true });
      } catch {
        // Terminal may already be closed
      }
      clearComposerDraftForThread(threadId);
      clearProjectDraftThreadById(thread.projectId, thread.id);
      clearTerminalState(threadId);
      if (shouldNavigateToFallback) {
        if (fallbackThreadId) {
          void navigate({
            to: "/$threadId",
            params: { threadId: fallbackThreadId },
            replace: true,
          });
        } else {
          void navigate({ to: "/", replace: true });
        }
      }

      if (!shouldDeleteWorktree || !orphanedWorktreePath || !threadProject) {
        return;
      }

      try {
        await removeWorktreeMutation.mutateAsync({
          cwd: threadProject.cwd,
          path: orphanedWorktreePath,
          force: worktreeRemovalForce,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : sidebarCopy.unknownWorktreeRemoveError;
        console.error("Failed to remove orphaned worktree after thread deletion", {
          threadId,
          projectCwd: threadProject.cwd,
          worktreePath: orphanedWorktreePath,
          error,
        });
        toastManager.add({
          type: "error",
          title: sidebarCopy.threadDeletedWorktreeRemovalFailed,
          description: sidebarCopy.couldNotRemoveWorktree(
            displayWorktreePath ?? orphanedWorktreePath,
            message,
          ),
        });
      }
    },
    [
      clearComposerDraftForThread,
      clearProjectDraftThreadById,
      clearTerminalState,
      navigate,
      projects,
      queryClient,
      removeWorktreeMutation,
      routeThreadId,
      sidebarCopy,
      threads,
    ],
  );

  const { copyToClipboard } = useCopyToClipboard<{ threadId: ThreadId }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: sidebarCopy.threadIdCopied,
        description: ctx.threadId,
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: sidebarCopy.failedToCopyThreadId,
        description: error instanceof Error ? error.message : sidebarCopy.genericError,
      });
    },
  });
  const handleThreadContextMenu = useCallback(
    async (threadId: ThreadId, position: { x: number; y: number }) => {
      const api = readNativeApi();
      if (!api) return;
      const clicked = await api.contextMenu.show(
        [
          { id: "rename", label: sidebarCopy.renameThread },
          { id: "mark-unread", label: sidebarCopy.markUnread },
          { id: "copy-thread-id", label: sidebarCopy.copyThreadId },
          { id: "delete", label: sidebarCopy.delete, destructive: true },
        ],
        position,
      );
      const thread = threads.find((t) => t.id === threadId);
      if (!thread) return;

      if (clicked === "rename") {
        setRenamingThreadId(threadId);
        setRenamingTitle(thread.title);
        renamingCommittedRef.current = false;
        return;
      }

      if (clicked === "mark-unread") {
        markThreadUnread(threadId);
        return;
      }
      if (clicked === "copy-thread-id") {
        copyToClipboard(threadId, { threadId });
        return;
      }
      if (clicked !== "delete") return;
      if (appSettings.confirmThreadDelete) {
        const confirmed = await api.dialogs.confirm(
          [sidebarCopy.deleteThreadPrompt(thread.title), sidebarCopy.deleteThreadWarning].join(
            "\n",
          ),
        );
        if (!confirmed) {
          return;
        }
      }
      await deleteThread(threadId);
    },
    [
      appSettings.confirmThreadDelete,
      copyToClipboard,
      deleteThread,
      markThreadUnread,
      sidebarCopy,
      threads,
    ],
  );

  const handleMultiSelectContextMenu = useCallback(
    async (position: { x: number; y: number }) => {
      const api = readNativeApi();
      if (!api) return;
      const ids = [...selectedThreadIds];
      if (ids.length === 0) return;
      const count = ids.length;

      const clicked = await api.contextMenu.show(
        [
          { id: "mark-unread", label: `${sidebarCopy.markUnread} (${count})` },
          { id: "delete", label: `${sidebarCopy.delete} (${count})`, destructive: true },
        ],
        position,
      );

      if (clicked === "mark-unread") {
        for (const id of ids) {
          markThreadUnread(id);
        }
        clearSelection();
        return;
      }

      if (clicked !== "delete") return;

      if (appSettings.confirmThreadDelete) {
        const confirmed = await api.dialogs.confirm(
          [sidebarCopy.deleteThreadsPrompt(count), sidebarCopy.deleteThreadsWarning].join("\n"),
        );
        if (!confirmed) return;
      }

      const deletedIds = new Set<ThreadId>(ids);
      for (const id of ids) {
        await deleteThread(id, { deletedThreadIds: deletedIds });
      }
      removeFromSelection(ids);
    },
    [
      appSettings.confirmThreadDelete,
      clearSelection,
      deleteThread,
      markThreadUnread,
      removeFromSelection,
      sidebarCopy,
      selectedThreadIds,
    ],
  );

  const handleThreadClick = useCallback(
    (event: MouseEvent, threadId: ThreadId, orderedProjectThreadIds: readonly ThreadId[]) => {
      const isMac = isMacPlatform(navigator.platform);
      const isModClick = isMac ? event.metaKey : event.ctrlKey;
      const isShiftClick = event.shiftKey;

      if (isModClick) {
        event.preventDefault();
        toggleThreadSelection(threadId);
        return;
      }

      if (isShiftClick) {
        event.preventDefault();
        rangeSelectTo(threadId, orderedProjectThreadIds);
        return;
      }

      // Plain click — clear selection, set anchor for future shift-clicks, and navigate
      if (selectedThreadIds.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(threadId);
      navigateToThread(threadId);
    },
    [
      clearSelection,
      navigateToThread,
      rangeSelectTo,
      selectedThreadIds.size,
      setSelectionAnchor,
      toggleThreadSelection,
    ],
  );

  const handleProjectContextMenu = useCallback(
    async (projectId: ProjectId, position: { x: number; y: number }) => {
      const api = readNativeApi();
      if (!api) return;
      const clicked = await api.contextMenu.show(
        [{ id: "delete", label: sidebarCopy.removeProject, destructive: true }],
        position,
      );
      if (clicked !== "delete") return;

      const project = projects.find((entry) => entry.id === projectId);
      if (!project) return;

      const projectThreads = threads.filter((thread) => thread.projectId === projectId);
      if (projectThreads.length > 0) {
        toastManager.add({
          type: "warning",
          title: sidebarCopy.projectIsNotEmpty,
          description: sidebarCopy.deleteProjectThreadsFirst,
        });
        return;
      }

      const confirmed = await api.dialogs.confirm(sidebarCopy.removeProjectPrompt(project.name));
      if (!confirmed) return;

      try {
        const projectDraftThread = getDraftThreadByProjectId(projectId);
        if (projectDraftThread) {
          clearComposerDraftForThread(projectDraftThread.threadId);
        }
        clearProjectDraftThreadId(projectId);
        await api.orchestration.dispatchCommand({
          type: "project.delete",
          commandId: newCommandId(),
          projectId,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : sidebarCopy.unknownProjectRemoveError;
        console.error("Failed to remove project", { projectId, error });
        toastManager.add({
          type: "error",
          title: sidebarCopy.failedToRemoveProject(project.name),
          description: message,
        });
      }
    },
    [
      clearComposerDraftForThread,
      clearProjectDraftThreadId,
      getDraftThreadByProjectId,
      projects,
      sidebarCopy,
      threads,
    ],
  );

  const projectDnDSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const projectCollisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }

    return closestCorners(args);
  }, []);

  const handleProjectDragEnd = useCallback(
    (event: DragEndEvent) => {
      dragInProgressRef.current = false;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeProject = projects.find((project) => project.id === active.id);
      const overProject = projects.find((project) => project.id === over.id);
      if (!activeProject || !overProject) return;
      reorderProjects(activeProject.id, overProject.id);
    },
    [projects, reorderProjects],
  );

  const handleProjectDragStart = useCallback((_event: DragStartEvent) => {
    dragInProgressRef.current = true;
    suppressProjectClickAfterDragRef.current = true;
  }, []);

  const handleProjectDragCancel = useCallback((_event: DragCancelEvent) => {
    dragInProgressRef.current = false;
  }, []);

  const handleProjectTitlePointerDownCapture = useCallback(() => {
    suppressProjectClickAfterDragRef.current = false;
  }, []);

  const handleProjectTitleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, projectId: ProjectId) => {
      if (dragInProgressRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (suppressProjectClickAfterDragRef.current) {
        // Consume the synthetic click emitted after a drag release.
        suppressProjectClickAfterDragRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (selectedThreadIds.size > 0) {
        clearSelection();
      }
      toggleProject(projectId);
    },
    [clearSelection, selectedThreadIds.size, toggleProject],
  );

  const handleProjectTitleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, projectId: ProjectId) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (dragInProgressRef.current) {
        return;
      }
      toggleProject(projectId);
    },
    [toggleProject],
  );

  useEffect(() => {
    const onMouseDown = (event: globalThis.MouseEvent) => {
      if (selectedThreadIds.size === 0) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!shouldClearThreadSelectionOnMouseDown(target)) return;
      clearSelection();
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [clearSelection, selectedThreadIds.size]);

  useEffect(() => {
    if (!isElectron) return;
    const bridge = window.desktopBridge;
    if (
      !bridge ||
      typeof bridge.getUpdateState !== "function" ||
      typeof bridge.onUpdateState !== "function"
    ) {
      return;
    }

    let disposed = false;
    let receivedSubscriptionUpdate = false;
    const unsubscribe = bridge.onUpdateState((nextState) => {
      if (disposed) return;
      receivedSubscriptionUpdate = true;
      setDesktopUpdateState(nextState);
    });

    void bridge
      .getUpdateState()
      .then((nextState) => {
        if (disposed || receivedSubscriptionUpdate) return;
        setDesktopUpdateState(nextState);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const showDesktopUpdateButton = isElectron && shouldShowDesktopUpdateButton(desktopUpdateState);

  const desktopUpdateTooltip = desktopUpdateState
    ? getDesktopUpdateButtonTooltip(desktopUpdateState, appSettings.language)
    : sidebarCopy.updateAvailable;

  const desktopUpdateButtonDisabled = isDesktopUpdateButtonDisabled(desktopUpdateState);
  const desktopUpdateButtonAction = desktopUpdateState
    ? resolveDesktopUpdateButtonAction(desktopUpdateState)
    : "none";
  const showArm64IntelBuildWarning =
    isElectron && shouldShowArm64IntelBuildWarning(desktopUpdateState);
  const arm64IntelBuildWarningDescription =
    desktopUpdateState && showArm64IntelBuildWarning
      ? getArm64IntelBuildWarningDescription(desktopUpdateState, appSettings.language)
      : null;
  const desktopUpdateButtonInteractivityClasses = desktopUpdateButtonDisabled
    ? "cursor-not-allowed opacity-60"
    : "hover:bg-accent hover:text-foreground";
  const desktopUpdateButtonClasses =
    desktopUpdateState?.status === "downloaded"
      ? "text-emerald-500"
      : desktopUpdateState?.status === "downloading"
        ? "text-sky-400"
        : shouldHighlightDesktopUpdateError(desktopUpdateState)
          ? "text-rose-500 animate-pulse"
          : "text-amber-500 animate-pulse";
  const newThreadShortcutLabel = useMemo(
    () =>
      shortcutLabelForCommand(keybindings, "chat.newLocal") ??
      shortcutLabelForCommand(keybindings, "chat.new"),
    [keybindings],
  );

  const handleDesktopUpdateButtonClick = useCallback(() => {
    const bridge = window.desktopBridge;
    if (!bridge || !desktopUpdateState) return;
    if (desktopUpdateButtonDisabled || desktopUpdateButtonAction === "none") return;

    if (desktopUpdateButtonAction === "download") {
      void bridge
        .downloadUpdate()
        .then((result) => {
          if (result.completed) {
            toastManager.add({
              type: "success",
              title: sidebarCopy.updateDownloaded,
              description: sidebarCopy.restartToInstallUpdate,
            });
          }
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add({
            type: "error",
            title: sidebarCopy.couldNotDownloadUpdate,
            description: actionError,
          });
        })
        .catch((error) => {
          toastManager.add({
            type: "error",
            title: sidebarCopy.couldNotStartUpdateDownload,
            description: error instanceof Error ? error.message : sidebarCopy.unexpectedError,
          });
        });
      return;
    }

    if (desktopUpdateButtonAction === "install") {
      void bridge
        .installUpdate()
        .then((result) => {
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add({
            type: "error",
            title: sidebarCopy.couldNotInstallUpdate,
            description: actionError,
          });
        })
        .catch((error) => {
          toastManager.add({
            type: "error",
            title: sidebarCopy.couldNotInstallUpdate,
            description: error instanceof Error ? error.message : sidebarCopy.unexpectedError,
          });
        });
    }
  }, [
    desktopUpdateButtonAction,
    desktopUpdateButtonDisabled,
    desktopUpdateState,
    sidebarCopy.couldNotDownloadUpdate,
    sidebarCopy.couldNotInstallUpdate,
    sidebarCopy.couldNotStartUpdateDownload,
    sidebarCopy.restartToInstallUpdate,
    sidebarCopy.unexpectedError,
    sidebarCopy.updateDownloaded,
  ]);

  const expandThreadListForProject = useCallback((projectId: ProjectId) => {
    setExpandedThreadListsByProject((current) => {
      if (current.has(projectId)) return current;
      const next = new Set(current);
      next.add(projectId);
      return next;
    });
  }, []);

  const collapseThreadListForProject = useCallback((projectId: ProjectId) => {
    setExpandedThreadListsByProject((current) => {
      if (!current.has(projectId)) return current;
      const next = new Set(current);
      next.delete(projectId);
      return next;
    });
  }, []);

  const wordmark = (
    <div className="flex items-center gap-2">
      <SidebarTrigger className="shrink-0 md:hidden" />
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="flex min-w-0 flex-1 items-center gap-1 ml-1 cursor-pointer">
              <BrandMark />
              <span className="truncate text-sm font-medium tracking-tight text-muted-foreground">
                {APP_BASE_NAME}
              </span>
            </div>
          }
        />
        <TooltipPopup side="bottom" sideOffset={2}>
          {sidebarCopy.versionLabel} {APP_VERSION}
        </TooltipPopup>
      </Tooltip>
    </div>
  );

  return (
    <>
      {isElectron ? (
        <>
          <SidebarHeader className="drag-region h-[52px] flex-row items-center gap-2 px-4 py-0 pl-[90px]">
            {wordmark}
            {showDesktopUpdateButton && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={desktopUpdateTooltip}
                      aria-disabled={desktopUpdateButtonDisabled || undefined}
                      disabled={desktopUpdateButtonDisabled}
                      className={`inline-flex size-7 ml-auto mt-1.5 items-center justify-center rounded-md text-muted-foreground transition-colors ${desktopUpdateButtonInteractivityClasses} ${desktopUpdateButtonClasses}`}
                      onClick={handleDesktopUpdateButtonClick}
                    >
                      <RocketIcon className="size-3.5" />
                    </button>
                  }
                />
                <TooltipPopup side="bottom">{desktopUpdateTooltip}</TooltipPopup>
              </Tooltip>
            )}
          </SidebarHeader>
        </>
      ) : (
        <SidebarHeader className="gap-3 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-3">
          {wordmark}
        </SidebarHeader>
      )}

      <SidebarContent className="gap-0">
        {showArm64IntelBuildWarning && arm64IntelBuildWarningDescription ? (
          <SidebarGroup className="px-2 pt-2 pb-0">
            <Alert variant="warning" className="rounded-2xl border-warning/40 bg-warning/8">
              <TriangleAlertIcon />
              <AlertTitle>{sidebarCopy.intelBuildOnAppleSilicon}</AlertTitle>
              <AlertDescription>{arm64IntelBuildWarningDescription}</AlertDescription>
              {desktopUpdateButtonAction !== "none" ? (
                <AlertAction>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={desktopUpdateButtonDisabled}
                    onClick={handleDesktopUpdateButtonClick}
                  >
                    {desktopUpdateButtonAction === "download"
                      ? sidebarCopy.downloadArmBuild
                      : sidebarCopy.installArmBuild}
                  </Button>
                </AlertAction>
              ) : null}
            </Alert>
          </SidebarGroup>
        ) : null}
        <SidebarGroup className="px-2 py-2">
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {sidebarCopy.projects}
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={sidebarCopy.addProject}
                    aria-pressed={shouldShowProjectPathEntry}
                    className="inline-flex size-5 items-center justify-center rounded-md text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    onClick={handleStartAddProject}
                  />
                }
              >
                <PlusIcon
                  className={`size-3.5 transition-transform duration-150 ${
                    shouldShowProjectPathEntry ? "rotate-45" : "rotate-0"
                  }`}
                />
              </TooltipTrigger>
              <TooltipPopup side="right">{sidebarCopy.addProject}</TooltipPopup>
            </Tooltip>
          </div>

          {shouldShowProjectPathEntry && (
            <div className="mb-2 px-1">
              {isElectron && (
                <button
                  type="button"
                  className="mb-1.5 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary py-1.5 text-xs text-foreground/80 transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handlePickFolder()}
                  disabled={isPickingFolder || isAddingProject}
                >
                  <FolderIcon className="size-3.5" />
                  {isPickingFolder ? sidebarCopy.pickingFolder : sidebarCopy.browseForFolder}
                </button>
              )}
              <div className="flex gap-1.5">
                <input
                  ref={addProjectInputRef}
                  className={`min-w-0 flex-1 rounded-md border bg-secondary px-2 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none ${
                    addProjectError
                      ? "border-red-500/70 focus:border-red-500"
                      : "border-border focus:border-ring"
                  }`}
                  placeholder="/path/to/project"
                  value={newCwd}
                  onChange={(event) => {
                    setNewCwd(event.target.value);
                    setAddProjectError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleAddProject();
                    if (event.key === "Escape") {
                      setAddingProject(false);
                      setAddProjectError(null);
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:opacity-60"
                  onClick={handleAddProject}
                  disabled={!canAddProject}
                >
                  {isAddingProject ? sidebarCopy.adding : sidebarCopy.add}
                </button>
              </div>
              {addProjectError && (
                <p className="mt-1 px-0.5 text-[11px] leading-tight text-red-400">
                  {addProjectError}
                </p>
              )}
              <div className="mt-1.5 px-0.5">
                <button
                  type="button"
                  className="text-[11px] text-sidebar-foreground/75 transition-colors hover:text-sidebar-foreground"
                  onClick={() => {
                    setAddingProject(false);
                    setAddProjectError(null);
                  }}
                >
                  {sidebarCopy.cancel}
                </button>
              </div>
            </div>
          )}

          <DndContext
            sensors={projectDnDSensors}
            collisionDetection={projectCollisionDetection}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragStart={handleProjectDragStart}
            onDragEnd={handleProjectDragEnd}
            onDragCancel={handleProjectDragCancel}
          >
            <SidebarMenu>
              <SortableContext
                items={projects.map((project) => project.id)}
                strategy={verticalListSortingStrategy}
              >
                {projects.map((project) => {
                  const projectThreads = threads
                    .filter((thread) => thread.projectId === project.id)
                    .toSorted((a, b) => {
                      const byDate =
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                      if (byDate !== 0) return byDate;
                      return b.id.localeCompare(a.id);
                    });
                  const isThreadListExpanded = expandedThreadListsByProject.has(project.id);
                  const hasHiddenThreads = projectThreads.length > THREAD_PREVIEW_LIMIT;
                  const visibleThreads =
                    hasHiddenThreads && !isThreadListExpanded
                      ? projectThreads.slice(0, THREAD_PREVIEW_LIMIT)
                      : projectThreads;
                  const orderedProjectThreadIds = projectThreads.map((t) => t.id);

                  return (
                    <SortableProjectItem key={project.id} projectId={project.id}>
                      {(dragHandleProps) => (
                        <Collapsible className="group/collapsible" open={project.expanded}>
                          <div className="group/project-header relative">
                            <SidebarMenuButton
                              size="sm"
                              className="gap-2 px-2 py-1.5 text-left cursor-grab active:cursor-grabbing hover:bg-accent group-hover/project-header:bg-accent group-hover/project-header:text-sidebar-accent-foreground"
                              {...dragHandleProps.attributes}
                              {...dragHandleProps.listeners}
                              onPointerDownCapture={handleProjectTitlePointerDownCapture}
                              onClick={(event) => handleProjectTitleClick(event, project.id)}
                              onKeyDown={(event) => handleProjectTitleKeyDown(event, project.id)}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                void handleProjectContextMenu(project.id, {
                                  x: event.clientX,
                                  y: event.clientY,
                                });
                              }}
                            >
                              <ChevronRightIcon
                                className={`-ml-0.5 size-3.5 shrink-0 text-sidebar-foreground/80 transition-transform duration-150 ${
                                  project.expanded ? "rotate-90" : ""
                                }`}
                              />
                              <ProjectFavicon cwd={project.cwd} />
                              <span className="flex-1 truncate text-xs font-medium text-foreground/90">
                                {project.name}
                              </span>
                            </SidebarMenuButton>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <SidebarMenuAction
                                    render={
                                      <button
                                        type="button"
                                        aria-label={sidebarCopy.createNewThreadInProject(
                                          project.name,
                                        )}
                                        data-testid="new-thread-button"
                                      />
                                    }
                                    showOnHover
                                    className="top-1 right-1 size-5 rounded-md p-0 text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      void openNewThread(project.id, {
                                        envMode: resolveSidebarNewThreadEnvMode({
                                          defaultEnvMode: appSettings.defaultThreadEnvMode,
                                        }),
                                      });
                                    }}
                                  >
                                    <SquarePenIcon className="size-3.5" />
                                  </SidebarMenuAction>
                                }
                              />
                              <TooltipPopup side="top">
                                {sidebarCopy.newThread(newThreadShortcutLabel)}
                              </TooltipPopup>
                            </Tooltip>
                          </div>

                          <CollapsibleContent keepMounted>
                            <SidebarMenuSub className="mx-1 my-0 w-full translate-x-0 gap-0.5 px-1.5 py-0">
                              {visibleThreads.map((thread) => {
                                const isActive = routeThreadId === thread.id;
                                const isSelected = selectedThreadIds.has(thread.id);
                                const isHighlighted = isActive || isSelected;
                                const threadStatus = resolveThreadStatusPill({
                                  thread,
                                  hasPendingApprovals:
                                    derivePendingApprovals(thread.activities).length > 0,
                                  hasPendingUserInput:
                                    derivePendingUserInputs(thread.activities).length > 0,
                                });
                                const prStatus = prStatusIndicator(
                                  prByThreadId.get(thread.id) ?? null,
                                  appSettings.language,
                                );
                                const terminalStatus = terminalStatusFromRunningIds(
                                  selectThreadTerminalState(terminalStateByThreadId, thread.id)
                                    .runningTerminalIds,
                                  appSettings.language,
                                );

                                return (
                                  <SidebarMenuSubItem
                                    key={thread.id}
                                    className="w-full"
                                    data-thread-item
                                  >
                                    <SidebarMenuSubButton
                                      render={<div role="button" tabIndex={0} />}
                                      size="sm"
                                      isActive={isActive}
                                      className={resolveThreadRowClassName({
                                        isActive,
                                        isSelected,
                                      })}
                                      onClick={(event) => {
                                        handleThreadClick(
                                          event,
                                          thread.id,
                                          orderedProjectThreadIds,
                                        );
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key !== "Enter" && event.key !== " ") return;
                                        event.preventDefault();
                                        if (selectedThreadIds.size > 0) {
                                          clearSelection();
                                        }
                                        setSelectionAnchor(thread.id);
                                        navigateToThread(thread.id);
                                      }}
                                      onContextMenu={(event) => {
                                        event.preventDefault();
                                        if (
                                          selectedThreadIds.size > 0 &&
                                          selectedThreadIds.has(thread.id)
                                        ) {
                                          void handleMultiSelectContextMenu({
                                            x: event.clientX,
                                            y: event.clientY,
                                          });
                                        } else {
                                          if (selectedThreadIds.size > 0) {
                                            clearSelection();
                                          }
                                          void handleThreadContextMenu(thread.id, {
                                            x: event.clientX,
                                            y: event.clientY,
                                          });
                                        }
                                      }}
                                    >
                                      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                                        {prStatus && (
                                          <Tooltip>
                                            <TooltipTrigger
                                              render={
                                                <button
                                                  type="button"
                                                  aria-label={prStatus.tooltip}
                                                  className={`inline-flex items-center justify-center ${prStatus.colorClass} cursor-pointer rounded-sm outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                                                  onClick={(event) => {
                                                    openPrLink(event, prStatus.url);
                                                  }}
                                                >
                                                  <GitPullRequestIcon className="size-3" />
                                                </button>
                                              }
                                            />
                                            <TooltipPopup side="top">
                                              {prStatus.tooltip}
                                            </TooltipPopup>
                                          </Tooltip>
                                        )}
                                        {threadStatus && (
                                          <span
                                            className={`inline-flex items-center gap-1 text-[10px] ${threadStatus.colorClass}`}
                                          >
                                            <span
                                              className={`h-1.5 w-1.5 rounded-full ${threadStatus.dotClass} ${
                                                threadStatus.pulse ? "animate-pulse" : ""
                                              }`}
                                            />
                                            <span className="hidden md:inline">
                                              {localizeThreadStatusLabel(
                                                threadStatus.label,
                                                appSettings.language,
                                              )}
                                            </span>
                                          </span>
                                        )}
                                        {renamingThreadId === thread.id ? (
                                          <input
                                            ref={(el) => {
                                              if (el && renamingInputRef.current !== el) {
                                                renamingInputRef.current = el;
                                                el.focus();
                                                el.select();
                                              }
                                            }}
                                            className="min-w-0 flex-1 truncate text-xs bg-transparent outline-none border border-ring rounded px-0.5"
                                            value={renamingTitle}
                                            onChange={(e) => setRenamingTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                              e.stopPropagation();
                                              if (e.key === "Enter") {
                                                e.preventDefault();
                                                renamingCommittedRef.current = true;
                                                void commitRename(
                                                  thread.id,
                                                  renamingTitle,
                                                  thread.title,
                                                );
                                              } else if (e.key === "Escape") {
                                                e.preventDefault();
                                                renamingCommittedRef.current = true;
                                                cancelRename();
                                              }
                                            }}
                                            onBlur={() => {
                                              if (!renamingCommittedRef.current) {
                                                void commitRename(
                                                  thread.id,
                                                  renamingTitle,
                                                  thread.title,
                                                );
                                              }
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        ) : (
                                          <span className="min-w-0 flex-1 truncate text-xs">
                                            {thread.title}
                                          </span>
                                        )}
                                      </div>
                                      <div className="ml-auto flex shrink-0 items-center gap-1.5">
                                        {terminalStatus && (
                                          <span
                                            role="img"
                                            aria-label={terminalStatus.label}
                                            title={terminalStatus.label}
                                            className={`inline-flex items-center justify-center ${terminalStatus.colorClass}`}
                                          >
                                            <TerminalIcon
                                              className={`size-3 ${terminalStatus.pulse ? "animate-pulse" : ""}`}
                                            />
                                          </span>
                                        )}
                                        <span
                                          className={`text-[10px] ${
                                            isHighlighted
                                              ? "text-foreground/72 dark:text-foreground/82"
                                              : "text-muted-foreground/40"
                                          }`}
                                        >
                                          {formatRelativeTime(
                                            thread.createdAt,
                                            appSettings.language,
                                          )}
                                        </span>
                                      </div>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                );
                              })}

                              {hasHiddenThreads && !isThreadListExpanded && (
                                <SidebarMenuSubItem className="w-full">
                                  <SidebarMenuSubButton
                                    render={<button type="button" />}
                                    data-thread-selection-safe
                                    size="sm"
                                    className="h-6 w-full translate-x-0 justify-start px-2 text-left text-[10px] text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                    onClick={() => {
                                      expandThreadListForProject(project.id);
                                    }}
                                  >
                                    <span>{sidebarCopy.showMore}</span>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )}
                              {hasHiddenThreads && isThreadListExpanded && (
                                <SidebarMenuSubItem className="w-full">
                                  <SidebarMenuSubButton
                                    render={<button type="button" />}
                                    data-thread-selection-safe
                                    size="sm"
                                    className="h-6 w-full translate-x-0 justify-start px-2 text-left text-[10px] text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                    onClick={() => {
                                      collapseThreadListForProject(project.id);
                                    }}
                                  >
                                    <span>{sidebarCopy.showLess}</span>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </SortableProjectItem>
                  );
                })}
              </SortableContext>
            </SidebarMenu>
          </DndContext>

          {projects.length === 0 && !shouldShowProjectPathEntry && (
            <div className="px-2 pt-4 text-center text-xs text-muted-foreground/60">
              {sidebarCopy.noProjectsYet}
            </div>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            {isOnSettings ? (
              <SidebarMenuButton
                size="sm"
                className="gap-2 px-2 py-1.5 text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={() => window.history.back()}
              >
                <ArrowLeftIcon className="size-3.5" />
                <span className="text-xs">{sidebarCopy.back}</span>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton
                size="sm"
                className="gap-2 px-2 py-1.5 text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={() => void navigate({ to: "/settings" })}
              >
                <SettingsIcon className="size-3.5" />
                <span className="text-xs">{sidebarCopy.settings}</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}
