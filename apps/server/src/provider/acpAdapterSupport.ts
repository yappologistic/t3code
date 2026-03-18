import type { ProviderKind, ProviderRuntimeEvent } from "@t3tools/contracts";
import { Effect, Queue, Stream } from "effect";

import {
  ProviderAdapterRequestError,
  ProviderAdapterSessionClosedError,
  ProviderAdapterSessionNotFoundError,
  type ProviderAdapterError,
} from "./Errors.ts";

export interface AcpAdapterEventSource {
  on(event: "event", listener: (event: ProviderRuntimeEvent) => void): unknown;
  off(event: "event", listener: (event: ProviderRuntimeEvent) => void): unknown;
}

export function toAdapterMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  return fallback;
}

export function toAcpRequestError(input: {
  readonly provider: ProviderKind;
  readonly threadId: string;
  readonly method: string;
  readonly cause: unknown;
  readonly unknownSessionNeedle: string;
  readonly closedSessionNeedle?: string;
}): ProviderAdapterError {
  const normalized = toAdapterMessage(input.cause, "").toLowerCase();
  if (normalized.includes(input.unknownSessionNeedle.toLowerCase())) {
    return new ProviderAdapterSessionNotFoundError({
      provider: input.provider,
      threadId: input.threadId,
      cause: input.cause,
    });
  }
  if (normalized.includes((input.closedSessionNeedle ?? "session is closed").toLowerCase())) {
    return new ProviderAdapterSessionClosedError({
      provider: input.provider,
      threadId: input.threadId,
      cause: input.cause,
    });
  }
  return new ProviderAdapterRequestError({
    provider: input.provider,
    method: input.method,
    detail: toAdapterMessage(input.cause, `${input.method} failed`),
    cause: input.cause,
  });
}

export const createAcpEventStream = (manager: AcpAdapterEventSource) =>
  Effect.gen(function* () {
    const eventQueue = yield* Queue.unbounded<ProviderRuntimeEvent>();

    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const handleEvent = (event: ProviderRuntimeEvent) => {
          void Effect.runPromise(Queue.offer(eventQueue, event).pipe(Effect.asVoid));
        };
        manager.on("event", handleEvent);
        return handleEvent;
      }),
      (handleEvent) =>
        Effect.gen(function* () {
          yield* Effect.sync(() => {
            manager.off("event", handleEvent);
          });
          yield* Queue.shutdown(eventQueue);
        }),
    );

    return Stream.fromQueue(eventQueue);
  });
