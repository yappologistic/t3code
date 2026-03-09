import { createRequire } from "node:module";

import { Effect, FileSystem, Layer, Path } from "effect";
import {
  PtyAdapter,
  PtyAdapterShape,
  PtyExitEvent,
  PtyProcess,
  PtySpawnError,
} from "../Services/PTY";

let didEnsureSpawnHelperExecutable = false;
const NODE_PTY_UNAVAILABLE_MESSAGE =
  "Terminal support is unavailable because the native node-pty module could not be loaded.";

type NodePtyExitEvent = {
  exitCode: number;
  signal?: number | string;
};

type NodePtyDisposable = {
  dispose(): void;
};

type NodePtyHandle = {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(callback: (data: string) => void): NodePtyDisposable;
  onExit(callback: (event: NodePtyExitEvent) => void): NodePtyDisposable;
};

type NodePtyModuleLike = {
  spawn(
    shell: string,
    args: string[],
    options: {
      cwd: string;
      cols: number;
      rows: number;
      env: NodeJS.ProcessEnv;
      name: string;
    },
  ): NodePtyHandle;
};

const resolveNodePtySpawnHelperPath = Effect.gen(function* () {
  const requireForNodePty = createRequire(import.meta.url);
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  const packageJsonPath = requireForNodePty.resolve("node-pty/package.json");
  const packageDir = path.dirname(packageJsonPath);
  const candidates = [
    path.join(packageDir, "build", "Release", "spawn-helper"),
    path.join(packageDir, "build", "Debug", "spawn-helper"),
    path.join(packageDir, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
  ];

  for (const candidate of candidates) {
    if (yield* fs.exists(candidate)) {
      return candidate;
    }
  }
  return null;
}).pipe(Effect.orElseSucceed(() => null));

export const ensureNodePtySpawnHelperExecutable = Effect.fn(function* (explicitPath?: string) {
  const fs = yield* FileSystem.FileSystem;
  if (process.platform === "win32") return;
  if (!explicitPath && didEnsureSpawnHelperExecutable) return;

  const helperPath = explicitPath ?? (yield* resolveNodePtySpawnHelperPath);
  if (!helperPath) return;
  if (!explicitPath) {
    didEnsureSpawnHelperExecutable = true;
  }

  if (!(yield* fs.exists(helperPath))) {
    return;
  }

  // Best-effort: avoid FileSystem.stat in packaged mode where some fs metadata can be missing.
  yield* fs.chmod(helperPath, 0o755).pipe(Effect.orElseSucceed(() => undefined));
});

class NodePtyProcess implements PtyProcess {
  constructor(private readonly process: NodePtyHandle) {}

  get pid(): number {
    return this.process.pid;
  }

  write(data: string): void {
    this.process.write(data);
  }

  resize(cols: number, rows: number): void {
    this.process.resize(cols, rows);
  }

  kill(signal?: string): void {
    this.process.kill(signal);
  }

  onData(callback: (data: string) => void): () => void {
    const disposable = this.process.onData(callback);
    return () => {
      disposable.dispose();
    };
  }

  onExit(callback: (event: PtyExitEvent) => void): () => void {
    const disposable = this.process.onExit((event: NodePtyExitEvent) => {
      callback({
        exitCode: event.exitCode,
        signal: typeof event.signal === "number" ? event.signal : null,
      });
    });
    return () => {
      disposable.dispose();
    };
  }
}

function createUnavailablePtyAdapter(cause: unknown): PtyAdapterShape {
  return {
    spawn: () =>
      Effect.fail(
        new PtySpawnError({
          adapter: "node-pty",
          message: "Terminal support is unavailable because node-pty failed to load.",
          cause,
        }),
      ),
  } satisfies PtyAdapterShape;
}

export const NodePtyAdapterLive = Layer.effect(
  PtyAdapter,
  Effect.gen(function* () {
    const requireForNodePty = createRequire(import.meta.url);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const nodePty = yield* Effect.try({
      try: () => requireForNodePty("node-pty") as NodePtyModuleLike,
      catch: (cause) => cause,
    }).pipe(
      Effect.catch((cause) =>
        Effect.sync(() => {
          console.warn("[terminal] Falling back because node-pty failed to load.", cause);
          return null;
        }),
      ),
    );

    if (nodePty === null) {
      return createUnavailablePtyAdapter(new Error("node-pty module failed to load"));
    }

    const ensureNodePtySpawnHelperExecutableCached = yield* Effect.cached(
      ensureNodePtySpawnHelperExecutable().pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.orElseSucceed(() => undefined),
      ),
    );

    return {
      spawn: Effect.fn(function* (input) {
        if (!nodePty) {
          return yield* new PtySpawnError({
            adapter: "node-pty",
            message: NODE_PTY_UNAVAILABLE_MESSAGE,
          });
        }

        yield* ensureNodePtySpawnHelperExecutableCached;
        const ptyProcess = yield* Effect.try({
          try: () =>
            nodePty.spawn(input.shell, input.args ?? [], {
              cwd: input.cwd,
              cols: input.cols,
              rows: input.rows,
              env: input.env,
              name:
                globalThis.process.platform === "win32" ? "xterm-color" : "xterm-256color",
            }),
          catch: (cause) =>
            new PtySpawnError({
              adapter: "node-pty",
              message: "Failed to spawn PTY process",
              cause,
            }),
        });
        return new NodePtyProcess(ptyProcess);
      }),
    } satisfies PtyAdapterShape;
  }),
);
