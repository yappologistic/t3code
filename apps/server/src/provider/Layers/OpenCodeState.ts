import type {
  ServerOpenCodeCredential,
  ServerOpenCodeCredentialAuthType,
  ServerOpenCodeCredentialResult,
  ServerOpenCodeModel,
  ServerOpenCodeState,
  ServerOpenCodeStateInput,
  ServerOpenCodeAddCredentialInput,
  ServerOpenCodeRemoveCredentialInput,
} from "@t3tools/contracts";
import { Effect, Layer } from "effect";

import { type ProcessRunResult, runProcess } from "../../processRunner";
import { OpenCodeState } from "../Services/OpenCodeState";

const DEFAULT_BINARY_PATH = "opencode";
const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;
const REFRESH_MODELS_TIMEOUT_MS = 20_000;
const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001B\[[0-9;?]*[ -/]*[@-~]`, "g");

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, "");
}

function nonEmptyTrimmed(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function detailFromResult(
  result: Pick<ProcessRunResult, "stdout" | "stderr" | "code" | "timedOut">,
): string | undefined {
  if (result.timedOut) {
    return "Timed out while running command.";
  }
  const stderr = nonEmptyTrimmed(result.stderr);
  if (stderr) return stderr;
  const stdout = nonEmptyTrimmed(result.stdout);
  if (stdout) return stdout;
  if (result.code !== null && result.code !== 0) {
    return `Command exited with code ${result.code}.`;
  }
  return undefined;
}

function isMissingCommandError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const lower = error.message.toLowerCase();
  return (
    lower.includes("command not found") ||
    lower.includes("enoent") ||
    lower.includes("notfound") ||
    lower.includes("not found")
  );
}

async function runCliCommand(input: {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly timeoutMs: number;
}): Promise<ProcessRunResult> {
  return runProcess(input.command, input.args, {
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    allowNonZeroExit: true,
    maxBufferBytes: 4 * 1024 * 1024,
    outputMode: "truncate",
  });
}

export function parseOpenCodeAuthListOutput(output: string): ServerOpenCodeCredential[] {
  const credentials: ServerOpenCodeCredential[] = [];
  const seen = new Set<string>();

  for (const rawLine of stripAnsi(output).split(/\r?\n/g)) {
    const trimmed = rawLine.trim();
    if (!trimmed.startsWith("●")) {
      continue;
    }

    const typedMatch = trimmed.match(/^●\s+(.+?)\s+(api|oauth|wellknown)\s*$/i);
    if (typedMatch) {
      const name = typedMatch[1]?.trim();
      const authType = typedMatch[2]?.trim().toLowerCase() as ServerOpenCodeCredentialAuthType;
      if (!name || seen.has(`${name}\u0000${authType}`)) {
        continue;
      }
      seen.add(`${name}\u0000${authType}`);
      credentials.push({ name, authType });
      continue;
    }

    const genericMatch = trimmed.match(/^●\s+(.+?)\s*$/);
    const name = genericMatch?.[1]?.trim();
    if (!name || seen.has(`${name}\u0000unknown`)) {
      continue;
    }
    seen.add(`${name}\u0000unknown`);
    credentials.push({ name, authType: "unknown" });
  }

  return credentials;
}

export function parseOpenCodeModelsOutput(output: string): ServerOpenCodeModel[] {
  const models: ServerOpenCodeModel[] = [];
  const seen = new Set<string>();

  for (const rawLine of stripAnsi(output).split(/\r?\n/g)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed === "Models cache refreshed") {
      continue;
    }

    const match = trimmed.match(/^([^\s/]+)\/([^\s]+)$/);
    if (!match) {
      continue;
    }

    const providerId = match[1]?.trim();
    const modelId = match[2]?.trim();
    if (!providerId || !modelId) {
      continue;
    }

    const slug = `${providerId}/${modelId}`;
    if (seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    models.push({ slug, providerId, modelId });
  }

  return models;
}

function unavailableState(input: {
  readonly fetchedAt: string;
  readonly checkedCwd: string;
  readonly binaryPath: string;
  readonly message: string;
}): ServerOpenCodeState {
  return {
    status: "unavailable",
    fetchedAt: input.fetchedAt,
    checkedCwd: input.checkedCwd,
    binaryPath: input.binaryPath,
    credentials: [],
    models: [],
    message: input.message,
  } satisfies ServerOpenCodeState;
}

function availabilityMessage(binaryPath: string, error: unknown): string {
  if (isMissingCommandError(error)) {
    return `OpenCode CLI (${binaryPath}) is not installed or not on PATH.`;
  }
  return error instanceof Error && error.message.trim().length > 0
    ? `Failed to execute OpenCode CLI: ${error.message.trim()}`
    : "Failed to execute OpenCode CLI.";
}

function handleCommandResult<T>(input: {
  readonly label: string;
  readonly binaryPath: string;
  readonly result: ProcessRunResult;
  readonly parse: (stdout: string) => ReadonlyArray<T>;
}): {
  readonly items: ReadonlyArray<T>;
  readonly message?: string;
} {
  if (input.result.timedOut) {
    return {
      items: [],
      message: `${input.label} failed. Timed out while running command.`,
    };
  }

  if (input.result.code !== 0) {
    const detail = detailFromResult(input.result);
    return {
      items: [],
      message: detail ? `${input.label} failed. ${detail}` : `${input.label} failed.`,
    };
  }

  try {
    return { items: input.parse(input.result.stdout) };
  } catch (error) {
    return {
      items: [],
      message: `${input.label} failed. ${availabilityMessage(input.binaryPath, error)}`,
    };
  }
}

async function readOpenCodeState(
  rawInput?: ServerOpenCodeStateInput,
): Promise<ServerOpenCodeState> {
  const fetchedAt = new Date().toISOString();
  const binaryPath = rawInput?.binaryPath?.trim() || DEFAULT_BINARY_PATH;
  const checkedCwd = rawInput?.cwd?.trim() || process.cwd();
  const refreshModels = rawInput?.refreshModels === true;

  let versionResult: ProcessRunResult;
  try {
    versionResult = await runCliCommand({
      command: binaryPath,
      args: ["--version"],
      cwd: checkedCwd,
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
    });
  } catch (error) {
    return unavailableState({
      fetchedAt,
      checkedCwd,
      binaryPath,
      message: availabilityMessage(binaryPath, error),
    });
  }

  if (versionResult.timedOut) {
    return unavailableState({
      fetchedAt,
      checkedCwd,
      binaryPath,
      message: "OpenCode CLI is installed but failed to run. Timed out while running command.",
    });
  }

  if (versionResult.code !== 0) {
    return unavailableState({
      fetchedAt,
      checkedCwd,
      binaryPath,
      message: detailFromResult(versionResult)
        ? `OpenCode CLI is installed but failed to run. ${detailFromResult(versionResult)}`
        : "OpenCode CLI is installed but failed to run.",
    });
  }

  const [authProbe, modelsProbe] = await Promise.all([
    runCliCommand({
      command: binaryPath,
      args: ["auth", "list"],
      cwd: checkedCwd,
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
    }).catch(
      (error) =>
        ({
          stdout: "",
          stderr: availabilityMessage(binaryPath, error),
          code: 1,
          signal: null,
          timedOut: false,
        }) satisfies ProcessRunResult,
    ),
    runCliCommand({
      command: binaryPath,
      args: refreshModels ? ["models", "--refresh"] : ["models"],
      cwd: checkedCwd,
      timeoutMs: refreshModels ? REFRESH_MODELS_TIMEOUT_MS : DEFAULT_COMMAND_TIMEOUT_MS,
    }).catch(
      (error) =>
        ({
          stdout: "",
          stderr: availabilityMessage(binaryPath, error),
          code: 1,
          signal: null,
          timedOut: false,
        }) satisfies ProcessRunResult,
    ),
  ]);

  const authResult = handleCommandResult({
    label: "OpenCode credential list",
    binaryPath,
    result: authProbe,
    parse: parseOpenCodeAuthListOutput,
  });
  const modelsResult = handleCommandResult({
    label: refreshModels ? "OpenCode model refresh" : "OpenCode model list",
    binaryPath,
    result: modelsProbe,
    parse: parseOpenCodeModelsOutput,
  });

  const messages = [authResult.message, modelsResult.message].filter(
    (message): message is string => typeof message === "string" && message.trim().length > 0,
  );

  return {
    status: "available",
    fetchedAt,
    checkedCwd,
    binaryPath,
    credentials: [...authResult.items],
    models: [...modelsResult.items],
    ...(messages.length > 0 ? { message: messages.join(" ") } : {}),
  } satisfies ServerOpenCodeState;
}

async function addOpenCodeCredential(
  rawInput: ServerOpenCodeAddCredentialInput,
): Promise<ServerOpenCodeCredentialResult> {
  const binaryPath = rawInput.binaryPath?.trim() || DEFAULT_BINARY_PATH;
  const provider = rawInput.provider.trim();

  return {
    success: false,
    message: `OpenCode credential setup is interactive in current CLI builds. Run \`${binaryPath} auth login -p ${provider}\` in a terminal and enter the credential there.`,
  };
}

async function removeOpenCodeCredential(
  rawInput: ServerOpenCodeRemoveCredentialInput,
): Promise<ServerOpenCodeCredentialResult> {
  const binaryPath = rawInput.binaryPath?.trim() || DEFAULT_BINARY_PATH;
  const provider = rawInput.provider.trim();

  return {
    success: false,
    message: `OpenCode credential removal is interactive in current CLI builds. Run \`${binaryPath} auth logout\` in a terminal and choose ${provider}.`,
  };
}

export const OpenCodeStateLive = Layer.succeed(OpenCodeState, {
  getState: (rawInput) => Effect.promise(() => readOpenCodeState(rawInput)),
  addCredential: (input) => Effect.promise(() => addOpenCodeCredential(input)),
  removeCredential: (input) => Effect.promise(() => removeOpenCodeCredential(input)),
});
