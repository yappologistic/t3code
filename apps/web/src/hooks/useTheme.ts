import { useCallback, useEffect, useSyncExternalStore } from "react";

import { getAppSettingsSnapshot, subscribeAppSettings } from "../appSettings";
import {
  isCustomThemeEnabled,
  resolveAppliedCustomTheme,
  resolvePinnedCustomThemeAppearance,
  type CustomThemeId,
} from "../lib/customThemes";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
type ThemeSnapshot = {
  theme: Theme;
  systemDark: boolean;
  customThemeId: CustomThemeId;
};

const STORAGE_KEY = "t3code:theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

let listeners: Array<() => void> = [];
let lastSnapshot: ThemeSnapshot | null = null;
let lastDesktopTheme: Theme | null = null;
function emitChange() {
  for (const listener of listeners) listener();
}

function hasDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function getSystemDark(): boolean {
  if (!hasDom() || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(MEDIA_QUERY).matches;
}

function getStored(): Theme {
  if (!hasDom()) {
    return "system";
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

function getStoredCustomThemeId(): CustomThemeId {
  if (!hasDom()) {
    return "none";
  }

  return getAppSettingsSnapshot().customThemeId;
}

export function resolveThemeAppearance(theme: Theme, systemDark: boolean): ResolvedTheme {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function resolveEffectiveThemeAppearance(
  theme: Theme,
  systemDark: boolean,
  customThemeId: CustomThemeId,
): ResolvedTheme {
  const baseResolvedTheme = resolveThemeAppearance(theme, systemDark);
  return (
    resolveAppliedCustomTheme(customThemeId, baseResolvedTheme)?.appearance ?? baseResolvedTheme
  );
}

export function resolveSyncedThemeSelection(theme: Theme, customThemeId: CustomThemeId): Theme {
  return resolvePinnedCustomThemeAppearance(customThemeId) ?? theme;
}

function applyTheme(
  theme: Theme,
  customThemeId = getStoredCustomThemeId(),
  suppressTransitions = false,
) {
  if (!hasDom()) {
    return;
  }

  if (suppressTransitions) {
    document.documentElement.classList.add("no-transitions");
  }
  const baseResolvedTheme = resolveThemeAppearance(theme, getSystemDark());
  const activeCustomTheme = resolveAppliedCustomTheme(customThemeId, baseResolvedTheme);
  const resolvedTheme = activeCustomTheme?.appearance ?? baseResolvedTheme;
  const isDark = resolvedTheme === "dark";

  document.documentElement.classList.toggle("dark", isDark);
  if (activeCustomTheme) {
    document.documentElement.dataset.theme = activeCustomTheme.dataTheme;
  } else {
    delete document.documentElement.dataset.theme;
  }
  syncDesktopTheme(theme);
  if (suppressTransitions) {
    // Force a reflow so the no-transitions class takes effect before removal
    // oxlint-disable-next-line no-unused-expressions
    document.documentElement.offsetHeight;
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("no-transitions");
    });
  }
}

function syncDesktopTheme(theme: Theme) {
  const bridge = window.desktopBridge;
  if (!bridge || lastDesktopTheme === theme) {
    return;
  }

  lastDesktopTheme = theme;
  void bridge.setTheme(theme).catch(() => {
    if (lastDesktopTheme === theme) {
      lastDesktopTheme = null;
    }
  });
}

// Apply immediately on module load to prevent flash
if (hasDom()) {
  applyTheme(getStored(), getStoredCustomThemeId());
}

function getSnapshot(): ThemeSnapshot {
  const theme = getStored();
  const systemDark = theme === "system" ? getSystemDark() : false;
  const customThemeId = getStoredCustomThemeId();

  if (
    lastSnapshot &&
    lastSnapshot.theme === theme &&
    lastSnapshot.systemDark === systemDark &&
    lastSnapshot.customThemeId === customThemeId
  ) {
    return lastSnapshot;
  }

  lastSnapshot = { theme, systemDark, customThemeId };
  return lastSnapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);

  if (!hasDom()) {
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }

  // Listen for system preference changes
  const mq = window.matchMedia(MEDIA_QUERY);
  const handleChange = () => {
    if (getStored() === "system") applyTheme("system", getStoredCustomThemeId(), true);
    emitChange();
  };
  mq.addEventListener("change", handleChange);

  // Listen for storage changes from other tabs
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      applyTheme(getStored(), getStoredCustomThemeId(), true);
      emitChange();
    }
  };
  window.addEventListener("storage", handleStorage);

  const unsubscribeAppSettings = subscribeAppSettings(() => {
    applyTheme(getStored(), getStoredCustomThemeId(), true);
    emitChange();
  });

  return () => {
    listeners = listeners.filter((l) => l !== listener);
    mq.removeEventListener("change", handleChange);
    window.removeEventListener("storage", handleStorage);
    unsubscribeAppSettings();
  };
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => ({
    theme: "system" as const,
    systemDark: false,
    customThemeId: "none" as const,
  }));
  const theme = resolveSyncedThemeSelection(snapshot.theme, snapshot.customThemeId);
  const customThemeId = snapshot.customThemeId;

  const baseResolvedTheme = resolveThemeAppearance(theme, snapshot.systemDark);
  const activeCustomTheme = resolveAppliedCustomTheme(customThemeId, baseResolvedTheme);
  const resolvedTheme = activeCustomTheme?.appearance ?? baseResolvedTheme;

  const setTheme = useCallback((next: Theme) => {
    if (!hasDom()) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next, getStoredCustomThemeId(), true);
    emitChange();
  }, []);

  useEffect(() => {
    if (!hasDom()) {
      return;
    }

    if (theme !== snapshot.theme) {
      window.localStorage.setItem(STORAGE_KEY, theme);
      applyTheme(theme, customThemeId, true);
      emitChange();
      return;
    }

    applyTheme(theme, customThemeId);
  }, [customThemeId, snapshot.theme, theme]);

  return {
    theme,
    setTheme,
    resolvedTheme,
    baseResolvedTheme,
    customThemeId,
    customThemeEnabled: isCustomThemeEnabled(customThemeId),
    activeCustomTheme,
    activeCustomThemeId: activeCustomTheme?.id ?? null,
  } as const;
}
