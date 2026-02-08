import type {
  ProviderEvent,
  ProviderKind,
  ProviderSession,
} from "@acme/contracts";
import type { ChatMessage, SessionPhase } from "./types";

export const PROVIDER_OPTIONS: Array<{
  value: ProviderKind;
  label: string;
  available: boolean;
}> = [
  { value: "codex", label: "Codex", available: true },
  { value: "claudeCode", label: "Claude Code (soon)", available: false },
];

export function readNativeApi() {
  if (typeof window === "undefined") return undefined;
  return window.nativeApi;
}

export function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function formatTimestamp(isoDate: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(isoDate));
}

export function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "0ms";
  if (durationMs < 1_000) return `${Math.max(1, Math.round(durationMs))}ms`;
  if (durationMs < 10_000) return `${(durationMs / 1_000).toFixed(1)}s`;
  if (durationMs < 60_000) return `${Math.round(durationMs / 1_000)}s`;

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);
  if (seconds === 0) return `${minutes}m`;
  if (seconds === 60) return `${minutes + 1}m`;
  return `${minutes}m ${seconds}s`;
}

export function formatElapsed(
  startIso: string,
  endIso: string | undefined,
): string | null {
  if (!endIso) return null;

  const startedAt = Date.parse(startIso);
  const endedAt = Date.parse(endIso);
  if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt < startedAt) {
    return null;
  }

  return formatDuration(endedAt - startedAt);
}

export interface WorkLogEntry {
  id: string;
  createdAt: string;
  label: string;
  detail?: string;
  tone: "thinking" | "tool" | "info" | "error";
}

export type TimelineEntry =
  | {
      id: string;
      kind: "message";
      createdAt: string;
      message: ChatMessage;
    }
  | {
      id: string;
      kind: "work";
      createdAt: string;
      entry: WorkLogEntry;
    };

function truncateLine(value: string, limit = 140): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

function normalizeItemType(raw: string | undefined): string {
  if (!raw) return "item";
  return raw.replace(/[_-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function itemTypeMeta(type: string): {
  label: string;
  tone: WorkLogEntry["tone"];
} {
  if (
    type.includes("preamble") ||
    type.includes("reasoning") ||
    type.includes("thought")
  ) {
    return { label: "Preamble", tone: "thinking" };
  }
  if (
    type.includes("tool") ||
    type.includes("command") ||
    type.includes("file change")
  ) {
    return { label: "Tool call", tone: "tool" };
  }
  if (type.includes("agent message")) {
    return { label: "Drafting response", tone: "thinking" };
  }
  return { label: "Work item", tone: "info" };
}

function extractDetail(
  payload: Record<string, unknown> | undefined,
  item: Record<string, unknown> | undefined,
): string | undefined {
  const candidates = [
    asString(item?.title),
    asString(item?.summary),
    asString(item?.text),
    asString(item?.command),
    asString(payload?.message),
    asString(payload?.prompt),
    asString(payload?.command),
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return truncateLine(candidate.trim());
    }
  }
  return undefined;
}

function entryFromItemLifecycle(event: ProviderEvent): WorkLogEntry | null {
  const payload = asObject(event.payload);
  const item = asObject(payload?.item);
  const normalizedType = normalizeItemType(asString(item?.type));
  const meta = itemTypeMeta(normalizedType);
  const isStarted = event.method === "item/started";
  const isCompleted = event.method === "item/completed";
  if (!isStarted && !isCompleted) {
    return null;
  }

  const label = isCompleted ? `${meta.label} complete` : meta.label;
  const detail = extractDetail(payload, item);
  return {
    id: event.id,
    createdAt: event.createdAt,
    label,
    ...(detail ? { detail } : {}),
    tone: meta.tone,
  };
}

function entryFromRequest(event: ProviderEvent): WorkLogEntry | null {
  if (event.kind !== "request") return null;

  if (event.method.includes("commandExecution")) {
    return {
      id: event.id,
      createdAt: event.createdAt,
      label: "Command approval requested",
      tone: "tool",
    };
  }

  if (event.method.includes("fileChange")) {
    return {
      id: event.id,
      createdAt: event.createdAt,
      label: "File-change approval requested",
      tone: "tool",
    };
  }

  if (event.method.includes("requestUserInput")) {
    return {
      id: event.id,
      createdAt: event.createdAt,
      label: "Tool requested user input",
      tone: "tool",
    };
  }

  return {
    id: event.id,
    createdAt: event.createdAt,
    label: `Request: ${event.method}`,
    tone: "info",
  };
}

function entryFromNotification(event: ProviderEvent): WorkLogEntry | null {
  if (event.kind !== "notification") return null;
  if (event.method === "item/agentMessage/delta") return null;
  if (event.method === "turn/started" || event.method === "turn/completed") {
    return null;
  }
  if (event.method === "thread/started") return null;

  const lifecycleEntry = entryFromItemLifecycle(event);
  if (lifecycleEntry) return lifecycleEntry;

  if (event.method.startsWith("item/")) {
    return {
      id: event.id,
      createdAt: event.createdAt,
      label: `Event: ${event.method.replace(/^item\//, "")}`,
      tone: "info",
    };
  }

  return null;
}

function entryFromError(event: ProviderEvent): WorkLogEntry | null {
  if (event.kind !== "error") return null;

  return {
    id: event.id,
    createdAt: event.createdAt,
    label: "Runtime error",
    ...(event.message ? { detail: truncateLine(event.message) } : {}),
    tone: "error",
  };
}

export function deriveWorkLogEntries(
  events: ProviderEvent[],
  turnId: string | undefined,
): WorkLogEntry[] {
  const ordered = [...events].reverse();
  const entries: WorkLogEntry[] = [];
  const turnStartedAtIso = turnId
    ? ordered.find((event) => {
        if (event.method !== "turn/started") return false;
        const payload = asObject(event.payload);
        const turn = asObject(payload?.turn);
        const startedTurnId = event.turnId ?? asString(turn?.id);
        return startedTurnId === turnId;
      })?.createdAt
    : undefined;
  const turnStartedAt = turnStartedAtIso
    ? Date.parse(turnStartedAtIso)
    : Number.NaN;

  for (const event of ordered) {
    if (turnId) {
      if (event.turnId && event.turnId !== turnId) {
        continue;
      }

      if (!event.turnId && !Number.isNaN(turnStartedAt)) {
        const eventAt = Date.parse(event.createdAt);
        if (!Number.isNaN(eventAt) && eventAt < turnStartedAt) {
          continue;
        }
      }
    }

    const fromRequest = entryFromRequest(event);
    if (fromRequest) {
      entries.push(fromRequest);
      continue;
    }

    const fromNotification = entryFromNotification(event);
    if (fromNotification) {
      entries.push(fromNotification);
      continue;
    }

    const fromError = entryFromError(event);
    if (fromError) {
      entries.push(fromError);
    }
  }

  return entries;
}

function toTimestamp(isoDate: string): number {
  const parsed = Date.parse(isoDate);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

export function deriveTimelineEntries(
  messages: ChatMessage[],
  workEntries: WorkLogEntry[],
): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  let messageIndex = 0;
  let workIndex = 0;

  while (messageIndex < messages.length || workIndex < workEntries.length) {
    const message = messages[messageIndex];
    const workEntry = workEntries[workIndex];

    if (!message && workEntry) {
      timeline.push({
        id: `work:${workEntry.id}`,
        kind: "work",
        createdAt: workEntry.createdAt,
        entry: workEntry,
      });
      workIndex += 1;
      continue;
    }

    if (!workEntry && message) {
      timeline.push({
        id: `message:${message.id}`,
        kind: "message",
        createdAt: message.createdAt,
        message,
      });
      messageIndex += 1;
      continue;
    }

    if (!message || !workEntry) {
      break;
    }

    const messageAt = toTimestamp(message.createdAt);
    const workAt = toTimestamp(workEntry.createdAt);

    if (workAt <= messageAt) {
      timeline.push({
        id: `work:${workEntry.id}`,
        kind: "work",
        createdAt: workEntry.createdAt,
        entry: workEntry,
      });
      workIndex += 1;
      continue;
    }

    timeline.push({
      id: `message:${message.id}`,
      kind: "message",
      createdAt: message.createdAt,
      message,
    });
    messageIndex += 1;
  }

  return timeline;
}

export function derivePhase(session: ProviderSession | null): SessionPhase {
  if (!session || session.status === "closed") return "disconnected";
  if (session.status === "connecting") return "connecting";
  if (session.status === "running") return "running";
  return "ready";
}

export function evolveSession(
  previous: ProviderSession,
  event: ProviderEvent,
): ProviderSession {
  const payload = asObject(event.payload);

  if (event.method === "thread/started") {
    const thread = asObject(payload?.thread);
    return {
      ...previous,
      threadId: asString(thread?.id) ?? event.threadId ?? previous.threadId,
      updatedAt: event.createdAt,
    };
  }

  if (event.method === "turn/started") {
    const turn = asObject(payload?.turn);
    return {
      ...previous,
      status: "running",
      activeTurnId: asString(turn?.id) ?? event.turnId ?? previous.activeTurnId,
      updatedAt: event.createdAt,
    };
  }

  if (event.method === "turn/completed") {
    const turn = asObject(payload?.turn);
    const status = asString(turn?.status);
    const turnError = asObject(turn?.error);
    return {
      ...previous,
      status: status === "failed" ? "error" : "ready",
      activeTurnId: undefined,
      lastError: asString(turnError?.message) ?? previous.lastError,
      updatedAt: event.createdAt,
    };
  }

  if (event.kind === "error") {
    return {
      ...previous,
      status: "error",
      lastError: event.message ?? previous.lastError,
      updatedAt: event.createdAt,
    };
  }

  if (event.method === "session/closed" || event.method === "session/exited") {
    return {
      ...previous,
      status: "closed",
      activeTurnId: undefined,
      lastError: event.message ?? previous.lastError,
      updatedAt: event.createdAt,
    };
  }

  return { ...previous, updatedAt: event.createdAt };
}

export function applyEventToMessages(
  previous: ChatMessage[],
  event: ProviderEvent,
  activeAssistantItemRef: { current: string | null },
): ChatMessage[] {
  const payload = asObject(event.payload);

  if (event.method === "item/started") {
    const item = asObject(payload?.item);
    if (asString(item?.type) !== "agentMessage") return previous;
    const itemId = asString(item?.id);
    if (!itemId) return previous;

    activeAssistantItemRef.current = itemId;
    const seedText = asString(item?.text) ?? "";
    const filtered = previous.filter((entry) => entry.id !== itemId);
    return [
      ...filtered,
      {
        id: itemId,
        role: "assistant",
        text: seedText,
        createdAt: event.createdAt,
        streaming: true,
      },
    ];
  }

  if (event.method === "item/agentMessage/delta") {
    const itemId = event.itemId ?? asString(payload?.itemId);
    const delta = event.textDelta ?? asString(payload?.delta) ?? "";
    if (!itemId || !delta) return previous;

    const existingIndex = previous.findIndex((entry) => entry.id === itemId);
    if (existingIndex === -1) {
      activeAssistantItemRef.current = itemId;
      return [
        ...previous,
        {
          id: itemId,
          role: "assistant",
          text: delta,
          createdAt: event.createdAt,
          streaming: true,
        },
      ];
    }

    const updated = [...previous];
    const existing = updated[existingIndex];
    if (!existing) return previous;
    updated[existingIndex] = {
      ...existing,
      text: `${existing.text}${delta}`,
      streaming: true,
    };
    return updated;
  }

  if (event.method === "item/completed") {
    const item = asObject(payload?.item);
    if (asString(item?.type) !== "agentMessage") return previous;
    const itemId = asString(item?.id);
    if (!itemId) return previous;

    const fullText = asString(item?.text);
    const existingIndex = previous.findIndex((entry) => entry.id === itemId);
    if (existingIndex === -1) {
      return [
        ...previous,
        {
          id: itemId,
          role: "assistant",
          text: fullText ?? "",
          createdAt: event.createdAt,
          streaming: false,
        },
      ];
    }

    const updated = [...previous];
    const existing = updated[existingIndex];
    if (!existing) return previous;
    updated[existingIndex] = {
      ...existing,
      text: fullText ?? existing.text,
      streaming: false,
    };

    if (activeAssistantItemRef.current === itemId) {
      activeAssistantItemRef.current = null;
    }
    return updated;
  }

  if (event.method === "turn/completed") {
    return previous.map((entry) => ({ ...entry, streaming: false }));
  }

  return previous;
}
