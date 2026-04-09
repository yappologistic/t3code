import { ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import type { Project, Thread } from "../types";
import {
  buildProjectRecencyById,
  compareProjectsForSidebar,
  compareThreadsByRecency,
  matchesSidebarSearch,
  selectLatestThreadForNavigation,
} from "./threadOrdering";

const projectId = (value: string) => ProjectId.makeUnsafe(value);
const threadId = (value: string) => ThreadId.makeUnsafe(value);

const project = (overrides: Partial<Project> = {}): Project => ({
  id: projectId("project-1"),
  name: "Alpha",
  cwd: "/repo/alpha",
  model: "gpt-5.4",
  expanded: true,
  scripts: [],
  updatedAt: "2026-03-26T10:00:00.000Z",
  ...overrides,
});

const thread = (overrides: Partial<Thread> = {}): Thread => ({
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

describe("threadOrdering", () => {
  it("sorts newer thread activity ahead of older threads", () => {
    expect(
      compareThreadsByRecency(
        thread({ id: threadId("thread-old"), updatedAt: "2026-03-26T09:00:00.000Z" }),
        thread({ id: threadId("thread-new"), updatedAt: "2026-03-26T11:00:00.000Z" }),
      ),
    ).toBeGreaterThan(0);
  });

  it("derives project recency from the newest thread in that project", () => {
    const recencyByProjectId = buildProjectRecencyById({
      projects: [project({ id: projectId("project-a"), updatedAt: "2026-03-26T09:00:00.000Z" })],
      threads: [
        thread({
          id: threadId("thread-a"),
          projectId: projectId("project-a"),
          updatedAt: "2026-03-26T11:15:00.000Z",
        }),
      ],
    });

    expect(recencyByProjectId.get(projectId("project-a"))).toBe(
      Date.parse("2026-03-26T11:15:00.000Z"),
    );
  });

  it("keeps pinned projects ahead of newer unpinned projects", () => {
    const projects = [
      project({
        id: projectId("project-pinned"),
        cwd: "/repo/pinned",
        updatedAt: "2026-03-26T09:00:00.000Z",
      }),
      project({
        id: projectId("project-recent"),
        cwd: "/repo/recent",
        updatedAt: "2026-03-26T11:00:00.000Z",
      }),
    ].toSorted((left, right) =>
      compareProjectsForSidebar({
        left,
        right,
        pinnedProjectIds: new Set([projectId("project-pinned")]),
        sortMode: "recent",
      }),
    );

    expect(projects.map((entry) => entry.id)).toEqual([
      projectId("project-pinned"),
      projectId("project-recent"),
    ]);
  });

  it("matches search queries against project names, paths, thread titles, and models", () => {
    expect(
      matchesSidebarSearch({
        query: "alpha",
        project: project(),
      }),
    ).toBe(true);
    expect(
      matchesSidebarSearch({
        query: "gpt-5.4",
        project: project(),
        thread: thread(),
      }),
    ).toBe(true);
    expect(
      matchesSidebarSearch({
        query: "missing",
        project: project(),
        thread: thread(),
      }),
    ).toBe(false);
  });

  it("selects the latest non-archived thread for desktop bootstrap", () => {
    const latestThreadId = selectLatestThreadForNavigation({
      threads: [
        thread({ id: threadId("thread-older"), updatedAt: "2026-03-26T09:00:00.000Z" }),
        thread({ id: threadId("thread-archived"), updatedAt: "2026-03-26T12:00:00.000Z" }),
        thread({ id: threadId("thread-latest"), updatedAt: "2026-03-26T11:00:00.000Z" }),
      ],
      archivedThreadIds: new Set([threadId("thread-archived")]),
    });

    expect(latestThreadId).toBe(threadId("thread-latest"));
  });
});
