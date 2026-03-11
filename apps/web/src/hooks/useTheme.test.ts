import { describe, expect, it } from "vitest";

import {
  resolveAppliedCustomTheme,
  resolveAppliedCustomThemeId,
  resolvePinnedCustomThemeAppearance,
} from "../lib/customThemes";
import {
  resolveEffectiveThemeAppearance,
  resolveSyncedThemeSelection,
  resolveThemeAppearance,
} from "./useTheme";

describe("resolveThemeAppearance", () => {
  it("returns explicit light and dark preferences unchanged", () => {
    expect(resolveThemeAppearance("light", true)).toBe("light");
    expect(resolveThemeAppearance("dark", false)).toBe("dark");
  });

  it("resolves system preference from the platform color scheme", () => {
    expect(resolveThemeAppearance("system", false)).toBe("light");
    expect(resolveThemeAppearance("system", true)).toBe("dark");
  });
});

describe("resolveEffectiveThemeAppearance", () => {
  it("keeps the base appearance when no custom preset is selected", () => {
    expect(resolveEffectiveThemeAppearance("system", false, "none")).toBe("light");
    expect(resolveEffectiveThemeAppearance("system", true, "none")).toBe("dark");
  });

  it("lets explicit presets override the effective appearance", () => {
    expect(resolveEffectiveThemeAppearance("light", false, "github-dark")).toBe("dark");
    expect(resolveEffectiveThemeAppearance("dark", true, "catppuccin-latte")).toBe("light");
  });
});

describe("resolveAppliedCustomThemeId", () => {
  it("returns null when custom themes are disabled", () => {
    expect(resolveAppliedCustomThemeId("none", "light")).toBeNull();
  });

  it("maps Catppuccin auto mode to the active light or dark flavor", () => {
    expect(resolveAppliedCustomThemeId("catppuccin-auto", "light")).toBe("catppuccin-latte");
    expect(resolveAppliedCustomThemeId("catppuccin-auto", "dark")).toBe("catppuccin-mocha");
  });

  it("returns explicit preset ids unchanged", () => {
    expect(resolveAppliedCustomThemeId("nord", "light")).toBe("nord");
    expect(resolveAppliedCustomThemeId("visual-studio-2017-dark", "dark")).toBe(
      "visual-studio-2017-dark",
    );
  });
});

describe("resolveAppliedCustomTheme", () => {
  it("returns the applied preset metadata", () => {
    expect(resolveAppliedCustomTheme("catppuccin-auto", "dark")?.label).toBe("Catppuccin Mocha");
    expect(resolveAppliedCustomTheme("github-dark-dimmed", "light")?.appearance).toBe("dark");
    expect(resolveAppliedCustomTheme("t3-chat-theme", "dark")?.label).toBe("T3 Chat Theme");
  });
});

describe("resolvePinnedCustomThemeAppearance", () => {
  it("returns pinned appearances for fixed presets only", () => {
    expect(resolvePinnedCustomThemeAppearance("catppuccin-latte")).toBe("light");
    expect(resolvePinnedCustomThemeAppearance("nord")).toBe("dark");
    expect(resolvePinnedCustomThemeAppearance("t3-chat-theme")).toBe("dark");
    expect(resolvePinnedCustomThemeAppearance("catppuccin-auto")).toBeNull();
    expect(resolvePinnedCustomThemeAppearance("none")).toBeNull();
  });
});

describe("resolveSyncedThemeSelection", () => {
  it("keeps theme selection aligned with pinned custom presets", () => {
    expect(resolveSyncedThemeSelection("dark", "catppuccin-latte")).toBe("light");
    expect(resolveSyncedThemeSelection("system", "visual-studio-2017-dark")).toBe("dark");
  });

  it("preserves the selected theme when the preset follows base appearance", () => {
    expect(resolveSyncedThemeSelection("system", "catppuccin-auto")).toBe("system");
    expect(resolveSyncedThemeSelection("dark", "none")).toBe("dark");
  });
});
