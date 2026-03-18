export interface ModelPickerOptionDisplay {
  providerLabel: string | null;
  modelLabel: string;
  usesScopedLayout: boolean;
}

export function getModelPickerOptionDisplayParts(input: {
  slug: string;
  name: string;
}): ModelPickerOptionDisplay {
  const trimmedSlug = input.slug.trim();
  const separatorIndex = trimmedSlug.indexOf("/");

  if (separatorIndex <= 0 || separatorIndex >= trimmedSlug.length - 1) {
    return {
      providerLabel: null,
      modelLabel: input.name,
      usesScopedLayout: false,
    };
  }

  return {
    providerLabel: trimmedSlug.slice(0, separatorIndex),
    modelLabel: trimmedSlug.slice(separatorIndex + 1),
    usesScopedLayout: true,
  };
}
