import { memo, useState } from "react";
import { TargetIcon, LinkIcon } from "lucide-react";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "~/lib/utils";

interface Goal {
  id: string;
  text: string;
  isMain: boolean;
  linkedThreadIds: string[];
  createdAt: Date;
}

interface GoalsTabProps {
  className?: string;
}

const MOCK_GOALS: Goal[] = [
  {
    id: "goal-1",
    text: "Build a comprehensive agentic coding control room",
    isMain: true,
    linkedThreadIds: ["thread-1"],
    createdAt: new Date(),
  },
  {
    id: "goal-2",
    text: "Implement right sidebar with PM coordination",
    isMain: false,
    linkedThreadIds: ["thread-1"],
    createdAt: new Date(Date.now() - 86400000),
  },
  {
    id: "goal-3",
    text: "Add context compression system",
    isMain: false,
    linkedThreadIds: [],
    createdAt: new Date(Date.now() - 172800000),
  },
  {
    id: "goal-4",
    text: "Integrate multiple provider support",
    isMain: false,
    linkedThreadIds: [],
    createdAt: new Date(Date.now() - 259200000),
  },
];

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

const GoalsTab = memo(function GoalsTab({ className }: GoalsTabProps) {
  const [goals] = useState<Goal[]>(MOCK_GOALS);

  const mainGoal = goals.find((g) => g.isMain);
  const subGoals = goals.filter((g) => !g.isMain);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <ScrollArea className="min-h-0 flex-1 p-3" hideScrollbars>
        <div className="space-y-4">
          {mainGoal && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <TargetIcon className="size-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Main Goal
                </span>
              </div>
              <p className="text-sm font-medium text-foreground/90">{mainGoal.text}</p>
              {mainGoal.linkedThreadIds.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <LinkIcon className="size-3 text-muted-foreground/50" />
                  {mainGoal.linkedThreadIds.map((threadId) => (
                    <Badge key={threadId} variant="secondary" className="text-[10px] font-medium">
                      {threadId}
                    </Badge>
                  ))}
                </div>
              )}
              <span className="mt-2 block text-[10px] text-muted-foreground/45">
                Created {formatRelativeTime(mainGoal.createdAt)}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
              Sub-Goals
            </span>
            {subGoals.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground/50">No sub-goals yet</p>
            ) : (
              subGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="flex flex-col gap-1.5 rounded-lg border border-border/30 bg-card/50 p-3"
                >
                  <p className="text-sm text-foreground/80">{goal.text}</p>
                  <div className="flex items-center justify-between">
                    {goal.linkedThreadIds.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <LinkIcon className="size-3 text-muted-foreground/40" />
                        {goal.linkedThreadIds.map((threadId) => (
                          <Badge key={threadId} variant="secondary" className="text-[10px]">
                            {threadId}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40">
                        No linked threads
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/40">
                      {formatRelativeTime(goal.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
});

export default GoalsTab;
