import type {
  OrchestrationEvent,
  OrchestrationGitReadModel,
  OrchestrationMessage,
  OrchestrationReadModel,
  OrchestrationSession,
  OrchestrationThread,
} from "@t3tools/contracts";
import {
  OrchestrationGitReadModelSchema,
  OrchestrationMessageSchema,
  OrchestrationReadModelSchema,
  OrchestrationSessionSchema,
  OrchestrationThreadSchema,
  OrchestrationTurnDiffFileSchema,
  OrchestrationTurnDiffSummarySchema,
} from "@t3tools/contracts";
import { Effect, Schema } from "effect";

type ThreadPatch = Partial<Omit<OrchestrationThread, "id" | "projectId">>;

function updateThread(
  threads: ReadonlyArray<OrchestrationThread>,
  threadId: string,
  patch: ThreadPatch,
): OrchestrationThread[] {
  return threads.map((thread) => (thread.id === threadId ? { ...thread, ...patch } : thread));
}

const decodeReadModelSync = Schema.decodeUnknownSync(OrchestrationReadModelSchema);
const decodeMessage = Schema.decodeUnknown(OrchestrationMessageSchema);
const decodeSession = Schema.decodeUnknown(OrchestrationSessionSchema);
const decodeThread = Schema.decodeUnknown(OrchestrationThreadSchema);
const decodeGitReadModel = Schema.decodeUnknown(OrchestrationGitReadModelSchema);
const decodeTurnDiffSummary = Schema.decodeUnknown(OrchestrationTurnDiffSummarySchema);

const ThreadCreatedPayloadSchema = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  title: Schema.String,
  model: Schema.String,
  branch: Schema.NullOr(Schema.String),
  worktreePath: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
const decodeThreadCreatedPayload = Schema.decodeUnknown(ThreadCreatedPayloadSchema);

const ThreadMetaUpdatedPayloadSchema = Schema.Struct({
  threadId: Schema.String,
  title: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  branch: Schema.optional(Schema.NullOr(Schema.String)),
  worktreePath: Schema.optional(Schema.NullOr(Schema.String)),
  updatedAt: Schema.String,
});
const decodeThreadMetaUpdatedPayload = Schema.decodeUnknown(ThreadMetaUpdatedPayloadSchema);

const MessageSentPayloadSchema = Schema.Struct({
  id: Schema.String,
  role: Schema.Literal("user", "assistant"),
  text: Schema.String,
  threadId: Schema.String,
  createdAt: Schema.String,
  streaming: Schema.Boolean,
});
const decodeMessageSentPayload = Schema.decodeUnknown(MessageSentPayloadSchema);

const ThreadSessionSetPayloadSchema = Schema.Struct({
  threadId: Schema.String,
  session: OrchestrationSessionSchema,
});
const decodeThreadSessionSetPayload = Schema.decodeUnknown(ThreadSessionSetPayloadSchema);

const ThreadTurnDiffCompletedPayloadSchema = Schema.Struct({
  threadId: Schema.String,
  turnId: Schema.String,
  completedAt: Schema.String,
  status: Schema.optional(Schema.String),
  files: Schema.Array(OrchestrationTurnDiffFileSchema),
  assistantMessageId: Schema.optional(Schema.String),
  checkpointTurnCount: Schema.optional(Schema.Number),
});
const decodeThreadTurnDiffCompletedPayload = Schema.decodeUnknown(
  ThreadTurnDiffCompletedPayloadSchema,
);

const ThreadRevertedPayloadSchema = Schema.Struct({
  threadId: Schema.String,
  turnCount: Schema.Number,
  messageCount: Schema.Number,
});
const decodeThreadRevertedPayload = Schema.decodeUnknown(ThreadRevertedPayloadSchema);

export function createEmptyReadModel(nowIso: string): OrchestrationReadModel {
  return decodeReadModelSync({
    sequence: 0,
    threads: [],
    gitByProjectId: {},
    updatedAt: nowIso,
  });
}

export function reduceEvent(
  model: OrchestrationReadModel,
  event: OrchestrationEvent,
): Effect.Effect<OrchestrationReadModel, unknown> {
  const nextBase: OrchestrationReadModel = {
    ...model,
    sequence: event.sequence,
    updatedAt: event.occurredAt,
  };

  switch (event.type) {
    case "thread.created":
      return Effect.gen(function* () {
        const payload = yield* decodeThreadCreatedPayload(event.payload);
        const thread: OrchestrationThread = yield* decodeThread({
          id: payload.id,
          projectId: payload.projectId,
          title: payload.title,
          model: payload.model,
          branch: payload.branch,
          worktreePath: payload.worktreePath,
          createdAt: payload.createdAt,
          updatedAt: payload.updatedAt,
          latestTurnId: null,
          latestTurnStartedAt: null,
          latestTurnCompletedAt: null,
          latestTurnDurationMs: null,
          messages: [],
          session: null,
          turnDiffSummaries: [],
          error: null,
        });
        const existing = nextBase.threads.find((entry) => entry.id === thread.id);
        return {
          ...nextBase,
          threads: existing
            ? nextBase.threads.map((entry) => (entry.id === thread.id ? thread : entry))
            : [...nextBase.threads, thread],
        };
      });
    case "thread.deleted":
      return Effect.succeed({
        ...nextBase,
        threads: nextBase.threads.filter((thread) => thread.id !== event.aggregateId),
      });
    case "thread.meta-updated":
      return decodeThreadMetaUpdatedPayload(event.payload).pipe(
        Effect.map((payload) => {
          const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
          if (!thread) {
            return nextBase;
          }
          return {
            ...nextBase,
            threads: updateThread(nextBase.threads, payload.threadId, {
              ...(payload.title !== undefined ? { title: payload.title } : {}),
              ...(payload.model !== undefined ? { model: payload.model } : {}),
              ...(payload.branch !== undefined ? { branch: payload.branch } : {}),
              ...(payload.worktreePath !== undefined ? { worktreePath: payload.worktreePath } : {}),
              updatedAt: payload.updatedAt,
            }),
          };
        }),
      );
    case "message.sent":
      return Effect.gen(function* () {
        const payload = yield* decodeMessageSentPayload(event.payload);
        const targetThread = nextBase.threads.find((thread) => thread.id === payload.threadId);
        if (!targetThread) {
          return nextBase;
        }

        const message: OrchestrationMessage = yield* decodeMessage({
          id: payload.id,
          role: payload.role,
          text: payload.text,
          createdAt: payload.createdAt,
          streaming: payload.streaming,
        });
        const existingMessage = targetThread.messages.find((entry) => entry.id === message.id);
        const nextMessages = existingMessage
          ? targetThread.messages.map((entry) =>
              entry.id === message.id
                ? {
                    ...entry,
                    text: message.streaming
                      ? `${entry.text}${message.text}`
                      : message.text.length > 0
                        ? message.text
                        : entry.text,
                    streaming: message.streaming,
                    createdAt: message.createdAt,
                  }
                : entry,
            )
          : [...targetThread.messages, message];

        return {
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            messages: nextMessages,
            updatedAt: event.occurredAt,
          }),
        };
      });
    case "thread.session-set":
      return Effect.gen(function* () {
        const payload = yield* decodeThreadSessionSetPayload(event.payload);
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const session: OrchestrationSession = yield* decodeSession({
          ...payload.session,
          threadId: payload.threadId,
        });

        return {
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            session,
            updatedAt: event.occurredAt,
            error: session.lastError,
          }),
        };
      });
    case "thread.turn-diff-completed":
      return Effect.gen(function* () {
        const payload = yield* decodeThreadTurnDiffCompletedPayload(event.payload);
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const nextSummary = yield* decodeTurnDiffSummary({
          turnId: payload.turnId,
          completedAt: payload.completedAt,
          ...(payload.status !== undefined ? { status: payload.status } : {}),
          files: payload.files,
          ...(payload.assistantMessageId !== undefined
            ? { assistantMessageId: payload.assistantMessageId }
            : {}),
          ...(payload.checkpointTurnCount !== undefined
            ? { checkpointTurnCount: payload.checkpointTurnCount }
            : {}),
        });
        const turnDiffSummaries = [
          ...thread.turnDiffSummaries.filter((summary) => summary.turnId !== payload.turnId),
          nextSummary,
        ].toSorted((left, right) => left.completedAt.localeCompare(right.completedAt));

        return {
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            latestTurnId: payload.turnId,
            latestTurnCompletedAt: nextSummary.completedAt,
            turnDiffSummaries,
            updatedAt: event.occurredAt,
          }),
        };
      });
    case "thread.reverted":
      return decodeThreadRevertedPayload(event.payload).pipe(
        Effect.map((payload) => {
          const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
          if (!thread) {
            return nextBase;
          }

          const targetTurnCount = Math.max(0, Math.floor(payload.turnCount));
          const targetMessageCount = Math.max(0, Math.floor(payload.messageCount));
          const sortedSummaries = [...thread.turnDiffSummaries].toSorted((left, right) =>
            left.completedAt.localeCompare(right.completedAt),
          );
          const inferredTurnCountByTurnId = new Map<string, number>();
          for (let index = 0; index < sortedSummaries.length; index += 1) {
            const summary = sortedSummaries[index];
            if (!summary) continue;
            inferredTurnCountByTurnId.set(summary.turnId, index + 1);
          }

          const turnDiffSummaries = thread.turnDiffSummaries
            .filter((summary) => {
              const checkpointTurnCount =
                summary.checkpointTurnCount ?? inferredTurnCountByTurnId.get(summary.turnId) ?? 0;
              return checkpointTurnCount <= targetTurnCount;
            })
            .toSorted((left, right) => left.completedAt.localeCompare(right.completedAt));
          const latestSummary =
            turnDiffSummaries.length > 0 ? turnDiffSummaries[turnDiffSummaries.length - 1] : null;

          return {
            ...nextBase,
            threads: updateThread(nextBase.threads, payload.threadId, {
              messages: thread.messages.slice(
                0,
                Math.min(targetMessageCount, thread.messages.length),
              ),
              turnDiffSummaries,
              latestTurnId: latestSummary?.turnId ?? null,
              latestTurnStartedAt: null,
              latestTurnCompletedAt: latestSummary?.completedAt ?? null,
              latestTurnDurationMs: null,
              updatedAt: event.occurredAt,
            }),
          };
        }),
      );
    case "git.read-model-upsert":
      return decodeGitReadModel(event.payload).pipe(
        Effect.map((gitReadModel: OrchestrationGitReadModel) => ({
          ...nextBase,
          gitByProjectId: {
            ...nextBase.gitByProjectId,
            [gitReadModel.projectId]: gitReadModel,
          },
        })),
      );
    default:
      return Effect.succeed(nextBase);
  }
}
