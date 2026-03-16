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
    }
  | {
      readonly status: "unavailable";
      readonly fetchedAt: string;
      readonly message: string;
      readonly models: ReadonlyArray<OpenRouterFreeModelOption>;
    };

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
      return {
        status: "unavailable",
        fetchedAt,
        message: `OpenRouter returned ${response.status}.`,
        models: [OPENROUTER_FREE_ROUTER_OPTION],
      };
    }

    const payload = (await response.json()) as unknown;
    return {
      status: "available",
      fetchedAt,
      models: extractOpenRouterFreeModels(payload),
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : "Could not fetch the OpenRouter model catalog.";
    return {
      status: "unavailable",
      fetchedAt,
      message,
      models: [OPENROUTER_FREE_ROUTER_OPTION],
    };
  }
}
