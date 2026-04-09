import { CheckpointRef, MessageId, ProjectId, ThreadId, TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import type { ThreadTask, WorkLogEntry } from "./session-logic";
import { buildThreadExportContents, buildThreadExportFilename } from "./threadExport";
import type { Project, Thread } from "./types";

const project: Project = {
  id: ProjectId.makeUnsafe("project-export"),
  name: "Export Project",
  cwd: "/tmp/export-project",
  model: "gpt-5-codex",
  expanded: true,
  scripts: [],
};

const thread: Thread = {
  id: ThreadId.makeUnsafe("thread-export"),
  codexThreadId: null,
  projectId: project.id,
  title: "Export Thread!",
  goal: null,
  provider: "codex",
  model: "gpt-5-codex",
  runtimeMode: "approval-required",
  interactionMode: "default",
  session: null,
  messages: [
    {
      id: MessageId.makeUnsafe("message-user-export"),
      role: "user",
      text: "Please inspect the workspace",
      attachments: [
        {
          type: "image",
          id: "attachment-image-1",
          name: "diagram.png",
          mimeType: "image/png",
          sizeBytes: 2048,
        },
      ],
      createdAt: "2026-03-01T10:00:00.000Z",
      streaming: false,
    },
    {
      id: MessageId.makeUnsafe("message-assistant-export"),
      role: "assistant",
      text: "Workspace inspected.",
      createdAt: "2026-03-01T10:00:05.000Z",
      completedAt: "2026-03-01T10:00:06.000Z",
      streaming: false,
    },
  ],
  proposedPlans: [
    {
      id: "plan-export-1",
      turnId: TurnId.makeUnsafe("turn-export-1"),
      planMarkdown: "1. Inspect workspace\n2. Report findings",
      createdAt: "2026-03-01T10:00:02.000Z",
      updatedAt: "2026-03-01T10:00:03.000Z",
    },
  ],
  error: null,
  createdAt: "2026-03-01T09:59:00.000Z",
  latestTurn: null,
  branch: "feature/export",
  worktreePath: "/tmp/export-project/worktree",
  turnDiffSummaries: [
    {
      turnId: TurnId.makeUnsafe("turn-export-1"),
      completedAt: "2026-03-01T10:00:06.000Z",
      status: "ready",
      checkpointRef: CheckpointRef.makeUnsafe("refs/t3/checkpoints/thread-export/turn/1"),
      checkpointTurnCount: 1,
      assistantMessageId: MessageId.makeUnsafe("message-assistant-export"),
      files: [
        {
          path: "src/app.ts",
          kind: "modified",
          additions: 8,
          deletions: 3,
        },
      ],
    },
  ],
  activities: [],
};

const tasks: ThreadTask[] = [
  {
    taskId: "task-export-1",
    turnId: TurnId.makeUnsafe("turn-export-1"),
    taskType: "analysis",
    title: "Inspect workspace",
    status: "completed",
    startedAt: "2026-03-01T10:00:01.000Z",
    completedAt: "2026-03-01T10:00:04.000Z",
    summary: "Inspection finished",
    usage: { promptTokens: 128 },
    progressUpdates: [
      {
        id: "task-export-progress-1",
        createdAt: "2026-03-01T10:00:02.500Z",
        description: "Scanning repository",
        lastToolName: "read_file",
      },
    ],
  },
];

const workLogEntries: WorkLogEntry[] = [
  {
    id: "work-log-export-1",
    createdAt: "2026-03-01T10:00:03.000Z",
    label: "Ran repository check",
    command: "bun run test",
    changedFiles: ["src/app.ts"],
    tone: "tool",
  },
];

describe("threadExport", () => {
  it("builds a sanitized export filename", () => {
    expect(buildThreadExportFilename(thread, "markdown")).toBe("export-thread.md");
    expect(buildThreadExportFilename(thread, "json")).toBe("export-thread.json");
  });

  it("serializes thread exports as json with tasks, work log, diffs, and attachments", () => {
    const contents = buildThreadExportContents("json", {
      thread,
      project,
      provider: "codex",
      workLogEntries,
      tasks,
      exportedAt: "2026-03-01T10:01:00.000Z",
    });

    const parsed = JSON.parse(contents) as {
      version: number;
      thread: { title: string; provider: string | null };
      tasks: Array<{ title: string; progressUpdates: Array<{ description: string }> }>;
      workLogEntries: Array<{ command?: string }>;
      diffSummaries: Array<{
        assistantMessageId: string | null;
        additions: number;
        deletions: number;
      }>;
      attachments: Array<{ name: string; mimeType: string }>;
    };

    expect(parsed.version).toBe(1);
    expect(parsed.thread).toMatchObject({
      title: "Export Thread!",
      provider: "codex",
    });
    expect(parsed.tasks[0]).toMatchObject({
      title: "Inspect workspace",
      progressUpdates: [{ description: "Scanning repository" }],
    });
    expect(parsed.workLogEntries[0]?.command).toBe("bun run test");
    expect(parsed.diffSummaries[0]).toMatchObject({
      assistantMessageId: "message-assistant-export",
      additions: 8,
      deletions: 3,
    });
    expect(parsed.attachments).toEqual([
      expect.objectContaining({
        name: "diagram.png",
        mimeType: "image/png",
      }),
    ]);
  });

  it("serializes thread exports as markdown with the expected sections", () => {
    const contents = buildThreadExportContents("markdown", {
      thread,
      project,
      provider: "codex",
      workLogEntries,
      tasks,
      exportedAt: "2026-03-01T10:01:00.000Z",
    });

    expect(contents).toContain("# Export Thread!");
    expect(contents).toContain("## Conversation");
    expect(contents).toContain("## Proposed Plans");
    expect(contents).toContain("## Tasks");
    expect(contents).toContain("Inspect workspace");
    expect(contents).toContain("## Work Log");
    expect(contents).toContain("bun run test");
    expect(contents).toContain("## Diff Summaries");
    expect(contents).toContain("src/app.ts");
    expect(contents).toContain("## Attachments");
    expect(contents).toContain("diagram.png");
  });
});
