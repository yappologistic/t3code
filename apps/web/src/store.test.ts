import {
  DEFAULT_MODEL_BY_PROVIDER,
  MessageId,
  ProjectId,
  ThreadId,
  TurnId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { markThreadUnread, reorderProjects, syncServerReadModel, type AppState } from "./store";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Thread } from "./types";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: ThreadId.makeUnsafe("thread-1"),
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe("project-1"),
    title: "Thread",
    provider: "codex",
    model: "gpt-5-codex",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    messages: [],
    turnDiffSummaries: [],
    activities: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-02-13T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    ...overrides,
  };
}

function makeState(thread: Thread): AppState {
  return {
    projects: [
      {
        id: ProjectId.makeUnsafe("project-1"),
        name: "Project",
        cwd: "/tmp/project",
        model: "gpt-5-codex",
        expanded: true,
        scripts: [],
      },
    ],
    threads: [thread],
    threadsHydrated: true,
  };
}

function makeReadModelThread(overrides: Partial<OrchestrationReadModel["threads"][number]>) {
  return {
    id: ThreadId.makeUnsafe("thread-1"),
    projectId: ProjectId.makeUnsafe("project-1"),
    title: "Thread",
    model: "gpt-5.3-codex",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-02-27T00:00:00.000Z",
    updatedAt: "2026-02-27T00:00:00.000Z",
    deletedAt: null,
    messages: [],
    activities: [],
    proposedPlans: [],
    checkpoints: [],
    session: null,
    ...overrides,
  } satisfies OrchestrationReadModel["threads"][number];
}

function makeReadModel(thread: OrchestrationReadModel["threads"][number]): OrchestrationReadModel {
  return {
    snapshotSequence: 1,
    updatedAt: "2026-02-27T00:00:00.000Z",
    projects: [
      {
        id: ProjectId.makeUnsafe("project-1"),
        title: "Project",
        workspaceRoot: "/tmp/project",
        defaultModel: "gpt-5.3-codex",
        createdAt: "2026-02-27T00:00:00.000Z",
        updatedAt: "2026-02-27T00:00:00.000Z",
        deletedAt: null,
        scripts: [],
      },
    ],
    threads: [thread],
  };
}

function makeReadModelProject(
  overrides: Partial<OrchestrationReadModel["projects"][number]>,
): OrchestrationReadModel["projects"][number] {
  return {
    id: ProjectId.makeUnsafe("project-1"),
    title: "Project",
    workspaceRoot: "/tmp/project",
    defaultModel: "gpt-5.3-codex",
    createdAt: "2026-02-27T00:00:00.000Z",
    updatedAt: "2026-02-27T00:00:00.000Z",
    deletedAt: null,
    scripts: [],
    ...overrides,
  };
}

describe("store pure functions", () => {
  it("markThreadUnread moves lastVisitedAt before completion for a completed thread", () => {
    const latestTurnCompletedAt = "2026-02-25T12:30:00.000Z";
    const initialState = makeState(
      makeThread({
        latestTurn: {
          turnId: TurnId.makeUnsafe("turn-1"),
          state: "completed",
          requestedAt: "2026-02-25T12:28:00.000Z",
          startedAt: "2026-02-25T12:28:30.000Z",
          completedAt: latestTurnCompletedAt,
          assistantMessageId: null,
        },
        lastVisitedAt: "2026-02-25T12:35:00.000Z",
      }),
    );

    const next = markThreadUnread(initialState, ThreadId.makeUnsafe("thread-1"));

    const updatedThread = next.threads[0];
    expect(updatedThread).toBeDefined();
    expect(updatedThread?.lastVisitedAt).toBe("2026-02-25T12:29:59.999Z");
    expect(Date.parse(updatedThread?.lastVisitedAt ?? "")).toBeLessThan(
      Date.parse(latestTurnCompletedAt),
    );
  });

  it("markThreadUnread does not change a thread without a completed turn", () => {
    const initialState = makeState(
      makeThread({
        latestTurn: null,
        lastVisitedAt: "2026-02-25T12:35:00.000Z",
      }),
    );

    const next = markThreadUnread(initialState, ThreadId.makeUnsafe("thread-1"));

    expect(next).toEqual(initialState);
  });

  it("reorderProjects moves a project to a target index", () => {
    const project1 = ProjectId.makeUnsafe("project-1");
    const project2 = ProjectId.makeUnsafe("project-2");
    const project3 = ProjectId.makeUnsafe("project-3");
    const state: AppState = {
      projects: [
        {
          id: project1,
          name: "Project 1",
          cwd: "/tmp/project-1",
          model: DEFAULT_MODEL_BY_PROVIDER.codex,
          expanded: true,
          scripts: [],
        },
        {
          id: project2,
          name: "Project 2",
          cwd: "/tmp/project-2",
          model: DEFAULT_MODEL_BY_PROVIDER.codex,
          expanded: true,
          scripts: [],
        },
        {
          id: project3,
          name: "Project 3",
          cwd: "/tmp/project-3",
          model: DEFAULT_MODEL_BY_PROVIDER.codex,
          expanded: true,
          scripts: [],
        },
      ],
      threads: [],
      threadsHydrated: true,
    };

    const next = reorderProjects(state, project1, project3);

    expect(next.projects.map((project) => project.id)).toEqual([project2, project3, project1]);
  });
});

describe("store read model sync", () => {
  it("preserves non-codex project default models from the read model", () => {
    const initialState: AppState = {
      projects: [],
      threads: [],
      threadsHydrated: true,
    };
    const readModel: OrchestrationReadModel = {
      snapshotSequence: 1,
      updatedAt: "2026-02-27T00:00:00.000Z",
      projects: [
        makeReadModelProject({
          defaultModel: "minimax-coding-plan/MiniMax-M2.7",
        }),
      ],
      threads: [],
    };

    const next = syncServerReadModel(initialState, readModel);

    expect(next.projects[0]?.model).toBe("minimax-coding-plan/MiniMax-M2.7");
  });

  it("updates an existing project's default model from the latest read model", () => {
    const initialState = makeState(makeThread());
    const readModel: OrchestrationReadModel = {
      snapshotSequence: 2,
      updatedAt: "2026-02-27T00:00:01.000Z",
      projects: [
        makeReadModelProject({
          defaultModel: "minimax-coding-plan/MiniMax-M2.7",
        }),
      ],
      threads: [makeReadModelThread({ projectId: ProjectId.makeUnsafe("project-1") })],
    };

    const next = syncServerReadModel(initialState, readModel);

    expect(next.projects[0]?.model).toBe("minimax-coding-plan/MiniMax-M2.7");
  });

  it("falls back to the codex default for unsupported provider models without an active session", () => {
    const initialState = makeState(makeThread());
    const readModel = makeReadModel(
      makeReadModelThread({
        model: "claude-opus-4-6",
      }),
    );

    const next = syncServerReadModel(initialState, readModel);

    expect(next.threads[0]?.model).toBe(DEFAULT_MODEL_BY_PROVIDER.codex);
  });

  it("preserves legacy Copilot threads when older snapshots lack session provider metadata", () => {
    const initialState: AppState = {
      projects: [],
      threads: [],
      threadsHydrated: true,
    };
    const readModel = makeReadModel(
      makeReadModelThread({
        model: "goldeneye",
        session: null,
      }),
    );

    const next = syncServerReadModel(initialState, readModel);

    expect(next.threads[0]?.provider).toBe("copilot");
    expect(next.threads[0]?.model).toBe("goldeneye");
  });

  it("preserves active Kimi session models that are not part of the built-in catalog", () => {
    const initialState = makeState(makeThread());
    const readModel = makeReadModel(
      makeReadModelThread({
        model: "kimi-k2-thinking",
        session: {
          threadId: ThreadId.makeUnsafe("thread-1"),
          status: "ready",
          providerName: "kimi",
          runtimeMode: DEFAULT_RUNTIME_MODE,
          activeTurnId: null,
          lastError: null,
          updatedAt: "2026-02-27T00:00:01.000Z",
        },
      }),
    );

    const next = syncServerReadModel(initialState, readModel);

    expect(next.threads[0]?.model).toBe("kimi-k2-thinking");
  });

  it("preserves the existing thread provider when the live session disappears", () => {
    const initialState = makeState(
      makeThread({
        provider: "copilot",
        model: "gpt-5.4",
      }),
    );
    const readModel = makeReadModel(
      makeReadModelThread({
        model: "gpt-5.4",
        session: null,
      }),
    );

    const next = syncServerReadModel(initialState, readModel);

    expect(next.threads[0]?.provider).toBe("copilot");
    expect(next.threads[0]?.model).toBe("gpt-5.4");
  });

  it("preserves supported custom-provider models after the live session disappears", () => {
    const initialState = makeState(
      makeThread({
        provider: "copilot",
        model: "custom/internal-model",
      }),
    );
    const readModel = makeReadModel(
      makeReadModelThread({
        model: "custom/internal-model",
        session: null,
      }),
    );

    const next = syncServerReadModel(initialState, readModel);

    expect(next.threads[0]?.provider).toBe("copilot");
    expect(next.threads[0]?.model).toBe("custom/internal-model");
  });

  it("preserves saved OpenRouter free models after the live session disappears", () => {
    const initialState = makeState(
      makeThread({
        provider: "codex",
        model: "openai/gpt-oss-120b:free",
      }),
    );
    const readModel = makeReadModel(
      makeReadModelThread({
        model: "openai/gpt-oss-120b:free",
        session: null,
      }),
    );

    const next = syncServerReadModel(initialState, readModel);

    expect(next.threads[0]?.provider).toBe("codex");
    expect(next.threads[0]?.model).toBe("openai/gpt-oss-120b:free");
  });

  it("preserves the current project order when syncing incoming read model updates", () => {
    const project1 = ProjectId.makeUnsafe("project-1");
    const project2 = ProjectId.makeUnsafe("project-2");
    const project3 = ProjectId.makeUnsafe("project-3");
    const initialState: AppState = {
      projects: [
        {
          id: project2,
          name: "Project 2",
          cwd: "/tmp/project-2",
          model: DEFAULT_MODEL_BY_PROVIDER.codex,
          expanded: true,
          scripts: [],
        },
        {
          id: project1,
          name: "Project 1",
          cwd: "/tmp/project-1",
          model: DEFAULT_MODEL_BY_PROVIDER.codex,
          expanded: true,
          scripts: [],
        },
      ],
      threads: [],
      threadsHydrated: true,
    };
    const readModel: OrchestrationReadModel = {
      snapshotSequence: 2,
      updatedAt: "2026-02-27T00:00:00.000Z",
      projects: [
        makeReadModelProject({
          id: project1,
          title: "Project 1",
          workspaceRoot: "/tmp/project-1",
        }),
        makeReadModelProject({
          id: project2,
          title: "Project 2",
          workspaceRoot: "/tmp/project-2",
        }),
        makeReadModelProject({
          id: project3,
          title: "Project 3",
          workspaceRoot: "/tmp/project-3",
        }),
      ],
      threads: [],
    };

    const next = syncServerReadModel(initialState, readModel);

    expect(next.projects.map((project) => project.id)).toEqual([project2, project1, project3]);
  });

  it("preserves websocket base paths and auth tokens in attachment preview urls", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          href: "http://localhost:3020/?token=secret-token&view=settings",
          protocol: "http:",
          hostname: "localhost",
          port: "3020",
          pathname: "/",
          search: "?token=secret-token&view=settings",
          hash: "",
        },
        history: {
          state: null,
          replaceState: () => undefined,
        },
        desktopBridge: {
          getWsUrl: () => "ws://127.0.0.1:3773/base/",
        },
      },
    });

    try {
      const initialState = makeState(makeThread());
      const readModel = makeReadModel(
        makeReadModelThread({
          messages: [
            {
              id: MessageId.makeUnsafe("message-1"),
              role: "user",
              text: "hello",
              attachments: [
                {
                  type: "image",
                  id: "attachment-1",
                  name: "preview.png",
                  mimeType: "image/png",
                  sizeBytes: 1,
                },
              ],
              turnId: null,
              streaming: false,
              createdAt: "2026-02-27T00:00:00.000Z",
              updatedAt: "2026-02-27T00:00:00.000Z",
            },
          ],
        }),
      );

      const next = syncServerReadModel(initialState, readModel);

      expect(next.threads[0]?.messages[0]?.attachments?.[0]?.previewUrl).toBe(
        "http://127.0.0.1:3773/base/attachments/attachment-1?token=secret-token",
      );
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });
});
