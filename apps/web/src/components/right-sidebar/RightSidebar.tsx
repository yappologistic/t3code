import { memo, useState, useCallback } from "react";
import {
  PanelRightCloseIcon,
  PanelRightIcon,
  MessageSquareIcon,
  ListIcon,
  LayoutGridIcon,
  TargetIcon,
  DatabaseIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";

export type RightSidebarTab = "pm-chat" | "threads" | "features" | "goals" | "context";

interface RightSidebarProps {
  className?: string;
}

interface TabConfig {
  id: RightSidebarTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabConfig[] = [
  { id: "pm-chat", label: "PM Chat", icon: <MessageSquareIcon className="size-4" /> },
  { id: "threads", label: "Threads", icon: <ListIcon className="size-4" /> },
  { id: "features", label: "Features", icon: <LayoutGridIcon className="size-4" /> },
  { id: "goals", label: "Goals", icon: <TargetIcon className="size-4" /> },
  { id: "context", label: "Context", icon: <DatabaseIcon className="size-4" /> },
];

const RightSidebar = memo(function RightSidebar({ className }: RightSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<RightSidebarTab>("pm-chat");

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const renderCollapsed = () => (
    <div className="flex h-full w-12 flex-col items-center border-l border-border/60 bg-card/40 backdrop-blur-xs py-2 gap-1">
      <button
        type="button"
        onClick={toggleExpanded}
        aria-label="Expand right sidebar"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground/70 hover:bg-accent/50 transition-colors"
      >
        <PanelRightIcon className="size-4" />
      </button>
      <div className="flex flex-col items-center gap-1 mt-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setIsExpanded(true);
            }}
            aria-label={tab.label}
            aria-selected={activeTab === tab.id}
            className={cn(
              "flex size-8 items-center justify-center rounded-md transition-colors",
              activeTab === tab.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground/50 hover:text-foreground/70 hover:bg-accent/50",
            )}
          >
            {tab.icon}
          </button>
        ))}
      </div>
    </div>
  );

  const renderExpanded = () => (
    <div className="flex h-full w-80 flex-col border-l border-border/60 bg-card/40 backdrop-blur-xs">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-3">
        <div className="flex items-center gap-2">
          {TABS.map(
            (tab) =>
              activeTab === tab.id && (
                <span key={tab.id} className="flex items-center gap-1.5 text-sm font-medium">
                  {tab.icon}
                  {tab.label}
                </span>
              ),
          )}
        </div>
        <button
          type="button"
          onClick={toggleExpanded}
          aria-label="Collapse right sidebar"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground/70 hover:bg-accent/50 transition-colors"
        >
          <PanelRightCloseIcon className="size-4" />
        </button>
      </div>

      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/60 px-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-selected={activeTab === tab.id}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              activeTab === tab.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground/60 hover:text-foreground/80 hover:bg-accent/50",
            )}
          >
            {tab.icon}
            <span className="hidden group-hover:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden" />
    </div>
  );

  return (
    <div
      className={cn(
        "relative flex shrink-0 transition-[width] motion-reduce:transition-none",
        isExpanded ? "w-80" : "w-12",
        className,
      )}
      data-state={isExpanded ? "expanded" : "collapsed"}
    >
      {isExpanded ? renderExpanded() : renderCollapsed()}
    </div>
  );
});

export default RightSidebar;
