import "../index.css";

import {
  ORCHESTRATION_WS_METHODS,
  type MessageId,
  type OrchestrationReadModel,
  type ProjectId,
  type ServerConfig,
  type ThreadId,
  type WsWelcomePayload,
  WS_CHANNELS,
  WS_METHODS,
} from "@t3tools/contracts";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { page } from "vitest/browser";
import { HttpResponse, http, ws } from "msw";
import { setupWorker } from "msw/browser";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { useComposerDraftStore } from "../composerDraftStore";
import { getRouter } from "../router";
import { useStore } from "../store";

const THREAD_ID = "thread-new-button-test" as ThreadId;
const PROJECT_ID = "project-1" as ProjectId;
const NOW_ISO = "2026-03-11T12:00:00.000Z";
const UUID_ROUTE_RE = /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface TestFixture {
  snapshot: OrchestrationReadModel;
  serverConfig: ServerConfig;
  welcome: WsWelcomePayload;
}

let fixture: TestFixture;
let pushSequence = 1;

const wsLink = ws.link(/ws(s)?:\/\/.*/);

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

function createSnapshot(): OrchestrationReadModel {
  return {
    snapshotSequence: 1,
    projects: [
      {
        id: PROJECT_ID,
        title: "Project",
        workspaceRoot: "/repo/project",
        defaultModel: "gpt-5",
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
        title: "Thread new button test",
        model: "gpt-5",
        interactionMode: "default",
        runtimeMode: "full-access",
        branch: "main",
        worktreePath: null,
        latestTurn: null,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
        messages: [
          {
            id: "message-1" as MessageId,
            role: "user",
            text: "hello",
            turnId: null,
            streaming: false,
            createdAt: NOW_ISO,
            updatedAt: NOW_ISO,
          },
        ],
        activities: [],
        proposedPlans: [],
        checkpoints: [],
        session: {
          threadId: THREAD_ID,
          status: "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: NOW_ISO,
        },
      },
    ],
    updatedAt: NOW_ISO,
  };
}

function buildFixture(): TestFixture {
  return {
    snapshot: createSnapshot(),
    serverConfig: createBaseServerConfig(),
    welcome: {
      cwd: "/repo/project",
      projectName: "Project",
      bootstrapProjectId: PROJECT_ID,
      bootstrapThreadId: THREAD_ID,
    },
  };
}

function resolveWsRpc(tag: string): unknown {
  if (tag === ORCHESTRATION_WS_METHODS.dispatchCommand) {
    return { sequence: pushSequence++ };
  }
  if (tag === ORCHESTRATION_WS_METHODS.getSnapshot) {
    return fixture.snapshot;
  }
  if (tag === WS_METHODS.serverGetConfig) {
    return fixture.serverConfig;
  }
  if (tag === WS_METHODS.gitListBranches) {
    return {
      isRepo: true,
      hasPreferredRemote: true,
      branches: [{ name: "main", current: true, isDefault: true, worktreePath: null }],
    };
  }
  if (tag === WS_METHODS.gitStatus) {
    return {
      branch: "main",
      hasWorkingTreeChanges: false,
      workingTree: { files: [], insertions: 0, deletions: 0 },
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      pr: null,
    };
  }
  if (tag === WS_METHODS.projectsSearchEntries) {
    return { entries: [], truncated: false };
  }
  return {};
}

const worker = setupWorker(
  wsLink.addEventListener("connection", ({ client }) => {
    pushSequence = 1;
    client.send(
      JSON.stringify({
        type: "push",
        sequence: pushSequence++,
        channel: WS_CHANNELS.serverWelcome,
        data: fixture.welcome,
      }),
    );
    client.addEventListener("message", (event) => {
      const rawData = event.data;
      if (typeof rawData !== "string") return;
      let request: { id: string; body: { _tag: string; [key: string]: unknown } };
      try {
        request = JSON.parse(rawData);
      } catch {
        return;
      }
      const method = request.body?._tag;
      if (typeof method !== "string") return;
      client.send(
        JSON.stringify({
          id: request.id,
          result: resolveWsRpc(method),
        }),
      );
    });
  }),
  http.get("*/attachments/:attachmentId", () => new HttpResponse(null, { status: 204 })),
  http.get("*/api/project-favicon", () => new HttpResponse(null, { status: 204 })),
);

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
    { timeout: 8_000, interval: 16 },
  );
  if (!element) {
    throw new Error(errorMessage);
  }
  return element;
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
    () => document.querySelector<HTMLElement>("[data-testid='composer-editor']"),
    "Composer editor should be visible.",
  );
}

async function mountApp(initialEntry: string): Promise<{
  cleanup: () => Promise<void>;
  router: ReturnType<typeof getRouter>;
}> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.width = "100vw";
  host.style.height = "100vh";
  host.style.display = "grid";
  host.style.overflow = "hidden";
  document.body.append(host);

  const router = getRouter(createMemoryHistory({ initialEntries: [initialEntry] }));
  const screen = await render(<RouterProvider router={router} />, { container: host });

  return {
    cleanup: async () => {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1_000);
      });
      await screen.unmount();
      host.remove();
    },
    router,
  };
}

describe("ThreadNewButton", () => {
  beforeAll(async () => {
    fixture = buildFixture();
    await worker.start({
      onUnhandledRequest: "bypass",
      quiet: true,
      serviceWorker: { url: "/mockServiceWorker.js" },
    });
  });

  afterAll(async () => {
    await worker.stop();
  });

  beforeEach(async () => {
    await page.viewport(1280, 900);
    fixture = buildFixture();
    localStorage.clear();
    document.body.innerHTML = "";
    pushSequence = 1;
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

  it("creates a new thread from the chat header button", async () => {
    const mounted = await mountApp(`/${THREAD_ID}`);

    try {
      const newThreadButton = await waitForElement(
        () => document.querySelector<HTMLElement>("[data-testid='global-new-thread-button']"),
        "Global new-thread button should render.",
      );
      newThreadButton.click();

      const newThreadPath = await waitForURL(
        mounted.router,
        (path) => UUID_ROUTE_RE.test(path),
        "Route should change to a new thread UUID.",
      );
      expect(newThreadPath).not.toBe(`/${THREAD_ID}`);
      await waitForComposerEditor();
    } finally {
      await mounted.cleanup();
    }
  });

  it("creates a new thread from settings using the first available project", async () => {
    const mounted = await mountApp("/settings");

    try {
      const newThreadButton = await waitForElement(
        () => document.querySelector<HTMLElement>("[data-testid='global-new-thread-button']"),
        "Settings should render the global new-thread button.",
      );
      newThreadButton.click();

      await waitForURL(
        mounted.router,
        (path) => UUID_ROUTE_RE.test(path),
        "Settings new-thread button should navigate to a new thread UUID.",
      );
      await waitForComposerEditor();
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows first-run onboarding on the empty root route and adds a project from a path", async () => {
    fixture.snapshot = {
      ...fixture.snapshot,
      projects: [],
      threads: [],
    };
    fixture.welcome = {
      cwd: "/repo/empty",
      projectName: "Empty",
    };

    const mounted = await mountApp("/");

    try {
      await waitForElement(
        () =>
          Array.from(document.querySelectorAll<HTMLElement>("p, h1, h2, h3")).find((node) =>
            node.textContent?.includes("Add your first project"),
          ) ?? null,
        "Empty route should show the first-run onboarding title.",
      );
      const input = await waitForElement(
        () => document.querySelector<HTMLInputElement>('input[placeholder="/path/to/project"]'),
        "First-run onboarding should render a project-path input.",
      );
      await page.getByPlaceholder("/path/to/project").fill("/repo/new-project");
      expect(input.value).toBe("/repo/new-project");

      const addButton = await waitForElement(
        () =>
          Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
            (button) => button.textContent?.trim() === "Add project",
          ) ?? null,
        "First-run onboarding should render the add-project button.",
      );
      addButton.click();

      await waitForURL(
        mounted.router,
        (path) => UUID_ROUTE_RE.test(path),
        "Adding a project from the empty route should open a new draft thread.",
      );
      await waitForComposerEditor();
    } finally {
      await mounted.cleanup();
    }
  });

  it("offers a new-thread CTA on the empty root route when projects already exist", async () => {
    fixture.snapshot = {
      ...fixture.snapshot,
      threads: [],
    };
    fixture.welcome = {
      cwd: "/repo/project",
      projectName: "Project",
    };

    const mounted = await mountApp("/");

    try {
      await waitForElement(
        () =>
          Array.from(document.querySelectorAll<HTMLElement>("p, h1, h2, h3")).find((node) =>
            node.textContent?.includes("Start a new thread"),
          ) ?? null,
        "Empty route should offer a new-thread CTA when projects exist.",
      );

      const createThreadButton = await waitForElement(
        () =>
          Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
            (button) => button.textContent?.trim() === "Create new thread",
          ) ?? null,
        "Empty route should render the create-thread button.",
      );
      createThreadButton.click();

      await waitForURL(
        mounted.router,
        (path) => UUID_ROUTE_RE.test(path),
        "The empty-state create-thread CTA should navigate to a draft thread.",
      );
      await waitForComposerEditor();
    } finally {
      await mounted.cleanup();
    }
  });
});
