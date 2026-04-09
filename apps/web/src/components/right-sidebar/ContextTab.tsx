import { memo, useState } from "react";
import {
  DatabaseIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  Minimize2Icon,
} from "lucide-react";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import { cn } from "~/lib/utils";

type ContextNodeType = "messages" | "file" | "artifact" | "memory";

interface ContextNode {
  id: string;
  type: ContextNodeType;
  summary: string;
  size: number;
  compressed: boolean;
  createdAt: Date;
}

interface ContextBudget {
  total: number;
  used: number;
  available: number;
  compressionRatio: number;
}

interface ContextTabProps {
  className?: string;
}

const MOCK_NODES: ContextNode[] = [
  {
    id: "node-1",
    type: "messages",
    summary: "Initial project setup discussion",
    size: 4200,
    compressed: false,
    createdAt: new Date(),
  },
  {
    id: "node-2",
    type: "file",
    summary: "package.json dependencies",
    size: 1800,
    compressed: false,
    createdAt: new Date(Date.now() - 3600000),
  },
  {
    id: "node-3",
    type: "artifact",
    summary: "UI component mockups",
    size: 6500,
    compressed: true,
    createdAt: new Date(Date.now() - 7200000),
  },
  {
    id: "node-4",
    type: "memory",
    summary: "User preferences and settings",
    size: 950,
    compressed: false,
    createdAt: new Date(Date.now() - 10800000),
  },
  {
    id: "node-5",
    type: "messages",
    summary: "Feature implementation discussion",
    size: 3100,
    compressed: true,
    createdAt: new Date(Date.now() - 14400000),
  },
];

const MOCK_BUDGET: ContextBudget = {
  total: 128000,
  used: 45500,
  available: 82500,
  compressionRatio: 0.64,
};

const NODE_TYPE_LABELS: Record<ContextNodeType, string> = {
  messages: "Messages",
  file: "File",
  artifact: "Artifact",
  memory: "Memory",
};

const NODE_TYPE_COLORS: Record<ContextNodeType, string> = {
  messages: "bg-blue-500/10 text-blue-400",
  file: "bg-emerald-500/10 text-emerald-400",
  artifact: "bg-violet-500/10 text-violet-400",
  memory: "bg-amber-500/10 text-amber-400",
};

function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes}B`;
  if (bytes < 1000000) return `${(bytes / 1000).toFixed(1)}KB`;
  return `${(bytes / 1000000).toFixed(1)}MB`;
}

function ContextNodeCard({
  node,
  isExpanded,
  onToggle,
}: {
  node: ContextNode;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex flex-col gap-2 rounded-lg border p-3 transition-colors",
        node.compressed ? "border-border/30 bg-muted/20 opacity-60" : "border-border/50 bg-card",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-start justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
          ) : (
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
          )}
          <Badge
            variant="secondary"
            className={cn("text-[9px] font-medium", NODE_TYPE_COLORS[node.type])}
          >
            {NODE_TYPE_LABELS[node.type]}
          </Badge>
        </div>
        <span
          className={cn(
            "text-xs font-medium",
            node.compressed ? "text-muted-foreground/50" : "text-foreground/80",
          )}
        >
          {formatBytes(node.size)}
        </span>
      </button>
      <p
        className={cn(
          "text-xs leading-snug",
          node.compressed ? "text-muted-foreground/40" : "text-muted-foreground/70",
        )}
      >
        {node.summary}
      </p>
      {isExpanded && (
        <div className="mt-2 flex items-center justify-between border-t border-border/30 pt-2">
          <span className="text-[10px] text-muted-foreground/45">
            {node.compressed ? "Compressed" : "Active"}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-5 text-muted-foreground/40 hover:text-foreground/70"
            aria-label={node.compressed ? "Restore context" : "Compress context"}
          >
            {node.compressed ? (
              <RefreshCwIcon className="size-3" />
            ) : (
              <Minimize2Icon className="size-3" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

const ContextTab = memo(function ContextTab({ className }: ContextTabProps) {
  const [nodes] = useState<ContextNode[]>(MOCK_NODES);
  const [budget] = useState<ContextBudget>(MOCK_BUDGET);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set(["node-1"]));

  const toggleNode = (nodeId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const activeNodes = nodes.filter((n) => !n.compressed);
  const compressedNodes = nodes.filter((n) => n.compressed);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <ScrollArea className="min-h-0 flex-1 p-3" hideScrollbars>
        <div className="space-y-4">
          <div className="rounded-lg border border-border/50 bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DatabaseIcon className="size-4 text-muted-foreground/60" />
                <span className="text-xs font-medium text-foreground/80">Context Budget</span>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {Math.round(budget.compressionRatio * 100)}% compressed
              </Badge>
            </div>
            <div className="h-2 rounded-full bg-muted/50">
              <div
                className="h-full rounded-full bg-primary/60 transition-all"
                style={{ width: `${(budget.used / budget.total) * 100}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground/50">
              <span>{formatBytes(budget.used)} used</span>
              <span>{formatBytes(budget.available)} available</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                Active Context
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {activeNodes.length} nodes
              </Badge>
            </div>
            {activeNodes.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground/50">No active context</p>
            ) : (
              activeNodes.map((node) => (
                <ContextNodeCard
                  key={node.id}
                  node={node}
                  isExpanded={expandedNodeIds.has(node.id)}
                  onToggle={() => toggleNode(node.id)}
                />
              ))
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                Compressed Context
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {compressedNodes.length} nodes
              </Badge>
            </div>
            {compressedNodes.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground/50">
                No compressed context
              </p>
            ) : (
              compressedNodes.map((node) => (
                <ContextNodeCard
                  key={node.id}
                  node={node}
                  isExpanded={expandedNodeIds.has(node.id)}
                  onToggle={() => toggleNode(node.id)}
                />
              ))
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <AlertCircleIcon className="size-4 text-muted-foreground/60" />
              <span className="text-xs text-muted-foreground/70">
                Smart compression can reduce context by 70-90%
              </span>
            </div>
            <Button size="xs" variant="outline" className="text-[10px]">
              <Minimize2Icon className="mr-1 size-3" />
              Compress
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
});

export default ContextTab;
