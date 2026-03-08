import { describe, expect, it } from "vitest";

import {
  ALL_CHAT_CODE_THEME_NAMES,
  resolveChatCodeThemeName,
  T3_CHAT_CODE_THEME_BACKGROUND,
  T3_CHAT_CODE_THEME_NAME,
} from "./chatCodeThemes";

describe("resolveChatCodeThemeName", () => {
  it("uses the dedicated chat code theme for the T3 Chat preset", () => {
    expect(resolveChatCodeThemeName("dark", "t3-chat-theme")).toBe(T3_CHAT_CODE_THEME_NAME);
  });

  it("falls back to the integrated diff/code themes for other presets", () => {
    expect(resolveChatCodeThemeName("dark", "github-dark")).toBe("github-dark");
    expect(resolveChatCodeThemeName("light", null)).toBe("pierre-light");
  });
});

describe("ALL_CHAT_CODE_THEME_NAMES", () => {
  it("includes the dedicated T3 Chat code theme alongside the bundled themes", () => {
    expect(ALL_CHAT_CODE_THEME_NAMES).toContain(T3_CHAT_CODE_THEME_NAME);
    expect(ALL_CHAT_CODE_THEME_NAMES).toContain("catppuccin-mocha");
    expect(ALL_CHAT_CODE_THEME_NAMES).toContain("pierre-dark");
  });
});

describe("T3 Chat code theme", () => {
  it("uses the expected darker surface background", () => {
    expect(T3_CHAT_CODE_THEME_BACKGROUND).toBe("#1a1821");
  });
});