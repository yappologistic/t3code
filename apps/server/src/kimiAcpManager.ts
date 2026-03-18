import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";

import * as acp from "@agentclientprotocol/sdk";
import {
  ApprovalRequestId,
  EventId,
  type ProviderApprovalDecision,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderSessionStartInput,
  RuntimeItemId,
  RuntimeRequestId,
  ThreadId,
  TurnId,
  type ProviderTurnStartResult,
} from "@t3tools/contracts";

import {
  createPermissionOutcome,
  extractTextFromContentBlock,
  killChildTree,
  mapPlanEntryStatus,
  mapToolCallStatus,
  mapToolKindToItemType,
  mapToolKindToRequestType,
  permissionDecisionFromOutcome,
  readResumeSessionId,
  summarizeToolContent,
  toMessage,
  type AcpPermissionRequestType,
} from "./provider/acpRuntimeShared.ts";

interface PendingApprovalRequest {
  readonly requestId: ApprovalRequestId;
  readonly toolCallId: string;
  readonly turnId: TurnId | undefined;
  readonly requestType: AcpPermissionRequestType;
  readonly options: ReadonlyArray<acp.PermissionOption>;
  readonly resolve: (response: acp.RequestPermissionResponse) => void;
}

interface ToolSnapshot {
  readonly kind: acp.ToolKind | null;
  readonly title: string;
}

interface KimiSessionContext {
  session: ProviderSession;
  child: ChildProcessWithoutNullStreams;
  connection: acp.ClientSideConnection;
  acpSessionId: string;
  models: acp.SessionModelState | null;
  pendingApprovals: Map<ApprovalRequestId, PendingApprovalRequest>;
  toolSnapshots: Map<string, ToolSnapshot>;
  currentTurnId: TurnId | undefined;
  stopping: boolean;
  lastStderrLine?: string;
  tempConfigDir?: string;
}

export interface KimiAppServerStartSessionInput {
  readonly threadId: ThreadId;
  readonly provider?: "kimi";
  readonly cwd?: string;
  readonly model?: string;
  readonly resumeCursor?: unknown;
  readonly providerOptions?: ProviderSessionStartInput["providerOptions"];
  readonly runtimeMode: ProviderSession["runtimeMode"];
}

export interface KimiThreadTurnSnapshot {
  readonly id: TurnId;
  readonly items: ReadonlyArray<unknown>;
}

export interface KimiThreadSnapshot {
  readonly threadId: ThreadId;
  readonly turns: ReadonlyArray<KimiThreadTurnSnapshot>;
}

export interface KimiAcpManagerEvents {
  event: [event: ProviderRuntimeEvent];
}

export function readAvailableKimiModelIds(
  models: acp.SessionModelState | null | undefined,
): ReadonlyArray<string> {
  return models?.availableModels.map((entry) => entry.modelId) ?? [];
}

export function isKimiModelAvailable(
  models: acp.SessionModelState | null | undefined,
  model: string,
): boolean {
  const availableModelIds = readAvailableKimiModelIds(models);
  return availableModelIds.length === 0 || availableModelIds.includes(model);
}

function mapKimiRuntimeMode(runtimeMode: ProviderSession["runtimeMode"]): ReadonlyArray<string> {
  return runtimeMode === "full-access" ? ["--yolo"] : [];
}

export function buildKimiCliArgs(input: {
  readonly runtimeMode: ProviderSession["runtimeMode"];
  readonly model?: string;
  readonly configFilePath?: string;
}): ReadonlyArray<string> {
  const requestedModel = input.model?.trim();
  return [
    ...(input.configFilePath ? ["--config-file", input.configFilePath] : []),
    ...mapKimiRuntimeMode(input.runtimeMode),
    ...(requestedModel ? ["--model", requestedModel] : []),
    "acp",
  ];
}

const KIMI_CODE_PROVIDER_ID = "cut3-kimi";
const KIMI_CODE_BASE_URL = "https://api.kimi.com/coding/v1";
const KIMI_DEFAULT_MODEL_ID = "kimi-for-coding";
const KIMI_DEFAULT_MAX_CONTEXT_SIZE = 262_144;

function readOptionalKimiApiKey(input: {
  readonly providerOptions?: ProviderSessionStartInput["providerOptions"];
}): string | undefined {
  const apiKey = input.providerOptions?.kimi?.apiKey?.trim();
  return apiKey && apiKey.length > 0 ? apiKey : undefined;
}

function readKimiConfigModelIds(model?: string): ReadonlyArray<string> {
  const requestedModel = model?.trim();
  return Array.from(
    new Set([requestedModel, KIMI_DEFAULT_MODEL_ID].filter((value): value is string => !!value)),
  );
}

export function buildKimiCliEnv(input: {
  readonly apiKey?: string;
  readonly model?: string;
  readonly baseEnv?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const env = { ...(input.baseEnv ?? process.env) };
  const apiKey = input.apiKey?.trim();
  const model = input.model?.trim();

  if (apiKey) {
    env.KIMI_API_KEY = apiKey;
    env.KIMI_BASE_URL = KIMI_CODE_BASE_URL;
  }

  if (model) {
    env.KIMI_MODEL_NAME = model;
  }

  return env;
}

export function buildKimiApiKeyConfig(input: { readonly apiKey: string; readonly model?: string }) {
  const modelIds = readKimiConfigModelIds(input.model);
  const defaultModel = input.model?.trim() || KIMI_DEFAULT_MODEL_ID;

  return {
    default_model: defaultModel,
    providers: {
      [KIMI_CODE_PROVIDER_ID]: {
        type: "kimi",
        base_url: KIMI_CODE_BASE_URL,
        api_key: input.apiKey,
      },
    },
    models: Object.fromEntries(
      modelIds.map((modelId) => [
        modelId,
        {
          provider: KIMI_CODE_PROVIDER_ID,
          model: modelId,
          max_context_size: KIMI_DEFAULT_MAX_CONTEXT_SIZE,
        },
      ]),
    ),
    services: {
      moonshot_search: {
        base_url: `${KIMI_CODE_BASE_URL}/search`,
        api_key: input.apiKey,
      },
      moonshot_fetch: {
        base_url: `${KIMI_CODE_BASE_URL}/fetch`,
        api_key: input.apiKey,
      },
    },
  };
}

function createKimiApiKeyConfigFile(input: { readonly apiKey: string; readonly model?: string }): {
  readonly dirPath: string;
  readonly filePath: string;
} {
  const dirPath = mkdtempSync(join(tmpdir(), "cut3-kimi-"));
  const filePath = join(dirPath, "config.json");
  try {
    chmodSync(dirPath, 0o700);
  } catch {
    // Best-effort only.
  }
  writeFileSync(filePath, `${JSON.stringify(buildKimiApiKeyConfig(input), null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return { dirPath, filePath };
}

function cleanupKimiTempConfig(dirPath?: string): void {
  if (!dirPath) {
    return;
  }
  rmSync(dirPath, { recursive: true, force: true });
}

const KIMI_ACP_INITIALIZE_TIMEOUT_MS = 10_000;
const KIMI_ACP_SESSION_START_TIMEOUT_MS = 10_000;
const KIMI_LOGIN_PROBE_TIMEOUT_MS = 2_000;

function withTimeout<T>(input: {
  readonly label: string;
  readonly timeoutMs: number;
  readonly promise: Promise<T>;
}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${input.label} timed out after ${input.timeoutMs}ms.`));
    }, input.timeoutMs);

    input.promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function isKimiLoginProbeUnauthenticated(input: {
  readonly stdout?: string;
  readonly stderr?: string;
}): boolean {
  const output = `${input.stdout ?? ""}\n${input.stderr ?? ""}`.toLowerCase();
  return (
    output.includes("verification_url") ||
    output.includes("waiting for user authorization") ||
    output.includes("authorization_pending") ||
    output.includes("please visit the following url to finish authorization") ||
    output.includes("llm not set") ||
    output.includes('send "/login" to login') ||
    output.includes("run `kimi login`") ||
    output.includes("not logged in")
  );
}

export function normalizeKimiStartErrorMessage(input: {
  readonly rawMessage: string;
  readonly loginProbeOutput?: {
    readonly stdout?: string;
    readonly stderr?: string;
  };
}): string {
  if (
    /auth_required|not logged in|kimi login|llm not set|send "\/login" to login/i.test(
      input.rawMessage,
    ) ||
    (input.loginProbeOutput && isKimiLoginProbeUnauthenticated(input.loginProbeOutput))
  ) {
    return "Kimi Code CLI requires authentication. Run `kimi login` and try again.";
  }

  return input.rawMessage;
}

function probeKimiLoginState(kimiBinaryPath: string): {
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = spawnSync(kimiBinaryPath, ["login", "--json"], {
    env: process.env,
    encoding: "utf8",
    timeout: KIMI_LOGIN_PROBE_TIMEOUT_MS,
  });

  const spawnError =
    result.error instanceof Error ? `${result.error.name}: ${result.error.message}` : "";

  return {
    stdout: result.stdout ?? "",
    stderr: [result.stderr ?? "", spawnError].filter((value) => value.length > 0).join("\n"),
  };
}

export class KimiAcpManager extends EventEmitter<KimiAcpManagerEvents> {
  private readonly sessions = new Map<ThreadId, KimiSessionContext>();
  private readonly startingSessions = new Map<ThreadId, KimiSessionContext>();

  private emitRuntimeEvent(event: ProviderRuntimeEvent) {
    this.emit("event", event);
  }

  private createEventBase(context: KimiSessionContext) {
    return {
      eventId: EventId.makeUnsafe(randomUUID()),
      provider: "kimi" as const,
      threadId: context.session.threadId,
      createdAt: new Date().toISOString(),
    };
  }

  private updateSession(
    context: KimiSessionContext,
    patch: Partial<ProviderSession>,
  ): ProviderSession {
    context.session = {
      ...context.session,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return context.session;
  }

  private emitSessionStarted(context: KimiSessionContext) {
    const sessionStarted: ProviderRuntimeEvent = {
      ...this.createEventBase(context),
      type: "session.started",
      payload: {
        message: "Connected to Kimi Code CLI ACP server.",
        resume: context.session.resumeCursor,
      },
    };
    const threadStarted: ProviderRuntimeEvent = {
      ...this.createEventBase(context),
      type: "thread.started",
      payload: {
        providerThreadId: context.acpSessionId,
      },
    };
    this.emitRuntimeEvent(sessionStarted);
    this.emitRuntimeEvent(threadStarted);

    if (context.models) {
      this.emitRuntimeEvent({
        ...this.createEventBase(context),
        type: "session.configured",
        payload: {
          config: {
            currentModelId: context.models.currentModelId,
            availableModels: context.models.availableModels,
          },
        },
      });
    }
  }

  private emitSessionExit(
    context: KimiSessionContext,
    input: {
      readonly reason?: string;
      readonly exitKind: "graceful" | "error";
      readonly recoverable?: boolean;
    },
  ) {
    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      type: "session.exited",
      payload: {
        ...(input.reason ? { reason: input.reason } : {}),
        exitKind: input.exitKind,
        recoverable: input.recoverable ?? false,
      },
    });
  }

  private emitRuntimeError(context: KimiSessionContext, message: string, turnId?: TurnId) {
    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      ...(turnId ? { turnId } : {}),
      type: "runtime.error",
      payload: {
        message,
      },
    });
  }

  private resolvePendingApprovalsAsCancelled(context: KimiSessionContext) {
    for (const pending of context.pendingApprovals.values()) {
      pending.resolve({ outcome: { outcome: "cancelled" } });
    }
    context.pendingApprovals.clear();
  }

  private handleSessionUpdate(context: KimiSessionContext, params: acp.SessionNotification) {
    const turnId = context.currentTurnId;
    const createdAt = new Date().toISOString();
    const base = {
      ...this.createEventBase(context),
      ...(turnId ? { turnId } : {}),
      createdAt,
    };

    switch (params.update.sessionUpdate) {
      case "agent_message_chunk": {
        const delta = extractTextFromContentBlock(params.update.content);
        if (!delta || delta.length === 0) {
          return;
        }
        this.emitRuntimeEvent({
          ...base,
          ...(params.update.messageId
            ? { itemId: RuntimeItemId.makeUnsafe(params.update.messageId) }
            : {}),
          type: "content.delta",
          payload: {
            delta,
            streamKind: "assistant_text",
          },
        });
        return;
      }

      case "agent_thought_chunk": {
        const delta = extractTextFromContentBlock(params.update.content);
        if (!delta || delta.length === 0) {
          return;
        }
        this.emitRuntimeEvent({
          ...base,
          ...(params.update.messageId
            ? { itemId: RuntimeItemId.makeUnsafe(params.update.messageId) }
            : {}),
          type: "content.delta",
          payload: {
            delta,
            streamKind: "reasoning_text",
          },
        });
        return;
      }

      case "plan": {
        this.emitRuntimeEvent({
          ...base,
          type: "turn.plan.updated",
          payload: {
            plan: params.update.entries.map((entry) => ({
              step: entry.content,
              status: mapPlanEntryStatus(entry.status),
            })),
          },
        });
        return;
      }

      case "usage_update": {
        this.emitRuntimeEvent({
          ...base,
          type: "thread.token-usage.updated",
          payload: {
            usage: params.update,
          },
        });
        return;
      }

      case "tool_call": {
        context.toolSnapshots.set(params.update.toolCallId, {
          kind: params.update.kind ?? null,
          title: params.update.title,
        });
        this.emitRuntimeEvent({
          ...base,
          itemId: RuntimeItemId.makeUnsafe(params.update.toolCallId),
          type: "item.started",
          payload: {
            itemType: mapToolKindToItemType(params.update.kind),
            title: params.update.title,
            ...(mapToolCallStatus(params.update.status)
              ? { status: mapToolCallStatus(params.update.status) }
              : {}),
            ...(summarizeToolContent(params.update.content)
              ? { detail: summarizeToolContent(params.update.content) }
              : {}),
            data: {
              ...(params.update.locations ? { locations: params.update.locations } : {}),
              ...(params.update.rawInput !== undefined ? { rawInput: params.update.rawInput } : {}),
              ...(params.update.rawOutput !== undefined
                ? { rawOutput: params.update.rawOutput }
                : {}),
            },
          },
        });
        return;
      }

      case "tool_call_update": {
        const previous = context.toolSnapshots.get(params.update.toolCallId);
        const nextSnapshot = {
          kind: params.update.kind ?? previous?.kind ?? null,
          title: params.update.title ?? previous?.title ?? "Tool call",
        } satisfies ToolSnapshot;
        context.toolSnapshots.set(params.update.toolCallId, nextSnapshot);
        const status = params.update.status ?? null;
        const eventType =
          status === "completed" || status === "failed" ? "item.completed" : "item.updated";
        this.emitRuntimeEvent({
          ...base,
          itemId: RuntimeItemId.makeUnsafe(params.update.toolCallId),
          type: eventType,
          payload: {
            itemType: mapToolKindToItemType(nextSnapshot.kind),
            title: nextSnapshot.title,
            ...(mapToolCallStatus(status) ? { status: mapToolCallStatus(status) } : {}),
            ...(summarizeToolContent(params.update.content)
              ? { detail: summarizeToolContent(params.update.content) }
              : {}),
            ...(params.update.content ? { data: { content: params.update.content } } : {}),
          },
        });
        return;
      }

      default:
        return;
    }
  }

  private async requestPermission(
    context: KimiSessionContext,
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    const requestId = ApprovalRequestId.makeUnsafe(randomUUID());
    const requestType = mapToolKindToRequestType(params.toolCall.kind);
    const detail = params.toolCall.title?.trim() ?? "Permission requested";

    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
      requestId: RuntimeRequestId.makeUnsafe(requestId),
      type: "request.opened",
      payload: {
        requestType,
        ...(detail.length > 0 ? { detail } : {}),
      },
    });

    const response = await new Promise<acp.RequestPermissionResponse>((resolve) => {
      context.pendingApprovals.set(requestId, {
        requestId,
        toolCallId: params.toolCall.toolCallId,
        turnId: context.currentTurnId,
        requestType,
        options: params.options,
        resolve,
      });
    });

    const pending = context.pendingApprovals.get(requestId);
    context.pendingApprovals.delete(requestId);
    const resolvedTurnId = pending?.turnId ?? context.currentTurnId;
    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      ...(resolvedTurnId ? { turnId: resolvedTurnId } : {}),
      requestId: RuntimeRequestId.makeUnsafe(requestId),
      type: "request.resolved",
      payload: {
        requestType,
        decision: permissionDecisionFromOutcome(response.outcome, params.options),
      },
    });
    return response;
  }

  private attachProcessListeners(context: KimiSessionContext) {
    context.child.stderr.setEncoding("utf8");
    context.child.stderr.on("data", (chunk: string) => {
      const trimmed = chunk.trim();
      if (trimmed.length > 0) {
        context.lastStderrLine = trimmed.split("\n").at(-1)?.trim() ?? trimmed;
      }
    });

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (!this.isTrackedContext(context)) {
        return;
      }

      this.resolvePendingApprovalsAsCancelled(context);
      this.updateSession(context, {
        status: "closed",
      });

      if (!context.stopping) {
        const reason =
          context.lastStderrLine ??
          (signal ? `Kimi CLI exited from signal ${signal}.` : undefined) ??
          (code !== null ? `Kimi CLI exited with code ${code}.` : "Kimi CLI exited.");
        this.emitSessionExit(context, {
          reason,
          exitKind: code === 0 ? "graceful" : "error",
        });
        if (code !== 0 && context.currentTurnId) {
          this.emitRuntimeError(context, reason, context.currentTurnId);
        }
      }

      this.deleteTrackedSession(context.session.threadId, context);
      cleanupKimiTempConfig(context.tempConfigDir);
    };

    context.child.once("exit", onExit);
    context.connection.closed.catch(() => undefined);
  }

  private requireSession(threadId: ThreadId): KimiSessionContext {
    const context = this.sessions.get(threadId);
    if (!context) {
      throw new Error(`Unknown Kimi session: ${threadId}`);
    }
    if (context.session.status === "closed") {
      throw new Error(`Kimi session is closed: ${threadId}`);
    }
    return context;
  }

  private async setSessionModel(context: KimiSessionContext, model: string) {
    const availableModelIds = readAvailableKimiModelIds(context.models);
    if (availableModelIds.length > 0 && !availableModelIds.includes(model)) {
      throw new Error(
        `Kimi Code CLI does not expose model '${model}' for this account. Available models: ${availableModelIds.join(", ")}.`,
      );
    }

    try {
      await context.connection.unstable_setSessionModel({
        sessionId: context.acpSessionId,
        modelId: model,
      });
      if (context.models) {
        context.models = {
          ...context.models,
          currentModelId: model,
        };
      }
      this.updateSession(context, { model });
    } catch (error) {
      throw new Error(toMessage(error, `Failed to switch Kimi Code model to '${model}'.`), {
        cause: error,
      });
    }
  }

  async startSession(input: KimiAppServerStartSessionInput): Promise<ProviderSession> {
    const resolvedCwd = input.cwd ?? process.cwd();
    const now = new Date().toISOString();
    const previousContext = this.sessions.get(input.threadId);
    const session: ProviderSession = {
      provider: "kimi",
      status: "connecting",
      runtimeMode: input.runtimeMode,
      model: input.model,
      cwd: resolvedCwd,
      threadId: input.threadId,
      createdAt: now,
      updatedAt: now,
    };

    const kimiBinaryPath = input.providerOptions?.kimi?.binaryPath ?? "kimi";
    const kimiApiKey = readOptionalKimiApiKey(input);
    const tempConfig = kimiApiKey
      ? createKimiApiKeyConfigFile({
          apiKey: kimiApiKey,
          ...(input.model !== undefined ? { model: input.model } : {}),
        })
      : undefined;
    const args = buildKimiCliArgs({
      runtimeMode: input.runtimeMode,
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(tempConfig ? { configFilePath: tempConfig.filePath } : {}),
    });
    const env = buildKimiCliEnv({
      ...(kimiApiKey ? { apiKey: kimiApiKey } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
    });

    const child = spawn(kimiBinaryPath, args, {
      cwd: resolvedCwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    const stream = acp.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));
    let context: KimiSessionContext | undefined;

    const client: acp.Client = {
      requestPermission: async (params) => {
        if (!context) {
          return { outcome: { outcome: "cancelled" } };
        }
        return this.requestPermission(context, params);
      },
      sessionUpdate: async (params) => {
        if (!context) {
          return;
        }
        this.handleSessionUpdate(context, params);
      },
    };

    const connection = new acp.ClientSideConnection(() => client, stream);
    context = {
      session,
      child,
      connection,
      acpSessionId: "",
      models: null,
      pendingApprovals: new Map(),
      toolSnapshots: new Map(),
      currentTurnId: undefined,
      stopping: false,
      ...(tempConfig ? { tempConfigDir: tempConfig.dirPath } : {}),
    };
    this.startingSessions.set(input.threadId, context);
    this.attachProcessListeners(context);

    try {
      const initializeResult = await withTimeout({
        label: "Kimi ACP initialize",
        timeoutMs: KIMI_ACP_INITIALIZE_TIMEOUT_MS,
        promise: connection.initialize({
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {},
        }),
      });

      const resumeSessionId = readResumeSessionId(input);
      const resumeSupported =
        initializeResult.agentCapabilities?.sessionCapabilities?.resume !== undefined;

      let sessionResult: acp.NewSessionResponse | acp.ResumeSessionResponse;
      if (resumeSessionId) {
        if (!resumeSupported) {
          throw new Error("Kimi Code CLI ACP server does not advertise session resume support.");
        }

        sessionResult = await withTimeout({
          label: "Kimi ACP resumeSession",
          timeoutMs: KIMI_ACP_SESSION_START_TIMEOUT_MS,
          promise: connection.unstable_resumeSession({
            sessionId: resumeSessionId,
            cwd: resolvedCwd,
            mcpServers: [],
          }),
        });
        context.acpSessionId = resumeSessionId;
      } else {
        const createdSession = await withTimeout({
          label: "Kimi ACP newSession",
          timeoutMs: KIMI_ACP_SESSION_START_TIMEOUT_MS,
          promise: connection.newSession({
            cwd: resolvedCwd,
            mcpServers: [],
          }),
        });
        sessionResult = createdSession;
        context.acpSessionId = createdSession.sessionId;
      }

      context.models = sessionResult.models ?? null;
      this.updateSession(context, {
        status: "ready",
        model: sessionResult.models?.currentModelId ?? session.model,
        resumeCursor: { sessionId: context.acpSessionId },
      });

      this.emitSessionStarted(context);
      this.startingSessions.delete(input.threadId);
      this.sessions.set(input.threadId, context);
      if (previousContext && previousContext !== context) {
        await this.disposeContext(previousContext);
      }
      return { ...context.session };
    } catch (error) {
      const rawMessage = toMessage(error, "Failed to start Kimi Code session.");
      const loginProbeOutput =
        !kimiApiKey &&
        (/timed out/i.test(rawMessage) ||
          /auth_required|not logged in|kimi login|llm not set/i.test(rawMessage))
          ? probeKimiLoginState(kimiBinaryPath)
          : undefined;
      const message = normalizeKimiStartErrorMessage({
        rawMessage,
        ...(loginProbeOutput ? { loginProbeOutput } : {}),
      });
      this.startingSessions.delete(input.threadId);
      this.updateSession(context, {
        status: "error",
        lastError: message,
      });
      this.emitRuntimeError(context, message);
      await this.disposeContext(context);
      throw new Error(message, { cause: error });
    }
  }

  async sendTurn(input: {
    readonly threadId: ThreadId;
    readonly input?: string;
    readonly attachments?: ReadonlyArray<unknown>;
    readonly model?: string;
  }): Promise<ProviderTurnStartResult> {
    const context = this.requireSession(input.threadId);
    const promptText = input.input?.trim();
    if (!promptText) {
      throw new Error("Kimi Code turns require a non-empty text prompt.");
    }
    if ((input.attachments?.length ?? 0) > 0) {
      throw new Error("Kimi Code integration currently supports text prompts only.");
    }
    if (
      context.currentTurnId ||
      context.session.status === "running" ||
      context.session.activeTurnId
    ) {
      throw new Error("Kimi Code already has a turn in progress for this session.");
    }

    const turnId = TurnId.makeUnsafe(randomUUID());
    context.currentTurnId = turnId;
    this.updateSession(context, {
      status: "running",
      activeTurnId: turnId,
    });

    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      turnId,
      type: "turn.started",
      payload: context.session.model ? { model: context.session.model } : {},
    });

    try {
      const result = await context.connection.prompt({
        sessionId: context.acpSessionId,
        prompt: [
          {
            type: "text",
            text: promptText,
          },
        ],
      });

      this.emitRuntimeEvent({
        ...this.createEventBase(context),
        turnId,
        type: "turn.completed",
        payload: {
          state: result.stopReason === "cancelled" ? "interrupted" : "completed",
          stopReason: result.stopReason,
          ...(result.usage ? { usage: result.usage } : {}),
        },
      });

      this.updateSession(context, {
        status: "ready",
        activeTurnId: undefined,
      });

      return {
        threadId: input.threadId,
        turnId,
        resumeCursor: { sessionId: context.acpSessionId },
      };
    } catch (error) {
      const message = toMessage(error, "Kimi Code turn failed.");
      this.emitRuntimeEvent({
        ...this.createEventBase(context),
        turnId,
        type: "turn.completed",
        payload: {
          state: "failed",
          stopReason: null,
          errorMessage: message,
        },
      });
      this.emitRuntimeError(context, message, turnId);
      this.updateSession(context, {
        status: "error",
        activeTurnId: undefined,
        lastError: message,
      });
      throw new Error(message, { cause: error });
    } finally {
      context.currentTurnId = undefined;
    }
  }

  async interruptTurn(threadId: ThreadId, turnId?: TurnId): Promise<void> {
    const context = this.requireSession(threadId);
    if (turnId && context.currentTurnId && turnId !== context.currentTurnId) {
      return;
    }
    this.resolvePendingApprovalsAsCancelled(context);
    await context.connection.cancel({ sessionId: context.acpSessionId });
  }

  async respondToRequest(
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ): Promise<void> {
    const context = this.requireSession(threadId);
    const pending = context.pendingApprovals.get(requestId);
    if (!pending) {
      throw new Error(`Unknown pending Kimi approval request: ${requestId}`);
    }
    pending.resolve(createPermissionOutcome(decision, pending.options));
  }

  async respondToUserInput(): Promise<void> {
    throw new Error("Kimi Code CLI does not expose structured user input requests in CUT3.");
  }

  async stopSession(threadId: ThreadId): Promise<void> {
    const context = this.sessions.get(threadId);
    if (!context) {
      return;
    }

    await this.disposeContext(context);
    this.emitSessionExit(context, {
      reason: "Kimi Code session stopped.",
      exitKind: "graceful",
      recoverable: true,
    });
  }

  private deleteTrackedSession(threadId: ThreadId, context: KimiSessionContext): void {
    if (this.sessions.get(threadId) === context) {
      this.sessions.delete(threadId);
    }
    if (this.startingSessions.get(threadId) === context) {
      this.startingSessions.delete(threadId);
    }
  }

  private isTrackedContext(context: KimiSessionContext): boolean {
    const threadId = context.session.threadId;
    return (
      this.sessions.get(threadId) === context || this.startingSessions.get(threadId) === context
    );
  }

  private async disposeContext(context: KimiSessionContext): Promise<void> {
    context.stopping = true;
    this.resolvePendingApprovalsAsCancelled(context);
    try {
      await context.connection.cancel({ sessionId: context.acpSessionId });
    } catch {
      // Best-effort cancellation only.
    }

    killChildTree(context.child);
    this.updateSession(context, {
      status: "closed",
      activeTurnId: undefined,
    });
    this.deleteTrackedSession(context.session.threadId, context);
    cleanupKimiTempConfig(context.tempConfigDir);
  }

  async listSessions(): Promise<ReadonlyArray<ProviderSession>> {
    return Array.from(this.sessions.values(), (context) => context.session);
  }

  async hasSession(threadId: ThreadId): Promise<boolean> {
    return this.sessions.has(threadId);
  }

  async readThread(threadId: ThreadId): Promise<KimiThreadSnapshot> {
    this.requireSession(threadId);
    throw new Error(
      "Reading historical Kimi thread snapshots is not implemented in this ACP integration yet.",
    );
  }

  async rollbackThread(threadId: ThreadId, _numTurns: number): Promise<KimiThreadSnapshot> {
    this.requireSession(threadId);
    throw new Error("Rolling back Kimi Code threads is not supported by this integration.");
  }

  async stopAll(): Promise<void> {
    const threadIds = [...this.sessions.keys()];
    await Promise.all(threadIds.map((threadId) => this.stopSession(threadId)));
  }
}
