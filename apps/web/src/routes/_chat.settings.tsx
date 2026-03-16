import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { OPENROUTER_FREE_ROUTER_MODEL, type ProviderKind } from "@t3tools/contracts";
import { getModelOptions, isCodexOpenRouterModel, normalizeModelSlug } from "@t3tools/shared/model";
import { ImagePlusIcon, LoaderCircleIcon, RefreshCwIcon, Trash2Icon, ZapIcon } from "lucide-react";

import {
  APP_SERVICE_TIER_OPTIONS,
  DEFAULT_CHAT_BACKGROUND_IMAGE_BLUR_PX,
  DEFAULT_CHAT_BACKGROUND_IMAGE_FADE_PERCENT,
  MAX_CHAT_BACKGROUND_IMAGE_BLUR_PX,
  MAX_CHAT_BACKGROUND_IMAGE_BYTES,
  MAX_CHAT_BACKGROUND_IMAGE_DATA_URL_LENGTH,
  MAX_CUSTOM_MODEL_LENGTH,
  shouldShowFastTierIcon,
  useAppSettings,
} from "../appSettings";
import { resolveAndPersistPreferredEditor } from "../editorPreferences";
import { isElectron } from "../env";
import { useChatBackgroundImage } from "../hooks/useChatBackgroundImage";
import { removeChatBackgroundBlob, saveChatBackgroundBlob } from "../lib/chatBackgroundStorage";
import { formatCompactTokenCount } from "../lib/contextWindow";
import {
  isCut3CompatibleOpenRouterModelOption,
  isOpenRouterGuaranteedFreeSlug,
  OPENROUTER_FREE_ROUTER_OPTION,
  supportsOpenRouterNativeToolCalling,
} from "../lib/openRouterModels";
import { openRouterFreeModelsQueryOptions } from "../lib/openRouterReactQuery";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import { ensureNativeApi } from "../nativeApi";
import { AppearanceSettingsSection } from "../components/AppearanceSettingsSection";
import ThreadNewButton from "../components/ThreadNewButton";
import ThreadSidebarToggle from "../components/ThreadSidebarToggle";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { APP_VERSION } from "../branding";
import { SidebarInset } from "~/components/ui/sidebar";

const MODEL_PROVIDER_SETTINGS: Array<{
  provider: ProviderKind;
  title: string;
  description: string;
  placeholder: string;
  example: string;
}> = [
  {
    provider: "copilot",
    title: "GitHub Copilot",
    description: "Save additional Copilot model slugs for the picker and `/model` command.",
    placeholder: "your-copilot-model-slug",
    example: "claude-sonnet-4.6",
  },
  {
    provider: "kimi",
    title: "Kimi Code",
    description: "Save additional Kimi Code model ids for the picker and `/model` command.",
    placeholder: "your-kimi-model-id",
    example: "kimi-for-coding",
  },
] as const;

const CHAT_BACKGROUND_IMAGE_SIZE_LIMIT_LABEL = `${Math.round(
  MAX_CHAT_BACKGROUND_IMAGE_BYTES / (1024 * 1024),
)}MB`;

function clampChatBackgroundFadePercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampChatBackgroundBlurPx(value: number): number {
  return Math.min(MAX_CHAT_BACKGROUND_IMAGE_BLUR_PX, Math.max(0, Math.round(value)));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image data."));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read image."));
    });
    reader.readAsDataURL(file);
  });
}

function getCustomModelsForProvider(
  settings: ReturnType<typeof useAppSettings>["settings"],
  provider: ProviderKind,
) {
  switch (provider) {
    case "codex":
      return settings.customCodexModels;
    case "copilot":
      return settings.customCopilotModels;
    case "kimi":
      return settings.customKimiModels;
    default:
      return settings.customCodexModels;
  }
}

function getDefaultCustomModelsForProvider(
  defaults: ReturnType<typeof useAppSettings>["defaults"],
  provider: ProviderKind,
) {
  switch (provider) {
    case "codex":
      return defaults.customCodexModels;
    case "copilot":
      return defaults.customCopilotModels;
    case "kimi":
      return defaults.customKimiModels;
    default:
      return defaults.customCodexModels;
  }
}

function patchCustomModels(provider: ProviderKind, models: string[]) {
  switch (provider) {
    case "codex":
      return { customCodexModels: models };
    case "copilot":
      return { customCopilotModels: models };
    case "kimi":
      return { customKimiModels: models };
    default:
      return { customCodexModels: models };
  }
}

function renderCapabilityBadge(label: string) {
  return (
    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function SettingsRouteView() {
  const { settings, defaults, updateSettings } = useAppSettings();
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const openRouterCatalogQuery = useQuery(openRouterFreeModelsQueryOptions());
  const [isOpeningKeybindings, setIsOpeningKeybindings] = useState(false);
  const [openKeybindingsError, setOpenKeybindingsError] = useState<string | null>(null);
  const [chatBackgroundError, setChatBackgroundError] = useState<string | null>(null);
  const [isUpdatingChatBackground, setIsUpdatingChatBackground] = useState(false);
  const [customModelInputByProvider, setCustomModelInputByProvider] = useState<
    Record<ProviderKind, string>
  >({
    codex: "",
    copilot: "",
    kimi: "",
  });
  const [customModelErrorByProvider, setCustomModelErrorByProvider] = useState<
    Partial<Record<ProviderKind, string | null>>
  >({});
  const chatBackgroundFileInputRef = useRef<HTMLInputElement | null>(null);

  const codexBinaryPath = settings.codexBinaryPath;
  const codexHomePath = settings.codexHomePath;
  const openRouterApiKey = settings.openRouterApiKey;
  const copilotBinaryPath = settings.copilotBinaryPath;
  const kimiBinaryPath = settings.kimiBinaryPath;
  const kimiApiKey = settings.kimiApiKey;
  const codexServiceTier = settings.codexServiceTier;
  const openRouterFreeModels = useMemo(
    () => openRouterCatalogQuery.data?.models ?? [OPENROUTER_FREE_ROUTER_OPTION],
    [openRouterCatalogQuery.data?.models],
  );
  const hasLiveOpenRouterCatalog = openRouterCatalogQuery.data?.status === "available";
  const compatibleOpenRouterFreeModels = useMemo(
    () => openRouterFreeModels.filter(isCut3CompatibleOpenRouterModelOption),
    [openRouterFreeModels],
  );
  const openRouterModelsBySlug = useMemo(
    () => new Map(openRouterFreeModels.map((model) => [model.slug, model])),
    [openRouterFreeModels],
  );
  const openRouterCatalogModelCount = compatibleOpenRouterFreeModels.filter(
    (model) => model.source === "catalog",
  ).length;
  const openRouterCustomModelInput = customModelInputByProvider.codex;
  const openRouterCustomModelError = customModelErrorByProvider.codex ?? null;
  const savedOpenRouterModels = settings.customCodexModels;
  const savedOpenRouterModelWarnings = useMemo(
    () =>
      new Map(
        savedOpenRouterModels.map((slug) => {
          if (
            !hasLiveOpenRouterCatalog ||
            !isCodexOpenRouterModel(slug) ||
            !isOpenRouterGuaranteedFreeSlug(slug) ||
            slug === OPENROUTER_FREE_ROUTER_MODEL
          ) {
            return [slug, null] as const;
          }

          const catalogEntry = openRouterModelsBySlug.get(slug) ?? null;
          if (catalogEntry === null) {
            return [slug, "No longer appears in OpenRouter's current live free catalog."] as const;
          }
          if (!supportsOpenRouterNativeToolCalling(catalogEntry)) {
            return [
              slug,
              "Missing OpenRouter native tool-calling support (`tools` + `tool_choice`).",
            ] as const;
          }
          return [slug, null] as const;
        }),
      ),
    [hasLiveOpenRouterCatalog, openRouterModelsBySlug, savedOpenRouterModels],
  );
  const keybindingsConfigPath = serverConfigQuery.data?.keybindingsConfigPath ?? null;
  const availableEditors = serverConfigQuery.data?.availableEditors;
  const hasChatBackgroundImage =
    settings.chatBackgroundImageAssetId.length > 0 ||
    settings.chatBackgroundImageDataUrl.length > 0;
  const chatBackgroundPreview = useChatBackgroundImage(
    settings.chatBackgroundImageAssetId,
    settings.chatBackgroundImageDataUrl,
  );
  const hasChatBackgroundImageSource = chatBackgroundPreview.url !== null;
  const chatBackgroundFadePercent = clampChatBackgroundFadePercent(
    settings.chatBackgroundImageFadePercent,
  );
  const chatBackgroundBlurPx = clampChatBackgroundBlurPx(settings.chatBackgroundImageBlurPx);
  const chatBackgroundImageOpacity = Math.max(0, (100 - chatBackgroundFadePercent) / 100);

  const openKeybindingsFile = useCallback(() => {
    if (!keybindingsConfigPath) return;
    setOpenKeybindingsError(null);
    setIsOpeningKeybindings(true);
    const api = ensureNativeApi();
    const editor = resolveAndPersistPreferredEditor(availableEditors ?? []);
    if (!editor) {
      setOpenKeybindingsError("No available editors found.");
      setIsOpeningKeybindings(false);
      return;
    }
    void api.shell
      .openInEditor(keybindingsConfigPath, editor)
      .catch((error) => {
        setOpenKeybindingsError(
          error instanceof Error ? error.message : "Unable to open keybindings file.",
        );
      })
      .finally(() => {
        setIsOpeningKeybindings(false);
      });
  }, [availableEditors, keybindingsConfigPath]);

  const saveCustomModel = useCallback(
    (provider: ProviderKind, value: string) => {
      const customModels = getCustomModelsForProvider(settings, provider);
      const normalized = normalizeModelSlug(value, provider);
      if (!normalized) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: "Enter a model slug.",
        }));
        return false;
      }
      if (getModelOptions(provider).some((option) => option.slug === normalized)) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: "That model is already built in.",
        }));
        return false;
      }
      if (normalized.length > MAX_CUSTOM_MODEL_LENGTH) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: `Model slugs must be ${MAX_CUSTOM_MODEL_LENGTH} characters or less.`,
        }));
        return false;
      }
      if (customModels.includes(normalized)) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: "That custom model is already saved.",
        }));
        return false;
      }

      if (provider === "codex" && isCodexOpenRouterModel(normalized)) {
        if (!isOpenRouterGuaranteedFreeSlug(normalized)) {
          setCustomModelErrorByProvider((existing) => ({
            ...existing,
            codex:
              "OpenRouter model ids must use `openrouter/free` or an explicit `:free` slug so CUT3 cannot drift onto a billed model.",
          }));
          return false;
        }

        if (hasLiveOpenRouterCatalog) {
          const catalogEntry = openRouterModelsBySlug.get(normalized) ?? null;
          if (normalized !== OPENROUTER_FREE_ROUTER_MODEL && catalogEntry === null) {
            setCustomModelErrorByProvider((existing) => ({
              ...existing,
              codex:
                "That OpenRouter model is not in the current live free catalog. Refresh the list and pick a currently free `:free` model.",
            }));
            return false;
          }
          if (catalogEntry && !supportsOpenRouterNativeToolCalling(catalogEntry)) {
            setCustomModelErrorByProvider((existing) => ({
              ...existing,
              codex:
                "CUT3 requires OpenRouter models that advertise both `tools` and `tool_choice`. Pick another listed free model or use `openrouter/free`.",
            }));
            return false;
          }
        }
      }

      updateSettings(patchCustomModels(provider, [...customModels, normalized]));
      setCustomModelErrorByProvider((existing) => ({
        ...existing,
        [provider]: null,
      }));
      return true;
    },
    [hasLiveOpenRouterCatalog, openRouterModelsBySlug, settings, updateSettings],
  );

  const addCustomModel = useCallback(
    (provider: ProviderKind) => {
      const customModelInput = customModelInputByProvider[provider];
      if (!saveCustomModel(provider, customModelInput)) {
        return;
      }

      setCustomModelInputByProvider((existing) => ({
        ...existing,
        [provider]: "",
      }));
    },
    [customModelInputByProvider, saveCustomModel],
  );

  const addOpenRouterCatalogModel = useCallback(
    (slug: string) => {
      saveCustomModel("codex", slug);
    },
    [saveCustomModel],
  );

  const resetOpenRouterCustomModels = useCallback(() => {
    updateSettings(
      patchCustomModels("codex", [...getDefaultCustomModelsForProvider(defaults, "codex")]),
    );
    setCustomModelErrorByProvider((existing) => ({
      ...existing,
      codex: null,
    }));
  }, [defaults, updateSettings]);

  const lastCheckedOpenRouterCatalogLabel = openRouterCatalogQuery.data
    ? new Date(openRouterCatalogQuery.data.fetchedAt).toLocaleTimeString()
    : null;

  const openRouterCatalogStatusMessage = openRouterCatalogQuery.isPending
    ? "Checking OpenRouter for the current free-model list..."
    : hasLiveOpenRouterCatalog
      ? `${openRouterCatalogModelCount} live OpenRouter free model${openRouterCatalogModelCount === 1 ? " is" : "s are"} currently compatible with CUT3's native tool-calling path, plus the built-in router.`
      : "Live OpenRouter free-model discovery is currently unavailable.";

  const openRouterCatalogError =
    openRouterCatalogQuery.data?.status === "unavailable"
      ? openRouterCatalogQuery.data.message
      : null;

  const renderCustomModelsCard = (providerSettings: (typeof MODEL_PROVIDER_SETTINGS)[number]) => {
    const provider = providerSettings.provider;
    const customModels = getCustomModelsForProvider(settings, provider);
    const customModelInput = customModelInputByProvider[provider];
    const customModelError = customModelErrorByProvider[provider] ?? null;
    return (
      <div key={provider} className="rounded-xl border border-border bg-background/50 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-foreground">{providerSettings.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{providerSettings.description}</p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <label htmlFor={`custom-model-slug-${provider}`} className="block flex-1 space-y-1">
              <span className="text-xs font-medium text-foreground">Custom model slug</span>
              <Input
                id={`custom-model-slug-${provider}`}
                value={customModelInput}
                onChange={(event) => {
                  const value = event.target.value;
                  setCustomModelInputByProvider((existing) => ({
                    ...existing,
                    [provider]: value,
                  }));
                  if (customModelError) {
                    setCustomModelErrorByProvider((existing) => ({
                      ...existing,
                      [provider]: null,
                    }));
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addCustomModel(provider);
                }}
                placeholder={providerSettings.placeholder}
                spellCheck={false}
              />
              <span className="text-xs text-muted-foreground">
                Example: <code>{providerSettings.example}</code>
              </span>
            </label>

            <Button className="sm:mt-6" type="button" onClick={() => addCustomModel(provider)}>
              Add model
            </Button>
          </div>

          {customModelError ? <p className="text-xs text-destructive">{customModelError}</p> : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>Saved custom models: {customModels.length}</p>
              {customModels.length > 0 ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    updateSettings(
                      patchCustomModels(provider, [
                        ...getDefaultCustomModelsForProvider(defaults, provider),
                      ]),
                    )
                  }
                >
                  Reset custom models
                </Button>
              ) : null}
            </div>

            {customModels.length > 0 ? (
              <div className="space-y-2">
                {customModels.map((slug) => (
                  <div
                    key={`${provider}:${slug}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {provider === "codex" && shouldShowFastTierIcon(slug, codexServiceTier) ? (
                        <ZapIcon className="size-3.5 shrink-0 text-amber-500" />
                      ) : null}
                      <code className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {slug}
                      </code>
                    </div>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => removeCustomModel(provider, slug)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground">
                No custom models saved yet.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const removeCustomModel = useCallback(
    (provider: ProviderKind, slug: string) => {
      const customModels = getCustomModelsForProvider(settings, provider);
      updateSettings(
        patchCustomModels(
          provider,
          customModels.filter((model) => model !== slug),
        ),
      );
      setCustomModelErrorByProvider((existing) => ({
        ...existing,
        [provider]: null,
      }));
    },
    [settings, updateSettings],
  );

  const openChatBackgroundPicker = useCallback(() => {
    setChatBackgroundError(null);
    chatBackgroundFileInputRef.current?.click();
  }, []);

  const removeChatBackgroundImage = useCallback(() => {
    const existingAssetId = settings.chatBackgroundImageAssetId.trim();
    setChatBackgroundError(null);
    updateSettings({
      chatBackgroundImageDataUrl: defaults.chatBackgroundImageDataUrl,
      chatBackgroundImageAssetId: defaults.chatBackgroundImageAssetId,
      chatBackgroundImageName: defaults.chatBackgroundImageName,
    });
    if (chatBackgroundFileInputRef.current) {
      chatBackgroundFileInputRef.current.value = "";
    }
    if (existingAssetId) {
      void removeChatBackgroundBlob(existingAssetId).catch(() => undefined);
    }
  }, [
    defaults.chatBackgroundImageAssetId,
    defaults.chatBackgroundImageDataUrl,
    defaults.chatBackgroundImageName,
    settings.chatBackgroundImageAssetId,
    updateSettings,
  ]);

  const handleChatBackgroundFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";
      if (!file) {
        return;
      }

      if (!file.type.startsWith("image/")) {
        setChatBackgroundError("Choose an image file.");
        return;
      }

      if (file.size > MAX_CHAT_BACKGROUND_IMAGE_BYTES) {
        setChatBackgroundError(
          `Choose an image up to ${CHAT_BACKGROUND_IMAGE_SIZE_LIMIT_LABEL} so it can be saved locally.`,
        );
        return;
      }

      setChatBackgroundError(null);
      setIsUpdatingChatBackground(true);
      try {
        const nextAssetId = crypto.randomUUID();
        await saveChatBackgroundBlob(nextAssetId, file);
        const previousAssetId = settings.chatBackgroundImageAssetId.trim();
        const dataUrlCandidate =
          file.size <= MAX_CHAT_BACKGROUND_IMAGE_DATA_URL_LENGTH
            ? await readFileAsDataUrl(file)
            : "";
        updateSettings({
          chatBackgroundImageAssetId: nextAssetId,
          chatBackgroundImageDataUrl:
            dataUrlCandidate.length <= MAX_CHAT_BACKGROUND_IMAGE_DATA_URL_LENGTH
              ? dataUrlCandidate
              : "",
          chatBackgroundImageName: file.name || "background image",
        });
        if (previousAssetId && previousAssetId !== nextAssetId) {
          void removeChatBackgroundBlob(previousAssetId).catch(() => undefined);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("IndexedDB")) {
          setChatBackgroundError(
            "This browser could not persist the chat background image locally.",
          );
        }
        if (!(error instanceof Error && error.message.includes("IndexedDB"))) {
          setChatBackgroundError(
            error instanceof Error ? error.message : "Failed to load the selected image.",
          );
        }
      } finally {
        setIsUpdatingChatBackground(false);
      }
    },
    [settings.chatBackgroundImageAssetId, updateSettings],
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-5">
            <ThreadSidebarToggle />
            <ThreadNewButton />
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Settings
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <header className="flex items-start gap-3">
              {!isElectron ? (
                <div className="flex items-center gap-2">
                  <ThreadSidebarToggle className="mt-0.5" />
                  <ThreadNewButton className="mt-0.5" />
                </div>
              ) : null}
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
                <p className="text-sm text-muted-foreground">
                  Configure app-level preferences for this device.
                </p>
              </div>
            </header>

            <AppearanceSettingsSection />

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Chat background</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add a custom image behind the chat timeline on this device.
                </p>
              </div>

              <input
                ref={chatBackgroundFileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleChatBackgroundFileChange}
              />

              <div className="space-y-4">
                <div className="overflow-hidden rounded-xl border border-border bg-background/60">
                  {hasChatBackgroundImageSource ? (
                    <div className="aspect-[16/7] overflow-hidden">
                      <div
                        className="h-full w-full scale-105 bg-cover bg-center bg-no-repeat"
                        style={{
                          backgroundImage: `linear-gradient(180deg, rgb(0 0 0 / 8%), rgb(0 0 0 / 32%)), url(${chatBackgroundPreview.url})`,
                          filter: `blur(${chatBackgroundBlurPx}px)`,
                          opacity: chatBackgroundImageOpacity,
                        }}
                      />
                    </div>
                  ) : (
                    <div className="aspect-[16/7] bg-[linear-gradient(135deg,var(--color-neutral-200),transparent_55%),linear-gradient(180deg,var(--background),color-mix(in_srgb,var(--background)_80%,var(--primary)))] dark:bg-[linear-gradient(135deg,var(--color-neutral-800),transparent_55%),linear-gradient(180deg,var(--background),color-mix(in_srgb,var(--background)_88%,var(--primary)))]" />
                  )}

                  <div className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
                    <p>
                      Status:{" "}
                      <span className="font-medium text-foreground">
                        {hasChatBackgroundImage ? "Custom image active" : "Default background"}
                      </span>
                    </p>
                    <p className="mt-1">
                      File:{" "}
                      <span className="font-medium text-foreground">
                        {settings.chatBackgroundImageName || "None"}
                      </span>
                    </p>
                    <p className="mt-1">
                      Fade:{" "}
                      <span className="font-medium text-foreground">
                        {chatBackgroundFadePercent}%
                      </span>
                    </p>
                    <p className="mt-1">
                      Blur:{" "}
                      <span className="font-medium text-foreground">{chatBackgroundBlurPx}px</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openChatBackgroundPicker}
                    disabled={isUpdatingChatBackground}
                  >
                    {isUpdatingChatBackground ? (
                      <LoaderCircleIcon className="size-4 animate-spin" />
                    ) : (
                      <ImagePlusIcon className="size-4" />
                    )}
                    {hasChatBackgroundImage ? "Change background" : "Add background"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={removeChatBackgroundImage}
                    disabled={!hasChatBackgroundImageSource || isUpdatingChatBackground}
                  >
                    <Trash2Icon className="size-4" />
                    Remove background
                  </Button>
                </div>

                <div className="space-y-4 rounded-xl border border-border bg-background/50 px-3 py-3">
                  <label className="block space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-foreground">Fade</span>
                      <span className="text-xs text-muted-foreground">
                        {chatBackgroundFadePercent}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={chatBackgroundFadePercent}
                      disabled={!hasChatBackgroundImageSource}
                      onChange={(event) =>
                        updateSettings({
                          chatBackgroundImageFadePercent: clampChatBackgroundFadePercent(
                            Number(event.target.value),
                          ),
                        })
                      }
                      className="w-full accent-primary disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label="Background fade"
                    />
                    <p className="text-xs text-muted-foreground">
                      Lower values reveal more of the image. Higher values fade it into the chat
                      surface.
                    </p>
                  </label>

                  <label className="block space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-foreground">Blur</span>
                      <span className="text-xs text-muted-foreground">
                        {chatBackgroundBlurPx}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={MAX_CHAT_BACKGROUND_IMAGE_BLUR_PX}
                      step={1}
                      value={chatBackgroundBlurPx}
                      disabled={!hasChatBackgroundImageSource}
                      onChange={(event) =>
                        updateSettings({
                          chatBackgroundImageBlurPx: clampChatBackgroundBlurPx(
                            Number(event.target.value),
                          ),
                        })
                      }
                      className="w-full accent-primary disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label="Background blur"
                    />
                    <p className="text-xs text-muted-foreground">
                      Increase blur to soften detailed wallpapers behind message content.
                    </p>
                  </label>

                  {(chatBackgroundFadePercent !== DEFAULT_CHAT_BACKGROUND_IMAGE_FADE_PERCENT ||
                    chatBackgroundBlurPx !== DEFAULT_CHAT_BACKGROUND_IMAGE_BLUR_PX) && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          updateSettings({
                            chatBackgroundImageFadePercent:
                              DEFAULT_CHAT_BACKGROUND_IMAGE_FADE_PERCENT,
                            chatBackgroundImageBlurPx: DEFAULT_CHAT_BACKGROUND_IMAGE_BLUR_PX,
                          })
                        }
                      >
                        Reset image effects
                      </Button>
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  CUT3 stores this image in local app settings on this device. Keep it at or under{" "}
                  <code>{CHAT_BACKGROUND_IMAGE_SIZE_LIMIT_LABEL}</code>.
                </p>
                {chatBackgroundError ? (
                  <p className="text-xs text-destructive">{chatBackgroundError}</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Codex App Server</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  These overrides apply to new sessions and let you use a non-default Codex install.
                </p>
              </div>

              <div className="space-y-4">
                <label htmlFor="codex-binary-path" className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">Codex binary path</span>
                  <Input
                    id="codex-binary-path"
                    value={codexBinaryPath}
                    onChange={(event) => updateSettings({ codexBinaryPath: event.target.value })}
                    placeholder="codex"
                    spellCheck={false}
                  />
                  <span className="text-xs text-muted-foreground">
                    Leave blank to use <code>codex</code> from your PATH.
                  </span>
                </label>

                <label htmlFor="codex-home-path" className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">CODEX_HOME path</span>
                  <Input
                    id="codex-home-path"
                    value={codexHomePath}
                    onChange={(event) => updateSettings({ codexHomePath: event.target.value })}
                    placeholder="/Users/you/.codex"
                    spellCheck={false}
                  />
                  <span className="text-xs text-muted-foreground">
                    Optional custom Codex home/config directory.
                  </span>
                </label>

                <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p>Binary source</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-foreground">
                      {codexBinaryPath || "PATH"}
                    </p>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    className="self-start"
                    onClick={() =>
                      updateSettings({
                        codexBinaryPath: defaults.codexBinaryPath,
                        codexHomePath: defaults.codexHomePath,
                      })
                    }
                  >
                    Reset codex overrides
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">OpenRouter</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  CUT3 exposes OpenRouter as its own top-level UI section and routes those sessions
                  through Codex under the hood, so you can use the built-in{" "}
                  <code>openrouter/free</code> router or saved OpenRouter <code>:free</code> model
                  ids without editing your normal Codex config.
                </p>
              </div>

              <div className="space-y-4">
                <label htmlFor="openrouter-api-key" className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">OpenRouter API key</span>
                  <Input
                    id="openrouter-api-key"
                    type="password"
                    value={openRouterApiKey}
                    onChange={(event) => updateSettings({ openRouterApiKey: event.target.value })}
                    placeholder="sk-or-..."
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <span className="text-xs text-muted-foreground">
                    Needed only for Codex models routed through OpenRouter.{" "}
                    {isElectron
                      ? "CUT3 keeps it in the desktop session and persists it in your OS credential store when secure storage is available."
                      : "CUT3 keeps it only in memory for the current browser session."}{" "}
                    Use <code>openrouter/free</code> for the current free-model pool, or add
                    specific <code>:free</code> slugs below.
                  </span>
                </label>

                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <p>
                    {openRouterApiKey.trim().length > 0
                      ? "OpenRouter key is configured for new Codex sessions."
                      : "Add a key to use OpenRouter-routed Codex models."}
                  </p>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        openRouterApiKey: defaults.openRouterApiKey,
                      })
                    }
                  >
                    Reset OpenRouter key
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">GitHub Copilot CLI</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  This override applies to new Copilot sessions and lets you use a non-default
                  <code> copilot</code> install.
                </p>
              </div>

              <div className="space-y-4">
                <label htmlFor="copilot-binary-path" className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">Copilot binary path</span>
                  <Input
                    id="copilot-binary-path"
                    value={copilotBinaryPath}
                    onChange={(event) => updateSettings({ copilotBinaryPath: event.target.value })}
                    placeholder="copilot"
                    spellCheck={false}
                  />
                  <span className="text-xs text-muted-foreground">
                    Leave blank to use <code>copilot</code> from your PATH.
                  </span>
                </label>

                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <p>
                    Binary source:{" "}
                    <span className="font-medium text-foreground">
                      {copilotBinaryPath || "PATH"}
                    </span>
                  </p>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        copilotBinaryPath: defaults.copilotBinaryPath,
                      })
                    }
                  >
                    Reset copilot overrides
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Kimi Code CLI</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  These overrides apply to new Kimi Code sessions. Install with{" "}
                  <code>curl -LsSf https://code.kimi.com/install.sh | bash</code> and add a Kimi
                  Code API key to let CUT3 start Kimi sessions directly.
                </p>
              </div>

              <div className="space-y-4">
                <label htmlFor="kimi-binary-path" className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">Kimi binary path</span>
                  <Input
                    id="kimi-binary-path"
                    value={kimiBinaryPath}
                    onChange={(event) => updateSettings({ kimiBinaryPath: event.target.value })}
                    placeholder="kimi"
                    spellCheck={false}
                  />
                  <span className="text-xs text-muted-foreground">
                    Leave blank to use <code>kimi</code> from your PATH.
                  </span>
                </label>

                <label htmlFor="kimi-api-key" className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">Kimi API key</span>
                  <Input
                    id="kimi-api-key"
                    type="password"
                    value={kimiApiKey}
                    onChange={(event) => updateSettings({ kimiApiKey: event.target.value })}
                    placeholder="sk-kimi-..."
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <span className="text-xs text-muted-foreground">
                    Generate this from the Kimi Code Console.{" "}
                    {isElectron
                      ? "CUT3 keeps it in the desktop session and persists it in your OS credential store when secure storage is available."
                      : "CUT3 keeps it only in memory for the current browser session."}{" "}
                    It is only used when starting new Kimi CLI sessions.
                  </span>
                </label>

                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <p>
                    Binary source:{" "}
                    <span className="font-medium text-foreground">{kimiBinaryPath || "PATH"}</span>
                  </p>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        kimiBinaryPath: defaults.kimiBinaryPath,
                        kimiApiKey: defaults.kimiApiKey,
                      })
                    }
                  >
                    Reset kimi overrides
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Models</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Save additional provider model slugs so they appear in the chat model picker and
                  `/model` command suggestions. OpenRouter free models now have their own section,
                  while the cards below handle additional provider-specific custom models.
                </p>
              </div>

              <div className="space-y-5">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">Default service tier</span>
                  <Select
                    items={APP_SERVICE_TIER_OPTIONS.map((option) => ({
                      label: option.label,
                      value: option.value,
                    }))}
                    value={codexServiceTier}
                    onValueChange={(value) => {
                      if (!value) return;
                      updateSettings({ codexServiceTier: value });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup alignItemWithTrigger={false}>
                      {APP_SERVICE_TIER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex min-w-0 items-center gap-2">
                            {option.value === "fast" ? (
                              <ZapIcon className="size-3.5 text-amber-500" />
                            ) : (
                              <span className="size-3.5 shrink-0" aria-hidden="true" />
                            )}
                            <span className="truncate">{option.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    {APP_SERVICE_TIER_OPTIONS.find((option) => option.value === codexServiceTier)
                      ?.description ?? "Use Codex defaults without forcing a service tier."}
                  </span>
                </label>

                <div className="rounded-xl border border-border bg-background/50 p-4">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">
                        OpenRouter Free Models
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        CUT3 checks OpenRouter&apos;s live catalog and lists the models that are
                        free right now. The built-in <code>{OPENROUTER_FREE_ROUTER_MODEL}</code>{" "}
                        router is always available, and you can save any live free model below so it
                        shows up in the picker and <code>/model</code> suggestions.
                      </p>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void openRouterCatalogQuery.refetch()}
                      disabled={openRouterCatalogQuery.isFetching}
                    >
                      {openRouterCatalogQuery.isFetching ? (
                        <LoaderCircleIcon className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCwIcon className="size-3.5" />
                      )}
                      Refresh list
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-background px-3 py-3 text-xs text-muted-foreground">
                      <p>{openRouterCatalogStatusMessage}</p>
                      {openRouterCatalogQuery.data?.status === "available" ? (
                        <p className="mt-1">
                          CUT3 only lists OpenRouter picks that are locked to <code>:free</code> or{" "}
                          <code>{OPENROUTER_FREE_ROUTER_MODEL}</code> and advertise tool use.
                        </p>
                      ) : null}
                      {lastCheckedOpenRouterCatalogLabel ? (
                        <p className="mt-1">Last checked at {lastCheckedOpenRouterCatalogLabel}.</p>
                      ) : null}
                      {openRouterCatalogError ? (
                        <p className="mt-2 text-destructive">{openRouterCatalogError}</p>
                      ) : null}
                    </div>

                    <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-border bg-background p-2">
                      {compatibleOpenRouterFreeModels.map((model) => {
                        const isBuiltIn = model.slug === OPENROUTER_FREE_ROUTER_MODEL;
                        const isSaved = savedOpenRouterModels.includes(model.slug);
                        return (
                          <div
                            key={model.slug}
                            className="flex flex-col gap-3 rounded-lg border border-border bg-background/70 px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-foreground">
                                  {model.name}
                                </span>
                                {model.source === "router" ? renderCapabilityBadge("Router") : null}
                                {model.contextLength !== null
                                  ? renderCapabilityBadge(
                                      `${formatCompactTokenCount(model.contextLength)} ctx`,
                                    )
                                  : null}
                                {model.supportsTools ? renderCapabilityBadge("Tools") : null}
                                {model.supportsReasoning
                                  ? renderCapabilityBadge("Reasoning")
                                  : null}
                                {model.supportsImages ? renderCapabilityBadge("Vision") : null}
                              </div>
                              <code className="mt-1 block min-w-0 truncate text-xs text-muted-foreground">
                                {model.slug}
                              </code>
                              {model.description ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {model.description}
                                </p>
                              ) : null}
                            </div>

                            <Button
                              size="xs"
                              variant={isBuiltIn || isSaved ? "outline" : "secondary"}
                              disabled={isBuiltIn || isSaved}
                              onClick={() => addOpenRouterCatalogModel(model.slug)}
                            >
                              {isBuiltIn ? "Built in" : isSaved ? "Saved" : "Add to picker"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <label
                        htmlFor="custom-model-slug-openrouter"
                        className="block flex-1 space-y-1"
                      >
                        <span className="text-xs font-medium text-foreground">
                          Additional Codex or OpenRouter model slug
                        </span>
                        <Input
                          id="custom-model-slug-openrouter"
                          value={openRouterCustomModelInput}
                          onChange={(event) => {
                            const value = event.target.value;
                            setCustomModelInputByProvider((existing) => ({
                              ...existing,
                              codex: value,
                            }));
                            if (openRouterCustomModelError) {
                              setCustomModelErrorByProvider((existing) => ({
                                ...existing,
                                codex: null,
                              }));
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            addCustomModel("codex");
                          }}
                          placeholder="meta-llama/llama-3.3-70b-instruct:free"
                          spellCheck={false}
                        />
                        <span className="text-xs text-muted-foreground">
                          Save a custom Codex model id, or paste a currently listed OpenRouter{" "}
                          <code>:free</code> slug that advertises <code>tools</code> and{" "}
                          <code>tool_choice</code> if you want to pin it manually.
                        </span>
                      </label>

                      <Button
                        className="sm:mt-6"
                        type="button"
                        onClick={() => addCustomModel("codex")}
                      >
                        Add model
                      </Button>
                    </div>

                    {openRouterCustomModelError ? (
                      <p className="text-xs text-destructive">{openRouterCustomModelError}</p>
                    ) : null}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <p>Saved Codex/OpenRouter model ids: {savedOpenRouterModels.length}</p>
                        {savedOpenRouterModels.length > 0 ? (
                          <Button size="xs" variant="outline" onClick={resetOpenRouterCustomModels}>
                            Reset saved Codex/OpenRouter models
                          </Button>
                        ) : null}
                      </div>

                      {savedOpenRouterModels.length > 0 ? (
                        <div className="space-y-2">
                          {savedOpenRouterModels.map((slug) => {
                            const warning = savedOpenRouterModelWarnings.get(slug) ?? null;
                            return (
                              <div
                                key={`openrouter:${slug}`}
                                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <code className="block min-w-0 truncate text-xs text-foreground">
                                    {slug}
                                  </code>
                                  {warning ? (
                                    <p className="mt-1 text-[11px] text-destructive">{warning}</p>
                                  ) : null}
                                </div>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => removeCustomModel("codex", slug)}
                                >
                                  Remove
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground">
                          No saved Codex/OpenRouter model ids yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {MODEL_PROVIDER_SETTINGS.map(renderCustomModelsCard)}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Threads</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose the default workspace mode for newly created draft threads.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Default to New worktree</p>
                  <p className="text-xs text-muted-foreground">
                    New threads start in New worktree mode instead of Local.
                  </p>
                </div>
                <Switch
                  checked={settings.defaultThreadEnvMode === "worktree"}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      defaultThreadEnvMode: checked ? "worktree" : "local",
                    })
                  }
                  aria-label="Default new threads to New worktree mode"
                />
              </div>

              {settings.defaultThreadEnvMode !== defaults.defaultThreadEnvMode ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        defaultThreadEnvMode: defaults.defaultThreadEnvMode,
                      })
                    }
                  >
                    Restore default
                  </Button>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Responses</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Control how assistant output is rendered during a turn.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Stream assistant messages</p>
                  <p className="text-xs text-muted-foreground">
                    Show token-by-token output while a response is in progress.
                  </p>
                </div>
                <Switch
                  checked={settings.enableAssistantStreaming}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      enableAssistantStreaming: Boolean(checked),
                    })
                  }
                  aria-label="Stream assistant messages"
                />
              </div>

              {settings.enableAssistantStreaming !== defaults.enableAssistantStreaming ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        enableAssistantStreaming: defaults.enableAssistantStreaming,
                      })
                    }
                  >
                    Restore default
                  </Button>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Keybindings</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open the persisted <code>keybindings.json</code> file to edit advanced bindings
                  directly.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">Config file path</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                      {keybindingsConfigPath ?? "Resolving keybindings path..."}
                    </p>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!keybindingsConfigPath || isOpeningKeybindings}
                    onClick={openKeybindingsFile}
                  >
                    {isOpeningKeybindings ? "Opening..." : "Open keybindings.json"}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Opens in your preferred editor selection.
                </p>
                {openKeybindingsError ? (
                  <p className="text-xs text-destructive">{openKeybindingsError}</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">Safety</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Additional guardrails for destructive local actions.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Confirm thread deletion</p>
                  <p className="text-xs text-muted-foreground">
                    Ask for confirmation before deleting a thread and its chat history.
                  </p>
                </div>
                <Switch
                  checked={settings.confirmThreadDelete}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      confirmThreadDelete: Boolean(checked),
                    })
                  }
                  aria-label="Confirm thread deletion"
                />
              </div>

              {settings.confirmThreadDelete !== defaults.confirmThreadDelete ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        confirmThreadDelete: defaults.confirmThreadDelete,
                      })
                    }
                  >
                    Restore default
                  </Button>
                </div>
              ) : null}
            </section>
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">About</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Application version and environment information.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Version</p>
                  <p className="text-xs text-muted-foreground">
                    Current version of the application.
                  </p>
                </div>
                <code className="text-xs font-medium text-muted-foreground">{APP_VERSION}</code>
              </div>
            </section>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/settings")({
  component: SettingsRouteView,
});
