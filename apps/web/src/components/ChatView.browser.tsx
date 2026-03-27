// Production CSS is part of the behavior under test because row height depends on it.
import "../index.css";

import {
  DEFAULT_MODEL_BY_PROVIDER,
  ORCHESTRATION_WS_METHODS,
  type EventId,
  type MessageId,
  type OrchestrationReadModel,
  type ProjectId,
  type ProviderKind,
  type ServerConfig,
  type ServerOpenCodeState,
  type ThreadId,
  TurnId,
  type WsWelcomePayload,
  WS_CHANNELS,
  WS_METHODS,
  OrchestrationSessionStatus,
} from "@t3tools/contracts";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { HttpResponse, http, ws } from "msw";
import { setupWorker } from "msw/browser";
import { page } from "vitest/browser";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { useComposerDraftStore } from "../composerDraftStore";
import { getAppSettingsSnapshot, sanitizePersistedAppSettingsForStorage } from "../appSettings";
import { isMacPlatform } from "../lib/utils";
import { getRouter } from "../router";
import { useStore } from "../store";
import { estimateTimelineMessageHeight } from "./timelineHeight";

const THREAD_ID = "thread-browser-test" as ThreadId;
const UUID_ROUTE_RE = /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROJECT_ID = "project-1" as ProjectId;
const NOW_ISO = "2026-03-04T12:00:00.000Z";
const BASE_TIME_MS = Date.parse(NOW_ISO);
const ATTACHMENT_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='300'></svg>";
const APP_SETTINGS_STORAGE_KEY = "cut3:app-settings:v1";
const CHAT_BACKGROUND_TEST_DATA_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' fill='%23201b29'/><circle cx='60' cy='60' r='28' fill='%23b657ff'/></svg>",
  );

interface WsRequestEnvelope {
  id: string;
  body: {
    _tag: string;
    [key: string]: unknown;
  };
}

interface TestFixture {
  snapshot: OrchestrationReadModel;
  serverConfig: ServerConfig;
  openCodeState?: ServerOpenCodeState;
  welcome: WsWelcomePayload;
}

let fixture: TestFixture;
const wsRequests: WsRequestEnvelope["body"][] = [];
const wsLink = ws.link(/ws(s)?:\/\/.*/);

interface ViewportSpec {
  name: string;
  width: number;
  height: number;
  textTolerancePx: number;
  attachmentTolerancePx: number;
}

const DEFAULT_VIEWPORT: ViewportSpec = {
  name: "desktop",
  width: 960,
  height: 1_100,
  textTolerancePx: 44,
  attachmentTolerancePx: 56,
};
const TEXT_VIEWPORT_MATRIX = [
  DEFAULT_VIEWPORT,
  { name: "tablet", width: 720, height: 1_024, textTolerancePx: 44, attachmentTolerancePx: 56 },
  { name: "mobile", width: 430, height: 932, textTolerancePx: 56, attachmentTolerancePx: 56 },
  { name: "narrow", width: 320, height: 700, textTolerancePx: 84, attachmentTolerancePx: 56 },
] as const satisfies readonly ViewportSpec[];
const ATTACHMENT_VIEWPORT_MATRIX = [
  DEFAULT_VIEWPORT,
  { name: "mobile", width: 430, height: 932, textTolerancePx: 56, attachmentTolerancePx: 56 },
  { name: "narrow", width: 320, height: 700, textTolerancePx: 84, attachmentTolerancePx: 56 },
] as const satisfies readonly ViewportSpec[];

interface UserRowMeasurement {
  measuredRowHeightPx: number;
  timelineWidthMeasuredPx: number;
  renderedInVirtualizedRegion: boolean;
}

interface MountedChatView {
  cleanup: () => Promise<void>;
  measureUserRow: (targetMessageId: MessageId) => Promise<UserRowMeasurement>;
  setViewport: (viewport: ViewportSpec) => Promise<void>;
  router: ReturnType<typeof getRouter>;
}

function isoAt(offsetSeconds: number): string {
  return new Date(BASE_TIME_MS + offsetSeconds * 1_000).toISOString();
}

function createBaseServerConfig(): ServerConfig {
  return {
    cwd: "/repo/project",
    keybindingsConfigPath: "/repo/project/.cut3-keybindings.json",
    keybindings: [],
    issues: [],
    providers: [
      {
        provider: "codex",
        status: "ready",
        available: true,
        authStatus: "authenticated",
        checkedAt: NOW_ISO,
      },
    ],
    availableEditors: [],
  };
}

function createReadyProviderStatus(provider: ProviderKind) {
  return {
    provider,
    status: "ready" as const,
    available: true,
    authStatus: "authenticated" as const,
    checkedAt: NOW_ISO,
  };
}

function createUnavailableOpenCodeState(): ServerOpenCodeState {
  return {
    status: "unavailable",
    fetchedAt: NOW_ISO,
    checkedCwd: "/repo/project",
    binaryPath: "opencode",
    credentials: [],
    models: [],
    mcpSupported: false,
    mcpServers: [],
    configSources: [],
    message: "OpenCode runtime query failed.",
  };
}

function withActiveThreadProvider(
  snapshot: OrchestrationReadModel,
  provider: ProviderKind,
): OrchestrationReadModel {
  return {
    ...snapshot,
    threads: snapshot.threads.map((thread) =>
      thread.id === THREAD_ID
        ? {
            ...thread,
            model: DEFAULT_MODEL_BY_PROVIDER[provider],
            session: thread.session
              ? {
                  ...thread.session,
                  providerName: provider,
                }
              : thread.session,
          }
        : thread,
    ),
  };
}

function normalizeTextContent(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function queryCommandMenuItemByText(text: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>('[data-slot="command-item"]')).find((item) =>
      normalizeTextContent(item.textContent).includes(text),
    ) ?? null
  );
}

function queryCommandMenuItemsText(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-slot="command-item"]')).map(
    (item) => normalizeTextContent(item.textContent),
  );
}

function createUserMessage(options: {
  id: MessageId;
  text: string;
  offsetSeconds: number;
  attachments?: Array<{
    type: "image";
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}) {
  return {
    id: options.id,
    role: "user" as const,
    text: options.text,
    ...(options.attachments ? { attachments: options.attachments } : {}),
    turnId: null,
    streaming: false,
    createdAt: isoAt(options.offsetSeconds),
    updatedAt: isoAt(options.offsetSeconds + 1),
  };
}

function createAssistantMessage(options: { id: MessageId; text: string; offsetSeconds: number }) {
  return {
    id: options.id,
    role: "assistant" as const,
    text: options.text,
    turnId: null,
    streaming: false,
    createdAt: isoAt(options.offsetSeconds),
    updatedAt: isoAt(options.offsetSeconds + 1),
  };
}

function createSnapshotForTargetUser(options: {
  targetMessageId: MessageId;
  targetText: string;
  targetAttachmentCount?: number;
  sessionStatus?: OrchestrationSessionStatus;
}): OrchestrationReadModel {
  const messages: Array<OrchestrationReadModel["threads"][number]["messages"][number]> = [];

  for (let index = 0; index < 22; index += 1) {
    const isTarget = index === 3;
    const userId = `msg-user-${index}` as MessageId;
    const assistantId = `msg-assistant-${index}` as MessageId;
    const attachments =
      isTarget && (options.targetAttachmentCount ?? 0) > 0
        ? Array.from({ length: options.targetAttachmentCount ?? 0 }, (_, attachmentIndex) => ({
            type: "image" as const,
            id: `attachment-${attachmentIndex + 1}`,
            name: `attachment-${attachmentIndex + 1}.png`,
            mimeType: "image/png",
            sizeBytes: 128,
          }))
        : undefined;

    messages.push(
      createUserMessage({
        id: isTarget ? options.targetMessageId : userId,
        text: isTarget ? options.targetText : `filler user message ${index}`,
        offsetSeconds: messages.length * 3,
        ...(attachments ? { attachments } : {}),
      }),
    );
    messages.push(
      createAssistantMessage({
        id: assistantId,
        text: `assistant filler ${index}`,
        offsetSeconds: messages.length * 3,
      }),
    );
  }

  return {
    snapshotSequence: 1,
    projects: [
      {
        id: PROJECT_ID,
        title: "Project",
        workspaceRoot: "/repo/project",
        defaultModel: "gpt-5.4",
        scripts: [],
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
      },
    ],
    threads: [
      {
        id: THREAD_ID,
        projectId: PROJECT_ID,
        title: "Browser test thread",
        model: "gpt-5.4",
        interactionMode: "default",
        runtimeMode: "full-access",
        branch: "main",
        worktreePath: null,
        latestTurn: null,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
        messages,
        activities: [],
        proposedPlans: [],
        checkpoints: [],
        session: {
          threadId: THREAD_ID,
          status: options.sessionStatus ?? "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          tokenUsage: {
            provider: "codex",
            kind: "thread",
            model: "gpt-5.4",
            usage: {
              modelContextWindow: 1_000_000,
              last: {
                totalTokens: 12_345,
              },
            },
          },
          updatedAt: NOW_ISO,
        },
      },
    ],
    updatedAt: NOW_ISO,
  };
}

function buildFixture(snapshot: OrchestrationReadModel): TestFixture {
  return {
    snapshot,
    serverConfig: createBaseServerConfig(),
    openCodeState: createUnavailableOpenCodeState(),
    welcome: {
      cwd: "/repo/project",
      projectName: "Project",
      bootstrapProjectId: PROJECT_ID,
      bootstrapThreadId: THREAD_ID,
    },
  };
}

function createSnapshotWithThreadError(error: string): OrchestrationReadModel {
  const snapshot = createSnapshotForTargetUser({
    targetMessageId: "msg-user-banner-target" as MessageId,
    targetText: "thread banner background test",
  });
  const threads = snapshot.threads.slice();
  const firstThread = threads[0];

  if (firstThread?.session) {
    threads[0] = Object.assign({}, firstThread, {
      session: Object.assign({}, firstThread.session, {
        lastError: error,
      }),
    });
  }

  return {
    ...snapshot,
    threads,
  };
}

function createSnapshotWithInterruptFallbackTurn(turnId: TurnId): OrchestrationReadModel {
  const snapshot = createSnapshotForTargetUser({
    targetMessageId: "msg-user-stop-fallback" as MessageId,
    targetText: "stop fallback target",
    sessionStatus: "running",
  });

  return {
    ...snapshot,
    threads: snapshot.threads.map((thread) =>
      thread.id === THREAD_ID
        ? Object.assign({}, thread, {
            latestTurn: null,
            activities: [
              {
                id: "activity-running-turn-fallback" as EventId,
                tone: "tool" as const,
                kind: "tool.started",
                summary: "Running tool",
                payload: {},
                turnId,
                createdAt: isoAt(10),
              },
            ],
            session: thread.session
              ? Object.assign({}, thread.session, {
                  activeTurnId: null,
                  startedAt: isoAt(5),
                })
              : thread.session,
          })
        : thread,
    ),
  };
}

function createSnapshotWithPendingApproval(): OrchestrationReadModel {
  const snapshot = createSnapshotForTargetUser({
    targetMessageId: "msg-user-approval-request" as MessageId,
    targetText: "approval target",
    sessionStatus: "running",
  });

  return {
    ...snapshot,
    threads: snapshot.threads.map((thread) =>
      thread.id === THREAD_ID
        ? Object.assign({}, thread, {
            activities: [
              {
                id: "activity-approval-requested" as EventId,
                tone: "approval" as const,
                kind: "approval.requested",
                summary: "Command approval requested",
                payload: {
                  requestId: "approval-request-browser",
                  requestKind: "command",
                  detail: "Allow npm test?",
                },
                turnId: "turn-approval-browser" as TurnId,
                createdAt: isoAt(10),
              },
            ],
            session: thread.session
              ? Object.assign({}, thread.session, {
                  startedAt: isoAt(5),
                })
              : thread.session,
          })
        : thread,
    ),
  };
}

function addThreadToSnapshot(
  snapshot: OrchestrationReadModel,
  threadId: ThreadId,
): OrchestrationReadModel {
  return {
    ...snapshot,
    snapshotSequence: snapshot.snapshotSequence + 1,
    threads: [
      ...snapshot.threads,
      {
        id: threadId,
        projectId: PROJECT_ID,
        title: "New thread",
        model: "gpt-5.4",
        interactionMode: "default",
        runtimeMode: "full-access",
        branch: "main",
        worktreePath: null,
        latestTurn: null,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
        messages: [],
        activities: [],
        proposedPlans: [],
        checkpoints: [],
        session: {
          threadId,
          status: "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          tokenUsage: {
            provider: "codex",
            kind: "thread",
            model: "gpt-5.4",
            usage: {
              modelContextWindow: 1_000_000,
              last: {
                totalTokens: 12_345,
              },
            },
          },
          updatedAt: NOW_ISO,
        },
      },
    ],
  };
}

function createDraftOnlySnapshot(): OrchestrationReadModel {
  const snapshot = createSnapshotForTargetUser({
    targetMessageId: "msg-user-draft-target" as MessageId,
    targetText: "draft thread",
  });
  return {
    ...snapshot,
    threads: [],
  };
}

function createSnapshotWithLongProposedPlan(): OrchestrationReadModel {
  const snapshot = createSnapshotForTargetUser({
    targetMessageId: "msg-user-plan-target" as MessageId,
    targetText: "plan thread",
  });
  const planMarkdown = [
    "# Ship plan mode follow-up",
    "",
    "- Step 1: capture the thread-open trace",
    "- Step 2: identify the main-thread bottleneck",
    "- Step 3: keep collapsed cards cheap",
    "- Step 4: render the full markdown only on demand",
    "- Step 5: preserve export and save actions",
    "- Step 6: add regression coverage",
    "- Step 7: verify route transitions stay responsive",
    "- Step 8: confirm no server-side work changed",
    "- Step 9: confirm short plans still render normally",
    "- Step 10: confirm long plans stay collapsed by default",
    "- Step 11: confirm preview text is still useful",
    "- Step 12: confirm plan follow-up flow still works",
    "- Step 13: confirm timeline virtualization still behaves",
    "- Step 14: confirm theme styling still looks correct",
    "- Step 15: confirm save dialog behavior is unchanged",
    "- Step 16: confirm download behavior is unchanged",
    "- Step 17: confirm code fences do not parse until expand",
    "- Step 18: confirm preview truncation ends cleanly",
    "- Step 19: confirm markdown links still open in editor after expand",
    "- Step 20: confirm deep hidden detail only appears after expand",
    "",
    "```ts",
    "export const hiddenPlanImplementationDetail = 'deep hidden detail only after expand';",
    "```",
  ].join("\n");

  return {
    ...snapshot,
    threads: snapshot.threads.map((thread) =>
      thread.id === THREAD_ID
        ? Object.assign({}, thread, {
            proposedPlans: [
              {
                id: "plan-browser-test",
                turnId: null,
                planMarkdown,
                createdAt: isoAt(1_000),
                updatedAt: isoAt(1_001),
              },
            ],
            updatedAt: isoAt(1_001),
          })
        : thread,
    ),
  };
}

function resolveWsRpc(body: WsRequestEnvelope["body"]): unknown {
  const tag = body._tag;
  if (tag === ORCHESTRATION_WS_METHODS.dispatchCommand) {
    return {
      sequence: wsRequests.length,
    };
  }
  if (tag === ORCHESTRATION_WS_METHODS.getSnapshot) {
    return fixture.snapshot;
  }
  if (tag === WS_METHODS.serverGetConfig) {
    return fixture.serverConfig;
  }
  if (tag === WS_METHODS.serverGetOpenCodeState) {
    return fixture.openCodeState ?? createUnavailableOpenCodeState();
  }
  if (tag === WS_METHODS.serverGetCopilotUsage) {
    return {
      status: "available",
      source: "copilot_internal_user",
      fetchedAt: NOW_ISO,
      login: "octocat",
      plan: "individual",
      entitlement: 500,
      remaining: 320,
      used: 180,
      percentRemaining: 64,
      overagePermitted: true,
      overageCount: 0,
      unlimited: false,
      resetAt: isoAt(86_400),
    };
  }
  if (tag === WS_METHODS.gitListBranches) {
    return {
      isRepo: true,
      hasPreferredRemote: true,
      branches: [
        {
          name: "main",
          current: true,
          isDefault: true,
          worktreePath: null,
        },
      ],
    };
  }
  if (tag === WS_METHODS.gitStatus) {
    return {
      branch: "main",
      hasWorkingTreeChanges: false,
      workingTree: {
        files: [],
        insertions: 0,
        deletions: 0,
      },
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      pr: null,
    };
  }
  if (tag === WS_METHODS.projectsSearchEntries) {
    return {
      entries: [],
      truncated: false,
    };
  }
  if (tag === WS_METHODS.shellOpenInEditor) {
    return undefined;
  }
  if (tag === WS_METHODS.terminalOpen) {
    return {
      threadId: typeof body.threadId === "string" ? body.threadId : THREAD_ID,
      terminalId: typeof body.terminalId === "string" ? body.terminalId : "default",
      cwd: typeof body.cwd === "string" ? body.cwd : "/repo/project",
      status: "running",
      pid: 123,
      history: "",
      exitCode: null,
      exitSignal: null,
      updatedAt: NOW_ISO,
    };
  }
  return {};
}

const worker = setupWorker(
  wsLink.addEventListener("connection", ({ client }) => {
    client.send(
      JSON.stringify({
        type: "push",
        sequence: 1,
        channel: WS_CHANNELS.serverWelcome,
        data: fixture.welcome,
      }),
    );
    client.addEventListener("message", (event) => {
      const rawData = event.data;
      if (typeof rawData !== "string") return;
      let request: WsRequestEnvelope;
      try {
        request = JSON.parse(rawData) as WsRequestEnvelope;
      } catch {
        return;
      }
      const method = request.body?._tag;
      if (typeof method !== "string") return;
      wsRequests.push(request.body);
      client.send(
        JSON.stringify({
          id: request.id,
          result: resolveWsRpc(request.body),
        }),
      );
    });
  }),
  http.get("*/attachments/:attachmentId", () =>
    HttpResponse.text(ATTACHMENT_SVG, {
      headers: {
        "Content-Type": "image/svg+xml",
      },
    }),
  ),
  http.get("*/api/project-favicon", () => new HttpResponse(null, { status: 204 })),
);

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function waitForLayout(): Promise<void> {
  await nextFrame();
  await nextFrame();
  await nextFrame();
}

async function setViewport(viewport: ViewportSpec): Promise<void> {
  await page.viewport(viewport.width, viewport.height);
  await waitForLayout();
}

async function waitForProductionStyles(): Promise<void> {
  await vi.waitFor(
    () => {
      expect(
        getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
      ).not.toBe("");
      expect(getComputedStyle(document.body).marginTop).toBe("0px");
    },
    {
      timeout: 4_000,
      interval: 16,
    },
  );
}

async function waitForElement<T extends Element>(
  query: () => T | null,
  errorMessage: string,
): Promise<T> {
  let element: T | null = null;
  await vi.waitFor(
    () => {
      element = query();
      expect(element, errorMessage).toBeTruthy();
    },
    {
      timeout: 8_000,
      interval: 16,
    },
  );
  if (!element) {
    throw new Error(errorMessage);
  }
  return element;
}

async function waitForCommandMenuItem(text: string): Promise<HTMLElement> {
  return waitForElement(
    () => queryCommandMenuItemByText(text),
    `Unable to find command menu item containing "${text}".`,
  );
}

async function waitForCommandMenuEmptyState(text: string): Promise<HTMLElement> {
  return waitForElement(
    () =>
      Array.from(document.querySelectorAll<HTMLElement>("p")).find(
        (element) => normalizeTextContent(element.textContent) === text,
      ) ?? null,
    `Unable to find command menu empty state "${text}".`,
  );
}

async function waitForURL(
  router: ReturnType<typeof getRouter>,
  predicate: (pathname: string) => boolean,
  errorMessage: string,
): Promise<string> {
  let pathname = "";
  await vi.waitFor(
    () => {
      pathname = router.state.location.pathname;
      expect(predicate(pathname), errorMessage).toBe(true);
    },
    { timeout: 8_000, interval: 16 },
  );
  return pathname;
}

async function waitForComposerEditor(): Promise<HTMLElement> {
  return waitForElement(
    () => document.querySelector<HTMLElement>('[contenteditable="true"]'),
    "Unable to find composer editor.",
  );
}

async function waitForChatBackgroundLayer(): Promise<HTMLElement> {
  return waitForElement(
    () => document.querySelector<HTMLElement>('[data-chat-background-layer="true"]'),
    "Unable to find the chat background layer.",
  );
}

async function waitForChatBannerStack(): Promise<HTMLElement> {
  return waitForElement(
    () => document.querySelector<HTMLElement>('[data-chat-banner-stack="true"]'),
    "Unable to find the chat banner stack.",
  );
}

async function waitForInteractionModeButton(
  expectedLabel: "Chat" | "Plan",
): Promise<HTMLButtonElement> {
  return waitForElement(
    () =>
      Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === expectedLabel,
      ) as HTMLButtonElement | null,
    `Unable to find ${expectedLabel} interaction mode button.`,
  );
}

async function waitForComposerControl(controlName: string): Promise<HTMLElement> {
  return waitForElement(
    () => document.querySelector<HTMLElement>(`[data-chat-composer-control="${controlName}"]`),
    `Unable to find composer control "${controlName}".`,
  );
}

async function waitForImagesToLoad(scope: ParentNode): Promise<void> {
  const images = Array.from(scope.querySelectorAll("img"));
  if (images.length === 0) {
    return;
  }
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
  await waitForLayout();
}

async function measureUserRow(options: {
  host: HTMLElement;
  targetMessageId: MessageId;
}): Promise<UserRowMeasurement> {
  const { host, targetMessageId } = options;
  const rowSelector = `[data-message-id="${targetMessageId}"][data-message-role="user"]`;

  const scrollContainer = await waitForElement(
    () => host.querySelector<HTMLDivElement>("div.overflow-y-auto.overscroll-y-contain"),
    "Unable to find ChatView message scroll container.",
  );

  let row: HTMLElement | null = null;
  await vi.waitFor(
    async () => {
      scrollContainer.scrollTop = 0;
      scrollContainer.dispatchEvent(new Event("scroll"));
      await waitForLayout();
      row = host.querySelector<HTMLElement>(rowSelector);
      expect(row, "Unable to locate targeted user message row.").toBeTruthy();
    },
    {
      timeout: 8_000,
      interval: 16,
    },
  );

  await waitForImagesToLoad(row!);
  scrollContainer.scrollTop = 0;
  scrollContainer.dispatchEvent(new Event("scroll"));
  await nextFrame();

  const timelineRoot =
    row!.closest<HTMLElement>('[data-timeline-root="true"]') ??
    host.querySelector<HTMLElement>('[data-timeline-root="true"]');
  if (!(timelineRoot instanceof HTMLElement)) {
    throw new Error("Unable to locate timeline root container.");
  }

  let timelineWidthMeasuredPx = 0;
  let measuredRowHeightPx = 0;
  let renderedInVirtualizedRegion = false;
  await vi.waitFor(
    async () => {
      scrollContainer.scrollTop = 0;
      scrollContainer.dispatchEvent(new Event("scroll"));
      await nextFrame();
      const measuredRow = host.querySelector<HTMLElement>(rowSelector);
      expect(measuredRow, "Unable to measure targeted user row height.").toBeTruthy();
      timelineWidthMeasuredPx = timelineRoot.getBoundingClientRect().width;
      measuredRowHeightPx = measuredRow!.getBoundingClientRect().height;
      renderedInVirtualizedRegion = measuredRow!.closest("[data-index]") instanceof HTMLElement;
      expect(timelineWidthMeasuredPx, "Unable to measure timeline width.").toBeGreaterThan(0);
      expect(measuredRowHeightPx, "Unable to measure targeted user row height.").toBeGreaterThan(0);
    },
    {
      timeout: 4_000,
      interval: 16,
    },
  );

  return { measuredRowHeightPx, timelineWidthMeasuredPx, renderedInVirtualizedRegion };
}

async function mountChatView(options: {
  viewport: ViewportSpec;
  snapshot: OrchestrationReadModel;
  configureFixture?: (fixture: TestFixture) => void;
}): Promise<MountedChatView> {
  fixture = buildFixture(options.snapshot);
  options.configureFixture?.(fixture);
  await setViewport(options.viewport);
  await waitForProductionStyles();

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.width = "100vw";
  host.style.height = "100vh";
  host.style.display = "grid";
  host.style.overflow = "hidden";
  document.body.append(host);

  const router = getRouter(
    createMemoryHistory({
      initialEntries: [`/${THREAD_ID}`],
    }),
  );

  const screen = await render(<RouterProvider router={router} />, {
    container: host,
  });

  await waitForLayout();

  return {
    cleanup: async () => {
      await screen.unmount();
      host.remove();
    },
    measureUserRow: async (targetMessageId: MessageId) => measureUserRow({ host, targetMessageId }),
    setViewport: async (viewport: ViewportSpec) => {
      await setViewport(viewport);
      await waitForProductionStyles();
    },
    router,
  };
}

async function measureUserRowAtViewport(options: {
  snapshot: OrchestrationReadModel;
  targetMessageId: MessageId;
  viewport: ViewportSpec;
}): Promise<UserRowMeasurement> {
  const mounted = await mountChatView({
    viewport: options.viewport,
    snapshot: options.snapshot,
  });

  try {
    return await mounted.measureUserRow(options.targetMessageId);
  } finally {
    await mounted.cleanup();
  }
}

describe("ChatView timeline estimator parity (full app)", () => {
  beforeAll(async () => {
    fixture = buildFixture(
      createSnapshotForTargetUser({
        targetMessageId: "msg-user-bootstrap" as MessageId,
        targetText: "bootstrap",
      }),
    );
    await worker.start({
      onUnhandledRequest: "bypass",
      quiet: true,
      serviceWorker: {
        url: "/mockServiceWorker.js",
      },
    });
  });

  afterAll(async () => {
    await worker.stop();
  });

  beforeEach(async () => {
    await setViewport(DEFAULT_VIEWPORT);
    localStorage.clear();
    document.body.innerHTML = "";
    wsRequests.length = 0;
    useComposerDraftStore.setState({
      draftsByThreadId: {},
      draftThreadsByThreadId: {},
      projectDraftThreadIdByProjectId: {},
    });
    useStore.setState({
      projects: [],
      threads: [],
      threadsHydrated: false,
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each(TEXT_VIEWPORT_MATRIX)(
    "keeps long user message estimate close at the $name viewport",
    async (viewport) => {
      const userText = "x".repeat(3_200);
      const targetMessageId = `msg-user-target-long-${viewport.name}` as MessageId;
      const mounted = await mountChatView({
        viewport,
        snapshot: createSnapshotForTargetUser({
          targetMessageId,
          targetText: userText,
        }),
      });

      try {
        const { measuredRowHeightPx, timelineWidthMeasuredPx, renderedInVirtualizedRegion } =
          await mounted.measureUserRow(targetMessageId);

        expect(renderedInVirtualizedRegion).toBe(true);

        const estimatedHeightPx = estimateTimelineMessageHeight(
          { role: "user", text: userText, attachments: [] },
          { timelineWidthPx: timelineWidthMeasuredPx },
        );

        expect(Math.abs(measuredRowHeightPx - estimatedHeightPx)).toBeLessThanOrEqual(
          viewport.textTolerancePx,
        );
      } finally {
        await mounted.cleanup();
      }
    },
  );

  it("tracks wrapping parity while resizing an existing ChatView across the viewport matrix", async () => {
    const userText = "x".repeat(3_200);
    const targetMessageId = "msg-user-target-resize" as MessageId;
    const mounted = await mountChatView({
      viewport: TEXT_VIEWPORT_MATRIX[0],
      snapshot: createSnapshotForTargetUser({
        targetMessageId,
        targetText: userText,
      }),
    });

    try {
      const measurements: Array<
        UserRowMeasurement & { viewport: ViewportSpec; estimatedHeightPx: number }
      > = [];

      for (const viewport of TEXT_VIEWPORT_MATRIX) {
        await mounted.setViewport(viewport);
        const measurement = await mounted.measureUserRow(targetMessageId);
        const estimatedHeightPx = estimateTimelineMessageHeight(
          { role: "user", text: userText, attachments: [] },
          { timelineWidthPx: measurement.timelineWidthMeasuredPx },
        );

        expect(measurement.renderedInVirtualizedRegion).toBe(true);
        expect(Math.abs(measurement.measuredRowHeightPx - estimatedHeightPx)).toBeLessThanOrEqual(
          viewport.textTolerancePx,
        );
        measurements.push({ ...measurement, viewport, estimatedHeightPx });
      }

      expect(
        new Set(measurements.map((measurement) => Math.round(measurement.timelineWidthMeasuredPx)))
          .size,
      ).toBeGreaterThanOrEqual(3);

      const byMeasuredWidth = measurements.toSorted(
        (left, right) => left.timelineWidthMeasuredPx - right.timelineWidthMeasuredPx,
      );
      const narrowest = byMeasuredWidth[0]!;
      const widest = byMeasuredWidth.at(-1)!;
      expect(narrowest.timelineWidthMeasuredPx).toBeLessThan(widest.timelineWidthMeasuredPx);
      expect(narrowest.measuredRowHeightPx).toBeGreaterThan(widest.measuredRowHeightPx);
      expect(narrowest.estimatedHeightPx).toBeGreaterThan(widest.estimatedHeightPx);
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps the chat wallpaper anchored behind thread alerts", async () => {
    const persistedSettings = sanitizePersistedAppSettingsForStorage({
      ...getAppSettingsSnapshot(),
      chatBackgroundImageDataUrl: CHAT_BACKGROUND_TEST_DATA_URL,
      chatBackgroundImageAssetId: "",
      chatBackgroundImageName: "test-background.svg",
      chatBackgroundImageFadePercent: 0,
      chatBackgroundImageBlurPx: 0,
    });

    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(persistedSettings));

    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithThreadError("OpenRouter retry limit reached."),
    });

    try {
      const backgroundLayer = await waitForChatBackgroundLayer();
      const bannerStack = await waitForChatBannerStack();

      await waitForLayout();

      const backgroundRect = backgroundLayer.getBoundingClientRect();
      const bannerRect = bannerStack.getBoundingClientRect();

      expect(bannerRect.height).toBeGreaterThan(0);
      expect(backgroundRect.top).toBeLessThanOrEqual(bannerRect.top + 0.5);
    } finally {
      await mounted.cleanup();
    }
  });

  it("tracks additional rendered wrapping when ChatView width narrows between desktop and mobile viewports", async () => {
    const userText = "x".repeat(2_400);
    const targetMessageId = "msg-user-target-wrap" as MessageId;
    const snapshot = createSnapshotForTargetUser({
      targetMessageId,
      targetText: userText,
    });
    const desktopMeasurement = await measureUserRowAtViewport({
      viewport: TEXT_VIEWPORT_MATRIX[0],
      snapshot,
      targetMessageId,
    });
    const mobileMeasurement = await measureUserRowAtViewport({
      viewport: TEXT_VIEWPORT_MATRIX[2],
      snapshot,
      targetMessageId,
    });

    const estimatedDesktopPx = estimateTimelineMessageHeight(
      { role: "user", text: userText, attachments: [] },
      { timelineWidthPx: desktopMeasurement.timelineWidthMeasuredPx },
    );
    const estimatedMobilePx = estimateTimelineMessageHeight(
      { role: "user", text: userText, attachments: [] },
      { timelineWidthPx: mobileMeasurement.timelineWidthMeasuredPx },
    );

    const measuredDeltaPx =
      mobileMeasurement.measuredRowHeightPx - desktopMeasurement.measuredRowHeightPx;
    const estimatedDeltaPx = estimatedMobilePx - estimatedDesktopPx;
    expect(measuredDeltaPx).toBeGreaterThan(0);
    expect(estimatedDeltaPx).toBeGreaterThan(0);
    const ratio = estimatedDeltaPx / measuredDeltaPx;
    expect(ratio).toBeGreaterThan(0.65);
    expect(ratio).toBeLessThan(1.35);
  });

  it.each(ATTACHMENT_VIEWPORT_MATRIX)(
    "keeps user attachment estimate close at the $name viewport",
    async (viewport) => {
      const targetMessageId = `msg-user-target-attachments-${viewport.name}` as MessageId;
      const userText = "message with image attachments";
      const mounted = await mountChatView({
        viewport,
        snapshot: createSnapshotForTargetUser({
          targetMessageId,
          targetText: userText,
          targetAttachmentCount: 3,
        }),
      });

      try {
        const { measuredRowHeightPx, timelineWidthMeasuredPx, renderedInVirtualizedRegion } =
          await mounted.measureUserRow(targetMessageId);

        expect(renderedInVirtualizedRegion).toBe(true);

        const estimatedHeightPx = estimateTimelineMessageHeight(
          {
            role: "user",
            text: userText,
            attachments: [{ id: "attachment-1" }, { id: "attachment-2" }, { id: "attachment-3" }],
          },
          { timelineWidthPx: timelineWidthMeasuredPx },
        );

        expect(Math.abs(measuredRowHeightPx - estimatedHeightPx)).toBeLessThanOrEqual(
          viewport.attachmentTolerancePx,
        );
      } finally {
        await mounted.cleanup();
      }
    },
  );

  it("opens the project cwd for draft threads without a worktree path", async () => {
    useComposerDraftStore.setState({
      draftThreadsByThreadId: {
        [THREAD_ID]: {
          projectId: PROJECT_ID,
          createdAt: NOW_ISO,
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          envMode: "local",
        },
      },
      projectDraftThreadIdByProjectId: {
        [PROJECT_ID]: THREAD_ID,
      },
    });

    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createDraftOnlySnapshot(),
      configureFixture: (nextFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          availableEditors: ["vscode"],
        };
      },
    });

    try {
      const openButton = await waitForElement(
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (button) => button.textContent?.trim() === "Open",
          ) as HTMLButtonElement | null,
        "Unable to find Open button.",
      );
      openButton.click();

      await vi.waitFor(
        () => {
          const openRequest = wsRequests.find(
            (request) => request._tag === WS_METHODS.shellOpenInEditor,
          );
          expect(openRequest).toMatchObject({
            _tag: WS_METHODS.shellOpenInEditor,
            cwd: "/repo/project",
            editor: "vscode",
          });
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("toggles plan mode with Shift+Tab only while the composer is focused", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-target-hotkey" as MessageId,
        targetText: "hotkey target",
      }),
    });

    try {
      const initialModeButton = await waitForInteractionModeButton("Chat");
      expect(initialModeButton.title).toContain("enter plan mode");

      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      await waitForLayout();

      expect((await waitForInteractionModeButton("Chat")).title).toContain("enter plan mode");

      const composerEditor = await waitForComposerEditor();
      composerEditor.focus();
      composerEditor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );

      await vi.waitFor(
        async () => {
          expect((await waitForInteractionModeButton("Plan")).title).toContain(
            "return to normal chat mode",
          );
        },
        { timeout: 8_000, interval: 16 },
      );

      composerEditor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );

      await vi.waitFor(
        async () => {
          expect((await waitForInteractionModeButton("Chat")).title).toContain("enter plan mode");
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it.each([
    {
      provider: "codex" as const,
      supportsMcp: true,
      configureFixture: (nextFixture: TestFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          providers: [createReadyProviderStatus("codex")],
          mcpServers: [
            {
              provider: "codex",
              supported: true,
              servers: [
                {
                  name: "context7",
                  enabled: true,
                  state: "enabled",
                  authStatus: "o_auth",
                  toolCount: 1,
                  resourceCount: 0,
                  resourceTemplateCount: 0,
                },
              ],
            },
            { provider: "copilot", supported: false, servers: [] },
            { provider: "kimi", supported: false, servers: [] },
            { provider: "opencode", supported: false, servers: [] },
          ],
        };
      },
    },
    {
      provider: "opencode" as const,
      supportsMcp: true,
      configureFixture: (nextFixture: TestFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          providers: [createReadyProviderStatus("opencode")],
        };
        nextFixture.openCodeState = {
          ...createUnavailableOpenCodeState(),
          status: "available",
          mcpSupported: true,
          mcpServers: [
            {
              name: "sentry",
              enabled: true,
              state: "enabled",
              authStatus: "o_auth",
              toolCount: 0,
              resourceCount: 0,
              resourceTemplateCount: 0,
              connectionStatus: "connected",
            },
          ],
        };
      },
    },
    {
      provider: "copilot" as const,
      supportsMcp: false,
      configureFixture: (nextFixture: TestFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          providers: [createReadyProviderStatus("copilot")],
          mcpServers: [{ provider: "copilot", supported: false, servers: [] }],
        };
      },
    },
    {
      provider: "kimi" as const,
      supportsMcp: false,
      configureFixture: (nextFixture: TestFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          providers: [createReadyProviderStatus("kimi")],
          mcpServers: [{ provider: "kimi", supported: false, servers: [] }],
        };
      },
    },
  ])("shows /mcp in the slash command list only when supported for $provider", async (input) => {
    useComposerDraftStore.getState().setPrompt(THREAD_ID, "/");

    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: withActiveThreadProvider(
        createSnapshotForTargetUser({
          targetMessageId: `msg-user-mcp-command-${input.provider}` as MessageId,
          targetText: `${input.provider} mcp command test`,
        }),
        input.provider,
      ),
      configureFixture: input.configureFixture,
    });

    try {
      await waitForCommandMenuItem("/model");
      await vi.waitFor(
        () => {
          expect(queryCommandMenuItemByText("/mcp") !== null).toBe(input.supportsMcp);
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it.each([
    {
      provider: "codex" as const,
      configureFixture: (nextFixture: TestFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          providers: [createReadyProviderStatus("codex")],
          mcpServers: [
            {
              provider: "codex",
              supported: true,
              servers: [
                {
                  name: "context7",
                  enabled: true,
                  state: "enabled",
                  authStatus: "o_auth",
                  toolCount: 1,
                  resourceCount: 0,
                  resourceTemplateCount: 0,
                },
              ],
            },
          ],
        };
      },
      expectedItemText: "context7",
      expectedDescription: "Enabled · OAuth · 1 tool",
    },
    {
      provider: "opencode" as const,
      configureFixture: (nextFixture: TestFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          providers: [createReadyProviderStatus("opencode")],
        };
        nextFixture.openCodeState = {
          ...createUnavailableOpenCodeState(),
          status: "available",
          mcpSupported: true,
          mcpServers: [
            {
              name: "sentry",
              enabled: false,
              state: "disabled",
              authStatus: "unknown",
              toolCount: 0,
              resourceCount: 0,
              resourceTemplateCount: 0,
              connectionStatus: "unknown",
            },
          ],
        };
      },
      expectedItemText: "sentry",
      expectedDescription: "Disabled in OpenCode config",
    },
    {
      provider: "copilot" as const,
      configureFixture: (nextFixture: TestFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          providers: [createReadyProviderStatus("copilot")],
          mcpServers: [{ provider: "copilot", supported: false, servers: [] }],
        };
      },
      expectedEmptyState: "MCP server browsing is not available for this provider.",
    },
    {
      provider: "kimi" as const,
      configureFixture: (nextFixture: TestFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          providers: [createReadyProviderStatus("kimi")],
          mcpServers: [{ provider: "kimi", supported: false, servers: [] }],
        };
      },
      expectedEmptyState: "MCP server browsing is not available for this provider.",
    },
  ])("renders provider-specific /mcp browser state for $provider", async (input) => {
    useComposerDraftStore.getState().setPrompt(THREAD_ID, "/mcp");

    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: withActiveThreadProvider(
        createSnapshotForTargetUser({
          targetMessageId: `msg-user-mcp-browser-${input.provider}` as MessageId,
          targetText: `${input.provider} mcp browser test`,
        }),
        input.provider,
      ),
      configureFixture: input.configureFixture,
    });

    try {
      await waitForComposerEditor();
      if (input.expectedEmptyState) {
        await waitForCommandMenuEmptyState(input.expectedEmptyState);
        expect(queryCommandMenuItemsText()).toEqual([]);
        return;
      }

      const expectedItemText = input.expectedItemText!;
      const expectedDescription = input.expectedDescription!;
      const item = await waitForCommandMenuItem(expectedItemText);
      const itemText = normalizeTextContent(item.textContent);
      expect(itemText).toContain(expectedItemText);
      expect(itemText).toContain(expectedDescription);
    } finally {
      await mounted.cleanup();
    }
  });

  it("center-aligns desktop composer footer controls when the expanded toolbar is visible", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-footer-alignment" as MessageId,
        targetText: "footer alignment target",
      }),
    });

    try {
      await waitForComposerEditor();
      await waitForLayout();

      const footer = await waitForElement(
        () => document.querySelector<HTMLElement>('[data-chat-composer-footer="true"]'),
        "Unable to find composer footer.",
      );
      const [
        providerPicker,
        contextStatus,
        interactionModeButton,
        runtimeModeButton,
        primaryAction,
      ] = await Promise.all([
        waitForComposerControl("provider-picker"),
        waitForComposerControl("context-status"),
        waitForComposerControl("interaction-mode"),
        waitForComposerControl("runtime-mode"),
        waitForComposerControl("primary-action"),
      ]);

      expect(getComputedStyle(footer).alignItems).toBe("center");

      const controls = [
        providerPicker,
        contextStatus,
        interactionModeButton,
        runtimeModeButton,
        primaryAction,
      ];
      const centerLines = controls.map((control) => {
        const rect = control.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      const footerRect = footer.getBoundingClientRect();

      expect(Math.max(...centerLines) - Math.min(...centerLines)).toBeLessThanOrEqual(1);
      for (const centerLine of centerLines) {
        expect(Math.abs(centerLine - (footerRect.top + footerRect.height / 2))).toBeLessThanOrEqual(
          8,
        );
      }
      expect(primaryAction.getBoundingClientRect().right).toBeLessThanOrEqual(footerRect.right + 1);
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps expanded composer footer controls visually aligned", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-footer-alignment" as MessageId,
        targetText: "footer alignment target",
      }),
    });

    try {
      const footer = await waitForElement(
        () => document.querySelector<HTMLElement>('[data-chat-composer-footer="true"]'),
        "Unable to find the composer footer.",
      );
      const providerPicker = await waitForElement(
        () =>
          document.querySelector<HTMLButtonElement>(
            '[data-chat-composer-control="provider-picker"]',
          ),
        "Unable to find the provider picker control.",
      );
      const contextStatus = await waitForElement(
        () => document.querySelector<HTMLElement>('[data-chat-composer-control="context-status"]'),
        "Unable to find the composer context status control.",
      );
      const interactionModeButton = await waitForElement(
        () =>
          document.querySelector<HTMLButtonElement>(
            '[data-chat-composer-control="interaction-mode"]',
          ),
        "Unable to find the interaction mode button.",
      );
      const runtimeModeButton = await waitForElement(
        () =>
          document.querySelector<HTMLButtonElement>('[data-chat-composer-control="runtime-mode"]'),
        "Unable to find the runtime mode button.",
      );

      await waitForLayout();

      const footerRect = footer.getBoundingClientRect();
      const providerRect = providerPicker.getBoundingClientRect();
      const contextRect = contextStatus.getBoundingClientRect();
      const interactionRect = interactionModeButton.getBoundingClientRect();
      const runtimeRect = runtimeModeButton.getBoundingClientRect();
      const centerLines = [providerRect, contextRect, interactionRect, runtimeRect].map(
        (rect) => rect.top + rect.height / 2,
      );

      expect(providerRect.height).toBeGreaterThanOrEqual(32);
      expect(contextRect.height).toBeGreaterThan(providerRect.height);
      expect(Math.max(...centerLines) - Math.min(...centerLines)).toBeLessThanOrEqual(6);
      expect(providerRect.bottom).toBeLessThanOrEqual(footerRect.bottom);
      expect(contextRect.bottom).toBeLessThanOrEqual(footerRect.bottom);
    } finally {
      await mounted.cleanup();
    }
  });

  it("opens the usage dashboard with spend and Copilot quota details", async () => {
    const snapshot = withActiveThreadProvider(
      createSnapshotForTargetUser({
        targetMessageId: "msg-user-usage-dashboard" as MessageId,
        targetText: "usage dashboard target",
      }),
      "copilot",
    );
    const snapshotWithUsage = {
      ...snapshot,
      threads: snapshot.threads.map((thread) => {
        if (thread.id !== THREAD_ID || !thread.session) {
          return thread;
        }
        return Object.assign({}, thread, {
          model: "claude-sonnet-4.5",
          session: {
            ...thread.session,
            providerName: "copilot",
            tokenUsage: {
              provider: "copilot",
              kind: "turn",
              observedAt: NOW_ISO,
              model: "claude-sonnet-4.5",
              totalCostUsd: 0.42,
              usage: {
                inputTokens: 1_200,
                outputTokens: 340,
                thoughtTokens: 56,
              },
            },
          },
        });
      }),
    } satisfies OrchestrationReadModel;

    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: snapshotWithUsage,
      configureFixture: (nextFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          providers: [createReadyProviderStatus("codex"), createReadyProviderStatus("copilot")],
        };
      },
    });

    try {
      const contextStatus = await waitForComposerControl("context-status");
      contextStatus.click();

      const dashboard = await waitForElement(
        () => document.querySelector<HTMLElement>("[data-usage-dashboard='true']"),
        "Unable to find the usage dashboard dialog.",
      );

      expect(normalizeTextContent(document.body.textContent)).toContain("Usage dashboard");
      expect(normalizeTextContent(dashboard.textContent)).toContain("$0.4200");
      expect(normalizeTextContent(dashboard.textContent)).toContain("320 / 500");
      expect(normalizeTextContent(dashboard.textContent)).toContain("GitHub Copilot billing");
      expect(normalizeTextContent(dashboard.textContent)).toContain("1,596 tokens");
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows a pointer cursor for the running stop button", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-stop-button-cursor" as MessageId,
        targetText: "stop button cursor target",
        sessionStatus: "running",
      }),
    });

    try {
      const stopButton = await waitForElement(
        () => document.querySelector<HTMLButtonElement>('button[aria-label="Stop generation"]'),
        "Unable to find stop generation button.",
      );

      expect(getComputedStyle(stopButton).cursor).toBe("pointer");
    } finally {
      await mounted.cleanup();
    }
  });

  it("dispatches a turn interrupt from the browser using the latest in-session activity turn id", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithInterruptFallbackTurn(TurnId.makeUnsafe("turn-running-fallback")),
    });

    try {
      const stopButton = await waitForElement(
        () => document.querySelector<HTMLButtonElement>('button[aria-label="Stop generation"]'),
        "Unable to find stop generation button.",
      );
      stopButton.click();

      await vi.waitFor(
        () => {
          const interruptRequest = wsRequests.find(
            (request) =>
              request._tag === ORCHESTRATION_WS_METHODS.dispatchCommand &&
              request.command &&
              typeof request.command === "object" &&
              !Array.isArray(request.command) &&
              "type" in request.command &&
              request.command.type === "thread.turn.interrupt",
          );
          expect(interruptRequest).toMatchObject({
            _tag: ORCHESTRATION_WS_METHODS.dispatchCommand,
            command: {
              type: "thread.turn.interrupt",
              threadId: THREAD_ID,
              turnId: "turn-running-fallback",
            },
          });
        },
        { timeout: 8_000, interval: 16 },
      );
      await expect
        .element(page.getByRole("button", { name: "Stopping generation" }))
        .toBeDisabled();
    } finally {
      await mounted.cleanup();
    }
  });

  it("queues a follow-up while a turn is running and drains it after the session settles", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-queued-follow-up" as MessageId,
        targetText: "queued follow-up target",
        sessionStatus: "running",
      }),
    });

    try {
      useComposerDraftStore.getState().setPrompt(THREAD_ID, "queued from browser test");

      const queueButton = await waitForElement(
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (button) => button.textContent?.trim() === "Queue follow-up",
          ) as HTMLButtonElement | null,
        "Unable to find the queue follow-up button.",
      );
      queueButton.click();

      await expect.element(page.getByText("Queued follow-ups")).toBeInTheDocument();
      expect(
        wsRequests.some(
          (request) =>
            request._tag === ORCHESTRATION_WS_METHODS.dispatchCommand &&
            request.command &&
            typeof request.command === "object" &&
            !Array.isArray(request.command) &&
            "type" in request.command &&
            request.command.type === "thread.turn.start",
        ),
      ).toBe(false);

      useStore.getState().syncServerReadModel(
        createSnapshotForTargetUser({
          targetMessageId: "msg-user-queued-follow-up" as MessageId,
          targetText: "queued follow-up target",
          sessionStatus: "ready",
        }),
      );

      await vi.waitFor(
        () => {
          const turnStartRequest = wsRequests.find((request) => {
            const command = request.command as Record<string, unknown> | undefined;
            const message =
              command?.message && typeof command.message === "object"
                ? (command.message as Record<string, unknown>)
                : null;
            return (
              request._tag === ORCHESTRATION_WS_METHODS.dispatchCommand &&
              command?.type === "thread.turn.start" &&
              message?.text === "queued from browser test"
            );
          });
          expect(turnStartRequest).toBeTruthy();
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("interrupts the current turn when Send now is used for a follow-up", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-send-now" as MessageId,
        targetText: "send now target",
        sessionStatus: "running",
      }),
    });

    try {
      useComposerDraftStore.getState().setPrompt(THREAD_ID, "send-now follow-up");

      const steerToggle = await waitForElement(
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (button) => button.textContent?.trim() === "Steer",
          ) as HTMLButtonElement | null,
        "Unable to find the steer toggle button.",
      );
      steerToggle.click();

      const sendNowButton = await waitForElement(
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (button) => button.textContent?.trim() === "Send now",
          ) as HTMLButtonElement | null,
        "Unable to find the send-now button.",
      );
      sendNowButton.click();

      await vi.waitFor(
        () => {
          const interruptRequest = wsRequests.find(
            (request) =>
              request._tag === ORCHESTRATION_WS_METHODS.dispatchCommand &&
              request.command &&
              typeof request.command === "object" &&
              !Array.isArray(request.command) &&
              "type" in request.command &&
              request.command.type === "thread.turn.interrupt",
          );
          expect(interruptRequest).toBeTruthy();
        },
        { timeout: 8_000, interval: 16 },
      );

      useStore.getState().syncServerReadModel(
        createSnapshotForTargetUser({
          targetMessageId: "msg-user-send-now" as MessageId,
          targetText: "send now target",
          sessionStatus: "ready",
        }),
      );

      await vi.waitFor(
        () => {
          const turnStartRequest = wsRequests.find((request) => {
            const command = request.command as Record<string, unknown> | undefined;
            const message =
              command?.message && typeof command.message === "object"
                ? (command.message as Record<string, unknown>)
                : null;
            return (
              request._tag === ORCHESTRATION_WS_METHODS.dispatchCommand &&
              command?.type === "thread.turn.start" &&
              message?.text === "send-now follow-up"
            );
          });
          expect(turnStartRequest).toBeTruthy();
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("scrolls back to the bottom when a new message is sent from above the fold", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-scroll-send" as MessageId,
        targetText: "scroll send target",
      }),
    });

    try {
      const scrollContainer = await waitForElement(
        () => document.querySelector<HTMLDivElement>("div.overflow-y-auto.overscroll-y-contain"),
        "Unable to find ChatView message scroll container.",
      );
      scrollContainer.scrollTop = 0;
      scrollContainer.dispatchEvent(new Event("scroll"));
      await waitForLayout();

      useComposerDraftStore.getState().setPrompt(THREAD_ID, "scroll me back down");
      const sendButton = await waitForComposerControl("primary-action");
      await sendButton.click();

      await vi.waitFor(
        () => {
          const remaining =
            scrollContainer.scrollHeight - scrollContainer.clientHeight - scrollContainer.scrollTop;
          expect(remaining).toBeLessThan(32);
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("dispatches approval responses from the browser composer actions", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithPendingApproval(),
    });

    try {
      const approveButton = await waitForElement(
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (button) => button.textContent?.trim() === "Approve once",
          ) as HTMLButtonElement | null,
        "Unable to find the approval action button.",
      );
      approveButton.click();

      await vi.waitFor(
        () => {
          const approvalRequest = wsRequests.find(
            (request) =>
              request._tag === ORCHESTRATION_WS_METHODS.dispatchCommand &&
              request.command &&
              typeof request.command === "object" &&
              !Array.isArray(request.command) &&
              "type" in request.command &&
              request.command.type === "thread.approval.respond",
          );
          expect(approvalRequest).toMatchObject({
            _tag: ORCHESTRATION_WS_METHODS.dispatchCommand,
            command: {
              type: "thread.approval.respond",
              threadId: THREAD_ID,
              requestId: "approval-request-browser",
              decision: "accept",
            },
          });
        },
        { timeout: 8_000, interval: 16 },
      );
      await expect
        .element(page.getByRole("button", { name: "Approve once" }))
        .not.toBeInTheDocument();
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps the new thread selected after clicking the new-thread button", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-new-thread-test" as MessageId,
        targetText: "new thread selection test",
      }),
    });

    try {
      // Wait for the sidebar to render with the project.
      const newThreadButton = page.getByTestId("new-thread-button");
      await expect.element(newThreadButton).toBeInTheDocument();

      await newThreadButton.click();

      // The route should change to a new draft thread ID.
      const newThreadPath = await waitForURL(
        mounted.router,
        (path) => UUID_ROUTE_RE.test(path),
        "Route should have changed to a new draft thread UUID.",
      );
      const newThreadId = newThreadPath.slice(1) as ThreadId;

      // The composer editor should be present for the new draft thread.
      await waitForComposerEditor();

      // Simulate the snapshot sync arriving from the server after the draft
      // thread has been promoted to a server thread (thread.create + turn.start
      // succeeded). The snapshot now includes the new thread, and the sync
      // should clear the draft without disrupting the route.
      const { syncServerReadModel } = useStore.getState();
      syncServerReadModel(addThreadToSnapshot(fixture.snapshot, newThreadId));

      // Clear the draft now that the server thread exists (mirrors EventRouter behavior).
      useComposerDraftStore.getState().clearDraftThread(newThreadId);

      // The route should still be on the new thread — not redirected away.
      await waitForURL(
        mounted.router,
        (path) => path === newThreadPath,
        "New thread should remain selected after snapshot sync clears the draft.",
      );

      // The empty thread view and composer should still be visible.
      await expect.element(page.getByText(/^Send a message to start\.?$/)).toBeInTheDocument();
      await expect.element(page.getByTestId("composer-editor")).toBeInTheDocument();
    } finally {
      await mounted.cleanup();
    }
  });

  it("creates a new thread from the global chat.new shortcut", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-chat-shortcut-test" as MessageId,
        targetText: "chat shortcut test",
      }),
      configureFixture: (nextFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          keybindings: [
            {
              command: "chat.new",
              shortcut: {
                key: "o",
                metaKey: false,
                ctrlKey: false,
                shiftKey: true,
                altKey: false,
                modKey: true,
              },
              whenAst: {
                type: "not",
                node: { type: "identifier", name: "terminalFocus" },
              },
            },
          ],
        };
      },
    });

    try {
      const useMetaForMod = isMacPlatform(navigator.platform);
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "o",
          shiftKey: true,
          metaKey: useMetaForMod,
          ctrlKey: !useMetaForMod,
          bubbles: true,
          cancelable: true,
        }),
      );

      await waitForURL(
        mounted.router,
        (path) => UUID_ROUTE_RE.test(path),
        "Route should have changed to a new draft thread UUID from the shortcut.",
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("creates a fresh draft after the previous draft thread is promoted", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-promoted-draft-shortcut-test" as MessageId,
        targetText: "promoted draft shortcut test",
      }),
      configureFixture: (nextFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          keybindings: [
            {
              command: "chat.new",
              shortcut: {
                key: "o",
                metaKey: false,
                ctrlKey: false,
                shiftKey: true,
                altKey: false,
                modKey: true,
              },
              whenAst: {
                type: "not",
                node: { type: "identifier", name: "terminalFocus" },
              },
            },
          ],
        };
      },
    });

    try {
      const newThreadButton = page.getByTestId("new-thread-button");
      await expect.element(newThreadButton).toBeInTheDocument();
      await newThreadButton.click();

      const promotedThreadPath = await waitForURL(
        mounted.router,
        (path) => UUID_ROUTE_RE.test(path),
        "Route should have changed to a promoted draft thread UUID.",
      );
      const promotedThreadId = promotedThreadPath.slice(1) as ThreadId;

      const { syncServerReadModel } = useStore.getState();
      syncServerReadModel(addThreadToSnapshot(fixture.snapshot, promotedThreadId));
      useComposerDraftStore.getState().clearDraftThread(promotedThreadId);

      const useMetaForMod = isMacPlatform(navigator.platform);
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "o",
          shiftKey: true,
          metaKey: useMetaForMod,
          ctrlKey: !useMetaForMod,
          bubbles: true,
          cancelable: true,
        }),
      );

      const freshThreadPath = await waitForURL(
        mounted.router,
        (path) => UUID_ROUTE_RE.test(path) && path !== promotedThreadPath,
        "Shortcut should create a fresh draft instead of reusing the promoted thread.",
      );
      expect(freshThreadPath).not.toBe(promotedThreadPath);
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps long proposed plans lightweight until the user expands them", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithLongProposedPlan(),
    });

    try {
      await waitForElement(
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (button) => button.textContent?.trim() === "Expand plan",
          ) as HTMLButtonElement | null,
        "Unable to find Expand plan button.",
      );

      expect(document.body.textContent).not.toContain("deep hidden detail only after expand");

      const expandButton = await waitForElement(
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (button) => button.textContent?.trim() === "Expand plan",
          ) as HTMLButtonElement | null,
        "Unable to find Expand plan button.",
      );
      expandButton.click();

      await vi.waitFor(
        () => {
          expect(document.body.textContent).toContain("deep hidden detail only after expand");
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });
});
