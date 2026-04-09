import { type ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import ThreadSidebar from "../components/Sidebar";
import RightSidebar from "../components/right-sidebar/RightSidebar";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { parseDiffRouteSearch, stripDiffSearchParams } from "../diffRouteSearch";
import { isTerminalFocused } from "../lib/terminalFocus";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import { resolveShortcutCommand } from "../keybindings";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { Sidebar, SidebarProvider, useSidebar } from "~/components/ui/sidebar";
import { resolveSidebarNewThreadEnvMode } from "~/components/Sidebar.logic";
import { useAppSettings } from "~/appSettings";
import { readNativeApi } from "~/nativeApi";
import {
  CommandPalette,
  PALETTE_ICONS,
  type CommandPaletteAction,
} from "~/components/CommandPalette";

const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];

function ChatRouteGlobalShortcuts() {
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const selectedThreadIdsSize = useThreadSelectionStore((state) => state.selectedThreadIds.size);
  const { activeDraftThread, activeThread, handleNewThread, projects, routeThreadId } =
    useHandleNewThread();
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const keybindings = serverConfigQuery.data?.keybindings ?? EMPTY_KEYBINDINGS;
  const terminalOpen = useTerminalStateStore((state) =>
    routeThreadId
      ? selectThreadTerminalState(state.terminalStateByThreadId, routeThreadId).terminalOpen
      : false,
  );
  const { settings: appSettings } = useAppSettings();

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === "Escape" && selectedThreadIdsSize > 0) {
        event.preventDefault();
        clearSelection();
        return;
      }

      const projectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? projects[0]?.id;
      if (!projectId) return;

      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen,
        },
      });

      if (command === "chat.newLocal") {
        event.preventDefault();
        event.stopPropagation();
        void handleNewThread(projectId, {
          envMode: resolveSidebarNewThreadEnvMode({
            defaultEnvMode: appSettings.defaultThreadEnvMode,
          }),
        });
        return;
      }

      if (command !== "chat.new") return;
      event.preventDefault();
      event.stopPropagation();
      void handleNewThread(projectId, {
        branch: activeThread?.branch ?? activeDraftThread?.branch ?? null,
        worktreePath: activeThread?.worktreePath ?? activeDraftThread?.worktreePath ?? null,
        envMode: activeDraftThread?.envMode ?? (activeThread?.worktreePath ? "worktree" : "local"),
      });
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    activeDraftThread,
    activeThread,
    clearSelection,
    handleNewThread,
    keybindings,
    projects,
    selectedThreadIdsSize,
    terminalOpen,
    appSettings.defaultThreadEnvMode,
  ]);

  return null;
}

function ChatRouteLayoutContent() {
  const navigate = useNavigate();
  const { toggleSidebar } = useSidebar();
  const { data: keybindings = EMPTY_KEYBINDINGS } = useQuery({
    ...serverConfigQueryOptions(),
    select: (config) => config.keybindings,
  });
  const { settings: appSettings } = useAppSettings();
  const {
    activeDraftThread: paletteActiveDraftThread,
    activeThread: paletteActiveThread,
    handleNewThread: paletteHandleNewThread,
    projects: paletteProjects,
    routeThreadId,
  } = useHandleNewThread();
  const routeSearch = useSearch({ strict: false });
  const diffOpen = parseDiffRouteSearch(routeSearch).diff === "1";

  // ── Command Palette state ──────────────────────────────────────
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const paletteActions = useMemo<CommandPaletteAction[]>(() => {
    const projectId =
      paletteActiveThread?.projectId ??
      paletteActiveDraftThread?.projectId ??
      paletteProjects[0]?.id;

    const actions: CommandPaletteAction[] = [];

    if (projectId) {
      actions.push({
        id: "new-chat",
        label: appSettings.language === "fa" ? "چت جدید" : "New Chat",
        description:
          appSettings.language === "fa"
            ? "یک گفتگو تازه در همین پروژه باز می‌کند"
            : "Start a fresh thread in the current project",
        keybindingCommand: "chat.new",
        icon: PALETTE_ICONS.newChat,
        keywords: "new thread conversation",
        action: () => {
          void paletteHandleNewThread(projectId, {
            branch: paletteActiveThread?.branch ?? paletteActiveDraftThread?.branch ?? null,
            worktreePath:
              paletteActiveThread?.worktreePath ?? paletteActiveDraftThread?.worktreePath ?? null,
            envMode:
              paletteActiveDraftThread?.envMode ??
              (paletteActiveThread?.worktreePath ? "worktree" : "local"),
          });
        },
      });

      actions.push({
        id: "new-local-chat",
        label: appSettings.language === "fa" ? "چت محلی جدید" : "New Local Chat",
        description:
          appSettings.language === "fa"
            ? "یک thread محلی تازه بدون reuse کردن worktree باز می‌کند"
            : "Start a fresh local thread without reusing a worktree",
        keybindingCommand: "chat.newLocal",
        icon: PALETTE_ICONS.newLocalChat,
        keywords: "new local thread conversation",
        action: () => {
          void paletteHandleNewThread(projectId, {
            envMode: resolveSidebarNewThreadEnvMode({
              defaultEnvMode: appSettings.defaultThreadEnvMode,
            }),
          });
        },
      });
    }

    const threadScopedActionDescription =
      appSettings.language === "fa"
        ? "برای استفاده از این دستور، ابتدا یک گفتگو را باز کنید."
        : "Open a thread first to use this command.";

    actions.push(
      {
        id: "toggle-sidebar",
        label: appSettings.language === "fa" ? "نوار کناری" : "Toggle Sidebar",
        description:
          appSettings.language === "fa"
            ? "نمایش یا پنهان کردن فهرست پروژه‌ها و گفتگوها"
            : "Show or hide the projects and threads sidebar",
        keybindingCommand: "sidebar.toggle",
        icon: PALETTE_ICONS.toggleSidebar,
        keywords: "sidebar panel show hide",
        action: () => toggleSidebar(),
      },
      {
        id: "toggle-terminal",
        label: appSettings.language === "fa" ? "ترمینال" : "Toggle Terminal",
        description:
          routeThreadId === null
            ? threadScopedActionDescription
            : appSettings.language === "fa"
              ? "ترمینال این گفتگو را باز یا بسته می‌کند"
              : "Open or close the terminal drawer for this thread",
        keybindingCommand: "terminal.toggle",
        icon: PALETTE_ICONS.toggleTerminal,
        keywords: "terminal console shell",
        disabled: routeThreadId === null,
        action: () => {
          if (routeThreadId === null) return;
          const currentTerminalOpen = selectThreadTerminalState(
            useTerminalStateStore.getState().terminalStateByThreadId,
            routeThreadId,
          ).terminalOpen;
          useTerminalStateStore.getState().setTerminalOpen(routeThreadId, !currentTerminalOpen);
        },
      },
      {
        id: "toggle-diff",
        label: appSettings.language === "fa" ? "پنل تفاوت‌ها" : "Toggle Diff Panel",
        description:
          routeThreadId === null
            ? threadScopedActionDescription
            : appSettings.language === "fa"
              ? "نمایش یا پنهان کردن diff این گفتگو"
              : "Show or hide the diff panel for this thread",
        keybindingCommand: "diff.toggle",
        icon: PALETTE_ICONS.toggleDiff,
        keywords: "diff changes panel",
        disabled: routeThreadId === null,
        action: () => {
          if (routeThreadId === null) return;
          void navigate({
            to: "/$threadId",
            params: { threadId: routeThreadId },
            replace: true,
            search: (previous) => {
              const rest = stripDiffSearchParams(previous);
              return diffOpen ? { ...rest, diff: undefined } : { ...rest, diff: "1" };
            },
          });
        },
      },
      {
        id: "settings",
        label: appSettings.language === "fa" ? "تنظیمات" : "Open Settings",
        description:
          appSettings.language === "fa"
            ? "تنظیمات برنامه و ترجیحات را باز می‌کند"
            : "Open app settings and preferences",
        icon: PALETTE_ICONS.settings,
        keywords: "settings preferences configuration options",
        action: () => void navigate({ to: "/settings" }),
      },
      {
        id: "compact",
        label: appSettings.language === "fa" ? "کاهش رشته" : "Compact Thread",
        description:
          routeThreadId === null
            ? threadScopedActionDescription
            : appSettings.language === "fa"
              ? "زمینه‌ی رشته را برای ادامه‌ی مکالمه کاهش می‌دهد"
              : "Reduce thread context to continue the conversation",
        icon: PALETTE_ICONS.compact,
        keywords: "compact reduce context summarize",
        disabled: routeThreadId === null,
        action: () => {
          if (routeThreadId === null) return;
          const api = readNativeApi();
          if (!api) return;
          void api.threads.compact({ threadId: routeThreadId });
        },
      },
      {
        id: "search",
        label: appSettings.language === "fa" ? "جستجو" : "Search",
        description:
          appSettings.language === "fa" ? "جستجوی پروژه‌ها و رشته‌ها" : "Search projects and threads",
        icon: PALETTE_ICONS.search,
        keywords: "search find filter",
        action: () => {
          toggleSidebar();
        },
      },
    );

    return actions;
  }, [
    appSettings.defaultThreadEnvMode,
    appSettings.language,
    diffOpen,
    navigate,
    paletteActiveDraftThread,
    paletteActiveThread,
    paletteHandleNewThread,
    paletteProjects,
    routeThreadId,
    toggleSidebar,
  ]);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action === "open-settings") {
        void navigate({ to: "/settings" });
        return;
      }
      if (action === "toggle-sidebar") {
        toggleSidebar();
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate, toggleSidebar]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
        },
      });

      if (command === "commandPalette.toggle") {
        event.preventDefault();
        event.stopPropagation();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      if (command !== "sidebar.toggle") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [keybindings, toggleSidebar]);

  return (
    <>
      <ChatRouteGlobalShortcuts />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        actions={paletteActions}
        keybindings={keybindings}
      />
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="border-r border-border bg-card text-foreground"
      >
        <ThreadSidebar />
      </Sidebar>
      <DiffWorkerPoolProvider>
        <div className="flex flex-1 min-h-0">
          <Outlet />
          <RightSidebar className="border-l border-border" />
        </div>
      </DiffWorkerPoolProvider>
    </>
  );
}

function ChatRouteLayout() {
  return (
    <SidebarProvider defaultOpen dir="ltr">
      <ChatRouteLayoutContent />
    </SidebarProvider>
  );
}

export const Route = createFileRoute("/_chat")({
  component: ChatRouteLayout,
});
