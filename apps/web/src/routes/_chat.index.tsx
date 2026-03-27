import { createFileRoute } from "@tanstack/react-router";

import { isElectron } from "../env";
import ThreadNewButton from "../components/ThreadNewButton";
import ThreadSidebarToggle from "../components/ThreadSidebarToggle";
import { EmptyChatOnboarding } from "../components/chat/EmptyChatOnboarding";

function ChatIndexRouteView() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-muted-foreground/40">
      {!isElectron && (
        <header className="border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <ThreadSidebarToggle />
            <ThreadNewButton />
            <span className="text-sm font-medium text-foreground">Threads</span>
          </div>
        </header>
      )}

      {isElectron && (
        <div className="drag-region flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-5">
          <ThreadSidebarToggle />
          <ThreadNewButton />
          <span className="text-xs text-muted-foreground/50">No active thread</span>
        </div>
      )}

      <div className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6">
        <EmptyChatOnboarding />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
