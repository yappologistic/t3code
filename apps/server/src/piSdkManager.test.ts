import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  type AgentSession,
  type AgentSessionEvent,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { ApprovalRequestId, ThreadId, TurnId, type PiThinkingLevel } from "@t3tools/contracts";

import { PiSdkManager } from "./piSdkManager.ts";

function createUsage() {
  return {
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 2,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0.1,
    },
  };
}

function createAssistantMessage(text: string) {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    api: "openai-responses",
    provider: "openai",
    model: "gpt-5-mini",
    usage: createUsage(),
    stopReason: "stop" as const,
    timestamp: Date.now(),
  };
}

class FakeAgentSession {
  model: NonNullable<ReturnType<ModelRegistry["find"]>>;
  thinkingLevel: PiThinkingLevel = "medium";
  readonly sessionId = "pi-session-test";
  readonly sessionFile = "/tmp/pi-session-test.jsonl";
  readonly agent = {
    replaceMessages: vi.fn(),
  };

  readonly prompt = vi.fn<(text: string, options?: unknown) => Promise<void>>();
  readonly abort = vi.fn(async () => undefined);
  readonly dispose = vi.fn(() => undefined);
  readonly setActiveToolsByName = vi.fn((_toolNames: string[]) => undefined);
  readonly setModel = vi.fn(async (model: NonNullable<ReturnType<ModelRegistry["find"]>>) => {
    this.model = model;
  });
  readonly getAvailableThinkingLevels = vi.fn(() => this.availableThinkingLevels);
  readonly setThinkingLevel = vi.fn((level: PiThinkingLevel) => {
    const ordered: PiThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
    const requestedIndex = ordered.indexOf(level);
    const available = new Set(this.availableThinkingLevels);
    if (requestedIndex === -1) {
      this.thinkingLevel = this.availableThinkingLevels[0] ?? "off";
      return;
    }
    for (let index = requestedIndex; index < ordered.length; index += 1) {
      const candidate = ordered[index];
      if (candidate && available.has(candidate)) {
        this.thinkingLevel = candidate;
        return;
      }
    }
    for (let index = requestedIndex - 1; index >= 0; index -= 1) {
      const candidate = ordered[index];
      if (candidate && available.has(candidate)) {
        this.thinkingLevel = candidate;
        return;
      }
    }
    this.thinkingLevel = this.availableThinkingLevels[0] ?? "off";
  });

  private readonly listeners = new Set<(event: AgentSessionEvent) => void>();
  private readonly availableThinkingLevels: ReadonlyArray<PiThinkingLevel>;

  constructor(
    model: NonNullable<ReturnType<ModelRegistry["find"]>>,
    availableThinkingLevels: ReadonlyArray<PiThinkingLevel> = [
      "off",
      "minimal",
      "low",
      "medium",
      "high",
    ],
  ) {
    this.model = model;
    this.availableThinkingLevels = availableThinkingLevels;
  }

  subscribe(listener: (event: AgentSessionEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: AgentSessionEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function createSessionDependencies(cwd: string) {
  const authStorage = AuthStorage.inMemory({
    openai: {
      type: "api_key",
      key: "sk-test",
    },
  });
  const modelRegistry = new ModelRegistry(authStorage);
  const model = modelRegistry.find("openai", "gpt-5-mini");
  if (!model) {
    throw new Error("Expected built-in openai/gpt-5-mini model to exist in Pi tests.");
  }

  return {
    authStorage,
    modelRegistry,
    model,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager: SettingsManager.inMemory(),
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("PiSdkManager", () => {
  it("emits turn.started before the background prompt completes", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cut3-pi-manager-"));
    const deps = createSessionDependencies(cwd);
    const fakeSession = new FakeAgentSession(deps.model);
    let finishPrompt: (() => void) | undefined;

    fakeSession.prompt.mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          finishPrompt = resolve;
          fakeSession.emit({ type: "agent_start" } as AgentSessionEvent);
          fakeSession.emit({
            type: "message_update",
            message: createAssistantMessage("hello from pi"),
            assistantMessageEvent: {
              type: "text_delta",
              contentIndex: 0,
              delta: "hello from pi",
              partial: createAssistantMessage("hello from pi"),
            },
          } as AgentSessionEvent);
          fakeSession.emit({
            type: "message_end",
            message: createAssistantMessage("hello from pi"),
          } as AgentSessionEvent);
        }),
    );

    const manager = new PiSdkManager({
      stateDir: cwd,
      createSession: async () => ({
        session: fakeSession as unknown as AgentSession,
        sessionManager: deps.sessionManager,
        settingsManager: deps.settingsManager,
        modelRegistry: deps.modelRegistry,
        authStorage: deps.authStorage,
      }),
    });

    const events: string[] = [];
    manager.on("event", (event) => {
      events.push(event.type);
    });

    const threadId = ThreadId.makeUnsafe("thread-pi-start");
    await manager.startSession({
      threadId,
      provider: "pi",
      cwd,
      runtimeMode: "approval-required",
    });

    const turn = await manager.sendTurn({
      threadId,
      input: "say hello",
    });

    expect(turn.turnId).toBeDefined();
    expect(events).toContain("turn.started");
    expect(events).toContain("content.delta");
    expect(events).not.toContain("turn.completed");

    const resolvePrompt = finishPrompt;
    if (resolvePrompt) {
      resolvePrompt();
    }
    await flushMicrotasks();

    expect(events).toContain("turn.completed");
  });

  it("applies Pi thinking levels and reports the effective options in session.configured", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cut3-pi-manager-thinking-"));
    const deps = createSessionDependencies(cwd);
    const fakeSession = new FakeAgentSession(deps.model, [
      "off",
      "minimal",
      "low",
      "medium",
      "high",
    ]);

    const configuredPayloads: Array<Record<string, unknown>> = [];
    const manager = new PiSdkManager({
      stateDir: cwd,
      createSession: async () => ({
        session: fakeSession as unknown as AgentSession,
        sessionManager: deps.sessionManager,
        settingsManager: deps.settingsManager,
        modelRegistry: deps.modelRegistry,
        authStorage: deps.authStorage,
      }),
    });

    manager.on("event", (event) => {
      if (event.type === "session.configured") {
        configuredPayloads.push(
          (event.payload as { config?: Record<string, unknown> }).config ?? {},
        );
      }
    });

    const threadId = ThreadId.makeUnsafe("thread-pi-thinking-start");
    await manager.startSession({
      threadId,
      provider: "pi",
      cwd,
      modelOptions: {
        pi: {
          thinkingLevel: "high",
        },
      },
      runtimeMode: "approval-required",
    });

    expect(fakeSession.setThinkingLevel).toHaveBeenCalledWith("high");
    expect(configuredPayloads.at(-1)).toMatchObject({
      currentThinkingLevel: "high",
      availableThinkingLevels: ["off", "minimal", "low", "medium", "high"],
    });
  });

  it("clamps unsupported Pi thinking levels during turn submission and re-emits config", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cut3-pi-manager-thinking-turn-"));
    const deps = createSessionDependencies(cwd);
    const fakeSession = new FakeAgentSession(deps.model, [
      "off",
      "minimal",
      "low",
      "medium",
      "high",
    ]);

    fakeSession.prompt.mockImplementation(async () => {
      fakeSession.emit({ type: "agent_start" } as AgentSessionEvent);
      fakeSession.emit({
        type: "message_end",
        message: createAssistantMessage("done"),
      } as AgentSessionEvent);
    });

    const configuredPayloads: Array<Record<string, unknown>> = [];
    const manager = new PiSdkManager({
      stateDir: cwd,
      createSession: async () => ({
        session: fakeSession as unknown as AgentSession,
        sessionManager: deps.sessionManager,
        settingsManager: deps.settingsManager,
        modelRegistry: deps.modelRegistry,
        authStorage: deps.authStorage,
      }),
    });

    manager.on("event", (event) => {
      if (event.type === "session.configured") {
        configuredPayloads.push(
          (event.payload as { config?: Record<string, unknown> }).config ?? {},
        );
      }
    });

    const threadId = ThreadId.makeUnsafe("thread-pi-thinking-turn");
    await manager.startSession({
      threadId,
      provider: "pi",
      cwd,
      runtimeMode: "approval-required",
    });

    await manager.sendTurn({
      threadId,
      input: "hello",
      modelOptions: {
        pi: {
          thinkingLevel: "xhigh",
        },
      },
    });
    await flushMicrotasks();

    expect(fakeSession.setThinkingLevel).toHaveBeenCalledWith("xhigh");
    expect(configuredPayloads.at(-1)).toMatchObject({
      currentThinkingLevel: "high",
      availableThinkingLevels: ["off", "minimal", "low", "medium", "high"],
    });
  });

  it("opens and resolves CUT3 approvals around Pi tool execution", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cut3-pi-manager-approval-"));
    fs.writeFileSync(path.join(cwd, "README.md"), "# hello\n", "utf8");
    const deps = createSessionDependencies(cwd);
    const fakeSession = new FakeAgentSession(deps.model);
    let capturedRequestId: string | null = null;

    fakeSession.prompt.mockImplementation(async (_text, _options) => {
      fakeSession.emit({ type: "agent_start" } as AgentSessionEvent);

      const tools = sessionFactoryInput?.tools;
      const readTool = tools?.find((tool) => tool.name === "read");
      if (!readTool) {
        throw new Error("Expected wrapped Pi read tool in approval test.");
      }

      fakeSession.emit({
        type: "tool_execution_start",
        toolCallId: "call-read-1",
        toolName: "read",
        args: { path: "README.md" },
      } as AgentSessionEvent);

      const result = await readTool.execute(
        "call-read-1",
        { path: "README.md" },
        new AbortController().signal,
        undefined,
      );

      fakeSession.emit({
        type: "tool_execution_end",
        toolCallId: "call-read-1",
        toolName: "read",
        result,
        isError: false,
      } as AgentSessionEvent);
      fakeSession.emit({
        type: "message_end",
        message: createAssistantMessage("done"),
      } as AgentSessionEvent);
    });

    let sessionFactoryInput:
      | {
          tools: Array<{
            name: string;
            execute: (...args: Array<any>) => Promise<any>;
          }>;
        }
      | undefined;

    const manager = new PiSdkManager({
      stateDir: cwd,
      createSession: async (input) => {
        sessionFactoryInput = input;
        return {
          session: fakeSession as unknown as AgentSession,
          sessionManager: deps.sessionManager,
          settingsManager: deps.settingsManager,
          modelRegistry: deps.modelRegistry,
          authStorage: deps.authStorage,
        };
      },
    });

    const events: Array<{ type: string; requestId?: string }> = [];
    manager.on("event", (event) => {
      events.push({
        type: event.type,
        ...(typeof event.requestId === "string" ? { requestId: event.requestId } : {}),
      });
      if (event.type === "request.opened" && typeof event.requestId === "string") {
        capturedRequestId = event.requestId;
      }
    });

    const threadId = ThreadId.makeUnsafe("thread-pi-approval");
    await manager.startSession({
      threadId,
      provider: "pi",
      cwd,
      runtimeMode: "approval-required",
    });

    const sendTurnPromise = manager.sendTurn({
      threadId,
      input: "read the readme",
    });

    await flushMicrotasks();
    expect(capturedRequestId).not.toBeNull();
    expect(events.some((event) => event.type === "request.opened")).toBe(true);

    await manager.respondToRequest(
      threadId,
      ApprovalRequestId.makeUnsafe(capturedRequestId!),
      "accept",
    );
    await sendTurnPromise;
    await vi.waitFor(() => {
      expect(events.some((event) => event.type === "request.resolved")).toBe(true);
      expect(events.some((event) => event.type === "item.completed")).toBe(true);
      expect(events.some((event) => event.type === "turn.completed")).toBe(true);
    });
  });

  it("keeps the replacement Pi session registered after disposing the previous one", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cut3-pi-manager-replace-"));
    const deps = createSessionDependencies(cwd);
    const firstSession = new FakeAgentSession(deps.model);
    const secondSession = new FakeAgentSession(deps.model);
    secondSession.prompt.mockImplementation(async () => {
      secondSession.emit({ type: "agent_start" } as AgentSessionEvent);
      secondSession.emit({
        type: "message_end",
        message: createAssistantMessage("replacement session reply"),
      } as AgentSessionEvent);
    });

    const createdSessions = [firstSession, secondSession];
    const manager = new PiSdkManager({
      stateDir: cwd,
      createSession: async () => {
        const session = createdSessions.shift();
        if (!session) {
          throw new Error("No fake Pi session available for replacement test.");
        }
        return {
          session: session as unknown as AgentSession,
          sessionManager: deps.sessionManager,
          settingsManager: deps.settingsManager,
          modelRegistry: deps.modelRegistry,
          authStorage: deps.authStorage,
        };
      },
    });

    const threadId = ThreadId.makeUnsafe("thread-pi-replace");
    await manager.startSession({
      threadId,
      provider: "pi",
      cwd,
      runtimeMode: "approval-required",
    });
    await manager.startSession({
      threadId,
      provider: "pi",
      cwd,
      runtimeMode: "approval-required",
    });

    expect(await manager.hasSession(threadId)).toBe(true);
    await expect(
      manager.sendTurn({
        threadId,
        input: "use the replacement session",
      }),
    ).resolves.toMatchObject({ threadId });
    await flushMicrotasks();

    expect(firstSession.dispose).toHaveBeenCalledTimes(1);
    expect(secondSession.prompt).toHaveBeenCalledTimes(1);
    expect((await manager.listSessions()).map((session) => session.threadId)).toEqual([threadId]);
  });

  it("blocks duplicate Pi session starts before createContext resolves", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cut3-pi-manager-starting-"));
    const deps = createSessionDependencies(cwd);
    const fakeSession = new FakeAgentSession(deps.model);

    let resolveCreateSession: (() => void) | undefined;
    const createSessionPromise = new Promise<{
      session: AgentSession;
      sessionManager: SessionManager;
      settingsManager: SettingsManager;
      modelRegistry: ModelRegistry;
      authStorage: AuthStorage;
    }>((resolve) => {
      resolveCreateSession = () => {
        resolve({
          session: fakeSession as unknown as AgentSession,
          sessionManager: deps.sessionManager,
          settingsManager: deps.settingsManager,
          modelRegistry: deps.modelRegistry,
          authStorage: deps.authStorage,
        });
      };
    });

    const manager = new PiSdkManager({
      stateDir: cwd,
      createSession: async () => createSessionPromise,
    });

    const threadId = ThreadId.makeUnsafe("thread-pi-starting");
    const firstStartPromise = manager.startSession({
      threadId,
      provider: "pi",
      cwd,
      runtimeMode: "approval-required",
    });
    await flushMicrotasks();

    await expect(
      manager.startSession({
        threadId,
        provider: "pi",
        cwd,
        runtimeMode: "approval-required",
      }),
    ).rejects.toThrow("Pi already has a session starting");

    resolveCreateSession?.();
    await firstStartPromise;
    expect(await manager.hasSession(threadId)).toBe(true);
  });

  it("ignores stale interrupt requests that target an older Pi turn id", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cut3-pi-manager-interrupt-"));
    const deps = createSessionDependencies(cwd);
    const fakeSession = new FakeAgentSession(deps.model);
    let finishPrompt: (() => void) | undefined;

    fakeSession.prompt.mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          finishPrompt = () => {
            fakeSession.emit({
              type: "message_end",
              message: createAssistantMessage("done"),
            } as AgentSessionEvent);
            resolve();
          };
          fakeSession.emit({ type: "agent_start" } as AgentSessionEvent);
        }),
    );

    const manager = new PiSdkManager({
      stateDir: cwd,
      createSession: async () => ({
        session: fakeSession as unknown as AgentSession,
        sessionManager: deps.sessionManager,
        settingsManager: deps.settingsManager,
        modelRegistry: deps.modelRegistry,
        authStorage: deps.authStorage,
      }),
    });

    const threadId = ThreadId.makeUnsafe("thread-pi-interrupt");
    await manager.startSession({
      threadId,
      provider: "pi",
      cwd,
      runtimeMode: "approval-required",
    });

    const turn = await manager.sendTurn({
      threadId,
      input: "long running turn",
    });

    await manager.interruptTurn(threadId, TurnId.makeUnsafe("pi-turn-stale"));
    expect(fakeSession.abort).not.toHaveBeenCalled();

    finishPrompt?.();
    await flushMicrotasks();

    expect(turn.turnId).toBeDefined();
    expect(fakeSession.abort).not.toHaveBeenCalled();
  });
});
