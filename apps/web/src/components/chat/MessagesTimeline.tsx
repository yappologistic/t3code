import { type MessageId, type TurnId } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  measureElement as measureVirtualElement,
  type VirtualItem,
  useVirtualizer,
} from "@tanstack/react-virtual";
import { deriveTimelineEntries, formatElapsed } from "../../session-logic";
import { AUTO_SCROLL_BOTTOM_THRESHOLD_PX } from "../../chat-scroll";
import { type TurnDiffSummary } from "../../types";
import { summarizeTurnDiffStats } from "../../lib/turnDiffTree";
import ChatMarkdown from "../ChatMarkdown";
import {
  BotIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  EyeIcon,
  GitPullRequestIcon,
  GlobeIcon,
  HammerIcon,
  type LucideIcon,
  SquarePenIcon,
  TerminalIcon,
  Undo2Icon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { clamp } from "effect/Number";
import { estimateTimelineMessageHeight } from "../timelineHeight";
import { buildExpandedImagePreview, ExpandedImagePreview } from "./ExpandedImagePreview";
import { ProposedPlanCard } from "./ProposedPlanCard";
import { ChangedFilesTree } from "./ChangedFilesTree";
import { DiffStatLabel, hasNonZeroStat } from "./DiffStatLabel";
import { MessageCopyButton } from "./MessageCopyButton";
import {
  computeMessageDurationStart,
  deriveTimelineWorkEntryVisualState,
  formatWorkingTimer,
  normalizeCompactToolLabel,
  shouldAnimateAssistantResponseAfterTool,
} from "./MessagesTimeline.logic";
import { cn } from "~/lib/utils";
import { type TimestampFormat } from "../../appSettings";
import { formatTimestamp } from "../../timestampFormat";

const MAX_VISIBLE_WORK_LOG_ENTRIES = 6;
const ALWAYS_UNVIRTUALIZED_TAIL_ROWS = 8;

interface MessagesTimelineProps {
  hasMessages: boolean;
  isWorking: boolean;
  activeTurnInProgress: boolean;
  activeTurnStartedAt: string | null;
  scrollContainer: HTMLDivElement | null;
  timelineEntries: ReturnType<typeof deriveTimelineEntries>;
  completionDividerBeforeEntryId: string | null;
  completionSummary: string | null;
  turnDiffSummaryByAssistantMessageId: Map<MessageId, TurnDiffSummary>;
  nowIso: string;
  expandedWorkGroups: Record<string, boolean>;
  onToggleWorkGroup: (groupId: string) => void;
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
  revertTurnCountByUserMessageId: Map<MessageId, number>;
  onRevertUserMessage: (messageId: MessageId) => void;
  onForkMessage: (messageId: MessageId) => void;
  isForkingThread: boolean;
  isRevertingCheckpoint: boolean;
  onImageExpand: (preview: ExpandedImagePreview) => void;
  markdownCwd: string | undefined;
  resolvedTheme: "light" | "dark";
  timestampFormat: TimestampFormat;
  workspaceRoot: string | undefined;
  emptyStateLabel: string;
  workingLabel: string;
  formatWorkingLabel: (duration: string) => string;
}

export const MessagesTimeline = memo(function MessagesTimeline({
  hasMessages,
  isWorking,
  activeTurnInProgress,
  activeTurnStartedAt,
  scrollContainer,
  timelineEntries,
  completionDividerBeforeEntryId,
  completionSummary,
  turnDiffSummaryByAssistantMessageId,
  nowIso,
  expandedWorkGroups,
  onToggleWorkGroup,
  onOpenTurnDiff,
  revertTurnCountByUserMessageId,
  onRevertUserMessage,
  onForkMessage,
  isForkingThread,
  isRevertingCheckpoint,
  onImageExpand,
  markdownCwd,
  resolvedTheme,
  timestampFormat,
  workspaceRoot,
  emptyStateLabel,
  workingLabel,
  formatWorkingLabel,
}: MessagesTimelineProps) {
  const timelineRootRef = useRef<HTMLDivElement | null>(null);
  const [timelineWidthPx, setTimelineWidthPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const timelineRoot = timelineRootRef.current;
    if (!timelineRoot) return;

    const updateWidth = (nextWidth: number) => {
      setTimelineWidthPx((previousWidth) => {
        if (previousWidth !== null && Math.abs(previousWidth - nextWidth) < 0.5) {
          return previousWidth;
        }
        return nextWidth;
      });
    };

    updateWidth(timelineRoot.getBoundingClientRect().width);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      updateWidth(timelineRoot.getBoundingClientRect().width);
    });
    observer.observe(timelineRoot);
    return () => {
      observer.disconnect();
    };
  }, [hasMessages, isWorking]);

  const rows = useMemo<TimelineRow[]>(() => {
    const nextRows: TimelineRow[] = [];
    const durationStartByMessageId = computeMessageDurationStart(
      timelineEntries.flatMap((entry) => (entry.kind === "message" ? [entry.message] : [])),
    );

    for (let index = 0; index < timelineEntries.length; index += 1) {
      const timelineEntry = timelineEntries[index];
      if (!timelineEntry) {
        continue;
      }

      if (timelineEntry.kind === "work") {
        const groupedEntries = [timelineEntry.entry];
        let cursor = index + 1;
        while (cursor < timelineEntries.length) {
          const nextEntry = timelineEntries[cursor];
          if (!nextEntry || nextEntry.kind !== "work") break;
          groupedEntries.push(nextEntry.entry);
          cursor += 1;
        }
        nextRows.push({
          kind: "work",
          id: timelineEntry.id,
          createdAt: timelineEntry.createdAt,
          groupedEntries,
        });
        index = cursor - 1;
        continue;
      }

      if (timelineEntry.kind === "proposed-plan") {
        nextRows.push({
          kind: "proposed-plan",
          id: timelineEntry.id,
          createdAt: timelineEntry.createdAt,
          proposedPlan: timelineEntry.proposedPlan,
        });
        continue;
      }

      nextRows.push({
        kind: "message",
        id: timelineEntry.id,
        createdAt: timelineEntry.createdAt,
        message: timelineEntry.message,
        durationStart:
          durationStartByMessageId.get(timelineEntry.message.id) ?? timelineEntry.message.createdAt,
        showCompletionDivider:
          timelineEntry.message.role === "assistant" &&
          completionDividerBeforeEntryId === timelineEntry.id,
        animateAfterTool: shouldAnimateAssistantResponseAfterTool({
          messageRole: timelineEntry.message.role,
          previousRowKind: nextRows.at(-1)?.kind ?? null,
        }),
      });
    }

    const hasWorkRows = nextRows.some((row) => row.kind === "work");

    if (isWorking && !hasWorkRows) {
      nextRows.push({
        kind: "working",
        id: "working-indicator-row",
        createdAt: activeTurnStartedAt,
      });
    }

    return nextRows;
  }, [timelineEntries, completionDividerBeforeEntryId, isWorking, activeTurnStartedAt]);

  const firstUnvirtualizedRowIndex = useMemo(() => {
    const firstTailRowIndex = Math.max(rows.length - ALWAYS_UNVIRTUALIZED_TAIL_ROWS, 0);
    if (!activeTurnInProgress) return firstTailRowIndex;

    const turnStartedAtMs =
      typeof activeTurnStartedAt === "string" ? Date.parse(activeTurnStartedAt) : Number.NaN;
    let firstCurrentTurnRowIndex = -1;
    if (!Number.isNaN(turnStartedAtMs)) {
      firstCurrentTurnRowIndex = rows.findIndex((row) => {
        if (row.kind === "working") return true;
        if (!row.createdAt) return false;
        const rowCreatedAtMs = Date.parse(row.createdAt);
        return !Number.isNaN(rowCreatedAtMs) && rowCreatedAtMs >= turnStartedAtMs;
      });
    }

    if (firstCurrentTurnRowIndex < 0) {
      firstCurrentTurnRowIndex = rows.findIndex(
        (row) => row.kind === "message" && row.message.streaming,
      );
    }

    if (firstCurrentTurnRowIndex < 0) return firstTailRowIndex;

    for (let index = firstCurrentTurnRowIndex - 1; index >= 0; index -= 1) {
      const previousRow = rows[index];
      if (!previousRow || previousRow.kind !== "message") continue;
      if (previousRow.message.role === "user") {
        return Math.min(index, firstTailRowIndex);
      }
      if (previousRow.message.role === "assistant" && !previousRow.message.streaming) {
        break;
      }
    }

    return Math.min(firstCurrentTurnRowIndex, firstTailRowIndex);
  }, [activeTurnInProgress, activeTurnStartedAt, rows]);

  const virtualizedRowCount = clamp(firstUnvirtualizedRowIndex, {
    minimum: 0,
    maximum: rows.length,
  });

  const rowVirtualizer = useVirtualizer({
    count: virtualizedRowCount,
    getScrollElement: () => scrollContainer,
    // Use stable row ids so virtual measurements do not leak across thread switches.
    getItemKey: (index: number) => rows[index]?.id ?? index,
    estimateSize: (index: number) => {
      const row = rows[index];
      if (!row) return 96;
      if (row.kind === "work") return 112;
      if (row.kind === "proposed-plan") return estimateTimelineProposedPlanHeight(row.proposedPlan);
      if (row.kind === "working") return 40;
      return estimateTimelineMessageHeight(row.message, { timelineWidthPx });
    },
    measureElement: measureVirtualElement,
    useAnimationFrameWithResizeObserver: true,
    overscan: 8,
  });
  useEffect(() => {
    if (timelineWidthPx === null) return;
    rowVirtualizer.measure();
  }, [rowVirtualizer, timelineWidthPx]);
  useEffect(() => {
    rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = (_item, _delta, instance) => {
      const viewportHeight = instance.scrollRect?.height ?? 0;
      const scrollOffset = instance.scrollOffset ?? 0;
      const remainingDistance = instance.getTotalSize() - (scrollOffset + viewportHeight);
      return remainingDistance > AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
    };
    return () => {
      rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined;
    };
  }, [rowVirtualizer]);
  const pendingMeasureFrameRef = useRef<number | null>(null);
  const onTimelineImageLoad = useCallback(() => {
    if (pendingMeasureFrameRef.current !== null) return;
    pendingMeasureFrameRef.current = window.requestAnimationFrame(() => {
      pendingMeasureFrameRef.current = null;
      rowVirtualizer.measure();
    });
  }, [rowVirtualizer]);
  useEffect(() => {
    return () => {
      const frame = pendingMeasureFrameRef.current;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const nonVirtualizedRows = rows.slice(virtualizedRowCount);
  const activeWorkGroupId = useMemo(() => {
    if (!isWorking) return null;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (row?.kind === "work") {
        return row.id;
      }
    }
    return null;
  }, [isWorking, rows]);
  const [allDirectoriesExpandedByTurnId, setAllDirectoriesExpandedByTurnId] = useState<
    Record<string, boolean>
  >({});
  const onToggleAllDirectories = useCallback((turnId: TurnId) => {
    setAllDirectoriesExpandedByTurnId((current) => ({
      ...current,
      [turnId]: !(current[turnId] ?? true),
    }));
  }, []);

  const renderRowContent = (row: TimelineRow) => (
    <div
      className="pb-4"
      data-timeline-row-kind={row.kind}
      data-message-id={row.kind === "message" ? row.message.id : undefined}
      data-message-role={row.kind === "message" ? row.message.role : undefined}
    >
      {row.kind === "work" &&
        (() => {
          const groupId = row.id;
          const groupedEntries = row.groupedEntries;
          const isExpanded = expandedWorkGroups[groupId] ?? false;
          const isLiveGroup = activeWorkGroupId === groupId;
          const hasOverflow = groupedEntries.length > MAX_VISIBLE_WORK_LOG_ENTRIES;
          const visibleEntries =
            hasOverflow && !isExpanded
              ? groupedEntries.slice(-MAX_VISIBLE_WORK_LOG_ENTRIES)
              : groupedEntries;
          const hiddenCount = groupedEntries.length - visibleEntries.length;
          const onlyToolEntries = groupedEntries.every((entry) => entry.tone === "tool");
          const groupLabel = onlyToolEntries ? "Tool calls" : "Work log";
          const liveDuration =
            isLiveGroup && row.createdAt ? formatWorkingTimer(row.createdAt, nowIso) : null;
          const groupSummary = isLiveGroup
            ? liveDuration
              ? `Active for ${liveDuration}`
              : "Running"
            : onlyToolEntries
              ? `${groupedEntries.length} call${groupedEntries.length === 1 ? "" : "s"} completed`
              : `${groupedEntries.length} event${groupedEntries.length === 1 ? "" : "s"} completed`;

          return (
            <div
              data-work-group-live={isLiveGroup || undefined}
              className={cn(
                "relative overflow-hidden rounded-[24px] border px-2.5 py-2 transition-[border-color,background-color,box-shadow] duration-500 ease-out",
                isLiveGroup
                  ? "border-border/65 bg-[linear-gradient(180deg,--alpha(var(--color-white)/5%),--alpha(var(--color-white)/2%)_48%,--alpha(var(--color-black)/0%)_100%)] shadow-[0_18px_50px_-36px_--alpha(var(--color-black)/24%)]"
                  : "border-border/40 bg-card/20 shadow-[0_8px_24px_-20px_--alpha(var(--color-black)/12%)]",
              )}
            >
              {/* Live progress bar */}
              {isLiveGroup && (
                <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden">
                  <div className="app-tool-group-progress h-full w-full bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />
                </div>
              )}

              <div className="mb-2 flex items-start justify-between gap-3 px-0.5">
                <div className="min-w-0 flex items-center gap-2.5">
                  <ToolCallActivityBadge isLive={isLiveGroup} entryCount={groupedEntries.length} />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-foreground/88">
                      {groupLabel}
                    </p>
                    <p
                      className={cn(
                        "truncate text-[10px] transition-colors duration-300",
                        isLiveGroup ? "text-muted-foreground/65" : "text-muted-foreground/50",
                      )}
                    >
                      {groupSummary}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-[border-color,background-color,color] duration-300",
                      isLiveGroup
                        ? "border-border/60 bg-background/75 text-foreground/78"
                        : "border-border/50 bg-background/50 text-muted-foreground/55",
                    )}
                  >
                    {isLiveGroup ? "Live" : groupedEntries.length}
                  </span>
                  {hasOverflow && (
                    <button
                      type="button"
                      className="app-fade-motion text-[9px] uppercase tracking-[0.12em] text-muted-foreground/50 hover:text-foreground/75"
                      onClick={() => onToggleWorkGroup(groupId)}
                    >
                      {isExpanded ? "Show less" : `Show ${hiddenCount} more`}
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                {visibleEntries.map((workEntry, index) => (
                  <SimpleWorkEntryRow
                    key={`work-row:${workEntry.id}`}
                    workEntry={workEntry}
                    isLiveGroup={isLiveGroup}
                    isLatestVisibleEntry={index === visibleEntries.length - 1}
                    entryIndex={index}
                    visibleEntryCount={visibleEntries.length}
                  />
                ))}
              </div>
            </div>
          );
        })()}

      {row.kind === "message" &&
        row.message.role === "user" &&
        (() => {
          const userImages = row.message.attachments ?? [];
          const canRevertAgentWork = revertTurnCountByUserMessageId.has(row.message.id);
          return (
            <div className="flex justify-end">
              <div className="user-message-font group relative max-w-[80%] rounded-2xl rounded-br-sm border border-border/80 bg-secondary px-4 py-3 shadow-[0_2px_8px_-4px_--alpha(var(--color-black)/8%)]">
                {userImages.length > 0 && (
                  <div className="mb-2 grid max-w-[420px] grid-cols-2 gap-2">
                    {userImages.map(
                      (image: NonNullable<TimelineMessage["attachments"]>[number]) => (
                        <div
                          key={image.id}
                          className="overflow-hidden rounded-lg border border-border/60 bg-background/60 shadow-[0_1px_4px_-2px_--alpha(var(--color-black)/6%)]"
                        >
                          {image.previewUrl ? (
                            <button
                              type="button"
                              className="h-full w-full cursor-zoom-in"
                              aria-label={`Preview ${image.name}`}
                              onClick={() => {
                                const preview = buildExpandedImagePreview(userImages, image.id);
                                if (!preview) return;
                                onImageExpand(preview);
                              }}
                            >
                              <img
                                src={image.previewUrl}
                                alt={image.name}
                                className="h-full max-h-[220px] w-full object-cover"
                                onLoad={onTimelineImageLoad}
                                onError={onTimelineImageLoad}
                              />
                            </button>
                          ) : (
                            <div className="flex min-h-[72px] items-center justify-center px-2 py-3 text-center text-[11px] text-muted-foreground/70">
                              {image.name}
                            </div>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}
                {row.message.text && (
                  <pre className="user-message-font whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground">
                    {row.message.text}
                  </pre>
                )}
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
                    {row.message.text && <MessageCopyButton text={row.message.text} />}
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={isForkingThread || isWorking || row.message.streaming}
                      onClick={() => onForkMessage(row.message.id)}
                      title="Fork thread here"
                    >
                      <GitPullRequestIcon className="size-3" />
                    </Button>
                    {canRevertAgentWork && (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={isRevertingCheckpoint || isWorking}
                        onClick={() => onRevertUserMessage(row.message.id)}
                        title="Revert to this message"
                      >
                        <Undo2Icon className="size-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-right text-[10px] text-muted-foreground/45">
                    {formatTimestamp(row.message.createdAt, timestampFormat)}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

      {row.kind === "message" &&
        row.message.role === "assistant" &&
        (() => {
          const messageText = row.message.text || (row.message.streaming ? "" : "(empty response)");
          return (
            <>
              {row.showCompletionDivider && (
                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
                  <span className="rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 shadow-[0_1px_4px_-2px_--alpha(var(--color-black)/8%)]">
                    {completionSummary ? `Response • ${completionSummary}` : "Response"}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
                </div>
              )}
              <div
                data-assistant-response-reveal={row.animateAfterTool || undefined}
                className={cn(
                  "min-w-0 px-1 py-0.5",
                  row.animateAfterTool && "app-assistant-response-motion",
                )}
              >
                <ChatMarkdown
                  text={messageText}
                  cwd={markdownCwd}
                  isStreaming={Boolean(row.message.streaming)}
                />
                {(() => {
                  const turnSummary = turnDiffSummaryByAssistantMessageId.get(row.message.id);
                  if (!turnSummary) return null;
                  const checkpointFiles = turnSummary.files;
                  if (checkpointFiles.length === 0) return null;
                  const summaryStat = summarizeTurnDiffStats(checkpointFiles);
                  const changedFileCountLabel = String(checkpointFiles.length);
                  const allDirectoriesExpanded =
                    allDirectoriesExpandedByTurnId[turnSummary.turnId] ?? true;
                  return (
                    <div className="mt-3 rounded-xl border border-border/60 bg-card/40 p-3 shadow-[0_2px_8px_-4px_--alpha(var(--color-black)/6%)]">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/65">
                          <span>Changed files ({changedFileCountLabel})</span>
                          {hasNonZeroStat(summaryStat) && (
                            <>
                              <span className="mx-1">•</span>
                              <DiffStatLabel
                                additions={summaryStat.additions}
                                deletions={summaryStat.deletions}
                              />
                            </>
                          )}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => onToggleAllDirectories(turnSummary.turnId)}
                          >
                            {allDirectoriesExpanded ? "Collapse all" : "Expand all"}
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              onOpenTurnDiff(turnSummary.turnId, checkpointFiles[0]?.path)
                            }
                          >
                            View diff
                          </Button>
                        </div>
                      </div>
                      <ChangedFilesTree
                        key={`changed-files-tree:${turnSummary.turnId}`}
                        turnId={turnSummary.turnId}
                        files={checkpointFiles}
                        allDirectoriesExpanded={allDirectoriesExpanded}
                        resolvedTheme={resolvedTheme}
                        onOpenTurnDiff={onOpenTurnDiff}
                      />
                    </div>
                  );
                })()}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 hover:opacity-100 group-hover:opacity-100">
                    {row.message.text && <MessageCopyButton text={row.message.text} />}
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={isForkingThread || isWorking || row.message.streaming}
                      onClick={() => onForkMessage(row.message.id)}
                      title="Fork thread here"
                    >
                      <GitPullRequestIcon className="size-3" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/42">
                    {formatMessageMeta(
                      row.message.createdAt,
                      row.message.streaming
                        ? formatElapsed(row.durationStart, nowIso)
                        : formatElapsed(row.durationStart, row.message.completedAt),
                      timestampFormat,
                    )}
                  </p>
                </div>
              </div>
            </>
          );
        })()}

      {row.kind === "proposed-plan" && (
        <div className="min-w-0 px-1 py-0.5">
          <ProposedPlanCard
            planMarkdown={row.proposedPlan.planMarkdown}
            cwd={markdownCwd}
            workspaceRoot={workspaceRoot}
          />
        </div>
      )}

      {row.kind === "working" && (
        <div className="py-0.5 pl-1.5">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-border/50 bg-card/50 px-4 py-2.5 text-[11px] text-muted-foreground/72 shadow-[0_14px_38px_-30px_--alpha(var(--color-black)/18%)] backdrop-blur-xs">
            <span className="inline-flex items-center gap-[5px]">
              <span className="app-tool-live-dot h-[5px] w-[5px] rounded-full bg-primary/80" />
              <span className="app-tool-live-dot h-[5px] w-[5px] rounded-full bg-primary/55 [animation-delay:160ms]" />
              <span className="app-tool-live-dot h-[5px] w-[5px] rounded-full bg-primary/35 [animation-delay:320ms]" />
            </span>
            <span>
              {row.createdAt
                ? formatWorkingLabel(formatWorkingTimer(row.createdAt, nowIso) ?? "0s")
                : workingLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  if (!hasMessages && !isWorking) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground/25">{emptyStateLabel}</p>
      </div>
    );
  }

  return (
    <div
      ref={timelineRootRef}
      data-timeline-root="true"
      className="mx-auto w-full min-w-0 max-w-3xl overflow-x-hidden [contain:content]"
    >
      {virtualizedRowCount > 0 && (
        <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          {virtualRows.map((virtualRow: VirtualItem) => {
            const row = rows[virtualRow.index];
            if (!row) return null;

            return (
              <div
                key={`virtual-row:${row.id}`}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderRowContent(row)}
              </div>
            );
          })}
        </div>
      )}

      {nonVirtualizedRows.map((row) => (
        <div key={`non-virtual-row:${row.id}`}>{renderRowContent(row)}</div>
      ))}
    </div>
  );
});

type TimelineEntry = ReturnType<typeof deriveTimelineEntries>[number];
type TimelineMessage = Extract<TimelineEntry, { kind: "message" }>["message"];
type TimelineProposedPlan = Extract<TimelineEntry, { kind: "proposed-plan" }>["proposedPlan"];
type TimelineWorkEntry = Extract<TimelineEntry, { kind: "work" }>["entry"];
type TimelineRow =
  | {
      kind: "work";
      id: string;
      createdAt: string;
      groupedEntries: TimelineWorkEntry[];
    }
  | {
      kind: "message";
      id: string;
      createdAt: string;
      message: TimelineMessage;
      durationStart: string;
      showCompletionDivider: boolean;
      animateAfterTool: boolean;
    }
  | {
      kind: "proposed-plan";
      id: string;
      createdAt: string;
      proposedPlan: TimelineProposedPlan;
    }
  | { kind: "working"; id: string; createdAt: string | null };

function estimateTimelineProposedPlanHeight(proposedPlan: TimelineProposedPlan): number {
  const estimatedLines = Math.max(1, Math.ceil(proposedPlan.planMarkdown.length / 72));
  return 120 + Math.min(estimatedLines * 22, 880);
}

function formatMessageMeta(
  createdAt: string,
  duration: string | null,
  timestampFormat: TimestampFormat,
): string {
  if (!duration) return formatTimestamp(createdAt, timestampFormat);
  return `${formatTimestamp(createdAt, timestampFormat)} • ${duration}`;
}

function workToneIcon(tone: TimelineWorkEntry["tone"]): {
  icon: LucideIcon;
  className: string;
} {
  if (tone === "error") {
    return {
      icon: CircleAlertIcon,
      className: "text-rose-400",
    };
  }
  if (tone === "thinking") {
    return {
      icon: BotIcon,
      className: "text-foreground/88",
    };
  }
  if (tone === "info") {
    return {
      icon: CheckCircle2Icon,
      className: "text-foreground/82",
    };
  }
  return {
    icon: ZapIcon,
    className: "text-foreground/92",
  };
}

function workToneClass(tone: "thinking" | "tool" | "info" | "error"): string {
  if (tone === "error") return "text-rose-400/95";
  if (tone === "thinking") return "text-foreground/88";
  if (tone === "info") return "text-foreground/82";
  return "text-foreground/92";
}

function workEntryPreview(
  workEntry: Pick<TimelineWorkEntry, "detail" | "command" | "changedFiles">,
) {
  if (workEntry.command) return workEntry.command;
  if (workEntry.detail) return workEntry.detail;
  if ((workEntry.changedFiles?.length ?? 0) === 0) return null;
  const [firstPath] = workEntry.changedFiles ?? [];
  if (!firstPath) return null;
  return workEntry.changedFiles!.length === 1
    ? firstPath
    : `${firstPath} +${workEntry.changedFiles!.length - 1} more`;
}

function workEntryIcon(workEntry: TimelineWorkEntry): LucideIcon {
  if (workEntry.requestKind === "command") return TerminalIcon;
  if (workEntry.requestKind === "file-read") return EyeIcon;
  if (workEntry.requestKind === "file-change") return SquarePenIcon;

  if (workEntry.itemType === "command_execution" || workEntry.command) {
    return TerminalIcon;
  }
  if (workEntry.itemType === "file_change" || (workEntry.changedFiles?.length ?? 0) > 0) {
    return SquarePenIcon;
  }
  if (workEntry.itemType === "web_search") return GlobeIcon;
  if (workEntry.itemType === "image_view") return EyeIcon;

  switch (workEntry.itemType) {
    case "mcp_tool_call":
      return WrenchIcon;
    case "dynamic_tool_call":
    case "collab_agent_tool_call":
      return HammerIcon;
  }

  return workToneIcon(workEntry.tone).icon;
}

function capitalizePhrase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return value;
  }
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function toolWorkEntryHeading(workEntry: TimelineWorkEntry): string {
  if (!workEntry.toolTitle) {
    return capitalizePhrase(normalizeCompactToolLabel(workEntry.label));
  }
  return capitalizePhrase(normalizeCompactToolLabel(workEntry.toolTitle));
}

function workEntryContainerClass(visualState: "active" | "recent" | "settled" | "error"): string {
  switch (visualState) {
    case "active":
      return "app-tool-entry-live app-tool-active-glow border-border/70 bg-card/55";
    case "recent":
      return "border-border/50 bg-card/35 shadow-[0_10px_28px_-24px_--alpha(var(--color-black)/16%)]";
    case "error":
      return "border-rose-400/28 bg-rose-500/[0.08] shadow-[0_14px_34px_-28px_--alpha(var(--color-red-500)/35%)]";
    default:
      return "border-transparent bg-background/18 opacity-[0.82]";
  }
}

function workEntryBadgeClass(visualState: "active" | "recent" | "settled" | "error"): string {
  switch (visualState) {
    case "active":
      return "border-border/65 bg-background/80 text-foreground shadow-[0_8px_20px_-14px_--alpha(var(--color-black)/28%)]";
    case "recent":
      return "border-border/55 bg-background/72 text-foreground/85";
    case "error":
      return "border-rose-400/22 bg-rose-500/[0.12] text-rose-300";
    default:
      return "border-border/40 bg-background/50 text-muted-foreground/72";
  }
}

function workEntryPreviewClass(
  visualState: "active" | "recent" | "settled" | "error",
  tone: TimelineWorkEntry["tone"],
): string {
  if (tone === "error") return "text-rose-200/88";
  if (visualState === "active") return "text-muted-foreground/82";
  if (visualState === "recent") return "text-muted-foreground/70";
  return "text-muted-foreground/58";
}

const ToolCallActivityBadge = memo(function ToolCallActivityBadge(props: {
  isLive: boolean;
  entryCount: number;
}) {
  return (
    <span className="flex -space-x-1">
      {[0, 1, 2].map((index) => (
        <span
          key={`tool-call-badge:${index}`}
          className={cn(
            "app-tool-badge-pop relative flex size-5 items-center justify-center rounded-full border backdrop-blur-sm transition-[border-color,background-color,box-shadow] duration-300",
            props.isLive
              ? "border-border/65 bg-background/78 shadow-[0_8px_18px_-14px_--alpha(var(--color-black)/28%)]"
              : "border-border/55 bg-background/80",
          )}
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-[background-color,opacity] duration-300",
              props.isLive ? "app-tool-live-dot bg-foreground/78" : "bg-muted-foreground/35",
            )}
            style={props.isLive ? { animationDelay: `${index * 160}ms` } : undefined}
          />
        </span>
      ))}
    </span>
  );
});

const SimpleWorkEntryRow = memo(function SimpleWorkEntryRow(props: {
  workEntry: TimelineWorkEntry;
  isLiveGroup: boolean;
  isLatestVisibleEntry: boolean;
  entryIndex: number;
  visibleEntryCount: number;
}) {
  const { workEntry, isLiveGroup, isLatestVisibleEntry, entryIndex, visibleEntryCount } = props;
  const iconConfig = workToneIcon(workEntry.tone);
  const EntryIcon = workEntryIcon(workEntry);
  const heading = toolWorkEntryHeading(workEntry);
  const preview = workEntryPreview(workEntry);
  const visualState = deriveTimelineWorkEntryVisualState({
    tone: workEntry.tone,
    isLiveGroup,
    isLatestVisibleEntry,
    entryIndex,
    visibleEntryCount,
  });
  const displayText = preview ? `${heading}: ${preview}` : heading;
  const hasChangedFiles = (workEntry.changedFiles?.length ?? 0) > 0;
  const previewIsChangedFiles = hasChangedFiles && !workEntry.command && !workEntry.detail;

  return (
    <div
      data-work-entry-visual-state={visualState}
      className={cn(
        "app-tool-entry-motion group/entry relative overflow-hidden rounded-2xl border px-3 py-2.5 transition-[transform,opacity,border-color,background-color,box-shadow] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        "motion-safe:hover:-translate-y-px motion-safe:hover:shadow-[0_16px_40px_-28px_--alpha(var(--color-black)/28%)]",
        workEntryContainerClass(visualState),
      )}
      style={{ animationDelay: `${Math.min(entryIndex, 5) * 70}ms` }}
    >
      <div className="relative z-10 flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-2xl border transition-[border-color,background-color,box-shadow,color] duration-300",
            workEntryBadgeClass(visualState),
            iconConfig.className,
          )}
        >
          <EntryIcon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className={cn(
                  "truncate text-[11px] font-medium leading-5 transition-colors duration-200",
                  workToneClass(workEntry.tone),
                )}
                title={displayText}
              >
                {heading}
              </p>
              {preview && (
                <p
                  className={cn(
                    "mt-0.5 line-clamp-2 text-[10px] leading-4 break-words transition-colors duration-200",
                    workEntryPreviewClass(visualState, workEntry.tone),
                  )}
                  title={preview}
                >
                  {preview}
                </p>
              )}
            </div>
            {visualState === "active" && (
              <span className="flex shrink-0 items-center gap-[5px] rounded-full border border-border/60 bg-background/72 px-2 py-1">
                <span className="app-tool-live-dot h-[5px] w-[5px] rounded-full bg-foreground/78" />
                <span className="app-tool-live-dot h-[5px] w-[5px] rounded-full bg-foreground/58 [animation-delay:160ms]" />
                <span className="app-tool-live-dot h-[5px] w-[5px] rounded-full bg-foreground/36 [animation-delay:320ms]" />
              </span>
            )}
          </div>
        </div>
      </div>
      {hasChangedFiles && !previewIsChangedFiles && (
        <div className="relative z-10 mt-2 flex flex-wrap gap-1 pl-11">
          {workEntry.changedFiles?.slice(0, 4).map((filePath) => (
            <span
              key={`${workEntry.id}:${filePath}`}
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[10px] transition-[border-color,background-color,color] duration-200",
                "group-hover/entry:border-border/65 group-hover/entry:bg-background/80",
                visualState === "active"
                  ? "border-border/55 bg-background/72 text-muted-foreground/82"
                  : "border-border/45 bg-background/60 text-muted-foreground/68",
              )}
              title={filePath}
            >
              {filePath}
            </span>
          ))}
          {(workEntry.changedFiles?.length ?? 0) > 4 && (
            <span className="px-1 text-[10px] text-muted-foreground/50">
              +{(workEntry.changedFiles?.length ?? 0) - 4}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
