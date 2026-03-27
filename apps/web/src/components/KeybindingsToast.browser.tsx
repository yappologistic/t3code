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
import { ws, http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { useComposerDraftStore } from "../composerDraftStore";
import { getRouter } from "../router";
import { useStore } from "../store";
import { useTerminalStateStore } from "../terminalStateStore";

const THREAD_ID = "thread-kb-toast-test" as ThreadId;
const PROJECT_ID = "project-1" as ProjectId;
const NOW_ISO = "2026-03-04T12:00:00.000Z";

interface TestFixture {
  snapshot: OrchestrationReadModel;
  serverConfig: ServerConfig;
  welcome: WsWelcomePayload;
}

let fixture: TestFixture;
let wsClient: { send: (data: string) => void } | null = null;
let pushSequence = 1;

const wsLink = ws.link(/ws(s)?:\/\/.*/);

function createBaseServerConfig(): ServerConfig {
  return {
    cwd: "/repo/project",
    keybindingsConfigPath: "/repo/project/.cut3-keybindings.json",
    keybindings: [
      {
        command: "commandPalette.toggle",
        shortcut: {
          key: "p",
          metaKey: false,
          ctrlKey: false,
          shiftKey: true,
          altKey: false,
          modKey: true,
        },
      },
      {
        command: "sidebar.toggle",
        shortcut: {
          key: "b",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          modKey: true,
        },
      },
      {
        command: "terminal.toggle",
        shortcut: {
          key: "j",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          modKey: true,
        },
      },
      {
        command: "diff.toggle",
        shortcut: {
          key: "d",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          modKey: true,
        },
      },
      {
        command: "chat.new",
        shortcut: {
          key: "n",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          modKey: true,
        },
      },
      {
        command: "chat.newLocal",
        shortcut: {
          key: "n",
          metaKey: false,
          ctrlKey: false,
          shiftKey: true,
          altKey: false,
          modKey: true,
        },
      },
    ],
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

function createMinimalSnapshot(): OrchestrationReadModel {
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
        title: "Test thread",
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
            id: "msg-1" as MessageId,
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
    snapshot: createMinimalSnapshot(),
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
    wsClient = client;
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

function sendServerConfigUpdatedPush(issues: Array<{ kind: string; message: string }>) {
  if (!wsClient) throw new Error("WebSocket client not connected");
  wsClient.send(
    JSON.stringify({
      type: "push",
      sequence: pushSequence++,
      channel: WS_CHANNELS.serverConfigUpdated,
      data: {
        issues,
        providers: fixture.serverConfig.providers,
      },
    }),
  );
}

function queryToastTitles(): string[] {
  return Array.from(document.querySelectorAll('[data-slot="toast-title"]')).map(
    (el) => el.textContent ?? "",
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
    { timeout: 8_000, interval: 16 },
  );
  return element!;
}

async function waitForComposerEditor(): Promise<HTMLElement> {
  return waitForElement(
    () => document.querySelector<HTMLElement>('[data-testid="composer-editor"]'),
    "App should render composer editor",
  );
}

async function openCommandPalette(): Promise<HTMLInputElement> {
  const isMac = navigator.platform.includes("Mac");
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "P",
      ctrlKey: !isMac,
      metaKey: isMac,
      shiftKey: true,
      bubbles: true,
    }),
  );
  return waitForElement(
    () =>
      Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((input) =>
        (input.getAttribute("placeholder") ?? "").includes("command"),
      ) ?? null,
    "Command palette should appear",
  );
}

async function waitForCommandItem(label: string): Promise<HTMLElement> {
  return waitForElement(
    () =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-slot='command-item']")).find((el) =>
        (el.textContent ?? "").includes(label),
      ) ?? null,
    `Expected command item ${label}`,
  );
}

async function waitForToast(title: string, count = 1): Promise<void> {
  await vi.waitFor(
    () => {
      const matches = queryToastTitles().filter((t) => t === title);
      expect(matches.length, `Expected ${count} "${title}" toast(s)`).toBeGreaterThanOrEqual(count);
    },
    { timeout: 4_000, interval: 16 },
  );
}

async function waitForNoToast(title: string): Promise<void> {
  await vi.waitFor(
    () => {
      expect(queryToastTitles().filter((t) => t === title)).toHaveLength(0);
    },
    { timeout: 10_000, interval: 50 },
  );
}

async function mountApp(initialEntry = `/${THREAD_ID}`): Promise<{
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
  if (initialEntry === `/${THREAD_ID}`) {
    await waitForComposerEditor();
  } else {
    await waitForElement(
      () => document.querySelector<HTMLElement>("[data-slot='sidebar-inset']"),
      "Expected settings route shell to render",
    );
  }

  return {
    router,
    cleanup: async () => {
      await screen.unmount();
      host.remove();
    },
  };
}

describe("Keybindings update toast", () => {
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

  beforeEach(() => {
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
    useTerminalStateStore.setState({
      terminalStateByThreadId: {},
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows a toast for each consecutive keybinding update with no issues", async () => {
    const mounted = await mountApp();

    try {
      sendServerConfigUpdatedPush([]);
      await waitForToast("Keybindings updated", 1);

      // Each server push represents a distinct file change, so it should produce its own toast.
      sendServerConfigUpdatedPush([]);
      await waitForToast("Keybindings updated", 2);
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows a warning toast when keybinding config has issues", async () => {
    const mounted = await mountApp();

    try {
      sendServerConfigUpdatedPush([
        { kind: "keybindings.malformed-config", message: "Expected JSON array" },
      ]);
      await waitForToast("Invalid keybindings configuration");
    } finally {
      await mounted.cleanup();
    }
  });

  it("does not show a toast from the replayed cached value on subscribe", async () => {
    const mounted = await mountApp();

    try {
      sendServerConfigUpdatedPush([]);
      await waitForToast("Keybindings updated");
      await waitForNoToast("Keybindings updated");

      // Remount the app — onServerConfigUpdated replays the cached value
      // synchronously on subscribe. This should NOT produce a toast.
      await mounted.cleanup();
      const remounted = await mountApp();

      // Give it a moment to process the replayed value
      await new Promise((resolve) => setTimeout(resolve, 500));

      const titles = queryToastTitles();
      expect(
        titles.filter((t) => t === "Keybindings updated").length,
        "Replayed cached value should not produce a toast",
      ).toBe(0);

      await remounted.cleanup();
    } catch (error) {
      await mounted.cleanup().catch(() => {});
      throw error;
    }
  });

  it("executes command palette items for terminal, diff, and settings", async () => {
    const mounted = await mountApp();

    try {
      await openCommandPalette();
      const terminalItem = await waitForCommandItem("Toggle Terminal");
      terminalItem.click();

      await vi.waitFor(() => {
        const threadState = useTerminalStateStore.getState().terminalStateByThreadId[THREAD_ID];
        expect(threadState?.terminalOpen ?? false).toBe(true);
      });

      await openCommandPalette();
      const diffItem = await waitForCommandItem("Toggle Diff Panel");
      diffItem.click();

      await vi.waitFor(() => {
        expect((mounted.router.state.location.search as Record<string, unknown>).diff).toBe("1");
      });

      await openCommandPalette();
      const settingsItem = await waitForCommandItem("Open Settings");
      settingsItem.click();

      await vi.waitFor(() => {
        expect(mounted.router.state.location.pathname).toBe("/settings");
      });
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows thread-scoped command palette actions as disabled without an open thread", async () => {
    const mounted = await mountApp("/settings");

    try {
      await openCommandPalette();
      const terminalItem = await waitForCommandItem("Toggle Terminal");
      const diffItem = await waitForCommandItem("Toggle Diff Panel");

      expect(terminalItem.getAttribute("data-disabled")).not.toBeNull();
      expect(diffItem.getAttribute("data-disabled")).not.toBeNull();
      expect(terminalItem.textContent).toContain("Open a thread first");
      expect(diffItem.textContent).toContain("Open a thread first");
    } finally {
      await mounted.cleanup();
    }
  });
});
