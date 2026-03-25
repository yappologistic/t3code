import { describe, expect, it } from "vitest";

import { type ServerProviderStatus } from "@t3tools/contracts";

import {
  findProviderStatus,
  getDefaultProviderStatusMessage,
  getProviderDisplayLabel,
  getProviderStatusModelOptions,
  getProviderStatusTitle,
  resolveProviderStatusForChat,
  resolveVisibleProviderStatusForChat,
} from "./providerStatus";

const PROVIDER_STATUSES: ServerProviderStatus[] = [
  {
    provider: "codex",
    status: "ready",
    available: true,
    authStatus: "authenticated",
    checkedAt: "2026-03-08T00:00:00.000Z",
  },
  {
    provider: "copilot",
    status: "warning",
    available: true,
    authStatus: "unknown",
    checkedAt: "2026-03-08T00:00:00.000Z",
    message: "Copilot warning",
  },
  {
    provider: "kimi",
    status: "error",
    available: false,
    authStatus: "unknown",
    checkedAt: "2026-03-08T00:00:00.000Z",
    message: "Kimi Code CLI (`kimi`) is not installed or not on PATH.",
  },
  {
    provider: "pi",
    status: "warning",
    available: true,
    authStatus: "unauthenticated",
    checkedAt: "2026-03-08T00:00:00.000Z",
    message: "Pi needs auth.",
    availableModels: [
      {
        slug: "openai/gpt-5.4",
        name: "GPT-5.4",
        supportsReasoning: true,
        supportsImageInput: true,
        contextWindowTokens: 1_000_000,
      },
      { slug: "openai/gpt-5.4", name: "GPT-5.4" },
      {
        slug: "github-copilot/claude-sonnet-4.5",
        name: "Claude Sonnet 4.5",
        supportsReasoning: true,
      },
    ],
  },
];

describe("findProviderStatus", () => {
  it("returns the matching provider status", () => {
    expect(findProviderStatus(PROVIDER_STATUSES, "kimi")).toEqual(PROVIDER_STATUSES[2]);
  });
});

describe("provider status labels", () => {
  it("formats friendly labels and fallback banner copy for pi", () => {
    expect(getProviderDisplayLabel("pi")).toBe("Pi");
    expect(getProviderStatusTitle("pi")).toBe("Pi provider status");
    expect(getDefaultProviderStatusMessage(PROVIDER_STATUSES[3]!)).toBe(
      "Pi provider has limited availability.",
    );
  });

  it("returns de-duplicated provider-status model options", () => {
    expect(getProviderStatusModelOptions(PROVIDER_STATUSES[3]!)).toEqual([
      {
        slug: "openai/gpt-5.4",
        name: "GPT-5.4",
        supportsReasoning: true,
        supportsImageInput: true,
        contextWindowTokens: 1_000_000,
      },
      {
        slug: "github-copilot/claude-sonnet-4.5",
        name: "Claude Sonnet 4.5",
        supportsReasoning: true,
      },
    ]);
  });
});

describe("resolveProviderStatusForChat", () => {
  it("uses the selected provider before a session has started", () => {
    expect(
      resolveProviderStatusForChat({
        providerStatuses: PROVIDER_STATUSES,
        selectedProvider: "kimi",
        sessionProvider: null,
      }),
    ).toEqual(PROVIDER_STATUSES[2]);
  });

  it("prefers the active session provider once a session exists", () => {
    expect(
      resolveProviderStatusForChat({
        providerStatuses: PROVIDER_STATUSES,
        selectedProvider: "kimi",
        sessionProvider: "copilot",
      }),
    ).toEqual(PROVIDER_STATUSES[1]);
  });

  it("recognizes pi as a session provider", () => {
    expect(
      resolveProviderStatusForChat({
        providerStatuses: PROVIDER_STATUSES,
        selectedProvider: "codex",
        sessionProvider: "pi",
      }),
    ).toEqual(PROVIDER_STATUSES[3]);
  });
});

describe("resolveVisibleProviderStatusForChat", () => {
  it("keeps the provider warning before a matching session starts", () => {
    expect(
      resolveVisibleProviderStatusForChat({
        providerStatuses: PROVIDER_STATUSES,
        selectedProvider: "kimi",
        sessionProvider: null,
        sessionStatus: null,
      }),
    ).toEqual(PROVIDER_STATUSES[2]);
  });

  it("hides stale provider warnings once the matching session is ready", () => {
    expect(
      resolveVisibleProviderStatusForChat({
        providerStatuses: PROVIDER_STATUSES,
        selectedProvider: "kimi",
        sessionProvider: "kimi",
        sessionStatus: "ready",
      }),
    ).toBeNull();
  });

  it("keeps warnings visible when the matching session is closed or failed", () => {
    expect(
      resolveVisibleProviderStatusForChat({
        providerStatuses: PROVIDER_STATUSES,
        selectedProvider: "kimi",
        sessionProvider: "kimi",
        sessionStatus: "stopped",
      }),
    ).toEqual(PROVIDER_STATUSES[2]);
    expect(
      resolveVisibleProviderStatusForChat({
        providerStatuses: PROVIDER_STATUSES,
        selectedProvider: "kimi",
        sessionProvider: "kimi",
        sessionStatus: "error",
      }),
    ).toEqual(PROVIDER_STATUSES[2]);
  });

  it("keeps Codex status visible for OpenRouter-routed chats", () => {
    const codexWarningStatus: ServerProviderStatus[] = [
      {
        provider: "codex",
        status: "warning",
        available: true,
        authStatus: "unknown",
        checkedAt: "2026-03-08T00:00:00.000Z",
        message: "Codex warning",
      },
    ];

    expect(
      resolveVisibleProviderStatusForChat({
        providerStatuses: codexWarningStatus,
        selectedProvider: "codex",
        sessionProvider: "codex",
        sessionStatus: "ready",
        selectedModelUsesOpenRouter: true,
      }),
    ).toEqual(codexWarningStatus[0]);
  });
});
