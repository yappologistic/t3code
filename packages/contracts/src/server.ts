import { Schema } from "effect";
import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas";
import { KeybindingRule, ResolvedKeybindingsConfig } from "./keybindings";
import { EditorId } from "./editor";
import { COPILOT_REASONING_EFFORT_VALUES } from "./model";
import { ProviderKind } from "./orchestration";

const KeybindingsMalformedConfigIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.malformed-config"),
  message: TrimmedNonEmptyString,
});

const KeybindingsInvalidEntryIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.invalid-entry"),
  message: TrimmedNonEmptyString,
  index: Schema.Number,
});

export const ServerConfigIssue = Schema.Union([
  KeybindingsMalformedConfigIssue,
  KeybindingsInvalidEntryIssue,
]);
export type ServerConfigIssue = typeof ServerConfigIssue.Type;

const ServerConfigIssues = Schema.Array(ServerConfigIssue);

export const ServerProviderStatusState = Schema.Literals(["ready", "warning", "error"]);
export type ServerProviderStatusState = typeof ServerProviderStatusState.Type;

export const ServerProviderAuthStatus = Schema.Literals([
  "authenticated",
  "unauthenticated",
  "unknown",
]);
export type ServerProviderAuthStatus = typeof ServerProviderAuthStatus.Type;

export const ServerProviderStatus = Schema.Struct({
  provider: ProviderKind,
  status: ServerProviderStatusState,
  available: Schema.Boolean,
  authStatus: ServerProviderAuthStatus,
  checkedAt: IsoDateTime,
  message: Schema.optional(TrimmedNonEmptyString),
});
export type ServerProviderStatus = typeof ServerProviderStatus.Type;

const ServerProviderStatuses = Schema.Array(ServerProviderStatus);
export const ServerOpenCodeCredentialAuthType = Schema.Literals([
  "api",
  "oauth",
  "wellknown",
  "unknown",
]);
export type ServerOpenCodeCredentialAuthType = typeof ServerOpenCodeCredentialAuthType.Type;

export const ServerOpenCodeCredential = Schema.Struct({
  name: TrimmedNonEmptyString,
  authType: ServerOpenCodeCredentialAuthType,
});
export type ServerOpenCodeCredential = typeof ServerOpenCodeCredential.Type;

const ServerOpenCodeCredentials = Schema.Array(ServerOpenCodeCredential);

export const ServerOpenCodeModel = Schema.Struct({
  slug: TrimmedNonEmptyString,
  providerId: TrimmedNonEmptyString,
  modelId: TrimmedNonEmptyString,
});
export type ServerOpenCodeModel = typeof ServerOpenCodeModel.Type;

const ServerOpenCodeModels = Schema.Array(ServerOpenCodeModel);

export const ServerOpenCodeStateInput = Schema.Struct({
  cwd: Schema.optional(TrimmedNonEmptyString),
  binaryPath: Schema.optional(TrimmedNonEmptyString),
  refreshModels: Schema.optional(Schema.Boolean),
});
export type ServerOpenCodeStateInput = typeof ServerOpenCodeStateInput.Type;

const ServerOpenCodeStateAvailable = Schema.Struct({
  status: Schema.Literal("available"),
  fetchedAt: IsoDateTime,
  checkedCwd: TrimmedNonEmptyString,
  binaryPath: TrimmedNonEmptyString,
  credentials: ServerOpenCodeCredentials,
  models: ServerOpenCodeModels,
  message: Schema.optional(TrimmedNonEmptyString),
});

const ServerOpenCodeStateUnavailable = Schema.Struct({
  status: Schema.Literal("unavailable"),
  fetchedAt: IsoDateTime,
  checkedCwd: TrimmedNonEmptyString,
  binaryPath: TrimmedNonEmptyString,
  credentials: ServerOpenCodeCredentials,
  models: ServerOpenCodeModels,
  message: TrimmedNonEmptyString,
});

export const ServerOpenCodeState = Schema.Union([
  ServerOpenCodeStateAvailable,
  ServerOpenCodeStateUnavailable,
]);
export type ServerOpenCodeState = typeof ServerOpenCodeState.Type;

const NonNegativeNumber = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0));
export const ServerMcpServerStatusState = Schema.Literals(["enabled", "disabled"]);
export type ServerMcpServerStatusState = typeof ServerMcpServerStatusState.Type;

export const ServerMcpServerAuthStatus = Schema.Literals([
  "unsupported",
  "not_logged_in",
  "bearer_token",
  "o_auth",
  "unknown",
]);
export type ServerMcpServerAuthStatus = typeof ServerMcpServerAuthStatus.Type;

export const ServerMcpServerStatus = Schema.Struct({
  name: TrimmedNonEmptyString,
  enabled: Schema.Boolean,
  state: ServerMcpServerStatusState,
  authStatus: ServerMcpServerAuthStatus,
  toolCount: NonNegativeNumber,
  resourceCount: NonNegativeNumber,
  resourceTemplateCount: NonNegativeNumber,
});
export type ServerMcpServerStatus = typeof ServerMcpServerStatus.Type;

export const ServerProviderMcpStatus = Schema.Struct({
  provider: ProviderKind,
  supported: Schema.Boolean,
  servers: Schema.Array(ServerMcpServerStatus),
});
export type ServerProviderMcpStatus = typeof ServerProviderMcpStatus.Type;

const ServerProviderMcpStatuses = Schema.Array(ServerProviderMcpStatus);

export const ServerCopilotUsageSource = Schema.Literal("copilot_internal_user");
export type ServerCopilotUsageSource = typeof ServerCopilotUsageSource.Type;

const ServerCopilotUsageAvailable = Schema.Struct({
  status: Schema.Literal("available"),
  source: ServerCopilotUsageSource,
  fetchedAt: IsoDateTime,
  login: TrimmedNonEmptyString,
  plan: Schema.optional(TrimmedNonEmptyString),
  entitlement: NonNegativeNumber,
  remaining: NonNegativeNumber,
  used: NonNegativeNumber,
  percentRemaining: Schema.Number,
  overagePermitted: Schema.Boolean,
  overageCount: NonNegativeNumber,
  unlimited: Schema.Boolean,
  resetAt: IsoDateTime,
});

const ServerCopilotUsageUnavailable = Schema.Struct({
  status: Schema.Literals(["requires-auth", "unavailable"]),
  fetchedAt: IsoDateTime,
  source: Schema.optional(ServerCopilotUsageSource),
  message: TrimmedNonEmptyString,
});

export const ServerCopilotUsage = Schema.Union([
  ServerCopilotUsageAvailable,
  ServerCopilotUsageUnavailable,
]);
export type ServerCopilotUsage = typeof ServerCopilotUsage.Type;

const ServerCopilotReasoningOption = Schema.Literals(COPILOT_REASONING_EFFORT_VALUES);

export const ServerCopilotReasoningProbeInput = Schema.Struct({
  model: TrimmedNonEmptyString,
  binaryPath: Schema.optional(TrimmedNonEmptyString),
});
export type ServerCopilotReasoningProbeInput = typeof ServerCopilotReasoningProbeInput.Type;

const ServerCopilotReasoningProbeSupported = Schema.Struct({
  status: Schema.Literal("supported"),
  fetchedAt: IsoDateTime,
  model: TrimmedNonEmptyString,
  options: Schema.Array(ServerCopilotReasoningOption),
  currentValue: Schema.optional(ServerCopilotReasoningOption),
});

const ServerCopilotReasoningProbeUnavailable = Schema.Struct({
  status: Schema.Literal("unavailable"),
  fetchedAt: IsoDateTime,
  model: TrimmedNonEmptyString,
  message: TrimmedNonEmptyString,
});

export const ServerCopilotReasoningProbe = Schema.Union([
  ServerCopilotReasoningProbeSupported,
  ServerCopilotReasoningProbeUnavailable,
]);
export type ServerCopilotReasoningProbe = typeof ServerCopilotReasoningProbe.Type;

export const ServerConfig = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  keybindingsConfigPath: TrimmedNonEmptyString,
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
  providers: ServerProviderStatuses,
  mcpServers: Schema.optional(ServerProviderMcpStatuses),
  availableEditors: Schema.Array(EditorId),
});
export type ServerConfig = typeof ServerConfig.Type;

export const ServerUpsertKeybindingInput = KeybindingRule;
export type ServerUpsertKeybindingInput = typeof ServerUpsertKeybindingInput.Type;

export const ServerUpsertKeybindingResult = Schema.Struct({
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
});
export type ServerUpsertKeybindingResult = typeof ServerUpsertKeybindingResult.Type;

export const ServerConfigUpdatedPayload = Schema.Struct({
  issues: ServerConfigIssues,
  providers: ServerProviderStatuses,
});
export type ServerConfigUpdatedPayload = typeof ServerConfigUpdatedPayload.Type;

export const ServerOpenCodeAddCredentialInput = Schema.Struct({
  provider: TrimmedNonEmptyString,
  apiKey: TrimmedNonEmptyString,
  binaryPath: Schema.optional(TrimmedNonEmptyString),
});
export type ServerOpenCodeAddCredentialInput = typeof ServerOpenCodeAddCredentialInput.Type;

export const ServerOpenCodeRemoveCredentialInput = Schema.Struct({
  provider: TrimmedNonEmptyString,
  binaryPath: Schema.optional(TrimmedNonEmptyString),
});
export type ServerOpenCodeRemoveCredentialInput = typeof ServerOpenCodeRemoveCredentialInput.Type;

export const ServerOpenCodeCredentialResult = Schema.Struct({
  success: Schema.Boolean,
  message: Schema.optional(TrimmedNonEmptyString),
});
export type ServerOpenCodeCredentialResult = typeof ServerOpenCodeCredentialResult.Type;
