import { type ModelSlug, type ProviderKind } from "@t3tools/contracts";
import { isCodexOpenRouterModel, normalizeModelSlug } from "@t3tools/shared/model";
import { memo, useState } from "react";
import {
  getProviderPickerBackingProvider,
  getProviderPickerKindForSelection,
  type AvailableProviderPickerKind,
  type ProviderPickerKind,
  PROVIDER_OPTIONS,
} from "../../session-logic";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";
import {
  ClaudeAI,
  CursorIcon,
  Gemini,
  GitHubIcon,
  Icon,
  KimiIcon,
  OpenAI,
  OpenRouterIcon,
  OpenCodeIcon,
} from "../Icons";
import { cn } from "~/lib/utils";

function isAvailableProviderOption(option: (typeof PROVIDER_OPTIONS)[number]): option is {
  value: AvailableProviderPickerKind;
  label: string;
  available: true;
} {
  return option.available && option.value !== "claudeCode";
}

function getModelOptionsForProviderPicker(
  providerPickerKind: AvailableProviderPickerKind,
  modelOptionsByProvider: Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>>,
): ReadonlyArray<{ slug: string; name: string }> {
  switch (providerPickerKind) {
    case "openrouter":
      return modelOptionsByProvider.codex.filter((option) => isCodexOpenRouterModel(option.slug));
    case "codex":
      return modelOptionsByProvider.codex.filter((option) => !isCodexOpenRouterModel(option.slug));
    case "copilot":
      return modelOptionsByProvider.copilot;
    case "kimi":
      return modelOptionsByProvider.kimi;
    case "opencode":
      return modelOptionsByProvider.opencode;
    default:
      return modelOptionsByProvider.codex;
  }
}

function resolveModelForProviderPicker(
  provider: ProviderKind,
  value: string,
  options: ReadonlyArray<{ slug: string; name: string }>,
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

const PROVIDER_ICON_BY_PROVIDER: Record<ProviderPickerKind, Icon> = {
  codex: OpenAI,
  openrouter: OpenRouterIcon,
  copilot: GitHubIcon,
  kimi: KimiIcon,
  opencode: OpenCodeIcon,
  claudeCode: ClaudeAI,
  cursor: CursorIcon,
};

export const AVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter(isAvailableProviderOption);
const UNAVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter((option) => !option.available);
const COMING_SOON_PROVIDER_OPTIONS = [{ id: "gemini", label: "Gemini", icon: Gemini }] as const;

export const ProviderModelPicker = memo(function ProviderModelPicker(props: {
  provider: ProviderKind;
  model: ModelSlug;
  lockedProvider: ProviderKind | null;
  modelOptionsByProvider: Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>>;
  compact?: boolean;
  disabled?: boolean;
  onProviderModelChange: (provider: ProviderKind, model: ModelSlug) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const selectedProviderPickerKind = getProviderPickerKindForSelection(props.provider, props.model);
  const selectedProviderOptions = getModelOptionsForProviderPicker(
    selectedProviderPickerKind,
    props.modelOptionsByProvider,
  );
  const selectedModelLabel =
    selectedProviderOptions.find((option) => option.slug === props.model)?.name ?? props.model;
  const ProviderIcon = PROVIDER_ICON_BY_PROVIDER[selectedProviderPickerKind];

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={(open) => {
        if (props.disabled) {
          setIsMenuOpen(false);
          return;
        }
        setIsMenuOpen(open);
      }}
    >
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "min-w-0 shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80",
              props.compact ? "max-w-42" : "sm:px-3",
            )}
            disabled={props.disabled}
          />
        }
      >
        <span
          className={cn("flex min-w-0 items-center gap-2", props.compact ? "max-w-36" : undefined)}
        >
          <ProviderIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/70" />
          <span className="truncate">{selectedModelLabel}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3 opacity-60" />
        </span>
      </MenuTrigger>
      <MenuPopup align="start">
        {AVAILABLE_PROVIDER_OPTIONS.map((option) => {
          const OptionIcon = PROVIDER_ICON_BY_PROVIDER[option.value];
          const backingProvider = getProviderPickerBackingProvider(option.value);
          if (!backingProvider) {
            return null;
          }
          const providerOptions = getModelOptionsForProviderPicker(
            option.value,
            props.modelOptionsByProvider,
          );
          const isDisabledByProviderLock =
            props.lockedProvider !== null && props.lockedProvider !== backingProvider;
          return (
            <MenuSub key={option.value}>
              <MenuSubTrigger disabled={isDisabledByProviderLock}>
                <OptionIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground/85"
                />
                {option.label}
              </MenuSubTrigger>
              <MenuSubPopup className="[--available-height:min(24rem,70vh)]">
                <MenuGroup>
                  <MenuRadioGroup
                    value={selectedProviderPickerKind === option.value ? props.model : ""}
                    onValueChange={(value) => {
                      if (props.disabled) return;
                      if (isDisabledByProviderLock) return;
                      if (!value) return;
                      const resolvedModel = resolveModelForProviderPicker(
                        backingProvider,
                        value,
                        providerOptions,
                      );
                      if (!resolvedModel) return;
                      props.onProviderModelChange(backingProvider, resolvedModel);
                      setIsMenuOpen(false);
                    }}
                  >
                    {providerOptions.map((modelOption) => (
                      <MenuRadioItem
                        key={`${option.value}:${modelOption.slug}`}
                        value={modelOption.slug}
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {modelOption.name}
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuGroup>
              </MenuSubPopup>
            </MenuSub>
          );
        })}
        {UNAVAILABLE_PROVIDER_OPTIONS.length > 0 && <MenuDivider />}
        {UNAVAILABLE_PROVIDER_OPTIONS.map((option) => {
          const OptionIcon = PROVIDER_ICON_BY_PROVIDER[option.value];
          return (
            <MenuItem key={option.value} disabled>
              <OptionIcon
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 opacity-80",
                  option.value === "claudeCode" ? "" : "text-muted-foreground/85",
                )}
              />
              <span>{option.label}</span>
              <span className="ms-auto text-[11px] text-muted-foreground/80 uppercase tracking-[0.08em]">
                Coming soon
              </span>
            </MenuItem>
          );
        })}
        {UNAVAILABLE_PROVIDER_OPTIONS.length === 0 && <MenuDivider />}
        {COMING_SOON_PROVIDER_OPTIONS.map((option) => {
          const OptionIcon = option.icon;
          return (
            <MenuItem key={option.id} disabled>
              <OptionIcon aria-hidden="true" className="size-4 shrink-0 opacity-80" />
              <span>{option.label}</span>
              <span className="ms-auto text-[11px] text-muted-foreground/80 uppercase tracking-[0.08em]">
                Coming soon
              </span>
            </MenuItem>
          );
        })}
      </MenuPopup>
    </Menu>
  );
});
