import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  ServerMcpServerAuthStatus,
  ServerMcpServerStatus,
  ServerOpenCodeCredential,
  ServerOpenCodeCredentialAuthType,
  ServerOpenCodeCredentialResult,
  ServerOpenCodeConfigSource,
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
const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_DEV_TIMEOUT_MS = 5_000;
const MODELS_DEV_CACHE_TTL_MS = 30 * 60 * 1_000;
const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001B\[[0-9;?]*[ -/]*[@-~]`, "g");
const DEFAULT_CONFIG_BASENAME = "opencode.json";
const CONFIG_CANDIDATE_FILENAMES = ["opencode.json", "opencode.jsonc"] as const;

type OpenCodeCliSectionEntry = {
  readonly header: string;
  readonly details: ReadonlyArray<string>;
};

type ParsedOpenCodeMcpListEntry = {
  readonly name: string;
  readonly enabled: boolean;
  readonly state: ServerMcpServerStatus["state"];
  readonly authStatus: ServerMcpServerAuthStatus;
  readonly connectionStatus: "connected" | "failed" | "unknown";
  readonly target?: string;
  readonly message?: string;
};

type ParsedOpenCodeMcpAuthEntry = {
  readonly name: string;
  readonly authStatus: ServerMcpServerAuthStatus;
  readonly target?: string;
  readonly message?: string;
};

type ModelsDevModelEntry = {
  readonly limit?: {
    readonly context?: unknown;
  };
};

type ModelsDevProviderEntry = {
  readonly models?: Record<string, ModelsDevModelEntry>;
};

type ModelsDevCatalog = Record<string, ModelsDevProviderEntry>;

const modelsDevCatalogCache: {
  expiresAt: number;
  value: ModelsDevCatalog | null;
  pending: Promise<ModelsDevCatalog | null> | null;
} = {
  expiresAt: 0,
  value: null,
  pending: null,
};

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, "");
}

function expandHomePath(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function resolveConfigPathCandidate(rawPath: string, cwd: string): string {
  const expanded = expandHomePath(rawPath.trim());
  return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.stat(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveFirstExistingPath(
  candidates: ReadonlyArray<string>,
): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function resolveNearestProjectConfigPath(cwd: string): Promise<{
  readonly path: string;
  readonly exists: boolean;
}> {
  let currentDir = path.resolve(cwd);

  while (true) {
    const existingPath = await resolveFirstExistingPath(
      CONFIG_CANDIDATE_FILENAMES.map((filename) => path.join(currentDir, filename)),
    );
    if (existingPath) {
      return { path: existingPath, exists: true };
    }

    if (await pathExists(path.join(currentDir, ".git"))) {
      return { path: path.join(currentDir, DEFAULT_CONFIG_BASENAME), exists: false };
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return { path: path.join(currentDir, DEFAULT_CONFIG_BASENAME), exists: false };
    }
    currentDir = parentDir;
  }
}

async function resolveNearestProjectDirectoryPath(cwd: string): Promise<{
  readonly path: string;
  readonly exists: boolean;
}> {
  let currentDir = path.resolve(cwd);

  while (true) {
    const candidate = path.join(currentDir, ".opencode");
    if (await pathExists(candidate)) {
      return { path: candidate, exists: true };
    }

    if (await pathExists(path.join(currentDir, ".git"))) {
      return { path: candidate, exists: false };
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return { path: candidate, exists: false };
    }
    currentDir = parentDir;
  }
}

async function resolveOpenCodeConfigSources(cwd: string): Promise<ServerOpenCodeConfigSource[]> {
  const checkedCwd = path.resolve(cwd);
  const globalConfigDir = path.join(os.homedir(), ".config", "opencode");
  const globalConfigPath =
    (await resolveFirstExistingPath(
      CONFIG_CANDIDATE_FILENAMES.map((filename) => path.join(globalConfigDir, filename)),
    )) ?? path.join(globalConfigDir, DEFAULT_CONFIG_BASENAME);
  const projectConfigPath = await resolveNearestProjectConfigPath(checkedCwd);
  const projectDirectoryPath = await resolveNearestProjectDirectoryPath(checkedCwd);
  const sources: ServerOpenCodeConfigSource[] = [
    {
      kind: "global-config",
      path: globalConfigPath,
      exists: await pathExists(globalConfigPath),
    },
    {
      kind: "project-config",
      path: projectConfigPath.path,
      exists: projectConfigPath.exists,
    },
    {
      kind: "global-directory",
      path: globalConfigDir,
      exists: await pathExists(globalConfigDir),
    },
    {
      kind: "project-directory",
      path: projectDirectoryPath.path,
      exists: projectDirectoryPath.exists,
    },
  ];

  const customConfig = process.env.OPENCODE_CONFIG?.trim();
  if (customConfig) {
    const candidate = resolveConfigPathCandidate(customConfig, checkedCwd);
    sources.splice(1, 0, {
      kind: "custom-config",
      path: candidate,
      exists: await pathExists(candidate),
    });
  }

  const customConfigDir = process.env.OPENCODE_CONFIG_DIR?.trim();
  if (customConfigDir) {
    const candidate = resolveConfigPathCandidate(customConfigDir, checkedCwd);
    sources.splice(sources.length - 1, 0, {
      kind: "custom-directory",
      path: candidate,
      exists: await pathExists(candidate),
    });
  }

  return sources;
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

const OPENROUTER_PROVIDER_ID_NORMALIZATIONS: Record<string, string> = {
  zai: "z-ai",
};

function normalizeOpenRouterProviderId(providerId: string): string {
  return OPENROUTER_PROVIDER_ID_NORMALIZATIONS[providerId] ?? providerId;
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

    const rawProviderId = match[1]?.trim();
    const modelId = match[2]?.trim();
    if (!rawProviderId || !modelId) {
      continue;
    }

    const providerId = normalizeOpenRouterProviderId(rawProviderId);
    const slug = `${providerId}/${modelId}`;
    if (seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    models.push({ slug, providerId, modelId });
  }

  return models;
}

function parseOpenCodeCliSectionEntries(output: string): OpenCodeCliSectionEntry[] {
  const entries: OpenCodeCliSectionEntry[] = [];
  let currentEntry: { header: string; details: string[] } | null = null;

  for (const rawLine of stripAnsi(output).split(/\r?\n/g)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("┌") || trimmed.startsWith("└") || trimmed === "│") {
      continue;
    }

    if (trimmed.startsWith("●")) {
      if (currentEntry) {
        entries.push(currentEntry);
      }
      currentEntry = { header: trimmed, details: [] };
      continue;
    }

    if (!currentEntry) {
      continue;
    }

    const detail = trimmed.replace(/^│\s*/, "").trim();
    if (!detail) {
      continue;
    }
    currentEntry.details.push(detail);
  }

  if (currentEntry) {
    entries.push(currentEntry);
  }

  return entries;
}

function extractOpenCodeCliEntryDetails(input: {
  readonly details: ReadonlyArray<string>;
  readonly connectionStatus: "connected" | "failed" | "unknown";
  readonly preferSingleDetailAsTarget?: boolean;
}): {
  readonly target?: string;
  readonly message?: string;
} {
  const details = input.details
    .map((detail) => detail.trim())
    .filter((detail) => detail.length > 0);
  if (details.length === 0) {
    return {};
  }

  if (details.length === 1) {
    if (input.connectionStatus === "connected" || input.preferSingleDetailAsTarget === true) {
      const target = details[0];
      return target ? { target } : {};
    }
    const message = details[0];
    return message ? { message } : {};
  }

  const message = details.slice(0, -1).join(" ");
  const target = details[details.length - 1];
  return {
    ...(message ? { message } : {}),
    ...(target ? { target } : {}),
  };
}

export function parseOpenCodeMcpListOutput(output: string): ParsedOpenCodeMcpListEntry[] {
  const entries: ParsedOpenCodeMcpListEntry[] = [];

  for (const entry of parseOpenCodeCliSectionEntries(output)) {
    const match = entry.header.match(
      /^●\s+[○✓⚠✗]\s+(.+?)\s+(connected|disabled|not initialized|needs authentication|needs client registration|failed)$/i,
    );
    if (!match) {
      continue;
    }

    const name = match[1]?.trim();
    const statusLabel = match[2]?.trim().toLowerCase();
    if (!name || !statusLabel) {
      continue;
    }

    let enabled = true;
    let state: ServerMcpServerStatus["state"] = "enabled";
    let authStatus: ServerMcpServerAuthStatus = "unsupported";
    let connectionStatus: ParsedOpenCodeMcpListEntry["connectionStatus"] = "unknown";
    let fallbackMessage: string | undefined;
    let preferSingleDetailAsTarget = true;

    if (statusLabel === "connected") {
      connectionStatus = "connected";
    } else if (statusLabel === "failed") {
      connectionStatus = "failed";
      preferSingleDetailAsTarget = false;
    } else if (statusLabel === "disabled" || statusLabel === "not initialized") {
      enabled = false;
      state = "disabled";
      authStatus = "unknown";
      fallbackMessage =
        statusLabel === "not initialized" ? "Server not initialized yet." : undefined;
    } else if (statusLabel === "needs authentication") {
      authStatus = "not_logged_in";
      fallbackMessage = "Needs authentication.";
    } else if (statusLabel === "needs client registration") {
      connectionStatus = "failed";
      authStatus = "unknown";
      preferSingleDetailAsTarget = false;
      fallbackMessage = "Needs client registration.";
    }

    const details = extractOpenCodeCliEntryDetails({
      details: entry.details,
      connectionStatus,
      preferSingleDetailAsTarget,
    });
    const resolvedMessage = details.message ?? fallbackMessage;
    entries.push({
      name,
      enabled,
      state,
      authStatus,
      connectionStatus,
      ...(details.target ? { target: details.target } : {}),
      ...(resolvedMessage ? { message: resolvedMessage } : {}),
    });
  }

  return entries;
}

export function parseOpenCodeMcpAuthListOutput(output: string): ParsedOpenCodeMcpAuthEntry[] {
  const entries: ParsedOpenCodeMcpAuthEntry[] = [];

  for (const entry of parseOpenCodeCliSectionEntries(output)) {
    const match = entry.header.match(/^●\s+[✓✗]\s+(.+?)\s+(authenticated|not authenticated)$/i);
    if (!match) {
      continue;
    }

    const name = match[1]?.trim();
    const authState = match[2]?.trim().toLowerCase();
    if (!name || !authState) {
      continue;
    }

    const details = extractOpenCodeCliEntryDetails({
      details: entry.details,
      connectionStatus: "unknown",
      preferSingleDetailAsTarget: true,
    });
    entries.push({
      name,
      authStatus: authState === "authenticated" ? "o_auth" : "not_logged_in",
      ...(details.target ? { target: details.target } : {}),
      ...(details.message ? { message: details.message } : {}),
    });
  }

  return entries;
}

export function mergeOpenCodeMcpServerStatuses(input: {
  readonly runtimeServers: ReadonlyArray<ParsedOpenCodeMcpListEntry>;
  readonly authServers: ReadonlyArray<ParsedOpenCodeMcpAuthEntry>;
}): ServerMcpServerStatus[] {
  const merged = new Map<string, ServerMcpServerStatus>();

  for (const runtimeServer of input.runtimeServers) {
    merged.set(runtimeServer.name, {
      name: runtimeServer.name,
      enabled: runtimeServer.enabled,
      state: runtimeServer.state,
      authStatus: runtimeServer.authStatus,
      toolCount: 0,
      resourceCount: 0,
      resourceTemplateCount: 0,
      connectionStatus: runtimeServer.connectionStatus,
      ...(runtimeServer.target ? { target: runtimeServer.target } : {}),
      ...(runtimeServer.message ? { message: runtimeServer.message } : {}),
    });
  }

  for (const authServer of input.authServers) {
    const existing = merged.get(authServer.name);
    if (existing) {
      merged.set(authServer.name, {
        ...existing,
        authStatus: authServer.authStatus,
        ...(!existing.target && authServer.target ? { target: authServer.target } : {}),
      });
      continue;
    }

    merged.set(authServer.name, {
      name: authServer.name,
      enabled: true,
      state: "enabled",
      authStatus: authServer.authStatus,
      toolCount: 0,
      resourceCount: 0,
      resourceTemplateCount: 0,
      connectionStatus: "unknown",
      ...(authServer.target ? { target: authServer.target } : {}),
      ...(authServer.message ? { message: authServer.message } : {}),
    });
  }

  return [...merged.values()].toSorted((left, right) => left.name.localeCompare(right.name));
}

function readModelsDevContextWindowTokens(
  catalog: ModelsDevCatalog | null | undefined,
  model: Pick<ServerOpenCodeModel, "providerId" | "modelId">,
): number | null {
  if (!catalog) {
    return null;
  }

  const providerEntry = catalog[model.providerId];
  const models = providerEntry?.models;
  if (!models) {
    return null;
  }

  const directEntry = models[model.modelId];
  const directContext = directEntry?.limit?.context;
  if (typeof directContext === "number" && Number.isFinite(directContext) && directContext >= 0) {
    return directContext;
  }

  const normalizedModelId = model.modelId.toLowerCase();
  for (const [candidateId, entry] of Object.entries(models)) {
    if (candidateId.toLowerCase() !== normalizedModelId) {
      continue;
    }
    const context = entry?.limit?.context;
    if (typeof context === "number" && Number.isFinite(context) && context >= 0) {
      return context;
    }
  }

  return null;
}

export function applyModelsDevContextWindows(
  models: ReadonlyArray<ServerOpenCodeModel>,
  catalog: ModelsDevCatalog | null | undefined,
): ServerOpenCodeModel[] {
  return models.map((model) => {
    const contextWindowTokens = readModelsDevContextWindowTokens(catalog, model);
    return contextWindowTokens === null ? model : { ...model, contextWindowTokens };
  });
}

async function loadModelsDevCatalog(): Promise<ModelsDevCatalog | null> {
  const now = Date.now();
  if (modelsDevCatalogCache.value && modelsDevCatalogCache.expiresAt > now) {
    return modelsDevCatalogCache.value;
  }
  if (modelsDevCatalogCache.pending) {
    return modelsDevCatalogCache.pending;
  }

  modelsDevCatalogCache.pending = fetch(MODELS_DEV_API_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(MODELS_DEV_TIMEOUT_MS),
  })
    .then(async (response) => {
      if (!response.ok) {
        return null;
      }
      const payload = await response.json();
      if (!payload || typeof payload !== "object") {
        return null;
      }

      modelsDevCatalogCache.value = payload as ModelsDevCatalog;
      modelsDevCatalogCache.expiresAt = Date.now() + MODELS_DEV_CACHE_TTL_MS;
      return modelsDevCatalogCache.value;
    })
    .catch(() => null)
    .finally(() => {
      modelsDevCatalogCache.pending = null;
    });

  return modelsDevCatalogCache.pending;
}

function unavailableState(input: {
  readonly fetchedAt: string;
  readonly checkedCwd: string;
  readonly binaryPath: string;
  readonly configSources: ReadonlyArray<ServerOpenCodeConfigSource>;
  readonly message: string;
}): ServerOpenCodeState {
  return {
    status: "unavailable",
    fetchedAt: input.fetchedAt,
    checkedCwd: input.checkedCwd,
    binaryPath: input.binaryPath,
    credentials: [],
    models: [],
    mcpSupported: false,
    mcpServers: [],
    configSources: [...input.configSources],
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
  const configSources = await resolveOpenCodeConfigSources(checkedCwd);

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
      configSources,
      message: availabilityMessage(binaryPath, error),
    });
  }

  if (versionResult.timedOut) {
    return unavailableState({
      fetchedAt,
      checkedCwd,
      binaryPath,
      configSources,
      message: "OpenCode CLI is installed but failed to run. Timed out while running command.",
    });
  }

  if (versionResult.code !== 0) {
    return unavailableState({
      fetchedAt,
      checkedCwd,
      binaryPath,
      configSources,
      message: detailFromResult(versionResult)
        ? `OpenCode CLI is installed but failed to run. ${detailFromResult(versionResult)}`
        : "OpenCode CLI is installed but failed to run.",
    });
  }

  const [authProbe, modelsProbe, mcpListProbe, mcpAuthProbe, modelsDevCatalog] = await Promise.all([
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
    runCliCommand({
      command: binaryPath,
      args: ["mcp", "list"],
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
      args: ["mcp", "auth", "list"],
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
    loadModelsDevCatalog(),
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
  const mcpListResult = handleCommandResult({
    label: "OpenCode MCP server list",
    binaryPath,
    result: mcpListProbe,
    parse: parseOpenCodeMcpListOutput,
  });
  const mcpAuthResult = handleCommandResult({
    label: "OpenCode MCP OAuth status",
    binaryPath,
    result: mcpAuthProbe,
    parse: parseOpenCodeMcpAuthListOutput,
  });
  const mcpSupported = mcpListResult.message === undefined;

  const messages = [
    authResult.message,
    modelsResult.message,
    mcpListResult.message,
    mcpAuthResult.message,
  ].filter(
    (message): message is string => typeof message === "string" && message.trim().length > 0,
  );

  return {
    status: "available",
    fetchedAt,
    checkedCwd,
    binaryPath,
    credentials: [...authResult.items],
    models: applyModelsDevContextWindows([...modelsResult.items], modelsDevCatalog),
    mcpSupported,
    mcpServers: mcpSupported
      ? mergeOpenCodeMcpServerStatuses({
          runtimeServers: [...mcpListResult.items],
          authServers: [...mcpAuthResult.items],
        })
      : [],
    configSources,
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
    message: `OpenCode credential setup is interactive in current CLI builds. Run \`${binaryPath} auth login --provider ${provider}\` in a terminal and enter the credential there.`,
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
