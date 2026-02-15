import { describe, expect, it } from "vitest";

import type { KeybindingsConfig } from "@t3tools/contracts";
import {
  formatShortcutLabel,
  isTerminalClearShortcut,
  isTerminalNewShortcut,
  isTerminalSplitShortcut,
  isTerminalToggleShortcut,
  shortcutLabelForCommand,
  type ShortcutEventLike,
} from "./keybindings";

function event(overrides: Partial<ShortcutEventLike> = {}): ShortcutEventLike {
  return {
    key: "j",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

const DEFAULT_BINDINGS: KeybindingsConfig = [
  { key: "mod+j", command: "terminal.toggle" },
  { key: "mod+d", command: "terminal.split", when: "terminalFocus" },
  { key: "mod+shift+d", command: "terminal.new", when: "terminalFocus" },
];

describe("isTerminalToggleShortcut", () => {
  it("matches Cmd+J on macOS", () => {
    expect(isTerminalToggleShortcut(event({ metaKey: true }), DEFAULT_BINDINGS, { platform: "MacIntel" })).toBe(true);
  });

  it("matches Ctrl+J on non-macOS", () => {
    expect(isTerminalToggleShortcut(event({ ctrlKey: true }), DEFAULT_BINDINGS, { platform: "Win32" })).toBe(true);
  });
});

describe("split/new terminal shortcuts", () => {
  it("requires terminalFocus for default split/new bindings", () => {
    expect(
      isTerminalSplitShortcut(event({ key: "d", metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: false },
      }),
    ).toBe(false);
    expect(
      isTerminalNewShortcut(event({ key: "d", ctrlKey: true, shiftKey: true }), DEFAULT_BINDINGS, {
        platform: "Linux",
        context: { terminalFocus: false },
      }),
    ).toBe(false);
  });

  it("matches split/new when terminalFocus is true", () => {
    expect(
      isTerminalSplitShortcut(event({ key: "d", metaKey: true }), DEFAULT_BINDINGS, {
        platform: "MacIntel",
        context: { terminalFocus: true },
      }),
    ).toBe(true);
    expect(
      isTerminalNewShortcut(event({ key: "d", ctrlKey: true, shiftKey: true }), DEFAULT_BINDINGS, {
        platform: "Linux",
        context: { terminalFocus: true },
      }),
    ).toBe(true);
  });

  it("supports when expressions", () => {
    const keybindings: KeybindingsConfig = [
      {
        key: "mod+\\",
        command: "terminal.split",
        when: "terminalOpen && !terminalFocus",
      },
      {
        key: "mod+shift+n",
        command: "terminal.new",
        when: "terminalOpen && !terminalFocus",
      },
      { key: "mod+j", command: "terminal.toggle" },
    ];
    expect(
      isTerminalSplitShortcut(event({ key: "\\", ctrlKey: true }), keybindings, {
        platform: "Win32",
        context: { terminalOpen: true, terminalFocus: false },
      }),
    ).toBe(true);
    expect(
      isTerminalSplitShortcut(event({ key: "\\", ctrlKey: true }), keybindings, {
        platform: "Win32",
        context: { terminalOpen: false, terminalFocus: false },
      }),
    ).toBe(false);
    expect(
      isTerminalNewShortcut(event({ key: "n", ctrlKey: true, shiftKey: true }), keybindings, {
        platform: "Win32",
        context: { terminalOpen: true, terminalFocus: false },
      }),
    ).toBe(true);
  });
});

describe("shortcutLabelForCommand", () => {
  it("returns the most recent binding label", () => {
    const bindings: KeybindingsConfig = [
      { key: "mod+\\", command: "terminal.split", when: "terminalFocus" },
      { key: "mod+shift+\\", command: "terminal.split", when: "!terminalFocus" },
    ];
    expect(shortcutLabelForCommand(bindings, "terminal.split", "Linux")).toBe("Ctrl+Shift+\\");
  });
});

describe("formatShortcutLabel", () => {
  it("formats labels for macOS", () => {
    expect(formatShortcutLabel("mod+shift+d", "MacIntel")).toBe("⇧⌘D");
  });

  it("formats labels for non-macOS", () => {
    expect(formatShortcutLabel("mod+shift+d", "Linux")).toBe("Ctrl+Shift+D");
  });
});

describe("isTerminalClearShortcut", () => {
  it("matches Ctrl+L on all platforms", () => {
    expect(isTerminalClearShortcut(event({ key: "l", ctrlKey: true }), "Linux")).toBe(true);
    expect(isTerminalClearShortcut(event({ key: "l", ctrlKey: true }), "MacIntel")).toBe(true);
  });

  it("matches Cmd+K on macOS", () => {
    expect(isTerminalClearShortcut(event({ key: "k", metaKey: true }), "MacIntel")).toBe(true);
  });
});
