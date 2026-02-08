import { describe, expect, it } from "vitest";
import type { WorkLogEntry } from "./session-logic";
import { deriveTimelineEntries } from "./session-logic";
import type { ChatMessage } from "./types";

describe("deriveTimelineEntries", () => {
  it("interleaves messages and work entries by timestamp", () => {
    const messages: ChatMessage[] = [
      {
        id: "m-user",
        role: "user",
        text: "Hi",
        createdAt: "2026-02-08T10:00:00.000Z",
        streaming: false,
      },
      {
        id: "m-assistant",
        role: "assistant",
        text: "Hello",
        createdAt: "2026-02-08T10:05:00.000Z",
        streaming: false,
      },
    ];
    const workEntries: WorkLogEntry[] = [
      {
        id: "w-1",
        label: "Tool call",
        createdAt: "2026-02-08T10:02:00.000Z",
        tone: "tool",
      },
      {
        id: "w-2",
        label: "Preamble",
        createdAt: "2026-02-08T10:03:00.000Z",
        tone: "thinking",
      },
    ];

    const timeline = deriveTimelineEntries(messages, workEntries);

    expect(timeline.map((entry) => entry.id)).toEqual([
      "message:m-user",
      "work:w-1",
      "work:w-2",
      "message:m-assistant",
    ]);
  });

  it("prefers work entries when timestamps are equal", () => {
    const messages: ChatMessage[] = [
      {
        id: "m-1",
        role: "assistant",
        text: "Done",
        createdAt: "2026-02-08T10:00:00.000Z",
        streaming: false,
      },
    ];
    const workEntries: WorkLogEntry[] = [
      {
        id: "w-1",
        label: "Tool call",
        createdAt: "2026-02-08T10:00:00.000Z",
        tone: "tool",
      },
    ];

    const timeline = deriveTimelineEntries(messages, workEntries);

    expect(timeline.map((entry) => entry.id)).toEqual([
      "work:w-1",
      "message:m-1",
    ]);
  });
});
