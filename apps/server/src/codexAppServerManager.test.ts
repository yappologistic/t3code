import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApprovalRequestId, ThreadId, TurnId } from "@t3tools/contracts";

import {
  buildCodexAppServerArgs,
  buildCodexAppServerEnv,
  buildCodexInitializeParams,
  CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
  CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
  CodexAppServerManager,
  classifyCodexStderrLine,
  formatCodexRpcErrorMessage,
  isRecoverableThreadResumeError,
  normalizeCodexModelSlug,
  readCodexAccountSnapshot,
  resolveCodexModelForAccount,
} from "./codexAppServerManager";

const asThreadId = (value: string): ThreadId => ThreadId.makeUnsafe(value);

function createSendTurnHarness() {
  const manager = new CodexAppServerManager();
  const context = {
    session: {
      provider: "codex",
      status: "ready",
      threadId: "thread_1",
      runtimeMode: "full-access",
      model: "gpt-5.3-codex",
      resumeCursor: { threadId: "thread_1" },
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    },
    account: {
      type: "unknown",
      planType: null,
      sparkEnabled: true,
    },
  };

  const requireSession = vi
    .spyOn(
      manager as unknown as { requireSession: (sessionId: string) => unknown },
      "requireSession",
    )
    .mockReturnValue(context);
  const sendRequest = vi
    .spyOn(
      manager as unknown as { sendRequest: (...args: unknown[]) => Promise<unknown> },
      "sendRequest",
    )
    .mockResolvedValue({
      turn: {
        id: "turn_1",
      },
    });
  const updateSession = vi
    .spyOn(manager as unknown as { updateSession: (...args: unknown[]) => void }, "updateSession")
    .mockImplementation(() => {});

  return { manager, context, requireSession, sendRequest, updateSession };
}

function createThreadControlHarness() {
  const manager = new CodexAppServerManager();
  const context = {
    session: {
      provider: "codex",
      status: "ready",
      threadId: "thread_1",
      runtimeMode: "full-access",
      model: "gpt-5.3-codex",
      resumeCursor: { threadId: "thread_1" },
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    },
  };

  const requireSession = vi
    .spyOn(
      manager as unknown as { requireSession: (sessionId: string) => unknown },
      "requireSession",
    )
    .mockReturnValue(context);
  const sendRequest = vi.spyOn(
    manager as unknown as { sendRequest: (...args: unknown[]) => Promise<unknown> },
    "sendRequest",
  );
  const updateSession = vi
    .spyOn(manager as unknown as { updateSession: (...args: unknown[]) => void }, "updateSession")
    .mockImplementation(() => {});

  return { manager, context, requireSession, sendRequest, updateSession };
}

function createPendingUserInputHarness() {
  const manager = new CodexAppServerManager();
  const context = {
    session: {
      provider: "codex",
      status: "ready",
      threadId: "thread_1",
      runtimeMode: "full-access",
      model: "gpt-5.3-codex",
      resumeCursor: { threadId: "thread_1" },
      createdAt: "2026-02-10T00:00:00.000Z",
      updatedAt: "2026-02-10T00:00:00.000Z",
    },
    pendingUserInputs: new Map([
      [
        ApprovalRequestId.makeUnsafe("req-user-input-1"),
        {
          requestId: ApprovalRequestId.makeUnsafe("req-user-input-1"),
          jsonRpcId: 42,
          threadId: asThreadId("thread_1"),
        },
      ],
    ]),
  };

  const requireSession = vi
    .spyOn(
      manager as unknown as { requireSession: (sessionId: string) => unknown },
      "requireSession",
    )
    .mockReturnValue(context);
  const writeMessage = vi
    .spyOn(manager as unknown as { writeMessage: (...args: unknown[]) => void }, "writeMessage")
    .mockImplementation(() => {});
  const emitEvent = vi
    .spyOn(manager as unknown as { emitEvent: (...args: unknown[]) => void }, "emitEvent")
    .mockImplementation(() => {});

  return { manager, context, requireSession, writeMessage, emitEvent };
}

type NotificationHarnessContext = {
  session: {
    provider: "codex";
    status: "running" | "error" | "ready";
    threadId: ThreadId;
    runtimeMode: "full-access";
    model: string;
    createdAt: string;
    updatedAt: string;
    activeTurnId?: string;
    lastError?: string;
  };
  pending: Map<unknown, unknown>;
  pendingApprovals: Map<unknown, unknown>;
  pendingUserInputs: Map<unknown, unknown>;
  pendingOpenRouterTurnRetry?: {
    providerThreadId: string;
    input: ReadonlyArray<unknown>;
    model: string;
    currentTurnId?: TurnId;
    fallbackAttempted: boolean;
  };
  nextRequestId: number;
  stopping: boolean;
};

describe("classifyCodexStderrLine", () => {
  it("ignores empty lines", () => {
    expect(classifyCodexStderrLine("   ")).toBeNull();
  });

  it("ignores non-error structured codex logs", () => {
    const line =
      "2026-02-08T04:24:19.241256Z  WARN codex_core::features: unknown feature key in config: skills";
    expect(classifyCodexStderrLine(line)).toBeNull();
  });

  it("ignores known benign rollout path errors", () => {
    const line =
      "\u001b[2m2026-02-08T04:24:20.085687Z\u001b[0m \u001b[31mERROR\u001b[0m \u001b[2mcodex_core::rollout::list\u001b[0m: state db missing rollout path for thread 019c3b6c-46b8-7b70-ad23-82f824d161fb";
    expect(classifyCodexStderrLine(line)).toBeNull();
  });

  it("keeps unknown structured errors", () => {
    const line = "2026-02-08T04:24:20.085687Z ERROR codex_core::runtime: unrecoverable failure";
    expect(classifyCodexStderrLine(line)).toEqual({
      message: line,
    });
  });

  it("keeps plain stderr messages", () => {
    const line = "fatal: permission denied";
    expect(classifyCodexStderrLine(line)).toEqual({
      message: line,
    });
  });
});

describe("normalizeCodexModelSlug", () => {
  it("maps 5.3 aliases to gpt-5.3-codex", () => {
    expect(normalizeCodexModelSlug("5.3")).toBe("gpt-5.3-codex");
    expect(normalizeCodexModelSlug("gpt-5.3")).toBe("gpt-5.3-codex");
  });

  it("prefers codex id when model differs", () => {
    expect(normalizeCodexModelSlug("gpt-5.3", "gpt-5.3-codex")).toBe("gpt-5.3-codex");
  });

  it("keeps non-aliased models as-is", () => {
    expect(normalizeCodexModelSlug("gpt-5.2-codex")).toBe("gpt-5.2-codex");
    expect(normalizeCodexModelSlug("gpt-5.2")).toBe("gpt-5.2");
  });
});

describe("formatCodexRpcErrorMessage", () => {
  it("keeps native Codex errors unchanged", () => {
    expect(
      formatCodexRpcErrorMessage({
        method: "turn/start",
        message: "404 Not Found",
        model: "gpt-5.3-codex",
      }),
    ).toBe("turn/start failed: 404 Not Found");
  });

  it("rewrites OpenRouter routing failures with actionable guidance", () => {
    const message = formatCodexRpcErrorMessage({
      method: "turn/start",
      message: "404 Not Found: No endpoints available matching your data policy.",
      model: "google/gemma-3n-e4b-it:free",
    });

    expect(message).toContain("OpenRouter could not find an eligible endpoint");
    expect(message).toContain("privacy/provider settings");
    expect(message).toContain(
      "Original error: 404 Not Found: No endpoints available matching your data policy.",
    );
  });

  it("rewrites OpenRouter privacy failures even when the runtime event omits the model", () => {
    const message = formatCodexRpcErrorMessage({
      method: "runtime error",
      message:
        "unexpected status 404 Not Found: No endpoints available matching your guardrails restrictions and data policy. Configure: https://openrouter.ai/settings/privacy",
    });

    expect(message).toContain("the selected OpenRouter model");
    expect(message).toContain("https://openrouter.ai/settings/privacy");
    expect(message).toContain("guardrails");
  });

  it("rewrites OpenRouter rate limits into actionable guidance", () => {
    const message = formatCodexRpcErrorMessage({
      method: "runtime error",
      message:
        "exceeded retry limit, last status: 429 Too Many Requests, request id: 9dd38c21dc8dc25f-YVR",
      model: "qwen/qwen3-4b:free",
    });

    expect(message).toContain("OpenRouter rate-limited qwen/qwen3-4b:free");
    expect(message).toContain("openrouter/free");
    expect(message).toContain("Original error: exceeded retry limit");
  });

  it("rewrites OpenRouter insufficient-credit failures into actionable guidance", () => {
    const message = formatCodexRpcErrorMessage({
      method: "runtime error",
      message:
        "unexpected status 402 Payment Required: Insufficient credits. This account never purchased credits.",
      model: "openrouter/free",
    });

    expect(message).toContain(
      "does not currently have usable OpenRouter credits or free-tier allowance",
    );
    expect(message).toContain("https://openrouter.ai/settings/credits");
    expect(message).toContain("https://openrouter.ai/api/v1/key");
  });

  it("rewrites OpenRouter Responses API validation failures into actionable guidance", () => {
    const message = formatCodexRpcErrorMessage({
      method: "runtime error",
      message:
        '{"error":{"code":"invalid_prompt","message":"Invalid Responses API request"},"metadata":{"raw":"invalid input"}}',
      model: "openai/gpt-oss-120b:free",
    });

    expect(message).toContain("OpenRouter rejected a Responses API payload");
    expect(message).toContain("openai/gpt-oss-120b:free");
    expect(message).toContain("openrouter/free");
  });

  it("rewrites 'model not found' errors for OpenRouter free models", () => {
    const message = formatCodexRpcErrorMessage({
      method: "turn/start",
      message: "model not found",
      model: "openai/gpt-oss-120b:free",
    });

    expect(message).toContain("OpenRouter could not serve openai/gpt-oss-120b:free");
    expect(message).toContain("frequently rotated");
    expect(message).toContain("openrouter/free");
  });

  it("rewrites upstream unavailable errors for OpenRouter free models", () => {
    const message = formatCodexRpcErrorMessage({
      method: "turn/start",
      message: "502 Bad Gateway",
      model: "qwen/qwen3-235b-a22b:free",
    });

    expect(message).toContain("OpenRouter could not serve qwen/qwen3-235b-a22b:free");
    expect(message).toContain("frequently rotated");
    expect(message).toContain("openrouter/free");
  });

  it("rewrites standalone invalid_prompt errors for OpenRouter models", () => {
    const message = formatCodexRpcErrorMessage({
      method: "turn/start",
      message: '{"error":{"code":"invalid_prompt","message":"some validation problem"}}',
      model: "openai/gpt-oss-120b:free",
    });

    expect(message).toContain("OpenRouter rejected a Responses API payload");
    expect(message).toContain("openai/gpt-oss-120b:free");
  });
});

describe("handleServerNotification", () => {
  it("formats OpenRouter runtime error notifications before persisting session lastError", () => {
    const manager = new CodexAppServerManager();
    const context: NotificationHarnessContext = {
      session: {
        provider: "codex",
        status: "running",
        threadId: asThreadId("thread-1"),
        runtimeMode: "full-access",
        model: "google/gemma-3-27b-it:free",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
      },
      pending: new Map(),
      pendingApprovals: new Map(),
      pendingUserInputs: new Map(),
      nextRequestId: 1,
      stopping: false,
    };

    (
      manager as unknown as {
        handleServerNotification: (
          context: NotificationHarnessContext,
          notification: { method: string; params?: unknown },
        ) => void;
      }
    ).handleServerNotification(context, {
      method: "error",
      params: {
        error: {
          message:
            "unexpected status 404 Not Found: No endpoints available matching your guardrails restrictions and data policy. Configure: https://openrouter.ai/settings/privacy",
        },
        willRetry: false,
      },
    });

    expect(context.session.status).toBe("error");
    expect(context.session.lastError).toContain("OpenRouter could not find an eligible endpoint");
    expect(context.session.lastError).toContain("https://openrouter.ai/settings/privacy");
    expect(context.session.lastError).toContain("Original error:");
  });

  it("formats failed turn completion errors before persisting session lastError", () => {
    const manager = new CodexAppServerManager();
    const context: NotificationHarnessContext = {
      session: {
        provider: "codex",
        status: "running",
        threadId: asThreadId("thread-1"),
        runtimeMode: "full-access",
        model: "google/gemma-3-27b-it:free",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
      },
      pending: new Map(),
      pendingApprovals: new Map(),
      pendingUserInputs: new Map(),
      nextRequestId: 1,
      stopping: false,
    };

    (
      manager as unknown as {
        handleServerNotification: (
          context: NotificationHarnessContext,
          notification: { method: string; params?: unknown },
        ) => void;
      }
    ).handleServerNotification(context, {
      method: "turn/completed",
      params: {
        turn: {
          status: "failed",
          error: {
            message:
              "unexpected status 404 Not Found: No endpoints available matching your guardrails restrictions and data policy. Configure: https://openrouter.ai/settings/privacy",
          },
        },
      },
    });

    expect(context.session.status).toBe("error");
    expect(context.session.activeTurnId).toBeUndefined();
    expect(context.session.lastError).toContain("OpenRouter could not find an eligible endpoint");
    expect(context.session.lastError).toContain("https://openrouter.ai/settings/privacy");
  });

  it("suppresses retryable OpenRouter runtime errors while a free-router fallback remains available", () => {
    const manager = new CodexAppServerManager();
    const context: NotificationHarnessContext = {
      session: {
        provider: "codex",
        status: "running",
        threadId: asThreadId("thread-1"),
        runtimeMode: "full-access",
        model: "openai/gpt-oss-120b:free",
        activeTurnId: TurnId.makeUnsafe("turn-1"),
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
      },
      pending: new Map(),
      pendingApprovals: new Map(),
      pendingUserInputs: new Map(),
      pendingOpenRouterTurnRetry: {
        providerThreadId: asThreadId("thread-1"),
        input: [{ type: "text", text: "hello", text_elements: [] }],
        model: "openai/gpt-oss-120b:free",
        currentTurnId: TurnId.makeUnsafe("turn-1"),
        fallbackAttempted: false,
      },
      nextRequestId: 1,
      stopping: false,
    };

    (
      manager as unknown as {
        handleServerNotification: (
          context: NotificationHarnessContext,
          notification: { method: string; params?: unknown },
        ) => void;
      }
    ).handleServerNotification(context, {
      method: "error",
      params: {
        turn: { id: "turn-1" },
        error: {
          message:
            "unexpected status 404 Not Found: No endpoints available matching your guardrails restrictions and data policy. Configure: https://openrouter.ai/settings/privacy",
        },
        willRetry: false,
      },
    });

    expect(context.session.status).toBe("running");
    expect(context.session.lastError).toBeUndefined();
  });

  it("retries failed OpenRouter free-model turns via openrouter/free after turn completion", async () => {
    const manager = new CodexAppServerManager();
    const context: NotificationHarnessContext = {
      session: {
        provider: "codex",
        status: "running",
        threadId: asThreadId("thread-1"),
        runtimeMode: "full-access",
        model: "openai/gpt-oss-120b:free",
        activeTurnId: TurnId.makeUnsafe("turn-1"),
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
      },
      pending: new Map(),
      pendingApprovals: new Map(),
      pendingUserInputs: new Map(),
      pendingOpenRouterTurnRetry: {
        providerThreadId: asThreadId("thread-1"),
        input: [{ type: "text", text: "hello", text_elements: [] }],
        model: "openai/gpt-oss-120b:free",
        currentTurnId: TurnId.makeUnsafe("turn-1"),
        fallbackAttempted: false,
      },
      nextRequestId: 1,
      stopping: false,
    };
    const sendRequest = vi
      .spyOn(
        manager as unknown as { sendRequest: (...args: unknown[]) => Promise<unknown> },
        "sendRequest",
      )
      .mockResolvedValue({
        turn: {
          id: "turn-2",
        },
      });

    (
      manager as unknown as {
        handleServerNotification: (
          context: NotificationHarnessContext,
          notification: { method: string; params?: unknown },
        ) => void;
      }
    ).handleServerNotification(context, {
      method: "turn/completed",
      params: {
        turn: {
          id: "turn-1",
          status: "failed",
          error: {
            message:
              "unexpected status 404 Not Found: No endpoints available matching your guardrails restrictions and data policy. Configure: https://openrouter.ai/settings/privacy",
          },
        },
      },
    });

    await vi.waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith(context, "turn/start", {
        threadId: "thread-1",
        input: [{ type: "text", text: "hello", text_elements: [] }],
        model: "openrouter/free",
      });
      expect(context.session.status).toBe("running");
      expect(context.session.activeTurnId).toBe("turn-2");
      expect(context.session.lastError).toBeUndefined();
      expect(context.pendingOpenRouterTurnRetry?.fallbackAttempted).toBe(true);
      expect(context.pendingOpenRouterTurnRetry?.currentTurnId).toBe("turn-2");
    });
  });

  it("retries via openrouter/free when a free model returns 'model not found'", async () => {
    const manager = new CodexAppServerManager();
    const context: NotificationHarnessContext = {
      session: {
        provider: "codex",
        status: "running",
        threadId: asThreadId("thread-1"),
        runtimeMode: "full-access",
        model: "openai/gpt-oss-120b:free",
        activeTurnId: TurnId.makeUnsafe("turn-1"),
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
      },
      pending: new Map(),
      pendingApprovals: new Map(),
      pendingUserInputs: new Map(),
      pendingOpenRouterTurnRetry: {
        providerThreadId: asThreadId("thread-1"),
        input: [{ type: "text", text: "hello", text_elements: [] }],
        model: "openai/gpt-oss-120b:free",
        currentTurnId: TurnId.makeUnsafe("turn-1"),
        fallbackAttempted: false,
      },
      nextRequestId: 1,
      stopping: false,
    };
    const sendRequest = vi
      .spyOn(
        manager as unknown as { sendRequest: (...args: unknown[]) => Promise<unknown> },
        "sendRequest",
      )
      .mockResolvedValue({
        turn: { id: "turn-2" },
      });

    (
      manager as unknown as {
        handleServerNotification: (
          context: NotificationHarnessContext,
          notification: { method: string; params?: unknown },
        ) => void;
      }
    ).handleServerNotification(context, {
      method: "turn/completed",
      params: {
        turn: {
          id: "turn-1",
          status: "failed",
          error: {
            message: "model not found",
          },
        },
      },
    });

    await vi.waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith(context, "turn/start", {
        threadId: "thread-1",
        input: [{ type: "text", text: "hello", text_elements: [] }],
        model: "openrouter/free",
      });
      expect(context.pendingOpenRouterTurnRetry?.fallbackAttempted).toBe(true);
    });
  });

  it("does not retry via openrouter/free when a free model returns invalid_prompt", () => {
    const manager = new CodexAppServerManager();
    const context: NotificationHarnessContext = {
      session: {
        provider: "codex",
        status: "running",
        threadId: asThreadId("thread-1"),
        runtimeMode: "full-access",
        model: "qwen/qwen3-235b-a22b:free",
        activeTurnId: TurnId.makeUnsafe("turn-1"),
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
      },
      pending: new Map(),
      pendingApprovals: new Map(),
      pendingUserInputs: new Map(),
      pendingOpenRouterTurnRetry: {
        providerThreadId: asThreadId("thread-1"),
        input: [{ type: "text", text: "hello", text_elements: [] }],
        model: "qwen/qwen3-235b-a22b:free",
        currentTurnId: TurnId.makeUnsafe("turn-1"),
        fallbackAttempted: false,
      },
      nextRequestId: 1,
      stopping: false,
    };

    (
      manager as unknown as {
        handleServerNotification: (
          context: NotificationHarnessContext,
          notification: { method: string; params?: unknown },
        ) => void;
      }
    ).handleServerNotification(context, {
      method: "turn/completed",
      params: {
        turn: {
          id: "turn-1",
          status: "failed",
          error: {
            message:
              '{"error":{"code":"invalid_prompt","message":"Invalid Responses API request"}}',
          },
        },
      },
    });

    expect(context.session.status).toBe("error");
    expect(context.session.lastError).toContain("OpenRouter rejected a Responses API payload");
    expect(context.session.lastError).toContain("qwen/qwen3-235b-a22b:free");
    expect(context.pendingOpenRouterTurnRetry).toBeUndefined();
  });

  it("does not retry via openrouter/free for insufficient credit errors", () => {
    const manager = new CodexAppServerManager();
    const context: NotificationHarnessContext = {
      session: {
        provider: "codex",
        status: "running",
        threadId: asThreadId("thread-1"),
        runtimeMode: "full-access",
        model: "openai/gpt-oss-120b:free",
        activeTurnId: TurnId.makeUnsafe("turn-1"),
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
      },
      pending: new Map(),
      pendingApprovals: new Map(),
      pendingUserInputs: new Map(),
      pendingOpenRouterTurnRetry: {
        providerThreadId: asThreadId("thread-1"),
        input: [{ type: "text", text: "hello", text_elements: [] }],
        model: "openai/gpt-oss-120b:free",
        currentTurnId: TurnId.makeUnsafe("turn-1"),
        fallbackAttempted: false,
      },
      nextRequestId: 1,
      stopping: false,
    };

    (
      manager as unknown as {
        handleServerNotification: (
          context: NotificationHarnessContext,
          notification: { method: string; params?: unknown },
        ) => void;
      }
    ).handleServerNotification(context, {
      method: "turn/completed",
      params: {
        turn: {
          id: "turn-1",
          status: "failed",
          error: {
            message:
              "402 Payment Required: Insufficient credits. This account never purchased credits.",
          },
        },
      },
    });

    expect(context.session.status).toBe("error");
    expect(context.pendingOpenRouterTurnRetry).toBeUndefined();
  });
});

describe("buildCodexAppServerArgs", () => {
  it("keeps plain Codex sessions on the default app-server launch path", () => {
    expect(buildCodexAppServerArgs({ model: "gpt-5.3-codex" })).toEqual(["app-server"]);
  });

  it("injects OpenRouter config overrides for OpenRouter-routed models", () => {
    expect(
      buildCodexAppServerArgs({
        model: "openrouter/free",
      }),
    ).toEqual([
      "app-server",
      "--config",
      'model_providers.openrouter={ name = "OpenRouter", base_url = "https://openrouter.ai/api/v1", env_key = "OPENROUTER_API_KEY" }',
      "--config",
      'model_provider="openrouter"',
      "--config",
      'model="openrouter/free"',
    ]);
  });

  it("respects specific OpenRouter free-model slugs", () => {
    expect(
      buildCodexAppServerArgs({
        model: "google/gemma-3n-e4b-it:free",
      }),
    ).toEqual([
      "app-server",
      "--config",
      'model_providers.openrouter={ name = "OpenRouter", base_url = "https://openrouter.ai/api/v1", env_key = "OPENROUTER_API_KEY" }',
      "--config",
      'model_provider="openrouter"',
      "--config",
      'model="google/gemma-3n-e4b-it:free"',
    ]);
  });
});

describe("buildCodexAppServerEnv", () => {
  it("sets CODEX_HOME without leaking OpenRouter config for native Codex models", () => {
    expect(
      buildCodexAppServerEnv({
        baseEnv: { PATH: "/usr/bin", OPENROUTER_API_KEY: "ambient-secret" },
        homePath: "/tmp/codex-home",
        model: "gpt-5.3-codex",
        openRouterApiKey: "sk-or-secret",
      }),
    ).toEqual({
      PATH: "/usr/bin",
      CODEX_HOME: "/tmp/codex-home",
    });
  });

  it("injects OPENROUTER_API_KEY only for OpenRouter-routed Codex sessions", () => {
    expect(
      buildCodexAppServerEnv({
        baseEnv: { PATH: "/usr/bin" },
        model: "openrouter/free",
        openRouterApiKey: "sk-or-secret",
      }),
    ).toEqual({
      PATH: "/usr/bin",
      OPENROUTER_API_KEY: "sk-or-secret",
    });
  });
});

describe("isRecoverableThreadResumeError", () => {
  it("matches not-found resume errors", () => {
    expect(
      isRecoverableThreadResumeError(new Error("thread/resume failed: thread not found")),
    ).toBe(true);
  });

  it("ignores non-resume errors", () => {
    expect(
      isRecoverableThreadResumeError(new Error("thread/start failed: permission denied")),
    ).toBe(false);
  });

  it("ignores non-recoverable resume errors", () => {
    expect(
      isRecoverableThreadResumeError(
        new Error("thread/resume failed: timed out waiting for server"),
      ),
    ).toBe(false);
  });
});

describe("readCodexAccountSnapshot", () => {
  it("disables spark for chatgpt plus accounts", () => {
    expect(
      readCodexAccountSnapshot({
        type: "chatgpt",
        email: "plus@example.com",
        planType: "plus",
      }),
    ).toEqual({
      type: "chatgpt",
      planType: "plus",
      sparkEnabled: false,
    });
  });

  it("keeps spark enabled for chatgpt pro accounts", () => {
    expect(
      readCodexAccountSnapshot({
        type: "chatgpt",
        email: "pro@example.com",
        planType: "pro",
      }),
    ).toEqual({
      type: "chatgpt",
      planType: "pro",
      sparkEnabled: true,
    });
  });

  it("keeps spark enabled for api key accounts", () => {
    expect(
      readCodexAccountSnapshot({
        type: "apiKey",
      }),
    ).toEqual({
      type: "apiKey",
      planType: null,
      sparkEnabled: true,
    });
  });
});

describe("resolveCodexModelForAccount", () => {
  it("falls back from spark to default for unsupported chatgpt plans", () => {
    expect(
      resolveCodexModelForAccount("gpt-5.3-codex-spark", {
        type: "chatgpt",
        planType: "plus",
        sparkEnabled: false,
      }),
    ).toBe("gpt-5.3-codex");
  });

  it("keeps spark for supported plans", () => {
    expect(
      resolveCodexModelForAccount("gpt-5.3-codex-spark", {
        type: "chatgpt",
        planType: "pro",
        sparkEnabled: true,
      }),
    ).toBe("gpt-5.3-codex-spark");
  });
});

describe("startSession", () => {
  it("enables Codex experimental api capabilities during initialize", () => {
    expect(buildCodexInitializeParams()).toEqual({
      clientInfo: {
        name: "cut3_desktop",
        title: "CUT3 Desktop",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });
  });

  it("emits session/startFailed when resolving cwd throws before process launch", async () => {
    const manager = new CodexAppServerManager();
    const events: Array<{ method: string; kind: string; message?: string }> = [];
    manager.on("event", (event) => {
      events.push({
        method: event.method,
        kind: event.kind,
        ...(event.message ? { message: event.message } : {}),
      });
    });

    const processCwd = vi.spyOn(process, "cwd").mockImplementation(() => {
      throw new Error("cwd missing");
    });
    try {
      await expect(
        manager.startSession({
          threadId: asThreadId("thread-1"),
          provider: "codex",
          runtimeMode: "full-access",
        }),
      ).rejects.toThrow("cwd missing");
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        method: "session/startFailed",
        kind: "error",
        message: "cwd missing",
      });
    } finally {
      processCwd.mockRestore();
      manager.stopAll();
    }
  });

  it("fails fast with an upgrade message when codex is below the minimum supported version", async () => {
    const manager = new CodexAppServerManager();
    const events: Array<{ method: string; kind: string; message?: string }> = [];
    manager.on("event", (event) => {
      events.push({
        method: event.method,
        kind: event.kind,
        ...(event.message ? { message: event.message } : {}),
      });
    });

    const versionCheck = vi
      .spyOn(
        manager as unknown as {
          assertSupportedCodexCliVersion: (input: {
            binaryPath: string;
            cwd: string;
            homePath?: string;
          }) => void;
        },
        "assertSupportedCodexCliVersion",
      )
      .mockImplementation(() => {
        throw new Error(
          "Codex CLI v0.36.0 is too old for CUT3. Upgrade to v0.37.0 or newer and restart CUT3.",
        );
      });

    try {
      await expect(
        manager.startSession({
          threadId: asThreadId("thread-1"),
          provider: "codex",
          runtimeMode: "full-access",
        }),
      ).rejects.toThrow(
        "Codex CLI v0.36.0 is too old for CUT3. Upgrade to v0.37.0 or newer and restart CUT3.",
      );
      expect(versionCheck).toHaveBeenCalledTimes(1);
      expect(events).toEqual([
        {
          method: "session/startFailed",
          kind: "error",
          message:
            "Codex CLI v0.36.0 is too old for CUT3. Upgrade to v0.37.0 or newer and restart CUT3.",
        },
      ]);
    } finally {
      versionCheck.mockRestore();
      manager.stopAll();
    }
  });

  it("fails fast with the underlying stderr when codex exits during initialize", async () => {
    const manager = new CodexAppServerManager();
    const events: Array<{ method: string; kind: string; message?: string }> = [];
    manager.on("event", (event) => {
      events.push({
        method: event.method,
        kind: event.kind,
        ...(event.message ? { message: event.message } : {}),
      });
    });

    const tempDir = mkdtempSync(path.join(os.tmpdir(), "cut3-codex-failfast-"));
    const fakeBinaryPath = path.join(tempDir, "fake-codex");
    writeFileSync(
      fakeBinaryPath,
      "#!/usr/bin/env bash\nprintf 'error: fake cli failure\\n' >&2\nsleep 0.1\nexit 2\n",
      "utf8",
    );
    chmodSync(fakeBinaryPath, 0o755);

    const versionCheck = vi
      .spyOn(
        manager as unknown as {
          assertSupportedCodexCliVersion: (input: {
            binaryPath: string;
            cwd: string;
            homePath?: string;
          }) => void;
        },
        "assertSupportedCodexCliVersion",
      )
      .mockImplementation(() => undefined);

    const startedAt = Date.now();
    try {
      await expect(
        manager.startSession({
          threadId: asThreadId("thread-fail-fast"),
          provider: "codex",
          runtimeMode: "full-access",
          providerOptions: {
            codex: {
              binaryPath: fakeBinaryPath,
            },
          },
        }),
      ).rejects.toThrow("error: fake cli failure");
      expect(Date.now() - startedAt).toBeLessThan(2_000);
      expect(events).toEqual(
        expect.arrayContaining([
          {
            method: "session/connecting",
            kind: "session",
            message: "Starting codex app-server",
          },
          {
            method: "process/stderr",
            kind: "error",
            message: "error: fake cli failure",
          },
          {
            method: "session/exited",
            kind: "session",
            message: "codex app-server exited (code=2, signal=null).",
          },
          {
            method: "session/startFailed",
            kind: "error",
            message: "error: fake cli failure",
          },
        ]),
      );
    } finally {
      versionCheck.mockRestore();
      manager.stopAll();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("sendTurn", () => {
  it("sends text and image user input items to turn/start", async () => {
    const { manager, context, requireSession, sendRequest, updateSession } =
      createSendTurnHarness();

    const result = await manager.sendTurn({
      threadId: asThreadId("thread_1"),
      input: "Inspect this image",
      attachments: [
        {
          type: "image",
          url: "data:image/png;base64,AAAA",
        },
      ],
      model: "gpt-5.3",
      serviceTier: "fast",
      effort: "high",
    });

    expect(result).toEqual({
      threadId: "thread_1",
      turnId: "turn_1",
      resumeCursor: { threadId: "thread_1" },
    });
    expect(requireSession).toHaveBeenCalledWith("thread_1");
    expect(sendRequest).toHaveBeenCalledWith(context, "turn/start", {
      threadId: "thread_1",
      input: [
        {
          type: "text",
          text: "Inspect this image",
          text_elements: [],
        },
        {
          type: "image",
          url: "data:image/png;base64,AAAA",
        },
      ],
      model: "gpt-5.3-codex",
      serviceTier: "fast",
      effort: "high",
    });
    expect(updateSession).toHaveBeenCalledWith(context, {
      status: "running",
      activeTurnId: "turn_1",
      resumeCursor: { threadId: "thread_1" },
    });
  });

  it("supports image-only turns", async () => {
    const { manager, context, sendRequest } = createSendTurnHarness();

    await manager.sendTurn({
      threadId: asThreadId("thread_1"),
      attachments: [
        {
          type: "image",
          url: "data:image/png;base64,BBBB",
        },
      ],
    });

    expect(sendRequest).toHaveBeenCalledWith(context, "turn/start", {
      threadId: "thread_1",
      input: [
        {
          type: "image",
          url: "data:image/png;base64,BBBB",
        },
      ],
      model: "gpt-5.3-codex",
    });
  });

  it("passes Codex plan mode as a collaboration preset on turn/start", async () => {
    const { manager, context, sendRequest } = createSendTurnHarness();

    await manager.sendTurn({
      threadId: asThreadId("thread_1"),
      input: "Plan the work",
      interactionMode: "plan",
    });

    expect(sendRequest).toHaveBeenCalledWith(context, "turn/start", {
      threadId: "thread_1",
      input: [
        {
          type: "text",
          text: "Plan the work",
          text_elements: [],
        },
      ],
      model: "gpt-5.3-codex",
      collaborationMode: {
        mode: "plan",
        settings: {
          model: "gpt-5.3-codex",
          reasoning_effort: null,
          developer_instructions: CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
        },
      },
    });
  });

  it("passes Codex default mode as a collaboration preset on turn/start", async () => {
    const { manager, context, sendRequest } = createSendTurnHarness();

    await manager.sendTurn({
      threadId: asThreadId("thread_1"),
      input: "PLEASE IMPLEMENT THIS PLAN:\n- step 1",
      interactionMode: "default",
    });

    expect(sendRequest).toHaveBeenCalledWith(context, "turn/start", {
      threadId: "thread_1",
      input: [
        {
          type: "text",
          text: "PLEASE IMPLEMENT THIS PLAN:\n- step 1",
          text_elements: [],
        },
      ],
      model: "gpt-5.3-codex",
      collaborationMode: {
        mode: "default",
        settings: {
          model: "gpt-5.3-codex",
          reasoning_effort: null,
          developer_instructions: CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
        },
      },
    });
  });

  it("does not send Codex collaboration presets for OpenRouter models", async () => {
    const { manager, context, sendRequest } = createSendTurnHarness();
    context.session.model = "openai/gpt-oss-120b:free";

    await manager.sendTurn({
      threadId: asThreadId("thread_1"),
      input: "PLEASE IMPLEMENT THIS PLAN:\n- step 1",
      interactionMode: "default",
    });

    expect(sendRequest).toHaveBeenCalledWith(context, "turn/start", {
      threadId: "thread_1",
      input: [
        {
          type: "text",
          text: "PLEASE IMPLEMENT THIS PLAN:\n- step 1",
          text_elements: [],
        },
      ],
      model: "openai/gpt-oss-120b:free",
    });
  });

  it("retries specific free OpenRouter models via openrouter/free on routing failures", async () => {
    const { manager, context, sendRequest, updateSession } = createSendTurnHarness();
    context.session.model = "openai/gpt-oss-120b:free";
    const events: Array<{ method: string; payload?: unknown; turnId?: string }> = [];
    manager.on("event", (event) => {
      events.push({
        method: event.method,
        ...(event.payload !== undefined ? { payload: event.payload } : {}),
        ...(event.turnId ? { turnId: event.turnId } : {}),
      });
    });
    sendRequest
      .mockRejectedValueOnce(
        new Error(
          "unexpected status 404 Not Found: No endpoints available matching your guardrail restrictions and data policy",
        ),
      )
      .mockResolvedValueOnce({
        turn: {
          id: "turn_1",
        },
      });

    const result = await manager.sendTurn({
      threadId: asThreadId("thread_1"),
      input: "hello",
      interactionMode: "default",
      effort: "high",
    });

    expect(result).toEqual({
      threadId: "thread_1",
      turnId: "turn_1",
      resumeCursor: { threadId: "thread_1" },
    });
    expect(sendRequest).toHaveBeenNthCalledWith(1, context, "turn/start", {
      threadId: "thread_1",
      input: [
        {
          type: "text",
          text: "hello",
          text_elements: [],
        },
      ],
      model: "openai/gpt-oss-120b:free",
      effort: "high",
    });
    expect(sendRequest).toHaveBeenNthCalledWith(2, context, "turn/start", {
      threadId: "thread_1",
      input: [
        {
          type: "text",
          text: "hello",
          text_elements: [],
        },
      ],
      model: "openrouter/free",
    });
    expect(updateSession).toHaveBeenCalledWith(context, {
      status: "running",
      activeTurnId: "turn_1",
      resumeCursor: { threadId: "thread_1" },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        {
          method: "model/rerouted",
          turnId: "turn_1",
          payload: {
            fromModel: "openai/gpt-oss-120b:free",
            toModel: "openrouter/free",
            reason:
              "unexpected status 404 Not Found: No endpoints available matching your guardrail restrictions and data policy",
          },
        },
      ]),
    );
  });

  it("keeps the session model when interaction mode is set without an explicit model", async () => {
    const { manager, context, sendRequest } = createSendTurnHarness();
    context.session.model = "gpt-5.2-codex";

    await manager.sendTurn({
      threadId: asThreadId("thread_1"),
      input: "Plan this with my current session model",
      interactionMode: "plan",
    });

    expect(sendRequest).toHaveBeenCalledWith(context, "turn/start", {
      threadId: "thread_1",
      input: [
        {
          type: "text",
          text: "Plan this with my current session model",
          text_elements: [],
        },
      ],
      model: "gpt-5.2-codex",
      collaborationMode: {
        mode: "plan",
        settings: {
          model: "gpt-5.2-codex",
          reasoning_effort: null,
          developer_instructions: CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
        },
      },
    });
  });

  it("rejects empty turn input", async () => {
    const { manager } = createSendTurnHarness();

    await expect(
      manager.sendTurn({
        threadId: asThreadId("thread_1"),
      }),
    ).rejects.toThrow("Turn input must include text or attachments.");
  });
});

describe("thread checkpoint control", () => {
  it("reads thread turns from thread/read", async () => {
    const { manager, context, requireSession, sendRequest } = createThreadControlHarness();
    sendRequest.mockResolvedValue({
      thread: {
        id: "thread_1",
        turns: [
          {
            id: "turn_1",
            items: [{ type: "userMessage", content: [{ type: "text", text: "hello" }] }],
          },
        ],
      },
    });

    const result = await manager.readThread(asThreadId("thread_1"));

    expect(requireSession).toHaveBeenCalledWith("thread_1");
    expect(sendRequest).toHaveBeenCalledWith(context, "thread/read", {
      threadId: "thread_1",
      includeTurns: true,
    });
    expect(result).toEqual({
      threadId: "thread_1",
      turns: [
        {
          id: "turn_1",
          items: [{ type: "userMessage", content: [{ type: "text", text: "hello" }] }],
        },
      ],
    });
  });

  it("reads thread turns from flat thread/read responses", async () => {
    const { manager, context, sendRequest } = createThreadControlHarness();
    sendRequest.mockResolvedValue({
      threadId: "thread_1",
      turns: [
        {
          id: "turn_1",
          items: [{ type: "userMessage", content: [{ type: "text", text: "hello" }] }],
        },
      ],
    });

    const result = await manager.readThread(asThreadId("thread_1"));

    expect(sendRequest).toHaveBeenCalledWith(context, "thread/read", {
      threadId: "thread_1",
      includeTurns: true,
    });
    expect(result).toEqual({
      threadId: "thread_1",
      turns: [
        {
          id: "turn_1",
          items: [{ type: "userMessage", content: [{ type: "text", text: "hello" }] }],
        },
      ],
    });
  });

  it("rolls back turns via thread/rollback and resets session running state", async () => {
    const { manager, context, sendRequest, updateSession } = createThreadControlHarness();
    sendRequest.mockResolvedValue({
      thread: {
        id: "thread_1",
        turns: [],
      },
    });

    const result = await manager.rollbackThread(asThreadId("thread_1"), 2);

    expect(sendRequest).toHaveBeenCalledWith(context, "thread/rollback", {
      threadId: "thread_1",
      numTurns: 2,
    });
    expect(updateSession).toHaveBeenCalledWith(context, {
      status: "ready",
      activeTurnId: undefined,
    });
    expect(result).toEqual({
      threadId: "thread_1",
      turns: [],
    });
  });
});

describe("respondToUserInput", () => {
  it("serializes canonical answers to Codex native answer objects", async () => {
    const { manager, context, requireSession, writeMessage, emitEvent } =
      createPendingUserInputHarness();

    await manager.respondToUserInput(
      asThreadId("thread_1"),
      ApprovalRequestId.makeUnsafe("req-user-input-1"),
      {
        scope: "All request methods",
        compat: "Keep current envelope",
      },
    );

    expect(requireSession).toHaveBeenCalledWith("thread_1");
    expect(writeMessage).toHaveBeenCalledWith(context, {
      id: 42,
      result: {
        answers: {
          scope: { answers: ["All request methods"] },
          compat: { answers: ["Keep current envelope"] },
        },
      },
    });
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "item/tool/requestUserInput/answered",
        payload: {
          requestId: "req-user-input-1",
          answers: {
            scope: { answers: ["All request methods"] },
            compat: { answers: ["Keep current envelope"] },
          },
        },
      }),
    );
  });

  it("preserves explicit empty multi-select answers", async () => {
    const { manager, context, requireSession, writeMessage, emitEvent } =
      createPendingUserInputHarness();

    await manager.respondToUserInput(
      asThreadId("thread_1"),
      ApprovalRequestId.makeUnsafe("req-user-input-1"),
      {
        scope: [],
      },
    );

    expect(requireSession).toHaveBeenCalledWith("thread_1");
    expect(writeMessage).toHaveBeenCalledWith(context, {
      id: 42,
      result: {
        answers: {
          scope: { answers: [] },
        },
      },
    });
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "item/tool/requestUserInput/answered",
        payload: {
          requestId: "req-user-input-1",
          answers: {
            scope: { answers: [] },
          },
        },
      }),
    );
  });

  it("tracks file-read approval requests with the correct method", () => {
    const manager = new CodexAppServerManager();
    const context = {
      session: {
        sessionId: "sess_1",
        provider: "codex",
        status: "ready",
        threadId: asThreadId("thread_1"),
        resumeCursor: { threadId: "thread_1" },
        createdAt: "2026-02-10T00:00:00.000Z",
        updatedAt: "2026-02-10T00:00:00.000Z",
      },
      pendingApprovals: new Map(),
      pendingUserInputs: new Map(),
    };
    type ApprovalRequestContext = {
      session: typeof context.session;
      pendingApprovals: typeof context.pendingApprovals;
      pendingUserInputs: typeof context.pendingUserInputs;
    };

    (
      manager as unknown as {
        handleServerRequest: (
          context: ApprovalRequestContext,
          request: Record<string, unknown>,
        ) => void;
      }
    ).handleServerRequest(context, {
      jsonrpc: "2.0",
      id: 42,
      method: "item/fileRead/requestApproval",
      params: {},
    });

    const request = Array.from(context.pendingApprovals.values())[0];
    expect(request?.requestKind).toBe("file-read");
    expect(request?.method).toBe("item/fileRead/requestApproval");
  });
});

describe.skipIf(!process.env.CODEX_BINARY_PATH)("startSession live Codex resume", () => {
  it("keeps prior thread history when resuming with a changed runtime mode", async () => {
    const workspaceDir = mkdtempSync(path.join(os.tmpdir(), "codex-live-resume-"));
    writeFileSync(path.join(workspaceDir, "README.md"), "hello\n", "utf8");

    const manager = new CodexAppServerManager();

    try {
      const firstSession = await manager.startSession({
        threadId: asThreadId("thread-live"),
        provider: "codex",
        cwd: workspaceDir,
        runtimeMode: "full-access",
        providerOptions: {
          codex: {
            ...(process.env.CODEX_BINARY_PATH ? { binaryPath: process.env.CODEX_BINARY_PATH } : {}),
            ...(process.env.CODEX_HOME_PATH ? { homePath: process.env.CODEX_HOME_PATH } : {}),
          },
        },
      });

      const firstTurn = await manager.sendTurn({
        threadId: firstSession.threadId,
        input: `Reply with exactly the word ALPHA ${randomUUID()}`,
      });

      expect(firstTurn.threadId).toBe(firstSession.threadId);

      await vi.waitFor(
        async () => {
          const snapshot = await manager.readThread(firstSession.threadId);
          expect(snapshot.turns.length).toBeGreaterThan(0);
        },
        { timeout: 120_000, interval: 1_000 },
      );

      const firstSnapshot = await manager.readThread(firstSession.threadId);
      const originalThreadId = firstSnapshot.threadId;
      const originalTurnCount = firstSnapshot.turns.length;

      manager.stopSession(firstSession.threadId);

      const resumedSession = await manager.startSession({
        threadId: firstSession.threadId,
        provider: "codex",
        cwd: workspaceDir,
        runtimeMode: "approval-required",
        resumeCursor: firstSession.resumeCursor,
        providerOptions: {
          codex: {
            ...(process.env.CODEX_BINARY_PATH ? { binaryPath: process.env.CODEX_BINARY_PATH } : {}),
            ...(process.env.CODEX_HOME_PATH ? { homePath: process.env.CODEX_HOME_PATH } : {}),
          },
        },
      });

      expect(resumedSession.threadId).toBe(originalThreadId);

      const resumedSnapshotBeforeTurn = await manager.readThread(resumedSession.threadId);
      expect(resumedSnapshotBeforeTurn.threadId).toBe(originalThreadId);
      expect(resumedSnapshotBeforeTurn.turns.length).toBeGreaterThanOrEqual(originalTurnCount);

      await manager.sendTurn({
        threadId: resumedSession.threadId,
        input: `Reply with exactly the word BETA ${randomUUID()}`,
      });

      await vi.waitFor(
        async () => {
          const snapshot = await manager.readThread(resumedSession.threadId);
          expect(snapshot.turns.length).toBeGreaterThan(originalTurnCount);
        },
        { timeout: 120_000, interval: 1_000 },
      );
    } finally {
      manager.stopAll();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 180_000);
});
