import {
  type ProviderRuntimeEvent,
  type ProviderUserInputAnswers,
} from "@t3tools/contracts";
import { Effect, Layer, Queue, ServiceMap, Stream } from "effect";

import {
  ProviderAdapterRequestError,
  ProviderAdapterSessionClosedError,
  ProviderAdapterSessionNotFoundError,
  type ProviderAdapterError,
} from "../Errors.ts";
import { KimiAcpManager } from "../../kimiAcpManager.ts";
import { KimiAdapter, type KimiAdapterShape } from "../Services/KimiAdapter.ts";

const PROVIDER = "kimi" as const;

export interface KimiAdapterLiveOptions {
  readonly manager?: KimiAcpManager;
  readonly makeManager?: (services?: ServiceMap.ServiceMap<never>) => KimiAcpManager;
}

function toMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  return fallback;
}

function toSessionError(
  threadId: string,
  cause: unknown,
): ProviderAdapterSessionNotFoundError | ProviderAdapterSessionClosedError | undefined {
  const normalized = toMessage(cause, "").toLowerCase();
  if (normalized.includes("unknown kimi session")) {
    return new ProviderAdapterSessionNotFoundError({
      provider: PROVIDER,
      threadId,
      cause,
    });
  }
  if (normalized.includes("session is closed")) {
    return new ProviderAdapterSessionClosedError({
      provider: PROVIDER,
      threadId,
      cause,
    });
  }
  return undefined;
}

function toRequestError(threadId: string, method: string, cause: unknown): ProviderAdapterError {
  const sessionError = toSessionError(threadId, cause);
  if (sessionError) {
    return sessionError;
  }
  return new ProviderAdapterRequestError({
    provider: PROVIDER,
    method,
    detail: toMessage(cause, `${method} failed`),
    cause,
  });
}

export const makeKimiAdapterLive = (options?: KimiAdapterLiveOptions) =>
  Layer.effect(
    KimiAdapter,
    Effect.gen(function* () {
      const eventQueue = yield* Queue.unbounded<ProviderRuntimeEvent>();
      const manager =
        options?.manager ??
        options?.makeManager?.() ??
        new KimiAcpManager();

      const handleEvent = (event: ProviderRuntimeEvent) => {
        void Effect.runPromise(Queue.offer(eventQueue, event).pipe(Effect.asVoid));
      };
      manager.on("event", handleEvent);

      const streamEvents = Stream.fromQueue(eventQueue);

      const startSession: KimiAdapterShape["startSession"] = (input) =>
        Effect.tryPromise({
          try: () =>
            manager.startSession({
              threadId: input.threadId,
              provider: "kimi",
              ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
              ...(input.model !== undefined ? { model: input.model } : {}),
              ...(input.resumeCursor !== undefined ? { resumeCursor: input.resumeCursor } : {}),
              ...(input.providerOptions !== undefined ? { providerOptions: input.providerOptions } : {}),
              runtimeMode: input.runtimeMode,
            }),
          catch: (cause) => toRequestError(input.threadId, "session/start", cause),
        });

      const sendTurn: KimiAdapterShape["sendTurn"] = (input) =>
        Effect.tryPromise({
          try: () =>
            manager.sendTurn({
              threadId: input.threadId,
              ...(input.input !== undefined ? { input: input.input } : {}),
              ...(input.attachments !== undefined ? { attachments: input.attachments } : {}),
            }),
          catch: (cause) => toRequestError(input.threadId, "session/prompt", cause),
        });

      const interruptTurn: KimiAdapterShape["interruptTurn"] = (threadId, turnId) =>
        Effect.tryPromise({
          try: () => manager.interruptTurn(threadId, turnId),
          catch: (cause) => toRequestError(threadId, "session/cancel", cause),
        });

      const respondToRequest: KimiAdapterShape["respondToRequest"] = (
        threadId,
        requestId,
        decision,
      ) =>
        Effect.tryPromise({
          try: () => manager.respondToRequest(threadId, requestId, decision),
          catch: (cause) => toRequestError(threadId, "request/respond", cause),
        });

      const respondToUserInput: KimiAdapterShape["respondToUserInput"] = (
        threadId,
        _requestId,
        _answers: ProviderUserInputAnswers,
      ) =>
        Effect.tryPromise({
          try: () => manager.respondToUserInput(),
          catch: (cause) => toRequestError(threadId, "user-input/respond", cause),
        });

      const stopSession: KimiAdapterShape["stopSession"] = (threadId) =>
        Effect.tryPromise({
          try: () => manager.stopSession(threadId),
          catch: (cause) => toRequestError(threadId, "session/stop", cause),
        });

      const listSessions: KimiAdapterShape["listSessions"] = () =>
        Effect.promise(() => manager.listSessions());

      const hasSession: KimiAdapterShape["hasSession"] = (threadId) =>
        Effect.promise(() => manager.hasSession(threadId));

      const readThread: KimiAdapterShape["readThread"] = (threadId) =>
        Effect.tryPromise({
          try: () => manager.readThread(threadId),
          catch: (cause) => toRequestError(threadId, "thread/read", cause),
        });

      const rollbackThread: KimiAdapterShape["rollbackThread"] = (threadId, numTurns) =>
        Effect.tryPromise({
          try: () => manager.rollbackThread(threadId, numTurns),
          catch: (cause) => toRequestError(threadId, "thread/rollback", cause),
        });

      const stopAll: KimiAdapterShape["stopAll"] = () =>
        Effect.tryPromise({
          try: () => manager.stopAll(),
          catch: (cause) => toRequestError("_global", "provider/stopAll", cause),
        });

        return {
          provider: PROVIDER,
          capabilities: {
            sessionModelSwitch: "restart-session",
          },
          startSession,
          sendTurn,
        interruptTurn,
        respondToRequest,
        respondToUserInput,
        stopSession,
        listSessions,
        hasSession,
        readThread,
        rollbackThread,
        stopAll,
        streamEvents,
      } satisfies KimiAdapterShape;
    }),
  );
