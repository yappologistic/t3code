import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import { ProviderSendTurnInput, ProviderSessionStartInput } from "./provider";

const decodeProviderSessionStartInput = Schema.decodeUnknownSync(ProviderSessionStartInput);
const decodeProviderSendTurnInput = Schema.decodeUnknownSync(ProviderSendTurnInput);

describe("ProviderSessionStartInput", () => {
  it("accepts codex-compatible payloads", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "codex",
      cwd: "/tmp/workspace",
      model: "gpt-5.3-codex",
      modelOptions: {
        codex: {
          reasoningEffort: "high",
          fastMode: true,
        },
      },
      runtimeMode: "full-access",
      providerOptions: {
        codex: {
          binaryPath: "/usr/local/bin/codex",
          homePath: "/tmp/.codex",
          openRouterApiKey: "sk-or-test",
        },
      },
    });
    expect(parsed.runtimeMode).toBe("full-access");
    expect(parsed.modelOptions?.codex?.reasoningEffort).toBe("high");
    expect(parsed.modelOptions?.codex?.fastMode).toBe(true);
    expect(parsed.providerOptions?.codex?.binaryPath).toBe("/usr/local/bin/codex");
    expect(parsed.providerOptions?.codex?.homePath).toBe("/tmp/.codex");
    expect(parsed.providerOptions?.codex?.openRouterApiKey).toBe("sk-or-test");
  });

  it("accepts copilot-compatible payloads", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "copilot",
      cwd: "/tmp/workspace",
      model: "claude-sonnet-4.5",
      runtimeMode: "approval-required",
      modelOptions: {
        copilot: {
          reasoningEffort: "xhigh",
        },
      },
      providerOptions: {
        copilot: {
          binaryPath: "/usr/local/bin/copilot",
        },
      },
    });

    expect(parsed.provider).toBe("copilot");
    expect(parsed.model).toBe("claude-sonnet-4.5");
    expect(parsed.modelOptions?.copilot?.reasoningEffort).toBe("xhigh");
    expect(parsed.providerOptions?.copilot?.binaryPath).toBe("/usr/local/bin/copilot");
  });

  it("accepts kimi-compatible payloads", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "kimi",
      cwd: "/tmp/workspace",
      model: "kimi-for-coding",
      runtimeMode: "approval-required",
      providerOptions: {
        kimi: {
          binaryPath: "/usr/local/bin/kimi",
        },
      },
    });

    expect(parsed.provider).toBe("kimi");
    expect(parsed.model).toBe("kimi-for-coding");
    expect(parsed.providerOptions?.kimi?.binaryPath).toBe("/usr/local/bin/kimi");
  });

  it("accepts opencode-compatible payloads with an OpenRouter override", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "opencode",
      cwd: "/tmp/workspace",
      model: "minimax-coding-plan/MiniMax-M2.7",
      runtimeMode: "approval-required",
      providerOptions: {
        opencode: {
          binaryPath: "/usr/local/bin/opencode",
          openRouterApiKey: "sk-or-test",
        },
      },
    });

    expect(parsed.provider).toBe("opencode");
    expect(parsed.model).toBe("minimax-coding-plan/MiniMax-M2.7");
    expect(parsed.providerOptions?.opencode?.binaryPath).toBe("/usr/local/bin/opencode");
    expect(parsed.providerOptions?.opencode?.openRouterApiKey).toBe("sk-or-test");
  });

  it("accepts pi-compatible payloads without provider-specific overrides", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "pi",
      cwd: "/tmp/workspace",
      model: "pi/default",
      runtimeMode: "approval-required",
      modelOptions: {
        pi: {
          thinkingLevel: "minimal",
        },
      },
    });

    expect(parsed.provider).toBe("pi");
    expect(parsed.model).toBe("pi/default");
    expect(parsed.modelOptions?.pi?.thinkingLevel).toBe("minimal");
    expect(parsed.providerOptions).toBeUndefined();
  });

  it("accepts authenticated Pi provider/model ids in session-start payloads", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "pi",
      cwd: "/tmp/workspace",
      model: "github-copilot/claude-sonnet-4.5",
      runtimeMode: "approval-required",
    });

    expect(parsed.provider).toBe("pi");
    expect(parsed.model).toBe("github-copilot/claude-sonnet-4.5");
  });

  it("rejects payloads without runtime mode", () => {
    expect(() =>
      decodeProviderSessionStartInput({
        threadId: "thread-1",
        provider: "codex",
      }),
    ).toThrow();
  });
});

describe("ProviderSendTurnInput", () => {
  it("accepts provider-scoped model options", () => {
    const parsed = decodeProviderSendTurnInput({
      threadId: "thread-1",
      model: "gpt-5.3-codex",
      modelOptions: {
        codex: {
          reasoningEffort: "xhigh",
          fastMode: true,
        },
      },
    });

    expect(parsed.model).toBe("gpt-5.3-codex");
    expect(parsed.modelOptions?.codex?.reasoningEffort).toBe("xhigh");
    expect(parsed.modelOptions?.codex?.fastMode).toBe(true);
  });

  it("accepts copilot xhigh reasoning values", () => {
    const parsed = decodeProviderSendTurnInput({
      threadId: "thread-1",
      model: "claude-sonnet-4.6",
      modelOptions: {
        copilot: {
          reasoningEffort: "xhigh",
        },
      },
    });

    expect(parsed.modelOptions?.copilot?.reasoningEffort).toBe("xhigh");
  });

  it("accepts Pi thinking-level overrides", () => {
    const parsed = decodeProviderSendTurnInput({
      threadId: "thread-1",
      model: "openai/gpt-5.4",
      modelOptions: {
        pi: {
          thinkingLevel: "xhigh",
        },
      },
    });

    expect(parsed.modelOptions?.pi?.thinkingLevel).toBe("xhigh");
  });
});
