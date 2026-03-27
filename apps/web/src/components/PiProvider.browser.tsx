import "../index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ProviderKind, type ServerProviderStatus } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { ProviderModelPicker } from "./chat/ProviderModelPicker";
import { ProviderSetupDialog } from "./ChatView";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
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

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Pi provider GUI", () => {
  it("shows Pi guidance in the connect-provider dialog", async () => {
    const queryClient = createQueryClient();
    const providerStatuses: ServerProviderStatus[] = [
      {
        provider: "codex",
        status: "ready",
        available: true,
        authStatus: "authenticated",
        checkedAt: "2026-03-24T00:00:00.000Z",
      },
      {
        provider: "pi",
        status: "warning",
        available: true,
        authStatus: "unauthenticated",
        checkedAt: "2026-03-24T00:00:00.000Z",
        message:
          "Pi is embedded in CUT3, but no authenticated Pi-backed models are currently available.",
      },
    ];

    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <ProviderSetupDialog
          open
          onOpenChange={() => undefined}
          language="en"
          providerStatuses={providerStatuses}
          openCodeState={null}
          hasOpenRouterApiKey={false}
          hasKimiApiKey={false}
          codexBinaryPath=""
          copilotBinaryPath=""
          opencodeBinaryPath=""
          kimiBinaryPath=""
          isRefreshing={false}
          onRefresh={() => undefined}
          onOpenOpenRouterKeyDialog={() => undefined}
          onOpenKimiKeyDialog={() => undefined}
          onOpenManageModels={() => undefined}
          onOpenSettings={() => undefined}
        />
      </QueryClientProvider>,
    );

    try {
      const piCard = await waitForElement(
        () =>
          Array.from(document.querySelectorAll<HTMLElement>("div, section")).find((element) =>
            (element.textContent ?? "").includes("CUT3 embeds Pi through its Node SDK"),
          ) ?? null,
        "Unable to find the Pi guidance card in the provider setup dialog.",
      );

      expect(piCard.textContent).toContain("Pi");
      expect(piCard.textContent).toContain("CUT3 embeds Pi through its Node SDK");
      expect(piCard.textContent).toContain("bunx pi");
    } finally {
      await screen.unmount();
      queryClient.clear();
    }
  });

  it("lists Pi models in the provider picker and switches by provider/model id", async () => {
    const queryClient = createQueryClient();
    const onProviderModelChange = vi.fn();
    const modelOptionsByProvider: Record<
      ProviderKind,
      ReadonlyArray<{ slug: string; name: string; supportsReasoning?: boolean }>
    > = {
      codex: [{ slug: "gpt-5.4", name: "GPT-5.4" }],
      copilot: [{ slug: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" }],
      kimi: [{ slug: "kimi-for-coding", name: "Kimi for Coding" }],
      opencode: [{ slug: "opencode/default", name: "Default" }],
      pi: [
        { slug: "pi/default", name: "Default" },
        {
          slug: "github-copilot/claude-sonnet-4.5",
          name: "github-copilot/claude-sonnet-4.5",
          supportsReasoning: true,
        },
      ],
    };

    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <ProviderModelPicker
          activeThread={null}
          provider="pi"
          providerPickerKind="pi"
          language="en"
          model="pi/default"
          lockedProvider={null}
          allModelOptionsByProvider={modelOptionsByProvider}
          visibleModelOptionsByProvider={modelOptionsByProvider}
          openRouterModelOptions={[]}
          opencodeModelOptions={[]}
          openRouterContextLengthsBySlug={new Map()}
          opencodeContextLengthsBySlug={new Map()}
          serviceTierSetting="auto"
          hasHiddenModels={false}
          favoriteModelsByProvider={{ codex: [], copilot: [], kimi: [], opencode: [], pi: [] }}
          recentModelsByProvider={{ codex: [], copilot: [], kimi: [], opencode: [], pi: [] }}
          onOpenProviderSetup={() => undefined}
          onOpenManageModels={() => undefined}
          onOpenUsageDashboard={() => undefined}
          onProviderModelChange={onProviderModelChange}
        />
      </QueryClientProvider>,
    );

    try {
      const trigger = await waitForElement(
        () =>
          document.querySelector<HTMLButtonElement>(
            '[data-chat-composer-control="provider-picker"]',
          ),
        "Unable to find the Pi provider picker trigger.",
      );
      trigger.click();

      const piSection = await waitForElement(
        () =>
          Array.from(document.querySelectorAll<HTMLElement>("section")).find((section) =>
            (section.textContent ?? "").includes(
              "Pi agent harness sessions discovered from your local Pi auth/config using provider/model ids.",
            ),
          ) ?? null,
        "Unable to find the Pi provider section in the provider picker.",
      );

      expect(piSection.textContent).toContain("Pi");
      expect(piSection.textContent).toContain("github-copilot/claude-sonnet-4.5");

      const modelButton = await waitForElement(
        () =>
          Array.from(piSection.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
            (button.textContent ?? "").includes("github-copilot/claude-sonnet-4.5"),
          ) ?? null,
        "Unable to find the Pi model button.",
      );
      expect(modelButton.querySelector('[title="Supports reasoning"]')).toBeTruthy();
      modelButton.click();

      expect(onProviderModelChange).toHaveBeenCalledWith("pi", "github-copilot/claude-sonnet-4.5");
    } finally {
      await screen.unmount();
      queryClient.clear();
    }
  });

  it("uses an authenticated-model summary label and hides pi/default when Pi models are preloaded", async () => {
    const queryClient = createQueryClient();
    const onProviderModelChange = vi.fn();
    const allModelOptionsByProvider = {
      codex: [{ slug: "gpt-5.4", name: "GPT-5.4" }],
      copilot: [{ slug: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" }],
      kimi: [{ slug: "kimi-for-coding", name: "Kimi for Coding" }],
      opencode: [{ slug: "opencode/default", name: "Default" }],
      pi: [
        { slug: "pi/default", name: "Default" },
        { slug: "openai/gpt-5.4", name: "GPT-5.4" },
        {
          slug: "github-copilot/claude-sonnet-4.5",
          name: "Claude Sonnet 4.5",
        },
      ],
    } satisfies Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>>;
    const visibleModelOptionsByProvider = {
      ...allModelOptionsByProvider,
      pi: [
        { slug: "openai/gpt-5.4", name: "GPT-5.4" },
        {
          slug: "github-copilot/claude-sonnet-4.5",
          name: "Claude Sonnet 4.5",
        },
      ],
    } satisfies Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>>;

    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <ProviderModelPicker
          activeThread={null}
          provider="pi"
          providerPickerKind="pi"
          language="en"
          model="pi/default"
          modelLabelOverride="2 authenticated models"
          lockedProvider={null}
          allModelOptionsByProvider={allModelOptionsByProvider}
          visibleModelOptionsByProvider={visibleModelOptionsByProvider}
          openRouterModelOptions={[]}
          opencodeModelOptions={[]}
          openRouterContextLengthsBySlug={new Map()}
          opencodeContextLengthsBySlug={new Map()}
          serviceTierSetting="auto"
          hasHiddenModels={false}
          favoriteModelsByProvider={{ codex: [], copilot: [], kimi: [], opencode: [], pi: [] }}
          recentModelsByProvider={{ codex: [], copilot: [], kimi: [], opencode: [], pi: [] }}
          onOpenProviderSetup={() => undefined}
          onOpenManageModels={() => undefined}
          onOpenUsageDashboard={() => undefined}
          onProviderModelChange={onProviderModelChange}
        />
      </QueryClientProvider>,
    );

    try {
      const trigger = await waitForElement(
        () =>
          document.querySelector<HTMLButtonElement>(
            '[data-chat-composer-control="provider-picker"]',
          ),
        "Unable to find the Pi provider picker trigger.",
      );

      expect(trigger.textContent).toContain("2 authenticated models");
      expect(trigger.textContent).not.toContain("Default");

      trigger.click();
      const piSection = await waitForElement(
        () =>
          Array.from(document.querySelectorAll<HTMLElement>("section")).find((section) =>
            (section.textContent ?? "").includes("Pi agent harness sessions discovered"),
          ) ?? null,
        "Unable to find the Pi provider section with a preloaded authenticated catalog.",
      );

      expect(piSection.textContent).toContain("openai/gpt-5.4");
      expect(piSection.textContent).toContain("github-copilot/claude-sonnet-4.5");
      expect(piSection.textContent).not.toContain("pi/default");
    } finally {
      await screen.unmount();
      queryClient.clear();
    }
  });
});
