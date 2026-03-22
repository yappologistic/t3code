import {
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_REASONING_EFFORT_BY_PROVIDER,
  LEGACY_MODEL_SLUGS_BY_PROVIDER,
  MODEL_CONTEXT_WINDOW_INFO_BY_PROVIDER,
  MODEL_OPTIONS_BY_PROVIDER,
  MODEL_SLUG_ALIASES_BY_PROVIDER,
  OPENROUTER_FREE_ROUTER_MODEL,
  REASONING_EFFORT_OPTIONS_BY_PROVIDER,
  type CodexReasoningEffort,
  type ModelContextWindowInfo,
  type ModelSlug,
  type ProviderKind,
} from "@t3tools/contracts";

type CatalogProvider = keyof typeof MODEL_OPTIONS_BY_PROVIDER;

const MODEL_SLUG_SET_BY_PROVIDER: Record<CatalogProvider, ReadonlySet<ModelSlug>> = {
  codex: new Set(MODEL_OPTIONS_BY_PROVIDER.codex.map((option) => option.slug)),
  copilot: new Set(MODEL_OPTIONS_BY_PROVIDER.copilot.map((option) => option.slug)),
  kimi: new Set(MODEL_OPTIONS_BY_PROVIDER.kimi.map((option) => option.slug)),
  opencode: new Set(MODEL_OPTIONS_BY_PROVIDER.opencode.map((option) => option.slug)),
};
const LEGACY_MODEL_SLUG_SET_BY_PROVIDER: Record<CatalogProvider, ReadonlySet<ModelSlug>> = {
  codex: new Set(LEGACY_MODEL_SLUGS_BY_PROVIDER.codex),
  copilot: new Set(LEGACY_MODEL_SLUGS_BY_PROVIDER.copilot),
  kimi: new Set(LEGACY_MODEL_SLUGS_BY_PROVIDER.kimi),
  opencode: new Set(LEGACY_MODEL_SLUGS_BY_PROVIDER.opencode),
};

export function getModelOptions(provider: ProviderKind = "codex") {
  return MODEL_OPTIONS_BY_PROVIDER[provider];
}

function humanizeModelQualifier(input: string): string {
  return input
    .trim()
    .split(/[\s._/-]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatKimiModelDisplayName(model: string): string {
  const trimmed = model.trim();
  let suffix = trimmed;
  for (const segment of trimmed.split("/")) {
    if (segment.length > 0) {
      suffix = segment;
    }
  }

  const parts: string[] = [];
  for (const segment of suffix.split(",")) {
    const trimmedSegment = segment.trim();
    if (trimmedSegment.length > 0) {
      parts.push(trimmedSegment);
    }
  }

  const [baseModel, ...qualifiers] = parts;

  if (!baseModel) {
    return trimmed;
  }

  const baseOption = MODEL_OPTIONS_BY_PROVIDER.kimi.find((option) => option.slug === baseModel);
  const baseLabel = baseOption?.name ?? humanizeModelQualifier(baseModel);
  if (qualifiers.length === 0) {
    return baseLabel;
  }

  const qualifierLabel = qualifiers.map(humanizeModelQualifier).filter(Boolean).join(" · ");
  return qualifierLabel.length > 0 ? `${baseLabel} · ${qualifierLabel}` : baseLabel;
}

export function getModelDisplayName(
  model: string | null | undefined,
  provider: ProviderKind = "codex",
): string {
  if (typeof model !== "string") {
    return getDefaultModel(provider);
  }

  const trimmed = model.trim();
  if (!trimmed) {
    return getDefaultModel(provider);
  }

  const direct = MODEL_OPTIONS_BY_PROVIDER[provider].find((option) => option.slug === trimmed);
  if (direct) {
    return direct.name;
  }

  const normalized = normalizeModelSlug(trimmed, provider);
  if (normalized) {
    const normalizedOption = MODEL_OPTIONS_BY_PROVIDER[provider].find(
      (option) => option.slug === normalized,
    );
    if (normalizedOption) {
      return normalizedOption.name;
    }
  }

  if (provider === "kimi") {
    return formatKimiModelDisplayName(trimmed);
  }

  return trimmed;
}

export function getModelContextWindowInfo(
  model: string | null | undefined,
  provider: ProviderKind = "codex",
): ModelContextWindowInfo | null {
  const normalized = normalizeModelSlug(model, provider);
  if (!normalized) {
    return null;
  }

  const infoByProvider = MODEL_CONTEXT_WINDOW_INFO_BY_PROVIDER[provider] as Record<
    string,
    ModelContextWindowInfo
  >;
  const info = infoByProvider[normalized];
  return info ?? null;
}

export function getDefaultModel(provider: ProviderKind = "codex"): ModelSlug {
  return DEFAULT_MODEL_BY_PROVIDER[provider];
}

export function normalizeModelSlug(
  model: string | null | undefined,
  provider: ProviderKind = "codex",
): ModelSlug | null {
  if (typeof model !== "string") {
    return null;
  }

  const trimmed = model.trim();
  if (!trimmed) {
    return null;
  }

  const aliases = MODEL_SLUG_ALIASES_BY_PROVIDER[provider] as Record<string, ModelSlug>;
  const aliased = aliases[trimmed];
  return typeof aliased === "string" ? aliased : (trimmed as ModelSlug);
}

export function isBuiltInModel(
  model: string | null | undefined,
  provider: ProviderKind = "codex",
): boolean {
  const normalized = normalizeModelSlug(model, provider);
  return normalized !== null && MODEL_SLUG_SET_BY_PROVIDER[provider].has(normalized);
}

export function isLegacyModelSlug(
  model: string | null | undefined,
  provider: ProviderKind = "codex",
): boolean {
  const normalized = normalizeModelSlug(model, provider);
  return normalized !== null && LEGACY_MODEL_SLUG_SET_BY_PROVIDER[provider].has(normalized);
}

export function isKnownModelSlug(
  model: string | null | undefined,
  provider: ProviderKind = "codex",
  options?: { readonly includeLegacy?: boolean },
): boolean {
  const normalized = normalizeModelSlug(model, provider);
  if (normalized === null) {
    return false;
  }

  return (
    MODEL_SLUG_SET_BY_PROVIDER[provider].has(normalized) ||
    (options?.includeLegacy === true && LEGACY_MODEL_SLUG_SET_BY_PROVIDER[provider].has(normalized))
  );
}

export function isCodexOpenRouterModel(model: string | null | undefined): boolean {
  const normalized = normalizeModelSlug(model, "codex");
  if (!normalized) {
    return false;
  }
  if (normalized === OPENROUTER_FREE_ROUTER_MODEL) {
    return true;
  }
  if (MODEL_SLUG_SET_BY_PROVIDER.codex.has(normalized)) {
    return false;
  }
  return normalized.includes("/") || normalized.endsWith(":free");
}

export function resolveModelSlug(
  model: string | null | undefined,
  provider: ProviderKind = "codex",
): ModelSlug {
  const normalized = normalizeModelSlug(model, provider);
  if (!normalized) {
    return getDefaultModel(provider);
  }

  return MODEL_SLUG_SET_BY_PROVIDER[provider].has(normalized)
    ? normalized
    : getDefaultModel(provider);
}

export function resolveModelSlugForProvider(
  provider: ProviderKind,
  model: string | null | undefined,
): ModelSlug {
  return resolveModelSlug(model, provider);
}

export function getReasoningEffortOptions(
  provider: ProviderKind = "codex",
): ReadonlyArray<CodexReasoningEffort> {
  return REASONING_EFFORT_OPTIONS_BY_PROVIDER[provider];
}

export function getDefaultReasoningEffort(provider: ProviderKind): CodexReasoningEffort | null;
export function getDefaultReasoningEffort(
  provider: ProviderKind = "codex",
): CodexReasoningEffort | null {
  return DEFAULT_REASONING_EFFORT_BY_PROVIDER[provider];
}

export { REASONING_EFFORT_OPTIONS_BY_PROVIDER };
