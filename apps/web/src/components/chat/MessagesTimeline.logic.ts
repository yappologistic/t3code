export interface TimelineDurationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  createdAt: string;
  completedAt?: string | undefined;
}

export type TimelineWorkTone = "thinking" | "tool" | "info" | "error";

export type TimelineWorkEntryVisualState = "active" | "recent" | "settled" | "error";

export type TimelineRowKindForAnimation = "message" | "work" | "proposed-plan" | "working" | null;

export function computeMessageDurationStart(
  messages: ReadonlyArray<TimelineDurationMessage>,
): Map<string, string> {
  const result = new Map<string, string>();
  let lastBoundary: string | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      lastBoundary = message.createdAt;
    }
    result.set(message.id, lastBoundary ?? message.createdAt);
    if (message.role === "assistant" && message.completedAt) {
      lastBoundary = message.completedAt;
    }
  }

  return result;
}

export function normalizeCompactToolLabel(value: string): string {
  return value.replace(/\s+(?:complete|completed)\s*$/i, "").trim();
}

export function formatWorkingTimer(startIso: string, endIso: string): string | null {
  const startedAtMs = Date.parse(startIso);
  const endedAtMs = Date.parse(endIso);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function deriveTimelineWorkEntryVisualState(input: {
  tone: TimelineWorkTone;
  isLiveGroup: boolean;
  isLatestVisibleEntry: boolean;
  entryIndex: number;
  visibleEntryCount: number;
}): TimelineWorkEntryVisualState {
  if (input.tone === "error") {
    return "error";
  }
  if (!input.isLiveGroup) {
    return "settled";
  }
  if (input.isLatestVisibleEntry) {
    return "active";
  }
  return input.entryIndex >= Math.max(input.visibleEntryCount - 3, 0) ? "recent" : "settled";
}

export function shouldAnimateAssistantResponseAfterTool(input: {
  messageRole: TimelineDurationMessage["role"];
  previousRowKind: TimelineRowKindForAnimation;
}): boolean {
  return input.messageRole === "assistant" && input.previousRowKind === "work";
}
