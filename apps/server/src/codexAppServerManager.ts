import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import readline from "node:readline";

import {
  ApprovalRequestId,
  EventId,
  OPENROUTER_FREE_ROUTER_MODEL,
  ProviderItemId,
  ProviderRequestKind,
  type ProviderUserInputAnswers,
  ThreadId,
  TurnId,
  type ProviderApprovalDecision,
  type ProviderEvent,
  type ProviderSession,
  type ProviderSessionStartInput,
  type ProviderTurnStartResult,
  RuntimeMode,
  ProviderInteractionMode,
} from "@t3tools/contracts";
import { isCodexOpenRouterModel, normalizeModelSlug } from "@t3tools/shared/model";
import { Effect, ServiceMap } from "effect";

import {
  formatCodexCliUpgradeMessage,
  isCodexCliVersionSupported,
  parseCodexCliVersion,
} from "./provider/codexCliVersion";

type PendingRequestKey = string;

interface PendingRequest {
  method: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface PendingApprovalRequest {
  requestId: ApprovalRequestId;
  jsonRpcId: string | number;
  method:
    | "item/commandExecution/requestApproval"
    | "item/fileChange/requestApproval"
    | "item/fileRead/requestApproval";
  requestKind: ProviderRequestKind;
  threadId: ThreadId;
  turnId?: TurnId;
  itemId?: ProviderItemId;
}

interface PendingUserInputRequest {
  requestId: ApprovalRequestId;
  jsonRpcId: string | number;
  threadId: ThreadId;
  turnId?: TurnId;
  itemId?: ProviderItemId;
}

interface CodexUserInputAnswer {
  answers: string[];
}

type CodexTurnInputItem =
  | { type: "text"; text: string; text_elements: [] }
  | { type: "image"; url: string };

interface PendingOpenRouterTurnRetry {
  providerThreadId: string;
  input: ReadonlyArray<CodexTurnInputItem>;
  model: string;
  currentTurnId?: TurnId;
  fallbackAttempted: boolean;
  retryReason?: string;
}

interface CodexSessionContext {
  session: ProviderSession;
  account: CodexAccountSnapshot;
  child: ChildProcessWithoutNullStreams;
  output: readline.Interface;
  pending: Map<PendingRequestKey, PendingRequest>;
  pendingApprovals: Map<ApprovalRequestId, PendingApprovalRequest>;
  pendingUserInputs: Map<ApprovalRequestId, PendingUserInputRequest>;
  pendingOpenRouterTurnRetry?: PendingOpenRouterTurnRetry;
  nextRequestId: number;
  lastProcessError?: string;
  stopping: boolean;
}

interface JsonRpcError {
  code?: number;
  message?: string;
}

interface JsonRpcRequest {
  id: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

type CodexPlanType =
  | "free"
  | "go"
  | "plus"
  | "pro"
  | "team"
  | "business"
  | "enterprise"
  | "edu"
  | "unknown";

interface CodexAccountSnapshot {
  readonly type: "apiKey" | "chatgpt" | "unknown";
  readonly planType: CodexPlanType | null;
  readonly sparkEnabled: boolean;
}

export interface CodexAppServerSendTurnInput {
  readonly threadId: ThreadId;
  readonly input?: string;
  readonly attachments?: ReadonlyArray<{ type: "image"; url: string }>;
  readonly model?: string;
  readonly serviceTier?: string | null;
  readonly effort?: string;
  readonly interactionMode?: ProviderInteractionMode;
}

export interface CodexAppServerStartSessionInput {
  readonly threadId: ThreadId;
  readonly provider?: "codex";
  readonly cwd?: string;
  readonly model?: string;
  readonly serviceTier?: string;
  readonly resumeCursor?: unknown;
  readonly providerOptions?: ProviderSessionStartInput["providerOptions"];
  readonly runtimeMode: RuntimeMode;
}

export interface CodexThreadTurnSnapshot {
  id: TurnId;
  items: unknown[];
}

export interface CodexThreadSnapshot {
  threadId: string;
  turns: CodexThreadTurnSnapshot[];
}

const CODEX_VERSION_CHECK_TIMEOUT_MS = 4_000;

const ANSI_ESCAPE_CHAR = String.fromCharCode(27);
const ANSI_ESCAPE_REGEX = new RegExp(`${ANSI_ESCAPE_CHAR}\\[[0-9;]*m`, "g");
const CODEX_STDERR_LOG_REGEX =
  /^\d{4}-\d{2}-\d{2}T\S+\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+\S+:\s+(.*)$/;
const BENIGN_ERROR_LOG_SNIPPETS = [
  "state db missing rollout path for thread",
  "state db record_discrepancy: find_thread_path_by_id_str_in_subdir, falling_back",
];
const RECOVERABLE_THREAD_RESUME_ERROR_SNIPPETS = [
  "not found",
  "missing thread",
  "no such thread",
  "unknown thread",
  "does not exist",
];
const CODEX_DEFAULT_MODEL = "gpt-5.3-codex";
const CODEX_SPARK_MODEL = "gpt-5.3-codex-spark";
const CODEX_SPARK_DISABLED_PLAN_TYPES = new Set<CodexPlanType>(["free", "go", "plus"]);
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_ENV_KEY = "OPENROUTER_API_KEY";
const OPENROUTER_NO_ELIGIBLE_ENDPOINT_SNIPPETS = [
  "no endpoints available",
  "no endpoints found",
  "guardrails",
  "settings/privacy",
  "data policy",
  "zero data retention",
  "zdr",
  "require parameters",
  "require_parameters",
  "allow_fallbacks",
  "allow fallbacks",
] as const;

const OPENROUTER_RESPONSES_VALIDATION_SNIPPETS = [
  "invalid responses api request",
  "invalid_prompt",
] as const;

const OPENROUTER_MODEL_UNAVAILABLE_SNIPPETS = [
  "model not found",
  "404 not found",
  "unavailable",
  "bad gateway",
  "service unavailable",
  "upstream error",
  "upstream failure",
  "temporarily overloaded",
  "overloaded",
] as const;

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function readCodexAccountSnapshot(response: unknown): CodexAccountSnapshot {
  const record = asObject(response);
  const account = asObject(record?.account) ?? record;
  const accountType = asString(account?.type);

  if (accountType === "apiKey") {
    return {
      type: "apiKey",
      planType: null,
      sparkEnabled: true,
    };
  }

  if (accountType === "chatgpt") {
    const planType = (account?.planType as CodexPlanType | null) ?? "unknown";
    return {
      type: "chatgpt",
      planType,
      sparkEnabled: !CODEX_SPARK_DISABLED_PLAN_TYPES.has(planType),
    };
  }

  return {
    type: "unknown",
    planType: null,
    sparkEnabled: true,
  };
}

export const CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS = `<collaboration_mode># Plan Mode (Conversational)

You work in 3 phases, and you should *chat your way* to a great plan before finalizing it. A great plan is very detailed-intent- and implementation-wise-so that it can be handed to another engineer or agent to be implemented right away. It must be **decision complete**, where the implementer does not need to make any decisions.

## Mode rules (strict)

You are in **Plan Mode** until a developer message explicitly ends it.

Plan Mode is not changed by user intent, tone, or imperative language. If a user asks for execution while still in Plan Mode, treat it as a request to **plan the execution**, not perform it.

## Plan Mode vs update_plan tool

Plan Mode is a collaboration mode that can involve requesting user input and eventually issuing a \`<proposed_plan>\` block.

Separately, \`update_plan\` is a checklist/progress/TODOs tool; it does not enter or exit Plan Mode. Do not confuse it with Plan mode or try to use it while in Plan mode. If you try to use \`update_plan\` in Plan mode, it will return an error.

## Execution vs. mutation in Plan Mode

You may explore and execute **non-mutating** actions that improve the plan. You must not perform **mutating** actions.

### Allowed (non-mutating, plan-improving)

Actions that gather truth, reduce ambiguity, or validate feasibility without changing repo-tracked state. Examples:

* Reading or searching files, configs, schemas, types, manifests, and docs
* Static analysis, inspection, and repo exploration
* Dry-run style commands when they do not edit repo-tracked files
* Tests, builds, or checks that may write to caches or build artifacts (for example, \`target/\`, \`.cache/\`, or snapshots) so long as they do not edit repo-tracked files

### Not allowed (mutating, plan-executing)

Actions that implement the plan or change repo-tracked state. Examples:

* Editing or writing files
* Running formatters or linters that rewrite files
* Applying patches, migrations, or codegen that updates repo-tracked files
* Side-effectful commands whose purpose is to carry out the plan rather than refine it

When in doubt: if the action would reasonably be described as "doing the work" rather than "planning the work," do not do it.

## PHASE 1 - Ground in the environment (explore first, ask second)

Begin by grounding yourself in the actual environment. Eliminate unknowns in the prompt by discovering facts, not by asking the user. Resolve all questions that can be answered through exploration or inspection. Identify missing or ambiguous details only if they cannot be derived from the environment. Silent exploration between turns is allowed and encouraged.

Before asking the user any question, perform at least one targeted non-mutating exploration pass (for example: search relevant files, inspect likely entrypoints/configs, confirm current implementation shape), unless no local environment/repo is available.

Exception: you may ask clarifying questions about the user's prompt before exploring, ONLY if there are obvious ambiguities or contradictions in the prompt itself. However, if ambiguity might be resolved by exploring, always prefer exploring first.

Do not ask questions that can be answered from the repo or system (for example, "where is this struct?" or "which UI component should we use?" when exploration can make it clear). Only ask once you have exhausted reasonable non-mutating exploration.

## PHASE 2 - Intent chat (what they actually want)

* Keep asking until you can clearly state: goal + success criteria, audience, in/out of scope, constraints, current state, and the key preferences/tradeoffs.
* Bias toward questions over guessing: if any high-impact ambiguity remains, do NOT plan yet-ask.

## PHASE 3 - Implementation chat (what/how we'll build)

* Once intent is stable, keep asking until the spec is decision complete: approach, interfaces (APIs/schemas/I/O), data flow, edge cases/failure modes, testing + acceptance criteria, rollout/monitoring, and any migrations/compat constraints.

## Asking questions

Critical rules:

* Strongly prefer using the \`request_user_input\` tool to ask any questions.
* Offer only meaningful multiple-choice options; don't include filler choices that are obviously wrong or irrelevant.
* In rare cases where an unavoidable, important question can't be expressed with reasonable multiple-choice options (due to extreme ambiguity), you may ask it directly without the tool.

You SHOULD ask many questions, but each question must:

* materially change the spec/plan, OR
* confirm/lock an assumption, OR
* choose between meaningful tradeoffs.
* not be answerable by non-mutating commands.

Use the \`request_user_input\` tool only for decisions that materially change the plan, for confirming important assumptions, or for information that cannot be discovered via non-mutating exploration.

## Two kinds of unknowns (treat differently)

1. **Discoverable facts** (repo/system truth): explore first.

   * Before asking, run targeted searches and check likely sources of truth (configs/manifests/entrypoints/schemas/types/constants).
   * Ask only if: multiple plausible candidates; nothing found but you need a missing identifier/context; or ambiguity is actually product intent.
   * If asking, present concrete candidates (paths/service names) + recommend one.
   * Never ask questions you can answer from your environment (e.g., "where is this struct").

2. **Preferences/tradeoffs** (not discoverable): ask early.

   * These are intent or implementation preferences that cannot be derived from exploration.
   * Provide 2-4 mutually exclusive options + a recommended default.
   * If unanswered, proceed with the recommended option and record it as an assumption in the final plan.

## Finalization rule

Only output the final plan when it is decision complete and leaves no decisions to the implementer.

When you present the official plan, wrap it in a \`<proposed_plan>\` block so the client can render it specially:

1) The opening tag must be on its own line.
2) Start the plan content on the next line (no text on the same line as the tag).
3) The closing tag must be on its own line.
4) Use Markdown inside the block.
5) Keep the tags exactly as \`<proposed_plan>\` and \`</proposed_plan>\` (do not translate or rename them), even if the plan content is in another language.

Example:

<proposed_plan>
plan content
</proposed_plan>

plan content should be human and agent digestible. The final plan must be plan-only and include:

* A clear title
* A brief summary section
* Important changes or additions to public APIs/interfaces/types
* Test cases and scenarios
* Explicit assumptions and defaults chosen where needed

Do not ask "should I proceed?" in the final output. The user can easily switch out of Plan mode and request implementation if you have included a \`<proposed_plan>\` block in your response. Alternatively, they can decide to stay in Plan mode and continue refining the plan.

Only produce at most one \`<proposed_plan>\` block per turn, and only when you are presenting a complete spec.
</collaboration_mode>`;

export const CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS = `<collaboration_mode># Collaboration Mode: Default

You are now in Default mode. Any previous instructions for other modes (e.g. Plan mode) are no longer active.

Your active mode changes only when new developer instructions with a different \`<collaboration_mode>...</collaboration_mode>\` change it; user requests or tool descriptions do not change mode by themselves. Known mode names are Default and Plan.

## request_user_input availability

The \`request_user_input\` tool is unavailable in Default mode. If you call it while in Default mode, it will return an error.

In Default mode, strongly prefer making reasonable assumptions and executing the user's request rather than stopping to ask questions. If you absolutely must ask a question because the answer cannot be discovered from local context and a reasonable assumption would be risky, ask the user directly with a concise plain-text question. Never write a multiple choice question as a textual assistant message.
</collaboration_mode>`;

function mapCodexRuntimeMode(runtimeMode: RuntimeMode): {
  readonly approvalPolicy: "on-request" | "never";
  readonly sandbox: "workspace-write" | "danger-full-access";
} {
  if (runtimeMode === "approval-required") {
    return {
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
    };
  }

  return {
    approvalPolicy: "never",
    sandbox: "danger-full-access",
  };
}

export function resolveCodexModelForAccount(
  model: string | undefined,
  account: CodexAccountSnapshot,
): string | undefined {
  if (model !== CODEX_SPARK_MODEL || account.sparkEnabled) {
    return model;
  }

  return CODEX_DEFAULT_MODEL;
}

/**
 * On Windows with `shell: true`, `child.kill()` only terminates the `cmd.exe`
 * wrapper, leaving the actual command running. Use `taskkill /T` to kill the
 * entire process tree instead.
 */
function killChildTree(child: ChildProcessWithoutNullStreams): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // fallback to direct kill
    }
  }
  child.kill();
}

export function normalizeCodexModelSlug(
  model: string | undefined | null,
  preferredId?: string,
): string | undefined {
  const normalized = normalizeModelSlug(model);
  if (!normalized) {
    return undefined;
  }

  if (preferredId?.endsWith("-codex") && preferredId !== normalized) {
    return preferredId;
  }

  return normalized;
}

export function buildCodexInitializeParams() {
  return {
    clientInfo: {
      name: "cut3_desktop",
      title: "CUT3 Desktop",
      version: "0.1.0",
    },
    capabilities: {
      experimentalApi: true,
    },
  } as const;
}

export function formatCodexRpcErrorMessage(input: {
  readonly method: string;
  readonly message: string;
  readonly model?: string | null;
}): string {
  const raw = `${input.method} failed: ${input.message}`;
  const openRouterMessage = formatCodexProviderErrorMessage({
    message: input.message,
    ...(input.model !== undefined ? { model: input.model } : {}),
  });
  if (openRouterMessage !== input.message) {
    return `${input.method} failed: ${openRouterMessage}`;
  }
  return raw;
}

export function formatCodexProviderErrorMessage(input: {
  readonly message: string;
  readonly model?: string | null;
}): string {
  const lower = input.message.toLowerCase();
  const looksLikeOpenRouterContext =
    isCodexOpenRouterModel(input.model) ||
    lower.includes("openrouter") ||
    lower.includes("openrouter.ai") ||
    lower.includes("settings/privacy");
  const looksLikeOpenRouterRoutingFailure =
    looksLikeOpenRouterContext &&
    OPENROUTER_NO_ELIGIBLE_ENDPOINT_SNIPPETS.some((snippet) => lower.includes(snippet));
  const looksLikeOpenRouterRateLimit =
    looksLikeOpenRouterContext &&
    ((lower.includes("429") && lower.includes("too many requests")) ||
      lower.includes("rate limit") ||
      lower.includes("retry limit"));
  const isOpenRouterInsufficientCredits =
    looksLikeOpenRouterContext && looksLikeOpenRouterInsufficientCredits(lower);
  const looksLikeOpenRouterResponsesValidationFailure =
    looksLikeOpenRouterContext &&
    OPENROUTER_RESPONSES_VALIDATION_SNIPPETS.some((snippet) => lower.includes(snippet));
  const looksLikeOpenRouterModelUnavailable =
    looksLikeOpenRouterContext &&
    OPENROUTER_MODEL_UNAVAILABLE_SNIPPETS.some((snippet) => lower.includes(snippet));

  const modelLabel = input.model ?? "the selected OpenRouter model";

  if (looksLikeOpenRouterRateLimit) {
    return `OpenRouter rate-limited ${modelLabel}. Free OpenRouter endpoints for specific models can run out of capacity or hit shared quotas. Wait and retry, switch to another free model, or use ${OPENROUTER_FREE_ROUTER_MODEL} so OpenRouter can route to any currently available free endpoint. Original error: ${input.message}`;
  }

  if (isOpenRouterInsufficientCredits) {
    return `OpenRouter rejected ${modelLabel} because the selected API key or account does not currently have usable OpenRouter credits or free-tier allowance. OpenRouter's free models still run behind account-level limits, and purchased credits increase those free-model limits. Verify that your key belongs to the expected OpenRouter account, then check https://openrouter.ai/settings/credits and https://openrouter.ai/api/v1/key. Original error: ${input.message}`;
  }

  if (looksLikeOpenRouterResponsesValidationFailure) {
    return `OpenRouter rejected a Responses API payload for ${modelLabel}. The model id is usually still valid, but OpenRouter could not validate one of the multi-turn tool or history items that Codex sent. Retry the turn, switch to another free model, or use ${OPENROUTER_FREE_ROUTER_MODEL}. If it keeps happening, OpenRouter's Responses API compatibility for that route is likely failing upstream. Original error: ${input.message}`;
  }

  if (looksLikeOpenRouterRoutingFailure) {
    return `OpenRouter could not find an eligible endpoint for ${modelLabel}. This usually means your OpenRouter privacy/provider settings or guardrails, or the request's required capabilities (for example tools, reasoning, images, or token limits), filtered out every available endpoint. If the original error mentions data policy, guardrails, or ZDR, check https://openrouter.ai/settings/privacy. Try another free model, remove unsupported parameters, or relax the matching OpenRouter privacy/provider filters. Original error: ${input.message}`;
  }

  if (looksLikeOpenRouterModelUnavailable) {
    return `OpenRouter could not serve ${modelLabel}. Free models on OpenRouter are frequently rotated, removed, or temporarily overloaded. Switch to another free model or use ${OPENROUTER_FREE_ROUTER_MODEL} so OpenRouter can route to any currently available free endpoint. Original error: ${input.message}`;
  }

  return input.message;
}

function readOptionalOpenRouterApiKey(input: {
  readonly providerOptions?: ProviderSessionStartInput["providerOptions"];
}): string | undefined {
  const apiKey = input.providerOptions?.codex?.openRouterApiKey?.trim();
  return apiKey && apiKey.length > 0 ? apiKey : undefined;
}

export function buildCodexAppServerArgs(input: { readonly model?: string }): ReadonlyArray<string> {
  const normalizedModel = normalizeCodexModelSlug(input.model);
  const usesOpenRouter = isCodexOpenRouterModel(normalizedModel ?? input.model);
  return [
    "app-server",
    ...(usesOpenRouter
      ? [
          "--config",
          `model_providers.openrouter={ name = "OpenRouter", base_url = "${OPENROUTER_BASE_URL}", env_key = "${OPENROUTER_ENV_KEY}" }`,
          "--config",
          'model_provider="openrouter"',
          "--config",
          `model="${normalizedModel ?? OPENROUTER_FREE_ROUTER_MODEL}"`,
        ]
      : []),
  ];
}

export function buildCodexAppServerEnv(input: {
  readonly homePath?: string;
  readonly model?: string;
  readonly openRouterApiKey?: string;
  readonly baseEnv?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const env = { ...(input.baseEnv ?? process.env) };
  if (input.homePath) {
    env.CODEX_HOME = input.homePath;
  }
  delete env[OPENROUTER_ENV_KEY];

  const openRouterApiKey = input.openRouterApiKey?.trim();
  const usesOpenRouter = isCodexOpenRouterModel(
    normalizeCodexModelSlug(input.model) ?? input.model,
  );
  if (usesOpenRouter && openRouterApiKey !== undefined && openRouterApiKey.length > 0) {
    env[OPENROUTER_ENV_KEY] = openRouterApiKey;
  }
  return env;
}

function buildCodexCollaborationMode(input: {
  readonly interactionMode?: "default" | "plan";
  readonly model?: string;
  readonly effort?: string;
}):
  | {
      mode: "default" | "plan";
      settings: {
        model: string;
        reasoning_effort: string | null;
        developer_instructions: string;
      };
    }
  | undefined {
  if (input.interactionMode === undefined) {
    return undefined;
  }
  const model = normalizeCodexModelSlug(input.model) ?? "gpt-5.3-codex";
  if (isCodexOpenRouterModel(model)) {
    return undefined;
  }
  return {
    mode: input.interactionMode,
    settings: {
      model,
      reasoning_effort: input.effort ?? null,
      developer_instructions:
        input.interactionMode === "plan"
          ? CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS
          : CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
    },
  };
}

function shouldRetryOpenRouterViaFreeRouter(input: {
  readonly model?: string;
  readonly message: string;
}): boolean {
  const normalizedModel = normalizeCodexModelSlug(input.model);
  if (
    !normalizedModel ||
    normalizedModel === OPENROUTER_FREE_ROUTER_MODEL ||
    !isCodexOpenRouterModel(normalizedModel) ||
    !normalizedModel.endsWith(":free")
  ) {
    return false;
  }

  const lower = input.message.toLowerCase();

  if (looksLikeOpenRouterInsufficientCredits(lower)) {
    return false;
  }
  if (OPENROUTER_RESPONSES_VALIDATION_SNIPPETS.some((snippet) => lower.includes(snippet))) {
    return false;
  }

  return (
    OPENROUTER_NO_ELIGIBLE_ENDPOINT_SNIPPETS.some((snippet) => lower.includes(snippet)) ||
    OPENROUTER_MODEL_UNAVAILABLE_SNIPPETS.some((snippet) => lower.includes(snippet)) ||
    lower.includes("502") ||
    lower.includes("503") ||
    (lower.includes("429") && lower.includes("too many requests")) ||
    lower.includes("rate limit") ||
    lower.includes("retry limit")
  );
}

function looksLikeOpenRouterInsufficientCredits(lower: string): boolean {
  return (
    (lower.includes("402") && lower.includes("payment required")) ||
    lower.includes("insufficient credits") ||
    lower.includes("never purchased credits")
  );
}

function isSpecificOpenRouterFreeModel(model: string | undefined): model is string {
  const normalizedModel = normalizeCodexModelSlug(model);
  return (
    normalizedModel !== undefined &&
    normalizedModel !== OPENROUTER_FREE_ROUTER_MODEL &&
    isCodexOpenRouterModel(normalizedModel) &&
    normalizedModel.endsWith(":free")
  );
}

function toCodexUserInputAnswer(value: unknown): CodexUserInputAnswer {
  if (typeof value === "string") {
    return { answers: [value] };
  }

  if (Array.isArray(value)) {
    const answers = value.filter((entry): entry is string => typeof entry === "string");
    return { answers };
  }

  if (value && typeof value === "object") {
    const maybeAnswers = (value as { answers?: unknown }).answers;
    if (Array.isArray(maybeAnswers)) {
      const answers = maybeAnswers.filter((entry): entry is string => typeof entry === "string");
      return { answers };
    }
  }

  throw new Error("User input answers must be strings or arrays of strings.");
}

function toCodexUserInputAnswers(
  answers: ProviderUserInputAnswers,
): Record<string, CodexUserInputAnswer> {
  return Object.fromEntries(
    Object.entries(answers).map(([questionId, value]) => [
      questionId,
      toCodexUserInputAnswer(value),
    ]),
  );
}

export function classifyCodexStderrLine(rawLine: string): { message: string } | null {
  const line = rawLine.replaceAll(ANSI_ESCAPE_REGEX, "").trim();
  if (!line) {
    return null;
  }

  const match = line.match(CODEX_STDERR_LOG_REGEX);
  if (match) {
    const level = match[1];
    if (level && level !== "ERROR") {
      return null;
    }

    const isBenignError = BENIGN_ERROR_LOG_SNIPPETS.some((snippet) => line.includes(snippet));
    if (isBenignError) {
      return null;
    }
  }

  return { message: line };
}

export function isRecoverableThreadResumeError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (!message.includes("thread/resume")) {
    return false;
  }

  return RECOVERABLE_THREAD_RESUME_ERROR_SNIPPETS.some((snippet) => message.includes(snippet));
}

export interface CodexAppServerManagerEvents {
  event: [event: ProviderEvent];
}

export class CodexAppServerManager extends EventEmitter<CodexAppServerManagerEvents> {
  private readonly sessions = new Map<ThreadId, CodexSessionContext>();
  private readonly startingSessions = new Map<ThreadId, CodexSessionContext>();

  private runPromise: (effect: Effect.Effect<unknown, never>) => Promise<unknown>;
  constructor(services?: ServiceMap.ServiceMap<never>) {
    super();
    this.runPromise = services ? Effect.runPromiseWith(services) : Effect.runPromise;
  }

  async startSession(input: CodexAppServerStartSessionInput): Promise<ProviderSession> {
    const threadId = input.threadId;
    const now = new Date().toISOString();
    let context: CodexSessionContext | undefined;
    const previousContext = this.sessions.get(threadId);

    try {
      const resolvedCwd = input.cwd ?? process.cwd();

      const session: ProviderSession = {
        provider: "codex",
        status: "connecting",
        runtimeMode: input.runtimeMode,
        model: normalizeCodexModelSlug(input.model),
        cwd: resolvedCwd,
        threadId,
        createdAt: now,
        updatedAt: now,
      };

      const codexOptions = readCodexProviderOptions(input);
      const codexBinaryPath = codexOptions.binaryPath ?? "codex";
      const codexHomePath = codexOptions.homePath;
      const openRouterApiKey = readOptionalOpenRouterApiKey({
        providerOptions: input.providerOptions,
      });
      this.assertSupportedCodexCliVersion({
        binaryPath: codexBinaryPath,
        cwd: resolvedCwd,
        ...(codexHomePath ? { homePath: codexHomePath } : {}),
      });
      const appServerArgs =
        input.model !== undefined
          ? buildCodexAppServerArgs({ model: input.model })
          : ["app-server"];
      const child = spawn(codexBinaryPath, appServerArgs, {
        cwd: resolvedCwd,
        env: buildCodexAppServerEnv({
          baseEnv: process.env,
          ...(codexHomePath !== undefined ? { homePath: codexHomePath } : {}),
          ...(input.model !== undefined ? { model: input.model } : {}),
          ...(openRouterApiKey !== undefined ? { openRouterApiKey } : {}),
        }),
        stdio: ["pipe", "pipe", "pipe"],
        shell: process.platform === "win32",
      });
      const output = readline.createInterface({ input: child.stdout });

      context = {
        session,
        account: {
          type: "unknown",
          planType: null,
          sparkEnabled: true,
        },
        child,
        output,
        pending: new Map(),
        pendingApprovals: new Map(),
        pendingUserInputs: new Map(),
        nextRequestId: 1,
        stopping: false,
      };

      this.startingSessions.set(threadId, context);
      this.attachProcessListeners(context);

      this.emitLifecycleEvent(context, "session/connecting", "Starting codex app-server");

      await this.sendRequest(context, "initialize", buildCodexInitializeParams());

      this.writeMessage(context, { method: "initialized" });
      try {
        const modelListResponse = await this.sendRequest(context, "model/list", {});
        console.log("codex model/list response", modelListResponse);
      } catch (error) {
        console.log("codex model/list failed", error);
      }
      try {
        const accountReadResponse = await this.sendRequest(context, "account/read", {});
        console.log("codex account/read response", accountReadResponse);
        context.account = readCodexAccountSnapshot(accountReadResponse);
        console.log("codex subscription status", {
          type: context.account.type,
          planType: context.account.planType,
          sparkEnabled: context.account.sparkEnabled,
        });
      } catch (error) {
        console.log("codex account/read failed", error);
      }

      const normalizedModel = resolveCodexModelForAccount(
        normalizeCodexModelSlug(input.model),
        context.account,
      );
      const sessionOverrides = {
        model: normalizedModel ?? null,
        ...(input.serviceTier !== undefined ? { serviceTier: input.serviceTier } : {}),
        cwd: input.cwd ?? null,
        ...mapCodexRuntimeMode(input.runtimeMode ?? "full-access"),
      };

      const threadStartParams = {
        ...sessionOverrides,
        experimentalRawEvents: false,
      };
      const resumeThreadId = readResumeThreadId(input);
      this.emitLifecycleEvent(
        context,
        "session/threadOpenRequested",
        resumeThreadId
          ? `Attempting to resume thread ${resumeThreadId}.`
          : "Starting a new Codex thread.",
      );
      await Effect.logInfo("codex app-server opening thread", {
        threadId,
        requestedRuntimeMode: input.runtimeMode,
        requestedModel: normalizedModel ?? null,
        requestedCwd: resolvedCwd,
        resumeThreadId: resumeThreadId ?? null,
      }).pipe(this.runPromise);

      let threadOpenMethod: "thread/start" | "thread/resume" = "thread/start";
      let threadOpenResponse: unknown;
      if (resumeThreadId) {
        try {
          threadOpenMethod = "thread/resume";
          threadOpenResponse = await this.sendRequest(context, "thread/resume", {
            ...sessionOverrides,
            threadId: resumeThreadId,
          });
        } catch (error) {
          if (!isRecoverableThreadResumeError(error)) {
            this.emitErrorEvent(
              context,
              "session/threadResumeFailed",
              error instanceof Error ? error.message : "Codex thread resume failed.",
            );
            await Effect.logWarning("codex app-server thread resume failed", {
              threadId,
              requestedRuntimeMode: input.runtimeMode,
              resumeThreadId,
              recoverable: false,
              cause: error instanceof Error ? error.message : String(error),
            }).pipe(this.runPromise);
            throw error;
          }

          threadOpenMethod = "thread/start";
          this.emitLifecycleEvent(
            context,
            "session/threadResumeFallback",
            `Could not resume thread ${resumeThreadId}; started a new thread instead.`,
          );
          await Effect.logWarning("codex app-server thread resume fell back to fresh start", {
            threadId,
            requestedRuntimeMode: input.runtimeMode,
            resumeThreadId,
            recoverable: true,
            cause: error instanceof Error ? error.message : String(error),
          }).pipe(this.runPromise);
          threadOpenResponse = await this.sendRequest(context, "thread/start", threadStartParams);
        }
      } else {
        threadOpenMethod = "thread/start";
        threadOpenResponse = await this.sendRequest(context, "thread/start", threadStartParams);
      }

      const threadOpenRecord = this.readObject(threadOpenResponse);
      const threadIdRaw =
        this.readString(this.readObject(threadOpenRecord, "thread"), "id") ??
        this.readString(threadOpenRecord, "threadId");
      if (!threadIdRaw) {
        throw new Error(`${threadOpenMethod} response did not include a thread id.`);
      }
      const providerThreadId = threadIdRaw;

      this.updateSession(context, {
        status: "ready",
        resumeCursor: { threadId: providerThreadId },
      });
      this.emitLifecycleEvent(
        context,
        "session/threadOpenResolved",
        `Codex ${threadOpenMethod} resolved.`,
      );
      await Effect.logInfo("codex app-server thread open resolved", {
        threadId,
        threadOpenMethod,
        requestedResumeThreadId: resumeThreadId ?? null,
        resolvedThreadId: providerThreadId,
        requestedRuntimeMode: input.runtimeMode,
      }).pipe(this.runPromise);
      this.startingSessions.delete(threadId);
      this.sessions.set(threadId, context);
      if (previousContext && previousContext !== context) {
        this.stopContext(previousContext, "Session replaced");
      }
      this.emitLifecycleEvent(context, "session/ready", `Connected to thread ${providerThreadId}`);
      return { ...context.session };
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Failed to start Codex session.";
      const message = formatCodexProviderErrorMessage({
        message: rawMessage,
        ...(input.model !== undefined ? { model: input.model } : {}),
      });
      if (context) {
        this.startingSessions.delete(threadId);
        this.updateSession(context, {
          status: "error",
          lastError: message,
        });
        this.emitErrorEvent(context, "session/startFailed", message);
        this.stopContext(context, "Session stopped");
      } else {
        this.emitEvent({
          id: EventId.makeUnsafe(randomUUID()),
          kind: "error",
          provider: "codex",
          threadId,
          createdAt: new Date().toISOString(),
          method: "session/startFailed",
          message,
        });
      }
      throw new Error(message, { cause: error });
    }
  }

  async sendTurn(input: CodexAppServerSendTurnInput): Promise<ProviderTurnStartResult> {
    const context = this.requireSession(input.threadId);

    const turnInput: Array<CodexTurnInputItem> = [];
    if (input.input) {
      turnInput.push({
        type: "text",
        text: input.input,
        text_elements: [],
      });
    }
    for (const attachment of input.attachments ?? []) {
      if (attachment.type === "image") {
        turnInput.push({
          type: "image",
          url: attachment.url,
        });
      }
    }
    if (turnInput.length === 0) {
      throw new Error("Turn input must include text or attachments.");
    }

    const providerThreadId = readResumeThreadId({
      threadId: context.session.threadId,
      runtimeMode: context.session.runtimeMode,
      resumeCursor: context.session.resumeCursor,
    });
    if (!providerThreadId) {
      throw new Error("Session is missing provider resume thread id.");
    }
    const turnStartParams: {
      threadId: string;
      input: Array<
        { type: "text"; text: string; text_elements: [] } | { type: "image"; url: string }
      >;
      model?: string;
      serviceTier?: string | null;
      effort?: string;
      collaborationMode?: {
        mode: "default" | "plan";
        settings: {
          model: string;
          reasoning_effort: string | null;
          developer_instructions: string;
        };
      };
    } = {
      threadId: providerThreadId,
      input: turnInput,
    };
    const normalizedModel = resolveCodexModelForAccount(
      normalizeCodexModelSlug(input.model ?? context.session.model),
      context.account,
    );
    if (isSpecificOpenRouterFreeModel(normalizedModel)) {
      context.pendingOpenRouterTurnRetry = {
        providerThreadId,
        input: turnInput,
        model: normalizedModel,
        fallbackAttempted: false,
      };
    } else {
      delete context.pendingOpenRouterTurnRetry;
    }
    if (normalizedModel) {
      turnStartParams.model = normalizedModel;
    }
    if (input.serviceTier !== undefined) {
      turnStartParams.serviceTier = input.serviceTier;
    }
    if (input.effort) {
      turnStartParams.effort = input.effort;
    }
    const collaborationMode = buildCodexCollaborationMode({
      ...(input.interactionMode !== undefined ? { interactionMode: input.interactionMode } : {}),
      ...(normalizedModel !== undefined ? { model: normalizedModel } : {}),
      ...(input.effort !== undefined ? { effort: input.effort } : {}),
    });
    if (collaborationMode) {
      if (!turnStartParams.model) {
        turnStartParams.model = collaborationMode.settings.model;
      }
      turnStartParams.collaborationMode = collaborationMode;
    }

    let response: unknown;
    let usedOpenRouterFreeFallback = false;
    let openRouterFallbackReason: string | undefined;
    try {
      response = await this.sendRequest(context, "turn/start", turnStartParams);
    } catch (error) {
      const retryMessage = error instanceof Error ? error.message : String(error);
      if (
        !shouldRetryOpenRouterViaFreeRouter({
          ...(normalizedModel !== undefined ? { model: normalizedModel } : {}),
          message: retryMessage,
        })
      ) {
        delete context.pendingOpenRouterTurnRetry;
        throw error;
      }

      usedOpenRouterFreeFallback = true;
      openRouterFallbackReason = retryMessage;
      const fallbackTurnStartParams = this.buildOpenRouterFreeRouterFallbackTurnStartParams({
        providerThreadId,
        input: turnInput,
      });
      response = await this.sendRequest(context, "turn/start", fallbackTurnStartParams);
    }

    const turnId = this.parseTurnStartResponse(response);
    if (usedOpenRouterFreeFallback) {
      if (normalizedModel) {
        this.emitOpenRouterModelRerouted({
          context,
          fromModel: normalizedModel,
          toModel: OPENROUTER_FREE_ROUTER_MODEL,
          reason:
            openRouterFallbackReason ??
            "OpenRouter could not serve the pinned free model and CUT3 retried through the free router.",
          turnId,
        });
      }
      delete context.pendingOpenRouterTurnRetry;
    } else if (context.pendingOpenRouterTurnRetry) {
      context.pendingOpenRouterTurnRetry.currentTurnId = turnId;
    }

    this.updateSession(context, {
      status: "running",
      activeTurnId: turnId,
      ...(context.session.resumeCursor !== undefined
        ? { resumeCursor: context.session.resumeCursor }
        : {}),
    });

    return {
      threadId: context.session.threadId,
      turnId,
      ...(context.session.resumeCursor !== undefined
        ? { resumeCursor: context.session.resumeCursor }
        : {}),
    };
  }

  async interruptTurn(threadId: ThreadId, turnId?: TurnId): Promise<void> {
    const context = this.requireSession(threadId);
    const effectiveTurnId = turnId ?? context.session.activeTurnId;

    const providerThreadId = readResumeThreadId({
      threadId: context.session.threadId,
      runtimeMode: context.session.runtimeMode,
      resumeCursor: context.session.resumeCursor,
    });
    if (!effectiveTurnId || !providerThreadId) {
      return;
    }

    await this.sendRequest(context, "turn/interrupt", {
      threadId: providerThreadId,
      turnId: effectiveTurnId,
    });
  }

  async readThread(threadId: ThreadId): Promise<CodexThreadSnapshot> {
    const context = this.requireSession(threadId);
    const providerThreadId = readResumeThreadId({
      threadId: context.session.threadId,
      runtimeMode: context.session.runtimeMode,
      resumeCursor: context.session.resumeCursor,
    });
    if (!providerThreadId) {
      throw new Error("Session is missing a provider resume thread id.");
    }

    const response = await this.sendRequest(context, "thread/read", {
      threadId: providerThreadId,
      includeTurns: true,
    });
    return this.parseThreadSnapshot("thread/read", response);
  }

  async rollbackThread(threadId: ThreadId, numTurns: number): Promise<CodexThreadSnapshot> {
    const context = this.requireSession(threadId);
    const providerThreadId = readResumeThreadId({
      threadId: context.session.threadId,
      runtimeMode: context.session.runtimeMode,
      resumeCursor: context.session.resumeCursor,
    });
    if (!providerThreadId) {
      throw new Error("Session is missing a provider resume thread id.");
    }
    if (!Number.isInteger(numTurns) || numTurns < 1) {
      throw new Error("numTurns must be an integer >= 1.");
    }

    const response = await this.sendRequest(context, "thread/rollback", {
      threadId: providerThreadId,
      numTurns,
    });
    this.updateSession(context, {
      status: "ready",
      activeTurnId: undefined,
    });
    return this.parseThreadSnapshot("thread/rollback", response);
  }

  async respondToRequest(
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ): Promise<void> {
    const context = this.requireSession(threadId);
    const pendingRequest = context.pendingApprovals.get(requestId);
    if (!pendingRequest) {
      throw new Error(`Unknown pending approval request: ${requestId}`);
    }

    context.pendingApprovals.delete(requestId);
    this.writeMessage(context, {
      id: pendingRequest.jsonRpcId,
      result: {
        decision,
      },
    });

    this.emitEvent({
      id: EventId.makeUnsafe(randomUUID()),
      kind: "notification",
      provider: "codex",
      threadId: context.session.threadId,
      createdAt: new Date().toISOString(),
      method: "item/requestApproval/decision",
      turnId: pendingRequest.turnId,
      itemId: pendingRequest.itemId,
      requestId: pendingRequest.requestId,
      requestKind: pendingRequest.requestKind,
      payload: {
        requestId: pendingRequest.requestId,
        requestKind: pendingRequest.requestKind,
        decision,
      },
    });
  }

  async respondToUserInput(
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    answers: ProviderUserInputAnswers,
  ): Promise<void> {
    const context = this.requireSession(threadId);
    const pendingRequest = context.pendingUserInputs.get(requestId);
    if (!pendingRequest) {
      throw new Error(`Unknown pending user input request: ${requestId}`);
    }

    context.pendingUserInputs.delete(requestId);
    const codexAnswers = toCodexUserInputAnswers(answers);
    this.writeMessage(context, {
      id: pendingRequest.jsonRpcId,
      result: {
        answers: codexAnswers,
      },
    });

    this.emitEvent({
      id: EventId.makeUnsafe(randomUUID()),
      kind: "notification",
      provider: "codex",
      threadId: context.session.threadId,
      createdAt: new Date().toISOString(),
      method: "item/tool/requestUserInput/answered",
      turnId: pendingRequest.turnId,
      itemId: pendingRequest.itemId,
      requestId: pendingRequest.requestId,
      payload: {
        requestId: pendingRequest.requestId,
        answers: codexAnswers,
      },
    });
  }

  stopSession(threadId: ThreadId): void {
    const context = this.sessions.get(threadId);
    if (!context) {
      return;
    }

    this.stopContext(context, "Session stopped");
  }

  private deleteSessionIfCurrent(threadId: ThreadId, context: CodexSessionContext): void {
    if (this.sessions.get(threadId) === context) {
      this.sessions.delete(threadId);
    }
    if (this.startingSessions.get(threadId) === context) {
      this.startingSessions.delete(threadId);
    }
  }

  private isCurrentContext(context: CodexSessionContext): boolean {
    return this.sessions.get(context.session.threadId) === context;
  }

  private isTrackedContext(context: CodexSessionContext): boolean {
    const threadId = context.session.threadId;
    return (
      this.sessions.get(threadId) === context || this.startingSessions.get(threadId) === context
    );
  }

  private stopContext(context: CodexSessionContext, message: string): void {
    context.stopping = true;

    this.rejectPendingRequests(context, "Session stopped before request completed.");
    context.pendingApprovals.clear();
    context.pendingUserInputs.clear();

    context.output.close();

    if (!context.child.killed) {
      killChildTree(context.child);
    }

    if (this.isCurrentContext(context)) {
      this.updateSession(context, {
        status: "closed",
        activeTurnId: undefined,
      });
      this.emitLifecycleEvent(context, "session/closed", message);
    }
    this.deleteSessionIfCurrent(context.session.threadId, context);
  }

  listSessions(): ProviderSession[] {
    return Array.from(this.sessions.values(), ({ session }) => ({
      ...session,
    }));
  }

  hasSession(threadId: ThreadId): boolean {
    return this.sessions.has(threadId);
  }

  stopAll(): void {
    for (const threadId of this.sessions.keys()) {
      this.stopSession(threadId);
    }
  }

  private requireSession(threadId: ThreadId): CodexSessionContext {
    const context = this.sessions.get(threadId);
    if (!context) {
      throw new Error(`Unknown session for thread: ${threadId}`);
    }

    if (context.session.status === "closed") {
      throw new Error(`Session is closed for thread: ${threadId}`);
    }

    return context;
  }

  private attachProcessListeners(context: CodexSessionContext): void {
    context.output.on("line", (line) => {
      this.handleStdoutLine(context, line);
    });

    context.child.stderr.on("data", (chunk: Buffer) => {
      if (!this.isTrackedContext(context) && !context.stopping) {
        return;
      }
      const raw = chunk.toString();
      const lines = raw.split(/\r?\n/g);
      for (const rawLine of lines) {
        const classified = classifyCodexStderrLine(rawLine);
        if (!classified) {
          continue;
        }

        if (classified.message.toLowerCase().startsWith("error:")) {
          context.lastProcessError = classified.message;
        }

        this.emitErrorEvent(context, "process/stderr", classified.message);
      }
    });

    context.child.stdin.on("error", (error) => {
      if (!this.isTrackedContext(context) && !context.stopping) {
        return;
      }

      const message = error.message || "codex app-server stdin errored.";
      if (!context.lastProcessError) {
        context.lastProcessError = message;
      }
      this.rejectPendingRequests(context, context.lastProcessError ?? message);
      this.emitErrorEvent(context, "process/stdinError", message);
    });

    context.child.on("error", (error) => {
      if (!this.isTrackedContext(context) && !context.stopping) {
        return;
      }
      const message = error.message || "codex app-server process errored.";
      this.rejectPendingRequests(context, context.lastProcessError ?? message);
      this.updateSession(context, {
        status: "error",
        lastError: message,
      });
      this.emitErrorEvent(context, "process/error", message);
    });

    context.child.on("exit", (code, signal) => {
      if (!this.isTrackedContext(context) && !context.stopping) {
        return;
      }
      if (context.stopping) {
        return;
      }

      const message = `codex app-server exited (code=${code ?? "null"}, signal=${signal ?? "null"}).`;
      this.rejectPendingRequests(context, context.lastProcessError ?? message);
      this.updateSession(context, {
        status: "closed",
        activeTurnId: undefined,
        lastError: code === 0 ? context.session.lastError : message,
      });
      this.emitLifecycleEvent(context, "session/exited", message);
      this.deleteSessionIfCurrent(context.session.threadId, context);
    });
  }

  private handleStdoutLine(context: CodexSessionContext, line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.emitErrorEvent(
        context,
        "protocol/parseError",
        "Received invalid JSON from codex app-server.",
      );
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      this.emitErrorEvent(
        context,
        "protocol/invalidMessage",
        "Received non-object protocol message.",
      );
      return;
    }

    if (this.isServerRequest(parsed)) {
      this.handleServerRequest(context, parsed);
      return;
    }

    if (this.isServerNotification(parsed)) {
      this.handleServerNotification(context, parsed);
      return;
    }

    if (this.isResponse(parsed)) {
      this.handleResponse(context, parsed);
      return;
    }

    this.emitErrorEvent(
      context,
      "protocol/unrecognizedMessage",
      "Received protocol message in an unknown shape.",
    );
  }

  private handleServerNotification(
    context: CodexSessionContext,
    notification: JsonRpcNotification,
  ): void {
    const route = this.readRouteFields(notification.params);
    const textDelta =
      notification.method === "item/agentMessage/delta"
        ? this.readString(notification.params, "delta")
        : undefined;

    this.emitEvent({
      id: EventId.makeUnsafe(randomUUID()),
      kind: "notification",
      provider: "codex",
      threadId: context.session.threadId,
      createdAt: new Date().toISOString(),
      method: notification.method,
      turnId: route.turnId,
      itemId: route.itemId,
      textDelta,
      payload: notification.params,
    });

    if (notification.method === "thread/started") {
      const providerThreadId = normalizeProviderThreadId(
        this.readString(this.readObject(notification.params)?.thread, "id"),
      );
      if (providerThreadId) {
        this.updateSession(context, { resumeCursor: { threadId: providerThreadId } });
      }
      return;
    }

    if (notification.method === "turn/started") {
      const turnId = toTurnId(this.readString(this.readObject(notification.params)?.turn, "id"));
      if (turnId && context.pendingOpenRouterTurnRetry) {
        context.pendingOpenRouterTurnRetry.currentTurnId = turnId;
      }
      this.updateSession(context, {
        status: "running",
        activeTurnId: turnId,
      });
      return;
    }

    if (notification.method === "turn/completed") {
      const turn = this.readObject(notification.params, "turn");
      const completedTurnId = toTurnId(this.readString(turn, "id"));
      const status = this.readString(turn, "status");
      const errorMessage = this.readString(this.readObject(turn, "error"), "message");
      const pendingOpenRouterRetry = context.pendingOpenRouterTurnRetry;
      if (
        status === "failed" &&
        errorMessage &&
        pendingOpenRouterRetry &&
        pendingOpenRouterRetry.currentTurnId === completedTurnId &&
        !pendingOpenRouterRetry.fallbackAttempted &&
        shouldRetryOpenRouterViaFreeRouter({
          model: pendingOpenRouterRetry.model,
          message: errorMessage,
        })
      ) {
        context.pendingOpenRouterTurnRetry = {
          ...pendingOpenRouterRetry,
          fallbackAttempted: true,
          retryReason: errorMessage,
        };
        this.updateSession(context, {
          status: "running",
          activeTurnId: undefined,
          lastError: undefined,
        });
        void this.retryPendingOpenRouterTurnViaFreeRouter(context);
        return;
      }

      if (
        pendingOpenRouterRetry &&
        pendingOpenRouterRetry.currentTurnId !== undefined &&
        pendingOpenRouterRetry.currentTurnId === completedTurnId
      ) {
        delete context.pendingOpenRouterTurnRetry;
      }
      const lastError =
        status === "failed" && errorMessage
          ? formatCodexProviderErrorMessage({
              message: errorMessage,
              ...(context.session.model !== undefined ? { model: context.session.model } : {}),
            })
          : context.session.lastError;
      this.updateSession(context, {
        status: status === "failed" ? "error" : "ready",
        activeTurnId: undefined,
        lastError,
      });
      return;
    }

    if (notification.method === "error") {
      const message = this.readString(this.readObject(notification.params)?.error, "message");
      const willRetry = this.readBoolean(notification.params, "willRetry");
      const notificationTurnId = route.turnId ?? context.session.activeTurnId;
      const pendingOpenRouterRetry = context.pendingOpenRouterTurnRetry;
      if (
        !willRetry &&
        message &&
        notificationTurnId &&
        pendingOpenRouterRetry &&
        !pendingOpenRouterRetry.fallbackAttempted &&
        pendingOpenRouterRetry.currentTurnId === notificationTurnId &&
        shouldRetryOpenRouterViaFreeRouter({
          model: pendingOpenRouterRetry.model,
          message,
        })
      ) {
        this.updateSession(context, {
          status: "running",
          lastError: undefined,
        });
        return;
      }
      const lastError =
        message === undefined
          ? context.session.lastError
          : formatCodexProviderErrorMessage({
              message,
              ...(context.session.model !== undefined ? { model: context.session.model } : {}),
            });

      this.updateSession(context, {
        status: willRetry ? "running" : "error",
        lastError,
      });
    }
  }

  private handleServerRequest(context: CodexSessionContext, request: JsonRpcRequest): void {
    const route = this.readRouteFields(request.params);
    const requestKind = this.requestKindForMethod(request.method);
    let requestId: ApprovalRequestId | undefined;
    if (requestKind) {
      requestId = ApprovalRequestId.makeUnsafe(randomUUID());
      const pendingRequest: PendingApprovalRequest = {
        requestId,
        jsonRpcId: request.id,
        method:
          requestKind === "command"
            ? "item/commandExecution/requestApproval"
            : requestKind === "file-read"
              ? "item/fileRead/requestApproval"
              : "item/fileChange/requestApproval",
        requestKind,
        threadId: context.session.threadId,
        ...(route.turnId ? { turnId: route.turnId } : {}),
        ...(route.itemId ? { itemId: route.itemId } : {}),
      };
      context.pendingApprovals.set(requestId, pendingRequest);
    }

    if (request.method === "item/tool/requestUserInput") {
      requestId = ApprovalRequestId.makeUnsafe(randomUUID());
      context.pendingUserInputs.set(requestId, {
        requestId,
        jsonRpcId: request.id,
        threadId: context.session.threadId,
        ...(route.turnId ? { turnId: route.turnId } : {}),
        ...(route.itemId ? { itemId: route.itemId } : {}),
      });
    }

    this.emitEvent({
      id: EventId.makeUnsafe(randomUUID()),
      kind: "request",
      provider: "codex",
      threadId: context.session.threadId,
      createdAt: new Date().toISOString(),
      method: request.method,
      turnId: route.turnId,
      itemId: route.itemId,
      requestId,
      requestKind,
      payload: request.params,
    });

    if (requestKind) {
      return;
    }

    if (request.method === "item/tool/requestUserInput") {
      return;
    }

    this.writeMessage(context, {
      id: request.id,
      error: {
        code: -32601,
        message: `Unsupported server request: ${request.method}`,
      },
    });
  }

  private handleResponse(context: CodexSessionContext, response: JsonRpcResponse): void {
    const key = String(response.id);
    const pending = context.pending.get(key);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    context.pending.delete(key);

    if (response.error?.message) {
      pending.reject(
        new Error(
          formatCodexRpcErrorMessage({
            method: pending.method,
            message: String(response.error.message),
            ...(context.session.model !== undefined ? { model: context.session.model } : {}),
          }),
        ),
      );
      return;
    }

    pending.resolve(response.result);
  }

  private rejectPendingRequests(context: CodexSessionContext, message: string): void {
    for (const pending of context.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    context.pending.clear();
  }

  private async sendRequest<TResponse>(
    context: CodexSessionContext,
    method: string,
    params: unknown,
    timeoutMs = 20_000,
  ): Promise<TResponse> {
    const id = context.nextRequestId;
    context.nextRequestId += 1;

    const result = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        context.pending.delete(String(id));
        reject(new Error(`Timed out waiting for ${method}.`));
      }, timeoutMs);

      context.pending.set(String(id), {
        method,
        timeout,
        resolve,
        reject,
      });
      this.writeMessage(context, {
        method,
        id,
        params,
      });
    });

    return result as TResponse;
  }

  private writeMessage(context: CodexSessionContext, message: unknown): void {
    const encoded = JSON.stringify(message);
    if (!context.child.stdin.writable) {
      throw new Error("Cannot write to codex app-server stdin.");
    }

    context.child.stdin.write(`${encoded}\n`);
  }

  private emitLifecycleEvent(context: CodexSessionContext, method: string, message: string): void {
    this.emitEvent({
      id: EventId.makeUnsafe(randomUUID()),
      kind: "session",
      provider: "codex",
      threadId: context.session.threadId,
      createdAt: new Date().toISOString(),
      method,
      message,
    });
  }

  private emitErrorEvent(context: CodexSessionContext, method: string, message: string): void {
    this.emitEvent({
      id: EventId.makeUnsafe(randomUUID()),
      kind: "error",
      provider: "codex",
      threadId: context.session.threadId,
      createdAt: new Date().toISOString(),
      method,
      message,
    });
  }

  private emitEvent(event: ProviderEvent): void {
    this.emit("event", event);
  }

  private assertSupportedCodexCliVersion(input: {
    readonly binaryPath: string;
    readonly cwd: string;
    readonly homePath?: string;
  }): void {
    assertSupportedCodexCliVersion(input);
  }

  private parseTurnStartResponse(response: unknown): TurnId {
    const turn = this.readObject(this.readObject(response), "turn");
    const turnIdRaw = this.readString(turn, "id");
    if (!turnIdRaw) {
      throw new Error("turn/start response did not include a turn id.");
    }
    return TurnId.makeUnsafe(turnIdRaw);
  }

  private buildOpenRouterFreeRouterFallbackTurnStartParams(input: {
    readonly providerThreadId: string;
    readonly input: ReadonlyArray<CodexTurnInputItem>;
  }) {
    return {
      threadId: input.providerThreadId,
      input: input.input,
      model: OPENROUTER_FREE_ROUTER_MODEL,
    } as const;
  }

  private emitOpenRouterModelRerouted(input: {
    readonly context: CodexSessionContext;
    readonly fromModel: string;
    readonly toModel: string;
    readonly reason: string;
    readonly turnId?: TurnId;
  }): void {
    this.emitEvent({
      id: EventId.makeUnsafe(randomUUID()),
      kind: "notification",
      provider: "codex",
      threadId: input.context.session.threadId,
      createdAt: new Date().toISOString(),
      method: "model/rerouted",
      ...(input.turnId ? { turnId: input.turnId } : {}),
      payload: {
        fromModel: input.fromModel,
        toModel: input.toModel,
        reason: input.reason,
      },
    });
  }

  private async retryPendingOpenRouterTurnViaFreeRouter(
    context: CodexSessionContext,
  ): Promise<void> {
    const pendingRetry = context.pendingOpenRouterTurnRetry;
    if (!pendingRetry || !pendingRetry.fallbackAttempted) {
      return;
    }

    try {
      const response = await this.sendRequest(
        context,
        "turn/start",
        this.buildOpenRouterFreeRouterFallbackTurnStartParams({
          providerThreadId: pendingRetry.providerThreadId,
          input: pendingRetry.input,
        }),
      );
      const turnId = this.parseTurnStartResponse(response);
      context.pendingOpenRouterTurnRetry = {
        ...pendingRetry,
        currentTurnId: turnId,
      };
      this.emitOpenRouterModelRerouted({
        context,
        fromModel: pendingRetry.model,
        toModel: OPENROUTER_FREE_ROUTER_MODEL,
        reason:
          pendingRetry.retryReason ??
          "OpenRouter could not serve the pinned free model and CUT3 retried through the free router.",
        turnId,
      });
      this.updateSession(context, {
        status: "running",
        activeTurnId: turnId,
        lastError: undefined,
      });
    } catch (error) {
      const message = formatCodexProviderErrorMessage({
        message: error instanceof Error ? error.message : String(error),
        model: pendingRetry.model,
      });
      delete context.pendingOpenRouterTurnRetry;
      this.updateSession(context, {
        status: "error",
        activeTurnId: undefined,
        lastError: message,
      });
      this.emitErrorEvent(context, "turn/openRouterFallbackFailed", message);
    }
  }

  private updateSession(context: CodexSessionContext, updates: Partial<ProviderSession>): void {
    context.session = {
      ...context.session,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
  }

  private requestKindForMethod(method: string): ProviderRequestKind | undefined {
    if (method === "item/commandExecution/requestApproval") {
      return "command";
    }

    if (method === "item/fileRead/requestApproval") {
      return "file-read";
    }

    if (method === "item/fileChange/requestApproval") {
      return "file-change";
    }

    return undefined;
  }

  private parseThreadSnapshot(method: string, response: unknown): CodexThreadSnapshot {
    const responseRecord = this.readObject(response);
    const thread = this.readObject(responseRecord, "thread");
    const threadIdRaw =
      this.readString(thread, "id") ?? this.readString(responseRecord, "threadId");
    if (!threadIdRaw) {
      throw new Error(`${method} response did not include a thread id.`);
    }
    const turnsRaw =
      this.readArray(thread, "turns") ?? this.readArray(responseRecord, "turns") ?? [];
    const turns = turnsRaw.map((turnValue, index) => {
      const turn = this.readObject(turnValue);
      const turnIdRaw = this.readString(turn, "id") ?? `${threadIdRaw}:turn:${index + 1}`;
      const turnId = TurnId.makeUnsafe(turnIdRaw);
      const items = this.readArray(turn, "items") ?? [];
      return {
        id: turnId,
        items,
      };
    });

    return {
      threadId: threadIdRaw,
      turns,
    };
  }

  private isServerRequest(value: unknown): value is JsonRpcRequest {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.method === "string" &&
      (typeof candidate.id === "string" || typeof candidate.id === "number")
    );
  }

  private isServerNotification(value: unknown): value is JsonRpcNotification {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return typeof candidate.method === "string" && !("id" in candidate);
  }

  private isResponse(value: unknown): value is JsonRpcResponse {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    const hasId = typeof candidate.id === "string" || typeof candidate.id === "number";
    const hasMethod = typeof candidate.method === "string";
    return hasId && !hasMethod;
  }

  private readRouteFields(params: unknown): {
    turnId?: TurnId;
    itemId?: ProviderItemId;
  } {
    const route: {
      turnId?: TurnId;
      itemId?: ProviderItemId;
    } = {};

    const turnId = toTurnId(
      this.readString(params, "turnId") ?? this.readString(this.readObject(params, "turn"), "id"),
    );
    const itemId = toProviderItemId(
      this.readString(params, "itemId") ?? this.readString(this.readObject(params, "item"), "id"),
    );

    if (turnId) {
      route.turnId = turnId;
    }

    if (itemId) {
      route.itemId = itemId;
    }

    return route;
  }

  private readObject(value: unknown, key?: string): Record<string, unknown> | undefined {
    const target =
      key === undefined
        ? value
        : value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined;

    if (!target || typeof target !== "object") {
      return undefined;
    }

    return target as Record<string, unknown>;
  }

  private readArray(value: unknown, key?: string): unknown[] | undefined {
    const target =
      key === undefined
        ? value
        : value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined;
    return Array.isArray(target) ? target : undefined;
  }

  private readString(value: unknown, key: string): string | undefined {
    if (!value || typeof value !== "object") {
      return undefined;
    }

    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === "string" ? candidate : undefined;
  }

  private readBoolean(value: unknown, key: string): boolean | undefined {
    if (!value || typeof value !== "object") {
      return undefined;
    }

    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === "boolean" ? candidate : undefined;
  }
}

function brandIfNonEmpty<T extends string>(
  value: string | undefined,
  maker: (value: string) => T,
): T | undefined {
  const normalized = value?.trim();
  return normalized?.length ? maker(normalized) : undefined;
}

function normalizeProviderThreadId(value: string | undefined): string | undefined {
  return brandIfNonEmpty(value, (normalized) => normalized);
}

function readCodexProviderOptions(input: CodexAppServerStartSessionInput): {
  readonly binaryPath?: string;
  readonly homePath?: string;
  readonly openRouterApiKey?: string;
} {
  const options = input.providerOptions?.codex;
  if (!options) {
    return {};
  }
  return {
    ...(options.binaryPath ? { binaryPath: options.binaryPath } : {}),
    ...(options.homePath ? { homePath: options.homePath } : {}),
    ...(options.openRouterApiKey ? { openRouterApiKey: options.openRouterApiKey } : {}),
  };
}

function assertSupportedCodexCliVersion(input: {
  readonly binaryPath: string;
  readonly cwd: string;
  readonly homePath?: string;
}): void {
  const result = spawnSync(input.binaryPath, ["--version"], {
    cwd: input.cwd,
    env: {
      ...process.env,
      ...(input.homePath ? { CODEX_HOME: input.homePath } : {}),
    },
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: CODEX_VERSION_CHECK_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });

  if (result.error) {
    const lower = result.error.message.toLowerCase();
    if (
      lower.includes("enoent") ||
      lower.includes("command not found") ||
      lower.includes("not found")
    ) {
      throw new Error(`Codex CLI (${input.binaryPath}) is not installed or not executable.`);
    }
    throw new Error(
      `Failed to execute Codex CLI version check: ${result.error.message || String(result.error)}`,
    );
  }

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.status !== 0) {
    const detail = stderr.trim() || stdout.trim() || `Command exited with code ${result.status}.`;
    throw new Error(`Codex CLI version check failed. ${detail}`);
  }

  const parsedVersion = parseCodexCliVersion(`${stdout}\n${stderr}`);
  if (parsedVersion && !isCodexCliVersionSupported(parsedVersion)) {
    throw new Error(formatCodexCliUpgradeMessage(parsedVersion));
  }
}

function readResumeCursorThreadId(resumeCursor: unknown): string | undefined {
  if (!resumeCursor || typeof resumeCursor !== "object" || Array.isArray(resumeCursor)) {
    return undefined;
  }
  const rawThreadId = (resumeCursor as Record<string, unknown>).threadId;
  return typeof rawThreadId === "string" ? normalizeProviderThreadId(rawThreadId) : undefined;
}

function readResumeThreadId(input: CodexAppServerStartSessionInput): string | undefined {
  return readResumeCursorThreadId(input.resumeCursor);
}

function toTurnId(value: string | undefined): TurnId | undefined {
  return brandIfNonEmpty(value, TurnId.makeUnsafe);
}

function toProviderItemId(value: string | undefined): ProviderItemId | undefined {
  return brandIfNonEmpty(value, ProviderItemId.makeUnsafe);
}
