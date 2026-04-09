import { memo, useState, useCallback } from "react";
import { SearchIcon } from "lucide-react";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "~/lib/utils";

interface Thread {
  id: string;
  title: string;
  goalStatement: string;
  status:
    | "working"
    | "connecting"
    | "completed"
    | "pending_approval"
    | "awaiting_input"
    | "plan_ready";
  lastActivity: Date;
}

interface ThreadsTabProps {
  className?: string;
}

const MOCK_THREADS: Thread[] = [
  {
    id: "thread-1",
    title: "Implement right sidebar",
    goalStatement:
      "Build the right sidebar with PM Chat, Threads, Features, Goals, and Context tabs",
    status: "working",
    lastActivity: new Date(),
  },
  {
    id: "thread-2",
    title: "Fix authentication bug",
    goalStatement: "Investigate and fix the OAuth token refresh issue",
    status: "completed",
    lastActivity: new Date(Date.now() - 3600000),
  },
  {
    id: "thread-3",
    title: "Add unit tests",
    goalStatement: "Add comprehensive unit tests for the new API endpoints",
    status: "plan_ready",
    lastActivity: new Date(Date.now() - 7200000),
  },
];

const STATUS_LABELS: Record<Thread["status"], string> = {
  working: "Working",
  connecting: "Connecting",
  completed: "Completed",
  pending_approval: "Pending Approval",
  awaiting_input: "Awaiting Input",
  plan_ready: "Plan Ready",
};

const STATUS_COLORS: Record<Thread["status"], string> = {
  working: "bg-blue-500/10 text-blue-400",
  connecting: "bg-amber-500/10 text-amber-400",
  completed: "bg-emerald-500/10 text-emerald-400",
  pending_approval: "bg-violet-500/10 text-violet-400",
  awaiting_input: "bg-orange-500/10 text-orange-400",
  plan_ready: "bg-cyan-500/10 text-cyan-400",
};

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const ThreadsTab = memo(function ThreadsTab({ className }: ThreadsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const filteredThreads = MOCK_THREADS.filter(
    (thread) =>
      thread.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      thread.goalStatement.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleThreadClick = useCallback((threadId: string) => {
    setSelectedThreadId(threadId);
  }, []);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="shrink-0 p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/55" />
          <Input
            type="search"
            placeholder="Search threads..."
            className="h-8 w-full pl-8 pr-3 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1" hideScrollbars>
        <div className="space-y-1 p-3 pt-0">
          {filteredThreads.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-muted-foreground/50">No threads found</p>
            </div>
          ) : (
            filteredThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => handleThreadClick(thread.id)}
                className={cn(
                  "flex w-full flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition-colors",
                  selectedThreadId === thread.id
                    ? "border-primary/30 bg-accent/50"
                    : "border-transparent hover:bg-muted/50",
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-foreground/90">
                    {thread.title}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "shrink-0 text-[9px] font-medium uppercase tracking-wide",
                      STATUS_COLORS[thread.status],
                    )}
                  >
                    {STATUS_LABELS[thread.status]}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground/70">
                  {thread.goalStatement}
                </p>
                <span className="text-[10px] text-muted-foreground/45">
                  {formatRelativeTime(thread.lastActivity)}
                </span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

export default ThreadsTab;
