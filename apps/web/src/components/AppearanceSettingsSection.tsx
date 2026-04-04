import { useEffect, useMemo, useState } from "react";
import {
  CopyIcon,
  DownloadIcon,
  MonitorIcon,
  MoonIcon,
  SunMediumIcon,
  UploadIcon,
} from "lucide-react";

import {
  DEFAULT_APP_LANGUAGE_SETTING,
  DEFAULT_TIMESTAMP_FORMAT,
  useAppSettings,
} from "../appSettings";
import { APP_LANGUAGE_OPTIONS, getAppLanguageDetails, type AppLanguage } from "../appLanguage";
import {
  clampAppearanceContrast,
  clampUiFontSizePx,
  DEFAULT_DARK_APPEARANCE_THEME,
  DEFAULT_LIGHT_APPEARANCE_THEME,
  normalizeHexColor,
  parseImportedAppearanceTheme,
  serializeAppearanceTheme,
  type AppearanceMode,
} from "../lib/appearanceTheme";
import {
  CUSTOM_THEME_OPTIONS,
  CUSTOM_THEME_OPTIONS_BY_ID,
  isCustomThemeId,
  type CustomThemeId,
} from "../lib/customThemes";
import { useTheme, type Theme } from "../hooks/useTheme";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { toastManager } from "./ui/toast";

const THEME_MODE_VALUES: Array<{
  icon: typeof SunMediumIcon;
  value: Theme;
}> = [
  {
    value: "light",
    icon: SunMediumIcon,
  },
  {
    value: "dark",
    icon: MoonIcon,
  },
  {
    value: "system",
    icon: MonitorIcon,
  },
] as const;

function getAppearanceCopy(language: AppLanguage) {
  if (language === "fa") {
    return {
      sectionTitle: "ظاهر",
      sectionDescription:
        "پالت پایه روشن و تیره، تایپوگرافی و کنترل های ظاهری Rowl را برای وب و Electron تنظیم کنید.",
      themeMode: {
        light: { label: "روشن", description: "از ظاهر روشن استفاده شود." },
        dark: { label: "تیره", description: "از ظاهر تیره استفاده شود." },
        system: { label: "سیستم", description: "از ترجیح سیستم پیروی شود." },
      },
      themePreference: "ترجیح پوسته",
      defaultLabel: "پیش فرض",
      currentLabel: "فعلی",
      savedBaseTheme: "پوسته پایه ذخیره شده",
      darkTheme: "پوسته تیره",
      lightTheme: "پوسته روشن",
      importButton: "درون ریزی",
      copyThemeButton: "کپی پوسته",
      copiedButton: "کپی شد",
      themePreset: "پیش تنظیم پوسته",
      removeCustomTheme: "حذف پوسته سفارشی",
      accent: "رنگ تاکید",
      background: "پس زمینه",
      foreground: "متن",
      uiFont: "فونت رابط",
      codeFont: "فونت کد",
      translucentSidebar: "نوار کناری نیمه شفاف",
      translucentSidebarDescription:
        "برای نوار کناری اصلی پروژه شفافیت و محوشدگی پس زمینه فعال شود.",
      contrast: "کنتراست",
      contrastDescription: "تفکیک بین سطوح، حاشیه ها و وضعیت های تعاملی را بیشتر می کند.",
      selectedPreset: "پیش تنظیم انتخاب شده",
      effectiveAppearance: "ظاهر نهایی",
      baseAppearance: "ظاهر پایه",
      activePreset: "پیش تنظیم فعال",
      customPresetFallback: "پیش تنظیم سفارشی",
      pointerCursors: "استفاده از نشانگر دستی",
      pointerCursorsDescription:
        "به جای فلش پیش فرض، روی دکمه ها و پیوندها از نشانگر دستی استفاده شود.",
      uiFontSize: "اندازه فونت رابط",
      uiFontSizeDescription: "اندازه پایه مورد استفاده در رابط Rowl را تنظیم می کند.",
      uiFontSizeAria: "اندازه فونت رابط بر حسب پیکسل",
      timestampFormat: "قالب زمان",
      timestampFormatDescription:
        "حالت پیش فرض سیستم از قالب زمان مرورگر یا سیستم عامل شما پیروی می کند.",
      timestampFormatLabels: {
        locale: "پیش فرض سیستم",
        "12-hour": "۱۲ ساعته",
        "24-hour": "۲۴ ساعته",
      },
      language: "زبان",
      languageDescription:
        "رابط تنظیمات و متن های مشترک برنامه را بین انگلیسی و فارسی جابه جا می کند.",
      restoreDefaults: "بازگردانی پیش فرض ها",
      themeCopiedTitle: "پوسته کپی شد",
      themeCopiedDescription: (themeName: string) => `تنظیمات ${themeName} به صورت JSON کپی شد.`,
      copyFailedTitle: "کپی انجام نشد",
      themeImportedTitle: "پوسته درون ریزی شد",
      themeImportedDescription: (themeName: string) =>
        `مقادیر درون ریزی شده روی ${themeName} اعمال شد.`,
      importFailedTitle: "درون ریزی انجام نشد",
      invalidColorTitle: "رنگ نامعتبر",
      invalidColorDescription: "رنگ پوسته باید یک مقدار هگز ۳ یا ۶ رقمی باشد.",
      invalidFontSizeTitle: "اندازه فونت نامعتبر",
      invalidFontSizeDescription: "یک عدد صحیح بین ۱۲ تا ۱۸ پیکسل وارد کنید.",
      importDialogTitle: (themeName: string) => `درون ریزی ${themeName}`,
      importDialogDescription:
        "یک شیء JSON با فیلدهای accent، background، foreground، uiFont، codeFont، translucentSidebar و contrast وارد کنید.",
      importDialogFootnote: (themeName: string) =>
        `Rowl فقط مقادیر ${themeName} فعلی را درون ریزی می کند.`,
      cancel: "لغو",
      applyImport: "اعمال درون ریزی",
    };
  }

  return {
    sectionTitle: "Appearance",
    sectionDescription:
      "Customize Rowl's base light and dark palettes, typography, and interactive chrome across web and Electron.",
    themeMode: {
      light: { label: "Light", description: "Use the light appearance." },
      dark: { label: "Dark", description: "Use the dark appearance." },
      system: { label: "System", description: "Match your system preference." },
    },
    themePreference: "Theme preference",
    defaultLabel: "Default",
    currentLabel: "Current",
    savedBaseTheme: "Saved base theme",
    darkTheme: "Dark theme",
    lightTheme: "Light theme",
    importButton: "Import",
    copyThemeButton: "Copy theme",
    copiedButton: "Copied",
    themePreset: "Theme preset",
    removeCustomTheme: "Remove custom theme",
    accent: "Accent",
    background: "Background",
    foreground: "Foreground",
    uiFont: "UI font",
    codeFont: "Code font",
    translucentSidebar: "Translucent sidebar",
    translucentSidebarDescription:
      "Add backdrop blur and transparency to the main project sidebar.",
    contrast: "Contrast",
    contrastDescription: "Increase separation between surfaces, borders, and interactive states.",
    selectedPreset: "Selected preset",
    effectiveAppearance: "Effective appearance",
    baseAppearance: "Base appearance setting",
    activePreset: "Active preset",
    customPresetFallback: "Custom preset",
    pointerCursors: "Use pointer cursors",
    pointerCursorsDescription:
      "Use hand cursors on buttons and links instead of the default arrow.",
    uiFontSize: "UI font size",
    uiFontSizeDescription: "Adjust the base size used across the shared Rowl interface.",
    uiFontSizeAria: "UI font size in pixels",
    timestampFormat: "Timestamp format",
    timestampFormatDescription: "System default follows your browser or OS time format.",
    timestampFormatLabels: {
      locale: "System default",
      "12-hour": "12-hour",
      "24-hour": "24-hour",
    },
    language: "Language",
    languageDescription: "Switch the settings UI and shared app shell between English and Persian.",
    restoreDefaults: "Restore defaults",
    themeCopiedTitle: "Theme copied",
    themeCopiedDescription: (themeName: string) => `Copied ${themeName} settings as JSON.`,
    copyFailedTitle: "Copy failed",
    themeImportedTitle: "Theme imported",
    themeImportedDescription: (themeName: string) => `Applied imported values to the ${themeName}.`,
    importFailedTitle: "Import failed",
    invalidColorTitle: "Invalid color",
    invalidColorDescription: "Theme colors must be a 3-digit or 6-digit hex value.",
    invalidFontSizeTitle: "Invalid font size",
    invalidFontSizeDescription: "Enter a whole number between 12 and 18 pixels.",
    importDialogTitle: (themeName: string) => `Import ${themeName}`,
    importDialogDescription:
      "Paste a JSON object with accent, background, foreground, uiFont, codeFont, translucentSidebar, and contrast.",
    importDialogFootnote: (themeName: string) =>
      `Rowl only imports the current ${themeName} values.`,
    cancel: "Cancel",
    applyImport: "Apply import",
  };
}

function resolveEditedAppearance(theme: Theme, baseResolvedTheme: AppearanceMode): AppearanceMode {
  return theme === "system" ? baseResolvedTheme : theme;
}

function themeLabel(appearance: AppearanceMode, language: AppLanguage): string {
  const copy = getAppearanceCopy(language);
  return appearance === "dark" ? copy.darkTheme : copy.lightTheme;
}

function themeDefaults(appearance: AppearanceMode) {
  return appearance === "dark" ? DEFAULT_DARK_APPEARANCE_THEME : DEFAULT_LIGHT_APPEARANCE_THEME;
}

function hexInputClassName() {
  return `h-8 w-11 cursor-pointer rounded-full border border-border bg-transparent p-1`;
}

export function AppearanceSettingsSection() {
  const { settings, defaults, updateSettings } = useAppSettings();
  const copy = getAppearanceCopy(settings.language);
  const {
    theme,
    setTheme,
    resolvedTheme,
    baseResolvedTheme,
    customThemeId,
    customThemeEnabled,
    activeCustomTheme,
  } = useTheme();
  const editedAppearance = resolveEditedAppearance(theme, baseResolvedTheme);
  const activeThemeConfig =
    editedAppearance === "dark" ? settings.darkAppearanceTheme : settings.lightAppearanceTheme;
  const activeThemeDefaults = themeDefaults(editedAppearance);
  const selectedCustomTheme = CUSTOM_THEME_OPTIONS_BY_ID[customThemeId];
  const [colorDrafts, setColorDrafts] = useState(() => ({
    accent: activeThemeConfig.accent,
    background: activeThemeConfig.background,
    foreground: activeThemeConfig.foreground,
  }));
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [uiFontSizeDraft, setUiFontSizeDraft] = useState(() => String(settings.uiFontSizePx));
  const themeModeOptions = THEME_MODE_VALUES.map((option) => ({
    value: option.value,
    icon: option.icon,
    label: copy.themeMode[option.value].label,
    description: copy.themeMode[option.value].description,
  }));
  const { copyToClipboard, isCopied } = useCopyToClipboard<void>({
    onCopy: () => {
      toastManager.add({
        type: "success",
        title: copy.themeCopiedTitle,
        description: copy.themeCopiedDescription(
          themeLabel(editedAppearance, settings.language).toLowerCase(),
        ),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: copy.copyFailedTitle,
        description: error.message,
      });
    },
  });

  useEffect(() => {
    setColorDrafts({
      accent: activeThemeConfig.accent,
      background: activeThemeConfig.background,
      foreground: activeThemeConfig.foreground,
    });
  }, [
    activeThemeConfig.accent,
    activeThemeConfig.background,
    activeThemeConfig.foreground,
    editedAppearance,
  ]);

  useEffect(() => {
    setUiFontSizeDraft(String(settings.uiFontSizePx));
  }, [settings.uiFontSizePx]);

  const appearanceSettingsKey =
    editedAppearance === "dark" ? "darkAppearanceTheme" : "lightAppearanceTheme";
  const presetColorsOverrideBase = customThemeEnabled;
  const previewRightLabel = presetColorsOverrideBase ? copy.savedBaseTheme : copy.currentLabel;

  const updateActiveThemeConfig = (patch: Partial<typeof activeThemeConfig>) => {
    updateSettings({
      [appearanceSettingsKey]: {
        ...activeThemeConfig,
        ...patch,
      },
    });
  };

  const previewSurfaceLabel = activeThemeConfig.translucentSidebar ? "sidebar-elevated" : "sidebar";
  const defaultSurfaceLabel = activeThemeDefaults.translucentSidebar
    ? "sidebar-elevated"
    : "sidebar";
  const previewLines = useMemo(
    () => [
      {
        key: "declaration",
        left: "const themePreview: ThemeConfig = {",
        right: "const themePreview: ThemeConfig = {",
      },
      {
        key: "surface",
        left: `  surface: "${defaultSurfaceLabel}",`,
        right: `  surface: "${previewSurfaceLabel}",`,
      },
      {
        key: "accent",
        left: `  accent: "${activeThemeDefaults.accent}",`,
        right: `  accent: "${activeThemeConfig.accent}",`,
      },
      {
        key: "contrast",
        left: `  contrast: ${activeThemeDefaults.contrast},`,
        right: `  contrast: ${activeThemeConfig.contrast},`,
      },
      { key: "closing", left: "};", right: "};" },
    ],
    [
      activeThemeConfig.accent,
      activeThemeConfig.contrast,
      activeThemeDefaults.accent,
      activeThemeDefaults.contrast,
      defaultSurfaceLabel,
      previewSurfaceLabel,
    ],
  );

  const applyImportedTheme = () => {
    try {
      const importedTheme = parseImportedAppearanceTheme(importText, editedAppearance);
      updateSettings({
        [appearanceSettingsKey]: importedTheme,
      });
      setImportDialogOpen(false);
      setImportText("");
      toastManager.add({
        type: "success",
        title: copy.themeImportedTitle,
        description: copy.themeImportedDescription(
          themeLabel(editedAppearance, settings.language).toLowerCase(),
        ),
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: copy.importFailedTitle,
        description: error instanceof Error ? error.message : "Unable to import theme JSON.",
      });
    }
  };

  const handleColorCommit = (field: keyof typeof colorDrafts) => {
    const nextValue = normalizeHexColor(colorDrafts[field], activeThemeConfig[field]);
    if (nextValue !== colorDrafts[field].trim().toLowerCase()) {
      toastManager.add({
        type: "warning",
        title: copy.invalidColorTitle,
        description: copy.invalidColorDescription,
      });
    }

    setColorDrafts((existing) => ({
      ...existing,
      [field]: nextValue,
    }));
    updateActiveThemeConfig({ [field]: nextValue });
  };

  const commitUiFontSizeDraft = () => {
    const trimmedDraft = uiFontSizeDraft.trim();
    if (!trimmedDraft) {
      setUiFontSizeDraft(String(settings.uiFontSizePx));
      return;
    }

    const parsed = Number(trimmedDraft);
    if (!Number.isFinite(parsed)) {
      setUiFontSizeDraft(String(settings.uiFontSizePx));
      toastManager.add({
        type: "warning",
        title: copy.invalidFontSizeTitle,
        description: copy.invalidFontSizeDescription,
      });
      return;
    }

    const nextValue = clampUiFontSizePx(parsed, settings.uiFontSizePx);
    updateSettings({ uiFontSizePx: nextValue });
    setUiFontSizeDraft(String(nextValue));
  };

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4">
          <h2 className="text-sm font-medium text-foreground">{copy.sectionTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{copy.sectionDescription}</p>
        </div>

        <div className="space-y-5">
          <div
            className="inline-flex flex-wrap items-center gap-2 rounded-full border border-border bg-background/70 p-1"
            role="radiogroup"
            aria-label={copy.themePreference}
          >
            {themeModeOptions.map((option) => {
              const selected = theme === option.value;
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`app-interactive-motion inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
                    selected
                      ? "bg-secondary text-foreground shadow-xs/5"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                  onClick={() => setTheme(option.value)}
                  title={option.description}
                >
                  <Icon className="size-4" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-background/70">
            <div className="grid gap-0 md:grid-cols-2">
              <div className="border-b border-border/70 bg-rose-500/6 md:border-r md:border-b-0">
                <div className="border-b border-border/70 px-4 py-3 text-xs font-medium text-muted-foreground">
                  {copy.defaultLabel}
                </div>
                <ol className="space-y-0 px-4 py-3 font-mono text-sm leading-7 text-foreground">
                  {previewLines.map((line, index) => (
                    <li key={`left-${line.key}`} className="grid grid-cols-[1.5rem_1fr] gap-4">
                      <span className="text-right text-muted-foreground">{index + 1}</span>
                      <span>{line.left}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="bg-emerald-500/8">
                <div className="border-b border-border/70 px-4 py-3 text-xs font-medium text-muted-foreground">
                  {previewRightLabel}
                </div>
                <ol className="space-y-0 px-4 py-3 font-mono text-sm leading-7 text-foreground">
                  {previewLines.map((line, index) => (
                    <li key={`right-${line.key}`} className="grid grid-cols-[1.5rem_1fr] gap-4">
                      <span className="text-right text-muted-foreground">{index + 1}</span>
                      <span>{line.right}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/65">
            <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {themeLabel(editedAppearance, settings.language)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Edit the base palette and typography used when the app resolves to{" "}
                  <span className="font-medium text-foreground">{editedAppearance}</span>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="xs" variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <UploadIcon className="size-3.5" />
                  {copy.importButton}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    copyToClipboard(serializeAppearanceTheme(activeThemeConfig), undefined)
                  }
                >
                  <CopyIcon className="size-3.5" />
                  {isCopied ? copy.copiedButton : copy.copyThemeButton}
                </Button>
                <Select
                  items={CUSTOM_THEME_OPTIONS.map((option) => ({
                    label: option.label,
                    value: option.id,
                  }))}
                  value={customThemeId}
                  onValueChange={(value) => {
                    if (!value || !isCustomThemeId(value)) return;
                    updateSettings({
                      customThemeId: value as CustomThemeId,
                      enableCatppuccinTheme: value === "catppuccin-auto",
                    });
                  }}
                >
                  <SelectTrigger className="min-w-56" aria-label={copy.themePreset}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    {CUSTOM_THEME_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-sm text-foreground">{option.label}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                {customThemeId !== "none" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        customThemeId: "none",
                        enableCatppuccinTheme: false,
                      })
                    }
                  >
                    {copy.removeCustomTheme}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="divide-y divide-border/70">
              <label className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm font-medium text-foreground">{copy.accent}</span>
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`${themeLabel(editedAppearance, settings.language)} ${copy.accent}`}
                    className={hexInputClassName()}
                    disabled={presetColorsOverrideBase}
                    type="color"
                    value={activeThemeConfig.accent}
                    onChange={(event) => {
                      const value = event.target.value.toLowerCase();
                      setColorDrafts((existing) => ({ ...existing, accent: value }));
                      updateActiveThemeConfig({ accent: value });
                    }}
                  />
                  <Input
                    className="h-9 w-32 text-right font-mono"
                    dir="ltr"
                    disabled={presetColorsOverrideBase}
                    value={colorDrafts.accent}
                    onBlur={() => handleColorCommit("accent")}
                    onChange={(event) =>
                      setColorDrafts((existing) => ({
                        ...existing,
                        accent: event.target.value,
                      }))
                    }
                    spellCheck={false}
                  />
                </div>
              </label>

              <label className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm font-medium text-foreground">{copy.background}</span>
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`${themeLabel(editedAppearance, settings.language)} ${copy.background}`}
                    className={hexInputClassName()}
                    disabled={presetColorsOverrideBase}
                    type="color"
                    value={activeThemeConfig.background}
                    onChange={(event) => {
                      const value = event.target.value.toLowerCase();
                      setColorDrafts((existing) => ({ ...existing, background: value }));
                      updateActiveThemeConfig({ background: value });
                    }}
                  />
                  <Input
                    className="h-9 w-32 text-right font-mono"
                    dir="ltr"
                    disabled={presetColorsOverrideBase}
                    value={colorDrafts.background}
                    onBlur={() => handleColorCommit("background")}
                    onChange={(event) =>
                      setColorDrafts((existing) => ({
                        ...existing,
                        background: event.target.value,
                      }))
                    }
                    spellCheck={false}
                  />
                </div>
              </label>

              <label className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm font-medium text-foreground">{copy.foreground}</span>
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`${themeLabel(editedAppearance, settings.language)} ${copy.foreground}`}
                    className={hexInputClassName()}
                    disabled={presetColorsOverrideBase}
                    type="color"
                    value={activeThemeConfig.foreground}
                    onChange={(event) => {
                      const value = event.target.value.toLowerCase();
                      setColorDrafts((existing) => ({ ...existing, foreground: value }));
                      updateActiveThemeConfig({ foreground: value });
                    }}
                  />
                  <Input
                    className="h-9 w-32 text-right font-mono"
                    dir="ltr"
                    disabled={presetColorsOverrideBase}
                    value={colorDrafts.foreground}
                    onBlur={() => handleColorCommit("foreground")}
                    onChange={(event) =>
                      setColorDrafts((existing) => ({
                        ...existing,
                        foreground: event.target.value,
                      }))
                    }
                    spellCheck={false}
                  />
                </div>
              </label>

              <label className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm font-medium text-foreground">{copy.uiFont}</span>
                <Input
                  className="h-9 w-78 max-w-[65%] text-right"
                  dir="ltr"
                  value={activeThemeConfig.uiFont}
                  onChange={(event) => updateActiveThemeConfig({ uiFont: event.target.value })}
                  spellCheck={false}
                />
              </label>

              <label className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm font-medium text-foreground">{copy.codeFont}</span>
                <Input
                  className="h-9 w-78 max-w-[65%] text-right"
                  dir="ltr"
                  value={activeThemeConfig.codeFont}
                  onChange={(event) => updateActiveThemeConfig({ codeFont: event.target.value })}
                  spellCheck={false}
                />
              </label>

              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{copy.translucentSidebar}</p>
                  <p className="text-xs text-muted-foreground">
                    {copy.translucentSidebarDescription}
                  </p>
                </div>
                <Switch
                  checked={activeThemeConfig.translucentSidebar}
                  onCheckedChange={(checked) =>
                    updateActiveThemeConfig({ translucentSidebar: Boolean(checked) })
                  }
                  aria-label={copy.translucentSidebar}
                />
              </div>

              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{copy.contrast}</p>
                    <p className="text-xs text-muted-foreground">{copy.contrastDescription}</p>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {activeThemeConfig.contrast}
                  </span>
                </div>
                <input
                  className="mt-3 w-full accent-primary"
                  disabled={presetColorsOverrideBase}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={activeThemeConfig.contrast}
                  onChange={(event) =>
                    updateActiveThemeConfig({
                      contrast: clampAppearanceContrast(Number(event.target.value)),
                    })
                  }
                />
              </div>
            </div>

            <div className="border-t border-border/70 px-4 py-3 text-xs text-muted-foreground">
              <p>
                {copy.selectedPreset}:{" "}
                <span className="font-medium text-foreground">{selectedCustomTheme.label}</span>
              </p>
              <p className="mt-1">
                {copy.effectiveAppearance}:{" "}
                <span className="font-medium text-foreground">{resolvedTheme}</span>
              </p>
              <p className="mt-1">
                {copy.baseAppearance}:{" "}
                <span className="font-medium text-foreground">{baseResolvedTheme}</span>
              </p>
              {customThemeEnabled ? (
                <p className="mt-1">
                  {copy.activePreset}:{" "}
                  <span className="font-medium text-foreground">
                    {activeCustomTheme?.label ?? copy.customPresetFallback}
                  </span>
                  . Accent, background, foreground, and contrast now describe the saved base{" "}
                  {themeLabel(editedAppearance, settings.language).toLowerCase()}, not the live
                  preset colors. Remove the preset to make those color changes live.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/65">
            <div className="divide-y divide-border/70">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{copy.pointerCursors}</p>
                  <p className="text-xs text-muted-foreground">{copy.pointerCursorsDescription}</p>
                </div>
                <Switch
                  checked={settings.usePointerCursors}
                  onCheckedChange={(checked) =>
                    updateSettings({ usePointerCursors: Boolean(checked) })
                  }
                  aria-label={copy.pointerCursors}
                />
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{copy.uiFontSize}</p>
                  <p className="text-xs text-muted-foreground">{copy.uiFontSizeDescription}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-9 w-20 text-right"
                    aria-label={copy.uiFontSizeAria}
                    dir="ltr"
                    inputMode="numeric"
                    min={12}
                    max={18}
                    step={1}
                    type="number"
                    value={uiFontSizeDraft}
                    onBlur={commitUiFontSizeDraft}
                    onChange={(event) => setUiFontSizeDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                  <span className="text-sm text-muted-foreground">px</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{copy.timestampFormat}</p>
                  <p className="text-xs text-muted-foreground">{copy.timestampFormatDescription}</p>
                </div>
                <Select
                  value={settings.timestampFormat}
                  onValueChange={(value) => {
                    if (value !== "locale" && value !== "12-hour" && value !== "24-hour") return;
                    updateSettings({ timestampFormat: value });
                  }}
                >
                  <SelectTrigger className="w-40" aria-label={copy.timestampFormat}>
                    <SelectValue>
                      {copy.timestampFormatLabels[settings.timestampFormat]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end">
                    <SelectItem value="locale">{copy.timestampFormatLabels.locale}</SelectItem>
                    <SelectItem value="12-hour">{copy.timestampFormatLabels["12-hour"]}</SelectItem>
                    <SelectItem value="24-hour">{copy.timestampFormatLabels["24-hour"]}</SelectItem>
                  </SelectPopup>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{copy.language}</p>
                  <p className="text-xs text-muted-foreground">{copy.languageDescription}</p>
                </div>
                <Select
                  value={settings.language}
                  onValueChange={(value) => {
                    if (!APP_LANGUAGE_OPTIONS.includes(value as AppLanguage)) return;
                    updateSettings({ language: value as AppLanguage });
                  }}
                >
                  <SelectTrigger className="w-48" aria-label={copy.language}>
                    <SelectValue>
                      {getAppLanguageDetails(settings.language).nativeLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end">
                    {APP_LANGUAGE_OPTIONS.map((language) => {
                      const details = getAppLanguageDetails(language);
                      return (
                        <SelectItem key={language} value={language}>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate text-sm text-foreground">
                              {details.nativeLabel}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {details.label}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectPopup>
                </Select>
              </div>
            </div>
          </div>

          {(activeThemeConfig.accent !== activeThemeDefaults.accent ||
            activeThemeConfig.background !== activeThemeDefaults.background ||
            activeThemeConfig.foreground !== activeThemeDefaults.foreground ||
            activeThemeConfig.uiFont !== activeThemeDefaults.uiFont ||
            activeThemeConfig.codeFont !== activeThemeDefaults.codeFont ||
            activeThemeConfig.translucentSidebar !== activeThemeDefaults.translucentSidebar ||
            activeThemeConfig.contrast !== activeThemeDefaults.contrast ||
            settings.usePointerCursors !== defaults.usePointerCursors ||
            settings.uiFontSizePx !== defaults.uiFontSizePx ||
            settings.language !== DEFAULT_APP_LANGUAGE_SETTING ||
            settings.timestampFormat !== DEFAULT_TIMESTAMP_FORMAT) && (
            <div className="flex justify-end">
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  updateSettings({
                    [appearanceSettingsKey]: activeThemeDefaults,
                    language: DEFAULT_APP_LANGUAGE_SETTING,
                    timestampFormat: DEFAULT_TIMESTAMP_FORMAT,
                    uiFontSizePx: defaults.uiFontSizePx,
                    usePointerCursors: defaults.usePointerCursors,
                  })
                }
              >
                {copy.restoreDefaults}
              </Button>
            </div>
          )}
        </div>
      </section>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogPopup className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {copy.importDialogTitle(
                themeLabel(editedAppearance, settings.language).toLowerCase(),
              )}
            </DialogTitle>
            <DialogDescription>{copy.importDialogDescription}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <Textarea
              className="min-h-48 font-mono text-xs"
              dir="ltr"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={serializeAppearanceTheme(activeThemeConfig)}
              spellCheck={false}
            />
            <div className="rounded-lg border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
              {copy.importDialogFootnote(
                themeLabel(editedAppearance, settings.language).toLowerCase(),
              )}
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              {copy.cancel}
            </Button>
            <Button onClick={applyImportedTheme}>
              <DownloadIcon className="size-4" />
              {copy.applyImport}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
