import {
  type ApprovalRequestId,
  DEFAULT_MODEL_BY_PROVIDER,
  EDITORS,
  type EditorId,
  type KeybindingCommand,
  type MessageId,
  type ProjectCommandTemplate,
  type ProjectId,
  type ProjectEntry,
  type ProjectSkill,
  type ProjectSkillIssue,
  type ProjectSkillName,
  type ProjectScript,
  type ModelSlug,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type ResolvedKeybindingsConfig,
  type ProviderApprovalDecision,
  type ServerOpenCodeState,
  type ServerProviderMcpStatus,
  type ServerProviderStatus,
  type ProviderKind,
  type ProviderReasoningLevel,
  type ThreadForkSource,
  type ThreadId,
  type ThreadShareSummary,
  type TurnId,
  OrchestrationThreadActivity,
  OPENROUTER_FREE_ROUTER_MODEL,
  RuntimeMode,
  ProviderInteractionMode,
} from "@t3tools/contracts";
import {
  getDefaultModel,
  getModelDisplayName,
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  isCodexOpenRouterModel,
  normalizeModelSlug,
} from "@t3tools/shared/model";
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useId,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  gitBranchesQueryOptions,
  gitCreateWorktreeMutationOptions,
  gitRemoveWorktreeMutationOptions,
} from "~/lib/gitReactQuery";
import { openRouterFreeModelsQueryOptions } from "~/lib/openRouterReactQuery";
import {
  projectAgentsFileQueryOptions,
  projectCommandTemplatesQueryOptions,
  projectQueryKeys,
  projectSkillsQueryOptions,
  projectSearchEntriesQueryOptions,
} from "~/lib/projectReactQuery";
import {
  invalidateThreadQueries,
  threadCompactMutationOptions,
  threadCreateShareMutationOptions,
  threadRedoMutationOptions,
  threadRedoStatusQueryOptions,
  threadRevokeShareMutationOptions,
  threadShareStatusQueryOptions,
  threadUndoMutationOptions,
} from "~/lib/threadReactQuery";
import {
  serverConfigQueryOptions,
  serverCopilotReasoningProbeQueryOptions,
  serverOpenCodeStateQueryOptions,
  serverQueryKeys,
} from "~/lib/serverReactQuery";
import {
  describeContextWindowState,
  getDocumentedContextWindowOverride,
  shouldHideContextWindowForModel,
} from "~/lib/contextWindow";
import {
  isCut3CompatibleOpenRouterModelOption,
  isOpenRouterGuaranteedFreeSlug,
  supportsOpenRouterNativeToolCalling,
  supportsOpenRouterReasoningEffortControl,
} from "~/lib/openRouterModels";
import { getModelPickerOptionDisplayParts } from "~/lib/modelPickerOptionDisplay";
import { buildRecentModelSelection, prioritizeModelOptions } from "~/lib/modelPreferences";
import {
  type PickerModelOption,
  mergeModelOptions,
  getModelOptionsForProviderPicker,
  findModelOptionBySlug,
  getModelOptionContextLabel,
  getProviderPickerSectionDescription,
} from "~/lib/modelPickerHelpers";
import { buildComposerMcpServerItems, providerSupportsMcp } from "../mcpServers";
import { buildModelOptionsForSend } from "../chatDispatchOptions";

import { isElectron } from "../env";
import { parseDiffRouteSearch, stripDiffSearchParams } from "../diffRouteSearch";
import {
  clampCollapsedComposerCursor,
  type ComposerSlashCommand,
  type ComposerTrigger,
  type ComposerTriggerKind,
  collapseExpandedComposerCursor,
  detectComposerTrigger,
  expandCollapsedComposerCursor,
  getComposerSlashCommandAliases,
  parseStandaloneComposerSlashInvocation,
  parseStandaloneComposerSlashCommand,
  replaceTextRange,
} from "../composer-logic";
import {
  deriveConfiguredModelOptions,
  deriveConfiguredReasoningState,
  deriveInterruptTurnId,
  deriveLatestModelRerouteNotice,
  derivePendingApprovals,
  derivePendingUserInputs,
  derivePhase,
  deriveThreadTasks,
  deriveTimelineEntries,
  deriveActiveWorkStartedAt,
  deriveActivePlanState,
  getProviderPickerBackingProvider,
  getProviderPickerKindForSelection,
  findLatestProposedPlan,
  type AvailableProviderPickerKind,
  type LatestModelRerouteNotice,
  type PendingApproval,
  type PendingUserInput,
  deriveWorkLogEntries,
  hasToolActivityForTurn,
  isLatestTurnSettled,
  formatElapsed,
} from "../session-logic";
import { isScrollContainerNearBottom } from "../chat-scroll";
import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  setPendingUserInputCustomAnswer,
  type PendingUserInputDraftAnswer,
} from "../pendingUserInput";
import {
  findProviderStatus,
  getDefaultProviderStatusMessage,
  getProviderStatusModelOptions,
  getProviderStatusTitle,
  resolveVisibleProviderStatusForChat,
} from "../providerStatus";
import { useStore } from "../store";
import {
  buildPlanImplementationThreadTitle,
  buildPlanImplementationPrompt,
  proposedPlanTitle,
  resolvePlanFollowUpSubmission,
} from "../proposedPlan";
import { getPlanUiCopy } from "../planUiCopy";
import { truncateTitle } from "../truncateTitle";
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  DEFAULT_THREAD_TERMINAL_ID,
  MAX_TERMINALS_PER_GROUP,
  type ChatMessage,
  type Thread,
  type TurnDiffSummary,
} from "../types";
import { basenameOfPath, getVscodeIconUrlForEntry } from "../vscode-icons";
import { useTheme } from "../hooks/useTheme";
import { useChatBackgroundImage } from "../hooks/useChatBackgroundImage";
import { useTurnDiffSummaries } from "../hooks/useTurnDiffSummaries";
import { useNewThreadActions } from "../hooks/useNewThread";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import BranchToolbar from "./BranchToolbar";
import GitActionsControl from "./GitActionsControl";
import {
  isOpenFavoriteEditorShortcut,
  resolveShortcutCommand,
  shortcutLabelForCommand,
} from "../keybindings";
import PlanSidebar from "./PlanSidebar";
import ThreadTerminalDrawer from "./ThreadTerminalDrawer";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./ui/alert";
import {
  BotIcon,
  RefreshCwIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  FileIcon,
  FolderIcon,
  DiffIcon,
  EllipsisIcon,
  FolderClosedIcon,
  ListTodoIcon,
  LockIcon,
  LockOpenIcon,
  PaperclipIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
  ZapIcon,
  CheckIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Share2Icon,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { Group, GroupSeparator } from "./ui/group";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuShortcut,
  MenuTrigger,
} from "./ui/menu";
import { CursorIcon, Icon, VisualStudioCode, VisualStudioCodeInsiders, Zed } from "./Icons";
import { cn, isMacPlatform, isWindowsPlatform, randomUUID } from "~/lib/utils";
import { Badge } from "./ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { Command, CommandItem, CommandList } from "./ui/command";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Switch } from "./ui/switch";
import { toastManager } from "./ui/toast";
import { decodeProjectScriptKeybindingRule } from "~/lib/projectScriptKeybindings";
import ProjectScriptsControl, { type NewProjectScriptInput } from "./ProjectScriptsControl";
import { MessagesTimeline } from "./chat/MessagesTimeline";
import {
  ProviderModelPicker,
  PROVIDER_ICON_BY_PROVIDER,
  AVAILABLE_PROVIDER_OPTIONS,
  UNAVAILABLE_PROVIDER_OPTIONS,
  COMING_SOON_PROVIDER_OPTIONS,
} from "./chat/ProviderModelPicker";
import { ThreadTasksPanel } from "./chat/ThreadTasksPanel";
import { EmptyChatOnboarding } from "./chat/EmptyChatOnboarding";
import { ThreadExportDialog } from "./chat/ThreadExportDialog";
import { ThreadShareDialog } from "./chat/ThreadShareDialog";
import { ComposerSkillPicker } from "./chat/ComposerSkillPicker";
import { UsageDashboardDialog } from "./chat/UsageDashboardDialog";
import {
  commandForProjectScript,
  nextProjectScriptId,
  projectScriptRuntimeEnv,
  projectScriptIdFromCommand,
  setupProjectScript,
} from "~/projectScripts";
import { Toggle } from "./ui/toggle";
import ThreadNewButton from "./ThreadNewButton";
import ThreadSidebarToggle from "./ThreadSidebarToggle";
import { newCommandId, newMessageId, newThreadId } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import {
  getAppModelOptions,
  type AppSettings,
  resolveAppModelSelection,
  resolveAppServiceTier,
  shouldShowFastTierIcon,
  type AppServiceTier,
  useAppSettings,
} from "../appSettings";
import { type AppLanguage } from "../appLanguage";
import { isTerminalFocused } from "../lib/terminalFocus";
import {
  type ComposerImageAttachment,
  type DraftThreadEnvMode,
  type DraftThreadState,
  type PersistedComposerImageAttachment,
  useComposerDraftStore,
  useComposerThreadDraft,
} from "../composerDraftStore";
import { shouldUseCompactComposerFooter } from "./composerFooterLayout";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { type QueuedThreadTurn, useThreadSendQueueStore } from "../threadSendQueue";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "./ComposerPromptEditor";
import { PullRequestThreadDialog } from "./PullRequestThreadDialog";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import {
  canCreateThreadShareLink,
  canOpenThreadShareDialog,
  shouldAutoCreateThreadShare,
} from "~/lib/threadShareMode";
import {
  LastInvokedScriptByProjectSchema,
  resolveComposerEffortForProvider,
} from "./ChatView.logic";
import {
  expandProjectCommandTemplate,
  resolveProjectCommandTemplate,
  type ProjectCommandTemplateOverrides,
} from "../projectCommandTemplates";
import {
  buildThreadExportContents,
  buildThreadExportFilename,
  downloadThreadExportFile,
  type ThreadExportFormat,
} from "../threadExport";
import {
  buildForkedThreadTitle,
  resolveForkThreadDraftSettings,
  resolveLatestThreadForkSource,
} from "../threadForking";
import {
  parseLatestResumeContextActivity,
  parseLatestThreadImportActivity,
  parseLatestThreadSkillsActivity,
} from "../threadActivityMetadata";
import { findMatchingApprovalRule, type ApprovalRule } from "../approvalRules";
import { formatTimestamp } from "../timestampFormat";
import { showTurnCompleteNotification } from "../notifications";

const LAST_EDITOR_KEY = "cut3:last-editor";
const LAST_INVOKED_SCRIPT_BY_PROJECT_KEY = "cut3:last-invoked-script-by-project";
const ATTACHMENT_PREVIEW_HANDOFF_TTL_MS = 5000;
const IMAGE_SIZE_LIMIT_LABEL = `${Math.round(PROVIDER_SEND_TURN_MAX_IMAGE_BYTES / (1024 * 1024))}MB`;
const IMAGE_ONLY_BOOTSTRAP_PROMPT =
  "[User attached one or more images without additional text. Respond using the conversation context and the attached image(s).]";
const EMPTY_QUEUED_TURNS: QueuedThreadTurn[] = [];
Object.freeze(EMPTY_QUEUED_TURNS);
const EMPTY_ACTIVITIES: OrchestrationThreadActivity[] = [];
const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];
const EMPTY_PROJECT_ENTRIES: ProjectEntry[] = [];
const EMPTY_PROJECT_COMMAND_TEMPLATES: ProjectCommandTemplate[] = [];
const EMPTY_PROJECT_SKILLS: ProjectSkill[] = [];
const EMPTY_PROJECT_SKILL_ISSUES: ProjectSkillIssue[] = [];
const EMPTY_AVAILABLE_EDITORS: EditorId[] = [];
const EMPTY_PROVIDER_STATUSES: ServerProviderStatus[] = [];
const EMPTY_PROVIDER_MCP_STATUSES: ServerProviderMcpStatus[] = [];
const EMPTY_PROVIDER_STATUS_MODEL_OPTIONS_BY_PROVIDER = {
  codex: [],
  copilot: [],
  kimi: [],
  opencode: [],
  pi: [],
} as const satisfies Record<ProviderKind, ReadonlyArray<PickerModelOption>>;
const EMPTY_PENDING_USER_INPUT_ANSWERS: Record<string, PendingUserInputDraftAnswer> = {};
const COMPOSER_PATH_QUERY_DEBOUNCE_MS = 120;
const SCRIPT_TERMINAL_COLS = 120;
const SCRIPT_TERMINAL_ROWS = 30;
const WORKTREE_BRANCH_PREFIX = "cut3";

function buildProviderOptionsForDispatch(input: {
  readonly provider: ProviderKind;
  readonly settings: {
    readonly codexBinaryPath: string;
    readonly codexHomePath: string;
    readonly openRouterApiKey: string;
    readonly copilotBinaryPath: string;
    readonly opencodeBinaryPath: string;
    readonly kimiBinaryPath: string;
    readonly kimiApiKey: string;
  };
}) {
  const codexBinaryPath = input.settings.codexBinaryPath.trim();
  const codexHomePath = input.settings.codexHomePath.trim();
  const openRouterApiKey = input.settings.openRouterApiKey.trim();
  const copilotBinaryPath = input.settings.copilotBinaryPath.trim();
  const opencodeBinaryPath = input.settings.opencodeBinaryPath.trim();
  const kimiBinaryPath = input.settings.kimiBinaryPath.trim();
  const kimiApiKey = input.settings.kimiApiKey.trim();

  switch (input.provider) {
    case "codex":
      return codexBinaryPath || codexHomePath || openRouterApiKey
        ? {
            codex: {
              ...(codexBinaryPath ? { binaryPath: codexBinaryPath } : {}),
              ...(codexHomePath ? { homePath: codexHomePath } : {}),
              ...(openRouterApiKey ? { openRouterApiKey } : {}),
            },
          }
        : undefined;
    case "copilot":
      return copilotBinaryPath
        ? {
            copilot: {
              binaryPath: copilotBinaryPath,
            },
          }
        : undefined;
    case "opencode":
      return opencodeBinaryPath || openRouterApiKey
        ? {
            opencode: {
              ...(opencodeBinaryPath ? { binaryPath: opencodeBinaryPath } : {}),
              ...(openRouterApiKey ? { openRouterApiKey } : {}),
            },
          }
        : undefined;
    case "kimi":
      return kimiBinaryPath || kimiApiKey
        ? {
            kimi: {
              ...(kimiBinaryPath ? { binaryPath: kimiBinaryPath } : {}),
              ...(kimiApiKey ? { apiKey: kimiApiKey } : {}),
            },
          }
        : undefined;
    case "pi":
      return undefined;
    default:
      return undefined;
  }
}

function getCustomModelsForProvider(
  provider: ProviderKind,
  settings: ProviderCustomModelSettings,
): readonly string[] {
  switch (provider) {
    case "codex":
      return settings.customCodexModels;
    case "copilot":
      return settings.customCopilotModels;
    case "opencode":
      return settings.customOpencodeModels;
    case "kimi":
      return settings.customKimiModels;
    case "pi":
      return settings.customPiModels;
    default:
      return settings.customCodexModels;
  }
}

type ProviderCustomModelSettings = {
  readonly customCodexModels: readonly string[];
  readonly customCopilotModels: readonly string[];
  readonly customOpencodeModels: readonly string[];
  readonly customKimiModels: readonly string[];
  readonly customPiModels: readonly string[];
};

type ProviderFavoriteModelSettings = Pick<
  AppSettings,
  | "favoriteCodexModels"
  | "favoriteCopilotModels"
  | "favoriteOpencodeModels"
  | "favoriteKimiModels"
  | "favoritePiModels"
>;

type ProviderRecentModelSettings = Pick<
  AppSettings,
  | "recentCodexModels"
  | "recentCopilotModels"
  | "recentOpencodeModels"
  | "recentKimiModels"
  | "recentPiModels"
>;

type ProviderHiddenModelSettings = Pick<
  AppSettings,
  | "hiddenCodexModels"
  | "hiddenCopilotModels"
  | "hiddenOpencodeModels"
  | "hiddenKimiModels"
  | "hiddenPiModels"
>;

function getFavoriteModelsForProvider(
  provider: ProviderKind,
  settings: ProviderFavoriteModelSettings,
): readonly string[] {
  switch (provider) {
    case "codex":
      return settings.favoriteCodexModels;
    case "copilot":
      return settings.favoriteCopilotModels;
    case "opencode":
      return settings.favoriteOpencodeModels;
    case "kimi":
      return settings.favoriteKimiModels;
    case "pi":
      return settings.favoritePiModels;
    default:
      return settings.favoriteCodexModels;
  }
}

function getRecentModelsForProvider(
  provider: ProviderKind,
  settings: ProviderRecentModelSettings,
): readonly string[] {
  switch (provider) {
    case "codex":
      return settings.recentCodexModels;
    case "copilot":
      return settings.recentCopilotModels;
    case "opencode":
      return settings.recentOpencodeModels;
    case "kimi":
      return settings.recentKimiModels;
    case "pi":
      return settings.recentPiModels;
    default:
      return settings.recentCodexModels;
  }
}

function getHiddenModelsForProvider(
  provider: ProviderKind,
  settings: ProviderHiddenModelSettings,
): readonly string[] {
  switch (provider) {
    case "codex":
      return settings.hiddenCodexModels;
    case "copilot":
      return settings.hiddenCopilotModels;
    case "opencode":
      return settings.hiddenOpencodeModels;
    case "kimi":
      return settings.hiddenKimiModels;
    case "pi":
      return settings.hiddenPiModels;
    default:
      return settings.hiddenCodexModels;
  }
}

function patchFavoriteModels(
  provider: ProviderKind,
  favoriteModels: readonly string[],
): Partial<AppSettings> {
  switch (provider) {
    case "codex":
      return { favoriteCodexModels: [...favoriteModels] };
    case "copilot":
      return { favoriteCopilotModels: [...favoriteModels] };
    case "opencode":
      return { favoriteOpencodeModels: [...favoriteModels] };
    case "kimi":
      return { favoriteKimiModels: [...favoriteModels] };
    case "pi":
      return { favoritePiModels: [...favoriteModels] };
    default:
      return { favoriteCodexModels: [...favoriteModels] };
  }
}

function patchRecentModels(
  provider: ProviderKind,
  recentModels: readonly string[],
): Partial<AppSettings> {
  switch (provider) {
    case "codex":
      return { recentCodexModels: [...recentModels] };
    case "copilot":
      return { recentCopilotModels: [...recentModels] };
    case "opencode":
      return { recentOpencodeModels: [...recentModels] };
    case "kimi":
      return { recentKimiModels: [...recentModels] };
    case "pi":
      return { recentPiModels: [...recentModels] };
    default:
      return { recentCodexModels: [...recentModels] };
  }
}

function patchHiddenModels(
  provider: ProviderKind,
  hiddenModels: readonly string[],
): Partial<AppSettings> {
  switch (provider) {
    case "codex":
      return { hiddenCodexModels: [...hiddenModels] };
    case "copilot":
      return { hiddenCopilotModels: [...hiddenModels] };
    case "opencode":
      return { hiddenOpencodeModels: [...hiddenModels] };
    case "kimi":
      return { hiddenKimiModels: [...hiddenModels] };
    case "pi":
      return { hiddenPiModels: [...hiddenModels] };
    default:
      return { hiddenCodexModels: [...hiddenModels] };
  }
}

function filterHiddenModelOptions(
  options: ReadonlyArray<PickerModelOption>,
  hiddenModels: readonly string[],
): ReadonlyArray<PickerModelOption> {
  if (hiddenModels.length === 0) {
    return options;
  }

  const hiddenModelSet = new Set(hiddenModels);
  return options.filter((option) => !hiddenModelSet.has(option.slug));
}

interface ExpandedImageItem {
  src: string;
  name: string;
}

interface ExpandedImagePreview {
  images: ExpandedImageItem[];
  index: number;
}

function buildExpandedImagePreview(
  images: ReadonlyArray<{ id: string; name: string; previewUrl?: string }>,
  selectedImageId: string,
): ExpandedImagePreview | null {
  const previewableImages = images.flatMap((image) =>
    image.previewUrl ? [{ id: image.id, src: image.previewUrl, name: image.name }] : [],
  );
  if (previewableImages.length === 0) {
    return null;
  }
  const selectedIndex = previewableImages.findIndex((image) => image.id === selectedImageId);
  if (selectedIndex < 0) {
    return null;
  }
  return {
    images: previewableImages.map((image) => ({ src: image.src, name: image.name })),
    index: selectedIndex,
  };
}

function buildLocalDraftThread(
  threadId: ThreadId,
  draftThread: DraftThreadState,
  fallbackModel: string,
  error: string | null,
): Thread {
  return {
    id: threadId,
    codexThreadId: null,
    projectId: draftThread.projectId,
    title: "New thread",
    model: fallbackModel,
    runtimeMode: draftThread.runtimeMode,
    interactionMode: draftThread.interactionMode,
    session: null,
    messages: [],
    error,
    createdAt: draftThread.createdAt,
    updatedAt: draftThread.createdAt,
    latestTurn: null,
    lastVisitedAt: draftThread.createdAt,
    branch: draftThread.branch,
    worktreePath: draftThread.worktreePath,
    turnDiffSummaries: [],
    activities: [],
    proposedPlans: [],
  };
}

function revokeBlobPreviewUrl(previewUrl: string | undefined): void {
  if (!previewUrl || typeof URL === "undefined" || !previewUrl.startsWith("blob:")) {
    return;
  }
  URL.revokeObjectURL(previewUrl);
}

function revokeUserMessagePreviewUrls(message: ChatMessage): void {
  if (message.role !== "user" || !message.attachments) {
    return;
  }
  for (const attachment of message.attachments) {
    if (attachment.type !== "image") {
      continue;
    }
    revokeBlobPreviewUrl(attachment.previewUrl);
  }
}

function collectUserMessageBlobPreviewUrls(message: ChatMessage): string[] {
  if (message.role !== "user" || !message.attachments) {
    return [];
  }
  const previewUrls: string[] = [];
  for (const attachment of message.attachments) {
    if (attachment.type !== "image") continue;
    if (!attachment.previewUrl || !attachment.previewUrl.startsWith("blob:")) continue;
    previewUrls.push(attachment.previewUrl);
  }
  return previewUrls;
}

type ComposerCommandItem =
  | {
      id: string;
      type: "path";
      path: string;
      pathKind: ProjectEntry["kind"];
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "slash-command";
      command: ComposerSlashCommand;
      label: string;
      description: string;
      aliases?: ReadonlyArray<string>;
    }
  | {
      id: string;
      type: "template";
      template: ProjectCommandTemplate;
      label: string;
      description: string;
      sendImmediately: boolean;
    }
  | {
      id: string;
      type: "model";
      provider: ProviderKind;
      model: ModelSlug;
      label: string;
      description: string;
      showFastBadge: boolean;
    }
  | {
      id: string;
      type: "mcp-server";
      provider: ProviderKind;
      serverName: string;
      state: "enabled" | "disabled";
      label: string;
      description: string;
    };

type SendPhase = "idle" | "preparing-worktree" | "sending-turn";

interface PullRequestDialogState {
  initialReference: string | null;
  key: number;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image data."));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read image."));
    });
    reader.readAsDataURL(file);
  });
}

function buildTemporaryWorktreeBranchName(): string {
  // Keep the 8-hex suffix shape for backend temporary-branch detection.
  const token = randomUUID().slice(0, 8).toLowerCase();
  return `${WORKTREE_BRANCH_PREFIX}/${token}`;
}

function cloneComposerImageForRetry(image: ComposerImageAttachment): ComposerImageAttachment {
  if (typeof URL === "undefined" || !image.previewUrl.startsWith("blob:")) {
    return image;
  }
  try {
    return {
      ...image,
      previewUrl: URL.createObjectURL(image.file),
    };
  } catch {
    return image;
  }
}

const VscodeEntryIcon = memo(function VscodeEntryIcon(props: {
  pathValue: string;
  kind: "file" | "directory";
  theme: "light" | "dark";
  className?: string;
}) {
  const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null);
  const iconUrl = useMemo(
    () => getVscodeIconUrlForEntry(props.pathValue, props.kind, props.theme),
    [props.kind, props.pathValue, props.theme],
  );
  const failed = failedIconUrl === iconUrl;

  if (failed) {
    return props.kind === "directory" ? (
      <FolderIcon className={cn("size-4 text-muted-foreground/80", props.className)} />
    ) : (
      <FileIcon className={cn("size-4 text-muted-foreground/80", props.className)} />
    );
  }

  return (
    <img
      src={iconUrl}
      alt=""
      aria-hidden="true"
      className={cn("size-4 shrink-0", props.className)}
      loading="lazy"
      onError={() => setFailedIconUrl(iconUrl)}
    />
  );
});

const ComposerCommandMenuItem = memo(function ComposerCommandMenuItem(props: {
  item: ComposerCommandItem;
  resolvedTheme: "light" | "dark";
  isActive: boolean;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  return (
    <CommandItem
      value={props.item.id}
      className={cn(
        "cursor-pointer select-none gap-2",
        props.isActive && "bg-accent text-accent-foreground",
      )}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        props.onSelect(props.item);
      }}
    >
      {props.item.type === "path" ? (
        <VscodeEntryIcon
          pathValue={props.item.path}
          kind={props.item.pathKind}
          theme={props.resolvedTheme}
        />
      ) : null}
      {props.item.type === "slash-command" ? (
        <BotIcon className="size-4 text-muted-foreground/80" />
      ) : null}
      {props.item.type === "template" ? (
        <BotIcon className="size-4 text-muted-foreground/80" />
      ) : null}
      {props.item.type === "model" ? (
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          model
        </Badge>
      ) : null}
      {props.item.type === "mcp-server" ? (
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          mcp
        </Badge>
      ) : null}
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {props.item.type === "model" && props.item.showFastBadge ? (
          <ZapIcon className="size-3.5 shrink-0 text-amber-500" />
        ) : null}
        <span className="truncate">{props.item.label}</span>
        {props.item.type === "mcp-server" ? (
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 px-1.5 py-0 text-[10px]",
              props.item.state === "enabled"
                ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                : "text-muted-foreground/80",
            )}
          >
            {props.item.state}
          </Badge>
        ) : null}
        {props.item.type === "template" && props.item.sendImmediately ? (
          <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
            send
          </Badge>
        ) : null}
      </span>
      <span className="truncate text-muted-foreground/70 text-xs">{props.item.description}</span>
    </CommandItem>
  );
});

const ComposerCommandMenu = memo(function ComposerCommandMenu(props: {
  items: ComposerCommandItem[];
  resolvedTheme: "light" | "dark";
  isLoading: boolean;
  triggerKind: ComposerTriggerKind | null;
  mcpSupported: boolean;
  activeItemId: string | null;
  onHighlightedItemChange: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  return (
    <Command
      mode="none"
      onItemHighlighted={(highlightedValue) => {
        props.onHighlightedItemChange(
          typeof highlightedValue === "string" ? highlightedValue : null,
        );
      }}
    >
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-popover/96 shadow-lg/8 backdrop-blur-xs">
        <CommandList className="max-h-64">
          {props.items.map((item) => (
            <ComposerCommandMenuItem
              key={item.id}
              item={item}
              resolvedTheme={props.resolvedTheme}
              isActive={props.activeItemId === item.id}
              onSelect={props.onSelect}
            />
          ))}
        </CommandList>
        {props.items.length === 0 && (
          <p className="px-3 py-2 text-muted-foreground/70 text-xs">
            {props.isLoading
              ? "Searching workspace files..."
              : props.triggerKind === "path"
                ? "No matching files or folders."
                : props.triggerKind === "slash-mcp"
                  ? props.mcpSupported
                    ? "No MCP servers configured for this provider."
                    : "MCP server browsing is not available for this provider."
                  : "No matching command."}
          </p>
        )}
      </div>
    </Command>
  );
});

const extendReplacementRangeForTrailingSpace = (
  text: string,
  rangeEnd: number,
  replacement: string,
): number => {
  if (!replacement.endsWith(" ")) {
    return rangeEnd;
  }
  return text[rangeEnd] === " " ? rangeEnd + 1 : rangeEnd;
};

interface ChatViewProps {
  threadId: ThreadId;
}

export default function ChatView({ threadId }: ChatViewProps) {
  const threads = useStore((store) => store.threads);
  const projects = useStore((store) => store.projects);
  const markThreadVisited = useStore((store) => store.markThreadVisited);
  const syncServerReadModel = useStore((store) => store.syncServerReadModel);
  const setStoreThreadError = useStore((store) => store.setError);
  const setStoreThreadBranch = useStore((store) => store.setThreadBranch);
  const { settings, updateSettings } = useAppSettings();
  const planCopy = useMemo(() => getPlanUiCopy(settings.language), [settings.language]);
  const chatCopy = useMemo(() => getChatSurfaceCopy(settings.language), [settings.language]);
  const timestampFormat = settings.timestampFormat;
  const navigate = useNavigate();
  const { defaultProjectId, openDefaultNewThread } = useNewThreadActions();
  const rawSearch = useSearch({
    strict: false,
    select: (params) => parseDiffRouteSearch(params),
  });
  const { resolvedTheme } = useTheme();
  const chatBackgroundImage = useChatBackgroundImage(
    settings.chatBackgroundImageAssetId,
    settings.chatBackgroundImageDataUrl,
  );
  const chatBackgroundFadePercent = Math.min(
    100,
    Math.max(0, settings.chatBackgroundImageFadePercent),
  );
  const chatBackgroundBlurPx = Math.min(24, Math.max(0, settings.chatBackgroundImageBlurPx));
  const chatBackgroundImageOpacity = Math.max(0, (100 - chatBackgroundFadePercent) / 100);
  const queryClient = useQueryClient();
  const createWorktreeMutation = useMutation(gitCreateWorktreeMutationOptions({ queryClient }));
  const removeWorktreeMutation = useMutation(gitRemoveWorktreeMutationOptions({ queryClient }));
  const composerDraft = useComposerThreadDraft(threadId);
  const prompt = composerDraft.prompt;
  const composerImages = composerDraft.images;
  const selectedSkillNames = composerDraft.selectedSkills;
  const nonPersistedComposerImageIds = composerDraft.nonPersistedImageIds;
  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const setComposerDraftSelectedSkills = useComposerDraftStore((store) => store.setSelectedSkills);
  const setComposerDraftProvider = useComposerDraftStore((store) => store.setProvider);
  const setComposerDraftModel = useComposerDraftStore((store) => store.setModel);
  const setComposerDraftRuntimeMode = useComposerDraftStore((store) => store.setRuntimeMode);
  const setComposerDraftInteractionMode = useComposerDraftStore(
    (store) => store.setInteractionMode,
  );
  const setComposerDraftEffort = useComposerDraftStore((store) => store.setEffort);
  const setComposerDraftCodexFastMode = useComposerDraftStore((store) => store.setCodexFastMode);
  const addComposerDraftImage = useComposerDraftStore((store) => store.addImage);
  const addComposerDraftImages = useComposerDraftStore((store) => store.addImages);
  const removeComposerDraftImage = useComposerDraftStore((store) => store.removeImage);
  const clearComposerDraftPersistedAttachments = useComposerDraftStore(
    (store) => store.clearPersistedAttachments,
  );
  const syncComposerDraftPersistedAttachments = useComposerDraftStore(
    (store) => store.syncPersistedAttachments,
  );
  const clearComposerDraftContent = useComposerDraftStore((store) => store.clearComposerContent);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const getDraftThreadByProjectId = useComposerDraftStore(
    (store) => store.getDraftThreadByProjectId,
  );
  const getDraftThread = useComposerDraftStore((store) => store.getDraftThread);
  const setProjectDraftThreadId = useComposerDraftStore((store) => store.setProjectDraftThreadId);
  const clearProjectDraftThreadId = useComposerDraftStore(
    (store) => store.clearProjectDraftThreadId,
  );
  const draftThread = useComposerDraftStore(
    (store) => store.draftThreadsByThreadId[threadId] ?? null,
  );
  const promptRef = useRef(prompt);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  const [expandedImage, setExpandedImage] = useState<ExpandedImagePreview | null>(null);
  const [optimisticUserMessages, setOptimisticUserMessages] = useState<ChatMessage[]>([]);
  const optimisticUserMessagesRef = useRef(optimisticUserMessages);
  optimisticUserMessagesRef.current = optimisticUserMessages;
  const [localDraftErrorsByThreadId, setLocalDraftErrorsByThreadId] = useState<
    Record<ThreadId, string | null>
  >({});
  const [sendPhaseByThreadId, setSendPhaseByThreadId] = useState<Record<string, SendPhase>>({});
  const [followUpModeByThreadId, setFollowUpModeByThreadId] = useState<
    Record<string, "queue" | "steer">
  >({});
  const [sendStartedAt, setSendStartedAt] = useState<string | null>(null);
  const [isRevertingCheckpoint, setIsRevertingCheckpoint] = useState(false);
  const [pendingInterruptRequest, setPendingInterruptRequest] = useState<{
    threadId: ThreadId;
    turnId: TurnId | null;
  } | null>(null);
  const [optimisticResolvedApprovalRequestIds, setOptimisticResolvedApprovalRequestIds] = useState<
    ApprovalRequestId[]
  >([]);
  const [respondingRequestIds, setRespondingRequestIds] = useState<ApprovalRequestId[]>([]);
  const [respondingUserInputRequestIds, setRespondingUserInputRequestIds] = useState<
    ApprovalRequestId[]
  >([]);
  const [pendingUserInputAnswersByRequestId, setPendingUserInputAnswersByRequestId] = useState<
    Record<string, Record<string, PendingUserInputDraftAnswer>>
  >({});
  const [pendingUserInputQuestionIndexByRequestId, setPendingUserInputQuestionIndexByRequestId] =
    useState<Record<string, number>>({});
  const [expandedWorkGroups, setExpandedWorkGroups] = useState<Record<string, boolean>>({});
  const [planSidebarOpen, setPlanSidebarOpen] = useState(false);
  const [isForkingThread, setIsForkingThread] = useState(false);
  const [isThreadShareDialogOpen, setIsThreadShareDialogOpen] = useState(false);
  const autoShareAttemptedThreadIdsRef = useRef<Set<ThreadId>>(new Set());
  const [isThreadExportDialogOpen, setIsThreadExportDialogOpen] = useState(false);
  const [threadExportFormat, setThreadExportFormat] = useState<ThreadExportFormat>("markdown");
  const [threadExportPath, setThreadExportPath] = useState("");
  const [isSavingThreadExport, setIsSavingThreadExport] = useState(false);
  const [isComposerFooterCompact, setIsComposerFooterCompact] = useState(false);
  // Tracks whether the user explicitly dismissed the sidebar for the active turn.
  const planSidebarDismissedForTurnRef = useRef<string | null>(null);
  // When set, the thread-change reset effect will open the sidebar instead of closing it.
  // Used by "Implement in new thread" to carry the sidebar-open intent across navigation.
  const planSidebarOpenOnNextThreadRef = useRef(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [terminalFocusRequestId, setTerminalFocusRequestId] = useState(0);
  const [composerHighlightedItemId, setComposerHighlightedItemId] = useState<string | null>(null);
  const [pendingTemplateOverrides, setPendingTemplateOverrides] =
    useState<ProjectCommandTemplateOverrides | null>(null);
  const [isProviderSetupDialogOpen, setIsProviderSetupDialogOpen] = useState(false);
  const [isManageModelsDialogOpen, setIsManageModelsDialogOpen] = useState(false);
  const [isUsageDashboardOpen, setIsUsageDashboardOpen] = useState(false);
  const [isRefreshingProviderSetupState, setIsRefreshingProviderSetupState] = useState(false);
  const [isOpenRouterApiKeyDialogOpen, setIsOpenRouterApiKeyDialogOpen] = useState(false);
  const [openRouterApiKeyDraft, setOpenRouterApiKeyDraft] = useState("");
  const [openRouterApiKeyError, setOpenRouterApiKeyError] = useState<string | null>(null);
  const [isKimiApiKeyDialogOpen, setIsKimiApiKeyDialogOpen] = useState(false);
  const [kimiApiKeyDraft, setKimiApiKeyDraft] = useState("");
  const [kimiApiKeyError, setKimiApiKeyError] = useState<string | null>(null);
  const [pullRequestDialogState, setPullRequestDialogState] =
    useState<PullRequestDialogState | null>(null);
  const [attachmentPreviewHandoffByMessageId, setAttachmentPreviewHandoffByMessageId] = useState<
    Record<string, string[]>
  >({});
  const [composerCursor, setComposerCursor] = useState(() =>
    collapseExpandedComposerCursor(prompt, prompt.length),
  );
  const [composerTrigger, setComposerTrigger] = useState<ComposerTrigger | null>(() =>
    detectComposerTrigger(prompt, prompt.length),
  );
  const [lastInvokedScriptByProjectId, setLastInvokedScriptByProjectId] = useLocalStorage(
    LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
    {},
    LastInvokedScriptByProjectSchema,
  );
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const [messagesScrollElement, setMessagesScrollElement] = useState<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const lastKnownScrollTopRef = useRef(0);
  const isPointerScrollActiveRef = useRef(false);
  const lastTouchClientYRef = useRef<number | null>(null);
  const pendingUserScrollUpIntentRef = useRef(false);
  const pendingAutoScrollFrameRef = useRef<number | null>(null);
  const pendingInteractionAnchorRef = useRef<{
    element: HTMLElement;
    top: number;
  } | null>(null);
  const pendingInteractionAnchorFrameRef = useRef<number | null>(null);
  const composerEditorRef = useRef<ComposerPromptEditorHandle>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const composerFileInputRef = useRef<HTMLInputElement>(null);
  const pendingOpenRouterContinuationRef = useRef<
    "submit-form" | "implement-plan-in-new-thread" | null
  >(null);
  const pendingKimiContinuationRef = useRef<"submit-form" | "implement-plan-in-new-thread" | null>(
    null,
  );
  const composerFormHeightRef = useRef(0);
  const composerImagesRef = useRef<ComposerImageAttachment[]>([]);
  const composerSelectLockRef = useRef(false);
  const composerMenuOpenRef = useRef(false);
  const composerMenuItemsRef = useRef<ComposerCommandItem[]>([]);
  const activeComposerMenuItemRef = useRef<ComposerCommandItem | null>(null);
  const attachmentPreviewHandoffByMessageIdRef = useRef<Record<string, string[]>>({});
  const attachmentPreviewHandoffTimeoutByMessageIdRef = useRef<Record<string, number>>({});
  const sendInFlightByThreadIdRef = useRef<Record<string, boolean>>({});
  const dragDepthRef = useRef(0);
  const terminalOpenByThreadRef = useRef<Record<string, boolean>>({});
  const setMessagesScrollContainerRef = useCallback((element: HTMLDivElement | null) => {
    messagesScrollRef.current = element;
    setMessagesScrollElement(element);
  }, []);

  const terminalState = useTerminalStateStore((state) =>
    selectThreadTerminalState(state.terminalStateByThreadId, threadId),
  );
  const queuedTurnsForThread = useThreadSendQueueStore(
    (store) => store.queueByThreadId[threadId] ?? EMPTY_QUEUED_TURNS,
  );
  const enqueueQueuedTurn = useThreadSendQueueStore((store) => store.enqueue);
  const removeQueuedTurn = useThreadSendQueueStore((store) => store.remove);
  const moveQueuedTurn = useThreadSendQueueStore((store) => store.move);
  const markQueuedTurnSending = useThreadSendQueueStore((store) => store.markSending);
  const markQueuedTurnFailed = useThreadSendQueueStore((store) => store.markFailed);
  const markQueuedTurnPending = useThreadSendQueueStore((store) => store.markPending);
  const clearQueuedTurnsForThread = useThreadSendQueueStore((store) => store.clearThreadQueue);
  const storeSetTerminalOpen = useTerminalStateStore((s) => s.setTerminalOpen);
  const storeSetTerminalHeight = useTerminalStateStore((s) => s.setTerminalHeight);
  const storeSplitTerminal = useTerminalStateStore((s) => s.splitTerminal);
  const storeNewTerminal = useTerminalStateStore((s) => s.newTerminal);
  const storeSetActiveTerminal = useTerminalStateStore((s) => s.setActiveTerminal);
  const storeCloseTerminal = useTerminalStateStore((s) => s.closeTerminal);
  const setThreadSendPhase = useCallback((targetThreadId: ThreadId, phase: SendPhase) => {
    setSendPhaseByThreadId((existing) => {
      const current = existing[targetThreadId] ?? "idle";
      if (current === phase) {
        return existing;
      }
      if (phase === "idle") {
        if (!(targetThreadId in existing)) {
          return existing;
        }
        const next = { ...existing };
        delete next[targetThreadId];
        return next;
      }
      return {
        ...existing,
        [targetThreadId]: phase,
      };
    });
  }, []);
  const setThreadSendInFlight = useCallback((targetThreadId: ThreadId, inFlight: boolean) => {
    if (inFlight) {
      sendInFlightByThreadIdRef.current[targetThreadId] = true;
      return;
    }
    delete sendInFlightByThreadIdRef.current[targetThreadId];
  }, []);
  const isThreadSendInFlight = useCallback((targetThreadId: ThreadId | null | undefined) => {
    if (!targetThreadId) {
      return false;
    }
    return sendInFlightByThreadIdRef.current[targetThreadId] === true;
  }, []);
  const setFollowUpMode = useCallback((targetThreadId: ThreadId, nextMode: "queue" | "steer") => {
    setFollowUpModeByThreadId((existing) =>
      existing[targetThreadId] === nextMode
        ? existing
        : { ...existing, [targetThreadId]: nextMode },
    );
  }, []);
  const sendPhase = sendPhaseByThreadId[threadId] ?? "idle";

  const setPrompt = useCallback(
    (nextPrompt: string) => {
      setComposerDraftPrompt(threadId, nextPrompt);
    },
    [setComposerDraftPrompt, threadId],
  );
  const setSelectedSkills = useCallback(
    (skills: ReadonlyArray<ProjectSkillName>) => {
      setComposerDraftSelectedSkills(threadId, skills);
    },
    [setComposerDraftSelectedSkills, threadId],
  );
  const toggleSelectedSkill = useCallback(
    (skillName: ProjectSkillName) => {
      setSelectedSkills(
        selectedSkillNames.includes(skillName)
          ? selectedSkillNames.filter((entry) => entry !== skillName)
          : [...selectedSkillNames, skillName],
      );
    },
    [selectedSkillNames, setSelectedSkills],
  );
  const removeSelectedSkill = useCallback(
    (skillName: ProjectSkillName) => {
      setSelectedSkills(selectedSkillNames.filter((entry) => entry !== skillName));
    },
    [selectedSkillNames, setSelectedSkills],
  );
  const addComposerImage = useCallback(
    (image: ComposerImageAttachment) => {
      addComposerDraftImage(threadId, image);
    },
    [addComposerDraftImage, threadId],
  );
  const addComposerImagesToDraft = useCallback(
    (images: ComposerImageAttachment[]) => {
      addComposerDraftImages(threadId, images);
    },
    [addComposerDraftImages, threadId],
  );
  const removeComposerImageFromDraft = useCallback(
    (imageId: string) => {
      removeComposerDraftImage(threadId, imageId);
    },
    [removeComposerDraftImage, threadId],
  );

  const serverThread = threads.find((t) => t.id === threadId);
  const fallbackDraftProject = projects.find((project) => project.id === draftThread?.projectId);
  const localDraftError = serverThread ? null : (localDraftErrorsByThreadId[threadId] ?? null);
  const localDraftThread = useMemo(
    () =>
      draftThread
        ? buildLocalDraftThread(
            threadId,
            draftThread,
            fallbackDraftProject?.model ?? DEFAULT_MODEL_BY_PROVIDER.codex,
            localDraftError,
          )
        : undefined,
    [draftThread, fallbackDraftProject?.model, localDraftError, threadId],
  );
  const activeThread = serverThread ?? localDraftThread;
  const runtimeMode =
    composerDraft.runtimeMode ?? activeThread?.runtimeMode ?? DEFAULT_RUNTIME_MODE;
  const interactionMode =
    composerDraft.interactionMode ?? activeThread?.interactionMode ?? DEFAULT_INTERACTION_MODE;
  const isServerThread = serverThread !== undefined;
  const isLocalDraftThread = !isServerThread && localDraftThread !== undefined;
  const canCheckoutPullRequestIntoThread = isLocalDraftThread;
  const diffOpen = rawSearch.diff === "1";
  const activeThreadId = activeThread?.id ?? null;
  const activeLatestTurn = activeThread?.latestTurn ?? null;
  const latestTurnSettled = isLatestTurnSettled(activeLatestTurn, activeThread?.session ?? null);
  const activeProject = projects.find((p) => p.id === activeThread?.projectId);

  const openPullRequestDialog = useCallback(
    (reference?: string) => {
      if (!canCheckoutPullRequestIntoThread) {
        return;
      }
      setPullRequestDialogState({
        initialReference: reference ?? null,
        key: Date.now(),
      });
      setComposerHighlightedItemId(null);
    },
    [canCheckoutPullRequestIntoThread],
  );

  const closePullRequestDialog = useCallback(() => {
    setPullRequestDialogState(null);
  }, []);

  const openOrReuseProjectDraftThread = useCallback(
    async (input: { branch: string; worktreePath: string | null; envMode: DraftThreadEnvMode }) => {
      if (!activeProject) {
        throw new Error("No active project is available for this pull request.");
      }
      const storedDraftThread = getDraftThreadByProjectId(activeProject.id);
      if (storedDraftThread) {
        setDraftThreadContext(storedDraftThread.threadId, input);
        setProjectDraftThreadId(activeProject.id, storedDraftThread.threadId, input);
        if (storedDraftThread.threadId !== threadId) {
          await navigate({
            to: "/$threadId",
            params: { threadId: storedDraftThread.threadId },
          });
        }
        return;
      }

      const activeDraftThread = getDraftThread(threadId);
      if (!isServerThread && activeDraftThread?.projectId === activeProject.id) {
        setDraftThreadContext(threadId, input);
        setProjectDraftThreadId(activeProject.id, threadId, input);
        return;
      }

      clearProjectDraftThreadId(activeProject.id);
      const nextThreadId = newThreadId();
      setProjectDraftThreadId(activeProject.id, nextThreadId, {
        createdAt: new Date().toISOString(),
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: DEFAULT_INTERACTION_MODE,
        ...input,
      });
      await navigate({
        to: "/$threadId",
        params: { threadId: nextThreadId },
      });
    },
    [
      activeProject,
      clearProjectDraftThreadId,
      getDraftThread,
      getDraftThreadByProjectId,
      isServerThread,
      navigate,
      setDraftThreadContext,
      setProjectDraftThreadId,
      threadId,
    ],
  );

  const handlePreparedPullRequestThread = useCallback(
    async (input: { branch: string; worktreePath: string | null }) => {
      await openOrReuseProjectDraftThread({
        branch: input.branch,
        worktreePath: input.worktreePath,
        envMode: input.worktreePath ? "worktree" : "local",
      });
    },
    [openOrReuseProjectDraftThread],
  );

  useEffect(() => {
    if (!activeThread?.id) return;
    if (!latestTurnSettled) return;
    if (!activeLatestTurn?.completedAt) return;
    const turnCompletedAt = Date.parse(activeLatestTurn.completedAt);
    if (Number.isNaN(turnCompletedAt)) return;
    const manualUnreadVisitedAt = new Date(turnCompletedAt - 1).toISOString();
    if (activeThread.lastVisitedAt === manualUnreadVisitedAt) return;
    const lastVisitedAt = activeThread.lastVisitedAt ? Date.parse(activeThread.lastVisitedAt) : NaN;
    if (!Number.isNaN(lastVisitedAt) && lastVisitedAt >= turnCompletedAt) return;

    markThreadVisited(activeThread.id);
  }, [
    activeThread?.id,
    activeThread?.lastVisitedAt,
    activeLatestTurn?.completedAt,
    latestTurnSettled,
    markThreadVisited,
  ]);

  const sessionProvider = activeThread?.session?.provider ?? activeThread?.provider ?? null;
  const selectedProviderByThreadId = composerDraft.provider;
  const hasThreadStarted = Boolean(
    activeThread &&
    (activeThread.latestTurn !== null ||
      activeThread.messages.length > 0 ||
      activeThread.session !== null),
  );
  const selectedServiceTierSetting = settings.codexServiceTier;
  const selectedServiceTier = resolveAppServiceTier(selectedServiceTierSetting);
  const lockedProvider: ProviderKind | null = hasThreadStarted
    ? (sessionProvider ?? selectedProviderByThreadId ?? null)
    : null;
  const selectedProvider: ProviderKind = lockedProvider ?? selectedProviderByThreadId ?? "codex";
  const [providerStatusModelOptionsByProvider, setProviderStatusModelOptionsByProvider] = useState<
    Record<ProviderKind, ReadonlyArray<PickerModelOption>>
  >(EMPTY_PROVIDER_STATUS_MODEL_OPTIONS_BY_PROVIDER);
  const providerFavoriteModelSettings = useMemo<ProviderFavoriteModelSettings>(
    () => ({
      favoriteCodexModels: settings.favoriteCodexModels,
      favoriteCopilotModels: settings.favoriteCopilotModels,
      favoriteOpencodeModels: settings.favoriteOpencodeModels,
      favoriteKimiModels: settings.favoriteKimiModels,
      favoritePiModels: settings.favoritePiModels,
    }),
    [
      settings.favoriteCodexModels,
      settings.favoriteCopilotModels,
      settings.favoriteKimiModels,
      settings.favoriteOpencodeModels,
      settings.favoritePiModels,
    ],
  );
  const providerRecentModelSettings = useMemo<ProviderRecentModelSettings>(
    () => ({
      recentCodexModels: settings.recentCodexModels,
      recentCopilotModels: settings.recentCopilotModels,
      recentOpencodeModels: settings.recentOpencodeModels,
      recentKimiModels: settings.recentKimiModels,
      recentPiModels: settings.recentPiModels,
    }),
    [
      settings.recentCodexModels,
      settings.recentCopilotModels,
      settings.recentKimiModels,
      settings.recentOpencodeModels,
      settings.recentPiModels,
    ],
  );
  const providerHiddenModelSettings = useMemo<ProviderHiddenModelSettings>(
    () => ({
      hiddenCodexModels: settings.hiddenCodexModels,
      hiddenCopilotModels: settings.hiddenCopilotModels,
      hiddenOpencodeModels: settings.hiddenOpencodeModels,
      hiddenKimiModels: settings.hiddenKimiModels,
      hiddenPiModels: settings.hiddenPiModels,
    }),
    [
      settings.hiddenCodexModels,
      settings.hiddenCopilotModels,
      settings.hiddenKimiModels,
      settings.hiddenOpencodeModels,
      settings.hiddenPiModels,
    ],
  );
  const configuredModelOptionsByProvider = useMemo(
    () => ({
      codex: deriveConfiguredModelOptions(activeThread?.activities ?? EMPTY_ACTIVITIES, "codex"),
      copilot: deriveConfiguredModelOptions(
        activeThread?.activities ?? EMPTY_ACTIVITIES,
        "copilot",
      ),
      opencode: deriveConfiguredModelOptions(
        activeThread?.activities ?? EMPTY_ACTIVITIES,
        "opencode",
      ),
      kimi: deriveConfiguredModelOptions(activeThread?.activities ?? EMPTY_ACTIVITIES, "kimi"),
      pi: deriveConfiguredModelOptions(activeThread?.activities ?? EMPTY_ACTIVITIES, "pi"),
    }),
    [activeThread?.activities],
  );
  const hasLivePiStatusCatalog = providerStatusModelOptionsByProvider.pi.length > 0;
  const hasActivePiSessionCatalog =
    sessionProvider === "pi" &&
    activeThread?.session !== null &&
    configuredModelOptionsByProvider.pi.length > 0;
  const shouldHidePiDefaultFallback = hasLivePiStatusCatalog || hasActivePiSessionCatalog;
  const allModelOptionsByProvider = useMemo(
    () =>
      getCustomModelOptionsByProvider(
        settings,
        configuredModelOptionsByProvider,
        providerStatusModelOptionsByProvider,
        {
          hidePiDefaultFallback: shouldHidePiDefaultFallback,
        },
      ),
    [
      configuredModelOptionsByProvider,
      providerStatusModelOptionsByProvider,
      settings,
      shouldHidePiDefaultFallback,
    ],
  );
  const visibleModelOptionsByProvider = useMemo(
    () => ({
      codex: filterHiddenModelOptions(
        allModelOptionsByProvider.codex,
        providerHiddenModelSettings.hiddenCodexModels,
      ),
      copilot: filterHiddenModelOptions(
        allModelOptionsByProvider.copilot,
        providerHiddenModelSettings.hiddenCopilotModels,
      ),
      opencode: filterHiddenModelOptions(
        allModelOptionsByProvider.opencode,
        providerHiddenModelSettings.hiddenOpencodeModels,
      ),
      kimi: filterHiddenModelOptions(
        allModelOptionsByProvider.kimi,
        providerHiddenModelSettings.hiddenKimiModels,
      ),
      pi: filterHiddenModelOptions(
        allModelOptionsByProvider.pi,
        providerHiddenModelSettings.hiddenPiModels,
      ),
    }),
    [allModelOptionsByProvider, providerHiddenModelSettings],
  );
  const visibleAuthenticatedPiModelCount = useMemo(() => {
    const authenticatedPiModelOptions = hasLivePiStatusCatalog
      ? providerStatusModelOptionsByProvider.pi
      : hasActivePiSessionCatalog
        ? configuredModelOptionsByProvider.pi
        : [];
    return filterHiddenModelOptions(
      authenticatedPiModelOptions,
      providerHiddenModelSettings.hiddenPiModels,
    ).length;
  }, [
    configuredModelOptionsByProvider.pi,
    hasActivePiSessionCatalog,
    hasLivePiStatusCatalog,
    providerHiddenModelSettings.hiddenPiModels,
    providerStatusModelOptionsByProvider.pi,
  ]);
  const openRouterCatalogQuery = useQuery(openRouterFreeModelsQueryOptions());
  const hasLiveOpenRouterCatalog =
    openRouterCatalogQuery.data?.status === "available" &&
    openRouterCatalogQuery.data.source === "live";
  const openRouterModels = useMemo(
    () => openRouterCatalogQuery.data?.models ?? [],
    [openRouterCatalogQuery.data?.models],
  );
  const openRouterModelsBySlug = useMemo(
    () => new Map(openRouterModels.map((model) => [model.slug, model])),
    [openRouterModels],
  );
  const openRouterPickerOptions = useMemo(
    () =>
      openRouterModels.filter(isCut3CompatibleOpenRouterModelOption).map((model) => {
        const option: PickerModelOption = {
          slug: model.slug,
          name: model.name,
          supportsReasoning: model.supportsReasoning,
          supportsImageInput: model.supportsImages,
        };
        if (model.contextLength !== null) {
          option.contextWindowTokens = model.contextLength;
        }
        return option;
      }),
    [openRouterModels],
  );
  const openRouterContextLengthsBySlug = useMemo(
    () => new Map(openRouterModels.map((model) => [model.slug, model.contextLength])),
    [openRouterModels],
  );
  const openRouterModelOptions = useMemo(
    () =>
      mergeModelOptions(
        openRouterPickerOptions,
        allModelOptionsByProvider.codex.filter((option) => {
          if (
            !isCodexOpenRouterModel(option.slug) ||
            !isOpenRouterGuaranteedFreeSlug(option.slug)
          ) {
            return false;
          }
          if (!hasLiveOpenRouterCatalog || option.slug === OPENROUTER_FREE_ROUTER_MODEL) {
            return true;
          }
          return supportsOpenRouterNativeToolCalling(openRouterModelsBySlug.get(option.slug));
        }),
      ),
    [
      allModelOptionsByProvider.codex,
      hasLiveOpenRouterCatalog,
      openRouterModelsBySlug,
      openRouterPickerOptions,
    ],
  );
  const visibleOpenRouterModelOptions = useMemo(
    () =>
      filterHiddenModelOptions(
        openRouterModelOptions,
        providerHiddenModelSettings.hiddenCodexModels,
      ),
    [openRouterModelOptions, providerHiddenModelSettings.hiddenCodexModels],
  );
  const openCodeStateQuery = useQuery(
    serverOpenCodeStateQueryOptions({
      cwd: activeProject?.cwd,
      binaryPath: settings.opencodeBinaryPath.trim() || undefined,
      refreshModels: false,
    }),
  );
  const opencodeModelOptions = useMemo(() => {
    if (openCodeStateQuery.data?.status !== "available") {
      return [];
    }
    return openCodeStateQuery.data.models.map((model) => ({
      slug: model.slug,
      name: `${model.providerId}/${model.modelId}`,
      ...(typeof model.contextWindowTokens === "number"
        ? { contextWindowTokens: model.contextWindowTokens }
        : {}),
    }));
  }, [openCodeStateQuery.data]);
  const visibleOpencodeModelOptions = useMemo(
    () =>
      filterHiddenModelOptions(
        opencodeModelOptions,
        providerHiddenModelSettings.hiddenOpencodeModels,
      ),
    [opencodeModelOptions, providerHiddenModelSettings.hiddenOpencodeModels],
  );
  const openCodeContextLengthsBySlug = useMemo(
    () =>
      new Map(
        (openCodeStateQuery.data?.models ?? []).map((model) => [
          model.slug,
          model.contextWindowTokens ?? null,
        ]),
      ),
    [openCodeStateQuery.data?.models],
  );
  const customModelsForSelectedProvider = useMemo(
    () => allModelOptionsByProvider[selectedProvider].map((option) => option.slug),
    [allModelOptionsByProvider, selectedProvider],
  );
  const baseThreadModel = resolveAppModelSelection(
    selectedProvider,
    customModelsForSelectedProvider,
    activeThread?.model ?? activeProject?.model ?? getDefaultModel(selectedProvider),
  ) as ModelSlug;
  const selectedModel = useMemo(() => {
    const draftModel = composerDraft.model;
    if (!draftModel) {
      return baseThreadModel;
    }
    return resolveAppModelSelection(
      selectedProvider,
      customModelsForSelectedProvider,
      draftModel,
    ) as ModelSlug;
  }, [baseThreadModel, composerDraft.model, customModelsForSelectedProvider, selectedProvider]);
  const selectedProviderPickerKind = useMemo(
    () => getProviderPickerKindForSelection(selectedProvider, selectedModel),
    [selectedModel, selectedProvider],
  );
  const selectedModelUsesOpenRouter =
    selectedProvider === "codex" && isCodexOpenRouterModel(selectedModel);
  const selectedOpenRouterModel = selectedModelUsesOpenRouter
    ? (openRouterModelsBySlug.get(selectedModel) ?? null)
    : null;
  const selectedPiModelOption = useMemo(
    () =>
      selectedProvider === "pi"
        ? findModelOptionBySlug(allModelOptionsByProvider.pi, selectedModel)
        : null,
    [allModelOptionsByProvider.pi, selectedModel, selectedProvider],
  );
  const selectedPiConfiguredReasoningState = useMemo(
    () =>
      selectedProvider === "pi"
        ? deriveConfiguredReasoningState(
            activeThread?.activities ?? EMPTY_ACTIVITIES,
            "pi",
            selectedModel,
          )
        : null,
    [activeThread?.activities, selectedModel, selectedProvider],
  );
  const selectedCodexSupportsFastMode =
    selectedProvider === "codex" && !selectedModelUsesOpenRouter;
  const copilotReasoningProbeQuery = useQuery(
    serverCopilotReasoningProbeQueryOptions(
      {
        model: selectedModel,
        binaryPath:
          settings.copilotBinaryPath.trim().length > 0
            ? settings.copilotBinaryPath.trim()
            : undefined,
      },
      selectedProvider === "copilot" && selectedModel.length > 0,
    ),
  );
  const probedCopilotReasoningOptions =
    selectedProvider === "copilot" && copilotReasoningProbeQuery.data?.status === "supported"
      ? copilotReasoningProbeQuery.data.options
      : null;
  const copilotProbedEffort =
    selectedProvider === "copilot" && copilotReasoningProbeQuery.data?.status === "supported"
      ? (copilotReasoningProbeQuery.data.currentValue ?? null)
      : null;
  const reasoningOptions = useMemo(() => {
    if (selectedProvider === "copilot") {
      return probedCopilotReasoningOptions ?? [];
    }

    if (selectedProvider === "pi") {
      if (
        selectedPiConfiguredReasoningState &&
        selectedPiConfiguredReasoningState.options.length > 0
      ) {
        return selectedPiConfiguredReasoningState.options;
      }
      return selectedPiModelOption?.supportsReasoning ? getReasoningEffortOptions("pi") : [];
    }

    if (selectedModelUsesOpenRouter) {
      return supportsOpenRouterReasoningEffortControl(selectedOpenRouterModel) &&
        selectedOpenRouterModel?.supportsReasoning
        ? getReasoningEffortOptions("codex")
        : [];
    }

    return getReasoningEffortOptions(selectedProvider);
  }, [
    probedCopilotReasoningOptions,
    selectedOpenRouterModel,
    selectedModelUsesOpenRouter,
    selectedPiConfiguredReasoningState,
    selectedPiModelOption?.supportsReasoning,
    selectedProvider,
  ]);
  const allowDefaultReasoningSelection =
    selectedProvider === "pi" &&
    (selectedPiConfiguredReasoningState?.currentValue ?? null) === null;
  const supportsReasoningEffort = reasoningOptions.length > 0;
  const selectedDraftEffort = useMemo(
    () =>
      resolveComposerEffortForProvider({
        provider: selectedProvider,
        effort: composerDraft.effort ?? null,
        effortProvider: composerDraft.effortProvider ?? null,
      }),
    [composerDraft.effort, composerDraft.effortProvider, selectedProvider],
  );
  const selectedEffort = useMemo(() => {
    if (reasoningOptions.length === 0) {
      return null;
    }

    const defaultEffort = getDefaultReasoningEffort(selectedProvider);
    const preferredEfforts = [
      selectedDraftEffort,
      copilotProbedEffort,
      selectedPiConfiguredReasoningState?.currentValue ?? null,
      defaultEffort,
    ];

    for (const effort of preferredEfforts) {
      if (effort && reasoningOptions.includes(effort)) {
        return effort;
      }
    }

    return selectedProvider === "pi" ? null : (reasoningOptions[0] ?? null);
  }, [
    copilotProbedEffort,
    reasoningOptions,
    selectedDraftEffort,
    selectedPiConfiguredReasoningState?.currentValue,
    selectedProvider,
  ]);
  const selectedCodexFastModeEnabled =
    selectedProvider === "codex" ? composerDraft.codexFastMode : false;
  const selectedModelOptionsForDispatch = useMemo(
    () =>
      buildModelOptionsForSend({
        provider: selectedProvider,
        model: selectedModel,
        composerEffort: selectedDraftEffort,
        codexFastModeEnabled: selectedCodexFastModeEnabled,
        copilotReasoningProbe: copilotReasoningProbeQuery.data,
        openRouterSupportsReasoningEffort:
          selectedOpenRouterModel !== null &&
          supportsOpenRouterReasoningEffortControl(selectedOpenRouterModel) &&
          selectedOpenRouterModel.supportsReasoning,
        piSupportsReasoning: selectedPiModelOption?.supportsReasoning === true,
        piReasoningOptions: selectedPiConfiguredReasoningState?.options ?? null,
      }),
    [
      copilotReasoningProbeQuery.data,
      selectedCodexFastModeEnabled,
      selectedDraftEffort,
      selectedModel,
      selectedOpenRouterModel,
      selectedPiConfiguredReasoningState?.options,
      selectedPiModelOption?.supportsReasoning,
      selectedProvider,
    ],
  );
  const providerOptionsForDispatch = useMemo(
    () =>
      buildProviderOptionsForDispatch({
        provider: selectedProvider,
        settings,
      }),
    [selectedProvider, settings],
  );
  const seedForkedThreadDraft = useCallback(
    (
      nextThreadId: ThreadId,
      forkThreadDraftSettings: ReturnType<typeof resolveForkThreadDraftSettings>,
    ) => {
      setComposerDraftProvider(nextThreadId, forkThreadDraftSettings.provider);
      setComposerDraftModel(nextThreadId, forkThreadDraftSettings.model);
      setComposerDraftRuntimeMode(nextThreadId, forkThreadDraftSettings.runtimeMode);
      setComposerDraftInteractionMode(nextThreadId, forkThreadDraftSettings.interactionMode);
      setComposerDraftSelectedSkills(nextThreadId, selectedSkillNames);
      setComposerDraftEffort(
        nextThreadId,
        forkThreadDraftSettings.provider === "pi" ? selectedDraftEffort : selectedEffort,
        forkThreadDraftSettings.provider,
      );
      setComposerDraftCodexFastMode(
        nextThreadId,
        forkThreadDraftSettings.provider === "codex" ? composerDraft.codexFastMode : false,
      );
    },
    [
      composerDraft.codexFastMode,
      selectedDraftEffort,
      selectedSkillNames,
      selectedEffort,
      setComposerDraftCodexFastMode,
      setComposerDraftEffort,
      setComposerDraftInteractionMode,
      setComposerDraftModel,
      setComposerDraftProvider,
      setComposerDraftSelectedSkills,
      setComposerDraftRuntimeMode,
    ],
  );
  const forkThreadFromSource = useCallback(
    async (source: ThreadForkSource) => {
      const api = readNativeApi();
      if (!api || !activeThread || !activeProject || !isServerThread || isForkingThread) {
        return;
      }

      const nextThreadId = newThreadId();
      const createdAt = new Date().toISOString();
      const nextThreadTitle = truncateTitle(buildForkedThreadTitle(activeThread.title));
      const forkThreadDraftSettings = resolveForkThreadDraftSettings(activeThread);

      setIsForkingThread(true);
      try {
        await api.orchestration.dispatchCommand({
          type: "thread.fork",
          commandId: newCommandId(),
          sourceThreadId: activeThread.id,
          threadId: nextThreadId,
          title: nextThreadTitle,
          model: forkThreadDraftSettings.model,
          runtimeMode: forkThreadDraftSettings.runtimeMode,
          interactionMode: forkThreadDraftSettings.interactionMode,
          branch: activeThread.branch,
          worktreePath: activeThread.worktreePath,
          source,
          createdAt,
        });
        const snapshot = await api.orchestration.getSnapshot();
        syncServerReadModel(snapshot);
        seedForkedThreadDraft(nextThreadId, forkThreadDraftSettings);
        await navigate({
          to: "/$threadId",
          params: { threadId: nextThreadId },
        });
        toastManager.add({
          type: "success",
          title: "Thread forked",
          description: nextThreadTitle,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not fork thread",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        });
      } finally {
        setIsForkingThread(false);
      }
    },
    [
      activeProject,
      activeThread,
      isForkingThread,
      isServerThread,
      navigate,
      seedForkedThreadDraft,
      syncServerReadModel,
    ],
  );
  const onForkCurrentThread = useCallback(() => {
    if (!activeThread) {
      return;
    }
    void forkThreadFromSource(resolveLatestThreadForkSource(activeThread));
  }, [activeThread, forkThreadFromSource]);
  const onForkMessage = useCallback(
    (messageId: MessageId) => {
      void forkThreadFromSource({
        kind: "message",
        messageId,
      });
    },
    [forkThreadFromSource],
  );
  const openOpenRouterApiKeyDialog = useCallback(
    (continuation: "submit-form" | "implement-plan-in-new-thread" | null) => {
      pendingOpenRouterContinuationRef.current = continuation;
      setOpenRouterApiKeyDraft(settings.openRouterApiKey);
      setOpenRouterApiKeyError(null);
      setIsOpenRouterApiKeyDialogOpen(true);
    },
    [settings.openRouterApiKey],
  );
  const openKimiApiKeyDialog = useCallback(
    (continuation: "submit-form" | "implement-plan-in-new-thread" | null) => {
      pendingKimiContinuationRef.current = continuation;
      setKimiApiKeyDraft(settings.kimiApiKey);
      setKimiApiKeyError(null);
      setIsKimiApiKeyDialogOpen(true);
    },
    [settings.kimiApiKey],
  );
  const ensureOpenRouterApiKeyForDispatch = useCallback(
    (input: {
      provider: ProviderKind;
      model: string;
      continuation: "submit-form" | "implement-plan-in-new-thread";
    }) => {
      if (!(input.provider === "codex" && isCodexOpenRouterModel(input.model))) {
        return true;
      }
      if (settings.openRouterApiKey.trim().length > 0) {
        return true;
      }
      openOpenRouterApiKeyDialog(input.continuation);
      return false;
    },
    [openOpenRouterApiKeyDialog, settings.openRouterApiKey],
  );
  const ensureKimiApiKeyForDispatch = useCallback(
    (input: {
      provider: ProviderKind;
      continuation: "submit-form" | "implement-plan-in-new-thread";
    }) => {
      if (input.provider !== "kimi") {
        return true;
      }
      if (settings.kimiApiKey.trim().length > 0) {
        return true;
      }
      openKimiApiKeyDialog(input.continuation);
      return false;
    },
    [openKimiApiKeyDialog, settings.kimiApiKey],
  );
  const ensureProviderCredentialsForDispatch = useCallback(
    (input: {
      provider: ProviderKind;
      model: string;
      continuation: "submit-form" | "implement-plan-in-new-thread";
    }) => {
      if (!ensureOpenRouterApiKeyForDispatch(input)) {
        return false;
      }
      return ensureKimiApiKeyForDispatch(input);
    },
    [ensureKimiApiKeyForDispatch, ensureOpenRouterApiKeyForDispatch],
  );
  const ensureProviderCredentialsConfigured = useCallback(
    (continuation: "submit-form" | "implement-plan-in-new-thread") => {
      return ensureProviderCredentialsForDispatch({
        provider: selectedProvider,
        model: selectedModel,
        continuation,
      });
    },
    [ensureProviderCredentialsForDispatch, selectedModel, selectedProvider],
  );
  const ensureOpenRouterModelSupportsToolsForDispatch = useCallback(
    (input: { provider: ProviderKind; model: string; threadId: ThreadId | undefined }) => {
      const usesOpenRouter = input.provider === "codex" && isCodexOpenRouterModel(input.model);
      if (!usesOpenRouter) {
        return true;
      }
      if (input.model === OPENROUTER_FREE_ROUTER_MODEL || !hasLiveOpenRouterCatalog) {
        return true;
      }

      const openRouterModel = openRouterModelsBySlug.get(input.model) ?? null;
      let message: string | null = null;
      if (openRouterModel === null) {
        message = `\`${input.model}\` is not in OpenRouter's current live free catalog. Refresh the list, pick another listed free model, or use \`openrouter/free\`.`;
      } else if (!supportsOpenRouterNativeToolCalling(openRouterModel)) {
        message = `${openRouterModel.name} does not advertise the full OpenRouter native tool-calling surface (\`tools\` + \`tool_choice\`), and CUT3 requires both for agent turns. Switch to another OpenRouter free model or use \`openrouter/free\`.`;
      }
      if (message === null) {
        return true;
      }

      if (input.threadId) {
        setStoreThreadError(input.threadId, message);
      } else {
        toastManager.add({
          type: "error",
          title: "OpenRouter model unavailable",
          description: message,
        });
      }
      return false;
    },
    [hasLiveOpenRouterCatalog, openRouterModelsBySlug, setStoreThreadError],
  );
  const ensureSelectedOpenRouterModelSupportsTools = useCallback(
    (threadId?: ThreadId) => {
      return ensureOpenRouterModelSupportsToolsForDispatch({
        provider: selectedProvider,
        model: selectedModel,
        threadId: threadId ?? undefined,
      });
    },
    [ensureOpenRouterModelSupportsToolsForDispatch, selectedModel, selectedProvider],
  );
  const selectedModelForPicker = selectedModel;
  const selectedModelForPickerWithCustomFallback = useMemo(() => {
    const currentOptions = getModelOptionsForProviderPicker(
      selectedProviderPickerKind,
      visibleModelOptionsByProvider,
      visibleOpenRouterModelOptions,
      visibleOpencodeModelOptions,
    );
    return currentOptions.some((option) => option.slug === selectedModelForPicker)
      ? selectedModelForPicker
      : (normalizeModelSlug(selectedModelForPicker, selectedProvider) ?? selectedModelForPicker);
  }, [
    selectedModelForPicker,
    selectedProvider,
    selectedProviderPickerKind,
    visibleModelOptionsByProvider,
    visibleOpenRouterModelOptions,
    visibleOpencodeModelOptions,
  ]);
  const selectedModelLabelOverride = useMemo(() => {
    if (
      selectedProvider !== "pi" ||
      selectedModel !== DEFAULT_MODEL_BY_PROVIDER.pi ||
      visibleAuthenticatedPiModelCount === 0
    ) {
      return undefined;
    }
    return chatCopy.authenticatedModels(visibleAuthenticatedPiModelCount);
  }, [chatCopy, selectedModel, selectedProvider, visibleAuthenticatedPiModelCount]);
  const searchableModelOptions = useMemo(
    () =>
      AVAILABLE_PROVIDER_OPTIONS.filter(
        (option) =>
          lockedProvider === null ||
          getProviderPickerBackingProvider(option.value) === lockedProvider,
      ).flatMap((option) => {
        const backingProvider = getProviderPickerBackingProvider(option.value) ?? "codex";
        return prioritizeModelOptions(
          getModelOptionsForProviderPicker(
            option.value,
            visibleModelOptionsByProvider,
            visibleOpenRouterModelOptions,
            visibleOpencodeModelOptions,
          ),
          getFavoriteModelsForProvider(backingProvider, providerFavoriteModelSettings),
          getRecentModelsForProvider(backingProvider, providerRecentModelSettings),
        ).map(({ slug, name }) => ({
          provider: backingProvider,
          providerLabel: option.label,
          slug,
          name,
          searchSlug: slug.toLowerCase(),
          searchName: name.toLowerCase(),
          searchProvider: option.label.toLowerCase(),
        }));
      }),
    [
      lockedProvider,
      visibleModelOptionsByProvider,
      visibleOpenRouterModelOptions,
      visibleOpencodeModelOptions,
      providerFavoriteModelSettings,
      providerRecentModelSettings,
    ],
  );
  const hasHiddenPickerModels = useMemo(
    () =>
      providerHiddenModelSettings.hiddenCodexModels.length > 0 ||
      providerHiddenModelSettings.hiddenCopilotModels.length > 0 ||
      providerHiddenModelSettings.hiddenOpencodeModels.length > 0 ||
      providerHiddenModelSettings.hiddenKimiModels.length > 0 ||
      providerHiddenModelSettings.hiddenPiModels.length > 0,
    [providerHiddenModelSettings],
  );
  const phase = derivePhase(activeThread?.session ?? null);
  const isConnecting = phase === "connecting";
  const isSendBusy = sendPhase !== "idle";
  const isPreparingWorktree = sendPhase === "preparing-worktree";
  const isWorking = phase === "running" || isSendBusy || isConnecting || isRevertingCheckpoint;

  // ── Desktop notification on turn completion ──────────────────────
  // Track phase/thread transitions separately so notifications only fire for
  // completed turns in the current thread, not after route switches.
  const previousNotificationStateRef = useRef({
    threadId: activeThreadId,
    phase,
  });
  const lastNotifiedTurnIdRef = useRef<TurnId | null>(null);
  const followUpMode = followUpModeByThreadId[threadId] ?? "queue";
  const hasQueuedTurns = queuedTurnsForThread.length > 0;
  const hasFailedQueuedTurn = queuedTurnsForThread.some((turn) => turn.status === "failed");
  const nowIso = new Date(nowTick).toISOString();
  const activeWorkStartedAt = deriveActiveWorkStartedAt(
    activeLatestTurn,
    activeThread?.session ?? null,
    sendStartedAt,
  );
  const threadActivities = activeThread?.activities ?? EMPTY_ACTIVITIES;
  const activeModelRerouteNotice = useMemo(
    () =>
      deriveLatestModelRerouteNotice(
        threadActivities,
        activeLatestTurn?.turnId ?? activeThread?.session?.activeTurnId ?? undefined,
      ),
    [activeLatestTurn?.turnId, activeThread?.session?.activeTurnId, threadActivities],
  );
  const workLogEntries = useMemo(
    () => deriveWorkLogEntries(threadActivities, activeLatestTurn?.turnId ?? undefined),
    [activeLatestTurn?.turnId, threadActivities],
  );
  const threadTasks = useMemo(() => deriveThreadTasks(threadActivities), [threadActivities]);
  const latestTurnHasToolActivity = useMemo(
    () => hasToolActivityForTurn(threadActivities, activeLatestTurn?.turnId),
    [activeLatestTurn?.turnId, threadActivities],
  );
  const rawPendingApprovals = useMemo(
    () => derivePendingApprovals(threadActivities, activeThread?.session?.createdAt),
    [activeThread?.session?.createdAt, threadActivities],
  );
  const pendingApprovals = useMemo(
    () =>
      rawPendingApprovals.filter(
        (approval) => !optimisticResolvedApprovalRequestIds.includes(approval.requestId),
      ),
    [optimisticResolvedApprovalRequestIds, rawPendingApprovals],
  );
  const pendingUserInputs = useMemo(
    () => derivePendingUserInputs(threadActivities, activeThread?.session?.createdAt),
    [activeThread?.session?.createdAt, threadActivities],
  );
  const activePendingUserInput = pendingUserInputs[0] ?? null;
  const activePendingDraftAnswers = useMemo(
    () =>
      activePendingUserInput
        ? (pendingUserInputAnswersByRequestId[activePendingUserInput.requestId] ??
          EMPTY_PENDING_USER_INPUT_ANSWERS)
        : EMPTY_PENDING_USER_INPUT_ANSWERS,
    [activePendingUserInput, pendingUserInputAnswersByRequestId],
  );
  const activePendingQuestionIndex = activePendingUserInput
    ? (pendingUserInputQuestionIndexByRequestId[activePendingUserInput.requestId] ?? 0)
    : 0;
  const activePendingProgress = useMemo(
    () =>
      activePendingUserInput
        ? derivePendingUserInputProgress(
            activePendingUserInput.questions,
            activePendingDraftAnswers,
            activePendingQuestionIndex,
          )
        : null,
    [activePendingDraftAnswers, activePendingQuestionIndex, activePendingUserInput],
  );
  const activePendingResolvedAnswers = useMemo(
    () =>
      activePendingUserInput
        ? buildPendingUserInputAnswers(activePendingUserInput.questions, activePendingDraftAnswers)
        : null,
    [activePendingDraftAnswers, activePendingUserInput],
  );
  const activePendingIsResponding = activePendingUserInput
    ? respondingUserInputRequestIds.includes(activePendingUserInput.requestId)
    : false;
  const activeProposedPlan = useMemo(() => {
    if (!latestTurnSettled) {
      return null;
    }
    return findLatestProposedPlan(
      activeThread?.proposedPlans ?? [],
      activeLatestTurn?.turnId ?? null,
    );
  }, [activeLatestTurn?.turnId, activeThread?.proposedPlans, latestTurnSettled]);
  const activePlan = useMemo(
    () => deriveActivePlanState(threadActivities, activeLatestTurn?.turnId ?? undefined),
    [activeLatestTurn?.turnId, threadActivities],
  );
  const showPlanFollowUpPrompt =
    pendingUserInputs.length === 0 &&
    interactionMode === "plan" &&
    latestTurnSettled &&
    activeProposedPlan !== null;
  const activePendingApproval = pendingApprovals[0] ?? null;
  const activePendingApprovalRule = useMemo(
    () =>
      activePendingApproval
        ? findMatchingApprovalRule({
            rules: settings.approvalRules,
            approval: activePendingApproval,
            activeProjectId: activeProject?.id ?? null,
          })
        : null,
    [activePendingApproval, activeProject?.id, settings.approvalRules],
  );
  const isComposerApprovalState = activePendingApproval !== null;
  const activeInterruptTurnId = deriveInterruptTurnId(
    activeLatestTurn,
    activeThread?.session ?? null,
    threadActivities,
  );
  const isInterruptingTurn =
    pendingInterruptRequest !== null &&
    activeThread?.id === pendingInterruptRequest.threadId &&
    phase === "running" &&
    (pendingInterruptRequest.turnId === null ||
      activeInterruptTurnId === null ||
      pendingInterruptRequest.turnId === activeInterruptTurnId);
  const hasComposerHeader =
    isComposerApprovalState ||
    pendingUserInputs.length > 0 ||
    (showPlanFollowUpPrompt && activeProposedPlan !== null);
  const composerFooterHasWideActions = showPlanFollowUpPrompt || activePendingProgress !== null;
  const lastSyncedPendingInputRef = useRef<{
    requestId: string | null;
    questionId: string | null;
  } | null>(null);
  useEffect(() => {
    if (
      !activeThread ||
      activeThread.id !== pendingInterruptRequest?.threadId ||
      phase !== "running"
    ) {
      if (pendingInterruptRequest !== null) {
        setPendingInterruptRequest(null);
      }
      return;
    }
    if (
      pendingInterruptRequest.turnId !== null &&
      activeInterruptTurnId !== null &&
      pendingInterruptRequest.turnId !== activeInterruptTurnId
    ) {
      setPendingInterruptRequest(null);
    }
  }, [activeInterruptTurnId, activeThread, pendingInterruptRequest, phase]);

  useEffect(() => {
    const openRequestIds = new Set(rawPendingApprovals.map((approval) => approval.requestId));
    setOptimisticResolvedApprovalRequestIds((existing) =>
      existing.filter((requestId) => openRequestIds.has(requestId)),
    );
  }, [rawPendingApprovals]);

  useEffect(() => {
    const failedRequestIds = new Set(
      threadActivities.flatMap((activity) => {
        if (activity.kind !== "provider.approval.respond.failed") {
          return [];
        }
        const requestId =
          typeof activity.payload === "object" &&
          activity.payload !== null &&
          "requestId" in activity.payload &&
          typeof activity.payload.requestId === "string"
            ? activity.payload.requestId
            : null;
        return requestId ? [requestId as ApprovalRequestId] : [];
      }),
    );
    if (failedRequestIds.size === 0) {
      return;
    }
    setOptimisticResolvedApprovalRequestIds((existing) =>
      existing.filter((requestId) => !failedRequestIds.has(requestId)),
    );
  }, [threadActivities]);

  useEffect(() => {
    const nextCustomAnswer = activePendingProgress?.customAnswer;
    if (typeof nextCustomAnswer !== "string") {
      lastSyncedPendingInputRef.current = null;
      return;
    }
    const nextRequestId = activePendingUserInput?.requestId ?? null;
    const nextQuestionId = activePendingProgress?.activeQuestion?.id ?? null;
    const questionChanged =
      lastSyncedPendingInputRef.current?.requestId !== nextRequestId ||
      lastSyncedPendingInputRef.current?.questionId !== nextQuestionId;
    const textChangedExternally = promptRef.current !== nextCustomAnswer;

    lastSyncedPendingInputRef.current = {
      requestId: nextRequestId,
      questionId: nextQuestionId,
    };

    if (!questionChanged && !textChangedExternally) {
      return;
    }

    promptRef.current = nextCustomAnswer;
    const nextCursor = collapseExpandedComposerCursor(nextCustomAnswer, nextCustomAnswer.length);
    setComposerCursor(nextCursor);
    setComposerTrigger(
      detectComposerTrigger(
        nextCustomAnswer,
        expandCollapsedComposerCursor(nextCustomAnswer, nextCursor),
      ),
    );
    setComposerHighlightedItemId(null);
  }, [
    activePendingProgress?.customAnswer,
    activePendingUserInput?.requestId,
    activePendingProgress?.activeQuestion?.id,
  ]);
  useEffect(() => {
    attachmentPreviewHandoffByMessageIdRef.current = attachmentPreviewHandoffByMessageId;
  }, [attachmentPreviewHandoffByMessageId]);
  const clearAttachmentPreviewHandoffs = useCallback(() => {
    for (const timeoutId of Object.values(attachmentPreviewHandoffTimeoutByMessageIdRef.current)) {
      window.clearTimeout(timeoutId);
    }
    attachmentPreviewHandoffTimeoutByMessageIdRef.current = {};
    for (const previewUrls of Object.values(attachmentPreviewHandoffByMessageIdRef.current)) {
      for (const previewUrl of previewUrls) {
        revokeBlobPreviewUrl(previewUrl);
      }
    }
    attachmentPreviewHandoffByMessageIdRef.current = {};
    setAttachmentPreviewHandoffByMessageId({});
  }, []);
  useEffect(() => {
    return () => {
      clearAttachmentPreviewHandoffs();
      for (const message of optimisticUserMessagesRef.current) {
        revokeUserMessagePreviewUrls(message);
      }
    };
  }, [clearAttachmentPreviewHandoffs]);
  const handoffAttachmentPreviews = useCallback((messageId: MessageId, previewUrls: string[]) => {
    if (previewUrls.length === 0) return;

    const previousPreviewUrls = attachmentPreviewHandoffByMessageIdRef.current[messageId] ?? [];
    for (const previewUrl of previousPreviewUrls) {
      if (!previewUrls.includes(previewUrl)) {
        revokeBlobPreviewUrl(previewUrl);
      }
    }
    setAttachmentPreviewHandoffByMessageId((existing) => {
      const next = {
        ...existing,
        [messageId]: previewUrls,
      };
      attachmentPreviewHandoffByMessageIdRef.current = next;
      return next;
    });

    const existingTimeout = attachmentPreviewHandoffTimeoutByMessageIdRef.current[messageId];
    if (typeof existingTimeout === "number") {
      window.clearTimeout(existingTimeout);
    }
    attachmentPreviewHandoffTimeoutByMessageIdRef.current[messageId] = window.setTimeout(() => {
      const currentPreviewUrls = attachmentPreviewHandoffByMessageIdRef.current[messageId];
      if (currentPreviewUrls) {
        for (const previewUrl of currentPreviewUrls) {
          revokeBlobPreviewUrl(previewUrl);
        }
      }
      setAttachmentPreviewHandoffByMessageId((existing) => {
        if (!(messageId in existing)) return existing;
        const next = { ...existing };
        delete next[messageId];
        attachmentPreviewHandoffByMessageIdRef.current = next;
        return next;
      });
      delete attachmentPreviewHandoffTimeoutByMessageIdRef.current[messageId];
    }, ATTACHMENT_PREVIEW_HANDOFF_TTL_MS);
  }, []);
  const serverMessages = activeThread?.messages;
  const timelineMessages = useMemo(() => {
    const messages = serverMessages ?? [];
    const serverMessagesWithPreviewHandoff =
      Object.keys(attachmentPreviewHandoffByMessageId).length === 0
        ? messages
        : // Spread only fires for the few messages that actually changed;
          // unchanged ones early-return their original reference.
          // In-place mutation would break React's immutable state contract.
          // oxlint-disable-next-line no-map-spread
          messages.map((message) => {
            if (
              message.role !== "user" ||
              !message.attachments ||
              message.attachments.length === 0
            ) {
              return message;
            }
            const handoffPreviewUrls = attachmentPreviewHandoffByMessageId[message.id];
            if (!handoffPreviewUrls || handoffPreviewUrls.length === 0) {
              return message;
            }

            let changed = false;
            let imageIndex = 0;
            const attachments = message.attachments.map((attachment) => {
              if (attachment.type !== "image") {
                return attachment;
              }
              const handoffPreviewUrl = handoffPreviewUrls[imageIndex];
              imageIndex += 1;
              if (!handoffPreviewUrl || attachment.previewUrl === handoffPreviewUrl) {
                return attachment;
              }
              changed = true;
              return {
                ...attachment,
                previewUrl: handoffPreviewUrl,
              };
            });

            return changed ? { ...message, attachments } : message;
          });

    if (optimisticUserMessages.length === 0) {
      return serverMessagesWithPreviewHandoff;
    }
    const serverIds = new Set(serverMessagesWithPreviewHandoff.map((message) => message.id));
    const pendingMessages = optimisticUserMessages.filter((message) => !serverIds.has(message.id));
    if (pendingMessages.length === 0) {
      return serverMessagesWithPreviewHandoff;
    }
    return [...serverMessagesWithPreviewHandoff, ...pendingMessages];
  }, [serverMessages, attachmentPreviewHandoffByMessageId, optimisticUserMessages]);

  // ── Desktop notification on turn completion (runs after timelineMessages) ──
  useEffect(() => {
    const previousState = previousNotificationStateRef.current;
    previousNotificationStateRef.current = {
      threadId: activeThreadId,
      phase,
    };

    if (previousState.threadId !== activeThreadId) {
      return;
    }
    if (previousState.phase !== "running" || phase === "running") {
      return;
    }
    if (!latestTurnSettled || activeLatestTurn?.state !== "completed") {
      return;
    }
    if (!activeLatestTurn?.turnId || lastNotifiedTurnIdRef.current === activeLatestTurn.turnId) {
      return;
    }

    lastNotifiedTurnIdRef.current = activeLatestTurn.turnId;
    const lastMessage = timelineMessages.at(-1);
    const snippet =
      lastMessage?.role === "assistant"
        ? (lastMessage.text ?? "").slice(0, 120)
        : settings.language === "fa"
          ? "کار agent تمام شد."
          : "Agent finished working.";
    showTurnCompleteNotification({
      threadTitle: activeThread?.title ?? "",
      messageSnippet: snippet,
    });
  }, [
    activeLatestTurn,
    activeThread?.title,
    activeThreadId,
    latestTurnSettled,
    phase,
    settings.language,
    timelineMessages,
  ]);

  const visibleWorkLogEntries = useMemo(
    () => (settings.showToolDetails ? workLogEntries : []),
    [settings.showToolDetails, workLogEntries],
  );
  const timelineEntries = useMemo(
    () =>
      deriveTimelineEntries(
        timelineMessages,
        activeThread?.proposedPlans ?? [],
        visibleWorkLogEntries,
      ),
    [activeThread?.proposedPlans, timelineMessages, visibleWorkLogEntries],
  );
  const { turnDiffSummaries, inferredCheckpointTurnCountByTurnId } =
    useTurnDiffSummaries(activeThread);
  const turnDiffSummaryByAssistantMessageId = useMemo(() => {
    const byMessageId = new Map<MessageId, TurnDiffSummary>();
    for (const summary of turnDiffSummaries) {
      if (!summary.assistantMessageId) continue;
      byMessageId.set(summary.assistantMessageId, summary);
    }
    return byMessageId;
  }, [turnDiffSummaries]);
  const revertTurnCountByUserMessageId = useMemo(() => {
    const byUserMessageId = new Map<MessageId, number>();
    for (let index = 0; index < timelineEntries.length; index += 1) {
      const entry = timelineEntries[index];
      if (!entry || entry.kind !== "message" || entry.message.role !== "user") {
        continue;
      }

      for (let nextIndex = index + 1; nextIndex < timelineEntries.length; nextIndex += 1) {
        const nextEntry = timelineEntries[nextIndex];
        if (!nextEntry || nextEntry.kind !== "message") {
          continue;
        }
        if (nextEntry.message.role === "user") {
          break;
        }
        const summary = turnDiffSummaryByAssistantMessageId.get(nextEntry.message.id);
        if (!summary) {
          continue;
        }
        const turnCount =
          summary.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[summary.turnId];
        if (typeof turnCount !== "number") {
          break;
        }
        byUserMessageId.set(entry.message.id, Math.max(0, turnCount - 1));
        break;
      }
    }

    return byUserMessageId;
  }, [inferredCheckpointTurnCountByTurnId, timelineEntries, turnDiffSummaryByAssistantMessageId]);
  const threadExportWorkspaceRoot = activeThread?.worktreePath ?? activeProject?.cwd ?? undefined;
  const threadExportDefaultFilename = useMemo(
    () =>
      activeThread ? buildThreadExportFilename(activeThread, threadExportFormat) : "thread.md",
    [activeThread, threadExportFormat],
  );
  const updateThreadExportFormat = useCallback(
    (format: ThreadExportFormat) => {
      setThreadExportFormat(format);
      const nextExtension = format === "json" ? ".json" : ".md";
      const fallbackFilename = activeThread
        ? buildThreadExportFilename(activeThread, format)
        : `thread${nextExtension}`;
      setThreadExportPath((existing) => {
        const trimmed = existing.trim();
        if (trimmed.length === 0) {
          return fallbackFilename;
        }
        return /\.(md|json)$/i.test(trimmed)
          ? trimmed.replace(/\.(md|json)$/i, nextExtension)
          : `${trimmed}${nextExtension}`;
      });
    },
    [activeThread],
  );
  const buildCurrentThreadExport = useCallback(
    (format: ThreadExportFormat) => {
      if (!activeThread) {
        return null;
      }
      const exportedAt = new Date().toISOString();
      return {
        filename: buildThreadExportFilename(activeThread, format),
        contents: buildThreadExportContents(format, {
          thread: activeThread,
          project: activeProject ?? null,
          provider: selectedProvider,
          workLogEntries,
          tasks: threadTasks,
          exportedAt,
        }),
      };
    },
    [activeProject, activeThread, selectedProvider, threadTasks, workLogEntries],
  );
  const openThreadExportDialog = useCallback(() => {
    if (!activeThread) {
      return;
    }
    setThreadExportPath((existing) =>
      existing.trim().length > 0
        ? existing
        : buildThreadExportFilename(activeThread, threadExportFormat),
    );
    setIsThreadExportDialogOpen(true);
  }, [activeThread, threadExportFormat]);
  const onDownloadThreadExport = useCallback(() => {
    const nextExport = buildCurrentThreadExport(threadExportFormat);
    if (!nextExport) {
      return;
    }
    downloadThreadExportFile(nextExport.filename, nextExport.contents, threadExportFormat);
  }, [buildCurrentThreadExport, threadExportFormat]);
  const onSaveThreadExportToWorkspace = useCallback(() => {
    const api = readNativeApi();
    const relativePath = threadExportPath.trim();
    const nextExport = buildCurrentThreadExport(threadExportFormat);
    if (!api || !threadExportWorkspaceRoot || !nextExport) {
      return;
    }
    if (!relativePath) {
      toastManager.add({
        type: "warning",
        title: "Enter a workspace path",
      });
      return;
    }

    setIsSavingThreadExport(true);
    void api.projects
      .writeFile({
        cwd: threadExportWorkspaceRoot,
        relativePath,
        contents: nextExport.contents,
      })
      .then((result) => {
        setIsThreadExportDialogOpen(false);
        toastManager.add({
          type: "success",
          title: "Thread export saved",
          description: result.relativePath,
        });
      })
      .catch((error) => {
        toastManager.add({
          type: "error",
          title: "Could not save thread export",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        });
      })
      .then(
        () => {
          setIsSavingThreadExport(false);
        },
        () => {
          setIsSavingThreadExport(false);
        },
      );
  }, [buildCurrentThreadExport, threadExportFormat, threadExportPath, threadExportWorkspaceRoot]);

  const completionSummary = useMemo(() => {
    if (!latestTurnSettled) return null;
    if (!activeLatestTurn?.startedAt) return null;
    if (!activeLatestTurn.completedAt) return null;
    if (!latestTurnHasToolActivity) return null;

    const elapsed = formatElapsed(activeLatestTurn.startedAt, activeLatestTurn.completedAt);
    return elapsed ? chatCopy.workedFor(elapsed) : null;
  }, [
    activeLatestTurn?.completedAt,
    activeLatestTurn?.startedAt,
    chatCopy,
    latestTurnHasToolActivity,
    latestTurnSettled,
  ]);
  const completionDividerBeforeEntryId = useMemo(() => {
    if (!latestTurnSettled) return null;
    if (!activeLatestTurn?.startedAt) return null;
    if (!activeLatestTurn.completedAt) return null;
    if (!completionSummary) return null;

    const turnStartedAt = Date.parse(activeLatestTurn.startedAt);
    const turnCompletedAt = Date.parse(activeLatestTurn.completedAt);
    if (Number.isNaN(turnStartedAt)) return null;
    if (Number.isNaN(turnCompletedAt)) return null;

    let inRangeMatch: string | null = null;
    let fallbackMatch: string | null = null;
    for (const timelineEntry of timelineEntries) {
      if (timelineEntry.kind !== "message") continue;
      if (timelineEntry.message.role !== "assistant") continue;
      const messageAt = Date.parse(timelineEntry.message.createdAt);
      if (Number.isNaN(messageAt) || messageAt < turnStartedAt) continue;
      fallbackMatch = timelineEntry.id;
      if (messageAt <= turnCompletedAt) {
        inRangeMatch = timelineEntry.id;
      }
    }
    return inRangeMatch ?? fallbackMatch;
  }, [
    activeLatestTurn?.completedAt,
    activeLatestTurn?.startedAt,
    completionSummary,
    latestTurnSettled,
    timelineEntries,
  ]);
  const gitCwd = activeThread?.worktreePath ?? activeProject?.cwd ?? null;
  const activeWorkspaceCwd = gitCwd ?? activeProject?.cwd ?? null;
  const activeServerThreadId = serverThread?.id ?? null;
  const composerTriggerKind = composerTrigger?.kind ?? null;
  const pathTriggerQuery = composerTrigger?.kind === "path" ? composerTrigger.query : "";
  const isPathTrigger = composerTriggerKind === "path";
  const [debouncedPathQuery, composerPathQueryDebouncer] = useDebouncedValue(
    pathTriggerQuery,
    { wait: COMPOSER_PATH_QUERY_DEBOUNCE_MS },
    (debouncerState) => ({ isPending: debouncerState.isPending }),
  );
  const effectivePathQuery = pathTriggerQuery.length > 0 ? debouncedPathQuery : "";
  const branchesQuery = useQuery(gitBranchesQueryOptions(gitCwd));
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const providerStatuses = serverConfigQuery.data?.providers ?? EMPTY_PROVIDER_STATUSES;
  const resolvedProviderStatusModelOptionsByProvider = useMemo(
    () => ({
      codex: getProviderStatusModelOptions(findProviderStatus(providerStatuses, "codex")),
      copilot: getProviderStatusModelOptions(findProviderStatus(providerStatuses, "copilot")),
      opencode: getProviderStatusModelOptions(findProviderStatus(providerStatuses, "opencode")),
      kimi: getProviderStatusModelOptions(findProviderStatus(providerStatuses, "kimi")),
      pi: getProviderStatusModelOptions(findProviderStatus(providerStatuses, "pi")),
    }),
    [providerStatuses],
  );
  useEffect(() => {
    setProviderStatusModelOptionsByProvider(resolvedProviderStatusModelOptionsByProvider);
  }, [resolvedProviderStatusModelOptionsByProvider]);
  const agentsFileQuery = useQuery(
    projectAgentsFileQueryOptions({
      cwd: activeWorkspaceCwd,
    }),
  );
  const projectSkillsQuery = useQuery(
    projectSkillsQueryOptions({
      cwd: activeWorkspaceCwd,
    }),
  );
  const commandTemplatesQuery = useQuery(
    projectCommandTemplatesQueryOptions({
      cwd: activeWorkspaceCwd,
    }),
  );
  const threadShareStatusQuery = useQuery(threadShareStatusQueryOptions(activeServerThreadId));
  const threadRedoStatusQuery = useQuery(threadRedoStatusQueryOptions(activeServerThreadId));
  const createThreadShareMutation = useMutation(
    threadCreateShareMutationOptions({
      threadId: activeServerThreadId,
      queryClient,
    }),
  );
  const revokeThreadShareMutation = useMutation(
    threadRevokeShareMutationOptions({
      shareId:
        threadShareStatusQuery.data?.share && threadShareStatusQuery.data.share.revokedAt === null
          ? threadShareStatusQuery.data.share.shareId
          : null,
      threadId: activeServerThreadId,
      queryClient,
    }),
  );
  const compactThreadMutation = useMutation(
    threadCompactMutationOptions({
      threadId: activeServerThreadId,
      queryClient,
    }),
  );
  const undoThreadMutation = useMutation(
    threadUndoMutationOptions({
      threadId: activeServerThreadId,
      queryClient,
    }),
  );
  const redoThreadMutation = useMutation(
    threadRedoMutationOptions({
      threadId: activeServerThreadId,
      queryClient,
    }),
  );
  const workspaceEntriesQuery = useQuery(
    projectSearchEntriesQueryOptions({
      cwd: gitCwd,
      query: effectivePathQuery,
      enabled: isPathTrigger,
      limit: 80,
    }),
  );
  const workspaceEntries = workspaceEntriesQuery.data?.entries ?? EMPTY_PROJECT_ENTRIES;
  const projectSkills = projectSkillsQuery.data?.skills ?? EMPTY_PROJECT_SKILLS;
  const projectSkillIssues = projectSkillsQuery.data?.issues ?? EMPTY_PROJECT_SKILL_ISSUES;
  const projectCommandTemplates =
    commandTemplatesQuery.data?.commands ?? EMPTY_PROJECT_COMMAND_TEMPLATES;
  const projectSkillsByName = useMemo(
    () => new Map(projectSkills.map((skill) => [skill.name, skill] as const)),
    [projectSkills],
  );
  const selectedSkillChips = useMemo(
    () =>
      selectedSkillNames.map((skillName) => ({
        name: skillName,
        description: projectSkillsByName.get(skillName)?.description ?? null,
        available: projectSkillsByName.has(skillName),
      })),
    [projectSkillsByName, selectedSkillNames],
  );
  const activeShare =
    threadShareStatusQuery.data?.share && threadShareStatusQuery.data.share.revokedAt === null
      ? threadShareStatusQuery.data.share
      : null;
  const activeShareUrl = useMemo(() => buildSharedThreadUrl(activeShare), [activeShare]);
  const latestResumeContext = useMemo(
    () => parseLatestResumeContextActivity(activeThread?.activities ?? EMPTY_ACTIVITIES),
    [activeThread?.activities],
  );
  const latestImportActivity = useMemo(
    () => parseLatestThreadImportActivity(activeThread?.activities ?? EMPTY_ACTIVITIES),
    [activeThread?.activities],
  );
  const latestSkillsActivity = useMemo(
    () => parseLatestThreadSkillsActivity(activeThread?.activities ?? EMPTY_ACTIVITIES),
    [activeThread?.activities],
  );
  const latestAppliedSkillChips = useMemo(
    () =>
      (latestSkillsActivity?.skills ?? []).map((skillName) => ({
        name: skillName,
        description: projectSkillsByName.get(skillName)?.description ?? null,
      })),
    [latestSkillsActivity?.skills, projectSkillsByName],
  );
  const baseShareAvailable =
    isServerThread && phase !== "running" && !isSendBusy && !isConnecting && !isRevertingCheckpoint;
  const canCreateShareThread = canCreateThreadShareLink({
    shareMode: settings.threadShareMode,
    baseShareAvailable,
    hasActiveShare: activeShare !== null,
  });
  const canShareThread = canOpenThreadShareDialog({
    shareMode: settings.threadShareMode,
    baseShareAvailable,
    hasActiveShare: activeShare !== null,
  });
  const canCompactThread =
    baseShareAvailable &&
    !compactThreadMutation.isPending &&
    (activeThread?.messages.length ?? 0) > 0;
  const canUndoThread =
    isServerThread &&
    (activeThread?.messages.length ?? 0) > 0 &&
    phase !== "running" &&
    !isSendBusy &&
    !isConnecting &&
    !isRevertingCheckpoint &&
    !undoThreadMutation.isPending;
  const canRedoThread =
    isServerThread &&
    threadRedoStatusQuery.data?.available === true &&
    phase !== "running" &&
    !isSendBusy &&
    !isConnecting &&
    !isRevertingCheckpoint &&
    !redoThreadMutation.isPending;
  const providerMcpStatuses = useMemo<ServerProviderMcpStatus[]>(() => {
    const baseStatuses = serverConfigQuery.data?.mcpServers ?? EMPTY_PROVIDER_MCP_STATUSES;
    const mergedStatuses = new Map(baseStatuses.map((status) => [status.provider, status]));

    if (openCodeStateQuery.data) {
      mergedStatuses.set("opencode", {
        provider: "opencode",
        supported: openCodeStateQuery.data.mcpSupported,
        servers: openCodeStateQuery.data.mcpSupported ? openCodeStateQuery.data.mcpServers : [],
      });
    }

    return (["codex", "copilot", "kimi", "opencode", "pi"] as const)
      .map((provider) => mergedStatuses.get(provider))
      .filter((status): status is ServerProviderMcpStatus => status != null);
  }, [openCodeStateQuery.data, serverConfigQuery.data?.mcpServers]);
  const composerMcpProvider: ProviderKind = useMemo(() => {
    const provider = activeThread?.session?.provider ?? activeThread?.provider;
    return provider === "codex" ||
      provider === "copilot" ||
      provider === "kimi" ||
      provider === "opencode" ||
      provider === "pi"
      ? provider
      : selectedProvider;
  }, [activeThread?.provider, activeThread?.session?.provider, selectedProvider]);
  const composerMcpSupported = useMemo(
    () => providerSupportsMcp(providerMcpStatuses, composerMcpProvider),
    [composerMcpProvider, providerMcpStatuses],
  );
  const composerMenuItems = useMemo<ComposerCommandItem[]>(() => {
    if (!composerTrigger) return [];
    if (composerTrigger.kind === "path") {
      return workspaceEntries.map((entry) => ({
        id: `path:${entry.kind}:${entry.path}`,
        type: "path",
        path: entry.path,
        pathKind: entry.kind,
        label: basenameOfPath(entry.path),
        description: entry.parentPath ?? "",
      }));
    }

    if (composerTrigger.kind === "slash-command") {
      const slashCommandItems: Array<Extract<ComposerCommandItem, { type: "slash-command" }>> = [
        {
          id: "slash:model",
          type: "slash-command",
          command: "model",
          label: "/model",
          description: "Switch response model for this thread",
          aliases: getComposerSlashCommandAliases("model"),
        },
        {
          id: "slash:plan",
          type: "slash-command",
          command: "plan",
          label: "/plan",
          description: "Switch this thread into plan mode",
          aliases: getComposerSlashCommandAliases("plan"),
        },
        {
          id: "slash:default",
          type: "slash-command",
          command: "default",
          label: "/default",
          description: "Switch this thread back to normal chat mode",
          aliases: getComposerSlashCommandAliases("default"),
        },
        {
          id: "slash:init",
          type: "slash-command",
          command: "init",
          label: "/init",
          description:
            agentsFileQuery.data?.status === "available"
              ? "Update the workspace AGENTS.md file"
              : "Create the workspace AGENTS.md file",
          aliases: getComposerSlashCommandAliases("init"),
        },
        {
          id: "slash:new",
          type: "slash-command",
          command: "new",
          label: "/new",
          description: "Start a new draft thread",
          aliases: getComposerSlashCommandAliases("new"),
        },
        {
          id: "slash:compact",
          type: "slash-command",
          command: "compact",
          label: "/compact",
          description: "Compact this thread into a continuation summary",
          aliases: getComposerSlashCommandAliases("compact"),
        },
        {
          id: "slash:share",
          type: "slash-command",
          command: "share",
          label: "/share",
          description: activeShareUrl
            ? "Copy the current share link"
            : settings.threadShareMode === "disabled"
              ? "Sharing is disabled in Settings"
              : "Create a read-only share link for this thread",
          aliases: getComposerSlashCommandAliases("share"),
        },
        {
          id: "slash:unshare",
          type: "slash-command",
          command: "unshare",
          label: "/unshare",
          description: activeShare ? "Revoke the current share link" : "No active share link",
          aliases: getComposerSlashCommandAliases("unshare"),
        },
        {
          id: "slash:undo",
          type: "slash-command",
          command: "undo",
          label: "/undo",
          description: canUndoThread ? "Undo the latest completed turn" : "Nothing to undo yet",
          aliases: getComposerSlashCommandAliases("undo"),
        },
        {
          id: "slash:redo",
          type: "slash-command",
          command: "redo",
          label: "/redo",
          description: canRedoThread
            ? "Restore the latest undone turn"
            : "No redo snapshot available",
          aliases: getComposerSlashCommandAliases("redo"),
        },
        {
          id: "slash:export",
          type: "slash-command",
          command: "export",
          label: "/export",
          description: isServerThread
            ? "Export this thread as markdown or JSON"
            : "Send at least one turn before exporting",
          aliases: getComposerSlashCommandAliases("export"),
        },
        {
          id: "slash:details",
          type: "slash-command",
          command: "details",
          label: "/details",
          description: settings.showToolDetails
            ? "Hide tool details in the timeline"
            : "Show tool details in the timeline",
          aliases: getComposerSlashCommandAliases("details"),
        },
      ];
      if (composerMcpSupported) {
        slashCommandItems.splice(1, 0, {
          id: "slash:mcp",
          type: "slash-command",
          command: "mcp",
          label: "/mcp",
          description: "Show MCP servers for the active provider",
          aliases: getComposerSlashCommandAliases("mcp"),
        });
      }
      const templateItems: Array<Extract<ComposerCommandItem, { type: "template" }>> =
        projectCommandTemplates.map((template) => ({
          id: `template:${template.name}`,
          type: "template",
          template,
          label: `/${template.name}`,
          description: template.description,
          sendImmediately: template.sendImmediately === true,
        }));
      const query = composerTrigger.query.trim().toLowerCase();
      if (!query) {
        return [...slashCommandItems, ...templateItems];
      }
      return [...slashCommandItems, ...templateItems].filter((item) => {
        if (item.type === "slash-command") {
          return (
            item.command.includes(query) ||
            item.label.slice(1).includes(query) ||
            item.aliases?.some((alias) => alias.includes(query)) === true
          );
        }
        return (
          item.template.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.label.slice(1).toLowerCase().includes(query)
        );
      });
    }

    if (composerTrigger.kind === "slash-mcp") {
      return buildComposerMcpServerItems({
        provider: composerMcpProvider,
        providerMcpStatuses,
        query: composerTrigger.query,
      }).map((item) => ({
        id: item.id,
        type: "mcp-server",
        provider: item.provider,
        serverName: item.name,
        state: item.state,
        label: item.name,
        description: item.description,
      }));
    }

    return searchableModelOptions
      .filter(({ searchSlug, searchName, searchProvider }) => {
        const query = composerTrigger.query.trim().toLowerCase();
        if (!query) return true;
        return (
          searchSlug.includes(query) || searchName.includes(query) || searchProvider.includes(query)
        );
      })
      .map(({ provider, providerLabel, slug, name }) => ({
        id: `model:${provider}:${slug}`,
        type: "model",
        provider,
        model: slug,
        label: name,
        description: `${providerLabel} · ${slug}`,
        showFastBadge:
          provider === "codex" && shouldShowFastTierIcon(slug, selectedServiceTierSetting),
      }));
  }, [
    activeShare,
    activeShareUrl,
    canRedoThread,
    canUndoThread,
    composerMcpSupported,
    composerMcpProvider,
    composerTrigger,
    agentsFileQuery.data?.status,
    isServerThread,
    projectCommandTemplates,
    providerMcpStatuses,
    searchableModelOptions,
    selectedServiceTierSetting,
    settings.showToolDetails,
    settings.threadShareMode,
    workspaceEntries,
  ]);
  const composerMenuOpen = Boolean(composerTrigger);
  const activeComposerMenuItem = useMemo(
    () =>
      composerMenuItems.find((item) => item.id === composerHighlightedItemId) ??
      composerMenuItems[0] ??
      null,
    [composerHighlightedItemId, composerMenuItems],
  );
  composerMenuOpenRef.current = composerMenuOpen;
  composerMenuItemsRef.current = composerMenuItems;
  activeComposerMenuItemRef.current = activeComposerMenuItem;
  const nonPersistedComposerImageIdSet = useMemo(
    () => new Set(nonPersistedComposerImageIds),
    [nonPersistedComposerImageIds],
  );
  const keybindings = serverConfigQuery.data?.keybindings ?? EMPTY_KEYBINDINGS;
  const availableEditors = serverConfigQuery.data?.availableEditors ?? EMPTY_AVAILABLE_EDITORS;
  const activeProviderStatus = useMemo(() => {
    return resolveVisibleProviderStatusForChat({
      providerStatuses,
      selectedProvider,
      sessionProvider,
      sessionStatus: activeThread?.session?.orchestrationStatus ?? null,
      selectedModelUsesOpenRouter,
    });
  }, [
    activeThread?.session?.orchestrationStatus,
    providerStatuses,
    selectedProvider,
    selectedModelUsesOpenRouter,
    sessionProvider,
  ]);
  const activeProjectCwd = activeProject?.cwd ?? null;
  const activeThreadWorktreePath = activeThread?.worktreePath ?? null;
  const threadTerminalRuntimeEnv = useMemo(() => {
    if (!activeProjectCwd) return {};
    return projectScriptRuntimeEnv({
      project: {
        cwd: activeProjectCwd,
      },
      worktreePath: activeThreadWorktreePath,
    });
  }, [activeProjectCwd, activeThreadWorktreePath]);
  // Default true while loading to avoid toolbar flicker.
  const isGitRepo = branchesQuery.data?.isRepo ?? true;
  const splitTerminalShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "terminal.split"),
    [keybindings],
  );
  const newTerminalShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "terminal.new"),
    [keybindings],
  );
  const closeTerminalShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "terminal.close"),
    [keybindings],
  );
  const diffPanelShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "diff.toggle"),
    [keybindings],
  );
  const onToggleDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      replace: true,
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return diffOpen ? { ...rest, diff: undefined } : { ...rest, diff: "1" };
      },
    });
  }, [diffOpen, navigate, threadId]);

  const envLocked = Boolean(
    activeThread &&
    (activeThread.messages.length > 0 ||
      (activeThread.session !== null && activeThread.session.status !== "closed")),
  );
  const activeTerminalGroup =
    terminalState.terminalGroups.find(
      (group) => group.id === terminalState.activeTerminalGroupId,
    ) ??
    terminalState.terminalGroups.find((group) =>
      group.terminalIds.includes(terminalState.activeTerminalId),
    ) ??
    null;
  const hasReachedSplitLimit =
    (activeTerminalGroup?.terminalIds.length ?? 0) >= MAX_TERMINALS_PER_GROUP;
  const setThreadError = useCallback(
    (targetThreadId: ThreadId | null, error: string | null) => {
      if (!targetThreadId) return;
      if (threads.some((thread) => thread.id === targetThreadId)) {
        setStoreThreadError(targetThreadId, error);
        return;
      }
      setLocalDraftErrorsByThreadId((existing) => {
        if ((existing[targetThreadId] ?? null) === error) {
          return existing;
        }
        return {
          ...existing,
          [targetThreadId]: error,
        };
      });
    },
    [setStoreThreadError, threads],
  );

  const focusComposer = useCallback(() => {
    composerEditorRef.current?.focusAtEnd();
  }, []);
  const scheduleComposerFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      focusComposer();
    });
  }, [focusComposer]);
  const setTerminalOpen = useCallback(
    (open: boolean) => {
      if (!activeThreadId) return;
      storeSetTerminalOpen(activeThreadId, open);
    },
    [activeThreadId, storeSetTerminalOpen],
  );
  const setTerminalHeight = useCallback(
    (height: number) => {
      if (!activeThreadId) return;
      storeSetTerminalHeight(activeThreadId, height);
    },
    [activeThreadId, storeSetTerminalHeight],
  );
  const toggleTerminalVisibility = useCallback(() => {
    if (!activeThreadId) return;
    setTerminalOpen(!terminalState.terminalOpen);
  }, [activeThreadId, setTerminalOpen, terminalState.terminalOpen]);
  const splitTerminal = useCallback(() => {
    if (!activeThreadId || hasReachedSplitLimit) return;
    const terminalId = `terminal-${randomUUID()}`;
    storeSplitTerminal(activeThreadId, terminalId);
    setTerminalFocusRequestId((value) => value + 1);
  }, [activeThreadId, hasReachedSplitLimit, storeSplitTerminal]);
  const createNewTerminal = useCallback(() => {
    if (!activeThreadId) return;
    const terminalId = `terminal-${randomUUID()}`;
    storeNewTerminal(activeThreadId, terminalId);
    setTerminalFocusRequestId((value) => value + 1);
  }, [activeThreadId, storeNewTerminal]);
  const activateTerminal = useCallback(
    (terminalId: string) => {
      if (!activeThreadId) return;
      storeSetActiveTerminal(activeThreadId, terminalId);
      setTerminalFocusRequestId((value) => value + 1);
    },
    [activeThreadId, storeSetActiveTerminal],
  );
  const closeTerminal = useCallback(
    (terminalId: string) => {
      const api = readNativeApi();
      if (!activeThreadId || !api) return;
      const isFinalTerminal = terminalState.terminalIds.length <= 1;
      const fallbackExitWrite = () =>
        api.terminal
          .write({ threadId: activeThreadId, terminalId, data: "exit\n" })
          .catch(() => undefined);
      if ("close" in api.terminal && typeof api.terminal.close === "function") {
        void (async () => {
          if (isFinalTerminal) {
            await api.terminal
              .clear({ threadId: activeThreadId, terminalId })
              .catch(() => undefined);
          }
          await api.terminal.close({ threadId: activeThreadId, terminalId, deleteHistory: true });
        })().catch(() => fallbackExitWrite());
      } else {
        void fallbackExitWrite();
      }
      storeCloseTerminal(activeThreadId, terminalId);
      setTerminalFocusRequestId((value) => value + 1);
    },
    [activeThreadId, storeCloseTerminal, terminalState.terminalIds.length],
  );
  const runProjectScript = useCallback(
    async (
      script: ProjectScript,
      options?: {
        cwd?: string;
        env?: Record<string, string>;
        worktreePath?: string | null;
        preferNewTerminal?: boolean;
        rememberAsLastInvoked?: boolean;
        allowLocalDraftThread?: boolean;
      },
    ) => {
      const api = readNativeApi();
      if (!api || !activeThreadId || !activeProject || !activeThread) return;
      if (!isServerThread && !options?.allowLocalDraftThread) return;
      if (options?.rememberAsLastInvoked !== false) {
        setLastInvokedScriptByProjectId((current) => {
          if (current[activeProject.id] === script.id) return current;
          return { ...current, [activeProject.id]: script.id };
        });
      }
      const targetCwd = options?.cwd ?? gitCwd ?? activeProject.cwd;
      const baseTerminalId =
        terminalState.activeTerminalId ||
        terminalState.terminalIds[0] ||
        DEFAULT_THREAD_TERMINAL_ID;
      const isBaseTerminalBusy = terminalState.runningTerminalIds.includes(baseTerminalId);
      const wantsNewTerminal = Boolean(options?.preferNewTerminal) || isBaseTerminalBusy;
      const shouldCreateNewTerminal = wantsNewTerminal;
      const targetTerminalId = shouldCreateNewTerminal
        ? `terminal-${randomUUID()}`
        : baseTerminalId;

      setTerminalOpen(true);
      if (shouldCreateNewTerminal) {
        storeNewTerminal(activeThreadId, targetTerminalId);
      } else {
        storeSetActiveTerminal(activeThreadId, targetTerminalId);
      }
      setTerminalFocusRequestId((value) => value + 1);

      const runtimeEnv = projectScriptRuntimeEnv({
        project: {
          cwd: activeProject.cwd,
        },
        worktreePath: options?.worktreePath ?? activeThread.worktreePath ?? null,
        ...(options?.env ? { extraEnv: options.env } : {}),
      });
      const openTerminalInput: Parameters<typeof api.terminal.open>[0] = shouldCreateNewTerminal
        ? {
            threadId: activeThreadId,
            terminalId: targetTerminalId,
            cwd: targetCwd,
            env: runtimeEnv,
            cols: SCRIPT_TERMINAL_COLS,
            rows: SCRIPT_TERMINAL_ROWS,
          }
        : {
            threadId: activeThreadId,
            terminalId: targetTerminalId,
            cwd: targetCwd,
            env: runtimeEnv,
          };

      try {
        await api.terminal.open(openTerminalInput);
        await api.terminal.write({
          threadId: activeThreadId,
          terminalId: targetTerminalId,
          data: `${script.command}\r`,
        });
      } catch (error) {
        setThreadError(
          activeThreadId,
          error instanceof Error ? error.message : `Failed to run script "${script.name}".`,
        );
      }
    },
    [
      activeProject,
      activeThread,
      activeThreadId,
      gitCwd,
      isServerThread,
      setTerminalOpen,
      setThreadError,
      storeNewTerminal,
      storeSetActiveTerminal,
      setLastInvokedScriptByProjectId,
      terminalState.activeTerminalId,
      terminalState.runningTerminalIds,
      terminalState.terminalIds,
    ],
  );
  const persistProjectScripts = useCallback(
    async (input: {
      projectId: ProjectId;
      projectCwd: string;
      previousScripts: ProjectScript[];
      nextScripts: ProjectScript[];
      keybinding?: string | null;
      keybindingCommand: KeybindingCommand;
    }) => {
      const api = readNativeApi();
      if (!api) return;

      await api.orchestration.dispatchCommand({
        type: "project.meta.update",
        commandId: newCommandId(),
        projectId: input.projectId,
        scripts: input.nextScripts,
      });

      const keybindingRule = decodeProjectScriptKeybindingRule({
        keybinding: input.keybinding,
        command: input.keybindingCommand,
      });

      if (isElectron && keybindingRule) {
        await api.server.upsertKeybinding(keybindingRule);
        await queryClient.invalidateQueries({ queryKey: serverQueryKeys.all });
      }
    },
    [queryClient],
  );
  const saveProjectScript = useCallback(
    async (input: NewProjectScriptInput) => {
      if (!activeProject) return;
      const nextId = nextProjectScriptId(
        input.name,
        activeProject.scripts.map((script) => script.id),
      );
      const nextScript: ProjectScript = {
        id: nextId,
        name: input.name,
        command: input.command,
        icon: input.icon,
        runOnWorktreeCreate: input.runOnWorktreeCreate,
      };
      const nextScripts = input.runOnWorktreeCreate
        ? [
            ...activeProject.scripts.map((script) =>
              script.runOnWorktreeCreate ? { ...script, runOnWorktreeCreate: false } : script,
            ),
            nextScript,
          ]
        : [...activeProject.scripts, nextScript];

      await persistProjectScripts({
        projectId: activeProject.id,
        projectCwd: activeProject.cwd,
        previousScripts: activeProject.scripts,
        nextScripts,
        keybinding: input.keybinding,
        keybindingCommand: commandForProjectScript(nextId),
      });
    },
    [activeProject, persistProjectScripts],
  );
  const updateProjectScript = useCallback(
    async (scriptId: string, input: NewProjectScriptInput) => {
      if (!activeProject) return;
      const existingScript = activeProject.scripts.find((script) => script.id === scriptId);
      if (!existingScript) {
        throw new Error("Script not found.");
      }

      const updatedScript: ProjectScript = {
        ...existingScript,
        name: input.name,
        command: input.command,
        icon: input.icon,
        runOnWorktreeCreate: input.runOnWorktreeCreate,
      };
      const nextScripts = activeProject.scripts.map((script) =>
        script.id === scriptId
          ? updatedScript
          : input.runOnWorktreeCreate
            ? { ...script, runOnWorktreeCreate: false }
            : script,
      );

      await persistProjectScripts({
        projectId: activeProject.id,
        projectCwd: activeProject.cwd,
        previousScripts: activeProject.scripts,
        nextScripts,
        keybinding: input.keybinding,
        keybindingCommand: commandForProjectScript(scriptId),
      });
    },
    [activeProject, persistProjectScripts],
  );
  const deleteProjectScript = useCallback(
    async (scriptId: string) => {
      if (!activeProject) return;
      const nextScripts = activeProject.scripts.filter((script) => script.id !== scriptId);

      const deletedName = activeProject.scripts.find((s) => s.id === scriptId)?.name;

      try {
        await persistProjectScripts({
          projectId: activeProject.id,
          projectCwd: activeProject.cwd,
          previousScripts: activeProject.scripts,
          nextScripts,
          keybinding: null,
          keybindingCommand: commandForProjectScript(scriptId),
        });
        toastManager.add({
          type: "success",
          title: `Deleted action "${deletedName ?? "Unknown"}"`,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not delete action",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        });
      }
    },
    [activeProject, persistProjectScripts],
  );

  const handleRuntimeModeChange = useCallback(
    (mode: RuntimeMode) => {
      if (mode === runtimeMode) return;
      setComposerDraftRuntimeMode(threadId, mode);
      if (isLocalDraftThread) {
        setDraftThreadContext(threadId, { runtimeMode: mode });
      }
      scheduleComposerFocus();
    },
    [
      isLocalDraftThread,
      runtimeMode,
      scheduleComposerFocus,
      setComposerDraftRuntimeMode,
      setDraftThreadContext,
      threadId,
    ],
  );

  const handleInteractionModeChange = useCallback(
    (mode: ProviderInteractionMode) => {
      if (mode === interactionMode) return;
      setComposerDraftInteractionMode(threadId, mode);
      if (isLocalDraftThread) {
        setDraftThreadContext(threadId, { interactionMode: mode });
      }
      scheduleComposerFocus();
    },
    [
      interactionMode,
      isLocalDraftThread,
      scheduleComposerFocus,
      setComposerDraftInteractionMode,
      setDraftThreadContext,
      threadId,
    ],
  );
  const toggleInteractionMode = useCallback(() => {
    handleInteractionModeChange(interactionMode === "plan" ? "default" : "plan");
  }, [handleInteractionModeChange, interactionMode]);
  const toggleRuntimeMode = useCallback(() => {
    void handleRuntimeModeChange(
      runtimeMode === "full-access" ? "approval-required" : "full-access",
    );
  }, [handleRuntimeModeChange, runtimeMode]);
  const togglePlanSidebar = useCallback(() => {
    setPlanSidebarOpen((open) => {
      if (open) {
        const turnKey = activePlan?.turnId ?? activeProposedPlan?.turnId ?? null;
        if (turnKey) {
          planSidebarDismissedForTurnRef.current = turnKey;
        }
      } else {
        planSidebarDismissedForTurnRef.current = null;
      }
      return !open;
    });
  }, [activePlan?.turnId, activeProposedPlan?.turnId]);

  const persistThreadSettingsForNextTurn = useCallback(
    async (input: {
      threadId: ThreadId;
      createdAt: string;
      model?: string;
      runtimeMode: RuntimeMode;
      interactionMode: ProviderInteractionMode;
    }) => {
      if (!serverThread) {
        return;
      }
      const api = readNativeApi();
      if (!api) {
        return;
      }

      if (input.model !== undefined && input.model !== serverThread.model) {
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId: input.threadId,
          model: input.model,
        });
      }

      if (input.runtimeMode !== serverThread.runtimeMode) {
        await api.orchestration.dispatchCommand({
          type: "thread.runtime-mode.set",
          commandId: newCommandId(),
          threadId: input.threadId,
          runtimeMode: input.runtimeMode,
          createdAt: input.createdAt,
        });
      }

      if (input.interactionMode !== serverThread.interactionMode) {
        await api.orchestration.dispatchCommand({
          type: "thread.interaction-mode.set",
          commandId: newCommandId(),
          threadId: input.threadId,
          interactionMode: input.interactionMode,
          createdAt: input.createdAt,
        });
      }
    },
    [serverThread],
  );

  // Auto-scroll on new messages
  const messageCount = timelineMessages.length;
  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const scrollContainer = messagesScrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior });
    lastKnownScrollTopRef.current = scrollContainer.scrollTop;
    shouldAutoScrollRef.current = true;
  }, []);
  const cancelPendingStickToBottom = useCallback(() => {
    const pendingFrame = pendingAutoScrollFrameRef.current;
    if (pendingFrame === null) return;
    pendingAutoScrollFrameRef.current = null;
    window.cancelAnimationFrame(pendingFrame);
  }, []);
  const cancelPendingInteractionAnchorAdjustment = useCallback(() => {
    const pendingFrame = pendingInteractionAnchorFrameRef.current;
    if (pendingFrame === null) return;
    pendingInteractionAnchorFrameRef.current = null;
    window.cancelAnimationFrame(pendingFrame);
  }, []);
  const scheduleStickToBottom = useCallback(() => {
    if (pendingAutoScrollFrameRef.current !== null) return;
    pendingAutoScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingAutoScrollFrameRef.current = null;
      scrollMessagesToBottom();
    });
  }, [scrollMessagesToBottom]);
  const onMessagesClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const scrollContainer = messagesScrollRef.current;
      if (!scrollContainer || !(event.target instanceof Element)) return;

      const trigger = event.target.closest<HTMLElement>(
        "button, summary, [role='button'], [data-scroll-anchor-target]",
      );
      if (!trigger || !scrollContainer.contains(trigger)) return;
      if (trigger.closest("[data-scroll-anchor-ignore]")) return;

      pendingInteractionAnchorRef.current = {
        element: trigger,
        top: trigger.getBoundingClientRect().top,
      };

      cancelPendingInteractionAnchorAdjustment();
      pendingInteractionAnchorFrameRef.current = window.requestAnimationFrame(() => {
        pendingInteractionAnchorFrameRef.current = null;
        const anchor = pendingInteractionAnchorRef.current;
        pendingInteractionAnchorRef.current = null;
        const activeScrollContainer = messagesScrollRef.current;
        if (!anchor || !activeScrollContainer) return;
        if (!anchor.element.isConnected || !activeScrollContainer.contains(anchor.element)) return;

        const nextTop = anchor.element.getBoundingClientRect().top;
        const delta = nextTop - anchor.top;
        if (Math.abs(delta) < 0.5) return;

        activeScrollContainer.scrollTop += delta;
        lastKnownScrollTopRef.current = activeScrollContainer.scrollTop;
      });
    },
    [cancelPendingInteractionAnchorAdjustment],
  );
  const forceStickToBottom = useCallback(() => {
    cancelPendingStickToBottom();
    scrollMessagesToBottom();
    scheduleStickToBottom();
  }, [cancelPendingStickToBottom, scheduleStickToBottom, scrollMessagesToBottom]);
  const onMessagesScroll = useCallback(() => {
    const scrollContainer = messagesScrollRef.current;
    if (!scrollContainer) return;
    const currentScrollTop = scrollContainer.scrollTop;
    const isNearBottom = isScrollContainerNearBottom(scrollContainer);

    if (!shouldAutoScrollRef.current && isNearBottom) {
      shouldAutoScrollRef.current = true;
      pendingUserScrollUpIntentRef.current = false;
    } else if (shouldAutoScrollRef.current && pendingUserScrollUpIntentRef.current) {
      const scrolledUp = currentScrollTop < lastKnownScrollTopRef.current - 1;
      if (scrolledUp) {
        shouldAutoScrollRef.current = false;
      }
      pendingUserScrollUpIntentRef.current = false;
    } else if (shouldAutoScrollRef.current && isPointerScrollActiveRef.current) {
      const scrolledUp = currentScrollTop < lastKnownScrollTopRef.current - 1;
      if (scrolledUp) {
        shouldAutoScrollRef.current = false;
      }
    } else if (shouldAutoScrollRef.current && !isNearBottom) {
      // Catch-all for keyboard/assistive scroll interactions.
      const scrolledUp = currentScrollTop < lastKnownScrollTopRef.current - 1;
      if (scrolledUp) {
        shouldAutoScrollRef.current = false;
      }
    }

    setShowScrollToBottom(!shouldAutoScrollRef.current);
    lastKnownScrollTopRef.current = currentScrollTop;
  }, []);
  const onMessagesWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) {
      pendingUserScrollUpIntentRef.current = true;
    }
  }, []);
  const onMessagesPointerDown = useCallback((_event: React.PointerEvent<HTMLDivElement>) => {
    isPointerScrollActiveRef.current = true;
  }, []);
  const onMessagesPointerUp = useCallback((_event: React.PointerEvent<HTMLDivElement>) => {
    isPointerScrollActiveRef.current = false;
  }, []);
  const onMessagesPointerCancel = useCallback((_event: React.PointerEvent<HTMLDivElement>) => {
    isPointerScrollActiveRef.current = false;
  }, []);
  const onMessagesTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    lastTouchClientYRef.current = touch.clientY;
  }, []);
  const onMessagesTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    const previousTouchY = lastTouchClientYRef.current;
    if (previousTouchY !== null && touch.clientY > previousTouchY + 1) {
      pendingUserScrollUpIntentRef.current = true;
    }
    lastTouchClientYRef.current = touch.clientY;
  }, []);
  const onMessagesTouchEnd = useCallback((_event: React.TouchEvent<HTMLDivElement>) => {
    lastTouchClientYRef.current = null;
  }, []);
  useEffect(() => {
    return () => {
      cancelPendingStickToBottom();
      cancelPendingInteractionAnchorAdjustment();
    };
  }, [cancelPendingInteractionAnchorAdjustment, cancelPendingStickToBottom]);
  useLayoutEffect(() => {
    if (!activeThread?.id) return;
    shouldAutoScrollRef.current = true;
    scheduleStickToBottom();
    const timeout = window.setTimeout(() => {
      const scrollContainer = messagesScrollRef.current;
      if (!scrollContainer) return;
      if (isScrollContainerNearBottom(scrollContainer)) return;
      scheduleStickToBottom();
    }, 96);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeThread?.id, scheduleStickToBottom]);
  useLayoutEffect(() => {
    const composerForm = composerFormRef.current;
    if (!composerForm) return;
    const measureComposerFormWidth = () => composerForm.clientWidth;

    composerFormHeightRef.current = composerForm.getBoundingClientRect().height;
    setIsComposerFooterCompact(
      shouldUseCompactComposerFooter(measureComposerFormWidth(), {
        hasWideActions: composerFooterHasWideActions,
      }),
    );
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;
      if (!entry) return;

      const nextCompact = shouldUseCompactComposerFooter(measureComposerFormWidth(), {
        hasWideActions: composerFooterHasWideActions,
      });
      setIsComposerFooterCompact((previous) => (previous === nextCompact ? previous : nextCompact));

      const nextHeight = entry.contentRect.height;
      const previousHeight = composerFormHeightRef.current;
      composerFormHeightRef.current = nextHeight;

      if (previousHeight > 0 && Math.abs(nextHeight - previousHeight) < 0.5) return;
      if (!shouldAutoScrollRef.current) return;
      scheduleStickToBottom();
    });

    observer.observe(composerForm);
    return () => {
      observer.disconnect();
    };
  }, [activeThread?.id, composerFooterHasWideActions, scheduleStickToBottom]);
  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    scheduleStickToBottom();
  }, [messageCount, scheduleStickToBottom]);
  useEffect(() => {
    if (phase !== "running") return;
    if (!shouldAutoScrollRef.current) return;
    scheduleStickToBottom();
  }, [phase, scheduleStickToBottom, timelineEntries]);

  useEffect(() => {
    setExpandedWorkGroups({});
    setPullRequestDialogState(null);
    setIsThreadShareDialogOpen(false);
    if (planSidebarOpenOnNextThreadRef.current) {
      planSidebarOpenOnNextThreadRef.current = false;
      setPlanSidebarOpen(true);
    } else {
      setPlanSidebarOpen(false);
    }
    planSidebarDismissedForTurnRef.current = null;
  }, [activeThread?.id]);

  useEffect(() => {
    if (!composerMenuOpen) {
      setComposerHighlightedItemId(null);
      return;
    }
    setComposerHighlightedItemId((existing) =>
      existing && composerMenuItems.some((item) => item.id === existing)
        ? existing
        : (composerMenuItems[0]?.id ?? null),
    );
  }, [composerMenuItems, composerMenuOpen]);

  useEffect(() => {
    setIsRevertingCheckpoint(false);
  }, [activeThread?.id]);

  useEffect(() => {
    if (!activeThread?.id || terminalState.terminalOpen) return;
    const frame = window.requestAnimationFrame(() => {
      focusComposer();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeThread?.id, focusComposer, terminalState.terminalOpen]);

  useEffect(() => {
    composerImagesRef.current = composerImages;
  }, [composerImages]);

  useEffect(() => {
    if (!activeThread?.id) return;
    if (activeThread.messages.length === 0) {
      return;
    }
    const serverIds = new Set(activeThread.messages.map((message) => message.id));
    const removedMessages = optimisticUserMessages.filter((message) => serverIds.has(message.id));
    if (removedMessages.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setOptimisticUserMessages((existing) =>
        existing.filter((message) => !serverIds.has(message.id)),
      );
    }, 0);
    for (const removedMessage of removedMessages) {
      const previewUrls = collectUserMessageBlobPreviewUrls(removedMessage);
      if (previewUrls.length > 0) {
        handoffAttachmentPreviews(removedMessage.id, previewUrls);
        continue;
      }
      revokeUserMessagePreviewUrls(removedMessage);
    }
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeThread?.id, activeThread?.messages, handoffAttachmentPreviews, optimisticUserMessages]);

  useEffect(() => {
    promptRef.current = prompt;
    setComposerCursor((existing) => clampCollapsedComposerCursor(prompt, existing));
  }, [prompt]);

  useEffect(() => {
    setOptimisticUserMessages((existing) => {
      for (const message of existing) {
        revokeUserMessagePreviewUrls(message);
      }
      return [];
    });
    setSendStartedAt(null);
    setComposerHighlightedItemId(null);
    setComposerCursor(collapseExpandedComposerCursor(promptRef.current, promptRef.current.length));
    setComposerTrigger(detectComposerTrigger(promptRef.current, promptRef.current.length));
    dragDepthRef.current = 0;
    setIsDragOverComposer(false);
    setExpandedImage(null);
  }, [threadId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (composerImages.length === 0) {
        clearComposerDraftPersistedAttachments(threadId);
        return;
      }
      const getPersistedAttachmentsForThread = () =>
        useComposerDraftStore.getState().draftsByThreadId[threadId]?.persistedAttachments ?? [];
      try {
        const currentPersistedAttachments = getPersistedAttachmentsForThread();
        const existingPersistedById = new Map(
          currentPersistedAttachments.map((attachment) => [attachment.id, attachment]),
        );
        const stagedAttachmentById = new Map<string, PersistedComposerImageAttachment>();
        await Promise.all(
          composerImages.map(async (image) => {
            try {
              const dataUrl = await readFileAsDataUrl(image.file);
              stagedAttachmentById.set(image.id, {
                id: image.id,
                name: image.name,
                mimeType: image.mimeType,
                sizeBytes: image.sizeBytes,
                dataUrl,
              });
            } catch {
              const existingPersisted = existingPersistedById.get(image.id);
              if (existingPersisted) {
                stagedAttachmentById.set(image.id, existingPersisted);
              }
            }
          }),
        );
        const serialized = Array.from(stagedAttachmentById.values());
        if (cancelled) {
          return;
        }
        // Stage attachments in persisted draft state first so persist middleware can write them.
        syncComposerDraftPersistedAttachments(threadId, serialized);
      } catch {
        const currentImageIds = new Set(composerImages.map((image) => image.id));
        const fallbackPersistedAttachments = getPersistedAttachmentsForThread();
        const fallbackPersistedIds = fallbackPersistedAttachments
          .map((attachment) => attachment.id)
          .filter((id) => currentImageIds.has(id));
        const fallbackPersistedIdSet = new Set(fallbackPersistedIds);
        const fallbackAttachments = fallbackPersistedAttachments.filter((attachment) =>
          fallbackPersistedIdSet.has(attachment.id),
        );
        if (cancelled) {
          return;
        }
        syncComposerDraftPersistedAttachments(threadId, fallbackAttachments);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    clearComposerDraftPersistedAttachments,
    composerImages,
    syncComposerDraftPersistedAttachments,
    threadId,
  ]);

  const closeExpandedImage = useCallback(() => {
    setExpandedImage(null);
  }, []);
  const navigateExpandedImage = useCallback((direction: -1 | 1) => {
    setExpandedImage((existing) => {
      if (!existing || existing.images.length <= 1) {
        return existing;
      }
      const nextIndex =
        (existing.index + direction + existing.images.length) % existing.images.length;
      if (nextIndex === existing.index) {
        return existing;
      }
      return { ...existing, index: nextIndex };
    });
  }, []);

  useEffect(() => {
    if (!expandedImage) {
      return;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeExpandedImage();
        return;
      }
      if (expandedImage.images.length <= 1) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        navigateExpandedImage(-1);
        return;
      }
      if (event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      navigateExpandedImage(1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeExpandedImage, expandedImage, navigateExpandedImage]);

  const activeWorktreePath = activeThread?.worktreePath;
  const envMode: DraftThreadEnvMode = activeWorktreePath
    ? "worktree"
    : isLocalDraftThread
      ? (draftThread?.envMode ?? "local")
      : "local";

  useEffect(() => {
    if (phase !== "running") return;
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [phase]);

  const beginSendPhase = useCallback(
    (targetThreadId: ThreadId, nextPhase: Exclude<SendPhase, "idle">) => {
      setSendStartedAt((current) => current ?? new Date().toISOString());
      setThreadSendPhase(targetThreadId, nextPhase);
    },
    [setThreadSendPhase],
  );

  const resetSendPhase = useCallback(
    (targetThreadId: ThreadId) => {
      setThreadSendPhase(targetThreadId, "idle");
      setSendStartedAt(null);
    },
    [setThreadSendPhase],
  );

  useEffect(() => {
    if (sendPhase === "idle") {
      return;
    }
    if (
      phase === "running" ||
      activePendingApproval !== null ||
      activePendingUserInput !== null ||
      activeThread?.error
    ) {
      resetSendPhase(threadId);
    }
  }, [
    activePendingApproval,
    activePendingUserInput,
    activeThread?.error,
    phase,
    resetSendPhase,
    sendPhase,
    threadId,
  ]);

  useEffect(() => {
    if (!activeThreadId) return;
    const previous = terminalOpenByThreadRef.current[activeThreadId] ?? false;
    const current = Boolean(terminalState.terminalOpen);

    if (!previous && current) {
      terminalOpenByThreadRef.current[activeThreadId] = current;
      setTerminalFocusRequestId((value) => value + 1);
      return;
    } else if (previous && !current) {
      terminalOpenByThreadRef.current[activeThreadId] = current;
      const frame = window.requestAnimationFrame(() => {
        focusComposer();
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    terminalOpenByThreadRef.current[activeThreadId] = current;
  }, [activeThreadId, focusComposer, terminalState.terminalOpen]);

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (!activeThreadId || event.defaultPrevented) return;
      const shortcutContext = {
        terminalFocus: isTerminalFocused(),
        terminalOpen: Boolean(terminalState.terminalOpen),
      };

      const command = resolveShortcutCommand(event, keybindings, { context: shortcutContext });
      if (!command) return;

      if (command === "terminal.toggle") {
        event.preventDefault();
        event.stopPropagation();
        toggleTerminalVisibility();
        return;
      }

      if (command === "terminal.split") {
        event.preventDefault();
        event.stopPropagation();
        if (!terminalState.terminalOpen) {
          setTerminalOpen(true);
        }
        splitTerminal();
        return;
      }

      if (command === "terminal.close") {
        event.preventDefault();
        event.stopPropagation();
        if (!terminalState.terminalOpen) return;
        closeTerminal(terminalState.activeTerminalId);
        return;
      }

      if (command === "terminal.new") {
        event.preventDefault();
        event.stopPropagation();
        if (!terminalState.terminalOpen) {
          setTerminalOpen(true);
        }
        createNewTerminal();
        return;
      }

      if (command === "diff.toggle") {
        event.preventDefault();
        event.stopPropagation();
        onToggleDiff();
        return;
      }

      if (command === "chat.interrupt") {
        if (phase === "running" && !isInterruptingTurn && activeThread) {
          event.preventDefault();
          event.stopPropagation();
          const api = readNativeApi();
          if (api) {
            const targetTurnId = activeInterruptTurnId;
            setPendingInterruptRequest({
              threadId: activeThread.id,
              turnId: targetTurnId,
            });
            void api.orchestration
              .dispatchCommand({
                type: "thread.turn.interrupt",
                commandId: newCommandId(),
                threadId: activeThread.id,
                ...(targetTurnId ? { turnId: targetTurnId } : {}),
                createdAt: new Date().toISOString(),
              })
              .catch((err) => {
                setPendingInterruptRequest(null);
                const message = err instanceof Error ? err.message : "Failed to stop generation.";
                setThreadError(activeThread.id, message);
              });
          }
        }
        // If not running, let Escape propagate for other handlers (e.g. clear selection).
        return;
      }

      const scriptId = projectScriptIdFromCommand(command);
      if (!scriptId || !activeProject) return;
      const script = activeProject.scripts.find((entry) => entry.id === scriptId);
      if (!script) return;
      event.preventDefault();
      event.stopPropagation();
      void runProjectScript(script);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    activeInterruptTurnId,
    activeProject,
    activeThread,
    terminalState.terminalOpen,
    terminalState.activeTerminalId,
    activeThreadId,
    closeTerminal,
    createNewTerminal,
    isInterruptingTurn,
    phase,
    setTerminalOpen,
    setThreadError,
    runProjectScript,
    splitTerminal,
    keybindings,
    onToggleDiff,
    toggleTerminalVisibility,
  ]);

  const addComposerImages = (files: File[]) => {
    if (!activeThreadId || files.length === 0) return;

    if (pendingUserInputs.length > 0) {
      toastManager.add({
        type: "error",
        title: chatCopy.attachImagesAfterPlanQuestions,
      });
      return;
    }

    const nextImages: ComposerImageAttachment[] = [];
    let nextImageCount = composerImagesRef.current.length;
    let error: string | null = null;
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        error = `Unsupported file type for '${file.name}'. Please attach image files only.`;
        continue;
      }
      if (file.size > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
        error = `'${file.name}' exceeds the ${IMAGE_SIZE_LIMIT_LABEL} attachment limit.`;
        continue;
      }
      if (nextImageCount >= PROVIDER_SEND_TURN_MAX_ATTACHMENTS) {
        error = `You can attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} images per message.`;
        break;
      }

      const previewUrl = URL.createObjectURL(file);
      nextImages.push({
        type: "image",
        id: randomUUID(),
        name: file.name || "image",
        mimeType: file.type,
        sizeBytes: file.size,
        previewUrl,
        file,
      });
      nextImageCount += 1;
    }

    if (nextImages.length === 1 && nextImages[0]) {
      addComposerImage(nextImages[0]);
    } else if (nextImages.length > 1) {
      addComposerImagesToDraft(nextImages);
    }
    setThreadError(activeThreadId, error);
  };

  const removeComposerImage = (imageId: string) => {
    removeComposerImageFromDraft(imageId);
  };

  const onComposerPaste = (event: React.ClipboardEvent<HTMLElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) {
      return;
    }
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      return;
    }
    event.preventDefault();
    addComposerImages(imageFiles);
  };

  const onComposerDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOverComposer(true);
  };

  const onComposerDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOverComposer(true);
  };

  const onComposerDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragOverComposer(false);
    }
  };

  const onComposerDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOverComposer(false);
    const files = Array.from(event.dataTransfer.files);
    addComposerImages(files);
    focusComposer();
  };

  const onRevertToTurnCount = useCallback(
    async (turnCount: number) => {
      const api = readNativeApi();
      if (!api || !activeThread || isRevertingCheckpoint) return;

      if (phase === "running" || isSendBusy || isConnecting) {
        setThreadError(activeThread.id, "Interrupt the current turn before reverting checkpoints.");
        return;
      }
      const confirmed = await api.dialogs.confirm(
        [
          `Revert this thread to checkpoint ${turnCount}?`,
          "This will discard newer messages and turn diffs in this thread.",
          "This action cannot be undone.",
        ].join("\n"),
      );
      if (!confirmed) {
        return;
      }

      setIsRevertingCheckpoint(true);
      setThreadError(activeThread.id, null);
      try {
        await api.orchestration.dispatchCommand({
          type: "thread.checkpoint.revert",
          commandId: newCommandId(),
          threadId: activeThread.id,
          turnCount,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        setThreadError(
          activeThread.id,
          err instanceof Error ? err.message : "Failed to revert thread state.",
        );
      }
      setIsRevertingCheckpoint(false);
    },
    [activeThread, isConnecting, isRevertingCheckpoint, isSendBusy, phase, setThreadError],
  );

  const stageExpandedTemplateInComposer = useCallback(
    (expandedTemplate: ReturnType<typeof expandProjectCommandTemplate>) => {
      const nextText = expandedTemplate.text;
      const nextCursor = collapseExpandedComposerCursor(nextText, nextText.length);
      const nextOverrides =
        Object.keys(expandedTemplate.overrides).length > 0 ? expandedTemplate.overrides : null;
      setPendingTemplateOverrides(nextOverrides);
      promptRef.current = nextText;
      setPrompt(nextText);
      setComposerHighlightedItemId(null);
      setComposerCursor(nextCursor);
      setComposerTrigger(detectComposerTrigger(nextText, nextText.length));
      window.requestAnimationFrame(() => {
        composerEditorRef.current?.focusAt(nextCursor);
      });
    },
    [setPrompt],
  );

  const runInitCommand = useCallback(async () => {
    const api = readNativeApi();
    if (!api || !activeWorkspaceCwd) {
      toastManager.add({
        type: "error",
        title: "Workspace path unavailable",
        description: "AGENTS.md can only be created from an active workspace.",
      });
      return;
    }

    try {
      const draft = await api.projects.draftAgentsFile({ cwd: activeWorkspaceCwd });
      await api.projects.writeFile({
        cwd: activeWorkspaceCwd,
        relativePath: draft.relativePath,
        contents: draft.contents,
      });
      await queryClient.invalidateQueries({
        queryKey: projectQueryKeys.agentsFile(activeWorkspaceCwd),
      });
      toastManager.add({
        type: "success",
        title: draft.mode === "create" ? "AGENTS.md created" : "AGENTS.md updated",
        description: draft.relativePath,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not update AGENTS.md",
        description:
          error instanceof Error ? error.message : "An error occurred while writing AGENTS.md.",
      });
    }
  }, [activeWorkspaceCwd, queryClient]);

  const openThreadShareDialog = useCallback(() => {
    setIsThreadShareDialogOpen(true);
  }, []);

  const copyThreadShareLink = useCallback(async () => {
    if (!activeShareUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(activeShareUrl);
      toastManager.add({
        type: "success",
        title: "Share link copied",
        description: activeShareUrl,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not copy share link",
        description: error instanceof Error ? error.message : "Clipboard access failed.",
      });
    }
  }, [activeShareUrl]);

  const openSharedThreadView = useCallback(() => {
    if (!activeShare) {
      return;
    }
    void navigate({
      to: "/shared/$shareId",
      params: { shareId: activeShare.shareId },
    });
  }, [activeShare, navigate]);

  const createThreadShare = useCallback(async () => {
    if (!canCreateShareThread) {
      toastManager.add({
        type: "warning",
        title:
          settings.threadShareMode === "disabled"
            ? "Sharing is disabled"
            : "This thread can't be shared right now",
        description:
          settings.threadShareMode === "disabled"
            ? "Change the thread sharing mode in Settings to create new share links."
            : "Wait for the current turn to settle, then try again.",
      });
      return null;
    }

    try {
      const result = await createThreadShareMutation.mutateAsync();
      setIsThreadShareDialogOpen(true);
      toastManager.add({
        type: "success",
        title: "Share link created",
        description: result.share.title,
      });
      return result;
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not create share link",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
      return null;
    }
  }, [canCreateShareThread, createThreadShareMutation, settings.threadShareMode]);

  const revokeThreadShare = useCallback(async () => {
    if (!activeShare) {
      toastManager.add({
        type: "warning",
        title: "No active share link",
        description: "This thread does not currently have a share link to revoke.",
      });
      return;
    }
    try {
      await revokeThreadShareMutation.mutateAsync();
      toastManager.add({
        type: "success",
        title: "Share link revoked",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not revoke share link",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    }
  }, [activeShare, revokeThreadShareMutation]);

  useEffect(() => {
    if (!threadShareStatusQuery.isFetched) {
      return;
    }
    if (
      !shouldAutoCreateThreadShare({
        shareMode: settings.threadShareMode,
        threadId: activeServerThreadId,
        baseShareAvailable,
        hasActiveShare: activeShare !== null,
        attemptedThreadIds: autoShareAttemptedThreadIdsRef.current,
      })
    ) {
      return;
    }

    const threadIdForAttempt = activeServerThreadId;
    if (!threadIdForAttempt) {
      return;
    }
    autoShareAttemptedThreadIdsRef.current.add(threadIdForAttempt);
    void createThreadShareMutation.mutateAsync().catch((error) => {
      toastManager.add({
        type: "error",
        title: "Could not auto-share thread",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    });
  }, [
    activeServerThreadId,
    activeShare,
    baseShareAvailable,
    createThreadShareMutation,
    settings.threadShareMode,
    threadShareStatusQuery.isFetched,
  ]);

  const compactThread = useCallback(async () => {
    const api = readNativeApi();
    if (!activeThread || !canCompactThread) {
      return;
    }
    if (api) {
      const confirmed = await api.dialogs.confirm(
        [
          "Compact this thread?",
          "CUT3 will replace the live provider session with a continuation summary so the conversation can keep going from a smaller context.",
        ].join("\n"),
      );
      if (!confirmed) {
        return;
      }
    }
    try {
      const result = await compactThreadMutation.mutateAsync();
      toastManager.add({
        type: "success",
        title: "Thread compacted",
        description: truncateTitle(result.summary),
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not compact thread",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    }
  }, [activeThread, canCompactThread, compactThreadMutation]);

  const undoThread = useCallback(async () => {
    const api = readNativeApi();
    if (!activeThread || !canUndoThread) {
      return;
    }
    if (api) {
      const confirmed = await api.dialogs.confirm(
        [
          "Undo the latest completed turn?",
          "You can restore it with redo until you start a new turn.",
        ].join("\n"),
      );
      if (!confirmed) {
        return;
      }
    }
    try {
      const result = await undoThreadMutation.mutateAsync();
      toastManager.add({
        type: "success",
        title: "Last turn removed",
        description:
          result.redoDepth > 0 ? `${result.redoDepth} redo snapshot available.` : undefined,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not undo last turn",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    }
  }, [activeThread, canUndoThread, undoThreadMutation]);

  const redoThread = useCallback(async () => {
    if (!activeThread || !canRedoThread) {
      return;
    }
    try {
      await redoThreadMutation.mutateAsync();
      toastManager.add({
        type: "success",
        title: "Undo restored",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not redo thread state",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    }
  }, [activeThread, canRedoThread, redoThreadMutation]);

  const runStandaloneSlashCommand = useCallback(
    async (command: Exclude<ComposerSlashCommand, "model" | "mcp">) => {
      if (command === "init") {
        await runInitCommand();
        return;
      }
      if (command === "plan" || command === "default") {
        await handleInteractionModeChange(command);
        return;
      }
      if (command === "new") {
        if (!defaultProjectId) {
          toastManager.add({
            type: "warning",
            title: "No project available",
            description: "Add or select a project before starting a new thread.",
          });
          return;
        }
        await openDefaultNewThread();
        return;
      }
      if (command === "compact") {
        if (!canCompactThread) {
          toastManager.add({
            type: "warning",
            title: "This thread can't be compacted right now",
            description: "Wait for the current turn to settle, then try again.",
          });
          return;
        }
        await compactThread();
        return;
      }
      if (command === "share") {
        if (activeShareUrl) {
          await copyThreadShareLink();
          return;
        }
        await createThreadShare();
        return;
      }
      if (command === "unshare") {
        await revokeThreadShare();
        return;
      }
      if (command === "undo") {
        if (!canUndoThread) {
          toastManager.add({
            type: "warning",
            title: "This thread can't be undone right now",
            description: "Wait for the current turn to settle, then try again.",
          });
          return;
        }
        await undoThread();
        return;
      }
      if (command === "redo") {
        if (!canRedoThread) {
          toastManager.add({
            type: "warning",
            title: "Nothing to redo",
            description: "Undo a turn first to create a redo snapshot.",
          });
          return;
        }
        await redoThread();
        return;
      }
      if (command === "export") {
        if (!isServerThread) {
          toastManager.add({
            type: "warning",
            title: "Thread export is unavailable",
            description: "Send at least one turn before exporting this thread.",
          });
          return;
        }
        openThreadExportDialog();
        return;
      }
      if (command === "details") {
        const nextShowToolDetails = !settings.showToolDetails;
        updateSettings({ showToolDetails: nextShowToolDetails });
        toastManager.add({
          type: "success",
          title: nextShowToolDetails ? "Tool details shown" : "Tool details hidden",
        });
        return;
      }
    },
    [
      activeShareUrl,
      canCompactThread,
      canRedoThread,
      canUndoThread,
      compactThread,
      copyThreadShareLink,
      createThreadShare,
      defaultProjectId,
      handleInteractionModeChange,
      isServerThread,
      openDefaultNewThread,
      openThreadExportDialog,
      redoThread,
      revokeThreadShare,
      runInitCommand,
      settings.showToolDetails,
      undoThread,
      updateSettings,
    ],
  );

  const buildComposerTurnSubmission = useCallback(
    async (options?: { allowStandaloneCommands?: boolean }) => {
      if (!activeThread) {
        return null;
      }
      const trimmed = prompt.trim();
      const standaloneSlashCommand =
        composerImages.length === 0 ? parseStandaloneComposerSlashCommand(trimmed) : null;
      if (standaloneSlashCommand) {
        if (options?.allowStandaloneCommands === false) {
          toastManager.add({
            type: "warning",
            title: "Slash commands can’t be queued",
            description:
              "Run the command after the current turn settles, or queue a normal message instead.",
          });
          return null;
        }
        await runStandaloneSlashCommand(standaloneSlashCommand);
        promptRef.current = "";
        clearComposerDraftContent(activeThread.id);
        setPendingTemplateOverrides(null);
        setComposerHighlightedItemId(null);
        setComposerCursor(0);
        setComposerTrigger(null);
        return { kind: "handled-command" as const };
      }

      const standaloneSlashInvocation =
        composerImages.length === 0 ? parseStandaloneComposerSlashInvocation(trimmed) : null;
      let textForSend = trimmed;
      let templateOverridesForSend = pendingTemplateOverrides;
      if (standaloneSlashInvocation) {
        const template = resolveProjectCommandTemplate(
          projectCommandTemplates,
          standaloneSlashInvocation.command,
        );
        if (template) {
          const expandedTemplate = expandProjectCommandTemplate({
            template,
            argumentsText: standaloneSlashInvocation.argumentsText,
          });
          if (!expandedTemplate.sendImmediately) {
            stageExpandedTemplateInComposer(expandedTemplate);
            return { kind: "staged-template" as const };
          }
          textForSend = expandedTemplate.text.trim();
          templateOverridesForSend =
            Object.keys(expandedTemplate.overrides).length > 0 ? expandedTemplate.overrides : null;
        }
      }

      if (!textForSend && composerImages.length === 0) {
        return null;
      }

      const providerForSend = templateOverridesForSend?.provider ?? selectedProvider;
      const modelForSend = resolveAppModelSelection(
        providerForSend,
        allModelOptionsByProvider[providerForSend].map((option) => option.slug),
        templateOverridesForSend?.model ?? selectedModel,
      ) as ModelSlug;
      const runtimeModeForSend = templateOverridesForSend?.runtimeMode ?? runtimeMode;
      const interactionModeForSend = templateOverridesForSend?.interactionMode ?? interactionMode;
      const sendOpenRouterModel =
        providerForSend === "codex" && isCodexOpenRouterModel(modelForSend)
          ? (openRouterModelsBySlug.get(modelForSend) ?? null)
          : null;
      const sendPiModelOption =
        providerForSend === "pi"
          ? findModelOptionBySlug(allModelOptionsByProvider.pi, modelForSend)
          : null;
      const sendPiConfiguredReasoningState =
        providerForSend === "pi"
          ? deriveConfiguredReasoningState(
              activeThread?.activities ?? EMPTY_ACTIVITIES,
              "pi",
              modelForSend,
            )
          : null;
      const composerEffortForSend = resolveComposerEffortForProvider({
        provider: providerForSend,
        effort: composerDraft.effort ?? null,
        effortProvider: composerDraft.effortProvider ?? null,
      });
      const modelOptionsForCurrentSend = buildModelOptionsForSend({
        provider: providerForSend,
        model: modelForSend,
        composerEffort: composerEffortForSend,
        codexFastModeEnabled: composerDraft.codexFastMode,
        copilotReasoningProbe: copilotReasoningProbeQuery.data,
        openRouterSupportsReasoningEffort:
          sendOpenRouterModel !== null &&
          supportsOpenRouterReasoningEffortControl(sendOpenRouterModel) &&
          sendOpenRouterModel.supportsReasoning,
        piSupportsReasoning: sendPiModelOption?.supportsReasoning === true,
        piReasoningOptions: sendPiConfiguredReasoningState?.options ?? null,
      });
      const providerOptionsForCurrentSend = buildProviderOptionsForDispatch({
        provider: providerForSend,
        settings,
      });
      if (
        !ensureProviderCredentialsForDispatch({
          provider: providerForSend,
          model: modelForSend,
          continuation: "submit-form",
        })
      ) {
        return null;
      }
      if (
        !ensureOpenRouterModelSupportsToolsForDispatch({
          provider: providerForSend,
          model: modelForSend,
          threadId: activeThread.id,
        })
      ) {
        return null;
      }

      return {
        kind: "message" as const,
        textForSend,
        templateOverridesForSend,
        providerForSend,
        modelForSend,
        runtimeModeForSend,
        interactionModeForSend,
        modelOptionsForCurrentSend,
        providerOptionsForCurrentSend,
        composerImagesSnapshot: [...composerImages],
        selectedSkillNamesForSend: [...selectedSkillNames],
      };
    },
    [
      activeThread,
      allModelOptionsByProvider,
      composerDraft.codexFastMode,
      composerDraft.effort,
      composerDraft.effortProvider,
      composerImages,
      copilotReasoningProbeQuery.data,
      clearComposerDraftContent,
      ensureOpenRouterModelSupportsToolsForDispatch,
      ensureProviderCredentialsForDispatch,
      interactionMode,
      openRouterModelsBySlug,
      pendingTemplateOverrides,
      projectCommandTemplates,
      runStandaloneSlashCommand,
      runtimeMode,
      selectedModel,
      selectedProvider,
      selectedSkillNames,
      settings,
      stageExpandedTemplateInComposer,
      prompt,
    ],
  );

  const clearComposerAfterSendCapture = useCallback(
    (targetThreadId: ThreadId) => {
      promptRef.current = "";
      clearComposerDraftContent(targetThreadId);
      setPendingTemplateOverrides(null);
      setComposerHighlightedItemId(null);
      setComposerCursor(0);
      setComposerTrigger(null);
    },
    [clearComposerDraftContent],
  );

  const queueCurrentComposerTurn = useCallback(
    async (mode: "queue" | "steer") => {
      if (!activeThread || !isServerThread) {
        return;
      }
      const submission = await buildComposerTurnSubmission({ allowStandaloneCommands: false });
      if (!submission || submission.kind !== "message") {
        return;
      }

      const queuedTurn: QueuedThreadTurn = {
        id: randomUUID(),
        threadId: activeThread.id,
        text: submission.textForSend,
        attachments: submission.composerImagesSnapshot,
        provider: submission.providerForSend,
        model: submission.modelForSend,
        serviceTier: selectedServiceTier,
        ...(submission.modelOptionsForCurrentSend
          ? { modelOptions: submission.modelOptionsForCurrentSend }
          : {}),
        runtimeMode: submission.runtimeModeForSend,
        interactionMode: submission.interactionModeForSend,
        skillNames: submission.selectedSkillNamesForSend,
        createdAt: new Date().toISOString(),
        mode,
        status: "pending",
        error: null,
      };

      enqueueQueuedTurn(queuedTurn, { front: mode === "steer" });
      setFollowUpMode(activeThread.id, mode);
      clearComposerAfterSendCapture(activeThread.id);
      toastManager.add({
        type: mode === "steer" ? "info" : "success",
        title: mode === "steer" ? chatCopy.steeringCurrentRun : chatCopy.followUpQueued,
        description:
          mode === "steer" ? chatCopy.steeringCurrentRunHint : chatCopy.queueCurrentRunHint,
      });

      if (mode === "steer" && !isInterruptingTurn) {
        const api = readNativeApi();
        if (api) {
          const targetTurnId = activeInterruptTurnId;
          setPendingInterruptRequest({
            threadId: activeThread.id,
            turnId: targetTurnId,
          });
          void api.orchestration
            .dispatchCommand({
              type: "thread.turn.interrupt",
              commandId: newCommandId(),
              threadId: activeThread.id,
              ...(targetTurnId ? { turnId: targetTurnId } : {}),
              createdAt: new Date().toISOString(),
            })
            .catch((error) => {
              setPendingInterruptRequest(null);
              setThreadError(
                activeThread.id,
                error instanceof Error ? error.message : "Failed to stop generation.",
              );
            });
        }
      }
    },
    [
      activeInterruptTurnId,
      activeThread,
      buildComposerTurnSubmission,
      chatCopy.followUpQueued,
      chatCopy.queueCurrentRunHint,
      chatCopy.steeringCurrentRun,
      chatCopy.steeringCurrentRunHint,
      clearComposerAfterSendCapture,
      enqueueQueuedTurn,
      isInterruptingTurn,
      isServerThread,
      selectedServiceTier,
      setFollowUpMode,
      setThreadError,
    ],
  );

  const sendQueuedTurn = useCallback(
    async (queuedTurn: QueuedThreadTurn) => {
      const api = readNativeApi();
      if (!api || !activeThread || activeThread.id !== queuedTurn.threadId || !isServerThread) {
        return;
      }

      const messageIdForSend = newMessageId();
      const messageCreatedAt = new Date().toISOString();
      markQueuedTurnSending(queuedTurn.threadId, queuedTurn.id);
      setThreadSendInFlight(queuedTurn.threadId, true);
      beginSendPhase(queuedTurn.threadId, "sending-turn");
      setThreadError(queuedTurn.threadId, null);
      setOptimisticUserMessages((existing) => [
        ...existing,
        {
          id: messageIdForSend,
          role: "user",
          text: queuedTurn.text,
          ...(queuedTurn.attachments.length > 0
            ? {
                attachments: queuedTurn.attachments.map((image) => ({
                  type: "image" as const,
                  id: image.id,
                  name: image.name,
                  mimeType: image.mimeType,
                  sizeBytes: image.sizeBytes,
                  previewUrl: image.previewUrl,
                })),
              }
            : {}),
          createdAt: messageCreatedAt,
          streaming: false,
        },
      ]);
      shouldAutoScrollRef.current = true;
      forceStickToBottom();

      try {
        await persistThreadSettingsForNextTurn({
          threadId: queuedTurn.threadId,
          createdAt: messageCreatedAt,
          model: queuedTurn.model,
          runtimeMode: queuedTurn.runtimeMode,
          interactionMode: queuedTurn.interactionMode,
        });
        await api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: queuedTurn.threadId,
          message: {
            messageId: messageIdForSend,
            role: "user",
            text: queuedTurn.text || IMAGE_ONLY_BOOTSTRAP_PROMPT,
            attachments: await Promise.all(
              queuedTurn.attachments.map(async (image) => ({
                type: "image" as const,
                name: image.name,
                mimeType: image.mimeType,
                sizeBytes: image.sizeBytes,
                dataUrl: await readFileAsDataUrl(image.file),
              })),
            ),
          },
          provider: queuedTurn.provider,
          model: queuedTurn.model,
          serviceTier: queuedTurn.serviceTier,
          ...(queuedTurn.modelOptions ? { modelOptions: queuedTurn.modelOptions } : {}),
          assistantDeliveryMode: settings.enableAssistantStreaming ? "streaming" : "buffered",
          runtimeMode: queuedTurn.runtimeMode,
          interactionMode: queuedTurn.interactionMode,
          ...(queuedTurn.skillNames.length > 0 ? { skills: queuedTurn.skillNames } : {}),
          createdAt: messageCreatedAt,
        });
        removeQueuedTurn(queuedTurn.threadId, queuedTurn.id);
        void invalidateThreadQueries(queryClient);
        setThreadSendInFlight(queuedTurn.threadId, false);
      } catch (error) {
        setOptimisticUserMessages((existing) =>
          existing.filter((message) => message.id !== messageIdForSend),
        );
        markQueuedTurnFailed(
          queuedTurn.threadId,
          queuedTurn.id,
          error instanceof Error ? error.message : "Failed to send queued follow-up.",
        );
        setThreadSendInFlight(queuedTurn.threadId, false);
        resetSendPhase(queuedTurn.threadId);
        setThreadError(
          queuedTurn.threadId,
          error instanceof Error ? error.message : "Failed to send queued follow-up.",
        );
      }
    },
    [
      activeThread,
      beginSendPhase,
      forceStickToBottom,
      isServerThread,
      markQueuedTurnFailed,
      markQueuedTurnSending,
      persistThreadSettingsForNextTurn,
      queryClient,
      removeQueuedTurn,
      resetSendPhase,
      setThreadError,
      setThreadSendInFlight,
      settings.enableAssistantStreaming,
    ],
  );

  useEffect(() => {
    if (
      !activeThread ||
      !isServerThread ||
      phase === "running" ||
      isSendBusy ||
      isConnecting ||
      isRevertingCheckpoint ||
      isInterruptingTurn ||
      activePendingApproval !== null ||
      activePendingUserInput !== null
    ) {
      return;
    }
    const nextQueuedTurn = queuedTurnsForThread[0];
    if (!nextQueuedTurn || nextQueuedTurn.status !== "pending") {
      return;
    }
    void sendQueuedTurn(nextQueuedTurn);
  }, [
    activePendingApproval,
    activePendingUserInput,
    activeThread,
    isConnecting,
    isInterruptingTurn,
    isRevertingCheckpoint,
    isSendBusy,
    isServerThread,
    phase,
    queuedTurnsForThread,
    sendQueuedTurn,
  ]);

  const onSend = async (e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    const api = readNativeApi();
    if (
      !api ||
      !activeThread ||
      isSendBusy ||
      isConnecting ||
      isThreadSendInFlight(activeThread.id)
    ) {
      return;
    }
    if (activePendingProgress) {
      onAdvanceActivePendingUserInput();
      return;
    }
    const trimmed = prompt.trim();
    if (showPlanFollowUpPrompt && activeProposedPlan) {
      const followUp = resolvePlanFollowUpSubmission({
        draftText: trimmed,
        planMarkdown: activeProposedPlan.planMarkdown,
      });
      promptRef.current = "";
      clearComposerDraftContent(activeThread.id);
      setComposerHighlightedItemId(null);
      setComposerCursor(0);
      setComposerTrigger(null);
      await onSubmitPlanFollowUp({
        text: followUp.text,
        interactionMode: followUp.interactionMode,
      });
      return;
    }

    const submission = await buildComposerTurnSubmission({ allowStandaloneCommands: true });
    if (!submission || submission.kind !== "message") {
      return;
    }
    const {
      textForSend,
      templateOverridesForSend,
      providerForSend,
      modelForSend,
      runtimeModeForSend,
      interactionModeForSend,
      modelOptionsForCurrentSend,
      providerOptionsForCurrentSend,
      composerImagesSnapshot,
      selectedSkillNamesForSend,
    } = submission;
    if (!activeProject) return;
    const threadIdForSend = activeThread.id;
    const isFirstMessage = !isServerThread || activeThread.messages.length === 0;
    const baseBranchForWorktree =
      isFirstMessage && envMode === "worktree" && !activeThread.worktreePath
        ? activeThread.branch
        : null;

    // In worktree mode, require an explicit base branch so we don't silently
    // fall back to local execution when branch selection is missing.
    const shouldCreateWorktree =
      isFirstMessage && envMode === "worktree" && !activeThread.worktreePath;
    if (shouldCreateWorktree && !activeThread.branch) {
      setStoreThreadError(
        threadIdForSend,
        "Select a base branch before sending in New worktree mode.",
      );
      return;
    }

    setThreadSendInFlight(threadIdForSend, true);
    beginSendPhase(threadIdForSend, baseBranchForWorktree ? "preparing-worktree" : "sending-turn");

    const messageIdForSend = newMessageId();
    const messageCreatedAt = new Date().toISOString();
    const turnAttachmentsPromise = Promise.all(
      composerImagesSnapshot.map(async (image) => ({
        type: "image" as const,
        name: image.name,
        mimeType: image.mimeType,
        sizeBytes: image.sizeBytes,
        dataUrl: await readFileAsDataUrl(image.file),
      })),
    );
    const optimisticAttachments = composerImagesSnapshot.map((image) => ({
      type: "image" as const,
      id: image.id,
      name: image.name,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      previewUrl: image.previewUrl,
    }));
    setOptimisticUserMessages((existing) => [
      ...existing,
      {
        id: messageIdForSend,
        role: "user",
        text: textForSend,
        ...(optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {}),
        createdAt: messageCreatedAt,
        streaming: false,
      },
    ]);
    // Sending a message should always bring the latest user turn into view.
    shouldAutoScrollRef.current = true;
    forceStickToBottom();

    setThreadError(threadIdForSend, null);
    clearComposerAfterSendCapture(threadIdForSend);

    let createdServerThreadForLocalDraft = false;
    let createdWorktreeForSend = false;
    let turnStartSucceeded = false;
    const originalThreadBranch = activeThread.branch;
    const originalThreadWorktreePath = activeThread.worktreePath;
    let nextThreadBranch = activeThread.branch;
    let nextThreadWorktreePath = activeThread.worktreePath;
    await (async () => {
      // On first message: lock in branch + create worktree if needed.
      if (baseBranchForWorktree) {
        beginSendPhase(threadIdForSend, "preparing-worktree");
        const newBranch = buildTemporaryWorktreeBranchName();
        const result = await createWorktreeMutation.mutateAsync({
          cwd: activeProject.cwd,
          branch: baseBranchForWorktree,
          newBranch,
        });
        createdWorktreeForSend = true;
        nextThreadBranch = result.worktree.branch;
        nextThreadWorktreePath = result.worktree.path;
        if (isServerThread) {
          await api.orchestration.dispatchCommand({
            type: "thread.meta.update",
            commandId: newCommandId(),
            threadId: threadIdForSend,
            branch: result.worktree.branch,
            worktreePath: result.worktree.path,
          });
          // Keep local thread state in sync immediately so terminal drawer opens
          // with the worktree cwd/env instead of briefly using the project root.
          setStoreThreadBranch(threadIdForSend, result.worktree.branch, result.worktree.path);
        }
      }

      let firstComposerImageName: string | null = null;
      if (composerImagesSnapshot.length > 0) {
        const firstComposerImage = composerImagesSnapshot[0];
        if (firstComposerImage) {
          firstComposerImageName = firstComposerImage.name;
        }
      }
      let titleSeed = trimmed;
      titleSeed = textForSend;
      if (!titleSeed) {
        if (firstComposerImageName) {
          titleSeed = `Image: ${firstComposerImageName}`;
        } else {
          titleSeed = "New thread";
        }
      }
      const title = truncateTitle(titleSeed);
      let threadCreateModel: ModelSlug =
        modelForSend || (activeProject.model as ModelSlug) || DEFAULT_MODEL_BY_PROVIDER.codex;

      if (isLocalDraftThread) {
        await api.orchestration.dispatchCommand({
          type: "thread.create",
          commandId: newCommandId(),
          threadId: threadIdForSend,
          projectId: activeProject.id,
          title,
          model: threadCreateModel,
          runtimeMode: runtimeModeForSend,
          interactionMode: interactionModeForSend,
          branch: nextThreadBranch,
          worktreePath: nextThreadWorktreePath,
          createdAt: activeThread.createdAt,
        });
        createdServerThreadForLocalDraft = true;
      }

      let setupScript: ProjectScript | null = null;
      if (baseBranchForWorktree) {
        setupScript = setupProjectScript(activeProject.scripts);
      }
      if (setupScript) {
        let shouldRunSetupScript = false;
        if (isServerThread) {
          shouldRunSetupScript = true;
        } else {
          if (createdServerThreadForLocalDraft) {
            shouldRunSetupScript = true;
          }
        }
        if (shouldRunSetupScript) {
          const setupScriptOptions: Parameters<typeof runProjectScript>[1] = {
            worktreePath: nextThreadWorktreePath,
            rememberAsLastInvoked: false,
            allowLocalDraftThread: createdServerThreadForLocalDraft,
          };
          if (nextThreadWorktreePath) {
            setupScriptOptions.cwd = nextThreadWorktreePath;
          }
          await runProjectScript(setupScript, setupScriptOptions);
        }
      }

      // Auto-title from first message
      if (isFirstMessage && isServerThread) {
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId: threadIdForSend,
          title,
        });
      }

      if (isServerThread) {
        await persistThreadSettingsForNextTurn({
          threadId: threadIdForSend,
          createdAt: messageCreatedAt,
          ...(modelForSend ? { model: modelForSend } : {}),
          runtimeMode: runtimeModeForSend,
          interactionMode: interactionModeForSend,
        });
      }

      beginSendPhase(threadIdForSend, "sending-turn");
      const turnAttachments = await turnAttachmentsPromise;
      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: threadIdForSend,
        message: {
          messageId: messageIdForSend,
          role: "user",
          text: textForSend || IMAGE_ONLY_BOOTSTRAP_PROMPT,
          attachments: turnAttachments,
        },
        model: modelForSend || undefined,
        serviceTier: selectedServiceTier,
        ...(modelOptionsForCurrentSend ? { modelOptions: modelOptionsForCurrentSend } : {}),
        ...(providerOptionsForCurrentSend
          ? { providerOptions: providerOptionsForCurrentSend }
          : {}),
        provider: providerForSend,
        assistantDeliveryMode: settings.enableAssistantStreaming ? "streaming" : "buffered",
        runtimeMode: runtimeModeForSend,
        interactionMode: interactionModeForSend,
        ...(selectedSkillNamesForSend.length > 0 ? { skills: selectedSkillNamesForSend } : {}),
        createdAt: messageCreatedAt,
      });
      void invalidateThreadQueries(queryClient);
      turnStartSucceeded = true;
    })().catch(async (err: unknown) => {
      if (createdServerThreadForLocalDraft && !turnStartSucceeded) {
        await api.orchestration
          .dispatchCommand({
            type: "thread.delete",
            commandId: newCommandId(),
            threadId: threadIdForSend,
          })
          .catch(() => undefined);
      }
      if (
        createdWorktreeForSend &&
        !turnStartSucceeded &&
        nextThreadWorktreePath &&
        baseBranchForWorktree
      ) {
        if (isServerThread) {
          await api.orchestration
            .dispatchCommand({
              type: "thread.meta.update",
              commandId: newCommandId(),
              threadId: threadIdForSend,
              branch: originalThreadBranch,
              worktreePath: originalThreadWorktreePath,
            })
            .catch(() => undefined);
          setStoreThreadBranch(threadIdForSend, originalThreadBranch, originalThreadWorktreePath);
        }
        await removeWorktreeMutation
          .mutateAsync({
            cwd: activeProject.cwd,
            path: nextThreadWorktreePath,
            force: true,
          })
          .catch(() => undefined);
      }
      if (
        !turnStartSucceeded &&
        promptRef.current.length === 0 &&
        composerImagesRef.current.length === 0
      ) {
        setOptimisticUserMessages((existing) => {
          const removed = existing.filter((message) => message.id === messageIdForSend);
          for (const message of removed) {
            revokeUserMessagePreviewUrls(message);
          }
          const next = existing.filter((message) => message.id !== messageIdForSend);
          return next.length === existing.length ? existing : next;
        });
        promptRef.current = textForSend;
        setPrompt(textForSend);
        setPendingTemplateOverrides(templateOverridesForSend);
        setComposerCursor(collapseExpandedComposerCursor(textForSend, textForSend.length));
        addComposerImagesToDraft(composerImagesSnapshot.map(cloneComposerImageForRetry));
        setComposerTrigger(detectComposerTrigger(textForSend, textForSend.length));
      }
      setThreadError(
        threadIdForSend,
        err instanceof Error ? err.message : "Failed to send message.",
      );
    });
    setThreadSendInFlight(threadIdForSend, false);
    if (!turnStartSucceeded) {
      resetSendPhase(threadIdForSend);
    }
  };

  const onInterrupt = async () => {
    const api = readNativeApi();
    if (!api || !activeThread || isInterruptingTurn) return;
    const targetTurnId = activeInterruptTurnId;
    setPendingInterruptRequest({
      threadId: activeThread.id,
      turnId: targetTurnId,
    });
    try {
      await api.orchestration.dispatchCommand({
        type: "thread.turn.interrupt",
        commandId: newCommandId(),
        threadId: activeThread.id,
        ...(targetTurnId ? { turnId: targetTurnId } : {}),
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      setPendingInterruptRequest(null);
      const message = err instanceof Error ? err.message : "Failed to stop generation.";
      setThreadError(activeThread.id, message);
      toastManager.add({
        type: "error",
        title: "Failed to stop generation",
        description: message,
      });
    }
  };

  const onRespondToApproval = useCallback(
    async (requestId: ApprovalRequestId, decision: ProviderApprovalDecision) => {
      const api = readNativeApi();
      if (!api) {
        setStoreThreadError(threadId, "Failed to submit approval decision.");
        return;
      }

      setRespondingRequestIds((existing) =>
        existing.includes(requestId) ? existing : [...existing, requestId],
      );
      setOptimisticResolvedApprovalRequestIds((existing) =>
        existing.includes(requestId) ? existing : [...existing, requestId],
      );
      await api.orchestration
        .dispatchCommand({
          type: "thread.approval.respond",
          commandId: newCommandId(),
          threadId,
          requestId,
          decision,
          createdAt: new Date().toISOString(),
        })
        .catch((err: unknown) => {
          setOptimisticResolvedApprovalRequestIds((existing) =>
            existing.filter((id) => id !== requestId),
          );
          setStoreThreadError(
            threadId,
            err instanceof Error ? err.message : "Failed to submit approval decision.",
          );
        });
      setRespondingRequestIds((existing) => existing.filter((id) => id !== requestId));
    },
    [setStoreThreadError, threadId],
  );

  const autoHandledApprovalRuleRequestIdsRef = useRef<Set<ApprovalRequestId>>(new Set());
  useEffect(() => {
    const openRequestIds = new Set(pendingApprovals.map((approval) => approval.requestId));
    for (const requestId of autoHandledApprovalRuleRequestIdsRef.current) {
      if (!openRequestIds.has(requestId)) {
        autoHandledApprovalRuleRequestIdsRef.current.delete(requestId);
      }
    }

    for (const approval of pendingApprovals) {
      if (
        respondingRequestIds.includes(approval.requestId) ||
        autoHandledApprovalRuleRequestIdsRef.current.has(approval.requestId)
      ) {
        continue;
      }

      const matchedRule = findMatchingApprovalRule({
        rules: settings.approvalRules,
        approval,
        activeProjectId: activeProject?.id ?? null,
      });
      if (!matchedRule || matchedRule.action === "ask") {
        continue;
      }

      autoHandledApprovalRuleRequestIdsRef.current.add(approval.requestId);
      toastManager.add({
        type: matchedRule.action === "allow" ? "success" : "warning",
        title: matchedRule.action === "allow" ? "Approval auto-approved" : "Approval auto-denied",
        description: matchedRule.label,
      });
      void onRespondToApproval(
        approval.requestId,
        matchedRule.action === "allow" ? "accept" : "decline",
      );
    }
  }, [
    activeProject?.id,
    onRespondToApproval,
    pendingApprovals,
    respondingRequestIds,
    settings.approvalRules,
  ]);

  const onRespondToUserInput = useCallback(
    async (requestId: ApprovalRequestId, answers: Record<string, unknown>) => {
      const api = readNativeApi();
      if (!api) {
        setStoreThreadError(threadId, "Failed to submit user input.");
        return;
      }

      setRespondingUserInputRequestIds((existing) =>
        existing.includes(requestId) ? existing : [...existing, requestId],
      );
      await api.orchestration
        .dispatchCommand({
          type: "thread.user-input.respond",
          commandId: newCommandId(),
          threadId,
          requestId,
          answers,
          createdAt: new Date().toISOString(),
        })
        .catch((err: unknown) => {
          setStoreThreadError(
            threadId,
            err instanceof Error ? err.message : "Failed to submit user input.",
          );
        });
      setRespondingUserInputRequestIds((existing) => existing.filter((id) => id !== requestId));
    },
    [setStoreThreadError, threadId],
  );

  const setActivePendingUserInputQuestionIndex = useCallback(
    (nextQuestionIndex: number) => {
      if (!activePendingUserInput) {
        return;
      }
      setPendingUserInputQuestionIndexByRequestId((existing) => ({
        ...existing,
        [activePendingUserInput.requestId]: nextQuestionIndex,
      }));
    },
    [activePendingUserInput],
  );

  const onSelectActivePendingUserInputOption = useCallback(
    (questionId: string, optionLabel: string) => {
      if (!activePendingUserInput) {
        return;
      }
      setPendingUserInputAnswersByRequestId((existing) => ({
        ...existing,
        [activePendingUserInput.requestId]: {
          ...existing[activePendingUserInput.requestId],
          [questionId]: {
            selectedOptionLabel: optionLabel,
            customAnswer: "",
          },
        },
      }));
      promptRef.current = "";
      setComposerCursor(0);
      setComposerTrigger(null);
    },
    [activePendingUserInput],
  );

  const onChangeActivePendingUserInputCustomAnswer = useCallback(
    (
      questionId: string,
      value: string,
      nextCursor: number,
      expandedCursor: number,
      cursorAdjacentToMention: boolean,
    ) => {
      if (!activePendingUserInput) {
        return;
      }
      promptRef.current = value;
      setPendingUserInputAnswersByRequestId((existing) => ({
        ...existing,
        [activePendingUserInput.requestId]: {
          ...existing[activePendingUserInput.requestId],
          [questionId]: setPendingUserInputCustomAnswer(
            existing[activePendingUserInput.requestId]?.[questionId],
            value,
          ),
        },
      }));
      setComposerCursor(nextCursor);
      setComposerTrigger(
        cursorAdjacentToMention ? null : detectComposerTrigger(value, expandedCursor),
      );
    },
    [activePendingUserInput],
  );

  const onAdvanceActivePendingUserInput = useCallback(() => {
    if (!activePendingUserInput || !activePendingProgress) {
      return;
    }
    if (activePendingProgress.isLastQuestion) {
      if (activePendingResolvedAnswers) {
        void onRespondToUserInput(activePendingUserInput.requestId, activePendingResolvedAnswers);
      }
      return;
    }
    setActivePendingUserInputQuestionIndex(activePendingProgress.questionIndex + 1);
  }, [
    activePendingProgress,
    activePendingResolvedAnswers,
    activePendingUserInput,
    onRespondToUserInput,
    setActivePendingUserInputQuestionIndex,
  ]);

  const onPreviousActivePendingUserInputQuestion = useCallback(() => {
    if (!activePendingProgress) {
      return;
    }
    setActivePendingUserInputQuestionIndex(Math.max(activePendingProgress.questionIndex - 1, 0));
  }, [activePendingProgress, setActivePendingUserInputQuestionIndex]);

  const onSubmitPlanFollowUp = useCallback(
    async ({
      text,
      interactionMode: nextInteractionMode,
    }: {
      text: string;
      interactionMode: "default" | "plan";
    }) => {
      const api = readNativeApi();
      if (
        !api ||
        !activeThread ||
        !isServerThread ||
        isSendBusy ||
        isConnecting ||
        isThreadSendInFlight(activeThread.id)
      ) {
        return;
      }
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      if (!ensureProviderCredentialsConfigured("submit-form")) {
        return;
      }
      if (!ensureSelectedOpenRouterModelSupportsTools(activeThread.id)) {
        return;
      }

      const threadIdForSend = activeThread.id;
      const messageIdForSend = newMessageId();
      const messageCreatedAt = new Date().toISOString();

      setThreadSendInFlight(threadIdForSend, true);
      beginSendPhase(threadIdForSend, "sending-turn");
      setThreadError(threadIdForSend, null);
      setOptimisticUserMessages((existing) => [
        ...existing,
        {
          id: messageIdForSend,
          role: "user",
          text: trimmed,
          createdAt: messageCreatedAt,
          streaming: false,
        },
      ]);
      shouldAutoScrollRef.current = true;
      forceStickToBottom();

      try {
        await persistThreadSettingsForNextTurn({
          threadId: threadIdForSend,
          createdAt: messageCreatedAt,
          ...(selectedModel ? { model: selectedModel } : {}),
          runtimeMode,
          interactionMode: nextInteractionMode,
        });

        // Keep the mode toggle and plan-follow-up banner in sync immediately
        // while the same-thread implementation turn is starting.
        setComposerDraftInteractionMode(threadIdForSend, nextInteractionMode);

        await api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: threadIdForSend,
          message: {
            messageId: messageIdForSend,
            role: "user",
            text: trimmed,
            attachments: [],
          },
          provider: selectedProvider,
          model: selectedModel || undefined,
          ...(selectedModelOptionsForDispatch
            ? { modelOptions: selectedModelOptionsForDispatch }
            : {}),
          ...(providerOptionsForDispatch ? { providerOptions: providerOptionsForDispatch } : {}),
          assistantDeliveryMode: settings.enableAssistantStreaming ? "streaming" : "buffered",
          runtimeMode,
          interactionMode: nextInteractionMode,
          createdAt: messageCreatedAt,
        });
        // Optimistically open the plan sidebar when implementing (not refining).
        // "default" mode here means the agent is executing the plan, which produces
        // step-tracking activities that the sidebar will display.
        if (nextInteractionMode === "default") {
          planSidebarDismissedForTurnRef.current = null;
          setPlanSidebarOpen(true);
        }
        setThreadSendInFlight(threadIdForSend, false);
        resetSendPhase(threadIdForSend);
      } catch (err) {
        setOptimisticUserMessages((existing) =>
          existing.filter((message) => message.id !== messageIdForSend),
        );
        setThreadError(
          threadIdForSend,
          err instanceof Error ? err.message : "Failed to send plan follow-up.",
        );
        setThreadSendInFlight(threadIdForSend, false);
        resetSendPhase(threadIdForSend);
      }
    },
    [
      activeThread,
      beginSendPhase,
      ensureProviderCredentialsConfigured,
      ensureSelectedOpenRouterModelSupportsTools,
      forceStickToBottom,
      isConnecting,
      isSendBusy,
      isThreadSendInFlight,
      isServerThread,
      persistThreadSettingsForNextTurn,
      resetSendPhase,
      runtimeMode,
      selectedModel,
      selectedModelOptionsForDispatch,
      providerOptionsForDispatch,
      selectedProvider,
      setComposerDraftInteractionMode,
      setThreadSendInFlight,
      setThreadError,
      settings.enableAssistantStreaming,
    ],
  );

  const onImplementPlanInNewThread = useCallback(async () => {
    const api = readNativeApi();
    if (
      !api ||
      !activeThread ||
      !activeProject ||
      !activeProposedPlan ||
      !isServerThread ||
      isSendBusy ||
      isConnecting ||
      isThreadSendInFlight(activeThread.id)
    ) {
      return;
    }
    if (!ensureProviderCredentialsConfigured("implement-plan-in-new-thread")) {
      return;
    }
    if (!ensureSelectedOpenRouterModelSupportsTools(activeThread.id)) {
      return;
    }

    const createdAt = new Date().toISOString();
    const nextThreadId = newThreadId();
    const planMarkdown = activeProposedPlan.planMarkdown;
    const implementationPrompt = buildPlanImplementationPrompt(planMarkdown);
    const nextThreadTitle = truncateTitle(buildPlanImplementationThreadTitle(planMarkdown));
    const nextThreadModel: ModelSlug =
      selectedModel ||
      (activeThread.model as ModelSlug) ||
      (activeProject.model as ModelSlug) ||
      DEFAULT_MODEL_BY_PROVIDER.codex;

    setThreadSendInFlight(activeThread.id, true);
    beginSendPhase(activeThread.id, "sending-turn");
    const finish = () => {
      setThreadSendInFlight(activeThread.id, false);
      resetSendPhase(activeThread.id);
    };

    await api.orchestration
      .dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId: nextThreadId,
        projectId: activeProject.id,
        title: nextThreadTitle,
        model: nextThreadModel,
        runtimeMode,
        interactionMode: "default",
        branch: activeThread.branch,
        worktreePath: activeThread.worktreePath,
        createdAt,
      })
      .then(() => {
        return api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: nextThreadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: implementationPrompt,
            attachments: [],
          },
          provider: selectedProvider,
          model: selectedModel || undefined,
          ...(selectedModelOptionsForDispatch
            ? { modelOptions: selectedModelOptionsForDispatch }
            : {}),
          ...(providerOptionsForDispatch ? { providerOptions: providerOptionsForDispatch } : {}),
          assistantDeliveryMode: settings.enableAssistantStreaming ? "streaming" : "buffered",
          runtimeMode,
          interactionMode: "default",
          createdAt,
        });
      })
      .then(() => api.orchestration.getSnapshot())
      .then((snapshot) => {
        syncServerReadModel(snapshot);
        // Signal that the plan sidebar should open on the new thread.
        planSidebarOpenOnNextThreadRef.current = true;
        return navigate({
          to: "/$threadId",
          params: { threadId: nextThreadId },
        });
      })
      .catch(async (err) => {
        await api.orchestration
          .dispatchCommand({
            type: "thread.delete",
            commandId: newCommandId(),
            threadId: nextThreadId,
          })
          .catch(() => undefined);
        await api.orchestration
          .getSnapshot()
          .then((snapshot) => {
            syncServerReadModel(snapshot);
          })
          .catch(() => undefined);
        toastManager.add({
          type: "error",
          title: "Could not start implementation thread",
          description:
            err instanceof Error ? err.message : "An error occurred while creating the new thread.",
        });
      })
      .then(finish, finish);
  }, [
    activeProject,
    activeProposedPlan,
    activeThread,
    beginSendPhase,
    ensureProviderCredentialsConfigured,
    ensureSelectedOpenRouterModelSupportsTools,
    isConnecting,
    isSendBusy,
    isThreadSendInFlight,
    isServerThread,
    navigate,
    resetSendPhase,
    runtimeMode,
    selectedModel,
    selectedModelOptionsForDispatch,
    providerOptionsForDispatch,
    selectedProvider,
    setThreadSendInFlight,
    settings.enableAssistantStreaming,
    syncServerReadModel,
  ]);
  const saveOpenRouterApiKey = useCallback(() => {
    const trimmed = openRouterApiKeyDraft.trim();
    if (!trimmed) {
      setOpenRouterApiKeyError("Enter an OpenRouter API key.");
      return;
    }

    const continuation = pendingOpenRouterContinuationRef.current;
    pendingOpenRouterContinuationRef.current = null;
    updateSettings({ openRouterApiKey: trimmed });
    setOpenRouterApiKeyError(null);
    setIsOpenRouterApiKeyDialogOpen(false);

    window.setTimeout(() => {
      if (continuation === "submit-form") {
        composerFormRef.current?.requestSubmit();
        return;
      }
      if (continuation === "implement-plan-in-new-thread") {
        void onImplementPlanInNewThread();
      }
    }, 0);
  }, [onImplementPlanInNewThread, openRouterApiKeyDraft, updateSettings]);
  const saveKimiApiKey = useCallback(() => {
    const trimmed = kimiApiKeyDraft.trim();
    if (!trimmed) {
      setKimiApiKeyError("Enter a Kimi API key.");
      return;
    }

    const continuation = pendingKimiContinuationRef.current;
    pendingKimiContinuationRef.current = null;
    updateSettings({ kimiApiKey: trimmed });
    setKimiApiKeyError(null);
    setIsKimiApiKeyDialogOpen(false);

    window.setTimeout(() => {
      if (continuation === "submit-form") {
        composerFormRef.current?.requestSubmit();
        return;
      }
      if (continuation === "implement-plan-in-new-thread") {
        void onImplementPlanInNewThread();
      }
    }, 0);
  }, [kimiApiKeyDraft, onImplementPlanInNewThread, updateSettings]);
  const openRouterApiKeyDialogInputId = useId();
  const kimiApiKeyDialogInputId = useId();
  const providerCustomModelSettings = useMemo<ProviderCustomModelSettings>(
    () => ({
      customCodexModels: settings.customCodexModels,
      customCopilotModels: settings.customCopilotModels,
      customOpencodeModels: settings.customOpencodeModels,
      customKimiModels: settings.customKimiModels,
      customPiModels: settings.customPiModels,
    }),
    [
      settings.customCodexModels,
      settings.customCopilotModels,
      settings.customOpencodeModels,
      settings.customKimiModels,
      settings.customPiModels,
    ],
  );
  const onFavoriteModelChange = useCallback(
    (provider: ProviderKind, model: string, favorite: boolean) => {
      const favoriteModels = new Set(
        getFavoriteModelsForProvider(provider, providerFavoriteModelSettings),
      );
      if (favorite) {
        favoriteModels.add(model);
      } else {
        favoriteModels.delete(model);
      }
      updateSettings(patchFavoriteModels(provider, [...favoriteModels]));
    },
    [providerFavoriteModelSettings, updateSettings],
  );
  const onModelVisibilityChange = useCallback(
    (provider: ProviderKind, model: string, visible: boolean) => {
      const hiddenModels = new Set(
        getHiddenModelsForProvider(provider, providerHiddenModelSettings),
      );
      if (visible) {
        hiddenModels.delete(model);
      } else {
        hiddenModels.add(model);
      }
      updateSettings(patchHiddenModels(provider, [...hiddenModels]));
    },
    [providerHiddenModelSettings, updateSettings],
  );
  const showAllManagedModels = useCallback(() => {
    updateSettings({
      hiddenCodexModels: [],
      hiddenCopilotModels: [],
      hiddenOpencodeModels: [],
      hiddenKimiModels: [],
      hiddenPiModels: [],
    });
  }, [updateSettings]);
  useEffect(() => {
    if (!activeThread) {
      return;
    }
    const nextRecentModels = buildRecentModelSelection(
      getRecentModelsForProvider(selectedProvider, providerRecentModelSettings),
      selectedProvider,
      selectedModel,
      12,
    );
    const currentRecentModels = getRecentModelsForProvider(
      selectedProvider,
      providerRecentModelSettings,
    );
    if (
      nextRecentModels.length === currentRecentModels.length &&
      nextRecentModels.every((entry, index) => entry === currentRecentModels[index])
    ) {
      return;
    }
    updateSettings(patchRecentModels(selectedProvider, nextRecentModels));
  }, [activeThread, providerRecentModelSettings, selectedModel, selectedProvider, updateSettings]);
  const openProviderSetupDialog = useCallback(() => {
    setIsProviderSetupDialogOpen(true);
  }, []);
  const openManageModelsDialog = useCallback(() => {
    setIsManageModelsDialogOpen(true);
  }, []);
  const openManageModelsFromProviderSetup = useCallback(() => {
    setIsProviderSetupDialogOpen(false);
    setIsManageModelsDialogOpen(true);
  }, []);
  const openProviderSetupFromManageModels = useCallback(() => {
    setIsManageModelsDialogOpen(false);
    setIsProviderSetupDialogOpen(true);
  }, []);
  const openOpenRouterApiKeyDialogFromProviderSetup = useCallback(() => {
    setIsProviderSetupDialogOpen(false);
    openOpenRouterApiKeyDialog(null);
  }, [openOpenRouterApiKeyDialog]);
  const openKimiApiKeyDialogFromProviderSetup = useCallback(() => {
    setIsProviderSetupDialogOpen(false);
    openKimiApiKeyDialog(null);
  }, [openKimiApiKeyDialog]);
  const refreshProviderSetupState = useCallback(() => {
    if (isRefreshingProviderSetupState) {
      return;
    }

    const cwd = activeProject?.cwd;
    const binaryPath = settings.opencodeBinaryPath.trim() || undefined;

    setIsRefreshingProviderSetupState(true);
    void Promise.all([
      serverConfigQuery.refetch(),
      queryClient
        .fetchQuery(
          serverOpenCodeStateQueryOptions({
            ...(cwd ? { cwd } : {}),
            ...(binaryPath ? { binaryPath } : {}),
            refreshModels: true,
          }),
        )
        .then((refreshedState) => {
          queryClient.setQueryData(
            serverQueryKeys.openCodeState({
              ...(cwd ? { cwd } : {}),
              ...(binaryPath ? { binaryPath } : {}),
              refreshModels: false,
            }),
            refreshedState,
          );
        }),
    ]).finally(() => {
      setIsRefreshingProviderSetupState(false);
    });
  }, [
    activeProject?.cwd,
    isRefreshingProviderSetupState,
    queryClient,
    serverConfigQuery,
    settings.opencodeBinaryPath,
  ]);

  const onProviderModelSelect = useCallback(
    (provider: ProviderKind, model: ModelSlug) => {
      if (!activeThread) return;
      if (lockedProvider !== null && provider !== lockedProvider) {
        scheduleComposerFocus();
        return;
      }
      setComposerDraftProvider(activeThread.id, provider);
      setComposerDraftModel(
        activeThread.id,
        resolveAppModelSelection(
          provider,
          getCustomModelsForProvider(provider, providerCustomModelSettings),
          model,
        ),
      );
      scheduleComposerFocus();
    },
    [
      activeThread,
      lockedProvider,
      providerCustomModelSettings,
      scheduleComposerFocus,
      setComposerDraftModel,
      setComposerDraftProvider,
    ],
  );
  const onProviderModelSelectFromPicker = useCallback(
    (providerPickerKind: AvailableProviderPickerKind, model: ModelSlug) => {
      const backingProvider = getProviderPickerBackingProvider(providerPickerKind);
      if (!backingProvider) {
        return;
      }
      onProviderModelSelect(backingProvider, model);
    },
    [onProviderModelSelect],
  );
  const onEffortSelect = useCallback(
    (effort: ProviderReasoningLevel | null) => {
      setComposerDraftEffort(threadId, effort, selectedProvider);
      scheduleComposerFocus();
    },
    [scheduleComposerFocus, selectedProvider, setComposerDraftEffort, threadId],
  );
  const onCodexFastModeChange = useCallback(
    (enabled: boolean) => {
      setComposerDraftCodexFastMode(threadId, enabled);
      scheduleComposerFocus();
    },
    [scheduleComposerFocus, setComposerDraftCodexFastMode, threadId],
  );
  const onEnvModeChange = useCallback(
    (mode: DraftThreadEnvMode) => {
      if (isLocalDraftThread) {
        setDraftThreadContext(threadId, { envMode: mode });
      }
      scheduleComposerFocus();
    },
    [isLocalDraftThread, scheduleComposerFocus, setDraftThreadContext, threadId],
  );

  const applyPromptReplacement = useCallback(
    (
      rangeStart: number,
      rangeEnd: number,
      replacement: string,
      options?: { expectedText?: string },
    ): boolean => {
      const currentText = promptRef.current;
      const safeStart = Math.max(0, Math.min(currentText.length, rangeStart));
      const safeEnd = Math.max(safeStart, Math.min(currentText.length, rangeEnd));
      if (
        options?.expectedText !== undefined &&
        currentText.slice(safeStart, safeEnd) !== options.expectedText
      ) {
        return false;
      }
      const next = replaceTextRange(promptRef.current, rangeStart, rangeEnd, replacement);
      const nextCursor = collapseExpandedComposerCursor(next.text, next.cursor);
      promptRef.current = next.text;
      const activePendingQuestion = activePendingProgress?.activeQuestion;
      if (activePendingQuestion && activePendingUserInput) {
        setPendingUserInputAnswersByRequestId((existing) => ({
          ...existing,
          [activePendingUserInput.requestId]: {
            ...existing[activePendingUserInput.requestId],
            [activePendingQuestion.id]: setPendingUserInputCustomAnswer(
              existing[activePendingUserInput.requestId]?.[activePendingQuestion.id],
              next.text,
            ),
          },
        }));
      } else {
        setPrompt(next.text);
      }
      setComposerCursor(nextCursor);
      setComposerTrigger(
        detectComposerTrigger(next.text, expandCollapsedComposerCursor(next.text, nextCursor)),
      );
      window.requestAnimationFrame(() => {
        composerEditorRef.current?.focusAt(nextCursor);
      });
      return true;
    },
    [activePendingProgress?.activeQuestion, activePendingUserInput, setPrompt],
  );

  const readComposerSnapshot = useCallback((): {
    value: string;
    cursor: number;
    expandedCursor: number;
  } => {
    const editorSnapshot = composerEditorRef.current?.readSnapshot();
    if (editorSnapshot) {
      return editorSnapshot;
    }
    return {
      value: promptRef.current,
      cursor: composerCursor,
      expandedCursor: expandCollapsedComposerCursor(promptRef.current, composerCursor),
    };
  }, [composerCursor]);

  const resolveActiveComposerTrigger = useCallback((): {
    snapshot: { value: string; cursor: number; expandedCursor: number };
    trigger: ComposerTrigger | null;
  } => {
    const snapshot = readComposerSnapshot();
    return {
      snapshot,
      trigger: detectComposerTrigger(snapshot.value, snapshot.expandedCursor),
    };
  }, [readComposerSnapshot]);

  const onSelectComposerItem = useCallback(
    (item: ComposerCommandItem) => {
      if (composerSelectLockRef.current) return;
      composerSelectLockRef.current = true;
      window.requestAnimationFrame(() => {
        composerSelectLockRef.current = false;
      });
      const { snapshot, trigger } = resolveActiveComposerTrigger();
      if (!trigger) return;
      if (item.type === "path") {
        const replacement = `@${item.path} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = applyPromptReplacement(
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
        );
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      if (item.type === "slash-command") {
        if (item.command === "model") {
          const replacement = "/model ";
          const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
            snapshot.value,
            trigger.rangeEnd,
            replacement,
          );
          const applied = applyPromptReplacement(
            trigger.rangeStart,
            replacementRangeEnd,
            replacement,
            { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
          );
          if (applied) {
            setComposerHighlightedItemId(null);
          }
          return;
        }
        if (item.command === "mcp") {
          const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "/mcp ", {
            expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd),
          });
          if (applied) {
            setComposerHighlightedItemId(null);
          }
          return;
        }
        if (item.command === "init") {
          const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "/init", {
            expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd),
          });
          if (applied) {
            setComposerHighlightedItemId(null);
          }
          return;
        }
        void runStandaloneSlashCommand(item.command);
        const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "", {
          expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd),
        });
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      if (item.type === "template") {
        const replacement = `/${item.template.name} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = applyPromptReplacement(
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
        );
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      if (item.type === "mcp-server") {
        return;
      }
      onProviderModelSelect(item.provider, item.model);
      const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "", {
        expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd),
      });
      if (applied) {
        setComposerHighlightedItemId(null);
      }
    },
    [
      applyPromptReplacement,
      onProviderModelSelect,
      resolveActiveComposerTrigger,
      runStandaloneSlashCommand,
    ],
  );
  const onComposerMenuItemHighlighted = useCallback((itemId: string | null) => {
    setComposerHighlightedItemId(itemId);
  }, []);
  const nudgeComposerMenuHighlight = useCallback(
    (key: "ArrowDown" | "ArrowUp") => {
      if (composerMenuItems.length === 0) {
        return;
      }
      const highlightedIndex = composerMenuItems.findIndex(
        (item) => item.id === composerHighlightedItemId,
      );
      const normalizedIndex =
        highlightedIndex >= 0 ? highlightedIndex : key === "ArrowDown" ? -1 : 0;
      const offset = key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        (normalizedIndex + offset + composerMenuItems.length) % composerMenuItems.length;
      const nextItem = composerMenuItems[nextIndex];
      setComposerHighlightedItemId(nextItem?.id ?? null);
    },
    [composerHighlightedItemId, composerMenuItems],
  );
  const isComposerMenuLoading =
    composerTriggerKind === "path" &&
    ((pathTriggerQuery.length > 0 && composerPathQueryDebouncer.state.isPending) ||
      workspaceEntriesQuery.isLoading ||
      workspaceEntriesQuery.isFetching);

  const onPromptChange = useCallback(
    (
      nextPrompt: string,
      nextCursor: number,
      expandedCursor: number,
      cursorAdjacentToMention: boolean,
    ) => {
      if (activePendingProgress?.activeQuestion && activePendingUserInput) {
        onChangeActivePendingUserInputCustomAnswer(
          activePendingProgress.activeQuestion.id,
          nextPrompt,
          nextCursor,
          expandedCursor,
          cursorAdjacentToMention,
        );
        return;
      }
      if (pendingTemplateOverrides && nextPrompt !== promptRef.current) {
        setPendingTemplateOverrides(null);
      }
      promptRef.current = nextPrompt;
      setPrompt(nextPrompt);
      setComposerCursor(nextCursor);
      setComposerTrigger(
        cursorAdjacentToMention ? null : detectComposerTrigger(nextPrompt, expandedCursor),
      );
    },
    [
      activePendingProgress?.activeQuestion,
      activePendingUserInput,
      onChangeActivePendingUserInputCustomAnswer,
      pendingTemplateOverrides,
      setPrompt,
    ],
  );

  const onComposerCommandKey = (
    key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab",
    event: KeyboardEvent,
  ) => {
    if (key === "Tab" && event.shiftKey) {
      toggleInteractionMode();
      return true;
    }

    const { trigger } = resolveActiveComposerTrigger();
    const menuIsActive = composerMenuOpenRef.current || trigger !== null;

    if (menuIsActive) {
      const currentItems = composerMenuItemsRef.current;
      if (key === "ArrowDown" && currentItems.length > 0) {
        nudgeComposerMenuHighlight("ArrowDown");
        return true;
      }
      if (key === "ArrowUp" && currentItems.length > 0) {
        nudgeComposerMenuHighlight("ArrowUp");
        return true;
      }
      if (key === "Tab" || key === "Enter") {
        const selectedItem = activeComposerMenuItemRef.current ?? currentItems[0];
        if (selectedItem) {
          onSelectComposerItem(selectedItem);
          return true;
        }
      }
    }

    if (key === "Enter" && !event.shiftKey) {
      if (
        phase === "running" &&
        pendingUserInputs.length === 0 &&
        !isComposerApprovalState &&
        (prompt.trim().length > 0 || composerImages.length > 0)
      ) {
        const nextMode =
          event.metaKey || event.ctrlKey
            ? followUpMode === "queue"
              ? "steer"
              : "queue"
            : followUpMode;
        void queueCurrentComposerTurn(nextMode);
        return true;
      }
      void onSend();
      return true;
    }
    return false;
  };
  const onToggleWorkGroup = useCallback((groupId: string) => {
    setExpandedWorkGroups((existing) => ({
      ...existing,
      [groupId]: !existing[groupId],
    }));
  }, []);
  const onExpandTimelineImage = useCallback((preview: ExpandedImagePreview) => {
    setExpandedImage(preview);
  }, []);
  const expandedImageItem = expandedImage ? expandedImage.images[expandedImage.index] : null;
  const onOpenTurnDiff = useCallback(
    (turnId: TurnId, filePath?: string) => {
      void navigate({
        to: "/$threadId",
        params: { threadId },
        search: (previous) => {
          const rest = stripDiffSearchParams(previous);
          return filePath
            ? { ...rest, diff: "1", diffTurnId: turnId, diffFilePath: filePath }
            : { ...rest, diff: "1", diffTurnId: turnId };
        },
      });
    },
    [navigate, threadId],
  );
  const onRevertUserMessage = (messageId: MessageId) => {
    const targetTurnCount = revertTurnCountByUserMessageId.get(messageId);
    if (typeof targetTurnCount !== "number") {
      return;
    }
    void onRevertToTurnCount(targetTurnCount);
  };

  // Empty state: no active thread
  if (!activeThread) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-muted-foreground/40">
        {!isElectron && (
          <header className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <ThreadSidebarToggle />
              <ThreadNewButton />
              <span className="text-sm font-medium text-foreground">Threads</span>
            </div>
          </header>
        )}
        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-5">
            <ThreadSidebarToggle />
            <ThreadNewButton />
            <span className="text-xs text-muted-foreground/50">No active thread</span>
          </div>
        )}
        <div className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6">
          <EmptyChatOnboarding />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
      {/* Top bar */}
      <header
        className={cn(
          "border-b border-border px-3 sm:px-5",
          isElectron ? "drag-region flex h-[52px] items-center" : "py-2 sm:py-3",
        )}
      >
        <ChatHeader
          activeThreadId={activeThread.id}
          activeThreadTitle={activeThread.title}
          activeProjectName={activeProject?.name}
          isGitRepo={isGitRepo}
          openInCwd={activeThread.worktreePath ?? activeProject?.cwd ?? null}
          activeProjectScripts={activeProject?.scripts}
          preferredScriptId={
            activeProject ? (lastInvokedScriptByProjectId[activeProject.id] ?? null) : null
          }
          keybindings={keybindings}
          availableEditors={availableEditors}
          diffToggleShortcutLabel={diffPanelShortcutLabel}
          gitCwd={gitCwd}
          diffOpen={diffOpen}
          onRunProjectScript={(script) => {
            void runProjectScript(script);
          }}
          onAddProjectScript={saveProjectScript}
          onUpdateProjectScript={updateProjectScript}
          onDeleteProjectScript={deleteProjectScript}
          onToggleDiff={onToggleDiff}
          onShareThread={openThreadShareDialog}
          onCompactThread={() => {
            void compactThread();
          }}
          onUndoThread={() => {
            void undoThread();
          }}
          onRedoThread={() => {
            void redoThread();
          }}
          onForkThread={onForkCurrentThread}
          onExportThread={openThreadExportDialog}
          canShareThread={canShareThread}
          hasActiveShare={activeShare !== null}
          canCompactThread={canCompactThread}
          canUndoThread={canUndoThread}
          canRedoThread={canRedoThread}
          isCompactingThread={compactThreadMutation.isPending}
          isUndoingThread={undoThreadMutation.isPending}
          isRedoingThread={redoThreadMutation.isPending}
          canForkThread={isServerThread && !isForkingThread}
          canExportThread={isServerThread}
        />
      </header>

      {/* Main content area with optional plan sidebar */}
      <div className="flex min-h-0 min-w-0 flex-1">
        {/* Chat column */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {chatBackgroundImage.url ? (
            <div data-chat-background-layer="true" className="pointer-events-none absolute inset-0">
              <div
                className="absolute inset-[-2rem] scale-105 bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage: `url(${chatBackgroundImage.url})`,
                  filter: `blur(${chatBackgroundBlurPx}px)`,
                  opacity: chatBackgroundImageOpacity,
                }}
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_72%,transparent),color-mix(in_srgb,var(--background)_88%,transparent)_45%,color-mix(in_srgb,var(--background)_96%,transparent))]" />
            </div>
          ) : null}
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            {activeProviderStatus?.status !== "ready" ||
            activeModelRerouteNotice ||
            activeThread.error ||
            activeShare ||
            latestResumeContext ||
            latestImportActivity ||
            latestAppliedSkillChips.length > 0 ||
            threadRedoStatusQuery.data?.depth ? (
              <div data-chat-banner-stack="true" className="shrink-0 px-3 sm:px-5">
                <ProviderHealthBanner status={activeProviderStatus} />
                <ThreadModelRerouteBanner notice={activeModelRerouteNotice} />
                <ThreadErrorBanner
                  error={activeThread.error}
                  onDismiss={() => setThreadError(activeThread.id, null)}
                />
                <ThreadFeatureBanners
                  share={activeShare}
                  shareUrl={activeShareUrl}
                  latestResumeContext={latestResumeContext}
                  latestImportActivity={latestImportActivity}
                  latestAppliedSkills={latestAppliedSkillChips}
                  redoDepth={threadRedoStatusQuery.data?.depth ?? 0}
                  canRedoThread={canRedoThread}
                  isRedoingThread={redoThreadMutation.isPending}
                  timestampFormat={timestampFormat}
                  onCopyShareLink={copyThreadShareLink}
                  onManageShare={openThreadShareDialog}
                  onRedoThread={() => {
                    void redoThread();
                  }}
                />
              </div>
            ) : null}
            <ThreadTasksPanel
              tasks={threadTasks}
              timestampFormat={timestampFormat}
              checkpointTurnCountByTurnId={inferredCheckpointTurnCountByTurnId}
            />
            <div className="relative flex min-h-0 flex-1 flex-col">
              {/* Messages */}
              <div
                ref={setMessagesScrollContainerRef}
                className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4"
                onScroll={onMessagesScroll}
                onClickCapture={onMessagesClickCapture}
                onWheel={onMessagesWheel}
                onPointerDown={onMessagesPointerDown}
                onPointerUp={onMessagesPointerUp}
                onPointerCancel={onMessagesPointerCancel}
                onTouchStart={onMessagesTouchStart}
                onTouchMove={onMessagesTouchMove}
                onTouchEnd={onMessagesTouchEnd}
                onTouchCancel={onMessagesTouchEnd}
              >
                <MessagesTimeline
                  key={activeThread.id}
                  hasMessages={timelineEntries.length > 0}
                  isWorking={isWorking}
                  activeTurnInProgress={isWorking || !latestTurnSettled}
                  activeTurnStartedAt={activeWorkStartedAt}
                  scrollContainer={messagesScrollElement}
                  timelineEntries={timelineEntries}
                  completionDividerBeforeEntryId={completionDividerBeforeEntryId}
                  completionSummary={completionSummary}
                  turnDiffSummaryByAssistantMessageId={turnDiffSummaryByAssistantMessageId}
                  nowIso={nowIso}
                  expandedWorkGroups={expandedWorkGroups}
                  onToggleWorkGroup={onToggleWorkGroup}
                  onOpenTurnDiff={onOpenTurnDiff}
                  revertTurnCountByUserMessageId={revertTurnCountByUserMessageId}
                  onRevertUserMessage={onRevertUserMessage}
                  onForkMessage={onForkMessage}
                  isForkingThread={isForkingThread}
                  isRevertingCheckpoint={isRevertingCheckpoint}
                  onImageExpand={onExpandTimelineImage}
                  markdownCwd={gitCwd ?? undefined}
                  resolvedTheme={resolvedTheme}
                  timestampFormat={timestampFormat}
                  workspaceRoot={activeProject?.cwd ?? undefined}
                  emptyStateLabel={chatCopy.sendMessageToStart}
                  workingLabel={chatCopy.working}
                  formatWorkingLabel={chatCopy.workingFor}
                />
              </div>

              {showScrollToBottom && (
                <div className="pointer-events-none absolute bottom-1 left-1/2 z-30 flex -translate-x-1/2 justify-center py-1.5">
                  <button
                    type="button"
                    onClick={() => scrollMessagesToBottom("smooth")}
                    className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-muted-foreground text-xs shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <ChevronDownIcon className="size-3.5" />
                    Scroll to bottom
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Input bar */}
          <div
            className={cn(
              "relative z-10 px-3 pt-1.5 sm:px-5 sm:pt-2",
              isGitRepo ? "pb-1" : "pb-3 sm:pb-4",
            )}
          >
            <form
              ref={composerFormRef}
              onSubmit={onSend}
              className="mx-auto w-full min-w-0 max-w-3xl"
              data-chat-composer-form="true"
            >
              <div
                data-chat-composer-surface="true"
                className={`group app-interactive-motion rounded-[20px] border bg-card focus-within:border-ring/45 ${
                  isDragOverComposer ? "border-primary/70 bg-accent/30" : "border-border"
                }`}
                onDragEnter={onComposerDragEnter}
                onDragOver={onComposerDragOver}
                onDragLeave={onComposerDragLeave}
                onDrop={onComposerDrop}
              >
                {activePendingApproval ? (
                  <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
                    <ComposerPendingApprovalPanel
                      approval={activePendingApproval}
                      matchedRule={activePendingApprovalRule}
                      pendingCount={pendingApprovals.length}
                    />
                  </div>
                ) : pendingUserInputs.length > 0 ? (
                  <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
                    <ComposerPendingUserInputPanel
                      pendingUserInputs={pendingUserInputs}
                      respondingRequestIds={respondingRequestIds}
                      answers={activePendingDraftAnswers}
                      questionIndex={activePendingQuestionIndex}
                      onSelectOption={onSelectActivePendingUserInputOption}
                      onAdvance={onAdvanceActivePendingUserInput}
                    />
                  </div>
                ) : showPlanFollowUpPrompt && activeProposedPlan ? (
                  <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
                    <ComposerPlanFollowUpBanner
                      key={activeProposedPlan.id}
                      planTitle={proposedPlanTitle(activeProposedPlan.planMarkdown) ?? null}
                    />
                  </div>
                ) : null}

                {/* Textarea area */}
                <div
                  className={cn(
                    "relative px-3 pb-2 sm:px-4",
                    hasComposerHeader ? "pt-2.5 sm:pt-3" : "pt-3.5 sm:pt-4",
                  )}
                >
                  {composerMenuOpen && !isComposerApprovalState && (
                    <div className="absolute inset-x-0 bottom-full z-20 mb-2 px-1">
                      <ComposerCommandMenu
                        items={composerMenuItems}
                        resolvedTheme={resolvedTheme}
                        isLoading={isComposerMenuLoading}
                        triggerKind={composerTriggerKind}
                        mcpSupported={composerMcpSupported}
                        activeItemId={activeComposerMenuItem?.id ?? null}
                        onHighlightedItemChange={onComposerMenuItemHighlighted}
                        onSelect={onSelectComposerItem}
                      />
                    </div>
                  )}

                  {!isComposerApprovalState &&
                    pendingUserInputs.length === 0 &&
                    selectedSkillChips.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {selectedSkillChips.map((skill) => (
                          <button
                            key={skill.name}
                            type="button"
                            onClick={() => removeSelectedSkill(skill.name)}
                            className={cn(
                              "app-interactive-motion inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                              skill.available
                                ? "border-amber-500/35 bg-amber-500/8 text-amber-500"
                                : "border-warning/35 bg-warning/8 text-warning",
                            )}
                            title={
                              skill.description ??
                              "This skill is no longer available in the current workspace."
                            }
                          >
                            <span className="truncate">{skill.name}</span>
                            <XIcon className="size-3" />
                          </button>
                        ))}
                      </div>
                    )}

                  {!isComposerApprovalState &&
                    pendingUserInputs.length === 0 &&
                    composerImages.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {composerImages.map((image) => (
                          <div
                            key={image.id}
                            className="relative h-16 w-16 overflow-hidden rounded-lg border border-border/80 bg-background"
                          >
                            {image.previewUrl ? (
                              <button
                                type="button"
                                className="h-full w-full cursor-zoom-in"
                                aria-label={`Preview ${image.name}`}
                                onClick={() => {
                                  const preview = buildExpandedImagePreview(
                                    composerImages,
                                    image.id,
                                  );
                                  if (!preview) return;
                                  setExpandedImage(preview);
                                }}
                              >
                                <img
                                  src={image.previewUrl}
                                  alt={image.name}
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            ) : (
                              <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground/70">
                                {image.name}
                              </div>
                            )}
                            {nonPersistedComposerImageIdSet.has(image.id) && (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <span
                                      role="img"
                                      aria-label="Draft attachment may not persist"
                                      className="absolute left-1 top-1 inline-flex items-center justify-center rounded bg-background/85 p-0.5 text-amber-600"
                                    >
                                      <CircleAlertIcon className="size-3" />
                                    </span>
                                  }
                                />
                                <TooltipPopup
                                  side="top"
                                  className="max-w-64 whitespace-normal leading-tight"
                                >
                                  Draft attachment could not be saved locally and may be lost on
                                  navigation.
                                </TooltipPopup>
                              </Tooltip>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="absolute right-1 top-1 bg-background/80 hover:bg-background/90"
                              onClick={() => removeComposerImage(image.id)}
                              aria-label={`Remove ${image.name}`}
                            >
                              <XIcon />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  {!isComposerApprovalState &&
                    pendingUserInputs.length === 0 &&
                    queuedTurnsForThread.length > 0 && (
                      <div className="mb-3 space-y-2 rounded-xl border border-border/70 bg-background/55 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-medium text-foreground/90">
                              {chatCopy.queuedFollowUps}
                            </p>
                            <p className="text-[11px] text-muted-foreground/70">
                              {hasFailedQueuedTurn
                                ? chatCopy.queuedFollowUpsFailedHint
                                : chatCopy.queuedFollowUpsHint}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            disabled={queuedTurnsForThread.some(
                              (queuedTurn) => queuedTurn.status === "sending",
                            )}
                            onClick={() => {
                              for (const queuedTurn of queuedTurnsForThread) {
                                for (const image of queuedTurn.attachments) {
                                  revokeBlobPreviewUrl(image.previewUrl);
                                }
                              }
                              clearQueuedTurnsForThread(threadId);
                            }}
                          >
                            {chatCopy.clearQueuedFollowUps}
                          </Button>
                        </div>
                        <div className="space-y-1.5">
                          {queuedTurnsForThread.map((queuedTurn, index) => (
                            <div
                              key={queuedTurn.id}
                              className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/70 px-2 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge
                                    variant="secondary"
                                    className="rounded-full px-2 py-0 text-[10px]"
                                  >
                                    {queuedTurn.mode === "steer"
                                      ? chatCopy.steerMode
                                      : chatCopy.queueMode}
                                  </Badge>
                                  {queuedTurn.status === "failed" ? (
                                    <Badge
                                      variant="destructive"
                                      className="rounded-full px-2 py-0 text-[10px]"
                                    >
                                      Failed
                                    </Badge>
                                  ) : queuedTurn.status === "sending" ? (
                                    <Badge
                                      variant="outline"
                                      className="rounded-full px-2 py-0 text-[10px]"
                                    >
                                      Sending
                                    </Badge>
                                  ) : index === 0 ? (
                                    <Badge
                                      variant="outline"
                                      className="rounded-full px-2 py-0 text-[10px]"
                                    >
                                      {chatCopy.nextQueuedFollowUp}
                                    </Badge>
                                  ) : null}
                                  {queuedTurn.attachments.length > 0 ? (
                                    <span className="text-[10px] text-muted-foreground/70">
                                      {queuedTurn.attachments.length} image
                                      {queuedTurn.attachments.length === 1 ? "" : "s"}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs text-foreground/90">
                                  {queuedTurn.text || IMAGE_ONLY_BOOTSTRAP_PROMPT}
                                </p>
                                {queuedTurn.error ? (
                                  <p className="mt-1 text-[11px] text-destructive">
                                    {queuedTurn.error}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  disabled={index === 0 || queuedTurn.status === "sending"}
                                  onClick={() => moveQueuedTurn(threadId, queuedTurn.id, -1)}
                                >
                                  {chatCopy.moveQueuedFollowUpUp}
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  disabled={
                                    index === queuedTurnsForThread.length - 1 ||
                                    queuedTurn.status === "sending"
                                  }
                                  onClick={() => moveQueuedTurn(threadId, queuedTurn.id, 1)}
                                >
                                  {chatCopy.moveQueuedFollowUpDown}
                                </Button>
                                {queuedTurn.status === "failed" ? (
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => markQueuedTurnPending(threadId, queuedTurn.id)}
                                  >
                                    {chatCopy.retryQueuedFollowUp}
                                  </Button>
                                ) : null}
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  disabled={queuedTurn.status === "sending"}
                                  onClick={() => {
                                    for (const image of queuedTurn.attachments) {
                                      revokeBlobPreviewUrl(image.previewUrl);
                                    }
                                    removeQueuedTurn(threadId, queuedTurn.id);
                                  }}
                                >
                                  {chatCopy.removeQueuedFollowUp}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  <ComposerPromptEditor
                    ref={composerEditorRef}
                    value={
                      isComposerApprovalState
                        ? ""
                        : activePendingProgress
                          ? activePendingProgress.customAnswer
                          : prompt
                    }
                    cursor={composerCursor}
                    onChange={onPromptChange}
                    onCommandKeyDown={onComposerCommandKey}
                    onPaste={onComposerPaste}
                    placeholder={
                      isComposerApprovalState
                        ? (activePendingApproval?.detail ??
                          "Resolve this approval request to continue")
                        : activePendingProgress
                          ? "Type your own answer, or leave this blank to use the selected option"
                          : showPlanFollowUpPrompt && activeProposedPlan
                            ? "Add feedback to refine the plan, or leave this blank to implement it"
                            : phase === "disconnected"
                              ? "Ask for follow-up changes or attach images"
                              : "Ask anything, @tag files/folders, or use / to show available commands"
                    }
                    disabled={isConnecting || isComposerApprovalState}
                  />
                  {activeWorkspaceCwd ? (
                    <div className="px-2.5 pb-2 pt-1 text-[11px] text-muted-foreground/70 sm:px-3">
                      {agentsFileQuery.data?.status === "available"
                        ? `Using workspace instructions from ${agentsFileQuery.data.relativePath}`
                        : "No workspace AGENTS.md found. Run /init to create one."}
                    </div>
                  ) : null}
                </div>

                {/* Bottom toolbar */}
                {activePendingApproval ? (
                  <div className="flex items-center justify-end gap-2 px-2.5 pb-2.5 sm:px-3 sm:pb-3">
                    <ComposerPendingApprovalActions
                      requestId={activePendingApproval.requestId}
                      isResponding={respondingRequestIds.includes(activePendingApproval.requestId)}
                      submittingLabel={chatCopy.submitting}
                      onRespondToApproval={onRespondToApproval}
                    />
                  </div>
                ) : (
                  <div
                    data-chat-composer-footer="true"
                    className={cn(
                      "flex items-center justify-between px-2.5 pb-2.5 sm:px-3.5 sm:pb-3.5",
                      isComposerFooterCompact
                        ? "gap-2"
                        : "flex-wrap items-center gap-2.5 sm:flex-nowrap sm:gap-1.5",
                    )}
                  >
                    <div
                      className={cn(
                        "flex min-w-0 flex-1 items-center",
                        isComposerFooterCompact
                          ? "gap-1.5 overflow-hidden"
                          : "items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                      )}
                    >
                      {/* Provider/model picker */}
                      <ProviderModelPicker
                        activeThread={activeThread ?? null}
                        compact={isComposerFooterCompact}
                        language={settings.language}
                        provider={selectedProvider}
                        providerPickerKind={selectedProviderPickerKind}
                        model={selectedModelForPickerWithCustomFallback}
                        {...(selectedModelLabelOverride
                          ? { modelLabelOverride: selectedModelLabelOverride }
                          : {})}
                        lockedProvider={lockedProvider}
                        allModelOptionsByProvider={allModelOptionsByProvider}
                        visibleModelOptionsByProvider={visibleModelOptionsByProvider}
                        openRouterModelOptions={visibleOpenRouterModelOptions}
                        opencodeModelOptions={visibleOpencodeModelOptions}
                        openRouterContextLengthsBySlug={openRouterContextLengthsBySlug}
                        opencodeContextLengthsBySlug={openCodeContextLengthsBySlug}
                        serviceTierSetting={selectedServiceTierSetting}
                        hasHiddenModels={hasHiddenPickerModels}
                        favoriteModelsByProvider={{
                          codex: providerFavoriteModelSettings.favoriteCodexModels,
                          copilot: providerFavoriteModelSettings.favoriteCopilotModels,
                          opencode: providerFavoriteModelSettings.favoriteOpencodeModels,
                          kimi: providerFavoriteModelSettings.favoriteKimiModels,
                          pi: providerFavoriteModelSettings.favoritePiModels,
                        }}
                        recentModelsByProvider={{
                          codex: providerRecentModelSettings.recentCodexModels,
                          copilot: providerRecentModelSettings.recentCopilotModels,
                          opencode: providerRecentModelSettings.recentOpencodeModels,
                          kimi: providerRecentModelSettings.recentKimiModels,
                          pi: providerRecentModelSettings.recentPiModels,
                        }}
                        onOpenProviderSetup={openProviderSetupDialog}
                        onOpenManageModels={openManageModelsDialog}
                        onOpenUsageDashboard={() => setIsUsageDashboardOpen(true)}
                        onProviderModelChange={onProviderModelSelectFromPicker}
                      />

                      <ComposerSkillPicker
                        skills={projectSkills}
                        selectedSkillNames={selectedSkillNames}
                        issuesCount={projectSkillIssues.length}
                        disabled={!activeWorkspaceCwd || isConnecting || phase === "running"}
                        compact={isComposerFooterCompact}
                        onToggleSkill={toggleSelectedSkill}
                      />

                      <ComposerContextWindowStatus
                        compact={isComposerFooterCompact}
                        language={settings.language}
                        provider={selectedProvider}
                        model={selectedModelForPickerWithCustomFallback}
                        tokenUsage={activeThread?.session?.tokenUsage}
                        opencodeContextLengthsBySlug={openCodeContextLengthsBySlug}
                        onOpenUsageDashboard={() => setIsUsageDashboardOpen(true)}
                      />

                      {isComposerFooterCompact ? (
                        <CompactComposerControlsMenu
                          activePlan={Boolean(activePlan || activeProposedPlan || planSidebarOpen)}
                          interactionMode={interactionMode}
                          planSidebarOpen={planSidebarOpen}
                          runtimeMode={runtimeMode}
                          selectedEffort={selectedEffort}
                          selectedProvider={selectedProvider}
                          selectedCodexFastModeEnabled={selectedCodexFastModeEnabled}
                          showCodexFastModeControls={selectedCodexSupportsFastMode}
                          reasoningOptions={reasoningOptions}
                          allowDefaultReasoningSelection={allowDefaultReasoningSelection}
                          onEffortSelect={onEffortSelect}
                          onCodexFastModeChange={onCodexFastModeChange}
                          onToggleInteractionMode={toggleInteractionMode}
                          onTogglePlanSidebar={togglePlanSidebar}
                          onToggleRuntimeMode={toggleRuntimeMode}
                        />
                      ) : (
                        <>
                          {supportsReasoningEffort ? (
                            <>
                              <Separator
                                orientation="vertical"
                                className="mx-1 hidden h-4.5 self-center sm:block"
                              />
                              {selectedProvider === "codex" && selectedEffort !== null ? (
                                <CodexTraitsPicker
                                  effort={selectedEffort}
                                  fastModeEnabled={selectedCodexFastModeEnabled}
                                  showFastModeControls={selectedCodexSupportsFastMode}
                                  options={reasoningOptions}
                                  onEffortChange={onEffortSelect}
                                  onFastModeChange={onCodexFastModeChange}
                                />
                              ) : (
                                <ReasoningTraitsPicker
                                  effort={selectedEffort}
                                  defaultReasoningEffort={getDefaultReasoningEffort(
                                    selectedProvider,
                                  )}
                                  allowDefaultSelection={allowDefaultReasoningSelection}
                                  options={reasoningOptions}
                                  onEffortChange={onEffortSelect}
                                />
                              )}
                            </>
                          ) : null}

                          <Separator
                            orientation="vertical"
                            className="mx-1 hidden h-4.5 self-center sm:block"
                          />

                          <Button
                            variant="ghost"
                            data-chat-composer-control="interaction-mode"
                            className="app-interactive-motion h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-muted-foreground/70 transition-[background-color,color,transform,box-shadow] hover:bg-muted/35 hover:text-foreground/85 motion-safe:hover:-translate-y-px sm:px-3.5"
                            size="sm"
                            type="button"
                            onClick={toggleInteractionMode}
                            title={
                              interactionMode === "plan"
                                ? "Plan mode — click to return to normal chat mode"
                                : "Default mode — click to enter plan mode"
                            }
                          >
                            <BotIcon />
                            <span className="sr-only sm:not-sr-only">
                              {interactionMode === "plan" ? planCopy.planLabel : chatCopy.chatLabel}
                            </span>
                          </Button>

                          <Separator
                            orientation="vertical"
                            className="mx-1 hidden h-4.5 self-center sm:block"
                          />

                          <Button
                            variant="ghost"
                            data-chat-composer-control="runtime-mode"
                            className="app-interactive-motion h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-muted-foreground/70 transition-[background-color,color,transform,box-shadow] hover:bg-muted/35 hover:text-foreground/85 motion-safe:hover:-translate-y-px sm:px-3.5"
                            size="sm"
                            type="button"
                            onClick={() =>
                              void handleRuntimeModeChange(
                                runtimeMode === "full-access" ? "approval-required" : "full-access",
                              )
                            }
                            title={
                              runtimeMode === "full-access"
                                ? chatCopy.fullAccessTooltip
                                : chatCopy.approvalRequiredTooltip
                            }
                          >
                            {runtimeMode === "full-access" ? <LockOpenIcon /> : <LockIcon />}
                            <span className="sr-only sm:not-sr-only">
                              {runtimeMode === "full-access"
                                ? chatCopy.fullAccess
                                : chatCopy.supervised}
                            </span>
                          </Button>

                          {activePlan || activeProposedPlan || planSidebarOpen ? (
                            <>
                              <Separator
                                orientation="vertical"
                                className="mx-1 hidden h-4.5 self-center sm:block"
                              />
                              <Button
                                variant="ghost"
                                className={cn(
                                  "app-interactive-motion h-8 shrink-0 whitespace-nowrap rounded-full px-3 transition-[background-color,color,transform,box-shadow] motion-safe:hover:-translate-y-px sm:px-3.5",
                                  planSidebarOpen
                                    ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500/14 hover:text-blue-300"
                                    : "text-muted-foreground/70 hover:bg-muted/35 hover:text-foreground/85",
                                )}
                                size="sm"
                                type="button"
                                onClick={togglePlanSidebar}
                                title={
                                  planSidebarOpen
                                    ? planCopy.hidePlanSidebar
                                    : planCopy.showPlanSidebar
                                }
                              >
                                <ListTodoIcon />
                                <span className="sr-only sm:not-sr-only">{planCopy.planLabel}</span>
                              </Button>
                            </>
                          ) : null}
                        </>
                      )}
                    </div>

                    {/* Right side: send / stop button */}
                    <div
                      data-chat-composer-actions="right"
                      className="flex shrink-0 items-center gap-2.5"
                    >
                      <input
                        ref={composerFileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          const files = Array.from(event.currentTarget.files ?? []);
                          if (files.length > 0) {
                            addComposerImages(files);
                          }
                          event.currentTarget.value = "";
                        }}
                      />
                      {!isComposerApprovalState && pendingUserInputs.length === 0 ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                className="rounded-full"
                                aria-label={chatCopy.attachImages}
                                disabled={isConnecting}
                                onClick={() => composerFileInputRef.current?.click()}
                              />
                            }
                          >
                            <PaperclipIcon className="size-3.5" />
                          </TooltipTrigger>
                          <TooltipPopup side="top">{chatCopy.attachImagesTooltip}</TooltipPopup>
                        </Tooltip>
                      ) : null}
                      {isPreparingWorktree ? (
                        <span className="text-muted-foreground/70 text-xs">
                          {chatCopy.preparingWorktree}
                        </span>
                      ) : null}
                      {activePendingProgress ? (
                        <div className="flex items-center gap-2">
                          {activePendingProgress.questionIndex > 0 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full"
                              onClick={onPreviousActivePendingUserInputQuestion}
                              disabled={activePendingIsResponding}
                            >
                              {chatCopy.previous}
                            </Button>
                          ) : null}
                          <Button
                            type="submit"
                            size="sm"
                            className="rounded-full px-4"
                            disabled={
                              activePendingIsResponding ||
                              (activePendingProgress.isLastQuestion
                                ? !activePendingResolvedAnswers
                                : !activePendingProgress.canAdvance)
                            }
                          >
                            {activePendingIsResponding
                              ? chatCopy.submitting
                              : activePendingProgress.isLastQuestion
                                ? chatCopy.submitAnswers
                                : chatCopy.nextQuestion}
                          </Button>
                        </div>
                      ) : phase === "running" ? (
                        prompt.trim().length > 0 || composerImages.length > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background/70 p-1">
                              <button
                                type="button"
                                className={cn(
                                  "rounded-full px-2.5 py-1 text-[11px] transition-colors",
                                  followUpMode === "queue"
                                    ? "bg-primary/12 text-primary"
                                    : "text-muted-foreground hover:text-foreground",
                                )}
                                aria-pressed={followUpMode === "queue"}
                                onClick={() => setFollowUpMode(threadId, "queue")}
                              >
                                {chatCopy.queueMode}
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  "rounded-full px-2.5 py-1 text-[11px] transition-colors",
                                  followUpMode === "steer"
                                    ? "bg-primary/12 text-primary"
                                    : "text-muted-foreground hover:text-foreground",
                                )}
                                aria-pressed={followUpMode === "steer"}
                                onClick={() => setFollowUpMode(threadId, "steer")}
                              >
                                {chatCopy.steerMode}
                              </button>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              className="rounded-full px-4"
                              onClick={() => void queueCurrentComposerTurn(followUpMode)}
                            >
                              {followUpMode === "queue" ? chatCopy.queueFollowUp : chatCopy.sendNow}
                            </Button>
                            <button
                              type="button"
                              className="app-interactive-motion flex size-8 cursor-pointer items-center justify-center rounded-full bg-rose-500/90 text-white transition-all duration-150 hover:bg-rose-500 hover:scale-105 disabled:cursor-wait disabled:opacity-70 motion-safe:hover:-translate-y-px motion-reduce:hover:scale-100 sm:h-8 sm:w-8"
                              onClick={() => void onInterrupt()}
                              disabled={isInterruptingTurn}
                              aria-label={
                                isInterruptingTurn
                                  ? chatCopy.stoppingGeneration
                                  : chatCopy.stopGeneration
                              }
                            >
                              {isInterruptingTurn ? (
                                <RefreshCwIcon className="size-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 12 12"
                                  fill="currentColor"
                                  aria-hidden="true"
                                >
                                  <rect x="2" y="2" width="8" height="8" rx="1.5" />
                                </svg>
                              )}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="app-interactive-motion flex size-8 cursor-pointer items-center justify-center rounded-full bg-rose-500/90 text-white transition-all duration-150 hover:bg-rose-500 hover:scale-105 disabled:cursor-wait disabled:opacity-70 motion-safe:hover:-translate-y-px motion-reduce:hover:scale-100 sm:h-8 sm:w-8"
                            onClick={() => void onInterrupt()}
                            disabled={isInterruptingTurn}
                            aria-label={
                              isInterruptingTurn
                                ? chatCopy.stoppingGeneration
                                : chatCopy.stopGeneration
                            }
                          >
                            {isInterruptingTurn ? (
                              <RefreshCwIcon className="size-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="currentColor"
                                aria-hidden="true"
                              >
                                <rect x="2" y="2" width="8" height="8" rx="1.5" />
                              </svg>
                            )}
                          </button>
                        )
                      ) : pendingUserInputs.length === 0 ? (
                        showPlanFollowUpPrompt ? (
                          prompt.trim().length > 0 ? (
                            <Button
                              type="submit"
                              size="sm"
                              className="h-9 rounded-full px-4 sm:h-8"
                              disabled={isSendBusy || isConnecting}
                            >
                              {isConnecting || isSendBusy ? "Sending..." : "Refine"}
                            </Button>
                          ) : (
                            <div className="flex items-center">
                              <Button
                                type="submit"
                                size="sm"
                                className="h-9 rounded-l-full rounded-r-none px-4 sm:h-8"
                                disabled={isSendBusy || isConnecting}
                              >
                                {isConnecting || isSendBusy ? "Sending..." : "Implement"}
                              </Button>
                              <Menu>
                                <MenuTrigger
                                  render={
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="h-9 rounded-l-none rounded-r-full border-l-white/12 px-2 sm:h-8"
                                      aria-label="Implementation actions"
                                      disabled={isSendBusy || isConnecting}
                                    />
                                  }
                                >
                                  <ChevronDownIcon className="size-3.5" />
                                </MenuTrigger>
                                <MenuPopup align="end" side="top">
                                  <MenuItem
                                    disabled={isSendBusy || isConnecting}
                                    onClick={() => void onImplementPlanInNewThread()}
                                  >
                                    Implement in new thread
                                  </MenuItem>
                                </MenuPopup>
                              </Menu>
                            </div>
                          )
                        ) : (
                          <button
                            type="submit"
                            data-chat-composer-control="primary-action"
                            className="app-interactive-motion flex h-9 w-9 items-center justify-center rounded-full bg-primary/90 text-primary-foreground hover:bg-primary hover:scale-105 motion-safe:hover:-translate-y-px disabled:opacity-30 disabled:hover:scale-100 motion-reduce:hover:scale-100 sm:h-8 sm:w-8"
                            disabled={
                              isSendBusy ||
                              isConnecting ||
                              hasQueuedTurns ||
                              (!prompt.trim() && composerImages.length === 0)
                            }
                            aria-label={
                              isConnecting
                                ? "Connecting"
                                : isPreparingWorktree
                                  ? "Preparing worktree"
                                  : isSendBusy
                                    ? "Sending"
                                    : hasQueuedTurns
                                      ? "Queued follow-ups pending"
                                      : "Send message"
                            }
                          >
                            {isConnecting || isSendBusy ? (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 14 14"
                                fill="none"
                                className="motion-safe:animate-spin motion-reduce:animate-none"
                                aria-hidden="true"
                              >
                                <circle
                                  cx="7"
                                  cy="7"
                                  r="5.5"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeDasharray="20 12"
                                />
                              </svg>
                            ) : (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 14 14"
                                fill="none"
                                aria-hidden="true"
                              >
                                <path
                                  d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        )
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>

          {isGitRepo && (
            <BranchToolbar
              threadId={activeThread.id}
              onEnvModeChange={onEnvModeChange}
              envLocked={envLocked}
              onComposerFocusRequest={scheduleComposerFocus}
              {...(canCheckoutPullRequestIntoThread
                ? { onCheckoutPullRequestRequest: openPullRequestDialog }
                : {})}
            />
          )}
          {pullRequestDialogState ? (
            <PullRequestThreadDialog
              key={pullRequestDialogState.key}
              open
              cwd={activeProject?.cwd ?? null}
              initialReference={pullRequestDialogState.initialReference}
              onOpenChange={(open) => {
                if (!open) {
                  closePullRequestDialog();
                }
              }}
              onPrepared={handlePreparedPullRequestThread}
            />
          ) : null}
          <ThreadShareDialog
            open={isThreadShareDialogOpen}
            onOpenChange={setIsThreadShareDialogOpen}
            threadTitle={activeThread.title}
            share={activeShare}
            shareUrl={activeShareUrl}
            isCreatingShare={createThreadShareMutation.isPending}
            isRevokingShare={revokeThreadShareMutation.isPending}
            onCreateShare={() => {
              void createThreadShare();
            }}
            onCopyLink={() => {
              void copyThreadShareLink();
            }}
            onOpenSharedView={openSharedThreadView}
            onRevokeShare={() => {
              void revokeThreadShare();
            }}
          />
          <ThreadExportDialog
            open={isThreadExportDialogOpen}
            onOpenChange={(open) => {
              if (!isSavingThreadExport) {
                setIsThreadExportDialogOpen(open);
              }
            }}
            threadTitle={activeThread.title}
            workspaceRoot={threadExportWorkspaceRoot}
            format={threadExportFormat}
            onFormatChange={updateThreadExportFormat}
            savePath={threadExportPath}
            onSavePathChange={setThreadExportPath}
            defaultFilename={threadExportDefaultFilename}
            onDownload={onDownloadThreadExport}
            onSaveToWorkspace={onSaveThreadExportToWorkspace}
            isSavingToWorkspace={isSavingThreadExport}
          />
        </div>
        {/* end chat column */}

        {/* Plan sidebar */}
        {planSidebarOpen ? (
          <PlanSidebar
            activePlan={activePlan}
            activeProposedPlan={activeProposedPlan}
            markdownCwd={gitCwd ?? undefined}
            workspaceRoot={activeProject?.cwd ?? undefined}
            timestampFormat={timestampFormat}
            onClose={() => {
              setPlanSidebarOpen(false);
              // Track that the user explicitly dismissed for this turn so auto-open won't fight them.
              const turnKey = activePlan?.turnId ?? activeProposedPlan?.turnId ?? null;
              if (turnKey) {
                planSidebarDismissedForTurnRef.current = turnKey;
              }
            }}
          />
        ) : null}
      </div>
      {/* end horizontal flex container */}

      {(() => {
        if (!terminalState.terminalOpen || !activeProject) {
          return null;
        }
        return (
          <ThreadTerminalDrawer
            key={activeThread.id}
            threadId={activeThread.id}
            cwd={gitCwd ?? activeProject.cwd}
            runtimeEnv={threadTerminalRuntimeEnv}
            height={terminalState.terminalHeight}
            terminalIds={terminalState.terminalIds}
            activeTerminalId={terminalState.activeTerminalId}
            terminalGroups={terminalState.terminalGroups}
            activeTerminalGroupId={terminalState.activeTerminalGroupId}
            focusRequestId={terminalFocusRequestId}
            onSplitTerminal={splitTerminal}
            onNewTerminal={createNewTerminal}
            splitShortcutLabel={splitTerminalShortcutLabel ?? undefined}
            newShortcutLabel={newTerminalShortcutLabel ?? undefined}
            closeShortcutLabel={closeTerminalShortcutLabel ?? undefined}
            onActiveTerminalChange={activateTerminal}
            onCloseTerminal={closeTerminal}
            onHeightChange={setTerminalHeight}
          />
        );
      })()}

      {expandedImage && expandedImageItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 [-webkit-app-region:no-drag]"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded image preview"
        >
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-zoom-out"
            aria-label="Close image preview"
            onClick={closeExpandedImage}
          />
          {expandedImage.images.length > 1 && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute left-2 top-1/2 z-20 -translate-y-1/2 text-white/90 hover:bg-white/10 hover:text-white sm:left-6"
              aria-label="Previous image"
              onClick={() => {
                navigateExpandedImage(-1);
              }}
            >
              <ChevronLeftIcon className="size-5" />
            </Button>
          )}
          <div className="relative isolate z-10 max-h-[92vh] max-w-[92vw]">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="absolute right-2 top-2"
              onClick={closeExpandedImage}
              aria-label="Close image preview"
            >
              <XIcon />
            </Button>
            <img
              src={expandedImageItem.src}
              alt={expandedImageItem.name}
              className="max-h-[86vh] max-w-[92vw] select-none rounded-lg border border-border/70 bg-background object-contain shadow-2xl"
              draggable={false}
            />
            <p className="mt-2 max-w-[92vw] truncate text-center text-xs text-muted-foreground/80">
              {expandedImageItem.name}
              {expandedImage.images.length > 1
                ? ` (${expandedImage.index + 1}/${expandedImage.images.length})`
                : ""}
            </p>
          </div>
          {expandedImage.images.length > 1 && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute right-2 top-1/2 z-20 -translate-y-1/2 text-white/90 hover:bg-white/10 hover:text-white sm:right-6"
              aria-label="Next image"
              onClick={() => {
                navigateExpandedImage(1);
              }}
            >
              <ChevronRightIcon className="size-5" />
            </Button>
          )}
        </div>
      )}

      <UsageDashboardDialog
        open={isUsageDashboardOpen}
        onOpenChange={setIsUsageDashboardOpen}
        language={settings.language}
        provider={selectedProvider}
        model={selectedModelForPickerWithCustomFallback}
        tokenUsage={activeThread?.session?.tokenUsage}
        opencodeContextLengthsBySlug={openCodeContextLengthsBySlug}
      />

      <ProviderSetupDialog
        open={isProviderSetupDialogOpen}
        onOpenChange={setIsProviderSetupDialogOpen}
        language={settings.language}
        providerStatuses={providerStatuses}
        openCodeState={openCodeStateQuery.data ?? null}
        hasOpenRouterApiKey={settings.openRouterApiKey.trim().length > 0}
        hasKimiApiKey={settings.kimiApiKey.trim().length > 0}
        codexBinaryPath={settings.codexBinaryPath}
        copilotBinaryPath={settings.copilotBinaryPath}
        opencodeBinaryPath={settings.opencodeBinaryPath}
        kimiBinaryPath={settings.kimiBinaryPath}
        isRefreshing={isRefreshingProviderSetupState}
        onRefresh={refreshProviderSetupState}
        onOpenOpenRouterKeyDialog={openOpenRouterApiKeyDialogFromProviderSetup}
        onOpenKimiKeyDialog={openKimiApiKeyDialogFromProviderSetup}
        onOpenManageModels={openManageModelsFromProviderSetup}
        onOpenSettings={() => {
          setIsProviderSetupDialogOpen(false);
          void navigate({ to: "/settings" });
        }}
      />

      <ManageModelsDialog
        open={isManageModelsDialogOpen}
        onOpenChange={setIsManageModelsDialogOpen}
        language={settings.language}
        selectedProviderPickerKind={selectedProviderPickerKind}
        allModelOptionsByProvider={allModelOptionsByProvider}
        openRouterModelOptions={openRouterModelOptions}
        opencodeModelOptions={opencodeModelOptions}
        hiddenModelsByProvider={providerHiddenModelSettings}
        favoriteModelsByProvider={providerFavoriteModelSettings}
        recentModelsByProvider={providerRecentModelSettings}
        openRouterContextLengthsBySlug={openRouterContextLengthsBySlug}
        opencodeContextLengthsBySlug={openCodeContextLengthsBySlug}
        serviceTierSetting={selectedServiceTierSetting}
        onFavoriteModelChange={onFavoriteModelChange}
        onModelVisibilityChange={onModelVisibilityChange}
        onShowAll={showAllManagedModels}
        onOpenProviderSetup={openProviderSetupFromManageModels}
      />

      <Dialog
        open={isOpenRouterApiKeyDialogOpen}
        onOpenChange={(open) => {
          setIsOpenRouterApiKeyDialogOpen(open);
          if (!open) {
            pendingOpenRouterContinuationRef.current = null;
            setOpenRouterApiKeyDraft(settings.openRouterApiKey);
            setOpenRouterApiKeyError(null);
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enter your OpenRouter API key</DialogTitle>
            <DialogDescription>
              CUT3 needs an OpenRouter API key before it can start Codex sessions that use
              OpenRouter-routed models such as <code>openrouter/free</code> or specific{" "}
              <code>:free</code> model ids.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <label htmlFor={openRouterApiKeyDialogInputId} className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">OpenRouter API key</span>
              <Input
                id={openRouterApiKeyDialogInputId}
                type="password"
                value={openRouterApiKeyDraft}
                onChange={(event) => {
                  setOpenRouterApiKeyDraft(event.target.value);
                  if (openRouterApiKeyError) {
                    setOpenRouterApiKeyError(null);
                  }
                }}
                placeholder="sk-or-..."
                autoComplete="new-password"
                spellCheck={false}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {isElectron
                ? "The key stays in the desktop session and is persisted in your OS credential store when secure storage is available."
                : "The key stays only in memory for the current browser session."}{" "}
              It is only used when launching Codex sessions that route through OpenRouter.
            </p>
            {openRouterApiKeyError ? (
              <p className="text-xs text-destructive">{openRouterApiKeyError}</p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                pendingOpenRouterContinuationRef.current = null;
                setIsOpenRouterApiKeyDialogOpen(false);
                setOpenRouterApiKeyDraft(settings.openRouterApiKey);
                setOpenRouterApiKeyError(null);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={saveOpenRouterApiKey}>
              Save key
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={isKimiApiKeyDialogOpen}
        onOpenChange={(open) => {
          setIsKimiApiKeyDialogOpen(open);
          if (!open) {
            pendingKimiContinuationRef.current = null;
            setKimiApiKeyDraft(settings.kimiApiKey);
            setKimiApiKeyError(null);
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enter your Kimi API key</DialogTitle>
            <DialogDescription>
              CUT3 can start Kimi CLI chat with a Kimi Code API key. You can generate one from the
              Kimi Code Console, or authenticate in the local CLI with <code>kimi login</code> or
              <code>/login</code> instead.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <label htmlFor={kimiApiKeyDialogInputId} className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Kimi API key</span>
              <Input
                id={kimiApiKeyDialogInputId}
                type="password"
                value={kimiApiKeyDraft}
                onChange={(event) => {
                  setKimiApiKeyDraft(event.target.value);
                  if (kimiApiKeyError) {
                    setKimiApiKeyError(null);
                  }
                }}
                placeholder="sk-kimi-..."
                autoComplete="new-password"
                spellCheck={false}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {isElectron
                ? "The key stays in the desktop session and is persisted in your OS credential store when secure storage is available."
                : "The key stays only in memory for the current browser session."}{" "}
              It is only used when starting new Kimi Code sessions. Leave it blank if you prefer to
              authenticate in the local CLI with <code>kimi login</code> or <code>/login</code>.
            </p>
            {kimiApiKeyError ? <p className="text-xs text-destructive">{kimiApiKeyError}</p> : null}
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                pendingKimiContinuationRef.current = null;
                setIsKimiApiKeyDialogOpen(false);
                setKimiApiKeyDraft(settings.kimiApiKey);
                setKimiApiKeyError(null);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={saveKimiApiKey}>
              Save key
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}

interface ChatHeaderProps {
  activeThreadId: ThreadId;
  activeThreadTitle: string;
  activeProjectName: string | undefined;
  isGitRepo: boolean;
  openInCwd: string | null;
  activeProjectScripts: ProjectScript[] | undefined;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  diffToggleShortcutLabel: string | null;
  gitCwd: string | null;
  diffOpen: boolean;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<void>;
  onUpdateProjectScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void>;
  onDeleteProjectScript: (scriptId: string) => Promise<void>;
  onToggleDiff: () => void;
  onShareThread: () => void;
  onCompactThread: () => void;
  onUndoThread: () => void;
  onRedoThread: () => void;
  onForkThread: () => void;
  onExportThread: () => void;
  canShareThread: boolean;
  hasActiveShare: boolean;
  canCompactThread: boolean;
  canUndoThread: boolean;
  canRedoThread: boolean;
  isCompactingThread: boolean;
  isUndoingThread: boolean;
  isRedoingThread: boolean;
  canForkThread: boolean;
  canExportThread: boolean;
}

const ThreadHeaderActionsMenu = memo(function ThreadHeaderActionsMenu(props: {
  onShareThread: () => void;
  onCompactThread: () => void;
  onForkThread: () => void;
  onExportThread: () => void;
  canShareThread: boolean;
  hasActiveShare: boolean;
  canCompactThread: boolean;
  isCompactingThread: boolean;
  canForkThread: boolean;
  canExportThread: boolean;
}) {
  return (
    <Menu>
      <MenuTrigger render={<Button aria-label="Thread actions" size="icon-xs" variant="outline" />}>
        <EllipsisIcon aria-hidden="true" className="size-4" />
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuItem onClick={props.onShareThread} disabled={!props.canShareThread}>
          {props.hasActiveShare ? "Manage share" : "Share thread"}
        </MenuItem>
        <MenuItem onClick={props.onCompactThread} disabled={!props.canCompactThread}>
          {props.isCompactingThread ? "Compacting..." : "Compact thread"}
        </MenuItem>
        <MenuDivider />
        <MenuItem onClick={props.onForkThread} disabled={!props.canForkThread}>
          Fork thread
        </MenuItem>
        <MenuItem onClick={props.onExportThread} disabled={!props.canExportThread}>
          Export thread
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
});

const ChatHeader = memo(function ChatHeader({
  activeThreadId,
  activeThreadTitle,
  activeProjectName,
  isGitRepo,
  openInCwd,
  activeProjectScripts,
  preferredScriptId,
  keybindings,
  availableEditors,
  diffToggleShortcutLabel,
  gitCwd,
  diffOpen,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
  onToggleDiff,
  onShareThread,
  onCompactThread,
  onUndoThread,
  onRedoThread,
  onForkThread,
  onExportThread,
  canShareThread,
  hasActiveShare,
  canCompactThread,
  canUndoThread,
  canRedoThread,
  isCompactingThread,
  isUndoingThread,
  isRedoingThread,
  canForkThread,
  canExportThread,
}: ChatHeaderProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
        <ThreadSidebarToggle />
        <ThreadNewButton />
        <h2
          className="min-w-0 shrink truncate text-sm font-medium text-foreground"
          title={activeThreadTitle}
        >
          {activeThreadTitle}
        </h2>
        {activeProjectName && (
          <Badge variant="outline" className="min-w-0 shrink truncate">
            {activeProjectName}
          </Badge>
        )}
        {activeProjectName && !isGitRepo && (
          <Badge variant="outline" className="shrink-0 text-[10px] text-amber-700">
            No Git
          </Badge>
        )}
      </div>
      <div className="@container/header-actions flex min-w-0 flex-1 items-center justify-end gap-2 @sm/header-actions:gap-3">
        {activeProjectScripts && (
          <ProjectScriptsControl
            scripts={activeProjectScripts}
            keybindings={keybindings}
            preferredScriptId={preferredScriptId}
            onRunScript={onRunProjectScript}
            onAddScript={onAddProjectScript}
            onUpdateScript={onUpdateProjectScript}
            onDeleteScript={onDeleteProjectScript}
          />
        )}
        {activeProjectName && (
          <OpenInPicker
            keybindings={keybindings}
            availableEditors={availableEditors}
            openInCwd={openInCwd}
          />
        )}
        {activeProjectName && <GitActionsControl gitCwd={gitCwd} activeThreadId={activeThreadId} />}
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="shrink-0"
          onClick={onUndoThread}
          disabled={!canUndoThread}
        >
          <RotateCcwIcon className="size-3.5" />
          <span className="sr-only @lg/header-actions:not-sr-only @lg/header-actions:ml-0.5">
            {isUndoingThread ? "Undoing..." : "Undo"}
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="shrink-0"
          onClick={onRedoThread}
          disabled={!canRedoThread}
        >
          <RotateCwIcon className="size-3.5" />
          <span className="sr-only @lg/header-actions:not-sr-only @lg/header-actions:ml-0.5">
            {isRedoingThread ? "Redoing..." : "Redo"}
          </span>
        </Button>
        <ThreadHeaderActionsMenu
          onShareThread={onShareThread}
          onCompactThread={onCompactThread}
          onForkThread={onForkThread}
          onExportThread={onExportThread}
          canShareThread={canShareThread}
          hasActiveShare={hasActiveShare}
          canCompactThread={canCompactThread}
          isCompactingThread={isCompactingThread}
          canForkThread={canForkThread}
          canExportThread={canExportThread}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className="shrink-0"
                pressed={diffOpen}
                onPressedChange={onToggleDiff}
                aria-label="Toggle diff panel"
                variant="outline"
                size="xs"
                disabled={!isGitRepo}
              >
                <DiffIcon className="size-3" />
              </Toggle>
            }
          />
          <TooltipPopup side="bottom">
            {!isGitRepo
              ? "Diff panel is unavailable because this project is not a git repository."
              : diffToggleShortcutLabel
                ? `Toggle diff panel (${diffToggleShortcutLabel})`
                : "Toggle diff panel"}
          </TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
});

const ThreadErrorBanner = memo(function ThreadErrorBanner({
  error,
  onDismiss,
}: {
  error: string | null;
  onDismiss?: () => void;
}) {
  if (!error) return null;
  return (
    <div className="pt-3 mx-auto max-w-3xl">
      <Alert variant="error">
        <CircleAlertIcon />
        <AlertDescription className="line-clamp-3" title={error}>
          {error}
        </AlertDescription>
        {onDismiss && (
          <AlertAction>
            <button
              type="button"
              aria-label="Dismiss error"
              className="inline-flex size-6 items-center justify-center rounded-md text-destructive/60 transition-colors hover:text-destructive"
              onClick={onDismiss}
            >
              <XIcon className="size-3.5" />
            </button>
          </AlertAction>
        )}
      </Alert>
    </div>
  );
});

function buildSharedThreadUrl(share: ThreadShareSummary | null): string | null {
  if (!share) {
    return null;
  }
  const relativePath = `/shared/${share.shareId}`;
  if (typeof window === "undefined") {
    return relativePath;
  }
  try {
    return new URL(relativePath, window.location.origin).toString();
  } catch {
    return relativePath;
  }
}

function getResumeContextBannerTitle(input: { source: string | null; importedFromShare: boolean }) {
  if (input.importedFromShare) {
    return "Imported from shared thread";
  }
  switch (input.source) {
    case "compact":
      return "Thread compacted";
    case "redo":
      return "Undo restored";
    default:
      return "Continuation summary active";
  }
}

const ThreadFeatureBanners = memo(function ThreadFeatureBanners(props: {
  share: ThreadShareSummary | null;
  shareUrl: string | null;
  latestResumeContext: ReturnType<typeof parseLatestResumeContextActivity>;
  latestImportActivity: ReturnType<typeof parseLatestThreadImportActivity>;
  latestAppliedSkills: ReadonlyArray<{ name: ProjectSkillName; description: string | null }>;
  redoDepth: number;
  canRedoThread: boolean;
  isRedoingThread: boolean;
  timestampFormat: AppSettings["timestampFormat"];
  onCopyShareLink: () => void;
  onManageShare: () => void;
  onRedoThread: () => void;
}) {
  if (
    !props.share &&
    !props.latestResumeContext &&
    props.latestAppliedSkills.length === 0 &&
    props.redoDepth === 0
  ) {
    return null;
  }

  return (
    <>
      {props.share && props.shareUrl ? (
        <div className="mx-auto max-w-3xl pt-3">
          <Alert variant="info">
            <Share2Icon />
            <AlertTitle>Shared snapshot available</AlertTitle>
            <AlertDescription>
              <div>
                Read-only link created{" "}
                {formatTimestamp(props.share.createdAt, props.timestampFormat)}.
              </div>
              <div className="truncate text-xs text-muted-foreground/75" title={props.shareUrl}>
                {props.shareUrl}
              </div>
            </AlertDescription>
            <AlertAction>
              <Button type="button" variant="outline" size="sm" onClick={props.onManageShare}>
                Manage
              </Button>
              <Button type="button" size="sm" onClick={props.onCopyShareLink}>
                Copy link
              </Button>
            </AlertAction>
          </Alert>
        </div>
      ) : null}

      {props.latestResumeContext ? (
        <div className="mx-auto max-w-3xl pt-3">
          <Alert variant="info">
            <RefreshCwIcon />
            <AlertTitle>
              {getResumeContextBannerTitle({
                source: props.latestResumeContext.source,
                importedFromShare: props.latestImportActivity !== null,
              })}
            </AlertTitle>
            <AlertDescription>
              <div className="line-clamp-4" title={props.latestResumeContext.summary}>
                {props.latestResumeContext.summary}
              </div>
              <div className="text-xs text-muted-foreground/75">
                Updated{" "}
                {formatTimestamp(props.latestResumeContext.compactedAt, props.timestampFormat)}
                {props.latestImportActivity?.shareId
                  ? ` • share ${props.latestImportActivity.shareId}`
                  : ""}
              </div>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      {props.latestAppliedSkills.length > 0 ? (
        <div className="mx-auto max-w-3xl pt-3">
          <Alert variant="info">
            <ZapIcon />
            <AlertTitle>Skills applied on the latest turn</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap gap-2">
                {props.latestAppliedSkills.map((skill) => (
                  <Badge key={skill.name} variant="secondary" className="max-w-full truncate">
                    {skill.name}
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      {props.redoDepth > 0 ? (
        <div className="mx-auto max-w-3xl pt-3">
          <Alert variant="warning">
            <RotateCwIcon />
            <AlertTitle>Redo available</AlertTitle>
            <AlertDescription>
              <div>
                {props.redoDepth} undone {props.redoDepth === 1 ? "turn" : "turns"} can still be
                restored.
              </div>
            </AlertDescription>
            <AlertAction>
              <Button
                type="button"
                size="sm"
                onClick={props.onRedoThread}
                disabled={!props.canRedoThread}
              >
                {props.isRedoingThread ? "Restoring..." : "Redo"}
              </Button>
            </AlertAction>
          </Alert>
        </div>
      ) : null}
    </>
  );
});

const ThreadModelRerouteBanner = memo(function ThreadModelRerouteBanner({
  notice,
}: {
  notice: LatestModelRerouteNotice | null;
}) {
  if (!notice) return null;

  const fromModelLabel = getModelDisplayName(notice.fromModel, "codex");
  const toModelLabel =
    notice.toModel === "openrouter/free"
      ? "OpenRouter Free Router"
      : getModelDisplayName(notice.toModel, "codex");
  const message =
    notice.toModel === "openrouter/free"
      ? `CUT3 retried this turn through ${toModelLabel} after ${fromModelLabel} could not be served. OpenRouter may answer with a different free model for this turn.`
      : `CUT3 retried this turn from ${fromModelLabel} to ${toModelLabel}.`;

  return (
    <div className="mx-auto max-w-3xl pt-3">
      <Alert variant="warning">
        <CircleAlertIcon />
        <AlertTitle>OpenRouter fell back to a different free model</AlertTitle>
        <AlertDescription className="space-y-1">
          <div className="line-clamp-3" title={message}>
            {message}
          </div>
          <div className="line-clamp-2 text-xs text-muted-foreground" title={notice.reason}>
            {notice.reason}
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
});

const ProviderHealthBanner = memo(function ProviderHealthBanner({
  status,
}: {
  status: ServerProviderStatus | null;
}) {
  if (!status || status.status === "ready") {
    return null;
  }

  const defaultMessage = getDefaultProviderStatusMessage(status);

  return (
    <div className="pt-3 mx-auto max-w-3xl">
      <Alert variant={status.status === "error" ? "error" : "warning"}>
        <CircleAlertIcon />
        <AlertTitle>{getProviderStatusTitle(status.provider)}</AlertTitle>
        <AlertDescription className="line-clamp-3" title={status.message ?? defaultMessage}>
          {status.message ?? defaultMessage}
        </AlertDescription>
      </Alert>
    </div>
  );
});

interface ComposerPendingApprovalPanelProps {
  approval: PendingApproval;
  matchedRule: ApprovalRule | null;
  pendingCount: number;
}

function describePendingApprovalKind(approval: PendingApproval): string {
  return approval.requestKind === "command"
    ? "Command approval requested"
    : approval.requestKind === "file-read"
      ? "File-read approval requested"
      : approval.requestKind === "file-change"
        ? "File-change approval requested"
        : approval.requestType
          ? `Approval requested (${approval.requestType})`
          : "Approval requested";
}

const ComposerPendingApprovalPanel = memo(function ComposerPendingApprovalPanel({
  approval,
  matchedRule,
  pendingCount,
}: ComposerPendingApprovalPanelProps) {
  const approvalSummary = describePendingApprovalKind(approval);

  return (
    <div className="px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="uppercase text-sm tracking-[0.2em]">PENDING APPROVAL</span>
        <span className="text-sm font-medium">{approvalSummary}</span>
        {pendingCount > 1 ? (
          <span className="text-xs text-muted-foreground">1/{pendingCount}</span>
        ) : null}
      </div>
      {matchedRule ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Matched rule: <span className="font-medium text-foreground">{matchedRule.label}</span>
          {matchedRule.action === "ask"
            ? " (still prompting because the rule action is Ask every time)."
            : " (auto-response in progress)."}
        </p>
      ) : null}
    </div>
  );
});

interface ComposerPendingApprovalActionsProps {
  requestId: ApprovalRequestId;
  isResponding: boolean;
  submittingLabel: string;
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<void>;
}

const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
  requestId,
  isResponding,
  submittingLabel,
  onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        type="button"
        disabled={isResponding}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void onRespondToApproval(requestId, "cancel");
        }}
      >
        {isResponding ? submittingLabel : "Cancel approval"}
      </Button>
      <Button
        size="sm"
        variant="destructive-outline"
        type="button"
        disabled={isResponding}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void onRespondToApproval(requestId, "decline");
        }}
      >
        {isResponding ? submittingLabel : "Decline"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        type="button"
        disabled={isResponding}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void onRespondToApproval(requestId, "acceptForSession");
        }}
      >
        {isResponding ? submittingLabel : "Always allow this session"}
      </Button>
      <Button
        size="sm"
        variant="default"
        type="button"
        disabled={isResponding}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void onRespondToApproval(requestId, "accept");
        }}
      >
        {isResponding ? submittingLabel : "Approve once"}
      </Button>
    </>
  );
});

interface PendingUserInputPanelProps {
  pendingUserInputs: PendingUserInput[];
  respondingRequestIds: ApprovalRequestId[];
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onSelectOption: (questionId: string, optionLabel: string) => void;
  onAdvance: () => void;
}

const ComposerPendingUserInputPanel = memo(function ComposerPendingUserInputPanel({
  pendingUserInputs,
  respondingRequestIds,
  answers,
  questionIndex,
  onSelectOption,
  onAdvance,
}: PendingUserInputPanelProps) {
  if (pendingUserInputs.length === 0) return null;
  const activePrompt = pendingUserInputs[0];
  if (!activePrompt) return null;

  return (
    <ComposerPendingUserInputCard
      key={activePrompt.requestId}
      prompt={activePrompt}
      isResponding={respondingRequestIds.includes(activePrompt.requestId)}
      answers={answers}
      questionIndex={questionIndex}
      onSelectOption={onSelectOption}
      onAdvance={onAdvance}
    />
  );
});

const ComposerPendingUserInputCard = memo(function ComposerPendingUserInputCard({
  prompt,
  isResponding,
  answers,
  questionIndex,
  onSelectOption,
  onAdvance,
}: {
  prompt: PendingUserInput;
  isResponding: boolean;
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onSelectOption: (questionId: string, optionLabel: string) => void;
  onAdvance: () => void;
}) {
  const progress = derivePendingUserInputProgress(prompt.questions, answers, questionIndex);
  const activeQuestion = progress.activeQuestion;
  const autoAdvanceTimerRef = useRef<number | null>(null);

  // Clear auto-advance timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
    };
  }, []);

  const selectOptionAndAutoAdvance = useCallback(
    (questionId: string, optionLabel: string) => {
      onSelectOption(questionId, optionLabel);
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        autoAdvanceTimerRef.current = null;
        onAdvance();
      }, 200);
    },
    [onSelectOption, onAdvance],
  );

  // Keyboard shortcut: number keys 1-9 select corresponding option and auto-advance.
  // Works even when the Lexical composer (contenteditable) has focus — the composer
  // doubles as a custom-answer field during user input, and when it's empty the digit
  // keys should pick options instead of typing into the editor.
  useEffect(() => {
    if (!activeQuestion || isResponding) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      // If the user has started typing a custom answer in the contenteditable
      // composer, let digit keys pass through so they can type numbers.
      if (target instanceof HTMLElement && target.isContentEditable) {
        const hasCustomText = progress.customAnswer.length > 0;
        if (hasCustomText) return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
      const optionIndex = digit - 1;
      if (optionIndex >= activeQuestion.options.length) return;
      const option = activeQuestion.options[optionIndex];
      if (!option) return;
      event.preventDefault();
      selectOptionAndAutoAdvance(activeQuestion.id, option.label);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeQuestion, isResponding, selectOptionAndAutoAdvance, progress.customAnswer.length]);

  if (!activeQuestion) {
    return null;
  }

  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {prompt.questions.length > 1 ? (
            <span className="flex h-5 items-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground/60">
              {questionIndex + 1}/{prompt.questions.length}
            </span>
          ) : null}
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
            {activeQuestion.header}
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-sm text-foreground/90">{activeQuestion.question}</p>
      <div className="mt-3 space-y-1">
        {activeQuestion.options.map((option, index) => {
          const isSelected = progress.selectedOptionLabel === option.label;
          const shortcutKey = index < 9 ? index + 1 : null;
          return (
            <button
              key={`${activeQuestion.id}:${option.label}`}
              type="button"
              disabled={isResponding}
              onClick={() => selectOptionAndAutoAdvance(activeQuestion.id, option.label)}
              className={cn(
                "app-interactive-motion group flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left",
                isSelected
                  ? "border-blue-500/40 bg-blue-500/8 text-foreground"
                  : "border-transparent bg-muted/20 text-foreground/80 hover:bg-muted/40 hover:border-border/40",
                isResponding && "opacity-50 cursor-not-allowed",
              )}
            >
              {shortcutKey !== null ? (
                <kbd
                  className={cn(
                    "app-fade-motion flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-medium tabular-nums",
                    isSelected
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-muted/40 text-muted-foreground/50 group-hover:bg-muted/60 group-hover:text-muted-foreground/70",
                  )}
                >
                  {shortcutKey}
                </kbd>
              ) : null}
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">{option.label}</span>
                {option.description && option.description !== option.label ? (
                  <span className="ml-2 text-xs text-muted-foreground/50">
                    {option.description}
                  </span>
                ) : null}
              </div>
              {isSelected ? <CheckIcon className="size-3.5 shrink-0 text-blue-400" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
});

const ComposerPlanFollowUpBanner = memo(function ComposerPlanFollowUpBanner({
  planTitle,
}: {
  planTitle: string | null;
}) {
  return (
    <div className="px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="uppercase text-sm tracking-[0.2em]">Plan ready</span>
        {planTitle ? (
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{planTitle}</span>
        ) : null}
      </div>
      {/* <div className="mt-2 text-xs text-muted-foreground">
        Review the plan
      </div> */}
    </div>
  );
});

function getCustomModelOptionsByProvider(
  settings: {
    customCodexModels: readonly string[];
    customCopilotModels: readonly string[];
    customOpencodeModels: readonly string[];
    customKimiModels: readonly string[];
    customPiModels: readonly string[];
  },
  configuredModelsByProvider: Record<ProviderKind, ReadonlyArray<PickerModelOption>>,
  providerStatusModelsByProvider: Record<ProviderKind, ReadonlyArray<PickerModelOption>>,
  options?: {
    hidePiDefaultFallback?: boolean;
  },
): Record<ProviderKind, ReadonlyArray<PickerModelOption>> {
  const discoveredPiModels = mergeModelOptions(
    providerStatusModelsByProvider.pi,
    configuredModelsByProvider.pi,
  );
  const piOptions = mergeModelOptions(
    discoveredPiModels,
    getAppModelOptions("pi", settings.customPiModels),
  );

  return {
    codex: mergeModelOptions(
      providerStatusModelsByProvider.codex,
      getAppModelOptions("codex", settings.customCodexModels),
    ),
    copilot: mergeModelOptions(
      mergeModelOptions(providerStatusModelsByProvider.copilot, configuredModelsByProvider.copilot),
      getAppModelOptions("copilot", settings.customCopilotModels),
    ),
    opencode: mergeModelOptions(
      mergeModelOptions(
        providerStatusModelsByProvider.opencode,
        configuredModelsByProvider.opencode,
      ),
      getAppModelOptions("opencode", settings.customOpencodeModels),
    ),
    kimi: mergeModelOptions(
      mergeModelOptions(providerStatusModelsByProvider.kimi, configuredModelsByProvider.kimi),
      getAppModelOptions("kimi", settings.customKimiModels),
    ),
    pi:
      options?.hidePiDefaultFallback === true
        ? piOptions.filter((option) => option.slug !== DEFAULT_MODEL_BY_PROVIDER.pi)
        : piOptions,
  };
}

function getChatSurfaceCopy(language: AppLanguage) {
  if (language === "fa") {
    return {
      chatLabel: "گفتگو",
      fullAccess: "دسترسی کامل",
      supervised: "نظارتی",
      fullAccessTooltip: "دسترسی کامل فعال است؛ برای نیاز به تایید کلیک کنید",
      approvalRequiredTooltip: "تایید لازم است؛ برای دسترسی کامل کلیک کنید",
      preparingWorktree: "در حال آماده سازی worktree...",
      previous: "قبلی",
      submitting: "در حال ثبت...",
      submitAnswers: "ثبت پاسخ ها",
      nextQuestion: "سوال بعدی",
      stopGeneration: "توقف تولید",
      stoppingGeneration: "در حال توقف تولید",
      queueMode: "صف",
      steerMode: "هدایت",
      queueFollowUp: "افزودن به صف",
      sendNow: "ارسال فوری",
      queuedFollowUps: "پیگیری های در صف",
      clearQueuedFollowUps: "پاک کردن صف",
      queuedFollowUpsHint: "آیتم های در صف به ترتیب بعد از تمام شدن نوبت فعلی ارسال می شوند.",
      queuedFollowUpsFailedHint: "برای ادامه، موارد ناموفق را دوباره امتحان کنید یا حذف کنید.",
      attachImages: "پیوست کردن تصاویر",
      attachImagesTooltip:
        "تصاویر را انتخاب، رها، یا پیست کنید؛ حداکثر ۸ تصویر و هر کدام تا ۱۰ مگابایت",
      followUpQueued: "پیگیری در صف قرار گرفت",
      steeringCurrentRun: "در حال هدایت نوبت فعلی",
      steeringCurrentRunHint: "CUT3 نوبت فعلی را متوقف می کند و این پیگیری را بعدی می فرستد.",
      queueCurrentRunHint: "CUT3 این پیگیری را بعد از تمام شدن نوبت فعلی می فرستد.",
      queuedTurnFailed: "ارسال مورد در صف انجام نشد",
      retryQueuedFollowUp: "تلاش دوباره",
      removeQueuedFollowUp: "حذف",
      moveQueuedFollowUpUp: "بالا",
      moveQueuedFollowUpDown: "پایین",
      nextQueuedFollowUp: "بعدی",
      workedFor: (elapsed: string) => `مدت کار ${elapsed}`,
      workingFor: (elapsed: string) => `در حال کار (${elapsed})`,
      working: "در حال کار...",
      sendMessageToStart: "برای شروع گفتگو یک پیام بفرستید.",
      attachImagesAfterPlanQuestions: "تصاویر را بعد از پاسخ دادن به سوال های طرح پیوست کنید.",
      moreComposerControls: "کنترل های بیشتر برای نوشتن پیام",
      reasoning: "استدلال",
      fastMode: "حالت سریع",
      mode: "حالت",
      access: "دسترسی",
      comingSoon: "به زودی",
      authenticatedModels: (count: number) => `${count} مدل احراز شده${count === 1 ? "" : ""}`,
      defaultChoice: "پیش فرض",
      defaultSuffix: " (پیش فرض)",
      minimal: "حداقلی",
      low: "کم",
      medium: "متوسط",
      high: "زیاد",
      extraHigh: "خیلی زیاد",
      off: "خاموش",
      on: "روشن",
    };
  }

  return {
    chatLabel: "Chat",
    fullAccess: "Full access",
    supervised: "Supervised",
    fullAccessTooltip: "Full access enabled; click to require approval",
    approvalRequiredTooltip: "Approval required; click for full access",
    preparingWorktree: "Preparing worktree...",
    previous: "Previous",
    submitting: "Submitting...",
    submitAnswers: "Submit answers",
    nextQuestion: "Next question",
    stopGeneration: "Stop generation",
    stoppingGeneration: "Stopping generation",
    queueMode: "Queue",
    steerMode: "Steer",
    queueFollowUp: "Queue follow-up",
    sendNow: "Send now",
    queuedFollowUps: "Queued follow-ups",
    clearQueuedFollowUps: "Clear queue",
    queuedFollowUpsHint: "Queued items send in order after the current turn settles.",
    queuedFollowUpsFailedHint: "Retry or remove failed items before sending more follow-ups.",
    attachImages: "Attach images",
    attachImagesTooltip: "Attach images · drag, paste, or pick up to 8 images (10 MB each)",
    followUpQueued: "Follow-up queued",
    steeringCurrentRun: "Steering current run",
    steeringCurrentRunHint: "CUT3 will stop the current turn and send this follow-up next.",
    queueCurrentRunHint: "CUT3 will send this follow-up after the current turn settles.",
    queuedTurnFailed: "Queued follow-up failed",
    retryQueuedFollowUp: "Retry",
    removeQueuedFollowUp: "Remove",
    moveQueuedFollowUpUp: "Up",
    moveQueuedFollowUpDown: "Down",
    nextQueuedFollowUp: "Next",
    workedFor: (elapsed: string) => `Worked for ${elapsed}`,
    workingFor: (elapsed: string) => `Working (${elapsed})`,
    working: "Working...",
    sendMessageToStart: "Send a message to start.",
    attachImagesAfterPlanQuestions: "Attach images after answering plan questions.",
    moreComposerControls: "More composer controls",
    reasoning: "Reasoning",
    fastMode: "Fast mode",
    mode: "Mode",
    access: "Access",
    comingSoon: "Coming soon",
    authenticatedModels: (count: number) => `${count} authenticated model${count === 1 ? "" : "s"}`,
    defaultChoice: "Default",
    defaultSuffix: " (default)",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    extraHigh: "Extra High",
    off: "off",
    on: "on",
  };
}

function formatContextUsagePercent(percentUsed: number): string {
  if (!Number.isFinite(percentUsed) || percentUsed <= 0) {
    return "0%";
  }
  if (percentUsed < 1) {
    return "<1%";
  }
  return `${Math.round(percentUsed)}%`;
}

function getContextIndicatorLabel(input: {
  percentUsed: number | null;
  usedLabel: string | null;
  totalLabel: string | null;
}): string {
  if (input.percentUsed !== null) {
    return formatContextUsagePercent(input.percentUsed);
  }

  return input.usedLabel ?? input.totalLabel ?? "?";
}

const ComposerContextWindowStatus = memo(function ComposerContextWindowStatus(props: {
  language: AppLanguage;
  provider: ProviderKind;
  model: string | null | undefined;
  tokenUsage?: unknown;
  opencodeContextLengthsBySlug?: ReadonlyMap<string, number | null>;
  compact?: boolean;
  onOpenUsageDashboard: () => void;
}) {
  if (shouldHideContextWindowForModel(props.provider, props.model)) {
    return null;
  }

  const state = describeContextWindowState({
    provider: props.provider,
    model: props.model,
    tokenUsage: props.tokenUsage,
    ...getDocumentedContextWindowOverride(props),
  });

  const hasUsedAndTotal =
    state.totalTokens !== null &&
    state.totalTokens > 0 &&
    state.usedTokens !== null &&
    state.totalLabel !== null &&
    state.usedLabel !== null &&
    state.remainingLabel !== null;
  const totalTokens = hasUsedAndTotal ? state.totalTokens : null;
  const usedTokens = hasUsedAndTotal ? state.usedTokens : null;
  const percentUsed =
    totalTokens !== null && usedTokens !== null
      ? Math.max(0, Math.min(100, (usedTokens / totalTokens) * 100))
      : null;
  const primaryLabel = hasUsedAndTotal
    ? `${state.usedLabel} / ${state.totalLabel} tokens`
    : state.totalLabel
      ? `${state.totalLabel} total`
      : state.usedLabel
        ? `${state.usedLabel} used`
        : null;
  const statusLabel = hasUsedAndTotal
    ? state.usageScope === "thread"
      ? "Latest thread snapshot"
      : "Last completed turn"
    : state.totalLabel
      ? "Usage appears once the provider reports it."
      : (state.note ?? "Context window unavailable.");
  const secondaryLabel = hasUsedAndTotal ? `${state.remainingLabel} left` : statusLabel;
  const indicatorLabel = getContextIndicatorLabel({
    percentUsed,
    usedLabel: state.usedLabel,
    totalLabel: state.totalLabel,
  });
  const ringCircumference = 2 * Math.PI * 15;
  const ringOffset =
    percentUsed !== null
      ? ringCircumference - (ringCircumference * Math.max(0, Math.min(100, percentUsed))) / 100
      : ringCircumference;

  if (!primaryLabel) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="Open usage dashboard"
            aria-haspopup="dialog"
            data-chat-composer-control="context-status"
            className={cn(
              "app-interactive-motion group relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/25 shadow-none transition-[background-color,border-color,transform,box-shadow] hover:border-border/80 hover:bg-muted/30 motion-safe:hover:-translate-y-px",
              props.compact ? "size-9" : "size-11",
            )}
            onClick={props.onOpenUsageDashboard}
          >
            <svg
              viewBox="0 0 36 36"
              aria-hidden="true"
              className="absolute inset-0 size-full -rotate-90"
            >
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-muted-foreground/15"
              />
              {percentUsed !== null ? (
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  className="text-foreground/55 transition-[stroke-dashoffset,stroke-opacity] duration-300 ease-out"
                />
              ) : null}
            </svg>
            <span
              className={cn(
                "relative z-10 px-1 text-center font-medium leading-none text-foreground/95 transition-[transform,opacity] duration-200 ease-out motion-safe:group-hover:scale-[1.03]",
                props.compact ? "text-[9px]" : "text-[10px]",
              )}
            >
              {indicatorLabel}
            </span>
          </button>
        }
      />
      <TooltipPopup side="top" className="max-w-72 whitespace-normal leading-relaxed">
        <div className="space-y-1">
          <div className="font-medium">Context window</div>
          <div>{primaryLabel}</div>
          {hasUsedAndTotal ? <div>{secondaryLabel}</div> : null}
          <div className="text-muted-foreground/80 text-[11px]">{statusLabel}</div>
          {state.note ? (
            <div className="text-muted-foreground/80 text-[11px]">{state.note}</div>
          ) : null}
          <div className="pt-1 text-muted-foreground/80 text-[11px]">
            {props.language === "fa"
              ? "برای جزئیات کامل توکن و هزینه کلیک کنید."
              : "Click for full token and spend details."}
          </div>
        </div>
      </TooltipPopup>
    </Tooltip>
  );
});

type ProviderStatusBadge = {
  label: string;
  variant: "success" | "warning" | "error" | "info" | "outline";
};

function getProviderStatusBadge(status: ServerProviderStatus | null): ProviderStatusBadge {
  if (!status) {
    return { label: "Unknown", variant: "outline" };
  }

  if (status.status === "ready" && status.authStatus !== "unauthenticated") {
    return { label: "Ready", variant: "success" };
  }

  if (status.authStatus === "unauthenticated") {
    return { label: "Needs auth", variant: "warning" };
  }

  if (!status.available || status.status === "error") {
    return { label: "Unavailable", variant: "error" };
  }

  if (status.status === "warning") {
    return { label: "Check setup", variant: "warning" };
  }

  return { label: "Detected", variant: "info" };
}

export function ProviderSetupDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: AppLanguage;
  providerStatuses: ReadonlyArray<ServerProviderStatus>;
  openCodeState: ServerOpenCodeState | null;
  hasOpenRouterApiKey: boolean;
  hasKimiApiKey: boolean;
  codexBinaryPath: string;
  copilotBinaryPath: string;
  opencodeBinaryPath: string;
  kimiBinaryPath: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenOpenRouterKeyDialog: () => void;
  onOpenKimiKeyDialog: () => void;
  onOpenManageModels: () => void;
  onOpenSettings: () => void;
}) {
  const chatCopy = getChatSurfaceCopy(props.language);
  const copy =
    props.language === "fa"
      ? {
          title: "آماده سازی ارائه دهنده",
          description:
            "وضعیت runtime های محلی را بررسی کنید، کلیدها را اضافه کنید، و قدم بعدی هر ارائه دهنده را بدون خروج از چت ببینید.",
          snapshotTitle: "نمای آماده سازی ارائه دهنده",
          snapshotDescription:
            "CUT3 وضعیت runtime های محلی را می خواند. احراز هویت OpenCode، Codex، Copilot، Kimi، و Pi همچنان در ابزارهای خود آنها مدیریت می شود.",
          ready: "آماده",
          attention: "نیاز به توجه",
          unavailable: "ناموجود",
          refresh: "نوسازی وضعیت",
          addKey: "افزودن کلید",
          updateKey: "به روز رسانی کلید",
          copied: "کپی شد",
          copyLogin: "کپی ورود",
          copyLaunch: "کپی اجرای CLI",
          manageModels: "مدیریت مدل ها",
          settings: "تنظیمات",
          done: "انجام شد",
          notAvailableYet: "هنوز در دسترس نیست",
          credentials: (count: number) => `${count} اعتبار`,
          models: (count: number) => `${count} مدل`,
          mcpServers: (count: number) => `${count} سرور MCP`,
        }
      : {
          title: "Provider readiness",
          description:
            "Check local runtime health, add keys, and see the next step for each provider without leaving chat.",
          snapshotTitle: "Provider readiness snapshot",
          snapshotDescription:
            "CUT3 inspects your local runtimes here. Authentication for OpenCode, Codex, Copilot, Kimi, and Pi still lives in their own CLIs and config files.",
          ready: "Ready",
          attention: "Needs attention",
          unavailable: "Unavailable",
          refresh: "Refresh status",
          addKey: "Add key",
          updateKey: "Update key",
          copied: "Copied",
          copyLogin: "Copy login",
          copyLaunch: "Copy CLI launch",
          manageModels: "Manage models",
          settings: "Settings",
          done: "Done",
          notAvailableYet: "Not available yet",
          credentials: (count: number) => `${count} credential${count === 1 ? "" : "s"}`,
          models: (count: number) => `${count} model${count === 1 ? "" : "s"}`,
          mcpServers: (count: number) => `${count} MCP server${count === 1 ? "" : "s"}`,
        };
  const openCodeCredentialCount = props.openCodeState?.credentials.length ?? 0;
  const openCodeModelCount = props.openCodeState?.models.length ?? 0;
  const openCodeMcpServerCount = props.openCodeState?.mcpServers.length ?? 0;
  const [lastCopiedCommandId, setLastCopiedCommandId] = useState<string | null>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard<{ id: string }>({
    onCopy: ({ id }) => setLastCopiedCommandId(id),
  });

  const formatCommandBinary = useCallback((binaryPath: string, fallback: string) => {
    const trimmed = binaryPath.trim();
    if (!trimmed) {
      return fallback;
    }
    return `'${trimmed.replaceAll("'", "'\\''")}'`;
  }, []);

  const codexCommand = formatCommandBinary(props.codexBinaryPath, "codex");
  const copilotCommand = formatCommandBinary(props.copilotBinaryPath, "copilot");
  const opencodeCommand = formatCommandBinary(props.opencodeBinaryPath, "opencode");
  const kimiCommand = formatCommandBinary(props.kimiBinaryPath, "kimi");

  const renderCopyCommandButton = useCallback(
    (input: { id: string; label: string; command: string }) => {
      const copied = isCopied && lastCopiedCommandId === input.id;
      return (
        <Button
          key={input.id}
          size="xs"
          variant="outline"
          onClick={() => copyToClipboard(input.command, { id: input.id })}
        >
          {copied ? copy.copied : input.label}
        </Button>
      );
    },
    [copy.copied, copyToClipboard, isCopied, lastCopiedCommandId],
  );

  const readinessSummary = useMemo(() => {
    return [...AVAILABLE_PROVIDER_OPTIONS].reduce(
      (counts, option) => {
        if (option.value === "openrouter") {
          if (props.hasOpenRouterApiKey) {
            counts.ready += 1;
          } else {
            counts.attention += 1;
          }
          return counts;
        }

        const backingProvider = getProviderPickerBackingProvider(option.value);
        if (!backingProvider) {
          return counts;
        }
        const status = findProviderStatus(props.providerStatuses, backingProvider);
        if (!status || !status.available || status.status === "error") {
          counts.unavailable += 1;
          return counts;
        }
        if (status.status === "ready" && status.authStatus !== "unauthenticated") {
          counts.ready += 1;
          return counts;
        }
        counts.attention += 1;
        return counts;
      },
      { ready: 0, attention: 0, unavailable: 0 },
    );
  }, [props.hasOpenRouterApiKey, props.providerStatuses]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/25 px-4 py-3">
            <div className="space-y-2">
              <div>
                <p className="font-medium text-sm text-foreground">{copy.snapshotTitle}</p>
                <p className="text-xs text-muted-foreground">{copy.snapshotDescription}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success" size="sm">
                  {copy.ready} · {readinessSummary.ready}
                </Badge>
                <Badge variant="warning" size="sm">
                  {copy.attention} · {readinessSummary.attention}
                </Badge>
                <Badge variant="outline" size="sm">
                  {copy.unavailable} · {readinessSummary.unavailable}
                </Badge>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={props.onRefresh}
              disabled={props.isRefreshing}
            >
              <RefreshCwIcon className={cn("size-4", props.isRefreshing && "animate-spin")} />
              {copy.refresh}
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {AVAILABLE_PROVIDER_OPTIONS.map((option) => {
              const OptionIcon = PROVIDER_ICON_BY_PROVIDER[option.value];
              const backingProvider = getProviderPickerBackingProvider(option.value);
              if (!backingProvider) {
                return null;
              }

              const providerStatus = findProviderStatus(props.providerStatuses, backingProvider);
              let badge = getProviderStatusBadge(providerStatus);
              let description = getProviderPickerSectionDescription(option.value);
              let message = providerStatus?.message?.trim() || null;
              let footer: ReactNode = null;
              const actions: ReactNode[] = [];

              if (option.value === "openrouter") {
                badge = props.hasOpenRouterApiKey
                  ? { label: "Key saved", variant: "success" }
                  : { label: "Needs key", variant: "warning" };
                description = props.hasOpenRouterApiKey
                  ? "Shared OpenRouter key is ready for OpenRouter-routed sessions."
                  : "Add the shared OpenRouter API key to unlock OpenRouter-routed models.";
                message =
                  "Used for openrouter/free and any saved OpenRouter :free slugs. CUT3 also forwards the same key to new OpenCode sessions when their config expects OPENROUTER_API_KEY.";
                actions.push(
                  <Button
                    key="openrouter-key"
                    size="xs"
                    variant="outline"
                    onClick={props.onOpenOpenRouterKeyDialog}
                  >
                    <PlusIcon className="size-3.5" />
                    {props.hasOpenRouterApiKey ? copy.updateKey : copy.addKey}
                  </Button>,
                );
              }

              if (option.value === "codex") {
                description =
                  providerStatus?.authStatus === "authenticated"
                    ? "Native Codex models are ready through your local Codex runtime."
                    : "Authenticate or repair the local Codex runtime, then refresh CUT3.";
                if (providerStatus?.authStatus !== "authenticated") {
                  actions.push(
                    renderCopyCommandButton({
                      id: "codex-login",
                      label: copy.copyLogin,
                      command: `${codexCommand} login`,
                    }),
                  );
                }
              }

              if (option.value === "copilot") {
                description =
                  providerStatus?.authStatus === "authenticated"
                    ? "GitHub Copilot is available from the local runtime CUT3 is connected to."
                    : "Sign into the local Copilot CLI/runtime, then refresh CUT3.";
                if (providerStatus?.authStatus !== "authenticated") {
                  actions.push(
                    renderCopyCommandButton({
                      id: "copilot-login",
                      label: copy.copyLogin,
                      command: `${copilotCommand} login`,
                    }),
                  );
                }
              }

              if (option.value === "kimi") {
                badge = props.hasKimiApiKey
                  ? { label: "Key saved", variant: "success" }
                  : providerStatus?.status === "ready"
                    ? { label: "Ready", variant: "success" }
                    : { label: "Needs auth", variant: "warning" };
                description = props.hasKimiApiKey
                  ? "A Kimi API key is configured for new Kimi Code sessions."
                  : "Use kimi login / /login, or add a Kimi API key here.";
                message = props.hasKimiApiKey
                  ? "CUT3 will inject the saved Kimi API key into new Kimi Code sessions."
                  : providerStatus?.message?.trim() ||
                    "If you do not want to store a key in CUT3, authenticate in the CLI with kimi login or the in-shell /login flow.";
                actions.push(
                  <Button
                    key="kimi-key"
                    size="xs"
                    variant="outline"
                    onClick={props.onOpenKimiKeyDialog}
                  >
                    <PlusIcon className="size-3.5" />
                    {props.hasKimiApiKey ? copy.updateKey : copy.addKey}
                  </Button>,
                );
                if (!props.hasKimiApiKey) {
                  actions.push(
                    renderCopyCommandButton({
                      id: "kimi-login",
                      label: copy.copyLogin,
                      command: `${kimiCommand} login`,
                    }),
                  );
                }
              }

              if (option.value === "opencode") {
                badge =
                  props.openCodeState?.status === "available"
                    ? { label: "Ready", variant: "success" }
                    : openCodeCredentialCount > 0
                      ? { label: "Check setup", variant: "warning" }
                      : { label: "Needs auth", variant: "warning" };
                description =
                  props.openCodeState?.status === "available"
                    ? `${copy.credentials(openCodeCredentialCount)} · ${copy.models(openCodeModelCount)}`
                    : "Manage OpenCode credentials in OpenCode itself, then refresh CUT3.";
                message = props.openCodeState?.message?.trim() || null;
                footer = (
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" size="sm">
                      {copy.credentials(openCodeCredentialCount)}
                    </Badge>
                    <Badge variant="outline" size="sm">
                      {copy.models(openCodeModelCount)}
                    </Badge>
                    {props.openCodeState?.mcpSupported ? (
                      <Badge variant="outline" size="sm">
                        {copy.mcpServers(openCodeMcpServerCount)}
                      </Badge>
                    ) : null}
                  </div>
                );
                actions.push(
                  renderCopyCommandButton({
                    id: "opencode-auth-login",
                    label: copy.copyLogin,
                    command: `${opencodeCommand} auth login`,
                  }),
                );
              }

              if (option.value === "pi") {
                badge =
                  providerStatus?.available === false
                    ? { label: "Unavailable", variant: "error" }
                    : providerStatus?.authStatus === "authenticated"
                      ? providerStatus.status === "warning"
                        ? { label: "Check setup", variant: "warning" }
                        : { label: "Ready", variant: "success" }
                      : { label: "Needs auth", variant: "warning" };
                description =
                  providerStatus?.authStatus === "authenticated"
                    ? providerStatus.status === "warning"
                      ? "Pi is authenticated, but the local Pi config still needs attention."
                      : "Pi is ready from the local ~/.pi/agent auth/models state."
                    : "Run pi or bunx pi, complete /login, then refresh CUT3.";
                message = providerStatus?.message?.trim() || null;
                footer = (
                  <p className="text-xs text-muted-foreground">
                    CUT3 embeds Pi through its Node SDK, but keeps Pi packages, AGENTS, prompts,
                    extensions, skills, and themes disabled so CUT3 remains the only source of
                    workspace instructions.
                  </p>
                );
                actions.push(
                  renderCopyCommandButton({
                    id: "pi-launch",
                    label: copy.copyLaunch,
                    command: "bunx pi",
                  }),
                );
              }

              return (
                <div
                  key={option.value}
                  className="flex min-h-48 flex-col rounded-2xl border border-border/60 bg-background/95 p-4 shadow-xs/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <OptionIcon className="size-4 shrink-0 text-muted-foreground/80" />
                        <span className="truncate font-medium text-sm">{option.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                    <Badge variant={badge.variant} size="sm">
                      {badge.label}
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-1 flex-col justify-between gap-3">
                    <div className="space-y-2">
                      {message ? (
                        <p
                          className={cn(
                            "text-xs leading-relaxed",
                            badge.variant === "error"
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {message}
                        </p>
                      ) : null}
                      {footer}
                    </div>
                    {actions.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-foreground">{copy.notAvailableYet}</span>
              {[...UNAVAILABLE_PROVIDER_OPTIONS, ...COMING_SOON_PROVIDER_OPTIONS].map((option) => {
                const OptionIcon =
                  "icon" in option ? option.icon : PROVIDER_ICON_BY_PROVIDER[option.value];
                return (
                  <Badge
                    key={"id" in option ? option.id : option.value}
                    variant="outline"
                    size="sm"
                  >
                    <OptionIcon className="size-3.5" />
                    {option.label}
                    <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
                      {chatCopy.comingSoon}
                    </span>
                  </Badge>
                );
              })}
            </div>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={props.onOpenSettings}>
            {copy.settings}
          </Button>
          <Button size="sm" variant="outline" onClick={props.onOpenManageModels}>
            <SlidersHorizontalIcon className="size-4" />
            {copy.manageModels}
          </Button>
          <Button size="sm" onClick={() => props.onOpenChange(false)}>
            {copy.done}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function ManageModelsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: AppLanguage;
  selectedProviderPickerKind: AvailableProviderPickerKind;
  allModelOptionsByProvider: Record<ProviderKind, ReadonlyArray<PickerModelOption>>;
  openRouterModelOptions: ReadonlyArray<PickerModelOption>;
  opencodeModelOptions: ReadonlyArray<PickerModelOption>;
  hiddenModelsByProvider: ProviderHiddenModelSettings;
  favoriteModelsByProvider: ProviderFavoriteModelSettings;
  recentModelsByProvider: ProviderRecentModelSettings;
  openRouterContextLengthsBySlug: ReadonlyMap<string, number | null>;
  opencodeContextLengthsBySlug: ReadonlyMap<string, number | null>;
  serviceTierSetting: AppServiceTier;
  onFavoriteModelChange: (provider: ProviderKind, model: string, favorite: boolean) => void;
  onModelVisibilityChange: (provider: ProviderKind, model: string, visible: boolean) => void;
  onShowAll: () => void;
  onOpenProviderSetup: () => void;
}) {
  const [query, setQuery] = useState("");
  const copy =
    props.language === "fa"
      ? {
          title: "مدیریت مدل ها",
          description:
            "مدل ها را برای نمایش یا پنهان سازی در picker و پیشنهادهای /model مدیریت کنید و موارد محبوب را برای دسترسی سریع سنجاق کنید.",
          searchPlaceholder: "جستجوی مدل ها یا ارائه دهندگان",
          allVisible: "همه نمایش داده می شوند",
          hiddenCount: (count: number) => `${count} مورد مخفی`,
          showAllHidden: "نمایش همه مدل های مخفی",
          noMatchesTitle: "هیچ مدلی با این جستجو مطابقت ندارد.",
          noMatchesDescription: "نام، ارائه دهنده، یا slug دیگری را امتحان کنید.",
          clearSearch: "پاک کردن جستجو",
          current: "فعلی",
          shown: "نمایش داده شده",
          hidden: "مخفی",
          favorite: "محبوب",
          pin: "سنجاق کردن",
          unpin: "برداشتن سنجاق",
          recent: "اخیر",
          providerSetup: "آماده سازی ارائه دهنده",
          done: "انجام شد",
        }
      : {
          title: "Manage models",
          description:
            "Control which models appear in the picker and /model suggestions, and pin favorites for faster access.",
          searchPlaceholder: "Search models or providers",
          allVisible: "All visible",
          hiddenCount: (count: number) => `${count} hidden`,
          showAllHidden: "Show all hidden models",
          noMatchesTitle: "No models match this search.",
          noMatchesDescription: "Try a different provider, model slug, or partial name.",
          clearSearch: "Clear search",
          current: "Current",
          shown: "Shown",
          hidden: "Hidden",
          favorite: "Favorite",
          pin: "Pin",
          unpin: "Unpin",
          recent: "Recent",
          providerSetup: "Provider readiness",
          done: "Done",
        };
  const totalHiddenCount =
    props.hiddenModelsByProvider.hiddenCodexModels.length +
    props.hiddenModelsByProvider.hiddenCopilotModels.length +
    props.hiddenModelsByProvider.hiddenOpencodeModels.length +
    props.hiddenModelsByProvider.hiddenKimiModels.length +
    props.hiddenModelsByProvider.hiddenPiModels.length;

  useEffect(() => {
    if (!props.open) {
      setQuery("");
    }
  }, [props.open]);

  const orderedProviders = useMemo(() => {
    const activeProvider = AVAILABLE_PROVIDER_OPTIONS.find(
      (option) => option.value === props.selectedProviderPickerKind,
    );
    if (!activeProvider) {
      return AVAILABLE_PROVIDER_OPTIONS;
    }
    return [
      activeProvider,
      ...AVAILABLE_PROVIDER_OPTIONS.filter((option) => option.value !== activeProvider.value),
    ];
  }, [props.selectedProviderPickerKind]);

  const normalizedQuery = query.trim().toLowerCase();
  const sections = useMemo(
    () =>
      orderedProviders
        .map((option) => {
          const backingProvider = getProviderPickerBackingProvider(option.value);
          if (!backingProvider) {
            return null;
          }

          const hiddenModels = new Set(
            getHiddenModelsForProvider(backingProvider, props.hiddenModelsByProvider),
          );
          const favoriteModels = getFavoriteModelsForProvider(
            backingProvider,
            props.favoriteModelsByProvider,
          );
          const recentModels = getRecentModelsForProvider(
            backingProvider,
            props.recentModelsByProvider,
          );
          const allOptions = getModelOptionsForProviderPicker(
            option.value,
            props.allModelOptionsByProvider,
            option.value === "openrouter"
              ? props.openRouterModelOptions
              : props.openRouterModelOptions,
            props.opencodeModelOptions,
          );
          const filteredOptions = prioritizeModelOptions(
            allOptions.filter((modelOption) => {
              if (!normalizedQuery) {
                return true;
              }
              const displayParts = getModelPickerOptionDisplayParts(modelOption);
              const haystack = [
                option.label,
                modelOption.slug,
                modelOption.name,
                displayParts.providerLabel,
                displayParts.modelLabel,
              ]
                .join(" ")
                .toLowerCase();
              return haystack.includes(normalizedQuery);
            }),
            favoriteModels,
            recentModels,
          );

          if (filteredOptions.length === 0) {
            return null;
          }

          return {
            option,
            backingProvider,
            favoriteModels,
            recentModels,
            filteredOptions,
            hiddenCount: filteredOptions.filter((modelOption) => hiddenModels.has(modelOption.slug))
              .length,
          };
        })
        .filter((section): section is NonNullable<typeof section> => section !== null),
    [
      normalizedQuery,
      orderedProviders,
      props.allModelOptionsByProvider,
      props.hiddenModelsByProvider,
      props.favoriteModelsByProvider,
      props.recentModelsByProvider,
      props.openRouterModelOptions,
      props.opencodeModelOptions,
    ],
  );

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[16rem] flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={totalHiddenCount > 0 ? "warning" : "outline"} size="sm">
                {totalHiddenCount > 0 ? copy.hiddenCount(totalHiddenCount) : copy.allVisible}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={props.onShowAll}
                disabled={totalHiddenCount === 0}
              >
                {copy.showAllHidden}
              </Button>
            </div>
          </div>

          {sections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 px-6 py-12 text-center">
              <p className="font-medium text-sm text-foreground">{copy.noMatchesTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">{copy.noMatchesDescription}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {normalizedQuery ? (
                  <Button size="sm" variant="outline" onClick={() => setQuery("")}>
                    {copy.clearSearch}
                  </Button>
                ) : null}
                {totalHiddenCount > 0 ? (
                  <Button size="sm" variant="outline" onClick={props.onShowAll}>
                    {copy.showAllHidden}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {sections.map((section) => {
                const OptionIcon = PROVIDER_ICON_BY_PROVIDER[section.option.value];
                const isActiveSection = section.option.value === props.selectedProviderPickerKind;

                return (
                  <section
                    key={section.option.value}
                    className="overflow-hidden rounded-2xl border border-border/60 bg-background/95"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <OptionIcon className="size-4 shrink-0 text-muted-foreground/80" />
                          <span className="font-medium text-sm text-foreground">
                            {section.option.label}
                          </span>
                          {isActiveSection ? (
                            <Badge variant="secondary" size="sm">
                              {copy.current}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {getProviderPickerSectionDescription(section.option.value)}
                        </p>
                      </div>
                      <Badge variant={section.hiddenCount > 0 ? "warning" : "outline"} size="sm">
                        {section.hiddenCount > 0
                          ? `${section.filteredOptions.length - section.hiddenCount} ${copy.shown.toLowerCase()} · ${section.hiddenCount} ${copy.hidden.toLowerCase()}`
                          : `${section.filteredOptions.length} ${copy.shown.toLowerCase()}`}
                      </Badge>
                    </div>
                    <div className="divide-y divide-border/50">
                      {section.filteredOptions.map((modelOption) => {
                        const displayParts = getModelPickerOptionDisplayParts(modelOption);
                        const contextLabel = getModelOptionContextLabel(
                          section.backingProvider,
                          modelOption,
                          props.openRouterContextLengthsBySlug,
                          props.opencodeContextLengthsBySlug,
                        );
                        const visible = !getHiddenModelsForProvider(
                          section.backingProvider,
                          props.hiddenModelsByProvider,
                        ).includes(modelOption.slug);

                        return (
                          <div
                            key={`${section.option.value}:${modelOption.slug}`}
                            className="flex items-center gap-4 px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-medium text-sm text-foreground">
                                  {displayParts.modelLabel}
                                </span>
                                {section.favoriteModels.includes(modelOption.slug) ? (
                                  <Badge variant="warning" size="sm">
                                    {copy.favorite}
                                  </Badge>
                                ) : section.recentModels.includes(modelOption.slug) ? (
                                  <Badge variant="outline" size="sm">
                                    {copy.recent}
                                  </Badge>
                                ) : null}
                                {section.backingProvider === "codex" &&
                                shouldShowFastTierIcon(
                                  modelOption.slug,
                                  props.serviceTierSetting,
                                ) ? (
                                  <Badge variant="warning" size="sm">
                                    <ZapIcon className="size-3" />
                                    Fast
                                  </Badge>
                                ) : null}
                                {modelOption.supportsReasoning ? (
                                  <Badge variant="outline" size="sm">
                                    Reasoning
                                  </Badge>
                                ) : null}
                                {modelOption.supportsImageInput ? (
                                  <Badge variant="outline" size="sm">
                                    Vision
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                {displayParts.usesScopedLayout ? (
                                  <span className="rounded bg-muted/60 px-1.5 py-0.5 font-medium text-[11px] text-foreground/80">
                                    {displayParts.providerLabel}
                                  </span>
                                ) : null}
                                <span className="truncate">{modelOption.slug}</span>
                                <span className="shrink-0">{contextLabel}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="xs"
                                variant={
                                  section.favoriteModels.includes(modelOption.slug)
                                    ? "secondary"
                                    : "outline"
                                }
                                onClick={() => {
                                  props.onFavoriteModelChange(
                                    section.backingProvider,
                                    modelOption.slug,
                                    !section.favoriteModels.includes(modelOption.slug),
                                  );
                                }}
                              >
                                {section.favoriteModels.includes(modelOption.slug)
                                  ? copy.unpin
                                  : copy.pin}
                              </Button>
                              <span className="min-w-10 text-right text-xs text-muted-foreground">
                                {visible ? copy.shown : copy.hidden}
                              </span>
                              <Switch
                                checked={visible}
                                onCheckedChange={(checked) => {
                                  props.onModelVisibilityChange(
                                    section.backingProvider,
                                    modelOption.slug,
                                    checked === true,
                                  );
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </DialogPanel>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={props.onOpenProviderSetup}>
            <PlusIcon className="size-4" />
            {copy.providerSetup}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={props.onShowAll}
            disabled={totalHiddenCount === 0}
          >
            {copy.showAllHidden}
          </Button>
          <Button size="sm" onClick={() => props.onOpenChange(false)}>
            {copy.done}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

const CompactComposerControlsMenu = memo(function CompactComposerControlsMenu(props: {
  activePlan: boolean;
  interactionMode: ProviderInteractionMode;
  planSidebarOpen: boolean;
  runtimeMode: RuntimeMode;
  selectedEffort: ProviderReasoningLevel | null;
  selectedProvider: ProviderKind;
  selectedCodexFastModeEnabled: boolean;
  showCodexFastModeControls: boolean;
  reasoningOptions: ReadonlyArray<ProviderReasoningLevel>;
  allowDefaultReasoningSelection: boolean;
  onEffortSelect: (effort: ProviderReasoningLevel | null) => void;
  onCodexFastModeChange: (enabled: boolean) => void;
  onToggleInteractionMode: () => void;
  onTogglePlanSidebar: () => void;
  onToggleRuntimeMode: () => void;
}) {
  const {
    settings: { language },
  } = useAppSettings();
  const chatCopy = getChatSurfaceCopy(language);
  const planCopy = getPlanUiCopy(language);
  const defaultReasoningEffort = getDefaultReasoningEffort(props.selectedProvider);
  const reasoningLabelByOption: Record<ProviderReasoningLevel, string> = {
    off: chatCopy.off,
    minimal: chatCopy.minimal,
    low: chatCopy.low,
    medium: chatCopy.medium,
    high: chatCopy.high,
    xhigh: chatCopy.extraHigh,
  };

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="app-interactive-motion h-8 shrink-0 rounded-full px-2.5 text-muted-foreground/70 transition-[background-color,color,transform,box-shadow] hover:bg-muted/35 hover:text-foreground/85 motion-safe:hover:-translate-y-px"
            aria-label={chatCopy.moreComposerControls}
          />
        }
      >
        <EllipsisIcon aria-hidden="true" className="size-4" />
      </MenuTrigger>
      <MenuPopup align="start">
        {props.reasoningOptions.length > 0 ? (
          <>
            <MenuGroup>
              <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
                {chatCopy.reasoning}
              </div>
              <MenuRadioGroup
                value={props.selectedEffort ?? "__default__"}
                onValueChange={(value) => {
                  if (!value) return;
                  if (value === "__default__") {
                    props.onEffortSelect(null);
                    return;
                  }
                  const nextEffort = props.reasoningOptions.find((option) => option === value);
                  if (!nextEffort) return;
                  props.onEffortSelect(nextEffort);
                }}
              >
                {props.allowDefaultReasoningSelection ? (
                  <MenuRadioItem value="__default__">{chatCopy.defaultChoice}</MenuRadioItem>
                ) : null}
                {props.reasoningOptions.map((effort) => (
                  <MenuRadioItem key={effort} value={effort}>
                    {reasoningLabelByOption[effort]}
                    {effort === defaultReasoningEffort ? chatCopy.defaultSuffix : ""}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuGroup>
            {props.selectedProvider === "codex" && props.showCodexFastModeControls ? (
              <>
                <MenuDivider />
                <MenuGroup>
                  <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
                    {chatCopy.fastMode}
                  </div>
                  <MenuRadioGroup
                    value={props.selectedCodexFastModeEnabled ? "on" : "off"}
                    onValueChange={(value) => {
                      props.onCodexFastModeChange(value === "on");
                    }}
                  >
                    <MenuRadioItem value="off">{chatCopy.off}</MenuRadioItem>
                    <MenuRadioItem value="on">{chatCopy.on}</MenuRadioItem>
                  </MenuRadioGroup>
                </MenuGroup>
              </>
            ) : null}
            <MenuDivider />
          </>
        ) : null}
        <MenuGroup>
          <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
            {chatCopy.mode}
          </div>
          <MenuRadioGroup
            value={props.interactionMode}
            onValueChange={(value) => {
              if (!value || value === props.interactionMode) return;
              props.onToggleInteractionMode();
            }}
          >
            <MenuRadioItem value="default">{chatCopy.chatLabel}</MenuRadioItem>
            <MenuRadioItem value="plan">{planCopy.planLabel}</MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
        <MenuDivider />
        <MenuGroup>
          <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
            {chatCopy.access}
          </div>
          <MenuRadioGroup
            value={props.runtimeMode}
            onValueChange={(value) => {
              if (!value || value === props.runtimeMode) return;
              props.onToggleRuntimeMode();
            }}
          >
            <MenuRadioItem value="approval-required">{chatCopy.supervised}</MenuRadioItem>
            <MenuRadioItem value="full-access">{chatCopy.fullAccess}</MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
        {props.activePlan ? (
          <>
            <MenuDivider />
            <MenuItem onClick={props.onTogglePlanSidebar}>
              <ListTodoIcon className="size-4 shrink-0" />
              {props.planSidebarOpen ? planCopy.hidePlanSidebar : planCopy.showPlanSidebar}
            </MenuItem>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
});

const ReasoningTraitsPicker = memo(function ReasoningTraitsPicker(props: {
  effort: ProviderReasoningLevel | null;
  defaultReasoningEffort: ProviderReasoningLevel | null;
  allowDefaultSelection: boolean;
  fastModeEnabled?: boolean;
  options: ReadonlyArray<ProviderReasoningLevel>;
  onEffortChange: (effort: ProviderReasoningLevel | null) => void;
  onFastModeChange?: (enabled: boolean) => void;
}) {
  const {
    settings: { language },
  } = useAppSettings();
  const chatCopy = getChatSurfaceCopy(language);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const reasoningLabelByOption: Record<ProviderReasoningLevel, string> = {
    off: chatCopy.off,
    minimal: chatCopy.minimal,
    low: chatCopy.low,
    medium: chatCopy.medium,
    high: chatCopy.high,
    xhigh: chatCopy.extraHigh,
  };
  const triggerLabel = [
    props.effort ? reasoningLabelByOption[props.effort] : chatCopy.defaultChoice,
    ...(props.fastModeEnabled ? ["Fast"] : []),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={(open) => {
        setIsMenuOpen(open);
      }}
    >
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
          />
        }
      >
        <span>{triggerLabel}</span>
        <ChevronDownIcon aria-hidden="true" className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuGroup>
          <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
            {chatCopy.reasoning}
          </div>
          <MenuRadioGroup
            value={props.effort ?? "__default__"}
            onValueChange={(value) => {
              if (!value) return;
              if (value === "__default__") {
                props.onEffortChange(null);
                return;
              }
              const nextEffort = props.options.find((option) => option === value);
              if (!nextEffort) return;
              props.onEffortChange(nextEffort);
            }}
          >
            {props.allowDefaultSelection ? (
              <MenuRadioItem value="__default__">{chatCopy.defaultChoice}</MenuRadioItem>
            ) : null}
            {props.options.map((effort) => (
              <MenuRadioItem key={effort} value={effort}>
                {reasoningLabelByOption[effort]}
                {effort === props.defaultReasoningEffort ? chatCopy.defaultSuffix : ""}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        {props.onFastModeChange ? (
          <>
            <MenuDivider />
            <MenuGroup>
              <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
                {chatCopy.fastMode}
              </div>
              <MenuRadioGroup
                value={props.fastModeEnabled ? "on" : "off"}
                onValueChange={(value) => {
                  props.onFastModeChange?.(value === "on");
                }}
              >
                <MenuRadioItem value="off">{chatCopy.off}</MenuRadioItem>
                <MenuRadioItem value="on">{chatCopy.on}</MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
});

const CodexTraitsPicker = memo(function CodexTraitsPicker(props: {
  effort: ProviderReasoningLevel;
  fastModeEnabled: boolean;
  showFastModeControls: boolean;
  options: ReadonlyArray<ProviderReasoningLevel>;
  onEffortChange: (effort: ProviderReasoningLevel) => void;
  onFastModeChange: (enabled: boolean) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const defaultReasoningEffort = getDefaultReasoningEffort("codex");
  const reasoningLabelByOption: Record<ProviderReasoningLevel, string> = {
    off: "off",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra High",
  };
  const triggerLabel = [
    reasoningLabelByOption[props.effort],
    ...(props.showFastModeControls && props.fastModeEnabled ? ["Fast"] : []),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={(open) => {
        setIsMenuOpen(open);
      }}
    >
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
          />
        }
      >
        <span>{triggerLabel}</span>
        <ChevronDownIcon aria-hidden="true" className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuGroup>
          <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Reasoning</div>
          <MenuRadioGroup
            value={props.effort}
            onValueChange={(value) => {
              if (!value) return;
              const nextEffort = props.options.find((option) => option === value);
              if (!nextEffort) return;
              props.onEffortChange(nextEffort);
            }}
          >
            {props.options.map((effort) => (
              <MenuRadioItem key={effort} value={effort}>
                {reasoningLabelByOption[effort]}
                {effort === defaultReasoningEffort ? " (default)" : ""}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        {props.showFastModeControls ? (
          <>
            <MenuDivider />
            <MenuGroup>
              <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Fast Mode</div>
              <MenuRadioGroup
                value={props.fastModeEnabled ? "on" : "off"}
                onValueChange={(value) => {
                  props.onFastModeChange(value === "on");
                }}
              >
                <MenuRadioItem value="off">off</MenuRadioItem>
                <MenuRadioItem value="on">on</MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
});

const OpenInPicker = memo(function OpenInPicker({
  keybindings,
  availableEditors,
  openInCwd,
}: {
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  openInCwd: string | null;
}) {
  const [lastEditor, setLastEditor] = useState<EditorId>(() => {
    const stored = localStorage.getItem(LAST_EDITOR_KEY);
    return EDITORS.some((e) => e.id === stored) ? (stored as EditorId) : EDITORS[0].id;
  });

  const allOptions = useMemo<Array<{ label: string; Icon: Icon; value: EditorId }>>(
    () => [
      {
        label: "Cursor",
        Icon: CursorIcon,
        value: "cursor",
      },
      {
        label: "VS Code",
        Icon: VisualStudioCode,
        value: "vscode",
      },
      {
        label: "VS Code Insiders",
        Icon: VisualStudioCodeInsiders,
        value: "vscode-insiders",
      },
      {
        label: "Zed",
        Icon: Zed,
        value: "zed",
      },
      {
        label: isMacPlatform(navigator.platform)
          ? "Finder"
          : isWindowsPlatform(navigator.platform)
            ? "Explorer"
            : "Files",
        Icon: FolderClosedIcon,
        value: "file-manager",
      },
    ],
    [],
  );
  const options = useMemo(
    () => allOptions.filter((option) => availableEditors.includes(option.value)),
    [allOptions, availableEditors],
  );

  const effectiveEditor = options.some((option) => option.value === lastEditor)
    ? lastEditor
    : (options[0]?.value ?? null);
  const primaryOption = options.find(({ value }) => value === effectiveEditor) ?? null;

  const openInEditor = useCallback(
    (editorId: EditorId | null) => {
      const api = readNativeApi();
      if (!api || !openInCwd) return;
      const editor = editorId ?? effectiveEditor;
      if (!editor) return;
      void api.shell.openInEditor(openInCwd, editor);
      localStorage.setItem(LAST_EDITOR_KEY, editor);
      setLastEditor(editor);
    },
    [effectiveEditor, openInCwd, setLastEditor],
  );

  const openFavoriteEditorShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "editor.openFavorite"),
    [keybindings],
  );

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      const api = readNativeApi();
      if (!isOpenFavoriteEditorShortcut(e, keybindings)) return;
      if (!api || !openInCwd) return;
      if (!effectiveEditor) return;

      e.preventDefault();
      void api.shell.openInEditor(openInCwd, effectiveEditor);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [effectiveEditor, keybindings, openInCwd]);

  return (
    <Group aria-label="Editor actions">
      <Button
        size="xs"
        variant="outline"
        disabled={!effectiveEditor || !openInCwd}
        onClick={() => openInEditor(effectiveEditor)}
      >
        {primaryOption?.Icon && <primaryOption.Icon aria-hidden="true" className="size-3.5" />}
        <span className="sr-only @sm/header-actions:not-sr-only @sm/header-actions:ml-0.5">
          Open
        </span>
      </Button>
      <GroupSeparator className="hidden @sm/header-actions:block" />
      <Menu>
        <MenuTrigger
          render={<Button aria-label="More editor options" size="icon-xs" variant="outline" />}
        >
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </MenuTrigger>
        <MenuPopup align="end">
          {options.length === 0 && <MenuItem disabled>No installed editors found</MenuItem>}
          {options.map(({ label, Icon, value }) => (
            <MenuItem key={value} onClick={() => openInEditor(value)}>
              <Icon aria-hidden="true" className="text-muted-foreground" />
              {label}
              {value === effectiveEditor && openFavoriteEditorShortcutLabel && (
                <MenuShortcut>{openFavoriteEditorShortcutLabel}</MenuShortcut>
              )}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    </Group>
  );
});
