import { memo, useState, useCallback } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { GripVerticalIcon, PlusIcon } from "lucide-react";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "~/lib/utils";

type FeatureStage = "backlog" | "in_progress" | "done" | "wishlist";

interface Feature {
  id: string;
  name: string;
  description: string;
  stage: FeatureStage;
  threadId?: string;
  lastActivity: Date;
}

interface FeaturesBoardProps {
  className?: string;
}

const MOCK_FEATURES: Feature[] = [
  {
    id: "feature-1",
    name: "Right Sidebar",
    description: "Collapsible sidebar with PM Chat, Threads, Features, Goals, Context tabs",
    stage: "in_progress",
    threadId: "thread-1",
    lastActivity: new Date(),
  },
  {
    id: "feature-2",
    name: "Dark Mode",
    description: "Add dark mode support to the application",
    stage: "backlog",
    lastActivity: new Date(Date.now() - 86400000),
  },
  {
    id: "feature-3",
    name: "Keyboard Shortcuts",
    description: "Add comprehensive keyboard shortcuts for power users",
    stage: "wishlist",
    lastActivity: new Date(Date.now() - 172800000),
  },
  {
    id: "feature-4",
    name: "User Authentication",
    description: "Implement user authentication and session management",
    stage: "done",
    lastActivity: new Date(Date.now() - 259200000),
  },
];

const STAGE_LABELS: Record<FeatureStage, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  done: "Done",
  wishlist: "Wishlist",
};

const STAGE_COLORS: Record<FeatureStage, string> = {
  backlog: "bg-zinc-500/10 text-zinc-400",
  in_progress: "bg-blue-500/10 text-blue-400",
  done: "bg-emerald-500/10 text-emerald-400",
  wishlist: "bg-violet-500/10 text-violet-400",
};

const COLUMNS: FeatureStage[] = ["backlog", "in_progress", "done", "wishlist"];

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function FeatureCard({ feature, isDragging }: { feature: Feature; isDragging?: boolean }) {
  return (
    <div
      className={cn(
        "group flex flex-col gap-2 rounded-lg border border-border/50 bg-card p-3 transition-colors",
        isDragging && "opacity-50 ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-foreground/90">{feature.name}</span>
        <div className="flex size-5 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
          <GripVerticalIcon className="size-3" />
        </div>
      </div>
      <p className="line-clamp-2 text-xs leading-snug text-muted-foreground/70">
        {feature.description}
      </p>
      {feature.threadId && (
        <Badge variant="secondary" className="w-fit text-[10px]">
          Thread: {feature.threadId}
        </Badge>
      )}
      <span className="text-[10px] text-muted-foreground/45">
        {formatRelativeTime(feature.lastActivity)}
      </span>
    </div>
  );
}

function Column({
  stage,
  features,
  isOver,
}: {
  stage: FeatureStage;
  features: Feature[];
  isOver?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-lg border border-border/30 bg-muted/20 p-2 transition-colors",
        isOver && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            {STAGE_LABELS[stage]}
          </span>
          <Badge variant="secondary" className={cn("text-[9px] font-medium", STAGE_COLORS[stage])}>
            {features.length}
          </Badge>
        </div>
        <button
          type="button"
          className="flex size-5 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/70 hover:bg-accent/50"
          aria-label={`Add to ${STAGE_LABELS[stage]}`}
        >
          <PlusIcon className="size-3" />
        </button>
      </div>
      <div className="space-y-2">
        {features.map((feature) => (
          <FeatureCard key={feature.id} feature={feature} />
        ))}
      </div>
    </div>
  );
}

const FeaturesBoard = memo(function FeaturesBoard({ className }: FeaturesBoardProps) {
  const [features, setFeatures] = useState<Feature[]>(MOCK_FEATURES);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragStart = useCallback((_event: DragStartEvent) => {}, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const activeFeature = features.find((f) => f.id === activeId);
      const overFeature = features.find((f) => f.id === overId);

      if (!activeFeature) return;

      if (COLUMNS.includes(overId as FeatureStage)) {
        setFeatures((prev) =>
          prev.map((f) => (f.id === activeId ? { ...f, stage: overId as FeatureStage } : f)),
        );
      } else if (overFeature) {
        setFeatures((prev) => {
          const activeIndex = prev.findIndex((f) => f.id === activeId);
          const overIndex = prev.findIndex((f) => f.id === overId);
          if (activeIndex === -1 || overIndex === -1) return prev;
          const newFeatures = [...prev];
          newFeatures.splice(activeIndex, 1);
          newFeatures.splice(overIndex, 0, { ...activeFeature, stage: overFeature.stage });
          return newFeatures;
        });
      }
    },
    [features],
  );

  const featuresByStage = COLUMNS.reduce(
    (acc, stage) => {
      acc[stage] = features.filter((f) => f.stage === stage);
      return acc;
    },
    {} as Record<FeatureStage, Feature[]>,
  );

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <ScrollArea className="min-h-0 flex-1 p-3" hideScrollbars>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-2 gap-3">
            {COLUMNS.map((stage) => (
              <Column key={stage} stage={stage} features={featuresByStage[stage]} />
            ))}
          </div>
        </DndContext>
      </ScrollArea>
    </div>
  );
});

export default FeaturesBoard;
