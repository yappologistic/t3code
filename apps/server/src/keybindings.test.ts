import { describe, expect, it } from "vitest";

import { compileResolvedKeybindingRule, parseKeybindingShortcut } from "./keybindings";

describe("server keybindings", () => {
  it("parses shortcuts including plus key", () => {
    expect(parseKeybindingShortcut("mod+j")).toEqual({
      key: "j",
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      modKey: true,
    });
    expect(parseKeybindingShortcut("mod++")).toEqual({
      key: "+",
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      modKey: true,
    });
  });

  it("compiles valid rule with parsed when AST", () => {
    const compiled = compileResolvedKeybindingRule({
      key: "mod+d",
      command: "terminal.split",
      when: "terminalOpen && !terminalFocus",
    });

    expect(compiled).toEqual({
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
  });

  it("rejects invalid rules", () => {
    expect(
      compileResolvedKeybindingRule({
        key: "mod+shift+d+o",
        command: "terminal.new",
      }),
    ).toBeNull();

    expect(
      compileResolvedKeybindingRule({
        key: "mod+d",
        command: "terminal.split",
        when: "terminalFocus && (",
      }),
    ).toBeNull();
  });
});
