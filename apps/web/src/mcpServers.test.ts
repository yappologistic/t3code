import { describe, expect, it } from "vitest";

import type { ServerProviderMcpStatus } from "@t3tools/contracts";

import {
  buildComposerMcpServerItems,
  formatMcpServerDescription,
  providerSupportsMcp,
} from "./mcpServers";

describe("formatMcpServerDescription", () => {
  it("formats enabled server details", () => {
    expect(
      formatMcpServerDescription({
        name: "context7",
        enabled: true,
        state: "enabled",
        authStatus: "o_auth",
        toolCount: 3,
        resourceCount: 0,
        resourceTemplateCount: 0,
      }),
    ).toBe("Enabled · OAuth · 3 tools");
  });

  it("formats disabled Codex server details", () => {
    expect(
      formatMcpServerDescription(
        {
          name: "paper",
          enabled: false,
          state: "disabled",
          authStatus: "unknown",
          toolCount: 0,
          resourceCount: 0,
          resourceTemplateCount: 0,
        },
        "codex",
      ),
    ).toBe("Disabled in Codex config");
  });

  it("formats disabled OpenCode server details separately", () => {
    expect(
      formatMcpServerDescription(
        {
          name: "paper",
          enabled: false,
          state: "disabled",
          authStatus: "unknown",
          toolCount: 0,
          resourceCount: 0,
          resourceTemplateCount: 0,
        },
        "opencode",
      ),
    ).toBe("Disabled in OpenCode config");
  });

  it("includes connection status when runtime inspection exposes it", () => {
    expect(
      formatMcpServerDescription({
        name: "context7",
        enabled: true,
        state: "enabled",
        authStatus: "not_logged_in",
        toolCount: 0,
        resourceCount: 0,
        resourceTemplateCount: 0,
        connectionStatus: "connected",
      }),
    ).toBe("Enabled · Needs login · Connected");
  });
});

describe("buildComposerMcpServerItems", () => {
  it("returns provider-specific items filtered by query", () => {
    const items = buildComposerMcpServerItems({
      provider: "codex",
      query: "oauth",
      providerMcpStatuses: [
        {
          provider: "codex",
          supported: true,
          servers: [
            {
              name: "context7",
              enabled: true,
              state: "enabled",
              authStatus: "o_auth",
              toolCount: 3,
              resourceCount: 0,
              resourceTemplateCount: 0,
            },
            {
              name: "playwright",
              enabled: false,
              state: "disabled",
              authStatus: "unknown",
              toolCount: 0,
              resourceCount: 0,
              resourceTemplateCount: 0,
            },
          ],
        },
      ],
    });

    expect(items).toEqual([
      {
        id: "mcp:codex:context7",
        name: "context7",
        provider: "codex",
        state: "enabled",
        authStatus: "o_auth",
        description: "Enabled · OAuth · 3 tools",
      },
    ]);
  });

  it("matches query text against connection diagnostics", () => {
    const items = buildComposerMcpServerItems({
      provider: "opencode",
      query: "sse error",
      providerMcpStatuses: [
        {
          provider: "opencode",
          supported: true,
          servers: [
            {
              name: "paper",
              enabled: true,
              state: "enabled",
              authStatus: "unsupported",
              toolCount: 0,
              resourceCount: 0,
              resourceTemplateCount: 0,
              connectionStatus: "failed",
              message: "SSE error: Unable to connect.",
            },
          ],
        },
      ],
    });

    expect(items).toEqual([
      {
        id: "mcp:opencode:paper",
        name: "paper",
        provider: "opencode",
        state: "enabled",
        authStatus: "unsupported",
        description: "Enabled · No auth · Failed",
      },
    ]);
  });

  it("keeps MCP servers isolated per provider", () => {
    const providerMcpStatuses: ReadonlyArray<ServerProviderMcpStatus> = [
      {
        provider: "codex" as const,
        supported: true,
        servers: [
          {
            name: "context7",
            enabled: true,
            state: "enabled",
            authStatus: "o_auth",
            toolCount: 3,
            resourceCount: 0,
            resourceTemplateCount: 0,
          },
        ],
      },
      {
        provider: "opencode" as const,
        supported: true,
        servers: [
          {
            name: "context7",
            enabled: false,
            state: "disabled",
            authStatus: "unknown",
            toolCount: 0,
            resourceCount: 0,
            resourceTemplateCount: 0,
          },
        ],
      },
    ];

    expect(
      buildComposerMcpServerItems({
        provider: "codex",
        query: "context7",
        providerMcpStatuses,
      }),
    ).toEqual([
      {
        id: "mcp:codex:context7",
        name: "context7",
        provider: "codex",
        state: "enabled",
        authStatus: "o_auth",
        description: "Enabled · OAuth · 3 tools",
      },
    ]);

    expect(
      buildComposerMcpServerItems({
        provider: "opencode",
        query: "context7",
        providerMcpStatuses,
      }),
    ).toEqual([
      {
        id: "mcp:opencode:context7",
        name: "context7",
        provider: "opencode",
        state: "disabled",
        authStatus: "unknown",
        description: "Disabled in OpenCode config",
      },
    ]);
  });

  it("reports MCP support per provider", () => {
    const providerMcpStatuses = [
      {
        provider: "codex" as const,
        supported: true,
        servers: [],
      },
      {
        provider: "copilot" as const,
        supported: false,
        servers: [],
      },
    ];

    expect(providerSupportsMcp(providerMcpStatuses, "codex")).toBe(true);
    expect(providerSupportsMcp(providerMcpStatuses, "copilot")).toBe(false);
    expect(providerSupportsMcp(providerMcpStatuses, "kimi")).toBe(false);
    expect(providerSupportsMcp(providerMcpStatuses, "pi")).toBe(false);
  });

  it("returns no items when the provider does not support MCP browsing", () => {
    const items = buildComposerMcpServerItems({
      provider: "copilot",
      query: "",
      providerMcpStatuses: [
        {
          provider: "copilot",
          supported: false,
          servers: [
            {
              name: "context7",
              enabled: true,
              state: "enabled",
              authStatus: "o_auth",
              toolCount: 3,
              resourceCount: 0,
              resourceTemplateCount: 0,
            },
          ],
        },
      ],
    });

    expect(items).toEqual([]);
  });
});
