import { useCallback, useSyncExternalStore } from "react";
import { Option, Schema } from "effect";
import { type ProviderKind, type ProviderServiceTier } from "@t3tools/contracts";
import {
  getDefaultModel,
  getModelDisplayName,
  getModelOptions,
  isCodexOpenRouterModel,
  normalizeModelSlug,
} from "@t3tools/shared/model";

import {
  clampUiFontSizePx,
  DEFAULT_DARK_APPEARANCE_THEME,
  DEFAULT_LIGHT_APPEARANCE_THEME,
  DEFAULT_UI_FONT_SIZE_PX,
  DEFAULT_USE_POINTER_CURSORS,
  normalizeAppearanceThemeConfig,
} from "./lib/appearanceTheme";
import { APP_LANGUAGE_OPTIONS, DEFAULT_APP_LANGUAGE, type AppLanguage } from "./appLanguage";
import { CUSTOM_THEME_IDS } from "./lib/customThemes";
import { isOpenRouterGuaranteedFreeSlug } from "./lib/openRouterModels";

const APP_SETTINGS_STORAGE_KEY = "cut3:app-settings:v1";
const MAX_CUSTOM_MODEL_COUNT = 32;
export const MAX_CUSTOM_MODEL_LENGTH = 256;
export const MAX_CHAT_BACKGROUND_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_BACKGROUND_IMAGE_DATA_URL_LENGTH = 1_500_000;
export const MAX_CHAT_BACKGROUND_IMAGE_BLUR_PX = 24;
export const DEFAULT_CHAT_BACKGROUND_IMAGE_FADE_PERCENT = 64;
export const DEFAULT_CHAT_BACKGROUND_IMAGE_BLUR_PX = 0;
export const TIMESTAMP_FORMAT_OPTIONS = ["locale", "12-hour", "24-hour"] as const;
export type TimestampFormat = (typeof TIMESTAMP_FORMAT_OPTIONS)[number];
export const DEFAULT_TIMESTAMP_FORMAT: TimestampFormat = "locale";
export const DEFAULT_APP_LANGUAGE_SETTING: AppLanguage = DEFAULT_APP_LANGUAGE;
export const APP_SERVICE_TIER_OPTIONS = [
  {
    value: "auto",
    label: "Automatic",
    description: "Use Codex defaults without forcing a service tier.",
  },
  {
    value: "fast",
    label: "Fast",
    description: "Request the fast service tier when the model supports it.",
  },
  {
    value: "flex",
    label: "Flex",
    description: "Request the flex service tier when the model supports it.",
  },
] as const;
export type AppServiceTier = (typeof APP_SERVICE_TIER_OPTIONS)[number]["value"];
const AppServiceTierSchema = Schema.Literals(["auto", "fast", "flex"]);
const CustomThemeIdSchema = Schema.Literals(CUSTOM_THEME_IDS);
const MODELS_WITH_FAST_SUPPORT = new Set(["gpt-5.4"]);
const PROVIDERS_WITH_CUSTOM_MODEL_SUPPORT = new Set<ProviderKind>([
  "codex",
  "copilot",
  "kimi",
  "opencode",
]);
const AppearanceThemeConfigSchema = Schema.Struct({
  accent: Schema.String.check(Schema.isMaxLength(32)),
  background: Schema.String.check(Schema.isMaxLength(32)),
  foreground: Schema.String.check(Schema.isMaxLength(32)),
  uiFont: Schema.String.check(Schema.isMaxLength(256)),
  codeFont: Schema.String.check(Schema.isMaxLength(256)),
  translucentSidebar: Schema.Boolean,
  contrast: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
});
const BUILT_IN_MODEL_SLUGS_BY_PROVIDER: Record<ProviderKind, ReadonlySet<string>> = {
  codex: new Set(getModelOptions("codex").map((option) => option.slug)),
  copilot: new Set(getModelOptions("copilot").map((option) => option.slug)),
  kimi: new Set(getModelOptions("kimi").map((option) => option.slug)),
  opencode: new Set(getModelOptions("opencode").map((option) => option.slug)),
};

const AppSettingsSchema = Schema.Struct({
  codexBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(
    Schema.withConstructorDefault(() => Option.some("")),
  ),
  codexHomePath: Schema.String.check(Schema.isMaxLength(4096)).pipe(
    Schema.withConstructorDefault(() => Option.some("")),
  ),
  openRouterApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(
    Schema.withConstructorDefault(() => Option.some("")),
  ),
  copilotBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(
    Schema.withConstructorDefault(() => Option.some("")),
  ),
  opencodeBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(
    Schema.withConstructorDefault(() => Option.some("")),
  ),
  kimiBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(
    Schema.withConstructorDefault(() => Option.some("")),
  ),
  kimiApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(
    Schema.withConstructorDefault(() => Option.some("")),
  ),
  enableCatppuccinTheme: Schema.Boolean.pipe(
    Schema.withConstructorDefault(() => Option.some(false)),
  ),
  customThemeId: CustomThemeIdSchema.pipe(Schema.withConstructorDefault(() => Option.some("none"))),
  lightAppearanceTheme: AppearanceThemeConfigSchema.pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_LIGHT_APPEARANCE_THEME)),
  ),
  darkAppearanceTheme: AppearanceThemeConfigSchema.pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_DARK_APPEARANCE_THEME)),
  ),
  usePointerCursors: Schema.Boolean.pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_USE_POINTER_CURSORS)),
  ),
  uiFontSizePx: Schema.Int.check(Schema.isBetween({ minimum: 12, maximum: 18 })).pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_UI_FONT_SIZE_PX)),
  ),
  chatBackgroundImageDataUrl: Schema.String.check(
    Schema.isMaxLength(MAX_CHAT_BACKGROUND_IMAGE_DATA_URL_LENGTH),
  ).pipe(Schema.withConstructorDefault(() => Option.some(""))),
  chatBackgroundImageAssetId: Schema.String.check(Schema.isMaxLength(512)).pipe(
    Schema.withConstructorDefault(() => Option.some("")),
  ),
  chatBackgroundImageName: Schema.String.check(Schema.isMaxLength(512)).pipe(
    Schema.withConstructorDefault(() => Option.some("")),
  ),
  chatBackgroundImageFadePercent: Schema.Int.check(
    Schema.isBetween({ minimum: 0, maximum: 100 }),
  ).pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_CHAT_BACKGROUND_IMAGE_FADE_PERCENT)),
  ),
  chatBackgroundImageBlurPx: Schema.Int.check(
    Schema.isBetween({ minimum: 0, maximum: MAX_CHAT_BACKGROUND_IMAGE_BLUR_PX }),
  ).pipe(Schema.withConstructorDefault(() => Option.some(DEFAULT_CHAT_BACKGROUND_IMAGE_BLUR_PX))),
  defaultThreadEnvMode: Schema.Literals(["local", "worktree"]).pipe(
    Schema.withConstructorDefault(() => Option.some("local")),
  ),
  confirmThreadDelete: Schema.Boolean.pipe(Schema.withConstructorDefault(() => Option.some(true))),
  enableAssistantStreaming: Schema.Boolean.pipe(
    Schema.withConstructorDefault(() => Option.some(false)),
  ),
  codexServiceTier: AppServiceTierSchema.pipe(
    Schema.withConstructorDefault(() => Option.some("auto")),
  ),
  language: Schema.Literals(APP_LANGUAGE_OPTIONS).pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_APP_LANGUAGE_SETTING)),
  ),
  timestampFormat: Schema.Literals(["locale", "12-hour", "24-hour"]).pipe(
    Schema.withConstructorDefault(() => Option.some(DEFAULT_TIMESTAMP_FORMAT)),
  ),
  customCodexModels: Schema.Array(Schema.String).pipe(
    Schema.withConstructorDefault(() => Option.some([])),
  ),
  customCopilotModels: Schema.Array(Schema.String).pipe(
    Schema.withConstructorDefault(() => Option.some([])),
  ),
  customOpencodeModels: Schema.Array(Schema.String).pipe(
    Schema.withConstructorDefault(() => Option.some([])),
  ),
  customKimiModels: Schema.Array(Schema.String).pipe(
    Schema.withConstructorDefault(() => Option.some([])),
  ),
});
export type AppSettings = typeof AppSettingsSchema.Type;
export interface AppModelOption {
  slug: string;
  name: string;
  isCustom: boolean;
}

export function resolveAppServiceTier(serviceTier: AppServiceTier): ProviderServiceTier | null {
  return serviceTier === "auto" ? null : serviceTier;
}

export function shouldShowFastTierIcon(
  model: string | null | undefined,
  serviceTier: AppServiceTier,
): boolean {
  const normalizedModel = normalizeModelSlug(model);
  return (
    resolveAppServiceTier(serviceTier) === "fast" &&
    normalizedModel !== null &&
    MODELS_WITH_FAST_SUPPORT.has(normalizedModel)
  );
}

const DEFAULT_APP_SETTINGS = AppSettingsSchema.makeUnsafe({});
type SecretAppSettings = Pick<AppSettings, "openRouterApiKey" | "kimiApiKey">;
const DEFAULT_SECRET_SETTINGS = {
  openRouterApiKey: DEFAULT_APP_SETTINGS.openRouterApiKey,
  kimiApiKey: DEFAULT_APP_SETTINGS.kimiApiKey,
} satisfies SecretAppSettings;

let listeners: Array<() => void> = [];
let cachedRawSettings: string | null | undefined;
let cachedPersistedSnapshot: AppSettings = {
  ...DEFAULT_APP_SETTINGS,
  ...DEFAULT_SECRET_SETTINGS,
};
let cachedSnapshot = DEFAULT_APP_SETTINGS;
let cachedSnapshotKey = "";
let cachedSecretSettings: SecretAppSettings = DEFAULT_SECRET_SETTINGS;
let hasHydratedDesktopSecrets = false;
let secretHydrationPromise: Promise<void> | null = null;
let secretHydrationVersion = 0;

export function supportsCustomModels(provider: ProviderKind): boolean {
  return PROVIDERS_WITH_CUSTOM_MODEL_SUPPORT.has(provider);
}
export function normalizeCustomModelSlugs(
  models: Iterable<string | null | undefined>,
  provider: ProviderKind = "codex",
): string[] {
  if (!supportsCustomModels(provider)) {
    return [];
  }

  const normalizedModels: string[] = [];
  const seen = new Set<string>();
  const builtInModelSlugs = BUILT_IN_MODEL_SLUGS_BY_PROVIDER[provider];

  for (const candidate of models) {
    const normalized = normalizeModelSlug(candidate, provider);
    if (
      !normalized ||
      normalized.length > MAX_CUSTOM_MODEL_LENGTH ||
      builtInModelSlugs.has(normalized) ||
      seen.has(normalized)
    ) {
      continue;
    }

    // CUT3 only persists explicit OpenRouter free slugs so model picks cannot
    // silently drift onto a billed OpenRouter model later.
    if (
      provider === "codex" &&
      isCodexOpenRouterModel(normalized) &&
      !isOpenRouterGuaranteedFreeSlug(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    normalizedModels.push(normalized);
    if (normalizedModels.length >= MAX_CUSTOM_MODEL_COUNT) {
      break;
    }
  }

  return normalizedModels;
}

function normalizeAppSettings(settings: AppSettings): AppSettings {
  const customThemeId =
    settings.customThemeId === "none" && settings.enableCatppuccinTheme
      ? "catppuccin-auto"
      : settings.customThemeId;

  return {
    ...settings,
    customThemeId,
    enableCatppuccinTheme: customThemeId === "catppuccin-auto",
    lightAppearanceTheme: normalizeAppearanceThemeConfig(settings.lightAppearanceTheme, "light"),
    darkAppearanceTheme: normalizeAppearanceThemeConfig(settings.darkAppearanceTheme, "dark"),
    uiFontSizePx: clampUiFontSizePx(settings.uiFontSizePx),
    usePointerCursors: Boolean(settings.usePointerCursors),
    customCodexModels: normalizeCustomModelSlugs(settings.customCodexModels, "codex"),
    customCopilotModels: normalizeCustomModelSlugs(settings.customCopilotModels, "copilot"),
    customOpencodeModels: normalizeCustomModelSlugs(settings.customOpencodeModels, "opencode"),
    customKimiModels: normalizeCustomModelSlugs(settings.customKimiModels, "kimi"),
  };
}

function normalizeDesktopSecretValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getAppModelOptions(
  provider: ProviderKind,
  customModels: readonly string[],
  selectedModel?: string | null,
): AppModelOption[] {
  const options: AppModelOption[] = getModelOptions(provider).map(({ slug, name }) => ({
    slug,
    name,
    isCustom: false,
  }));

  if (!supportsCustomModels(provider)) {
    return options;
  }

  const seen = new Set(options.map((option) => option.slug));

  for (const slug of normalizeCustomModelSlugs(customModels, provider)) {
    if (seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    options.push({
      slug,
      name: getModelDisplayName(slug, provider),
      isCustom: true,
    });
  }

  const normalizedSelectedModel = normalizeModelSlug(selectedModel, provider);
  if (normalizedSelectedModel && !seen.has(normalizedSelectedModel)) {
    options.push({
      slug: normalizedSelectedModel,
      name: getModelDisplayName(normalizedSelectedModel, provider),
      isCustom: true,
    });
  }

  return options;
}

export function resolveAppModelSelection(
  provider: ProviderKind,
  customModels: readonly string[],
  selectedModel: string | null | undefined,
): string {
  const options = getAppModelOptions(provider, customModels, selectedModel);
  const trimmedSelectedModel = selectedModel?.trim();
  if (trimmedSelectedModel) {
    const direct = options.find((option) => option.slug === trimmedSelectedModel);
    if (direct) {
      return direct.slug;
    }

    const byName = options.find(
      (option) => option.name.toLowerCase() === trimmedSelectedModel.toLowerCase(),
    );
    if (byName) {
      return byName.slug;
    }
  }

  const normalizedSelectedModel = normalizeModelSlug(selectedModel, provider);
  if (!normalizedSelectedModel) {
    return getDefaultModel(provider);
  }

  return (
    options.find((option) => option.slug === normalizedSelectedModel)?.slug ??
    getDefaultModel(provider)
  );
}

export function getSlashModelOptions(
  provider: ProviderKind,
  customModels: readonly string[],
  query: string,
  selectedModel?: string | null,
): AppModelOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  const options = getAppModelOptions(provider, customModels, selectedModel);
  if (!normalizedQuery) {
    return options;
  }

  return options.filter((option) => {
    const searchSlug = option.slug.toLowerCase();
    const searchName = option.name.toLowerCase();
    return searchSlug.includes(normalizedQuery) || searchName.includes(normalizedQuery);
  });
}

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function parsePersistedSettings(value: string | null): AppSettings {
  if (!value) {
    return DEFAULT_APP_SETTINGS;
  }

  try {
    return normalizeAppSettings(Schema.decodeSync(Schema.fromJsonString(AppSettingsSchema))(value));
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function sanitizePersistedAppSettingsForStorage(settings: AppSettings): AppSettings {
  return {
    ...settings,
    ...DEFAULT_SECRET_SETTINGS,
  };
}

function mergeSettingsWithSecrets(settings: AppSettings): AppSettings {
  return normalizeAppSettings(
    Schema.decodeSync(AppSettingsSchema)({
      ...settings,
      ...cachedSecretSettings,
    }),
  );
}

function persistDesktopSecrets(next: SecretAppSettings): void {
  secretHydrationVersion += 1;
  cachedSecretSettings = next;

  if (typeof window === "undefined" || !window.desktopBridge) {
    return;
  }

  void window.desktopBridge
    .setSecret("openRouterApiKey", normalizeDesktopSecretValue(next.openRouterApiKey))
    .catch(() => undefined);
  void window.desktopBridge
    .setSecret("kimiApiKey", normalizeDesktopSecretValue(next.kimiApiKey))
    .catch(() => undefined);
}

function hydrateDesktopSecretsOnce(): void {
  if (typeof window === "undefined" || !window.desktopBridge) {
    return;
  }
  if (hasHydratedDesktopSecrets || secretHydrationPromise) {
    return;
  }

  const hydrationVersion = secretHydrationVersion;
  secretHydrationPromise = Promise.all([
    window.desktopBridge.getSecret("openRouterApiKey"),
    window.desktopBridge.getSecret("kimiApiKey"),
  ])
    .then(([openRouterSecret, kimiSecret]) => {
      hasHydratedDesktopSecrets = true;
      if (secretHydrationVersion !== hydrationVersion) {
        return;
      }

      const nextSecrets: SecretAppSettings = {
        openRouterApiKey:
          normalizeDesktopSecretValue(openRouterSecret) ?? DEFAULT_SECRET_SETTINGS.openRouterApiKey,
        kimiApiKey: normalizeDesktopSecretValue(kimiSecret) ?? DEFAULT_SECRET_SETTINGS.kimiApiKey,
      };
      if (
        cachedSecretSettings.openRouterApiKey === nextSecrets.openRouterApiKey &&
        cachedSecretSettings.kimiApiKey === nextSecrets.kimiApiKey
      ) {
        return;
      }

      cachedSecretSettings = nextSecrets;
      emitChange();
    })
    .catch(() => {
      hasHydratedDesktopSecrets = true;
    })
    .finally(() => {
      secretHydrationPromise = null;
    });
}

export function getAppSettingsSnapshot(): AppSettings {
  if (typeof window === "undefined") {
    return DEFAULT_APP_SETTINGS;
  }

  hydrateDesktopSecretsOnce();

  const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
  if (raw !== cachedRawSettings) {
    const parsedSettings = parsePersistedSettings(raw);
    const migratedOpenRouterSecret = normalizeDesktopSecretValue(parsedSettings.openRouterApiKey);
    const migratedKimiSecret = normalizeDesktopSecretValue(parsedSettings.kimiApiKey);

    cachedRawSettings = raw;
    cachedPersistedSnapshot = sanitizePersistedAppSettingsForStorage(parsedSettings);

    if (
      (migratedOpenRouterSecret !== null &&
        cachedSecretSettings.openRouterApiKey !== migratedOpenRouterSecret) ||
      (migratedKimiSecret !== null && cachedSecretSettings.kimiApiKey !== migratedKimiSecret)
    ) {
      persistDesktopSecrets({
        openRouterApiKey: migratedOpenRouterSecret ?? cachedSecretSettings.openRouterApiKey,
        kimiApiKey: migratedKimiSecret ?? cachedSecretSettings.kimiApiKey,
      });
      const sanitizedRaw = JSON.stringify(cachedPersistedSnapshot);
      try {
        if (sanitizedRaw !== cachedRawSettings) {
          window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, sanitizedRaw);
        }
      } catch {
        // Best-effort migration only.
      }
      cachedRawSettings = sanitizedRaw;
    }
  }

  const snapshotKey = `${cachedRawSettings ?? ""}\u0000${cachedSecretSettings.openRouterApiKey}\u0000${cachedSecretSettings.kimiApiKey}`;
  if (cachedSnapshotKey === snapshotKey) {
    return cachedSnapshot;
  }

  cachedSnapshot = mergeSettingsWithSecrets(cachedPersistedSnapshot);
  cachedSnapshotKey = snapshotKey;
  return cachedSnapshot;
}

function persistSettings(next: AppSettings): void {
  if (typeof window === "undefined") return;

  const persistedSettings = sanitizePersistedAppSettingsForStorage(next);
  const raw = JSON.stringify(persistedSettings);
  try {
    if (raw !== cachedRawSettings) {
      window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, raw);
    }
  } catch {
    // Best-effort persistence only.
  }

  cachedRawSettings = raw;
  cachedPersistedSnapshot = persistedSettings;
  persistDesktopSecrets({
    openRouterApiKey: next.openRouterApiKey,
    kimiApiKey: next.kimiApiKey,
  });
}

export function subscribeAppSettings(listener: () => void): () => void {
  listeners.push(listener);

  if (typeof window === "undefined") {
    return () => {
      listeners = listeners.filter((entry) => entry !== listener);
    };
  }

  hydrateDesktopSecretsOnce();

  const onStorage = (event: StorageEvent) => {
    if (event.key === APP_SETTINGS_STORAGE_KEY) {
      emitChange();
    }
  };

  window.addEventListener("storage", onStorage);
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAppSettings() {
  const settings = useSyncExternalStore(
    subscribeAppSettings,
    getAppSettingsSnapshot,
    () => DEFAULT_APP_SETTINGS,
  );

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    const next = normalizeAppSettings(
      Schema.decodeSync(AppSettingsSchema)({
        ...getAppSettingsSnapshot(),
        ...patch,
      }),
    );
    persistSettings(next);
    emitChange();
  }, []);

  const resetSettings = useCallback(() => {
    persistSettings(DEFAULT_APP_SETTINGS);
    emitChange();
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings,
    defaults: DEFAULT_APP_SETTINGS,
  } as const;
}
