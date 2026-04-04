export type AppearanceMode = "light" | "dark";

export interface AppearanceThemeConfig {
  accent: string;
  background: string;
  foreground: string;
  uiFont: string;
  codeFont: string;
  translucentSidebar: boolean;
  contrast: number;
}

export const DEFAULT_UI_FONT = [
  '"DM Sans"',
  '"Geist Sans"',
  "ui-sans-serif",
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI"',
  "sans-serif",
].join(", ");

export const DEFAULT_CODE_FONT = [
  '"Geist Mono"',
  "ui-monospace",
  '"SFMono-Regular"',
  '"Roboto Mono"',
  "Menlo",
  "Monaco",
  '"Liberation Mono"',
  '"DejaVu Sans Mono"',
  '"Courier New"',
  "monospace",
].join(", ");

export const UI_FONT_SIZE_MIN_PX = 12;
export const UI_FONT_SIZE_MAX_PX = 18;
export const DEFAULT_UI_FONT_SIZE_PX = 16;
export const DEFAULT_USE_POINTER_CURSORS = true;
export const APPEARANCE_CONTRAST_MIN = 0;
export const APPEARANCE_CONTRAST_MAX = 100;

export const DEFAULT_LIGHT_APPEARANCE_THEME: AppearanceThemeConfig = {
  accent: "#4f46e5",
  background: "#ffffff",
  foreground: "#262626",
  uiFont: DEFAULT_UI_FONT,
  codeFont: DEFAULT_CODE_FONT,
  translucentSidebar: false,
  contrast: 28,
};

export const DEFAULT_DARK_APPEARANCE_THEME: AppearanceThemeConfig = {
  accent: "#8b5cf6",
  background: "#161616",
  foreground: "#f5f5f5",
  uiFont: DEFAULT_UI_FONT,
  codeFont: DEFAULT_CODE_FONT,
  translucentSidebar: false,
  contrast: 32,
};

export function clampAppearanceContrast(
  value: number,
  fallback = DEFAULT_LIGHT_APPEARANCE_THEME.contrast,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(APPEARANCE_CONTRAST_MAX, Math.max(APPEARANCE_CONTRAST_MIN, Math.round(value)));
}

export function clampUiFontSizePx(value: number, fallback = DEFAULT_UI_FONT_SIZE_PX): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(UI_FONT_SIZE_MAX_PX, Math.max(UI_FONT_SIZE_MIN_PX, Math.round(value)));
}

export function normalizeFontStack(value: string, fallback: string, maxLength = 256): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  if (trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }

  if (/[;{}]/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

export function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (!match) {
    return fallback.toLowerCase();
  }

  const hex = match[1];
  if (!hex) {
    return fallback.toLowerCase();
  }
  if (hex.length === 3) {
    return `#${hex
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toLowerCase()}`;
  }

  return `#${hex.toLowerCase()}`;
}

export function normalizeAppearanceThemeConfig(
  config: AppearanceThemeConfig,
  appearance: AppearanceMode,
): AppearanceThemeConfig {
  const defaults =
    appearance === "dark" ? DEFAULT_DARK_APPEARANCE_THEME : DEFAULT_LIGHT_APPEARANCE_THEME;

  return {
    accent: normalizeHexColor(config.accent, defaults.accent),
    background: normalizeHexColor(config.background, defaults.background),
    foreground: normalizeHexColor(config.foreground, defaults.foreground),
    uiFont: normalizeFontStack(config.uiFont, defaults.uiFont),
    codeFont: normalizeFontStack(config.codeFont, defaults.codeFont),
    translucentSidebar: Boolean(config.translucentSidebar),
    contrast: clampAppearanceContrast(config.contrast, defaults.contrast),
  };
}

export function hasCustomizedAppearanceColorTheme(
  config: AppearanceThemeConfig,
  appearance: AppearanceMode,
): boolean {
  const normalized = normalizeAppearanceThemeConfig(config, appearance);
  const defaults =
    appearance === "dark" ? DEFAULT_DARK_APPEARANCE_THEME : DEFAULT_LIGHT_APPEARANCE_THEME;

  return (
    normalized.accent !== defaults.accent ||
    normalized.background !== defaults.background ||
    normalized.foreground !== defaults.foreground ||
    normalized.contrast !== defaults.contrast
  );
}

type ImportedAppearanceTheme = Partial<AppearanceThemeConfig> & {
  theme?: Partial<AppearanceThemeConfig>;
};

export function parseImportedAppearanceTheme(
  raw: string,
  appearance: AppearanceMode,
): AppearanceThemeConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Theme import must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Theme import must be a JSON object.");
  }

  const shape = parsed as ImportedAppearanceTheme;
  const candidate = shape.theme && typeof shape.theme === "object" ? shape.theme : shape;
  const defaults =
    appearance === "dark" ? DEFAULT_DARK_APPEARANCE_THEME : DEFAULT_LIGHT_APPEARANCE_THEME;

  return normalizeAppearanceThemeConfig(
    {
      accent: typeof candidate.accent === "string" ? candidate.accent : defaults.accent,
      background:
        typeof candidate.background === "string" ? candidate.background : defaults.background,
      foreground:
        typeof candidate.foreground === "string" ? candidate.foreground : defaults.foreground,
      uiFont: typeof candidate.uiFont === "string" ? candidate.uiFont : defaults.uiFont,
      codeFont: typeof candidate.codeFont === "string" ? candidate.codeFont : defaults.codeFont,
      translucentSidebar:
        typeof candidate.translucentSidebar === "boolean"
          ? candidate.translucentSidebar
          : defaults.translucentSidebar,
      contrast: typeof candidate.contrast === "number" ? candidate.contrast : defaults.contrast,
    },
    appearance,
  );
}

export function serializeAppearanceTheme(config: AppearanceThemeConfig): string {
  return JSON.stringify(
    {
      accent: config.accent,
      background: config.background,
      foreground: config.foreground,
      uiFont: config.uiFont,
      codeFont: config.codeFont,
      translucentSidebar: config.translucentSidebar,
      contrast: config.contrast,
    },
    null,
    2,
  );
}

type Rgb = {
  b: number;
  g: number;
  r: number;
};

function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHexColor(hex, "#000000");
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function channelToHex(channel: number): string {
  return Math.round(Math.min(255, Math.max(0, channel)))
    .toString(16)
    .padStart(2, "0");
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}

function mixColors(base: string, target: string, targetWeight: number): string {
  const baseRgb = hexToRgb(base);
  const targetRgb = hexToRgb(target);
  const weight = Math.min(1, Math.max(0, targetWeight));

  return rgbToHex({
    r: baseRgb.r + (targetRgb.r - baseRgb.r) * weight,
    g: baseRgb.g + (targetRgb.g - baseRgb.g) * weight,
    b: baseRgb.b + (targetRgb.b - baseRgb.b) * weight,
  });
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const clampedAlpha = Math.min(1, Math.max(0, alpha));
  return `rgba(${r} ${g} ${b} / ${clampedAlpha.toFixed(2)})`;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map((channel) => channel / 255);
  const linear = srgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const [red = 0, green = 0, blue = 0] = linear;

  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function readableTextColor(background: string): string {
  return relativeLuminance(background) > 0.35 ? "#111827" : "#ffffff";
}

export function deriveAppearanceCssVariables(
  config: AppearanceThemeConfig,
  appearance: AppearanceMode,
): Record<string, string> {
  const normalized = normalizeAppearanceThemeConfig(config, appearance);
  const emphasis = normalized.contrast / 100;
  const background = normalized.background;
  const foreground = normalized.foreground;
  const accent = normalized.accent;

  const card =
    appearance === "light"
      ? mixColors(background, foreground, 0.03 + emphasis * 0.06)
      : mixColors(background, foreground, 0.05 + emphasis * 0.08);
  const popover =
    appearance === "light"
      ? mixColors(background, foreground, 0.025 + emphasis * 0.055)
      : mixColors(background, foreground, 0.07 + emphasis * 0.08);
  const secondary =
    appearance === "light"
      ? mixColors(background, foreground, 0.045 + emphasis * 0.09)
      : mixColors(background, foreground, 0.08 + emphasis * 0.1);
  const muted =
    appearance === "light"
      ? mixColors(background, foreground, 0.05 + emphasis * 0.1)
      : mixColors(background, foreground, 0.09 + emphasis * 0.1);
  const border =
    appearance === "light"
      ? mixColors(background, foreground, 0.08 + emphasis * 0.14)
      : mixColors(background, foreground, 0.12 + emphasis * 0.16);
  const input =
    appearance === "light"
      ? mixColors(background, foreground, 0.1 + emphasis * 0.12)
      : mixColors(background, foreground, 0.11 + emphasis * 0.15);
  const accentSurface =
    appearance === "light"
      ? mixColors(background, accent, 0.08 + emphasis * 0.09)
      : mixColors(background, accent, 0.14 + emphasis * 0.12);
  const mutedForeground =
    appearance === "light"
      ? mixColors(foreground, background, 0.28 + emphasis * 0.06)
      : mixColors(foreground, background, 0.34 + emphasis * 0.08);
  const sidebarBase =
    appearance === "light"
      ? mixColors(background, foreground, 0.035 + emphasis * 0.07)
      : mixColors(background, foreground, 0.07 + emphasis * 0.08);
  const sidebarAccent =
    appearance === "light"
      ? mixColors(sidebarBase, accent, 0.11 + emphasis * 0.08)
      : mixColors(sidebarBase, accent, 0.15 + emphasis * 0.1);

  return {
    "--accent": accentSurface,
    "--accent-foreground": foreground,
    "--background": background,
    "--border": border,
    "--card": card,
    "--card-foreground": foreground,
    "--rowl-sidebar-backdrop-filter": normalized.translucentSidebar
      ? "blur(24px) saturate(1.12)"
      : "none",
    "--rowl-sidebar-surface": normalized.translucentSidebar
      ? withAlpha(sidebarBase, appearance === "light" ? 0.78 : 0.72)
      : sidebarBase,
    "--rowl-sidebar-surface-solid": sidebarBase,
    "--foreground": foreground,
    "--font-code-snippet": normalized.codeFont,
    "--font-ui": normalized.uiFont,
    "--font-user-message": normalized.uiFont,
    "--input": input,
    "--popover": popover,
    "--popover-foreground": foreground,
    "--primary": accent,
    "--primary-foreground": readableTextColor(accent),
    "--ring": accent,
    "--secondary": secondary,
    "--secondary-foreground": foreground,
    "--muted": muted,
    "--muted-foreground": mutedForeground,
    "--sidebar": normalized.translucentSidebar
      ? withAlpha(sidebarBase, appearance === "light" ? 0.78 : 0.72)
      : sidebarBase,
    "--sidebar-accent": sidebarAccent,
    "--sidebar-accent-foreground": readableTextColor(sidebarAccent),
    "--sidebar-border": border,
    "--sidebar-foreground": foreground,
    "--sidebar-ring": accent,
  };
}

export function clearAppliedAppearanceCssVariables(): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  for (const variable of [
    "--accent",
    "--accent-foreground",
    "--background",
    "--border",
    "--card",
    "--card-foreground",
    "--rowl-sidebar-backdrop-filter",
    "--rowl-sidebar-surface",
    "--rowl-sidebar-surface-solid",
    "--foreground",
    "--font-code-snippet",
    "--font-ui",
    "--font-user-message",
    "--input",
    "--muted",
    "--muted-foreground",
    "--popover",
    "--popover-foreground",
    "--primary",
    "--primary-foreground",
    "--ring",
    "--secondary",
    "--secondary-foreground",
    "--sidebar",
    "--sidebar-accent",
    "--sidebar-accent-foreground",
    "--sidebar-border",
    "--sidebar-foreground",
    "--sidebar-ring",
  ]) {
    root.style.removeProperty(variable);
  }
}

export function applyGlobalAppearanceSettings(args: {
  appearance: AppearanceMode;
  customThemeEnabled: boolean;
  themeConfig: AppearanceThemeConfig;
  uiFontSizePx: number;
  usePointerCursors: boolean;
}): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.style.setProperty("--app-ui-font-size", `${clampUiFontSizePx(args.uiFontSizePx)}px`);
  root.dataset.pointerCursors = args.usePointerCursors ? "on" : "off";
  root.dataset.sidebarTranslucent = args.themeConfig.translucentSidebar ? "on" : "off";
  root.style.setProperty("--font-ui", normalizeFontStack(args.themeConfig.uiFont, DEFAULT_UI_FONT));
  root.style.setProperty(
    "--font-user-message",
    normalizeFontStack(args.themeConfig.uiFont, DEFAULT_UI_FONT),
  );
  root.style.setProperty(
    "--font-code-snippet",
    normalizeFontStack(args.themeConfig.codeFont, DEFAULT_CODE_FONT),
  );
  root.style.setProperty(
    "--rowl-sidebar-backdrop-filter",
    args.themeConfig.translucentSidebar ? "blur(24px) saturate(1.12)" : "none",
  );
  root.style.setProperty(
    "--rowl-sidebar-surface",
    args.themeConfig.translucentSidebar
      ? "color-mix(in srgb, var(--sidebar) 76%, transparent)"
      : "var(--sidebar)",
  );
  root.style.setProperty("--rowl-sidebar-surface-solid", "var(--sidebar)");

  if (args.customThemeEnabled) {
    return;
  }

  if (!hasCustomizedAppearanceColorTheme(args.themeConfig, args.appearance)) {
    return;
  }

  const derivedVariables = deriveAppearanceCssVariables(args.themeConfig, args.appearance);
  for (const [name, value] of Object.entries(derivedVariables)) {
    root.style.setProperty(name, value);
  }
}
