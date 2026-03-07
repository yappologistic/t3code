import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { Effect, Layer, Sink, Stream } from "effect";
import * as PlatformError from "effect/PlatformError";
import { ChildProcessSpawner } from "effect/unstable/process";

import {
  checkCodexProviderStatus,
  checkCopilotProviderStatus,
  parseAuthStatusFromOutput,
} from "./ProviderHealth";

// ── Test helpers ────────────────────────────────────────────────────

const encoder = new TextEncoder();

function mockHandle(result: { stdout: string; stderr: string; code: number }) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result.code)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin: Sink.drain,
    stdout: Stream.make(encoder.encode(result.stdout)),
    stderr: Stream.make(encoder.encode(result.stderr)),
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

function mockSpawnerLayer(
  handler: (
    commandName: string,
    args: ReadonlyArray<string>,
  ) => { stdout: string; stderr: string; code: number },
) {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      const cmd = command as unknown as { command: string; args: ReadonlyArray<string> };
      return Effect.succeed(mockHandle(handler(cmd.command, cmd.args)));
    }),
  );
}

function failingSpawnerLayer(description: string) {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() =>
      Effect.fail(
        PlatformError.systemError({
          _tag: "NotFound",
          module: "ChildProcess",
          method: "spawn",
          description,
        }),
      ),
    ),
  );
}

// ── Tests ───────────────────────────────────────────────────────────

it.effect("returns ready when codex is installed and authenticated", () =>
  Effect.gen(function* () {
    const status = yield* checkCodexProviderStatus;
    assert.strictEqual(status.provider, "codex");
    assert.strictEqual(status.status, "ready");
    assert.strictEqual(status.available, true);
    assert.strictEqual(status.authStatus, "authenticated");
  }).pipe(
    Effect.provide(
      mockSpawnerLayer((commandName, args) => {
        const joined = args.join(" ");
        if (commandName === "codex" && joined === "--version") {
          return { stdout: "codex 1.0.0\n", stderr: "", code: 0 };
        }
        if (commandName === "codex" && joined === "login status") {
          return { stdout: "Logged in\n", stderr: "", code: 0 };
        }
        throw new Error(`Unexpected args: ${joined}`);
      }),
    ),
  ),
);

it.effect("returns ready when copilot is installed and auth env is present", () =>
  Effect.gen(function* () {
    const previousToken = process.env.COPILOT_GITHUB_TOKEN;
    process.env.COPILOT_GITHUB_TOKEN = "github_pat_123";
    try {
      const status = yield* checkCopilotProviderStatus;
      assert.strictEqual(status.provider, "copilot");
      assert.strictEqual(status.status, "ready");
      assert.strictEqual(status.available, true);
      assert.strictEqual(status.authStatus, "authenticated");
    } finally {
      if (previousToken === undefined) {
        delete process.env.COPILOT_GITHUB_TOKEN;
      } else {
        process.env.COPILOT_GITHUB_TOKEN = previousToken;
      }
    }
  }).pipe(
    Effect.provide(
      mockSpawnerLayer((commandName, args) => {
        const joined = args.join(" ");
        if (commandName === "copilot" && joined === "--version") {
          return { stdout: "copilot 1.0.0\n", stderr: "", code: 0 };
        }
        throw new Error(`Unexpected args: ${joined}`);
      }),
    ),
  ),
);

it.effect("returns unavailable when codex is missing", () =>
  Effect.gen(function* () {
    const status = yield* checkCodexProviderStatus;
    assert.strictEqual(status.provider, "codex");
    assert.strictEqual(status.status, "error");
    assert.strictEqual(status.available, false);
    assert.strictEqual(status.authStatus, "unknown");
    assert.strictEqual(status.message, "Codex CLI (`codex`) is not installed or not on PATH.");
  }).pipe(Effect.provide(failingSpawnerLayer("spawn codex ENOENT"))),
);

it.effect("returns unauthenticated when auth probe reports login required", () =>
  Effect.gen(function* () {
    const status = yield* checkCodexProviderStatus;
    assert.strictEqual(status.provider, "codex");
    assert.strictEqual(status.status, "error");
    assert.strictEqual(status.available, true);
    assert.strictEqual(status.authStatus, "unauthenticated");
    assert.strictEqual(
      status.message,
      "Codex CLI is not authenticated. Run `codex login` and try again.",
    );
  }).pipe(
    Effect.provide(
      mockSpawnerLayer((commandName, args) => {
        const joined = args.join(" ");
        if (commandName === "codex" && joined === "--version") {
          return { stdout: "codex 1.0.0\n", stderr: "", code: 0 };
        }
        if (commandName === "codex" && joined === "login status") {
          return { stdout: "", stderr: "Not logged in. Run codex login.", code: 1 };
        }
        throw new Error(`Unexpected args: ${joined}`);
      }),
    ),
  ),
);

it.effect(
  "returns unauthenticated when login status output includes 'not logged in'",
  () =>
    Effect.gen(function* () {
      const status = yield* checkCodexProviderStatus;
      assert.strictEqual(status.provider, "codex");
      assert.strictEqual(status.status, "error");
      assert.strictEqual(status.available, true);
      assert.strictEqual(status.authStatus, "unauthenticated");
      assert.strictEqual(
        status.message,
        "Codex CLI is not authenticated. Run `codex login` and try again.",
      );
    }).pipe(
      Effect.provide(
        mockSpawnerLayer((commandName, args) => {
          const joined = args.join(" ");
          if (commandName === "codex" && joined === "--version") {
            return { stdout: "codex 1.0.0\n", stderr: "", code: 0 };
          }
          if (commandName === "codex" && joined === "login status") {
            return { stdout: "Not logged in\n", stderr: "", code: 1 };
          }
          throw new Error(`Unexpected args: ${joined}`);
        }),
      ),
    ),
);

it.effect("returns warning when login status command is unsupported", () =>
  Effect.gen(function* () {
    const status = yield* checkCodexProviderStatus;
    assert.strictEqual(status.provider, "codex");
    assert.strictEqual(status.status, "warning");
    assert.strictEqual(status.available, true);
    assert.strictEqual(status.authStatus, "unknown");
    assert.strictEqual(
      status.message,
      "Codex CLI authentication status command is unavailable in this Codex version.",
    );
  }).pipe(
    Effect.provide(
      mockSpawnerLayer((commandName, args) => {
        const joined = args.join(" ");
        if (commandName === "codex" && joined === "--version") {
          return { stdout: "codex 1.0.0\n", stderr: "", code: 0 };
        }
        if (commandName === "codex" && joined === "login status") {
          return { stdout: "", stderr: "error: unknown command 'login'", code: 2 };
        }
        throw new Error(`Unexpected args: ${joined}`);
      }),
    ),
  ),
);

it.effect("returns unauthenticated when copilot auth env uses a classic PAT", () =>
  Effect.gen(function* () {
    const previousToken = process.env.COPILOT_GITHUB_TOKEN;
    process.env.COPILOT_GITHUB_TOKEN = "ghp_legacy";
    try {
      const status = yield* checkCopilotProviderStatus;
      assert.strictEqual(status.provider, "copilot");
      assert.strictEqual(status.status, "error");
      assert.strictEqual(status.available, true);
      assert.strictEqual(status.authStatus, "unauthenticated");
    } finally {
      if (previousToken === undefined) {
        delete process.env.COPILOT_GITHUB_TOKEN;
      } else {
        process.env.COPILOT_GITHUB_TOKEN = previousToken;
      }
    }
  }).pipe(
    Effect.provide(
      mockSpawnerLayer((commandName, args) => {
        const joined = args.join(" ");
        if (commandName === "copilot" && joined === "--version") {
          return { stdout: "copilot 1.0.0\n", stderr: "", code: 0 };
        }
        throw new Error(`Unexpected args: ${joined}`);
      }),
    ),
  ),
);

it.effect("mentions gh auth login when copilot auth cannot be verified non-interactively", () =>
  Effect.gen(function* () {
    const previousCopilotToken = process.env.COPILOT_GITHUB_TOKEN;
    const previousGhToken = process.env.GH_TOKEN;
    const previousGithubToken = process.env.GITHUB_TOKEN;
    delete process.env.COPILOT_GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      const status = yield* checkCopilotProviderStatus;
      assert.strictEqual(status.provider, "copilot");
      assert.strictEqual(status.status, "warning");
      assert.strictEqual(status.available, true);
      assert.strictEqual(status.authStatus, "unknown");
      assert.strictEqual(
        status.message,
        "Could not verify GitHub Copilot CLI authentication non-interactively. Run `copilot login`, `gh auth login`, or set COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN if session start fails.",
      );
    } finally {
      if (previousCopilotToken === undefined) {
        delete process.env.COPILOT_GITHUB_TOKEN;
      } else {
        process.env.COPILOT_GITHUB_TOKEN = previousCopilotToken;
      }
      if (previousGhToken === undefined) {
        delete process.env.GH_TOKEN;
      } else {
        process.env.GH_TOKEN = previousGhToken;
      }
      if (previousGithubToken === undefined) {
        delete process.env.GITHUB_TOKEN;
      } else {
        process.env.GITHUB_TOKEN = previousGithubToken;
      }
    }
  }).pipe(
    Effect.provide(
      mockSpawnerLayer((commandName, args) => {
        const joined = args.join(" ");
        if (commandName === "copilot" && joined === "--version") {
          return { stdout: "copilot 1.0.0\n", stderr: "", code: 0 };
        }
        throw new Error(`Unexpected args: ${joined}`);
      }),
    ),
  ),
);

// ── Pure function tests ─────────────────────────────────────────────

it("parseAuthStatusFromOutput: exit code 0 with no auth markers is ready", () => {
  const parsed = parseAuthStatusFromOutput({ stdout: "OK\n", stderr: "", code: 0 });
  assert.strictEqual(parsed.status, "ready");
  assert.strictEqual(parsed.authStatus, "authenticated");
});

it("parseAuthStatusFromOutput: JSON with authenticated=false is unauthenticated", () => {
  const parsed = parseAuthStatusFromOutput({
    stdout: '[{"authenticated":false}]\n',
    stderr: "",
    code: 0,
  });
  assert.strictEqual(parsed.status, "error");
  assert.strictEqual(parsed.authStatus, "unauthenticated");
});

it("parseAuthStatusFromOutput: JSON without auth marker is warning", () => {
  const parsed = parseAuthStatusFromOutput({
    stdout: '[{"ok":true}]\n',
    stderr: "",
    code: 0,
  });
  assert.strictEqual(parsed.status, "warning");
  assert.strictEqual(parsed.authStatus, "unknown");
});
