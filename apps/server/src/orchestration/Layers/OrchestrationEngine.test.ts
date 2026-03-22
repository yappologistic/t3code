import {
  CheckpointRef,
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  MessageId,
  ProjectId,
  ThreadId,
  TurnId,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import { Effect, Fiber, Layer, ManagedRuntime, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { PersistenceSqlError } from "../../persistence/Errors.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../../persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import {
  OrchestrationEventStore,
  type OrchestrationEventStoreShape,
} from "../../persistence/Services/OrchestrationEventStore.ts";
import { OrchestrationEngineLive } from "./OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  OrchestrationProjectionPipeline,
  type OrchestrationProjectionPipelineShape,
} from "../Services/ProjectionPipeline.ts";
import { ServerConfig } from "../../config.ts";
import * as NodeServices from "@effect/platform-node/NodeServices";

const asProjectId = (value: string): ProjectId => ProjectId.makeUnsafe(value);
const asMessageId = (value: string): MessageId => MessageId.makeUnsafe(value);
const asTurnId = (value: string): TurnId => TurnId.makeUnsafe(value);
const asCheckpointRef = (value: string): CheckpointRef => CheckpointRef.makeUnsafe(value);

async function createOrchestrationSystem() {
  const orchestrationLayer = OrchestrationEngineLive.pipe(
    Layer.provide(OrchestrationProjectionPipelineLive),
    Layer.provide(OrchestrationEventStoreLive),
    Layer.provide(OrchestrationCommandReceiptRepositoryLive),
    Layer.provide(SqlitePersistenceMemory),
    Layer.provideMerge(ServerConfig.layerTest(process.cwd(), process.cwd())),
    Layer.provideMerge(NodeServices.layer),
  );
  const runtime = ManagedRuntime.make(orchestrationLayer);
  const engine = await runtime.runPromise(Effect.service(OrchestrationEngineService));
  return {
    engine,
    run: <A, E>(effect: Effect.Effect<A, E>) => runtime.runPromise(effect),
    dispose: () => runtime.dispose(),
  };
}

function now() {
  return new Date().toISOString();
}

describe("OrchestrationEngine", () => {
  it("returns deterministic read models for repeated reads", async () => {
    const createdAt = now();
    const system = await createOrchestrationSystem();
    const { engine } = system;

    await system.run(
      engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-project-1-create"),
        projectId: asProjectId("project-1"),
        title: "Project 1",
        workspaceRoot: "/tmp/project-1",
        defaultModel: "gpt-5-codex",
        createdAt,
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.create",
        commandId: CommandId.makeUnsafe("cmd-thread-1-create"),
        threadId: ThreadId.makeUnsafe("thread-1"),
        projectId: asProjectId("project-1"),
        title: "Thread",
        model: "gpt-5-codex",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        createdAt,
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.turn.start",
        commandId: CommandId.makeUnsafe("cmd-turn-start-1"),
        threadId: ThreadId.makeUnsafe("thread-1"),
        message: {
          messageId: asMessageId("msg-1"),
          role: "user",
          text: "hello",
          attachments: [],
        },
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        createdAt,
      }),
    );

    const readModelA = await system.run(engine.getReadModel());
    const readModelB = await system.run(engine.getReadModel());
    expect(readModelB).toEqual(readModelA);
    await system.dispose();
  });

  it("replays append-only events from sequence", async () => {
    const system = await createOrchestrationSystem();
    const { engine } = system;
    const createdAt = now();

    await system.run(
      engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-project-replay-create"),
        projectId: asProjectId("project-replay"),
        title: "Replay Project",
        workspaceRoot: "/tmp/project-replay",
        defaultModel: "gpt-5-codex",
        createdAt,
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.create",
        commandId: CommandId.makeUnsafe("cmd-thread-replay-create"),
        threadId: ThreadId.makeUnsafe("thread-replay"),
        projectId: asProjectId("project-replay"),
        title: "replay",
        model: "gpt-5-codex",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        createdAt,
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.delete",
        commandId: CommandId.makeUnsafe("cmd-thread-replay-delete"),
        threadId: ThreadId.makeUnsafe("thread-replay"),
      }),
    );

    const events = await system.run(
      Stream.runCollect(engine.readEvents(0)).pipe(
        Effect.map((chunk): OrchestrationEvent[] => Array.from(chunk)),
      ),
    );
    expect(events.map((event) => event.type)).toEqual([
      "project.created",
      "thread.created",
      "thread.deleted",
    ]);
    await system.dispose();
  });

  it("streams persisted domain events in order", async () => {
    const system = await createOrchestrationSystem();
    const { engine } = system;
    const createdAt = now();

    await system.run(
      engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-project-stream-create"),
        projectId: asProjectId("project-stream"),
        title: "Stream Project",
        workspaceRoot: "/tmp/project-stream",
        defaultModel: "gpt-5-codex",
        createdAt,
      }),
    );

    const eventTypes: string[] = [];
    await system.run(
      Effect.gen(function* () {
        const eventFiber = yield* Stream.take(engine.streamDomainEvents, 2).pipe(
          Stream.runCollect,
          Effect.forkScoped,
        );
        yield* Effect.yieldNow;
        yield* engine.dispatch({
          type: "thread.create",
          commandId: CommandId.makeUnsafe("cmd-stream-thread-create"),
          threadId: ThreadId.makeUnsafe("thread-stream"),
          projectId: asProjectId("project-stream"),
          title: "domain-stream",
          model: "gpt-5-codex",
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "approval-required",
          branch: null,
          worktreePath: null,
          createdAt,
        });
        yield* engine.dispatch({
          type: "thread.meta.update",
          commandId: CommandId.makeUnsafe("cmd-stream-thread-update"),
          threadId: ThreadId.makeUnsafe("thread-stream"),
          title: "domain-stream-updated",
        });

        const events = Array.from(yield* Fiber.join(eventFiber));
        eventTypes.push(...events.map((event) => event.type));
      }).pipe(Effect.scoped),
    );

    expect(eventTypes).toEqual(["thread.created", "thread.meta-updated"]);
    await system.dispose();
  });

  it("stores completed checkpoint summaries even when no files changed", async () => {
    const system = await createOrchestrationSystem();
    const { engine } = system;
    const createdAt = now();

    await system.run(
      engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-project-turn-diff-create"),
        projectId: asProjectId("project-turn-diff"),
        title: "Turn Diff Project",
        workspaceRoot: "/tmp/project-turn-diff",
        defaultModel: "gpt-5-codex",
        createdAt,
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.create",
        commandId: CommandId.makeUnsafe("cmd-thread-turn-diff-create"),
        threadId: ThreadId.makeUnsafe("thread-turn-diff"),
        projectId: asProjectId("project-turn-diff"),
        title: "Turn diff thread",
        model: "gpt-5-codex",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        createdAt,
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.turn.diff.complete",
        commandId: CommandId.makeUnsafe("cmd-turn-diff-complete"),
        threadId: ThreadId.makeUnsafe("thread-turn-diff"),
        turnId: asTurnId("turn-1"),
        completedAt: createdAt,
        checkpointRef: asCheckpointRef("refs/t3/checkpoints/thread-turn-diff/turn/1"),
        status: "ready",
        files: [],
        checkpointTurnCount: 1,
        createdAt,
      }),
    );

    const thread = (await system.run(engine.getReadModel())).threads.find(
      (entry) => entry.id === "thread-turn-diff",
    );
    expect(thread?.checkpoints).toEqual([
      {
        turnId: asTurnId("turn-1"),
        checkpointTurnCount: 1,
        checkpointRef: asCheckpointRef("refs/t3/checkpoints/thread-turn-diff/turn/1"),
        status: "ready",
        files: [],
        assistantMessageId: null,
        completedAt: createdAt,
      },
    ]);
    await system.dispose();
  });

  it("forks a checkpoint into a new thread with fresh ids and filtered activities", async () => {
    const system = await createOrchestrationSystem();
    const { engine } = system;

    const projectId = asProjectId("project-fork");
    const sourceThreadId = ThreadId.makeUnsafe("thread-fork-source");
    const forkThreadId = ThreadId.makeUnsafe("thread-fork-target");
    const turn1Id = asTurnId("turn-fork-1");
    const turn2Id = asTurnId("turn-fork-2");
    const userMessage1Id = asMessageId("msg-fork-user-1");
    const userMessage2Id = asMessageId("msg-fork-user-2");
    const assistantMessage1Id = asMessageId("msg-fork-assistant-1");
    const assistantMessage2Id = asMessageId("msg-fork-assistant-2");

    await system.run(
      engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-project-fork-create"),
        projectId,
        title: "Fork Project",
        workspaceRoot: "/tmp/project-fork",
        defaultModel: "gpt-5-codex",
        createdAt: "2026-03-01T09:00:00.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.create",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-create"),
        threadId: sourceThreadId,
        projectId,
        title: "Source thread",
        model: "gpt-5-codex",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: "feature/fork-source",
        worktreePath: "/tmp/project-fork/worktrees/source",
        createdAt: "2026-03-01T09:00:01.000Z",
      }),
    );

    await system.run(
      engine.dispatch({
        type: "thread.turn.start",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-turn-1-start"),
        threadId: sourceThreadId,
        message: {
          messageId: userMessage1Id,
          role: "user",
          text: "First request",
          attachments: [],
        },
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        createdAt: "2026-03-01T09:00:02.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.message.assistant.delta",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-assistant-1-delta"),
        threadId: sourceThreadId,
        messageId: assistantMessage1Id,
        delta: "First answer",
        turnId: turn1Id,
        createdAt: "2026-03-01T09:00:03.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.message.assistant.complete",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-assistant-1-complete"),
        threadId: sourceThreadId,
        messageId: assistantMessage1Id,
        turnId: turn1Id,
        createdAt: "2026-03-01T09:00:04.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.proposed-plan.upsert",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-plan-1"),
        threadId: sourceThreadId,
        proposedPlan: {
          id: "plan-fork-1",
          turnId: turn1Id,
          planMarkdown: "1. Inspect code\n2. Apply patch",
          createdAt: "2026-03-01T09:00:05.000Z",
          updatedAt: "2026-03-01T09:00:05.000Z",
        },
        createdAt: "2026-03-01T09:00:05.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.turn.diff.complete",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-diff-1"),
        threadId: sourceThreadId,
        turnId: turn1Id,
        completedAt: "2026-03-01T09:00:06.000Z",
        checkpointRef: asCheckpointRef("refs/t3/checkpoints/thread-fork-source/turn/1"),
        status: "ready",
        files: [
          {
            path: "src/app.ts",
            kind: "modified",
            additions: 4,
            deletions: 1,
          },
        ],
        assistantMessageId: assistantMessage1Id,
        checkpointTurnCount: 1,
        createdAt: "2026-03-01T09:00:06.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.activity.append",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-task-1"),
        threadId: sourceThreadId,
        activity: {
          id: EventId.makeUnsafe("activity-thread-fork-task-1"),
          tone: "tool",
          kind: "task.started",
          summary: "Task started",
          payload: {
            taskId: "task-1",
            description: "Inspect workspace",
          },
          turnId: turn1Id,
          createdAt: "2026-03-01T09:00:06.500Z",
        },
        createdAt: "2026-03-01T09:00:06.500Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.activity.append",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-approval-1"),
        threadId: sourceThreadId,
        activity: {
          id: EventId.makeUnsafe("activity-thread-fork-approval-1"),
          tone: "approval",
          kind: "approval.requested",
          summary: "Approval requested",
          payload: {
            requestId: "approval-request-1",
            requestKind: "command",
          },
          turnId: turn1Id,
          createdAt: "2026-03-01T09:00:06.700Z",
        },
        createdAt: "2026-03-01T09:00:06.700Z",
      }),
    );

    await system.run(
      engine.dispatch({
        type: "thread.turn.start",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-turn-2-start"),
        threadId: sourceThreadId,
        message: {
          messageId: userMessage2Id,
          role: "user",
          text: "Second request",
          attachments: [],
        },
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        createdAt: "2026-03-01T09:00:07.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.message.assistant.delta",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-assistant-2-delta"),
        threadId: sourceThreadId,
        messageId: assistantMessage2Id,
        delta: "Second answer",
        turnId: turn2Id,
        createdAt: "2026-03-01T09:00:08.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.message.assistant.complete",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-assistant-2-complete"),
        threadId: sourceThreadId,
        messageId: assistantMessage2Id,
        turnId: turn2Id,
        createdAt: "2026-03-01T09:00:09.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.proposed-plan.upsert",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-plan-2"),
        threadId: sourceThreadId,
        proposedPlan: {
          id: "plan-fork-2",
          turnId: turn2Id,
          planMarkdown: "1. Add tests\n2. Verify results",
          createdAt: "2026-03-01T09:00:10.000Z",
          updatedAt: "2026-03-01T09:00:10.000Z",
        },
        createdAt: "2026-03-01T09:00:10.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.turn.diff.complete",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-diff-2"),
        threadId: sourceThreadId,
        turnId: turn2Id,
        completedAt: "2026-03-01T09:00:11.000Z",
        checkpointRef: asCheckpointRef("refs/t3/checkpoints/thread-fork-source/turn/2"),
        status: "ready",
        files: [
          {
            path: "src/tests.ts",
            kind: "added",
            additions: 12,
            deletions: 0,
          },
        ],
        assistantMessageId: assistantMessage2Id,
        checkpointTurnCount: 2,
        createdAt: "2026-03-01T09:00:11.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.activity.append",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-task-2"),
        threadId: sourceThreadId,
        activity: {
          id: EventId.makeUnsafe("activity-thread-fork-task-2"),
          tone: "tool",
          kind: "task.completed",
          summary: "Task completed",
          payload: {
            taskId: "task-2",
            status: "completed",
            summary: "Verified tests",
          },
          turnId: turn2Id,
          createdAt: "2026-03-01T09:00:11.500Z",
        },
        createdAt: "2026-03-01T09:00:11.500Z",
      }),
    );

    await system.run(
      engine.dispatch({
        type: "thread.fork",
        commandId: CommandId.makeUnsafe("cmd-thread-fork-run"),
        sourceThreadId,
        threadId: forkThreadId,
        title: "Forked checkpoint thread",
        model: "gpt-5-codex",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: "feature/fork-target",
        worktreePath: "/tmp/project-fork/worktrees/forked",
        source: {
          kind: "checkpoint",
          turnCount: 1,
        },
        createdAt: "2026-03-01T09:00:12.000Z",
      }),
    );

    const readModel = await system.run(engine.getReadModel());
    const forkedThread = readModel.threads.find((entry) => entry.id === forkThreadId);

    expect(forkedThread).toBeDefined();
    expect(forkedThread?.session).toBeNull();
    expect(forkedThread?.title).toBe("Forked checkpoint thread");
    expect(forkedThread?.messages.map((message) => message.text)).toEqual([
      "First request",
      "First answer",
    ]);
    expect(forkedThread?.messages.map((message) => message.id)).not.toEqual([
      userMessage1Id,
      assistantMessage1Id,
    ]);
    expect(forkedThread?.messages.some((message) => message.text === "Second request")).toBe(false);
    expect(forkedThread?.proposedPlans).toHaveLength(1);
    expect(forkedThread?.proposedPlans[0]?.planMarkdown).toContain("Inspect code");
    expect(forkedThread?.proposedPlans[0]?.id).not.toBe("plan-fork-1");
    expect(forkedThread?.checkpoints).toEqual([
      {
        turnId: turn1Id,
        checkpointTurnCount: 1,
        checkpointRef: asCheckpointRef("refs/t3/checkpoints/thread-fork-source/turn/1"),
        status: "ready",
        files: [
          {
            path: "src/app.ts",
            kind: "modified",
            additions: 4,
            deletions: 1,
          },
        ],
        assistantMessageId: forkedThread?.messages[1]?.id ?? null,
        completedAt: "2026-03-01T09:00:06.000Z",
      },
    ]);
    expect(forkedThread?.activities.map((activity) => activity.kind)).toEqual(["task.started"]);
    expect(forkedThread?.activities[0]?.id).not.toBe("activity-thread-fork-task-1");
    expect(
      forkedThread?.activities.some((activity) => activity.kind === "approval.requested"),
    ).toBe(false);

    await system.dispose();
  });

  it("forks from a message without retaining later same-turn artifacts", async () => {
    const system = await createOrchestrationSystem();
    const { engine } = system;

    const projectId = asProjectId("project-message-fork");
    const sourceThreadId = ThreadId.makeUnsafe("thread-message-fork-source");
    const forkThreadId = ThreadId.makeUnsafe("thread-message-fork-target");
    const turnId = asTurnId("turn-message-fork-1");
    const userMessageId = asMessageId("msg-message-fork-user-1");
    const assistantMessageId = asMessageId("msg-message-fork-assistant-1");

    await system.run(
      engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-project-message-fork-create"),
        projectId,
        title: "Message Fork Project",
        workspaceRoot: "/tmp/project-message-fork",
        defaultModel: "gpt-5-codex",
        createdAt: "2026-03-01T10:00:00.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.create",
        commandId: CommandId.makeUnsafe("cmd-thread-message-fork-create"),
        threadId: sourceThreadId,
        projectId,
        title: "Source thread",
        model: "gpt-5-codex",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        createdAt: "2026-03-01T10:00:01.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.turn.start",
        commandId: CommandId.makeUnsafe("cmd-thread-message-fork-turn-start"),
        threadId: sourceThreadId,
        message: {
          messageId: userMessageId,
          role: "user",
          text: "Inspect the bug",
          attachments: [],
        },
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        createdAt: "2026-03-01T10:00:02.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.message.assistant.delta",
        commandId: CommandId.makeUnsafe("cmd-thread-message-fork-assistant-delta"),
        threadId: sourceThreadId,
        messageId: assistantMessageId,
        delta: "I found the root cause.",
        turnId,
        createdAt: "2026-03-01T10:00:03.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.message.assistant.complete",
        commandId: CommandId.makeUnsafe("cmd-thread-message-fork-assistant-complete"),
        threadId: sourceThreadId,
        messageId: assistantMessageId,
        turnId,
        createdAt: "2026-03-01T10:00:04.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.proposed-plan.upsert",
        commandId: CommandId.makeUnsafe("cmd-thread-message-fork-plan"),
        threadId: sourceThreadId,
        proposedPlan: {
          id: "plan-message-fork-1",
          turnId,
          planMarkdown: "1. Patch the bug\n2. Add tests",
          createdAt: "2026-03-01T10:00:05.000Z",
          updatedAt: "2026-03-01T10:00:05.000Z",
        },
        createdAt: "2026-03-01T10:00:05.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.turn.diff.complete",
        commandId: CommandId.makeUnsafe("cmd-thread-message-fork-diff"),
        threadId: sourceThreadId,
        turnId,
        completedAt: "2026-03-01T10:00:06.000Z",
        checkpointRef: asCheckpointRef("refs/t3/checkpoints/thread-message-fork-source/turn/1"),
        status: "ready",
        files: [
          {
            path: "src/bug.ts",
            kind: "modified",
            additions: 3,
            deletions: 1,
          },
        ],
        assistantMessageId,
        checkpointTurnCount: 1,
        createdAt: "2026-03-01T10:00:06.000Z",
      }),
    );
    await system.run(
      engine.dispatch({
        type: "thread.activity.append",
        commandId: CommandId.makeUnsafe("cmd-thread-message-fork-task"),
        threadId: sourceThreadId,
        activity: {
          id: EventId.makeUnsafe("activity-thread-message-fork-task-1"),
          tone: "tool",
          kind: "task.started",
          summary: "Task started",
          payload: {
            taskId: "task-message-fork-1",
            description: "Patch bug",
          },
          turnId,
          createdAt: "2026-03-01T10:00:06.500Z",
        },
        createdAt: "2026-03-01T10:00:06.500Z",
      }),
    );

    await system.run(
      engine.dispatch({
        type: "thread.fork",
        commandId: CommandId.makeUnsafe("cmd-thread-message-fork-run"),
        sourceThreadId,
        threadId: forkThreadId,
        title: "Forked from message",
        model: "gpt-5-codex",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        source: {
          kind: "message",
          messageId: assistantMessageId,
        },
        createdAt: "2026-03-01T10:00:07.000Z",
      }),
    );

    const readModel = await system.run(engine.getReadModel());
    const forkedThread = readModel.threads.find((entry) => entry.id === forkThreadId);

    expect(forkedThread?.messages.map((message) => message.text)).toEqual([
      "Inspect the bug",
      "I found the root cause.",
    ]);
    expect(forkedThread?.proposedPlans).toEqual([]);
    expect(forkedThread?.checkpoints).toEqual([]);
    expect(forkedThread?.activities).toEqual([]);

    await system.dispose();
  });

  it("keeps processing queued commands after a storage failure", async () => {
    type StoredEvent =
      ReturnType<OrchestrationEventStoreShape["append"]> extends Effect.Effect<infer A, any, any>
        ? A
        : never;
    const events: StoredEvent[] = [];
    let nextSequence = 1;
    let shouldFailFirstAppend = true;

    const flakyStore: OrchestrationEventStoreShape = {
      append(event) {
        if (shouldFailFirstAppend && event.commandId === CommandId.makeUnsafe("cmd-flaky-1")) {
          shouldFailFirstAppend = false;
          return Effect.fail(
            new PersistenceSqlError({
              operation: "test.append",
              detail: "append failed",
            }),
          );
        }
        const savedEvent = {
          ...event,
          sequence: nextSequence,
        } as StoredEvent;
        nextSequence += 1;
        events.push(savedEvent);
        return Effect.succeed(savedEvent);
      },
      readFromSequence(sequenceExclusive) {
        return Stream.fromIterable(events.filter((event) => event.sequence > sequenceExclusive));
      },
      readAll() {
        return Stream.fromIterable(events);
      },
    };

    const runtime = ManagedRuntime.make(
      OrchestrationEngineLive.pipe(
        Layer.provide(OrchestrationProjectionPipelineLive),
        Layer.provide(Layer.succeed(OrchestrationEventStore, flakyStore)),
        Layer.provide(OrchestrationCommandReceiptRepositoryLive),
        Layer.provide(SqlitePersistenceMemory),
        Layer.provideMerge(ServerConfig.layerTest(process.cwd(), process.cwd())),
        Layer.provideMerge(NodeServices.layer),
      ),
    );
    const engine = await runtime.runPromise(Effect.service(OrchestrationEngineService));
    const createdAt = now();

    await runtime.runPromise(
      engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-project-flaky-create"),
        projectId: asProjectId("project-flaky"),
        title: "Flaky Project",
        workspaceRoot: "/tmp/project-flaky",
        defaultModel: "gpt-5-codex",
        createdAt,
      }),
    );

    await expect(
      runtime.runPromise(
        engine.dispatch({
          type: "thread.create",
          commandId: CommandId.makeUnsafe("cmd-flaky-1"),
          threadId: ThreadId.makeUnsafe("thread-flaky-fail"),
          projectId: asProjectId("project-flaky"),
          title: "flaky-fail",
          model: "gpt-5-codex",
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "approval-required",
          branch: null,
          worktreePath: null,
          createdAt,
        }),
      ),
    ).rejects.toThrow("append failed");

    const result = await runtime.runPromise(
      engine.dispatch({
        type: "thread.create",
        commandId: CommandId.makeUnsafe("cmd-flaky-2"),
        threadId: ThreadId.makeUnsafe("thread-flaky-ok"),
        projectId: asProjectId("project-flaky"),
        title: "flaky-ok",
        model: "gpt-5-codex",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        createdAt,
      }),
    );

    expect(result.sequence).toBe(2);
    expect((await runtime.runPromise(engine.getReadModel())).snapshotSequence).toBe(2);
    await runtime.dispose();
  });

  it("rolls back all events for a multi-event command when projection fails mid-dispatch", async () => {
    let shouldFailRequestedProjection = true;
    const flakyProjectionPipeline: OrchestrationProjectionPipelineShape = {
      bootstrap: Effect.void,
      projectEvent: (event) => {
        if (
          shouldFailRequestedProjection &&
          event.commandId === CommandId.makeUnsafe("cmd-turn-start-atomic") &&
          event.type === "thread.turn-start-requested"
        ) {
          shouldFailRequestedProjection = false;
          return Effect.fail(
            new PersistenceSqlError({
              operation: "test.projection",
              detail: "projection failed",
            }),
          );
        }
        return Effect.void;
      },
    };

    const runtime = ManagedRuntime.make(
      OrchestrationEngineLive.pipe(
        Layer.provide(Layer.succeed(OrchestrationProjectionPipeline, flakyProjectionPipeline)),
        Layer.provide(OrchestrationEventStoreLive),
        Layer.provide(OrchestrationCommandReceiptRepositoryLive),
        Layer.provide(SqlitePersistenceMemory),
      ),
    );
    const engine = await runtime.runPromise(Effect.service(OrchestrationEngineService));
    const createdAt = now();

    await runtime.runPromise(
      engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-project-atomic-create"),
        projectId: asProjectId("project-atomic"),
        title: "Atomic Project",
        workspaceRoot: "/tmp/project-atomic",
        defaultModel: "gpt-5-codex",
        createdAt,
      }),
    );
    await runtime.runPromise(
      engine.dispatch({
        type: "thread.create",
        commandId: CommandId.makeUnsafe("cmd-thread-atomic-create"),
        threadId: ThreadId.makeUnsafe("thread-atomic"),
        projectId: asProjectId("project-atomic"),
        title: "atomic",
        model: "gpt-5-codex",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        createdAt,
      }),
    );

    const turnStartCommand = {
      type: "thread.turn.start" as const,
      commandId: CommandId.makeUnsafe("cmd-turn-start-atomic"),
      threadId: ThreadId.makeUnsafe("thread-atomic"),
      message: {
        messageId: asMessageId("msg-atomic-1"),
        role: "user" as const,
        text: "hello",
        attachments: [],
      },
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      runtimeMode: "approval-required" as const,
      createdAt,
    };

    await expect(runtime.runPromise(engine.dispatch(turnStartCommand))).rejects.toThrow(
      "projection failed",
    );

    const eventsAfterFailure = await runtime.runPromise(
      Stream.runCollect(engine.readEvents(0)).pipe(
        Effect.map((chunk): OrchestrationEvent[] => Array.from(chunk)),
      ),
    );
    expect(eventsAfterFailure.map((event) => event.type)).toEqual([
      "project.created",
      "thread.created",
    ]);
    expect((await runtime.runPromise(engine.getReadModel())).snapshotSequence).toBe(2);

    const retryResult = await runtime.runPromise(engine.dispatch(turnStartCommand));
    expect(retryResult.sequence).toBe(4);

    const eventsAfterRetry = await runtime.runPromise(
      Stream.runCollect(engine.readEvents(0)).pipe(
        Effect.map((chunk): OrchestrationEvent[] => Array.from(chunk)),
      ),
    );
    expect(eventsAfterRetry.map((event) => event.type)).toEqual([
      "project.created",
      "thread.created",
      "thread.message-sent",
      "thread.turn-start-requested",
    ]);
    expect(
      eventsAfterRetry.filter((event) => event.commandId === turnStartCommand.commandId),
    ).toHaveLength(2);

    await runtime.dispose();
  });

  it("reconciles in-memory state when append persists but projection fails", async () => {
    type StoredEvent =
      ReturnType<OrchestrationEventStoreShape["append"]> extends Effect.Effect<infer A, any, any>
        ? A
        : never;
    const events: StoredEvent[] = [];
    let nextSequence = 1;

    const nonTransactionalStore: OrchestrationEventStoreShape = {
      append(event) {
        const savedEvent = {
          ...event,
          sequence: nextSequence,
        } as StoredEvent;
        nextSequence += 1;
        events.push(savedEvent);
        return Effect.succeed(savedEvent);
      },
      readFromSequence(sequenceExclusive) {
        return Stream.fromIterable(events.filter((event) => event.sequence > sequenceExclusive));
      },
      readAll() {
        return Stream.fromIterable(events);
      },
    };

    let shouldFailProjection = true;
    const flakyProjectionPipeline: OrchestrationProjectionPipelineShape = {
      bootstrap: Effect.void,
      projectEvent: (event) => {
        if (
          shouldFailProjection &&
          event.commandId === CommandId.makeUnsafe("cmd-thread-meta-sync-fail")
        ) {
          shouldFailProjection = false;
          return Effect.fail(
            new PersistenceSqlError({
              operation: "test.projection",
              detail: "projection failed",
            }),
          );
        }
        return Effect.void;
      },
    };

    const runtime = ManagedRuntime.make(
      OrchestrationEngineLive.pipe(
        Layer.provide(Layer.succeed(OrchestrationProjectionPipeline, flakyProjectionPipeline)),
        Layer.provide(Layer.succeed(OrchestrationEventStore, nonTransactionalStore)),
        Layer.provide(OrchestrationCommandReceiptRepositoryLive),
        Layer.provide(SqlitePersistenceMemory),
      ),
    );
    const engine = await runtime.runPromise(Effect.service(OrchestrationEngineService));
    const createdAt = now();

    await runtime.runPromise(
      engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-project-sync-create"),
        projectId: asProjectId("project-sync"),
        title: "Sync Project",
        workspaceRoot: "/tmp/project-sync",
        defaultModel: "gpt-5-codex",
        createdAt,
      }),
    );
    await runtime.runPromise(
      engine.dispatch({
        type: "thread.create",
        commandId: CommandId.makeUnsafe("cmd-thread-sync-create"),
        threadId: ThreadId.makeUnsafe("thread-sync"),
        projectId: asProjectId("project-sync"),
        title: "sync-before",
        model: "gpt-5-codex",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        createdAt,
      }),
    );

    await expect(
      runtime.runPromise(
        engine.dispatch({
          type: "thread.meta.update",
          commandId: CommandId.makeUnsafe("cmd-thread-meta-sync-fail"),
          threadId: ThreadId.makeUnsafe("thread-sync"),
          title: "sync-after-failed-projection",
        }),
      ),
    ).rejects.toThrow("projection failed");

    const readModelAfterFailure = await runtime.runPromise(engine.getReadModel());
    const updatedThread = readModelAfterFailure.threads.find(
      (thread) => thread.id === "thread-sync",
    );
    expect(readModelAfterFailure.snapshotSequence).toBe(3);
    expect(updatedThread?.title).toBe("sync-after-failed-projection");

    await runtime.dispose();
  });

  it("fails command dispatch when command invariants are violated", async () => {
    const system = await createOrchestrationSystem();
    const { engine } = system;

    await expect(
      system.run(
        engine.dispatch({
          type: "thread.turn.start",
          commandId: CommandId.makeUnsafe("cmd-invariant-missing-thread"),
          threadId: ThreadId.makeUnsafe("thread-missing"),
          message: {
            messageId: asMessageId("msg-missing"),
            role: "user",
            text: "hello",
            attachments: [],
          },
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "approval-required",
          createdAt: now(),
        }),
      ),
    ).rejects.toThrow("Thread 'thread-missing' does not exist");

    await system.dispose();
  });

  it("rejects duplicate thread creation", async () => {
    const system = await createOrchestrationSystem();
    const { engine } = system;
    const createdAt = now();

    await system.run(
      engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-project-duplicate-create"),
        projectId: asProjectId("project-duplicate"),
        title: "Duplicate Project",
        workspaceRoot: "/tmp/project-duplicate",
        defaultModel: "gpt-5-codex",
        createdAt,
      }),
    );

    await system.run(
      engine.dispatch({
        type: "thread.create",
        commandId: CommandId.makeUnsafe("cmd-thread-duplicate-1"),
        threadId: ThreadId.makeUnsafe("thread-duplicate"),
        projectId: asProjectId("project-duplicate"),
        title: "duplicate",
        model: "gpt-5-codex",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        createdAt,
      }),
    );

    await expect(
      system.run(
        engine.dispatch({
          type: "thread.create",
          commandId: CommandId.makeUnsafe("cmd-thread-duplicate-2"),
          threadId: ThreadId.makeUnsafe("thread-duplicate"),
          projectId: asProjectId("project-duplicate"),
          title: "duplicate",
          model: "gpt-5-codex",
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "approval-required",
          branch: null,
          worktreePath: null,
          createdAt,
        }),
      ),
    ).rejects.toThrow("already exists");

    await system.dispose();
  });
});
