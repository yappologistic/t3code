import { type ModelSlug, type ProviderKind, type ServerCopilotUsage } from "@t3tools/contracts";
import {
  getModelContextWindowInfo,
  isCodexOpenRouterModel,
  normalizeModelSlug,
} from "@t3tools/shared/model";

import {
  getProviderPickerBackingProvider,
  type AvailableProviderPickerKind,
} from "../session-logic";
import { formatCopilotRequestCost } from "./copilotBilling";
import { formatCompactTokenCount } from "./contextWindow";
import { prioritizeModelOptions } from "./modelPreferences";

// ---------------------------------------------------------------------------
// Picker model option type
// ---------------------------------------------------------------------------

export type PickerModelOption = {
  slug: string;
  name: string;
  isCustom?: boolean;
  supportsReasoning?: boolean;
  supportsImageInput?: boolean;
  contextWindowTokens?: number;
};

// ---------------------------------------------------------------------------
// Merge / deduplicate model option arrays
// ---------------------------------------------------------------------------

export function mergeModelOptions(
  base: ReadonlyArray<PickerModelOption>,
  extra: ReadonlyArray<PickerModelOption>,
): Array<PickerModelOption> {
  const merged: Array<PickerModelOption> = [];
  const indexBySlug = new Map<string, number>();

  for (const option of [...base, ...extra]) {
    const existingIndex = indexBySlug.get(option.slug);
    if (existingIndex === undefined) {
      indexBySlug.set(option.slug, merged.length);
      merged.push(option);
      continue;
    }

    const existing = merged[existingIndex]!;
    const supportsReasoning = existing.supportsReasoning ?? option.supportsReasoning;
    const supportsImageInput = existing.supportsImageInput ?? option.supportsImageInput;
    const contextWindowTokens = existing.contextWindowTokens ?? option.contextWindowTokens;
    merged[existingIndex] = {
      ...option,
      ...existing,
      ...(supportsReasoning !== undefined ? { supportsReasoning } : {}),
      ...(supportsImageInput !== undefined ? { supportsImageInput } : {}),
      ...(contextWindowTokens !== undefined ? { contextWindowTokens } : {}),
    };
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Model options resolved per picker kind
// ---------------------------------------------------------------------------

export function getModelOptionsForProviderPicker(
  providerPickerKind: AvailableProviderPickerKind,
  modelOptionsByProvider: Record<ProviderKind, ReadonlyArray<PickerModelOption>>,
  openRouterModelOptions: ReadonlyArray<PickerModelOption>,
  opencodeModelOptions: ReadonlyArray<PickerModelOption>,
): ReadonlyArray<PickerModelOption> {
  switch (providerPickerKind) {
    case "openrouter":
      return openRouterModelOptions;
    case "codex":
      return modelOptionsByProvider.codex.filter((option) => !isCodexOpenRouterModel(option.slug));
    case "copilot":
      return modelOptionsByProvider.copilot;
    case "opencode":
      return mergeModelOptions(modelOptionsByProvider.opencode, opencodeModelOptions);
    case "kimi":
      return modelOptionsByProvider.kimi;
    case "pi":
      return modelOptionsByProvider.pi;
    default:
      return modelOptionsByProvider.codex;
  }
}

// ---------------------------------------------------------------------------
// Resolve typed model slug from a raw user selection
// ---------------------------------------------------------------------------

export function resolveModelForProviderPicker(
  provider: ProviderKind,
  value: string,
  options: ReadonlyArray<PickerModelOption>,
): ModelSlug | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const direct = options.find((option) => option.slug === trimmedValue);
  if (direct) {
    return direct.slug;
  }

  const byName = options.find((option) => option.name.toLowerCase() === trimmedValue.toLowerCase());
  if (byName) {
    return byName.slug;
  }

  const normalized = normalizeModelSlug(trimmedValue, provider);
  if (!normalized) {
    return null;
  }

  const resolved = options.find((option) => option.slug === normalized);
  if (resolved) {
    return resolved.slug;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Find a model option by slug
// ---------------------------------------------------------------------------

export function findModelOptionBySlug(
  options: ReadonlyArray<PickerModelOption>,
  slug: string | null | undefined,
): PickerModelOption | null {
  const normalizedSlug = typeof slug === "string" && slug.trim().length > 0 ? slug.trim() : null;
  if (!normalizedSlug) {
    return null;
  }
  return options.find((option) => option.slug === normalizedSlug) ?? null;
}

// ---------------------------------------------------------------------------
// Context label per model option
// ---------------------------------------------------------------------------

export function getModelOptionContextLabel(
  provider: ProviderKind,
  modelOption: PickerModelOption,
  openRouterContextLengthsBySlug?: ReadonlyMap<string, number | null>,
  opencodeContextLengthsBySlug?: ReadonlyMap<string, number | null>,
): string {
  const contextInfo = getModelContextWindowInfo(modelOption.slug, provider);
  const catalogContextLength = openRouterContextLengthsBySlug?.get(modelOption.slug) ?? null;
  const opencodeContextLength = opencodeContextLengthsBySlug?.get(modelOption.slug) ?? null;
  const contextLabel =
    opencodeContextLength !== null
      ? formatCompactTokenCount(opencodeContextLength)
      : typeof modelOption.contextWindowTokens === "number"
        ? formatCompactTokenCount(modelOption.contextWindowTokens)
        : contextInfo?.totalTokens !== undefined
          ? formatCompactTokenCount(contextInfo.totalTokens)
          : catalogContextLength !== null
            ? formatCompactTokenCount(catalogContextLength)
            : "";

  if (provider !== "copilot") {
    return contextLabel;
  }

  const requestCost = formatCopilotRequestCost(modelOption.slug);
  return [contextLabel, requestCost].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// Provider section descriptions
// ---------------------------------------------------------------------------

export function getProviderPickerSectionDescription(provider: AvailableProviderPickerKind): string {
  switch (provider) {
    case "codex":
      return "Native Codex models from your local Codex setup.";
    case "openrouter":
      return "OpenRouter-routed models that run through Codex.";
    case "copilot":
      return "GitHub Copilot chat models discovered from your local runtime.";
    case "kimi":
      return "Kimi Code sessions backed by either `kimi login` / `/login` CLI auth or a configured Kimi API key.";
    case "opencode":
      return "OpenCode models discovered from your local OpenCode runtime.";
    case "pi":
      return "Pi agent harness sessions discovered from your local Pi auth/config using provider/model ids.";
    default:
      return "Available models.";
  }
}

// ---------------------------------------------------------------------------
// Copilot usage helpers
// ---------------------------------------------------------------------------

type AvailableCopilotUsage = {
  status: "available";
  source: "copilot_internal_user";
  fetchedAt: string;
  login: string;
  plan?: string;
  entitlement: number;
  remaining: number;
  used: number;
  percentRemaining: number;
  overagePermitted: boolean;
  overageCount: number;
  unlimited: boolean;
  resetAt: string;
};

type UnavailableCopilotUsage = {
  status: "requires-auth" | "unavailable";
  fetchedAt: string;
  source?: "copilot_internal_user";
  message: string;
};

export function isAvailableCopilotUsage(
  usage: ServerCopilotUsage | null,
): usage is AvailableCopilotUsage {
  return usage !== null && usage.status === "available";
}

export function isUnavailableCopilotUsage(
  usage: ServerCopilotUsage | null,
): usage is UnavailableCopilotUsage {
  return usage !== null && usage.status !== "available";
}

// ---------------------------------------------------------------------------
// Model family grouping (groups models by family for better visual hierarchy)
// ---------------------------------------------------------------------------

type ModelFamily = {
  key: string;
  label: string;
  models: PickerModelOption[];
};

/**
 * Groups models into families based on slug/name patterns.
 * E.g. "Claude Sonnet 4.5", "Claude Opus 4.6" → "Claude" family.
 * Returns an array preserving original order, with ungrouped models in a
 * catch-all family at the end.
 */
export function groupModelsByFamily(
  models: ReadonlyArray<PickerModelOption>,
  provider: AvailableProviderPickerKind,
): ModelFamily[] {
  // For providers with very few models, skip grouping
  if (models.length <= 3) {
    return [{ key: "__all__", label: "", models: [...models] }];
  }

  const familyPatterns = getFamilyPatterns(provider);
  const familyMap = new Map<string, PickerModelOption[]>();
  const familyOrder: string[] = [];
  const ungrouped: PickerModelOption[] = [];

  for (const model of models) {
    const matchedFamily = familyPatterns.find((pattern) => pattern.test(model.slug, model.name));

    if (matchedFamily) {
      const existing = familyMap.get(matchedFamily.key);
      if (existing) {
        existing.push(model);
      } else {
        familyMap.set(matchedFamily.key, [model]);
        familyOrder.push(matchedFamily.key);
      }
    } else {
      ungrouped.push(model);
    }
  }

  const families: ModelFamily[] = [];

  for (const key of familyOrder) {
    const models = familyMap.get(key);
    if (!models || models.length === 0) continue;
    const pattern = familyPatterns.find((p) => p.key === key);
    families.push({
      key,
      label: pattern?.label ?? key,
      models,
    });
  }

  if (ungrouped.length > 0) {
    families.push({ key: "__other__", label: "Other", models: ungrouped });
  }

  return families;
}

type FamilyPattern = {
  key: string;
  label: string;
  test: (slug: string, name: string) => boolean;
};

function getFamilyPatterns(_provider: AvailableProviderPickerKind): FamilyPattern[] {
  // Model-family patterns that apply across providers.
  // Order matters: the first matching pattern wins.
  return [
    {
      key: "claude",
      label: "Claude",
      test: (slug, name) => slug.startsWith("claude-") || name.toLowerCase().startsWith("claude"),
    },
    {
      key: "gemini",
      label: "Gemini",
      test: (slug, name) => slug.startsWith("gemini-") || name.toLowerCase().startsWith("gemini"),
    },
    {
      key: "gpt",
      label: "GPT",
      test: (slug, name) => slug.startsWith("gpt-") || name.toLowerCase().startsWith("gpt"),
    },
    {
      key: "grok",
      label: "Grok",
      test: (slug, name) => slug.startsWith("grok-") || name.toLowerCase().startsWith("grok"),
    },
    {
      key: "kimi",
      label: "Kimi",
      test: (slug, name) => slug.startsWith("kimi") || name.toLowerCase().startsWith("kimi"),
    },
    {
      key: "openrouter",
      label: "OpenRouter",
      test: (slug) => slug.startsWith("openrouter/"),
    },
  ];
}

// ---------------------------------------------------------------------------
// Provider section builder for the picker popover
// ---------------------------------------------------------------------------

export interface PickerProviderSection {
  option: { value: AvailableProviderPickerKind; label: string; available: true };
  backingProvider: ProviderKind;
  modelOptions: ReadonlyArray<PickerModelOption>;
  families: ModelFamily[];
  isDisabledByProviderLock: boolean;
}

export function buildPickerProviderSections(input: {
  availableOptions: ReadonlyArray<{
    value: AvailableProviderPickerKind;
    label: string;
    available: true;
  }>;
  visibleModelOptionsByProvider: Record<ProviderKind, ReadonlyArray<PickerModelOption>>;
  openRouterModelOptions: ReadonlyArray<PickerModelOption>;
  opencodeModelOptions: ReadonlyArray<PickerModelOption>;
  favoriteModelsByProvider: Record<ProviderKind, ReadonlyArray<string>>;
  recentModelsByProvider: Record<ProviderKind, ReadonlyArray<string>>;
  lockedProvider: ProviderKind | null;
  normalizedQuery: string;
}): PickerProviderSection[] {
  return input.availableOptions
    .map((option) => {
      const backingProvider = getProviderPickerBackingProvider(option.value);
      if (!backingProvider) {
        return null;
      }

      const modelOptions = getModelOptionsForProviderPicker(
        option.value,
        input.visibleModelOptionsByProvider,
        input.openRouterModelOptions,
        input.opencodeModelOptions,
      );
      const filteredModelOptions = modelOptions.filter((modelOption) => {
        if (!input.normalizedQuery) {
          return true;
        }
        const haystack = [option.label, modelOption.slug, modelOption.name].join(" ").toLowerCase();
        return haystack.includes(input.normalizedQuery);
      });
      const prioritizedModelOptions = prioritizeModelOptions(
        filteredModelOptions,
        input.favoriteModelsByProvider[backingProvider],
        input.recentModelsByProvider[backingProvider],
      );

      if (filteredModelOptions.length === 0 && input.normalizedQuery) {
        return null;
      }

      const isDisabledByProviderLock =
        input.lockedProvider !== null && input.lockedProvider !== backingProvider;

      const families = groupModelsByFamily(prioritizedModelOptions, option.value);

      return {
        option,
        backingProvider,
        modelOptions: prioritizedModelOptions,
        families,
        isDisabledByProviderLock,
      };
    })
    .filter((section): section is NonNullable<typeof section> => section !== null);
}
