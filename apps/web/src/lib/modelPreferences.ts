import { type ProviderKind } from "@t3tools/contracts";
import { normalizeModelSlug } from "@t3tools/shared/model";

const DEFAULT_MODEL_PREFERENCE_LIMIT = 32;

export function normalizeModelPreferenceSlugs(
  models: Iterable<string | null | undefined>,
  provider: ProviderKind = "codex",
  limit = DEFAULT_MODEL_PREFERENCE_LIMIT,
  maxSlugLength = 256,
): string[] {
  const normalizedModels: string[] = [];
  const seen = new Set<string>();

  for (const candidate of models) {
    const normalized = normalizeModelSlug(candidate, provider);
    if (!normalized || normalized.length > maxSlugLength || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    normalizedModels.push(normalized);
    if (normalizedModels.length >= limit) {
      break;
    }
  }

  return normalizedModels;
}

export function buildRecentModelSelection(
  existing: ReadonlyArray<string>,
  provider: ProviderKind,
  model: string,
  limit = DEFAULT_MODEL_PREFERENCE_LIMIT,
): string[] {
  const normalizedModel = normalizeModelSlug(model, provider);
  if (!normalizedModel) {
    return [...existing];
  }

  return normalizeModelPreferenceSlugs([normalizedModel, ...existing], provider, limit);
}

export function prioritizeModelOptions<T extends { slug: string }>(
  options: ReadonlyArray<T>,
  favorites: ReadonlyArray<string>,
  recents: ReadonlyArray<string>,
): T[] {
  if (options.length <= 1) {
    return [...options];
  }

  const favoriteOrder = new Map(favorites.map((slug, index) => [slug, index] as const));
  const recentOrder = new Map(recents.map((slug, index) => [slug, index] as const));

  return [...options].toSorted((left, right) => {
    const leftFavorite = favoriteOrder.get(left.slug);
    const rightFavorite = favoriteOrder.get(right.slug);
    if (leftFavorite !== undefined || rightFavorite !== undefined) {
      if (leftFavorite === undefined) return 1;
      if (rightFavorite === undefined) return -1;
      return leftFavorite - rightFavorite;
    }

    const leftRecent = recentOrder.get(left.slug);
    const rightRecent = recentOrder.get(right.slug);
    if (leftRecent !== undefined || rightRecent !== undefined) {
      if (leftRecent === undefined) return 1;
      if (rightRecent === undefined) return -1;
      return leftRecent - rightRecent;
    }

    return 0;
  });
}
