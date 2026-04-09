import { ProjectId, ThreadId, TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import type { Project, Thread } from "../types";
import { buildSidebarProjectEntries, hasUnseenCompletion } from "./Sidebar.logic";

const projectId = (value: string) => ProjectId.makeUnsafe(value);
const threadId = (value: string) => ThreadId.makeUnsafe(value);
const turnId = (value: string) => TurnId.makeUnsafe(value);

const baseProject = (overrides: Partial<Project> = {}): Project => ({
  id: projectId("project-1"),
  name: "Alpha",
  cwd: "/repo/alpha",
  model: "gpt-5.4",
  expanded: true,
  scripts: [],
  updatedAt: "2026-03-26T10:00:00.000Z",
  ...overrides,
});

const baseThread = (overrides: Partial<Thread> = {}): Thread => ({
  id: threadId("thread-1"),
  codexThreadId: null,
  projectId: projectId("project-1"),
  title: "First thread",
  goal: null,
  model: "gpt-5.4",
  runtimeMode: "full-access",
  interactionMode: "default",
  session: null,
  messages: [],
  proposedPlans: [],
  error: null,
  createdAt: "2026-03-26T10:00:00.000Z",
  updatedAt: "2026-03-26T10:10:00.000Z",
  latestTurn: null,
  branch: null,
  worktreePath: null,
  turnDiffSummaries: [],
  activities: [],
  ...overrides,
});

describe("Sidebar.logic", () => {
  it("marks a thread as unseen when the latest completion is newer than the visit time", () => {
    expect(
      hasUnseenCompletion({
        interactionMode: "default",
        latestTurn: {
          turnId: turnId("turn-1"),
          state: "completed",
          requestedAt: "2026-03-26T10:00:00.000Z",
          startedAt: "2026-03-26T10:00:01.000Z",
          completedAt: "2026-03-26T10:01:00.000Z",
          assistantMessageId: null,
        },
        proposedPlans: [],
        lastVisitedAt: "2026-03-26T10:00:30.000Z",
        session: null,
      }),
    ).toBe(true);
  });

  it("sorts pinned projects and pinned threads ahead of newer unpinned items", () => {
    const entries = buildSidebarProjectEntries({
      projects: [
        baseProject({
          id: projectId("project-a"),
          name: "Alpha",
          updatedAt: "2026-03-26T09:00:00.000Z",
        }),
        baseProject({
          id: projectId("project-b"),
          name: "Beta",
          updatedAt: "2026-03-26T11:00:00.000Z",
        }),
      ],
      threads: [
        baseThread({
          id: threadId("thread-a"),
          projectId: projectId("project-a"),
          updatedAt: "2026-03-26T09:10:00.000Z",
        }),
        baseThread({
          id: threadId("thread-b"),
          projectId: projectId("project-a"),
          updatedAt: "2026-03-26T11:10:00.000Z",
        }),
      ],
      query: "",
      filterMode: "active",
      projectSortMode: "recent",
      pinnedProjectIds: new Set([projectId("project-a")]),
      pinnedThreadIds: new Set([threadId("thread-a")]),
    });

    expect(entries.map((entry) => entry.project.id)).toEqual([
      projectId("project-a"),
      projectId("project-b"),
    ]);
    expect(entries[0]?.threads.map((entry) => entry.thread.id)).toEqual([
      threadId("thread-a"),
      threadId("thread-b"),
    ]);
  });

  it("filters archived projects and threads out of the active view", () => {
    const entries = buildSidebarProjectEntries({
      projects: [
        baseProject({ id: projectId("project-active"), name: "Active project" }),
        baseProject({ id: projectId("project-archived"), name: "Archived project" }),
      ],
      threads: [
        baseThread({
          id: threadId("thread-active"),
          projectId: projectId("project-active"),
          title: "Visible thread",
        }),
        baseThread({
          id: threadId("thread-archived"),
          projectId: projectId("project-active"),
          title: "Hidden thread",
          updatedAt: "2026-03-26T12:00:00.000Z",
        }),
      ],
      query: "",
      filterMode: "active",
      projectSortMode: "recent",
      archivedProjectIds: new Set([projectId("project-archived")]),
      archivedThreadIds: new Set([threadId("thread-archived")]),
    });

    expect(entries.map((entry) => entry.project.id)).toEqual([projectId("project-active")]);
    expect(entries[0]?.threads.map((entry) => entry.thread.id)).toEqual([
      threadId("thread-active"),
    ]);
  });

  it("keeps a project visible when the query matches one of its threads", () => {
    const entries = buildSidebarProjectEntries({
      projects: [baseProject({ id: projectId("project-search"), name: "Searchable" })],
      threads: [
        baseThread({
          id: threadId("thread-one"),
          projectId: projectId("project-search"),
          title: "Fix queue bug",
        }),
        baseThread({
          id: threadId("thread-two"),
          projectId: projectId("project-search"),
          title: "Refactor sidebar",
        }),
      ],
      query: "queue",
      filterMode: "active",
      projectSortMode: "recent",
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.threads.map((entry) => entry.thread.id)).toEqual([threadId("thread-one")]);
  });

  it("shows every visible thread when the project itself matches the query", () => {
    const entries = buildSidebarProjectEntries({
      projects: [baseProject({ id: projectId("project-alpha"), name: "Alpha workspace" })],
      threads: [
        baseThread({
          id: threadId("thread-one"),
          projectId: projectId("project-alpha"),
          title: "Fix queue bug",
          updatedAt: "2026-03-26T10:11:00.000Z",
        }),
        baseThread({
          id: threadId("thread-two"),
          projectId: projectId("project-alpha"),
          title: "Refactor sidebar",
          updatedAt: "2026-03-26T10:10:00.000Z",
        }),
      ],
      query: "alpha",
      filterMode: "active",
      projectSortMode: "recent",
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.matchedProject).toBe(true);
    expect(entries[0]?.threads.map((entry) => entry.thread.id)).toEqual([
      threadId("thread-one"),
      threadId("thread-two"),
    ]);
  });
});
