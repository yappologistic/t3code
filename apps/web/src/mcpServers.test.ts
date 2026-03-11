import { describe, expect, it } from "vitest";

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

  it("formats disabled server details", () => {
    expect(
      formatMcpServerDescription({
        name: "paper",
        enabled: false,
        state: "disabled",
        authStatus: "unknown",
        toolCount: 0,
        resourceCount: 0,
        resourceTemplateCount: 0,
      }),
    ).toBe("Disabled in Codex config");
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
