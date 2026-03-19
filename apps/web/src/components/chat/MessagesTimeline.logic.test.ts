import { describe, expect, it } from "vitest";
import {
  computeMessageDurationStart,
  deriveTimelineWorkEntryVisualState,
  formatWorkingTimer,
  normalizeCompactToolLabel,
  shouldAnimateAssistantResponseAfterTool,
} from "./MessagesTimeline.logic";

describe("computeMessageDurationStart", () => {
  it("returns message createdAt when there is no preceding user message", () => {
    const result = computeMessageDurationStart([
      {
        id: "a1",
        role: "assistant",
        createdAt: "2026-01-01T00:00:05Z",
        completedAt: "2026-01-01T00:00:10Z",
      },
    ]);
    expect(result).toEqual(new Map([["a1", "2026-01-01T00:00:05Z"]]));
  });

  it("uses the user message createdAt for the first assistant response", () => {
    const result = computeMessageDurationStart([
      { id: "u1", role: "user", createdAt: "2026-01-01T00:00:00Z" },
      {
        id: "a1",
        role: "assistant",
        createdAt: "2026-01-01T00:00:30Z",
        completedAt: "2026-01-01T00:00:30Z",
      },
    ]);

    expect(result).toEqual(
      new Map([
        ["u1", "2026-01-01T00:00:00Z"],
        ["a1", "2026-01-01T00:00:00Z"],
      ]),
    );
  });

  it("uses the previous assistant completedAt for subsequent assistant responses", () => {
    const result = computeMessageDurationStart([
      { id: "u1", role: "user", createdAt: "2026-01-01T00:00:00Z" },
      {
        id: "a1",
        role: "assistant",
        createdAt: "2026-01-01T00:00:30Z",
        completedAt: "2026-01-01T00:00:30Z",
      },
      {
        id: "a2",
        role: "assistant",
        createdAt: "2026-01-01T00:00:55Z",
        completedAt: "2026-01-01T00:00:55Z",
      },
    ]);

    expect(result).toEqual(
      new Map([
        ["u1", "2026-01-01T00:00:00Z"],
        ["a1", "2026-01-01T00:00:00Z"],
        ["a2", "2026-01-01T00:00:30Z"],
      ]),
    );
  });

  it("does not advance the boundary for a streaming message without completedAt", () => {
    const result = computeMessageDurationStart([
      { id: "u1", role: "user", createdAt: "2026-01-01T00:00:00Z" },
      { id: "a1", role: "assistant", createdAt: "2026-01-01T00:00:30Z" },
      {
        id: "a2",
        role: "assistant",
        createdAt: "2026-01-01T00:00:55Z",
        completedAt: "2026-01-01T00:00:55Z",
      },
    ]);

    expect(result).toEqual(
      new Map([
        ["u1", "2026-01-01T00:00:00Z"],
        ["a1", "2026-01-01T00:00:00Z"],
        ["a2", "2026-01-01T00:00:00Z"],
      ]),
    );
  });

  it("resets the boundary on a new user message", () => {
    const result = computeMessageDurationStart([
      { id: "u1", role: "user", createdAt: "2026-01-01T00:00:00Z" },
      {
        id: "a1",
        role: "assistant",
        createdAt: "2026-01-01T00:00:30Z",
        completedAt: "2026-01-01T00:00:30Z",
      },
      { id: "u2", role: "user", createdAt: "2026-01-01T00:01:00Z" },
      {
        id: "a2",
        role: "assistant",
        createdAt: "2026-01-01T00:01:20Z",
        completedAt: "2026-01-01T00:01:20Z",
      },
    ]);

    expect(result).toEqual(
      new Map([
        ["u1", "2026-01-01T00:00:00Z"],
        ["a1", "2026-01-01T00:00:00Z"],
        ["u2", "2026-01-01T00:01:00Z"],
        ["a2", "2026-01-01T00:01:00Z"],
      ]),
    );
  });

  it("handles system messages without affecting the boundary", () => {
    const result = computeMessageDurationStart([
      { id: "u1", role: "user", createdAt: "2026-01-01T00:00:00Z" },
      { id: "s1", role: "system", createdAt: "2026-01-01T00:00:01Z" },
      {
        id: "a1",
        role: "assistant",
        createdAt: "2026-01-01T00:00:30Z",
        completedAt: "2026-01-01T00:00:30Z",
      },
    ]);

    expect(result).toEqual(
      new Map([
        ["u1", "2026-01-01T00:00:00Z"],
        ["s1", "2026-01-01T00:00:00Z"],
        ["a1", "2026-01-01T00:00:00Z"],
      ]),
    );
  });

  it("returns empty map for empty input", () => {
    expect(computeMessageDurationStart([])).toEqual(new Map());
  });
});

describe("normalizeCompactToolLabel", () => {
  it("removes trailing completion wording from command labels", () => {
    expect(normalizeCompactToolLabel("Ran command complete")).toBe("Ran command");
  });

  it("removes trailing completion wording from other labels", () => {
    expect(normalizeCompactToolLabel("Read file completed")).toBe("Read file");
  });
});

describe("formatWorkingTimer", () => {
  it("formats sub-minute durations in seconds", () => {
    expect(formatWorkingTimer("2026-01-01T00:00:00Z", "2026-01-01T00:00:12Z")).toBe("12s");
  });

  it("formats minute and second durations", () => {
    expect(formatWorkingTimer("2026-01-01T00:00:00Z", "2026-01-01T00:01:09Z")).toBe("1m 9s");
  });

  it("formats hour durations compactly", () => {
    expect(formatWorkingTimer("2026-01-01T00:00:00Z", "2026-01-01T02:15:00Z")).toBe("2h 15m");
  });

  it("returns null for invalid timestamps", () => {
    expect(formatWorkingTimer("invalid", "2026-01-01T00:00:00Z")).toBeNull();
  });
});

describe("deriveTimelineWorkEntryVisualState", () => {
  it("marks the newest visible live entry as active", () => {
    expect(
      deriveTimelineWorkEntryVisualState({
        tone: "tool",
        isLiveGroup: true,
        isLatestVisibleEntry: true,
        entryIndex: 4,
        visibleEntryCount: 5,
      }),
    ).toBe("active");
  });

  it("keeps the trailing live context emphasized as recent", () => {
    expect(
      deriveTimelineWorkEntryVisualState({
        tone: "tool",
        isLiveGroup: true,
        isLatestVisibleEntry: false,
        entryIndex: 3,
        visibleEntryCount: 5,
      }),
    ).toBe("recent");
  });

  it("settles older live entries", () => {
    expect(
      deriveTimelineWorkEntryVisualState({
        tone: "tool",
        isLiveGroup: true,
        isLatestVisibleEntry: false,
        entryIndex: 0,
        visibleEntryCount: 5,
      }),
    ).toBe("settled");
  });

  it("keeps failed entries in the error state", () => {
    expect(
      deriveTimelineWorkEntryVisualState({
        tone: "error",
        isLiveGroup: true,
        isLatestVisibleEntry: true,
        entryIndex: 2,
        visibleEntryCount: 3,
      }),
    ).toBe("error");
  });

  it("settles finished groups", () => {
    expect(
      deriveTimelineWorkEntryVisualState({
        tone: "tool",
        isLiveGroup: false,
        isLatestVisibleEntry: true,
        entryIndex: 2,
        visibleEntryCount: 3,
      }),
    ).toBe("settled");
  });
});

describe("shouldAnimateAssistantResponseAfterTool", () => {
  it("animates assistant responses that follow work rows", () => {
    expect(
      shouldAnimateAssistantResponseAfterTool({
        messageRole: "assistant",
        previousRowKind: "work",
      }),
    ).toBe(true);
  });

  it("does not animate assistant responses when the previous row was not work", () => {
    expect(
      shouldAnimateAssistantResponseAfterTool({
        messageRole: "assistant",
        previousRowKind: "message",
      }),
    ).toBe(false);
  });

  it("does not animate non-assistant messages", () => {
    expect(
      shouldAnimateAssistantResponseAfterTool({
        messageRole: "user",
        previousRowKind: "work",
      }),
    ).toBe(false);
  });
});
