import { Schema, Struct } from "effect";
import { NonNegativeInt, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas";

import {
  ClientOrchestrationCommand,
  DispatchResult,
  OrchestrationEvent,
  OrchestrationGetFullThreadDiffResult,
  ORCHESTRATION_WS_CHANNELS,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetSnapshotResult,
  ORCHESTRATION_WS_METHODS,
  OrchestrationGetSnapshotInput,
  OrchestrationGetTurnDiffResult,
  OrchestrationGetTurnDiffInput,
  OrchestrationReplayEventsResult,
  OrchestrationReplayEventsInput,
} from "./orchestration";
import {
  GitCreateWorktreeResult,
  GitCheckoutInput,
  GitCreateBranchInput,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitCreateWorktreeInput,
  GitInitInput,
  GitListBranchesInput,
  GitListBranchesResult,
  GitPullInput,
  GitPullResult,
  GitPullRequestRefInput,
  GitResolvePullRequestResult,
  GitRemoveWorktreeInput,
  GitRunStackedActionInput,
  GitRunStackedActionResult,
  GitStatusInput,
  GitStatusResult,
} from "./git";
import {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "./terminal";
import { KeybindingRule } from "./keybindings";
import {
  ProjectAgentsFileInput,
  ProjectAgentsFileResult,
  ProjectDraftAgentsFileInput,
  ProjectDraftAgentsFileResult,
  ProjectListCommandTemplatesInput,
  ProjectListCommandTemplatesResult,
  ProjectListSkillsInput,
  ProjectListSkillsResult,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
  ProjectDeleteFileInput,
  ProjectDeleteFileResult,
} from "./project";
import {
  ThreadCompactInput,
  ThreadCompactResult,
  ThreadCreateShareInput,
  ThreadCreateShareResult,
  ThreadGetShareInput,
  ThreadGetShareResult,
  ThreadImportShareInput,
  ThreadImportShareResult,
  ThreadRedoInput,
  ThreadRedoResult,
  ThreadRedoStatusInput,
  ThreadRedoStatusResult,
  ThreadRevokeShareInput,
  ThreadRevokeShareResult,
  ThreadShareStatusInput,
  ThreadShareStatusResult,
  ThreadUndoInput,
  ThreadUndoResult,
} from "./threadFeatures";
import { OpenInEditorInput } from "./editor";
import {
  ServerConfig,
  ServerConfigUpdatedPayload,
  ServerCopilotReasoningProbe,
  ServerCopilotReasoningProbeInput,
  ServerCopilotUsage,
  ServerOpenCodeAddCredentialInput,
  ServerOpenCodeCredentialResult,
  ServerOpenCodeRemoveCredentialInput,
  ServerOpenCodeState,
  ServerOpenCodeStateInput,
  ServerUpsertKeybindingResult,
} from "./server";
import {
  CompressContextNodeInput,
  CompressContextNodeResult,
  CreateContextNodeInput,
  CreateContextNodeResult,
  DeleteContextNodeInput,
  DeleteContextNodeResult,
  GetContextNodeInput,
  GetContextNodeResult,
  ListContextNodesByProjectInput,
  ListContextNodesByProjectResult,
  ListContextNodesByThreadInput,
  ListContextNodesByThreadResult,
  RestoreContextNodeInput,
  RestoreContextNodeResult,
} from "./context";
import {
  CreateFeatureInput,
  CreateFeatureResult,
  DeleteFeatureInput,
  DeleteFeatureResult,
  GetFeatureInput,
  GetFeatureResult,
  ListFeaturesByProjectInput,
  ListFeaturesByProjectResult,
  UpdateFeatureInput,
  UpdateFeatureResult,
  UpdateFeatureStageInput,
  UpdateFeatureStageResult,
} from "./features";
import {
  CreateGoalInput,
  CreateGoalResult,
  DeleteGoalInput,
  DeleteGoalResult,
  GetGoalInput,
  GetGoalResult,
  LinkThreadToGoalInput,
  LinkThreadToGoalResult,
  ListGoalsByProjectInput,
  ListGoalsByProjectResult,
  SetMainGoalInput,
  SetMainGoalResult,
  UnlinkThreadFromGoalInput,
  UnlinkThreadFromGoalResult,
  UpdateGoalTextInput,
  UpdateGoalTextResult,
} from "./goals";

// ── WebSocket RPC Method Names ───────────────────────────────────────

export const WS_METHODS = {
  // Project registry methods
  projectsList: "projects.list",
  projectsAdd: "projects.add",
  projectsRemove: "projects.remove",
  projectsSearchEntries: "projects.searchEntries",
  projectsReadAgentsFile: "projects.readAgentsFile",
  projectsDraftAgentsFile: "projects.draftAgentsFile",
  projectsListCommandTemplates: "projects.listCommandTemplates",
  projectsListSkills: "projects.listSkills",
  projectsWriteFile: "projects.writeFile",
  projectsDeleteFile: "projects.deleteFile",

  // Thread utility methods
  threadsGetShareStatus: "threads.getShareStatus",
  threadsCreateShare: "threads.createShare",
  threadsGetShare: "threads.getShare",
  threadsRevokeShare: "threads.revokeShare",
  threadsImportShare: "threads.importShare",
  threadsCompact: "threads.compact",
  threadsUndo: "threads.undo",
  threadsRedo: "threads.redo",
  threadsGetRedoStatus: "threads.getRedoStatus",

  // Shell methods
  shellOpenInEditor: "shell.openInEditor",

  // Git methods
  gitPull: "git.pull",
  gitStatus: "git.status",
  gitRunStackedAction: "git.runStackedAction",
  gitListBranches: "git.listBranches",
  gitCreateWorktree: "git.createWorktree",
  gitRemoveWorktree: "git.removeWorktree",
  gitCreateBranch: "git.createBranch",
  gitCheckout: "git.checkout",
  gitInit: "git.init",
  gitResolvePullRequest: "git.resolvePullRequest",
  gitPreparePullRequestThread: "git.preparePullRequestThread",

  // Terminal methods
  terminalOpen: "terminal.open",
  terminalWrite: "terminal.write",
  terminalResize: "terminal.resize",
  terminalClear: "terminal.clear",
  terminalRestart: "terminal.restart",
  terminalClose: "terminal.close",

  // Server meta
  serverGetConfig: "server.getConfig",
  serverGetCopilotUsage: "server.getCopilotUsage",
  serverProbeCopilotReasoning: "server.probeCopilotReasoning",
  serverGetOpenCodeState: "server.getOpenCodeState",
  serverUpsertKeybinding: "server.upsertKeybinding",
  serverAddOpenCodeCredential: "server.addOpenCodeCredential",
  serverRemoveOpenCodeCredential: "server.removeOpenCodeCredential",

  // Features methods
  featuresCreate: "features.create",
  featuresGet: "features.get",
  featuresListByProject: "features.listByProject",
  featuresUpdate: "features.update",
  featuresUpdateStage: "features.updateStage",
  featuresDelete: "features.delete",

  // Goals methods
  goalsCreate: "goals.create",
  goalsGet: "goals.get",
  goalsListByProject: "goals.listByProject",
  goalsSetMain: "goals.setMain",
  goalsLinkThread: "goals.linkThread",
  goalsUnlinkThread: "goals.unlinkThread",
  goalsUpdateText: "goals.updateText",
  goalsDelete: "goals.delete",

  // Context methods
  contextCreateNode: "context.createNode",
  contextGetNode: "context.getNode",
  contextListByProject: "context.listByProject",
  contextListByThread: "context.listByThread",
  contextCompressNode: "context.compressNode",
  contextRestoreNode: "context.restoreNode",
  contextDeleteNode: "context.deleteNode",
} as const;

// ── Push Event Channels ──────────────────────────────────────────────

export const WS_CHANNELS = {
  terminalEvent: "terminal.event",
  serverWelcome: "server.welcome",
  serverConfigUpdated: "server.configUpdated",
} as const;

// -- Tagged Union of all request body schemas ─────────────────────────

const tagRequestBody = <const Tag extends string, const Fields extends Schema.Struct.Fields>(
  tag: Tag,
  schema: Schema.Struct<Fields>,
) =>
  schema.mapFields(
    Struct.assign({ _tag: Schema.tag(tag) }),
    // PreserveChecks is safe here. No existing schema should have checks depending on the tag
    { unsafePreserveChecks: true },
  );

const WebSocketRequestBody = Schema.Union([
  // Orchestration methods
  tagRequestBody(
    ORCHESTRATION_WS_METHODS.dispatchCommand,
    Schema.Struct({ command: ClientOrchestrationCommand }),
  ),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getSnapshot, OrchestrationGetSnapshotInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getTurnDiff, OrchestrationGetTurnDiffInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getFullThreadDiff, OrchestrationGetFullThreadDiffInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.replayEvents, OrchestrationReplayEventsInput),

  // Project Search
  tagRequestBody(WS_METHODS.projectsSearchEntries, ProjectSearchEntriesInput),
  tagRequestBody(WS_METHODS.projectsReadAgentsFile, ProjectAgentsFileInput),
  tagRequestBody(WS_METHODS.projectsDraftAgentsFile, ProjectDraftAgentsFileInput),
  tagRequestBody(WS_METHODS.projectsListCommandTemplates, ProjectListCommandTemplatesInput),
  tagRequestBody(WS_METHODS.projectsListSkills, ProjectListSkillsInput),
  tagRequestBody(WS_METHODS.projectsWriteFile, ProjectWriteFileInput),
  tagRequestBody(WS_METHODS.projectsDeleteFile, ProjectDeleteFileInput),

  // Thread utility methods
  tagRequestBody(WS_METHODS.threadsGetShareStatus, ThreadShareStatusInput),
  tagRequestBody(WS_METHODS.threadsCreateShare, ThreadCreateShareInput),
  tagRequestBody(WS_METHODS.threadsGetShare, ThreadGetShareInput),
  tagRequestBody(WS_METHODS.threadsRevokeShare, ThreadRevokeShareInput),
  tagRequestBody(WS_METHODS.threadsImportShare, ThreadImportShareInput),
  tagRequestBody(WS_METHODS.threadsCompact, ThreadCompactInput),
  tagRequestBody(WS_METHODS.threadsUndo, ThreadUndoInput),
  tagRequestBody(WS_METHODS.threadsRedo, ThreadRedoInput),
  tagRequestBody(WS_METHODS.threadsGetRedoStatus, ThreadRedoStatusInput),

  // Shell methods
  tagRequestBody(WS_METHODS.shellOpenInEditor, OpenInEditorInput),

  // Git methods
  tagRequestBody(WS_METHODS.gitPull, GitPullInput),
  tagRequestBody(WS_METHODS.gitStatus, GitStatusInput),
  tagRequestBody(WS_METHODS.gitRunStackedAction, GitRunStackedActionInput),
  tagRequestBody(WS_METHODS.gitListBranches, GitListBranchesInput),
  tagRequestBody(WS_METHODS.gitCreateWorktree, GitCreateWorktreeInput),
  tagRequestBody(WS_METHODS.gitRemoveWorktree, GitRemoveWorktreeInput),
  tagRequestBody(WS_METHODS.gitCreateBranch, GitCreateBranchInput),
  tagRequestBody(WS_METHODS.gitCheckout, GitCheckoutInput),
  tagRequestBody(WS_METHODS.gitInit, GitInitInput),
  tagRequestBody(WS_METHODS.gitResolvePullRequest, GitPullRequestRefInput),
  tagRequestBody(WS_METHODS.gitPreparePullRequestThread, GitPreparePullRequestThreadInput),

  // Terminal methods
  tagRequestBody(WS_METHODS.terminalOpen, TerminalOpenInput),
  tagRequestBody(WS_METHODS.terminalWrite, TerminalWriteInput),
  tagRequestBody(WS_METHODS.terminalResize, TerminalResizeInput),
  tagRequestBody(WS_METHODS.terminalClear, TerminalClearInput),
  tagRequestBody(WS_METHODS.terminalRestart, TerminalRestartInput),
  tagRequestBody(WS_METHODS.terminalClose, TerminalCloseInput),

  // Server meta
  tagRequestBody(WS_METHODS.serverGetConfig, Schema.Struct({})),
  tagRequestBody(WS_METHODS.serverGetCopilotUsage, Schema.Struct({})),
  tagRequestBody(WS_METHODS.serverProbeCopilotReasoning, ServerCopilotReasoningProbeInput),
  tagRequestBody(WS_METHODS.serverGetOpenCodeState, ServerOpenCodeStateInput),
  tagRequestBody(WS_METHODS.serverUpsertKeybinding, KeybindingRule),
  tagRequestBody(WS_METHODS.serverAddOpenCodeCredential, ServerOpenCodeAddCredentialInput),
  tagRequestBody(WS_METHODS.serverRemoveOpenCodeCredential, ServerOpenCodeRemoveCredentialInput),

  // Features methods
  tagRequestBody(WS_METHODS.featuresCreate, CreateFeatureInput),
  tagRequestBody(WS_METHODS.featuresGet, GetFeatureInput),
  tagRequestBody(WS_METHODS.featuresListByProject, ListFeaturesByProjectInput),
  tagRequestBody(WS_METHODS.featuresUpdate, UpdateFeatureInput),
  tagRequestBody(WS_METHODS.featuresUpdateStage, UpdateFeatureStageInput),
  tagRequestBody(WS_METHODS.featuresDelete, DeleteFeatureInput),

  // Goals methods
  tagRequestBody(WS_METHODS.goalsCreate, CreateGoalInput),
  tagRequestBody(WS_METHODS.goalsGet, GetGoalInput),
  tagRequestBody(WS_METHODS.goalsListByProject, ListGoalsByProjectInput),
  tagRequestBody(WS_METHODS.goalsSetMain, SetMainGoalInput),
  tagRequestBody(WS_METHODS.goalsLinkThread, LinkThreadToGoalInput),
  tagRequestBody(WS_METHODS.goalsUnlinkThread, UnlinkThreadFromGoalInput),
  tagRequestBody(WS_METHODS.goalsUpdateText, UpdateGoalTextInput),
  tagRequestBody(WS_METHODS.goalsDelete, DeleteGoalInput),

  // Context methods
  tagRequestBody(WS_METHODS.contextCreateNode, CreateContextNodeInput),
  tagRequestBody(WS_METHODS.contextGetNode, GetContextNodeInput),
  tagRequestBody(WS_METHODS.contextListByProject, ListContextNodesByProjectInput),
  tagRequestBody(WS_METHODS.contextListByThread, ListContextNodesByThreadInput),
  tagRequestBody(WS_METHODS.contextCompressNode, CompressContextNodeInput),
  tagRequestBody(WS_METHODS.contextRestoreNode, RestoreContextNodeInput),
  tagRequestBody(WS_METHODS.contextDeleteNode, DeleteContextNodeInput),
]);

export const WebSocketRequest = Schema.Struct({
  id: TrimmedNonEmptyString,
  body: WebSocketRequestBody,
});
export type WebSocketRequest = typeof WebSocketRequest.Type;

export const WebSocketResponse = Schema.Struct({
  id: TrimmedNonEmptyString,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(
    Schema.Struct({
      message: Schema.String,
    }),
  ),
});
export type WebSocketResponse = typeof WebSocketResponse.Type;

export const WsPushSequence = NonNegativeInt;
export type WsPushSequence = typeof WsPushSequence.Type;

export const WsWelcomePayload = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  projectName: TrimmedNonEmptyString,
  bootstrapProjectId: Schema.optional(ProjectId),
  bootstrapThreadId: Schema.optional(ThreadId),
});
export type WsWelcomePayload = typeof WsWelcomePayload.Type;

export interface WsPushPayloadByChannel {
  readonly [WS_CHANNELS.serverWelcome]: WsWelcomePayload;
  readonly [WS_CHANNELS.serverConfigUpdated]: typeof ServerConfigUpdatedPayload.Type;
  readonly [WS_CHANNELS.terminalEvent]: typeof TerminalEvent.Type;
  readonly [ORCHESTRATION_WS_CHANNELS.domainEvent]: OrchestrationEvent;
}

export type WsPushChannel = keyof WsPushPayloadByChannel;
export type WsPushData<C extends WsPushChannel> = WsPushPayloadByChannel[C];

const makeWsPushSchema = <const Channel extends string, Payload extends Schema.Schema<any>>(
  channel: Channel,
  payload: Payload,
) =>
  Schema.Struct({
    type: Schema.Literal("push"),
    sequence: WsPushSequence,
    channel: Schema.Literal(channel),
    data: payload,
  });

export const WsPushServerWelcome = makeWsPushSchema(WS_CHANNELS.serverWelcome, WsWelcomePayload);
export const WsPushServerConfigUpdated = makeWsPushSchema(
  WS_CHANNELS.serverConfigUpdated,
  ServerConfigUpdatedPayload,
);
export const WsPushTerminalEvent = makeWsPushSchema(WS_CHANNELS.terminalEvent, TerminalEvent);
export const WsPushOrchestrationDomainEvent = makeWsPushSchema(
  ORCHESTRATION_WS_CHANNELS.domainEvent,
  OrchestrationEvent,
);

export const WsPushChannelSchema = Schema.Literals([
  WS_CHANNELS.serverWelcome,
  WS_CHANNELS.serverConfigUpdated,
  WS_CHANNELS.terminalEvent,
  ORCHESTRATION_WS_CHANNELS.domainEvent,
]);
export type WsPushChannelSchema = typeof WsPushChannelSchema.Type;

export const WsPush = Schema.Union([
  WsPushServerWelcome,
  WsPushServerConfigUpdated,
  WsPushTerminalEvent,
  WsPushOrchestrationDomainEvent,
]);
export type WsPush = typeof WsPush.Type;

export type WsPushMessage<C extends WsPushChannel> = Extract<WsPush, { channel: C }>;

export const WsPushEnvelopeBase = Schema.Struct({
  type: Schema.Literal("push"),
  sequence: WsPushSequence,
  channel: WsPushChannelSchema,
  data: Schema.Unknown,
});
export type WsPushEnvelopeBase = typeof WsPushEnvelopeBase.Type;

// ── Union of all server → client messages ─────────────────────────────

export const WsResponse = Schema.Union([WebSocketResponse, WsPush]);
export type WsResponse = typeof WsResponse.Type;

export const WsRpcResultSchemaByMethod = {
  [ORCHESTRATION_WS_METHODS.dispatchCommand]: DispatchResult,
  [ORCHESTRATION_WS_METHODS.getSnapshot]: OrchestrationGetSnapshotResult,
  [ORCHESTRATION_WS_METHODS.getTurnDiff]: OrchestrationGetTurnDiffResult,
  [ORCHESTRATION_WS_METHODS.getFullThreadDiff]: OrchestrationGetFullThreadDiffResult,
  [ORCHESTRATION_WS_METHODS.replayEvents]: OrchestrationReplayEventsResult,
  [WS_METHODS.projectsSearchEntries]: ProjectSearchEntriesResult,
  [WS_METHODS.projectsReadAgentsFile]: ProjectAgentsFileResult,
  [WS_METHODS.projectsDraftAgentsFile]: ProjectDraftAgentsFileResult,
  [WS_METHODS.projectsListCommandTemplates]: ProjectListCommandTemplatesResult,
  [WS_METHODS.projectsListSkills]: ProjectListSkillsResult,
  [WS_METHODS.projectsWriteFile]: ProjectWriteFileResult,
  [WS_METHODS.projectsDeleteFile]: ProjectDeleteFileResult,
  [WS_METHODS.threadsGetShareStatus]: ThreadShareStatusResult,
  [WS_METHODS.threadsCreateShare]: ThreadCreateShareResult,
  [WS_METHODS.threadsGetShare]: ThreadGetShareResult,
  [WS_METHODS.threadsRevokeShare]: ThreadRevokeShareResult,
  [WS_METHODS.threadsImportShare]: ThreadImportShareResult,
  [WS_METHODS.threadsCompact]: ThreadCompactResult,
  [WS_METHODS.threadsUndo]: ThreadUndoResult,
  [WS_METHODS.threadsRedo]: ThreadRedoResult,
  [WS_METHODS.threadsGetRedoStatus]: ThreadRedoStatusResult,
  [WS_METHODS.shellOpenInEditor]: Schema.Void,
  [WS_METHODS.gitPull]: GitPullResult,
  [WS_METHODS.gitStatus]: GitStatusResult,
  [WS_METHODS.gitRunStackedAction]: GitRunStackedActionResult,
  [WS_METHODS.gitListBranches]: GitListBranchesResult,
  [WS_METHODS.gitCreateWorktree]: GitCreateWorktreeResult,
  [WS_METHODS.gitRemoveWorktree]: Schema.Void,
  [WS_METHODS.gitCreateBranch]: Schema.Void,
  [WS_METHODS.gitCheckout]: Schema.Void,
  [WS_METHODS.gitInit]: Schema.Void,
  [WS_METHODS.gitResolvePullRequest]: GitResolvePullRequestResult,
  [WS_METHODS.gitPreparePullRequestThread]: GitPreparePullRequestThreadResult,
  [WS_METHODS.terminalOpen]: TerminalSessionSnapshot,
  [WS_METHODS.terminalWrite]: Schema.Void,
  [WS_METHODS.terminalResize]: Schema.Void,
  [WS_METHODS.terminalClear]: Schema.Void,
  [WS_METHODS.terminalRestart]: TerminalSessionSnapshot,
  [WS_METHODS.terminalClose]: Schema.Void,
  [WS_METHODS.serverGetConfig]: ServerConfig,
  [WS_METHODS.serverGetCopilotUsage]: ServerCopilotUsage,
  [WS_METHODS.serverProbeCopilotReasoning]: ServerCopilotReasoningProbe,
  [WS_METHODS.serverGetOpenCodeState]: ServerOpenCodeState,
  [WS_METHODS.serverUpsertKeybinding]: ServerUpsertKeybindingResult,
  [WS_METHODS.serverAddOpenCodeCredential]: ServerOpenCodeCredentialResult,
  [WS_METHODS.serverRemoveOpenCodeCredential]: ServerOpenCodeCredentialResult,

  // Features methods
  [WS_METHODS.featuresCreate]: CreateFeatureResult,
  [WS_METHODS.featuresGet]: GetFeatureResult,
  [WS_METHODS.featuresListByProject]: ListFeaturesByProjectResult,
  [WS_METHODS.featuresUpdate]: UpdateFeatureResult,
  [WS_METHODS.featuresUpdateStage]: UpdateFeatureStageResult,
  [WS_METHODS.featuresDelete]: DeleteFeatureResult,

  // Goals methods
  [WS_METHODS.goalsCreate]: CreateGoalResult,
  [WS_METHODS.goalsGet]: GetGoalResult,
  [WS_METHODS.goalsListByProject]: ListGoalsByProjectResult,
  [WS_METHODS.goalsSetMain]: SetMainGoalResult,
  [WS_METHODS.goalsLinkThread]: LinkThreadToGoalResult,
  [WS_METHODS.goalsUnlinkThread]: UnlinkThreadFromGoalResult,
  [WS_METHODS.goalsUpdateText]: UpdateGoalTextResult,
  [WS_METHODS.goalsDelete]: DeleteGoalResult,

  // Context methods
  [WS_METHODS.contextCreateNode]: CreateContextNodeResult,
  [WS_METHODS.contextGetNode]: GetContextNodeResult,
  [WS_METHODS.contextListByProject]: ListContextNodesByProjectResult,
  [WS_METHODS.contextListByThread]: ListContextNodesByThreadResult,
  [WS_METHODS.contextCompressNode]: CompressContextNodeResult,
  [WS_METHODS.contextRestoreNode]: RestoreContextNodeResult,
  [WS_METHODS.contextDeleteNode]: DeleteContextNodeResult,
} as const;

export type WsRpcMethod = keyof typeof WsRpcResultSchemaByMethod;
