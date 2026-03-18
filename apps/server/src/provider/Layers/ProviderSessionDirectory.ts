import { type ProviderKind, type ThreadId } from "@t3tools/contracts";
import { Effect, Layer, Option } from "effect";

import { ProviderSessionRuntimeRepository } from "../../persistence/Services/ProviderSessionRuntime.ts";
import { ProviderSessionDirectoryPersistenceError, ProviderValidationError } from "../Errors.ts";
import {
  ProviderSessionDirectory,
  type ProviderRuntimeBinding,
  type ProviderSessionDirectoryShape,
} from "../Services/ProviderSessionDirectory.ts";

function toPersistenceError(operation: string) {
  return (cause: unknown) =>
    new ProviderSessionDirectoryPersistenceError({
      operation,
      detail: `Failed to execute ${operation}.`,
      cause,
    });
}

function decodeProviderKind(
  providerName: string,
  operation: string,
): Effect.Effect<ProviderKind, ProviderSessionDirectoryPersistenceError> {
  if (
    providerName === "codex" ||
    providerName === "copilot" ||
    providerName === "kimi" ||
    providerName === "opencode"
  ) {
    return Effect.succeed(providerName);
  }
  return Effect.fail(
    new ProviderSessionDirectoryPersistenceError({
      operation,
      detail: `Unknown persisted provider '${providerName}'.`,
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatUnknownProviderBindingMessage(threadId: ThreadId, providerName: string): string {
  return `[provider-session-directory] ignoring unknown persisted provider binding for thread '${threadId}' with provider '${providerName}'`;
}

const toBindingOption = (
  operation: string,
  runtime: {
    readonly threadId: ThreadId;
    readonly providerName: string;
    readonly adapterKey: string;
    readonly runtimeMode: ProviderRuntimeBinding["runtimeMode"];
    readonly status: ProviderRuntimeBinding["status"];
    readonly resumeCursor: unknown | null;
    readonly runtimePayload: unknown | null;
  },
) =>
  Effect.catch(
    decodeProviderKind(runtime.providerName, operation).pipe(
      Effect.map((provider) =>
        Option.some<ProviderRuntimeBinding>({
          threadId: runtime.threadId,
          provider,
          ...(runtime.adapterKey !== undefined ? { adapterKey: runtime.adapterKey } : {}),
          ...(runtime.runtimeMode !== undefined ? { runtimeMode: runtime.runtimeMode } : {}),
          ...(runtime.status !== undefined ? { status: runtime.status } : {}),
          ...(runtime.resumeCursor !== undefined ? { resumeCursor: runtime.resumeCursor } : {}),
          ...(runtime.runtimePayload !== undefined
            ? { runtimePayload: runtime.runtimePayload }
            : {}),
        }),
      ),
    ),
    () =>
      Effect.sync(() => {
        console.warn(formatUnknownProviderBindingMessage(runtime.threadId, runtime.providerName));
        return Option.none<ProviderRuntimeBinding>();
      }),
  );

function mergeRuntimePayload(
  existing: unknown | null,
  next: unknown | null | undefined,
): unknown | null {
  if (next === undefined) {
    return existing ?? null;
  }
  if (isRecord(existing) && isRecord(next)) {
    return { ...existing, ...next };
  }
  return next;
}

const makeProviderSessionDirectory = Effect.gen(function* () {
  const repository = yield* ProviderSessionRuntimeRepository;

  const getBinding = (threadId: ThreadId) =>
    repository.getByThreadId({ threadId }).pipe(
      Effect.mapError(toPersistenceError("ProviderSessionDirectory.getBinding:getByThreadId")),
      Effect.flatMap((runtime) =>
        Option.match(runtime, {
          onNone: () => Effect.succeed(Option.none<ProviderRuntimeBinding>()),
          onSome: (value) => toBindingOption("ProviderSessionDirectory.getBinding", value),
        }),
      ),
    );

  const upsert: ProviderSessionDirectoryShape["upsert"] = Effect.fn(function* (binding) {
    const existing = yield* repository
      .getByThreadId({ threadId: binding.threadId })
      .pipe(Effect.mapError(toPersistenceError("ProviderSessionDirectory.upsert:getByThreadId")));

    const existingRuntime = Option.getOrUndefined(existing);
    const resolvedThreadId = binding.threadId ?? existingRuntime?.threadId;
    if (!resolvedThreadId) {
      return yield* new ProviderValidationError({
        operation: "ProviderSessionDirectory.upsert",
        issue: "threadId must be a non-empty string.",
      });
    }

    const now = new Date().toISOString();
    const providerChanged =
      existingRuntime !== undefined && existingRuntime.providerName !== binding.provider;
    yield* repository
      .upsert({
        threadId: resolvedThreadId,
        providerName: binding.provider,
        adapterKey:
          binding.adapterKey ??
          (providerChanged ? binding.provider : (existingRuntime?.adapterKey ?? binding.provider)),
        runtimeMode: binding.runtimeMode ?? existingRuntime?.runtimeMode ?? "full-access",
        status: binding.status ?? existingRuntime?.status ?? "running",
        lastSeenAt: now,
        resumeCursor:
          binding.resumeCursor !== undefined
            ? binding.resumeCursor
            : (existingRuntime?.resumeCursor ?? null),
        runtimePayload: mergeRuntimePayload(
          existingRuntime?.runtimePayload ?? null,
          binding.runtimePayload,
        ),
      })
      .pipe(Effect.mapError(toPersistenceError("ProviderSessionDirectory.upsert:upsert")));
  });

  const getProvider: ProviderSessionDirectoryShape["getProvider"] = (threadId) =>
    getBinding(threadId).pipe(
      Effect.flatMap((binding) =>
        Option.match(binding, {
          onSome: (value) => Effect.succeed(value.provider),
          onNone: () =>
            Effect.fail(
              new ProviderSessionDirectoryPersistenceError({
                operation: "ProviderSessionDirectory.getProvider",
                detail: `No persisted provider binding found for thread '${threadId}'.`,
              }),
            ),
        }),
      ),
    );

  const listBindings: ProviderSessionDirectoryShape["listBindings"] = () =>
    repository.list().pipe(
      Effect.mapError(toPersistenceError("ProviderSessionDirectory.listBindings:list")),
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (row) =>
          toBindingOption("ProviderSessionDirectory.listBindings", row),
        ),
      ),
      Effect.map((bindings) =>
        bindings.flatMap((binding) => (Option.isSome(binding) ? [binding.value] : [])),
      ),
    );

  const remove: ProviderSessionDirectoryShape["remove"] = (threadId) =>
    repository
      .deleteByThreadId({ threadId })
      .pipe(
        Effect.mapError(toPersistenceError("ProviderSessionDirectory.remove:deleteByThreadId")),
      );

  const listThreadIds: ProviderSessionDirectoryShape["listThreadIds"] = () =>
    repository
      .listThreadIds()
      .pipe(
        Effect.mapError(toPersistenceError("ProviderSessionDirectory.listThreadIds:listThreadIds")),
      );

  return {
    upsert,
    getProvider,
    getBinding,
    listBindings,
    remove,
    listThreadIds,
  } satisfies ProviderSessionDirectoryShape;
});

export const ProviderSessionDirectoryLive = Layer.effect(
  ProviderSessionDirectory,
  makeProviderSessionDirectory,
);

export function makeProviderSessionDirectoryLive() {
  return Layer.effect(ProviderSessionDirectory, makeProviderSessionDirectory);
}
