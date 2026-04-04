import { OPENROUTER_FREE_ROUTER_MODEL } from "@t3tools/contracts";

export const OPENROUTER_MODELS_API_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_MODELS_FETCH_TIMEOUT_MS = 4_000;

export interface OpenRouterFreeModelOption {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly contextLength: number | null;
  readonly supportsTools: boolean;
  readonly supportsToolChoice: boolean;
  readonly supportsImages: boolean;
  readonly supportsReasoning: boolean;
  readonly source: "router" | "catalog";
}

export type OpenRouterFreeModelCatalog =
  | {
      readonly status: "available";
      readonly fetchedAt: string;
      readonly models: ReadonlyArray<OpenRouterFreeModelOption>;
      readonly source: "live" | "cache";
      readonly staleReason?: string;
    }
  | {
      readonly status: "unavailable";
      readonly fetchedAt: string;
      readonly message: string;
      readonly models: ReadonlyArray<OpenRouterFreeModelOption>;
    };

const OPENROUTER_FREE_MODEL_CACHE_STORAGE_KEY = "rowl:openrouter-free-models-cache:v1";

export const OPENROUTER_FREE_ROUTER_OPTION: OpenRouterFreeModelOption = {
  slug: OPENROUTER_FREE_ROUTER_MODEL,
  name: "OpenRouter Free Router",
  description:
    "Routes requests to a currently available free OpenRouter model based on request capabilities.",
  contextLength: 200_000,
  supportsTools: true,
  supportsToolChoice: true,
  supportsImages: true,
  supportsReasoning: true,
  source: "router",
};

export function isOpenRouterGuaranteedFreeSlug(model: string | null | undefined): boolean {
  if (typeof model !== "string") {
    return false;
  }

  const trimmed = model.trim();
  return trimmed === OPENROUTER_FREE_ROUTER_MODEL || trimmed.endsWith(":free");
}

export function supportsOpenRouterNativeToolCalling(
  model: Pick<OpenRouterFreeModelOption, "supportsTools" | "supportsToolChoice"> | null | undefined,
): boolean {
  return model?.supportsTools === true && model.supportsToolChoice === true;
}

export function isCut3CompatibleOpenRouterModelOption(model: OpenRouterFreeModelOption): boolean {
  return isOpenRouterGuaranteedFreeSlug(model.slug) && supportsOpenRouterNativeToolCalling(model);
}

export function supportsOpenRouterReasoningEffortControl(
  _model: OpenRouterFreeModelOption | null | undefined,
): boolean {
  // OpenRouter's public catalog currently tells us whether a model supports reasoning,
  // but not which effort levels are valid. CUT3 should not send Codex-specific effort
  // values for OpenRouter models until that metadata is available.
  return false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isZeroCostPricing(value: unknown): boolean {
  const pricing = asRecord(value);
  if (!pricing) {
    return false;
  }

  const numericValues = Object.values(pricing)
    .map(asNumber)
    .filter((entry): entry is number => entry !== null);
  if (numericValues.length === 0) {
    return false;
  }

  return numericValues.every((entry) => entry === 0);
}

export function isOpenRouterFreeModelEntry(value: unknown): boolean {
  const record = asRecord(value);
  const slug = asNonEmptyString(record?.id);
  if (!slug) {
    return false;
  }

  if (slug === OPENROUTER_FREE_ROUTER_MODEL || slug.endsWith(":free")) {
    return true;
  }

  return isZeroCostPricing(record?.pricing);
}

export function parseOpenRouterFreeModelCatalogEntry(
  value: unknown,
): OpenRouterFreeModelOption | null {
  const record = asRecord(value);
  const slug = asNonEmptyString(record?.id);
  if (!record || !slug || !isOpenRouterFreeModelEntry(record)) {
    return null;
  }

  const supportedParameters = Array.isArray(record.supported_parameters)
    ? record.supported_parameters.filter((entry): entry is string => typeof entry === "string")
    : [];
  const architecture = asRecord(record.architecture);
  const inputModalities = Array.isArray(architecture?.input_modalities)
    ? architecture.input_modalities.filter((entry): entry is string => typeof entry === "string")
    : [];

  return {
    slug,
    name: asNonEmptyString(record.name) ?? slug,
    description: asNonEmptyString(record.description),
    contextLength: asNumber(record.context_length),
    supportsTools: supportedParameters.includes("tools"),
    supportsToolChoice: supportedParameters.includes("tool_choice"),
    supportsImages: inputModalities.includes("image"),
    supportsReasoning:
      supportedParameters.includes("reasoning") ||
      supportedParameters.includes("include_reasoning"),
    source: "catalog",
  };
}

export function extractOpenRouterFreeModels(
  payload: unknown,
): ReadonlyArray<OpenRouterFreeModelOption> {
  const record = asRecord(payload);
  const rows = Array.isArray(record?.data) ? record.data : [];
  const seen = new Set<string>([OPENROUTER_FREE_ROUTER_OPTION.slug]);
  const models: OpenRouterFreeModelOption[] = [OPENROUTER_FREE_ROUTER_OPTION];

  for (const row of rows) {
    const parsed = parseOpenRouterFreeModelCatalogEntry(row);
    if (!parsed) {
      continue;
    }
    if (parsed.slug === OPENROUTER_FREE_ROUTER_OPTION.slug) {
      models[0] = {
        ...OPENROUTER_FREE_ROUTER_OPTION,
        ...parsed,
        source: "router",
      };
      continue;
    }
    if (seen.has(parsed.slug)) {
      continue;
    }
    seen.add(parsed.slug);
    models.push(parsed);
  }

  return [
    models[0],
    ...models.slice(1).toSorted((left, right) => left.name.localeCompare(right.name)),
  ].filter((entry): entry is OpenRouterFreeModelOption => entry !== undefined);
}

function readCachedOpenRouterFreeModelOption(value: unknown): OpenRouterFreeModelOption | null {
  const record = asRecord(value);
  const slug = asNonEmptyString(record?.slug);
  const name = asNonEmptyString(record?.name);
  const source = record?.source;
  if (!slug || !name || (source !== "router" && source !== "catalog")) {
    return null;
  }

  return {
    slug,
    name,
    description: record?.description === null ? null : asNonEmptyString(record?.description),
    contextLength: asNumber(record?.contextLength),
    supportsTools: record?.supportsTools === true,
    supportsToolChoice: record?.supportsToolChoice === true,
    supportsImages: record?.supportsImages === true,
    supportsReasoning: record?.supportsReasoning === true,
    source,
  };
}

function readCachedOpenRouterFreeModelCatalog(): {
  readonly fetchedAt: string;
  readonly models: ReadonlyArray<OpenRouterFreeModelOption>;
} | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(OPENROUTER_FREE_MODEL_CACHE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as {
      fetchedAt?: unknown;
      models?: unknown;
    };
    if (typeof parsed.fetchedAt !== "string" || !Array.isArray(parsed.models)) {
      return null;
    }
    const cachedModels = parsed.models
      .map(readCachedOpenRouterFreeModelOption)
      .filter((entry): entry is OpenRouterFreeModelOption => entry !== null);
    const cachedRouterModel =
      cachedModels.find((entry) => entry.slug === OPENROUTER_FREE_ROUTER_OPTION.slug) ??
      OPENROUTER_FREE_ROUTER_OPTION;
    const models = [
      { ...OPENROUTER_FREE_ROUTER_OPTION, ...cachedRouterModel, source: "router" as const },
      ...cachedModels.filter((entry) => entry.slug !== OPENROUTER_FREE_ROUTER_OPTION.slug),
    ];
    return {
      fetchedAt: parsed.fetchedAt,
      models,
    };
  } catch {
    return null;
  }
}

function writeCachedOpenRouterFreeModelCatalog(
  catalog: Pick<OpenRouterFreeModelCatalog, "fetchedAt" | "models">,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      OPENROUTER_FREE_MODEL_CACHE_STORAGE_KEY,
      JSON.stringify({
        fetchedAt: catalog.fetchedAt,
        models: catalog.models,
      }),
    );
  } catch {
    // Best-effort cache only.
  }
}

function buildUnavailableOpenRouterFreeModelCatalog(
  fetchedAt: string,
  message: string,
): OpenRouterFreeModelCatalog {
  const cachedCatalog = readCachedOpenRouterFreeModelCatalog();
  if (cachedCatalog) {
    return {
      status: "available",
      fetchedAt: cachedCatalog.fetchedAt,
      models: cachedCatalog.models,
      source: "cache",
      staleReason: message,
    };
  }

  return {
    status: "unavailable",
    fetchedAt,
    message,
    models: [OPENROUTER_FREE_ROUTER_OPTION],
  };
}

export async function readOpenRouterFreeModelCatalog(
  fetchImpl: typeof fetch = fetch,
): Promise<OpenRouterFreeModelCatalog> {
  const fetchedAt = new Date().toISOString();

  try {
    const response = await fetchImpl(OPENROUTER_MODELS_API_URL, {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(OPENROUTER_MODELS_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return buildUnavailableOpenRouterFreeModelCatalog(
        fetchedAt,
        `OpenRouter returned ${response.status}.`,
      );
    }

    const payload = (await response.json()) as unknown;
    const models = extractOpenRouterFreeModels(payload);
    writeCachedOpenRouterFreeModelCatalog({ fetchedAt, models });
    return {
      status: "available",
      fetchedAt,
      models,
      source: "live",
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : "Could not fetch the OpenRouter model catalog.";
    return buildUnavailableOpenRouterFreeModelCatalog(fetchedAt, message);
  }
}
