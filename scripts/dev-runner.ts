#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { NetService } from "@t3tools/shared/Net";
import { withWsAuthToken } from "@t3tools/shared/wsAuth";
import { Config, Data, Effect, Hash, Layer, Logger, Option, Path, Schema } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { ChildProcess } from "effect/unstable/process";

const BASE_SERVER_PORT = 3773;
const BASE_WEB_PORT = 5733;
const MAX_HASH_OFFSET = 3000;
const MAX_PORT = 65535;
const DEFAULT_LOOPBACK_HOST = "127.0.0.1";
const DEV_RUNNER_SELECTION_FILE = ".dev-runner-selection.json";

export const DEFAULT_DEV_STATE_DIR = Effect.map(Effect.service(Path.Path), (path) =>
  path.join(homedir(), ".t3", "dev"),
);

const MODE_ARGS = {
  dev: [
    "run",
    "dev",
    "--ui=tui",
    "--filter=@t3tools/contracts",
    "--filter=@t3tools/web",
    "--filter=rowl",
    "--parallel",
  ],
  "dev:server": ["run", "dev", "--filter=rowl"],
  "dev:web": ["run", "dev", "--filter=@t3tools/web"],
  "dev:desktop": ["run", "dev", "--filter=@t3tools/desktop", "--filter=@t3tools/web", "--parallel"],
} as const satisfies Record<string, ReadonlyArray<string>>;

type DevMode = keyof typeof MODE_ARGS;
type PortAvailabilityCheck<R = never> = (port: number) => Effect.Effect<boolean, never, R>;

const DEV_RUNNER_MODES = Object.keys(MODE_ARGS) as Array<DevMode>;

interface DevRunnerSelectionClaim {
  readonly pid: number;
  readonly mode: DevMode;
}

interface DevRunnerSelectionState {
  readonly version: 1;
  readonly offset: number;
  readonly claims: ReadonlyArray<DevRunnerSelectionClaim>;
}

class DevRunnerError extends Data.TaggedError("DevRunnerError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const optionalStringConfig = (name: string): Config.Config<string | undefined> =>
  Config.string(name).pipe(
    Config.option,
    Config.map((value) => Option.getOrUndefined(value)),
  );
const optionalBooleanConfig = (name: string): Config.Config<boolean | undefined> =>
  Config.boolean(name).pipe(
    Config.option,
    Config.map((value) => Option.getOrUndefined(value)),
  );
const optionalPortConfig = (name: string): Config.Config<number | undefined> =>
  Config.port(name).pipe(
    Config.option,
    Config.map((value) => Option.getOrUndefined(value)),
  );
const optionalIntegerConfig = (name: string): Config.Config<number | undefined> =>
  Config.int(name).pipe(
    Config.option,
    Config.map((value) => Option.getOrUndefined(value)),
  );
const optionalUrlConfig = (name: string): Config.Config<URL | undefined> =>
  Config.url(name).pipe(
    Config.option,
    Config.map((value) => Option.getOrUndefined(value)),
  );

const OffsetConfig = Config.all({
  portOffset: optionalIntegerConfig("ROWL_PORT_OFFSET"),
  devInstance: optionalStringConfig("ROWL_DEV_INSTANCE"),
});

export function resolveOffset(config: {
  readonly portOffset: number | undefined;
  readonly devInstance: string | undefined;
}): { readonly offset: number; readonly source: string } {
  if (config.portOffset !== undefined) {
    if (config.portOffset < 0) {
      throw new Error(`Invalid ROWL_PORT_OFFSET: ${config.portOffset}`);
    }
    return {
      offset: config.portOffset,
      source: `ROWL_PORT_OFFSET=${config.portOffset}`,
    };
  }

  const seed = config.devInstance?.trim();
  if (!seed) {
    return { offset: 0, source: "default ports" };
  }

  if (/^\d+$/.test(seed)) {
    return { offset: Number(seed), source: `numeric ROWL_DEV_INSTANCE=${seed}` };
  }

  const offset = ((Hash.string(seed) >>> 0) % MAX_HASH_OFFSET) + 1;
  return { offset, source: `hashed ROWL_DEV_INSTANCE=${seed}` };
}

function resolveStateDir(stateDir: string | undefined): Effect.Effect<string, never, Path.Path> {
  return Effect.gen(function* () {
    const path = yield* Path.Path;
    const configured = stateDir?.trim();

    if (configured) {
      // Resolve relative paths against cwd (monorepo root) before turbo changes directories.
      return path.resolve(configured);
    }

    return yield* DEFAULT_DEV_STATE_DIR;
  });
}

function getDevRunnerSelectionPath(stateDir: string): string {
  return join(stateDir, DEV_RUNNER_SELECTION_FILE);
}

function isLiveProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isDevMode(value: unknown): value is DevMode {
  return typeof value === "string" && DEV_RUNNER_MODES.includes(value as DevMode);
}

async function readDevRunnerSelection(
  selectionPath: string,
): Promise<DevRunnerSelectionState | null> {
  try {
    const raw = await readFile(selectionPath, "utf8");
    const parsed = JSON.parse(raw) as {
      offset?: unknown;
      claims?: ReadonlyArray<{ pid?: unknown; mode?: unknown }>;
    };

    if (
      typeof parsed.offset !== "number" ||
      !Number.isInteger(parsed.offset) ||
      parsed.offset < 0 ||
      !Array.isArray(parsed.claims)
    ) {
      return null;
    }

    const claims = parsed.claims.flatMap((claim) => {
      if (
        typeof claim?.pid !== "number" ||
        !Number.isInteger(claim.pid) ||
        claim.pid <= 0 ||
        !isDevMode(claim.mode) ||
        !isLiveProcess(claim.pid)
      ) {
        return [];
      }

      return [
        {
          pid: claim.pid,
          mode: claim.mode,
        },
      ];
    });

    if (claims.length === 0) {
      return null;
    }

    return {
      version: 1,
      offset: parsed.offset,
      claims,
    };
  } catch {
    return null;
  }
}

async function writeDevRunnerSelection(
  selectionPath: string,
  state: DevRunnerSelectionState,
): Promise<void> {
  await mkdir(dirname(selectionPath), { recursive: true });
  await writeFile(selectionPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function claimDevRunnerSelection(params: {
  readonly selectionPath: string;
  readonly offset: number;
  readonly mode: DevMode;
  readonly pid?: number;
}): Promise<void> {
  const pid = params.pid ?? process.pid;
  const current = await readDevRunnerSelection(params.selectionPath);
  const claims =
    current?.offset === params.offset ? current.claims.filter((claim) => claim.pid !== pid) : [];

  await writeDevRunnerSelection(params.selectionPath, {
    version: 1,
    offset: params.offset,
    claims: [...claims, { pid, mode: params.mode }],
  });
}

async function releaseDevRunnerSelection(selectionPath: string, pid = process.pid): Promise<void> {
  const current = await readDevRunnerSelection(selectionPath);
  if (!current) {
    await rm(selectionPath, { force: true });
    return;
  }

  const claims = current.claims.filter((claim) => claim.pid !== pid);
  if (claims.length === 0) {
    await rm(selectionPath, { force: true });
    return;
  }

  await writeDevRunnerSelection(selectionPath, {
    version: 1,
    offset: current.offset,
    claims,
  });
}

interface CreateDevRunnerEnvInput {
  readonly mode: DevMode;
  readonly baseEnv: NodeJS.ProcessEnv;
  readonly serverOffset: number;
  readonly webOffset: number;
  readonly stateDir: string | undefined;
  readonly authToken: string | undefined;
  readonly noBrowser: boolean | undefined;
  readonly autoBootstrapProjectFromCwd: boolean | undefined;
  readonly logWebSocketEvents: boolean | undefined;
  readonly host: string | undefined;
  readonly port: number | undefined;
  readonly devUrl: URL | undefined;
}

export function createDevRunnerEnv({
  mode,
  baseEnv,
  serverOffset,
  webOffset,
  stateDir,
  authToken,
  noBrowser,
  autoBootstrapProjectFromCwd,
  logWebSocketEvents,
  host,
  port,
  devUrl,
}: CreateDevRunnerEnvInput): Effect.Effect<NodeJS.ProcessEnv, never, Path.Path> {
  return Effect.gen(function* () {
    const serverPort = port ?? BASE_SERVER_PORT + serverOffset;
    const webPort = BASE_WEB_PORT + webOffset;
    const resolvedStateDir = yield* resolveStateDir(stateDir);
    const resolvedHost =
      host && host !== "0.0.0.0" && host !== "::" && host !== "::0" ? host : DEFAULT_LOOPBACK_HOST;
    const urlHost =
      resolvedHost.includes(":") && !resolvedHost.startsWith("[")
        ? `[${resolvedHost}]`
        : resolvedHost;

    const output: NodeJS.ProcessEnv = {
      ...baseEnv,
      ROWL_PORT: String(serverPort),
      PORT: String(webPort),
      ELECTRON_RENDERER_PORT: String(webPort),
      VITE_WS_URL: withWsAuthToken(`ws://${urlHost}:${serverPort}`, authToken),
      VITE_DEV_SERVER_URL: devUrl?.toString() ?? `http://${urlHost}:${webPort}`,
      ROWL_STATE_DIR: resolvedStateDir,
    };

    if (host !== undefined) {
      output.ROWL_HOST = host;
    }

    if (authToken !== undefined) {
      output.ROWL_AUTH_TOKEN = authToken;
    } else {
      delete output.ROWL_AUTH_TOKEN;
    }

    if (noBrowser !== undefined) {
      output.ROWL_NO_BROWSER = noBrowser ? "1" : "0";
    } else {
      delete output.ROWL_NO_BROWSER;
    }

    if (autoBootstrapProjectFromCwd !== undefined) {
      output.ROWL_AUTO_BOOTSTRAP_PROJECT_FROM_CWD = autoBootstrapProjectFromCwd ? "1" : "0";
    } else {
      delete output.ROWL_AUTO_BOOTSTRAP_PROJECT_FROM_CWD;
    }

    if (logWebSocketEvents !== undefined) {
      output.ROWL_LOG_WS_EVENTS = logWebSocketEvents ? "1" : "0";
    } else {
      delete output.ROWL_LOG_WS_EVENTS;
    }

    if (mode === "dev") {
      output.ROWL_MODE = "web";
      delete output.ROWL_DESKTOP_WS_URL;
    }

    if (mode === "dev:server" || mode === "dev:web") {
      output.ROWL_MODE = "web";
      delete output.ROWL_DESKTOP_WS_URL;
    }

    return output;
  });
}

function portPairForOffset(offset: number): {
  readonly serverPort: number;
  readonly webPort: number;
} {
  return {
    serverPort: BASE_SERVER_PORT + offset,
    webPort: BASE_WEB_PORT + offset,
  };
}

const defaultCheckPortAvailability: PortAvailabilityCheck<NetService> = (port) =>
  Effect.gen(function* () {
    const net = yield* NetService;
    return yield* net.isPortAvailableOnLoopback(port);
  });

interface FindFirstAvailableOffsetInput<R = NetService> {
  readonly startOffset: number;
  readonly requireServerPort: boolean;
  readonly requireWebPort: boolean;
  readonly checkPortAvailability?: PortAvailabilityCheck<R>;
}

export function findFirstAvailableOffset<R = NetService>({
  startOffset,
  requireServerPort,
  requireWebPort,
  checkPortAvailability,
}: FindFirstAvailableOffsetInput<R>): Effect.Effect<number, DevRunnerError, R> {
  return Effect.gen(function* () {
    const checkPort = (checkPortAvailability ??
      defaultCheckPortAvailability) as PortAvailabilityCheck<R>;

    for (let candidate = startOffset; ; candidate += 1) {
      const { serverPort, webPort } = portPairForOffset(candidate);
      const serverPortOutOfRange = serverPort > MAX_PORT;
      const webPortOutOfRange = webPort > MAX_PORT;

      if (
        (requireServerPort && serverPortOutOfRange) ||
        (requireWebPort && webPortOutOfRange) ||
        (!requireServerPort && !requireWebPort && (serverPortOutOfRange || webPortOutOfRange))
      ) {
        break;
      }

      const checks: Array<Effect.Effect<boolean, never, R>> = [];
      if (requireServerPort) {
        checks.push(checkPort(serverPort));
      }
      if (requireWebPort) {
        checks.push(checkPort(webPort));
      }

      if (checks.length === 0) {
        return candidate;
      }

      const availability = yield* Effect.all(checks);
      if (availability.every(Boolean)) {
        return candidate;
      }
    }

    return yield* new DevRunnerError({
      message: `No available dev ports found from offset ${startOffset}. Tried server=${BASE_SERVER_PORT}+n web=${BASE_WEB_PORT}+n up to port ${MAX_PORT}.`,
    });
  });
}

interface ResolveModePortOffsetsInput<R = NetService> {
  readonly mode: DevMode;
  readonly startOffset: number;
  readonly hasExplicitServerPort: boolean;
  readonly hasExplicitDevUrl: boolean;
  readonly activeSharedOffset?: number;
  readonly checkPortAvailability?: PortAvailabilityCheck<R>;
}

export function resolveModePortOffsets<R = NetService>({
  mode,
  startOffset,
  hasExplicitServerPort,
  hasExplicitDevUrl,
  activeSharedOffset,
  checkPortAvailability,
}: ResolveModePortOffsetsInput<R>): Effect.Effect<
  { readonly serverOffset: number; readonly webOffset: number },
  DevRunnerError,
  R
> {
  return Effect.gen(function* () {
    const checkPort = (checkPortAvailability ??
      defaultCheckPortAvailability) as PortAvailabilityCheck<R>;

    if (activeSharedOffset !== undefined) {
      return { serverOffset: activeSharedOffset, webOffset: activeSharedOffset };
    }

    if (mode === "dev:web") {
      if (hasExplicitDevUrl) {
        return { serverOffset: startOffset, webOffset: startOffset };
      }

      const sharedOffset = yield* findFirstAvailableOffset({
        startOffset,
        requireServerPort: true,
        requireWebPort: true,
        checkPortAvailability: checkPort,
      });
      return { serverOffset: sharedOffset, webOffset: sharedOffset };
    }

    if (mode === "dev:server") {
      if (hasExplicitServerPort) {
        return { serverOffset: startOffset, webOffset: startOffset };
      }

      const sharedOffset = yield* findFirstAvailableOffset({
        startOffset,
        requireServerPort: true,
        requireWebPort: true,
        checkPortAvailability: checkPort,
      });
      return { serverOffset: sharedOffset, webOffset: sharedOffset };
    }

    const sharedOffset = yield* findFirstAvailableOffset({
      startOffset,
      requireServerPort: !hasExplicitServerPort,
      requireWebPort: !hasExplicitDevUrl,
      checkPortAvailability: checkPort,
    });

    return { serverOffset: sharedOffset, webOffset: sharedOffset };
  });
}

interface DevRunnerCliInput {
  readonly mode: DevMode;
  readonly stateDir: string | undefined;
  readonly authToken: string | undefined;
  readonly noBrowser: boolean | undefined;
  readonly autoBootstrapProjectFromCwd: boolean | undefined;
  readonly logWebSocketEvents: boolean | undefined;
  readonly host: string | undefined;
  readonly port: number | undefined;
  readonly devUrl: URL | undefined;
  readonly dryRun: boolean;
  readonly turboArgs: ReadonlyArray<string>;
}

const readOptionalBooleanEnv = (name: string): boolean | undefined => {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }
  if (value === "1" || value.toLowerCase() === "true") {
    return true;
  }
  if (value === "0" || value.toLowerCase() === "false") {
    return false;
  }
  return undefined;
};

const resolveOptionalBooleanOverride = (
  explicitValue: boolean | undefined,
  envValue: boolean | undefined,
): boolean | undefined => {
  if (explicitValue === true) {
    return true;
  }

  if (explicitValue === false) {
    return envValue;
  }

  return envValue;
};

export function runDevRunnerWithInput(input: DevRunnerCliInput) {
  return Effect.gen(function* () {
    const { portOffset, devInstance } = yield* OffsetConfig.asEffect().pipe(
      Effect.mapError(
        (cause) =>
          new DevRunnerError({
            message: "Failed to read ROWL_PORT_OFFSET/ROWL_DEV_INSTANCE configuration.",
            cause,
          }),
      ),
    );

    const { offset, source } = yield* Effect.try({
      try: () => resolveOffset({ portOffset, devInstance }),
      catch: (cause) =>
        new DevRunnerError({
          message: cause instanceof Error ? cause.message : String(cause),
          cause,
        }),
    });

    const envOverrides = {
      noBrowser: readOptionalBooleanEnv("ROWL_NO_BROWSER"),
      autoBootstrapProjectFromCwd: readOptionalBooleanEnv("ROWL_AUTO_BOOTSTRAP_PROJECT_FROM_CWD"),
      logWebSocketEvents: readOptionalBooleanEnv("ROWL_LOG_WS_EVENTS"),
    };

    const resolvedStateDir = yield* resolveStateDir(input.stateDir);
    const selectionPath =
      input.port === undefined && input.devUrl === undefined
        ? getDevRunnerSelectionPath(resolvedStateDir)
        : undefined;
    const activeSelection = yield* selectionPath
      ? Effect.promise(() => readDevRunnerSelection(selectionPath))
      : Effect.succeed(null);

    const portOffsetInput = {
      mode: input.mode,
      startOffset: offset,
      hasExplicitServerPort: input.port !== undefined,
      hasExplicitDevUrl: input.devUrl !== undefined,
    };

    const { serverOffset, webOffset } = activeSelection
      ? yield* resolveModePortOffsets({
          ...portOffsetInput,
          activeSharedOffset: activeSelection.offset,
        })
      : yield* resolveModePortOffsets(portOffsetInput);

    if (selectionPath) {
      yield* Effect.acquireRelease(
        Effect.promise(() =>
          claimDevRunnerSelection({
            selectionPath,
            offset: serverOffset,
            mode: input.mode,
          }),
        ),
        () => Effect.promise(() => releaseDevRunnerSelection(selectionPath)),
      );
    }

    const env = yield* createDevRunnerEnv({
      mode: input.mode,
      baseEnv: process.env,
      serverOffset,
      webOffset,
      stateDir: resolvedStateDir,
      authToken: input.authToken,
      noBrowser: resolveOptionalBooleanOverride(input.noBrowser, envOverrides.noBrowser),
      autoBootstrapProjectFromCwd: resolveOptionalBooleanOverride(
        input.autoBootstrapProjectFromCwd,
        envOverrides.autoBootstrapProjectFromCwd,
      ),
      logWebSocketEvents: resolveOptionalBooleanOverride(
        input.logWebSocketEvents,
        envOverrides.logWebSocketEvents,
      ),
      host: input.host,
      port: input.port,
      devUrl: input.devUrl,
    });

    const selectionSuffix =
      serverOffset !== offset || webOffset !== offset
        ? ` selectedOffset(server=${serverOffset},web=${webOffset})`
        : "";

    yield* Effect.logInfo(
      `[dev-runner] mode=${input.mode} source=${source}${selectionSuffix} serverPort=${String(env.ROWL_PORT)} webPort=${String(env.PORT)} stateDir=${String(env.ROWL_STATE_DIR)}`,
    );

    if (input.dryRun) {
      return;
    }

    const child = yield* ChildProcess.make(
      "turbo",
      [...MODE_ARGS[input.mode], ...input.turboArgs],
      {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        env,
        extendEnv: false,
        // Windows needs shell mode to resolve .cmd shims (e.g. bun.cmd).
        shell: process.platform === "win32",
        // Keep turbo in the same process group so terminal signals (Ctrl+C)
        // reach it directly. Effect defaults to detached: true on non-Windows,
        // which would put turbo in a new group and require manual forwarding.
        detached: false,
        forceKillAfter: "1500 millis",
      },
    );

    const exitCode = yield* child.exitCode;
    if (exitCode !== 0) {
      return yield* new DevRunnerError({
        message: `turbo exited with code ${exitCode}`,
      });
    }
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof DevRunnerError
        ? cause
        : new DevRunnerError({
            message: cause instanceof Error ? cause.message : "dev-runner failed",
            cause,
          }),
    ),
  );
}

const devRunnerCli = Command.make("dev-runner", {
  mode: Argument.choice("mode", DEV_RUNNER_MODES).pipe(
    Argument.withDescription("Development mode to run."),
  ),
  stateDir: Flag.string("state-dir").pipe(
    Flag.withDescription("State directory path (forwards to ROWL_STATE_DIR)."),
    Flag.withFallbackConfig(optionalStringConfig("ROWL_STATE_DIR")),
  ),
  authToken: Flag.string("auth-token").pipe(
    Flag.withDescription("Auth token (forwards to ROWL_AUTH_TOKEN)."),
    Flag.withAlias("token"),
    Flag.withFallbackConfig(optionalStringConfig("ROWL_AUTH_TOKEN")),
  ),
  noBrowser: Flag.boolean("no-browser").pipe(
    Flag.withDescription("Browser auto-open toggle (equivalent to ROWL_NO_BROWSER)."),
    Flag.withFallbackConfig(optionalBooleanConfig("ROWL_NO_BROWSER")),
  ),
  autoBootstrapProjectFromCwd: Flag.boolean("auto-bootstrap-project-from-cwd").pipe(
    Flag.withDescription(
      "Auto-bootstrap toggle (equivalent to ROWL_AUTO_BOOTSTRAP_PROJECT_FROM_CWD).",
    ),
    Flag.withFallbackConfig(optionalBooleanConfig("ROWL_AUTO_BOOTSTRAP_PROJECT_FROM_CWD")),
  ),
  logWebSocketEvents: Flag.boolean("log-websocket-events").pipe(
    Flag.withDescription("WebSocket event logging toggle (equivalent to ROWL_LOG_WS_EVENTS)."),
    Flag.withAlias("log-ws-events"),
    Flag.withFallbackConfig(optionalBooleanConfig("ROWL_LOG_WS_EVENTS")),
  ),
  host: Flag.string("host").pipe(
    Flag.withDescription("Server host/interface override (forwards to ROWL_HOST)."),
    Flag.withFallbackConfig(optionalStringConfig("ROWL_HOST")),
  ),
  port: Flag.integer("port").pipe(
    Flag.withSchema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 }))),
    Flag.withDescription("Server port override (forwards to ROWL_PORT)."),
    Flag.withFallbackConfig(optionalPortConfig("ROWL_PORT")),
  ),
  devUrl: Flag.string("dev-url").pipe(
    Flag.withSchema(Schema.URLFromString),
    Flag.withDescription("Web dev URL override (forwards to VITE_DEV_SERVER_URL)."),
    Flag.withFallbackConfig(optionalUrlConfig("VITE_DEV_SERVER_URL")),
  ),
  dryRun: Flag.boolean("dry-run").pipe(
    Flag.withDescription("Resolve mode/ports/env and print, but do not spawn turbo."),
    Flag.withDefault(false),
  ),
  turboArgs: Argument.string("turbo-arg").pipe(
    Argument.withDescription("Additional turbo args (pass after `--`)."),
    Argument.variadic(),
  ),
}).pipe(
  Command.withDescription("Run monorepo development modes with deterministic port/env wiring."),
  Command.withHandler((input) => runDevRunnerWithInput(input)),
);

const cliRuntimeLayer = Layer.mergeAll(
  Logger.layer([Logger.consolePretty()]),
  NodeServices.layer,
  NetService.layer,
);

const runtimeProgram = Command.run(devRunnerCli, { version: "0.0.0" }).pipe(
  Effect.scoped,
  Effect.provide(cliRuntimeLayer),
);

if (import.meta.main) {
  NodeRuntime.runMain(runtimeProgram);
}
