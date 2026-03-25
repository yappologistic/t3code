import { Effect, Layer } from "effect";

import { PiSdkManager } from "../../piSdkManager.ts";
import { createAcpEventStream, toAdapterMessage } from "../acpAdapterSupport.ts";
import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
} from "../Errors.ts";
import { PiAdapter, type PiAdapterShape } from "../Services/PiAdapter.ts";
import { ServerConfig } from "../../config.ts";

const PROVIDER = "pi" as const;

export interface PiAdapterLiveOptions {
  readonly manager?: PiSdkManager;
}

export const makePiAdapterLive = (options?: PiAdapterLiveOptions) =>
  Layer.effect(
    PiAdapter,
    Effect.gen(function* () {
      const serverConfig = yield* ServerConfig;
      const manager =
        options?.manager ??
        new PiSdkManager({
          stateDir: serverConfig.stateDir,
        });

      const toRequestError = (threadId: string, method: string, cause: unknown) => {
        const message = toAdapterMessage(cause, `${method} failed`);
        if (message.toLowerCase().includes("unknown pi thread")) {
          return new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId,
            cause,
          });
        }
        return new ProviderAdapterRequestError({
          provider: PROVIDER,
          method,
          detail: message,
          cause,
        });
      };

      const streamEvents = yield* createAcpEventStream(manager);

      const startSession: PiAdapterShape["startSession"] = (input) =>
        Effect.tryPromise({
          try: () =>
            manager.startSession({
              threadId: input.threadId,
              provider: PROVIDER,
              ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
              ...(input.model !== undefined ? { model: input.model } : {}),
              ...(input.modelOptions !== undefined ? { modelOptions: input.modelOptions } : {}),
              ...(input.resumeCursor !== undefined ? { resumeCursor: input.resumeCursor } : {}),
              ...(input.providerOptions !== undefined
                ? { providerOptions: input.providerOptions }
                : {}),
              runtimeMode: input.runtimeMode,
            }),
          catch: (cause) =>
            new ProviderAdapterProcessError({
              provider: PROVIDER,
              threadId: input.threadId,
              detail: toAdapterMessage(cause, "Failed to start Pi adapter session."),
              cause,
            }),
        });

      const sendTurn: PiAdapterShape["sendTurn"] = (input) =>
        Effect.tryPromise({
          try: () =>
            manager.sendTurn({
              threadId: input.threadId,
              ...(input.input !== undefined ? { input: input.input } : {}),
              ...(input.attachments !== undefined ? { attachments: input.attachments } : {}),
              ...(input.model !== undefined ? { model: input.model } : {}),
              ...(input.modelOptions !== undefined ? { modelOptions: input.modelOptions } : {}),
              ...(input.interactionMode !== undefined
                ? { interactionMode: input.interactionMode }
                : {}),
            }),
          catch: (cause) => toRequestError(input.threadId, "turn/start", cause),
        });

      const interruptTurn: PiAdapterShape["interruptTurn"] = (threadId, turnId) =>
        Effect.tryPromise({
          try: () => manager.interruptTurn(threadId, turnId),
          catch: (cause) => toRequestError(threadId, "turn/interrupt", cause),
        });

      const respondToRequest: PiAdapterShape["respondToRequest"] = (
        threadId,
        requestId,
        decision,
      ) =>
        Effect.tryPromise({
          try: () => manager.respondToRequest(threadId, requestId, decision),
          catch: (cause) => toRequestError(threadId, "request/respond", cause),
        });

      const respondToUserInput: PiAdapterShape["respondToUserInput"] = (
        threadId,
        requestId,
        answers,
      ) =>
        Effect.tryPromise({
          try: () => manager.respondToUserInput(threadId, requestId, answers),
          catch: (cause) => toRequestError(threadId, "user-input/respond", cause),
        });

      const stopSession: PiAdapterShape["stopSession"] = (threadId) =>
        Effect.tryPromise({
          try: () => manager.stopSession(threadId),
          catch: (cause) => toRequestError(threadId, "session/stop", cause),
        });

      const listSessions: PiAdapterShape["listSessions"] = () =>
        Effect.promise(() => manager.listSessions());

      const hasSession: PiAdapterShape["hasSession"] = (threadId) =>
        Effect.promise(() => manager.hasSession(threadId));

      const readThread: PiAdapterShape["readThread"] = (threadId) =>
        Effect.tryPromise({
          try: () => manager.readThread(threadId),
          catch: (cause) => toRequestError(threadId, "thread/read", cause),
        });

      const rollbackThread: PiAdapterShape["rollbackThread"] = (threadId, numTurns) =>
        Effect.tryPromise({
          try: () => manager.rollbackThread(threadId, numTurns),
          catch: (cause) => toRequestError(threadId, "thread/rollback", cause),
        });

      const stopAll: PiAdapterShape["stopAll"] = () =>
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
      } satisfies PiAdapterShape;
    }),
  );
