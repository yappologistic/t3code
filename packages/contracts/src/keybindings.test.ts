import { describe, expect, it } from "vitest";

import {
  keybindingRuleSchema,
  keybindingsConfigSchema,
  resolvedKeybindingRuleSchema,
  resolvedKeybindingsConfigSchema,
} from "./keybindings";

describe("keybindings contracts", () => {
  it("parses keybinding rules", () => {
    const parsed = keybindingRuleSchema.parse({
      key: "mod+j",
      command: "terminal.toggle",
    });
    expect(parsed.command).toBe("terminal.toggle");
  });

  it("rejects invalid command values", () => {
    expect(() =>
      keybindingRuleSchema.parse({
        key: "mod+j",
        command: "invalid.command" as unknown as "terminal.toggle",
      }),
    ).toThrow();
  });

  it("parses keybindings array payload", () => {
    const parsed = keybindingsConfigSchema.parse([
      { key: "mod+j", command: "terminal.toggle" },
      { key: "mod+d", command: "terminal.split", when: "terminalFocus" },
    ]);
    expect(parsed).toHaveLength(2);
  });

  it("parses resolved keybinding rules", () => {
    const parsed = resolvedKeybindingRuleSchema.parse({
      key: "mod+d",
      command: "terminal.split",
      when: "terminalOpen && !terminalFocus",
      shortcut: {
        key: "d",
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        modKey: true,
      },
      whenAst: {
        type: "and",
        left: { type: "identifier", name: "terminalOpen" },
        right: {
          type: "not",
          node: { type: "identifier", name: "terminalFocus" },
        },
      },
    });
    expect(parsed.shortcut.key).toBe("d");
  });

  it("parses resolved keybindings arrays", () => {
    const parsed = resolvedKeybindingsConfigSchema.parse([
      {
        key: "mod+j",
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
    ]);
    expect(parsed).toHaveLength(1);
  });
});
