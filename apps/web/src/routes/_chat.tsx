import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import ThreadSidebar from "../components/Sidebar";
import { type ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { Sidebar, SidebarProvider, useSidebar } from "~/components/ui/sidebar";
import { resolveShortcutCommand } from "../keybindings";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";

const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];

function isTerminalFocused(): boolean {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return false;
  if (activeElement.classList.contains("xterm-helper-textarea")) return true;
  return activeElement.closest(".thread-terminal-drawer .xterm") !== null;
}

function ChatRouteLayoutContent() {
  const navigate = useNavigate();
  const { toggleSidebar } = useSidebar();
  const { data: keybindings = EMPTY_KEYBINDINGS } = useQuery({
    ...serverConfigQueryOptions(),
    select: (config) => config.keybindings,
  });

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
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="border-r border-border bg-card text-foreground"
      >
        <ThreadSidebar />
      </Sidebar>
      <DiffWorkerPoolProvider>
        <Outlet />
      </DiffWorkerPoolProvider>
    </>
  );
}

function ChatRouteLayout() {
  return (
    <SidebarProvider defaultOpen>
      <ChatRouteLayoutContent />
    </SidebarProvider>
  );
}

export const Route = createFileRoute("/_chat")({
  component: ChatRouteLayout,
});
