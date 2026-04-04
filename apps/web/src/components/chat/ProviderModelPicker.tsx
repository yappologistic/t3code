import { type ModelSlug, type ProviderKind, type ServerCopilotUsage } from "@t3tools/contracts";
import { getModelDisplayName } from "@t3tools/shared/model";
import { formatGitHubCopilotPlan } from "@t3tools/shared/copilotPlan";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getProviderPickerBackingProvider,
  type AvailableProviderPickerKind,
  type ProviderPickerKind,
  PROVIDER_OPTIONS,
} from "../../session-logic";
import {
  type PickerModelOption,
  getModelOptionsForProviderPicker,
  getModelOptionContextLabel,
  getProviderPickerSectionDescription,
  resolveModelForProviderPicker,
  isAvailableCopilotUsage,
  isUnavailableCopilotUsage,
  buildPickerProviderSections,
} from "../../lib/modelPickerHelpers";
import { getModelPickerOptionDisplayParts } from "../../lib/modelPickerOptionDisplay";
import {
  describeContextWindowState,
  getDocumentedContextWindowOverride,
  shouldHideContextWindowForModel,
} from "../../lib/contextWindow";
import { serverCopilotUsageQueryOptions } from "../../lib/serverReactQuery";
import { type AppServiceTier, shouldShowFastTierIcon } from "../../appSettings";
import { getAppLanguageDetails, type AppLanguage } from "../../appLanguage";

import {
  BarChart3Icon,
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  ZapIcon,
  BrainCircuitIcon,
  EyeIcon,
  SparklesIcon,
  ChevronsUpDownIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "../ui/collapsible";
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

import type { Thread } from "../../types";

// ---------------------------------------------------------------------------
// Re-exports for consumers that import from here
// ---------------------------------------------------------------------------

export type { PickerModelOption };

// ---------------------------------------------------------------------------
// Shared icon & option constants
// ---------------------------------------------------------------------------

function isAvailableProviderOption(option: (typeof PROVIDER_OPTIONS)[number]): option is {
  value: AvailableProviderPickerKind;
  label: string;
  available: true;
} {
  return option.available && option.value !== "claudeCode";
}

export const PROVIDER_ICON_BY_PROVIDER: Record<ProviderPickerKind, Icon> = {
  codex: OpenAI,
  openrouter: OpenRouterIcon,
  copilot: GitHubIcon,
  kimi: KimiIcon,
  opencode: OpenCodeIcon,
  pi: BotIcon,
  claudeCode: ClaudeAI,
  cursor: CursorIcon,
};

export const AVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter(isAvailableProviderOption);
export const UNAVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter((option) => !option.available);
export const COMING_SOON_PROVIDER_OPTIONS = [
  { id: "gemini", label: "Gemini", icon: Gemini },
] as const;

// ---------------------------------------------------------------------------
// Copilot usage surface copy
// ---------------------------------------------------------------------------

function formatCopilotQuotaDate(iso: string, language: AppLanguage): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return language === "fa" ? "به زودی" : "soon";
  }
  return new Intl.DateTimeFormat(getAppLanguageDetails(language).locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parsed));
}

// ---------------------------------------------------------------------------
// Context window summary
// ---------------------------------------------------------------------------

function renderProviderContextWindowSummary(input: {
  provider: ProviderKind;
  model: string | null | undefined;
  tokenUsage?: unknown;
  opencodeContextLengthsBySlug?: ReadonlyMap<string, number | null>;
}) {
  if (shouldHideContextWindowForModel(input.provider, input.model)) {
    return null;
  }

  const state = describeContextWindowState({
    provider: input.provider,
    model: input.model,
    tokenUsage: input.tokenUsage,
    ...getDocumentedContextWindowOverride(input),
  });

  if (
    state.totalTokens !== null &&
    state.usedTokens !== null &&
    state.totalLabel &&
    state.usedLabel &&
    state.remainingLabel
  ) {
    const usageTitle =
      state.usageScope === "thread" ? "Latest thread snapshot" : "Last completed turn";
    return (
      <div className="space-y-1 px-3 py-2.5">
        <div className="font-medium text-[11px] text-muted-foreground/85 uppercase tracking-[0.12em]">
          Context window
        </div>
        <div className="text-sm font-medium">{usageTitle}</div>
        <div className="text-muted-foreground/90 text-xs">{`${state.usedLabel} / ${state.totalLabel} used`}</div>
        <div className="text-muted-foreground/90 text-xs">{`${state.remainingLabel} left`}</div>
        {state.note ? (
          <div className="text-muted-foreground/75 text-[11px] leading-relaxed">{state.note}</div>
        ) : null}
      </div>
    );
  }

  if (state.totalTokens !== null && state.totalLabel) {
    return (
      <div className="space-y-1 px-3 py-2.5">
        <div className="font-medium text-[11px] text-muted-foreground/85 uppercase tracking-[0.12em]">
          Context window
        </div>
        <div className="text-sm font-medium">{`${state.totalLabel} documented total`}</div>
        <div className="text-muted-foreground/90 text-xs">
          Usage appears once the provider reports it.
        </div>
        {state.note ? (
          <div className="text-muted-foreground/75 text-[11px] leading-relaxed">{state.note}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1 px-3 py-2.5">
      <div className="font-medium text-[11px] text-muted-foreground/85 uppercase tracking-[0.12em]">
        Context window
      </div>
      <div className="text-sm">Total context window unavailable</div>
      <div className="text-muted-foreground/80 text-xs leading-relaxed">
        {state.note ??
          "This provider does not currently expose a separately documented total for this model."}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copilot usage summary
// ---------------------------------------------------------------------------

function renderCopilotUsageSummary(
  usage: ServerCopilotUsage | null,
  isLoading: boolean,
  language: AppLanguage,
) {
  if (isLoading && usage === null) {
    return (
      <div className="space-y-1 px-3 py-2.5">
        <div className="font-medium text-[11px] text-muted-foreground/85 uppercase tracking-[0.12em]">
          {language === "fa" ? "مصرف GitHub Copilot" : "GitHub Copilot billing"}
        </div>
        <div className="text-sm">
          {language === "fa"
            ? "در حال بارگذاری درخواست های پریمیوم..."
            : "Loading premium requests..."}
        </div>
      </div>
    );
  }

  if (usage === null) {
    return null;
  }

  if (isUnavailableCopilotUsage(usage)) {
    return (
      <div className="space-y-1 px-3 py-2.5">
        <div className="font-medium text-[11px] text-muted-foreground/85 uppercase tracking-[0.12em]">
          {language === "fa" ? "مصرف GitHub Copilot" : "GitHub Copilot billing"}
        </div>
        <div className="text-sm">
          {language === "fa" ? "درخواست های پریمیوم در دسترس نیست" : "Premium requests unavailable"}
        </div>
        <div className="text-muted-foreground/80 text-xs leading-relaxed">{usage.message}</div>
      </div>
    );
  }

  if (!isAvailableCopilotUsage(usage)) {
    return null;
  }

  const planLabel = formatGitHubCopilotPlan(usage.plan);

  return (
    <div className="space-y-1 px-3 py-2.5">
      <div className="font-medium text-[11px] text-muted-foreground/85 uppercase tracking-[0.12em]">
        {language === "fa" ? "مصرف باقی مانده" : "Usage remaining"}
      </div>
      <div className="text-sm font-medium">
        {language === "fa" ? "درخواست های پریمیوم" : "Premium requests"}
      </div>
      <div className="text-muted-foreground/90 text-xs">
        {language === "fa"
          ? `${usage.remaining} / ${usage.entitlement} باقی مانده · بازنشانی در ${formatCopilotQuotaDate(usage.resetAt, language)}`
          : `${usage.remaining} / ${usage.entitlement} left · resets ${formatCopilotQuotaDate(usage.resetAt, language)}`}
      </div>
      <div className="text-muted-foreground/75 text-[11px]">
        {[planLabel, usage.login].filter(Boolean).join(" · ")}
      </div>
      <div className="pt-1 text-muted-foreground/80 text-[11px] leading-relaxed">
        {language === "fa"
          ? "برآورد هزینه اضافه برای هر درخواست پس از تمام شدن درخواست های پریمیوم شامل شده نمایش داده می شود."
          : "Per-request overage below is estimated after included premium requests are exhausted."}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Surface copy
// ---------------------------------------------------------------------------

function getChatPickerCopy(language: AppLanguage) {
  if (language === "fa") {
    return {
      comingSoon: "به زودی",
      searchPlaceholder: "جستجوی مدل ها یا ارائه دهندگان",
      noModelsMatch: "هیچ مدل قابل مشاهده ای با این جستجو مطابقت ندارد.",
      tryDifferentSearch:
        "نام مدل یا ارائه دهنده دیگری را امتحان کنید یا مدیریت مدل ها را باز کنید.",
      clearSearch: "پاک کردن جستجو",
      manageModels: "مدیریت مدل ها",
      connectProvider: "آماده سازی ارائه دهنده",
      hiddenModelsHint: "برخی مدل ها مخفی هستند. از مدیریت مدل ها برای بازیابی آنها استفاده کنید.",
      pickModelHint: "یک مدل انتخاب کنید تا فوراً این thread تغییر کند.",
      models: (count: number) => `${count} مدل`,
      selected: "انتخاب شده",
      favorite: "محبوب",
      recent: "اخیر",
      locked: "قفل شده",
      current: "فعلی",
    };
  }
  return {
    comingSoon: "Coming soon",
    searchPlaceholder: "Search models or providers",
    noModelsMatch: "No visible models match this search.",
    tryDifferentSearch:
      "Try a different model slug or open Manage models to restore hidden entries.",
    clearSearch: "Clear search",
    manageModels: "Manage models",
    connectProvider: "Provider readiness",
    hiddenModelsHint: "Some models are hidden. Use Manage models to restore them.",
    pickModelHint: "Pick a model to switch this thread instantly.",
    models: (count: number) => `${count} model${count === 1 ? "" : "s"}`,
    selected: "Selected",
    favorite: "Favorite",
    recent: "Recent",
    locked: "Locked",
    current: "Current",
  };
}

// ---------------------------------------------------------------------------
// Model row component
// ---------------------------------------------------------------------------

const PickerModelRow = memo(function PickerModelRow(props: {
  modelOption: PickerModelOption;
  backingProvider: ProviderKind;
  providerPickerKind: AvailableProviderPickerKind;
  isSelected: boolean;
  isFavorite: boolean;
  isRecent: boolean;
  favoriteLabel: string;
  recentLabel: string;
  isDisabledByProviderLock: boolean;
  disabled: boolean;
  serviceTierSetting: AppServiceTier;
  openRouterContextLengthsBySlug: ReadonlyMap<string, number | null>;
  opencodeContextLengthsBySlug: ReadonlyMap<string, number | null>;
  onSelect: () => void;
}) {
  const displayParts = getModelPickerOptionDisplayParts(props.modelOption);
  const contextLabel = getModelOptionContextLabel(
    props.backingProvider,
    props.modelOption,
    props.openRouterContextLengthsBySlug,
    props.opencodeContextLengthsBySlug,
  );

  return (
    <button
      type="button"
      disabled={props.isDisabledByProviderLock || props.disabled}
      className={cn(
        "group/model-row relative flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        props.isSelected && "bg-primary/[0.045]",
      )}
      onClick={props.onSelect}
    >
      {/* Active indicator bar */}
      {props.isSelected ? (
        <span className="absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-primary/70" />
      ) : null}

      {/* Model info */}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm leading-snug",
              props.isSelected ? "font-semibold text-foreground" : "font-medium text-foreground/90",
            )}
          >
            {displayParts.usesScopedLayout ? displayParts.modelLabel : props.modelOption.name}
          </span>
          {props.backingProvider === "codex" &&
          shouldShowFastTierIcon(props.modelOption.slug, props.serviceTierSetting) ? (
            <Badge variant="warning" size="sm">
              <ZapIcon className="size-3" />
              Fast
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {displayParts.usesScopedLayout ? (
            <span className="inline-flex items-center rounded bg-muted/70 px-1.5 py-px font-mono text-[10px] font-medium text-muted-foreground/80 leading-tight">
              {displayParts.providerLabel}
            </span>
          ) : null}
          <span className="truncate text-[11px] text-muted-foreground/70">
            {props.modelOption.slug}
          </span>
        </div>
      </div>

      {/* Capability badges + selection mark */}
      <div className="flex shrink-0 items-center gap-1.5">
        {props.isFavorite ? (
          <Badge variant="warning" size="sm">
            <SparklesIcon className="size-3" />
            {props.favoriteLabel}
          </Badge>
        ) : props.isRecent ? (
          <Badge variant="outline" size="sm">
            {props.recentLabel}
          </Badge>
        ) : null}
        {props.modelOption.supportsReasoning ? (
          <span
            title="Supports reasoning"
            className="inline-flex size-6 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400"
          >
            <BrainCircuitIcon className="size-3.5" />
          </span>
        ) : null}
        {props.modelOption.supportsImageInput ? (
          <span
            title="Supports image input"
            className="inline-flex size-6 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
          >
            <EyeIcon className="size-3.5" />
          </span>
        ) : null}
        {contextLabel ? (
          <span className="text-[11px] tabular-nums text-muted-foreground/60">{contextLabel}</span>
        ) : null}
        {props.isSelected ? (
          <CheckIcon className="size-3.5 shrink-0 text-primary/70" strokeWidth={2.5} />
        ) : null}
      </div>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Enhanced ProviderModelPicker
// ---------------------------------------------------------------------------

export const ProviderModelPicker = memo(function ProviderModelPicker(props: {
  activeThread: Thread | null;
  provider: ProviderKind;
  providerPickerKind: AvailableProviderPickerKind;
  language: AppLanguage;
  model: ModelSlug;
  lockedProvider: ProviderKind | null;
  allModelOptionsByProvider: Record<ProviderKind, ReadonlyArray<PickerModelOption>>;
  visibleModelOptionsByProvider: Record<ProviderKind, ReadonlyArray<PickerModelOption>>;
  openRouterModelOptions: ReadonlyArray<PickerModelOption>;
  opencodeModelOptions: ReadonlyArray<PickerModelOption>;
  openRouterContextLengthsBySlug: ReadonlyMap<string, number | null>;
  opencodeContextLengthsBySlug: ReadonlyMap<string, number | null>;
  serviceTierSetting: AppServiceTier;
  hasHiddenModels: boolean;
  favoriteModelsByProvider: Record<ProviderKind, ReadonlyArray<string>>;
  recentModelsByProvider: Record<ProviderKind, ReadonlyArray<string>>;
  modelLabelOverride?: string;
  compact?: boolean;
  disabled?: boolean;
  onOpenProviderSetup: () => void;
  onOpenManageModels: () => void;
  onOpenUsageDashboard: () => void;
  onProviderModelChange: (provider: AvailableProviderPickerKind, model: ModelSlug) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { disabled, onProviderModelChange } = props;
  const copilotUsageQuery = useQuery(serverCopilotUsageQueryOptions(isOpen));
  const copy = getChatPickerCopy(props.language);

  const selectedProviderOptions = useMemo(
    () =>
      getModelOptionsForProviderPicker(
        props.providerPickerKind,
        props.visibleModelOptionsByProvider,
        props.openRouterModelOptions,
        props.opencodeModelOptions,
      ),
    [
      props.opencodeModelOptions,
      props.openRouterModelOptions,
      props.providerPickerKind,
      props.visibleModelOptionsByProvider,
    ],
  );
  const selectedModelLabel =
    props.modelLabelOverride ??
    selectedProviderOptions.find((option) => option.slug === props.model)?.name ??
    getModelDisplayName(props.model, props.provider);
  const selectedProviderLabel =
    AVAILABLE_PROVIDER_OPTIONS.find((option) => option.value === props.providerPickerKind)?.label ??
    props.providerPickerKind;
  const ProviderIcon = PROVIDER_ICON_BY_PROVIDER[props.providerPickerKind];

  // Reset search on close
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  // Auto-focus search input on open
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen]);

  const handleModelChange = useCallback(
    (
      providerPickerKind: AvailableProviderPickerKind,
      value: string,
      options: ReadonlyArray<PickerModelOption>,
      isDisabledByProviderLock: boolean,
    ) => {
      if (disabled || isDisabledByProviderLock || !value) {
        return;
      }
      const backingProvider = getProviderPickerBackingProvider(providerPickerKind);
      if (!backingProvider) {
        return;
      }
      const resolvedModel = resolveModelForProviderPicker(backingProvider, value, options);
      if (!resolvedModel) {
        return;
      }
      onProviderModelChange(providerPickerKind, resolvedModel);
      setIsOpen(false);
    },
    [disabled, onProviderModelChange],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const providerSections = useMemo(
    () =>
      buildPickerProviderSections({
        availableOptions: AVAILABLE_PROVIDER_OPTIONS,
        visibleModelOptionsByProvider: props.visibleModelOptionsByProvider,
        openRouterModelOptions: props.openRouterModelOptions,
        opencodeModelOptions: props.opencodeModelOptions,
        favoriteModelsByProvider: props.favoriteModelsByProvider,
        recentModelsByProvider: props.recentModelsByProvider,
        lockedProvider: props.lockedProvider,
        normalizedQuery,
      }),
    [
      normalizedQuery,
      props.openRouterModelOptions,
      props.opencodeModelOptions,
      props.visibleModelOptionsByProvider,
      props.favoriteModelsByProvider,
      props.recentModelsByProvider,
      props.lockedProvider,
    ],
  );

  // Collapsed state management
  const STORAGE_KEY = "rowl:model-picker:collapsed-sections";
  const [collapsedSections, setCollapsedSections] = useState<Set<AvailableProviderPickerKind>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return new Set(JSON.parse(stored) as AvailableProviderPickerKind[]);
      }
    } catch {
      // ignore parse errors
    }
    return new Set();
  });

  // Auto-expand selected provider when popover opens
  useEffect(() => {
    if (isOpen && !normalizedQuery) {
      setCollapsedSections((prev) => {
        if (prev.has(props.providerPickerKind)) {
          const next = new Set(prev);
          next.delete(props.providerPickerKind);
          return next;
        }
        return prev;
      });
    }
  }, [isOpen, props.providerPickerKind, normalizedQuery]);

  // Persist collapsed state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsedSections]));
    } catch {
      // ignore storage errors
    }
  }, [collapsedSections]);

  const toggleSection = useCallback((value: AvailableProviderPickerKind) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedSections(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedSections(new Set(providerSections.map((s) => s.option.value)));
  }, [providerSections]);

  const allCollapsed = providerSections.length > 0 && providerSections.every((s) => collapsedSections.has(s.option.value));
  const allExpanded = providerSections.length > 0 && providerSections.every((s) => !collapsedSections.has(s.option.value));

  const unavailableOptions = useMemo(() => {
    const placeholderOptions = [
      ...UNAVAILABLE_PROVIDER_OPTIONS.map((option) => ({
        id: option.value,
        label: option.label,
        icon: PROVIDER_ICON_BY_PROVIDER[option.value],
      })),
      ...COMING_SOON_PROVIDER_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        icon: option.icon,
      })),
    ];
    if (!normalizedQuery) {
      return placeholderOptions;
    }
    return placeholderOptions.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  // Total model count across visible sections
  const totalVisibleModels = providerSections.reduce((sum, s) => sum + s.modelOptions.length, 0);

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        if (props.disabled) {
          setIsOpen(false);
          return;
        }
        setIsOpen(open);
      }}
    >
      {/* ----------------------------------------------------------------- */}
      {/* Trigger                                                           */}
      {/* ----------------------------------------------------------------- */}
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            data-chat-composer-control="provider-picker"
            className={cn(
              "app-interactive-motion h-auto min-h-9 min-w-0 shrink-0 justify-start overflow-hidden rounded-xl px-3 py-1.5 text-muted-foreground/70 shadow-none transition-[background-color,color,transform,box-shadow] hover:bg-muted/30 hover:text-foreground/85 motion-safe:hover:-translate-y-px sm:min-h-8",
              props.compact ? "max-w-[11rem]" : "max-w-[13.75rem] sm:px-3.5",
            )}
            disabled={props.disabled}
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <ProviderIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/70" />
          <span className="min-w-0 flex-1 text-left leading-tight">
            <span className="block truncate text-sm text-foreground leading-tight">
              {selectedModelLabel}
            </span>
            <span className="block truncate pt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/65 leading-tight">
              {selectedProviderLabel}
            </span>
          </span>
          {props.provider === "codex" &&
          shouldShowFastTierIcon(props.model, props.serviceTierSetting) ? (
            <ZapIcon className="size-3.5 shrink-0 text-amber-500" />
          ) : null}
          <ChevronDownIcon aria-hidden="true" className="size-3 shrink-0 opacity-60" />
        </span>
      </PopoverTrigger>

      {/* ----------------------------------------------------------------- */}
      {/* Popup                                                             */}
      {/* ----------------------------------------------------------------- */}
      <PopoverPopup align="start" side="top" className="w-[min(42rem,calc(100vw-1.5rem))] p-0">
        <div className="flex max-h-[min(70vh,40rem)] flex-col">
          {/* Search header */}
          <div className="border-b border-border/60 px-3 pb-3 pt-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                className="pl-9 text-sm"
              />
            </div>
            {/* Quick stat */}
            {!normalizedQuery ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/65">
                  <SparklesIcon className="size-3" />
                  <span>
                    {providerSections.length} provider{providerSections.length === 1 ? "" : "s"} ·{" "}
                    {totalVisibleModels} model{totalVisibleModels === 1 ? "" : "s"} available
                  </span>
                </div>
                {providerSections.length > 1 ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      className="h-6 px-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground/80"
                      onClick={allExpanded ? collapseAll : expandAll}
                      disabled={normalizedQuery.length > 0}
                    >
                      <ChevronsUpDownIcon className="size-3.5" />
                      {allExpanded
                        ? props.language === "fa"
                          ? "جمع کردن همه"
                          : "Collapse all"
                        : allCollapsed
                          ? props.language === "fa"
                            ? "باز کردن همه"
                            : "Expand all"
                          : props.language === "fa"
                            ? "جمع کردن همه"
                            : "Collapse all"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 space-y-2 overflow-y-auto px-2 py-2">
            {providerSections.length === 0 ? (
              /* Empty state */
              <div className="rounded-2xl border border-dashed border-border/70 px-6 py-10 text-center">
                <SearchIcon className="mx-auto mb-3 size-8 text-muted-foreground/30" />
                <p className="font-medium text-sm text-foreground">{copy.noModelsMatch}</p>
                <p className="mt-1 text-sm text-muted-foreground">{copy.tryDifferentSearch}</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  {normalizedQuery ? (
                    <Button size="sm" variant="outline" onClick={() => setQuery("")}>
                      {copy.clearSearch}
                    </Button>
                  ) : null}
                  {props.hasHiddenModels ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIsOpen(false);
                        props.onOpenManageModels();
                      }}
                    >
                      <SlidersHorizontalIcon className="size-4" />
                      {copy.manageModels}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              providerSections.map((section) => {
                const OptionIcon = PROVIDER_ICON_BY_PROVIDER[section.option.value];
                const isCurrentProvider = section.option.value === props.providerPickerKind;
                const providerContextSummary = isCurrentProvider
                  ? renderProviderContextWindowSummary({
                      provider: section.backingProvider,
                      model:
                        props.activeThread?.session?.provider === section.backingProvider
                          ? (props.activeThread.model ?? props.model)
                          : props.model,
                      tokenUsage:
                        props.activeThread?.session?.provider === section.backingProvider
                          ? props.activeThread.session.tokenUsage
                          : undefined,
                      opencodeContextLengthsBySlug: props.opencodeContextLengthsBySlug,
                    })
                  : null;

                const isCollapsed = collapsedSections.has(section.option.value);
                return (
                  <Collapsible
                    key={section.option.value}
                    className={cn(
                      "overflow-hidden rounded-xl border transition-colors",
                      isCurrentProvider
                        ? "border-primary/25 bg-primary/[0.02]"
                        : "border-border/50 bg-background/95",
                      section.isDisabledByProviderLock && "opacity-60",
                    )}
                    open={!isCollapsed}
                    onOpenChange={() => toggleSection(section.option.value)}
                  >
                    {/* Provider section header */}
                    <CollapsibleTrigger
                      className={cn(
                        "flex w-full flex-wrap items-start justify-between gap-2 border-b px-4 py-2.5 text-left",
                        isCurrentProvider
                          ? "border-primary/20 bg-primary/[0.04]"
                          : "border-border/50 bg-muted/15",
                      )}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <ChevronRightIcon
                            className={cn(
                              "size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                              !isCollapsed && "rotate-90",
                            )}
                          />
                          <OptionIcon className="size-4 shrink-0 text-muted-foreground/80" />
                          <span className="font-semibold text-sm text-foreground">
                            {section.option.label}
                          </span>
                          {isCurrentProvider ? (
                            <Badge variant="default" size="sm" className="text-[10px]">
                              {copy.current}
                            </Badge>
                          ) : null}
                          {section.isDisabledByProviderLock ? (
                            <Badge variant="outline" size="sm" className="text-[10px]">
                              {copy.locked}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                          {getProviderPickerSectionDescription(section.option.value)}
                        </p>
                      </div>
                      <Badge variant="outline" size="sm" className="shrink-0 tabular-nums">
                        {copy.models(section.modelOptions.length)}
                      </Badge>
                    </CollapsibleTrigger>

                    <CollapsiblePanel>
                      {/* Context window & copilot usage */}
                      {providerContextSummary ? (
                        <div className="border-b border-border/40">{providerContextSummary}</div>
                      ) : null}

                      {section.option.value === "copilot" && isCurrentProvider ? (
                        <div className="border-b border-border/40">
                          {renderCopilotUsageSummary(
                            copilotUsageQuery.data ?? null,
                            copilotUsageQuery.isLoading,
                            props.language,
                          )}
                        </div>
                      ) : null}

                      {/* Model rows grouped by family */}
                      <div>
                        {section.families.map((family, familyIdx) => (
                          <div key={family.key}>
                            {/* Family label (only when multiple families) */}
                            {section.families.length > 1 && family.label ? (
                              <div
                                className={cn(
                                  "flex items-center gap-2 px-4 pt-2 pb-1",
                                  familyIdx > 0 && "border-t border-border/30",
                                )}
                              >
                                <span className="font-semibold text-[11px] uppercase tracking-[0.12em] text-muted-foreground/60">
                                  {family.label}
                                </span>
                                <span className="h-px flex-1 bg-border/30" />
                                <span className="text-[10px] tabular-nums text-muted-foreground/45">
                                  {family.models.length}
                                </span>
                              </div>
                            ) : null}
                            {family.models.map((modelOption) => {
                              const isSelected =
                                section.option.value === props.providerPickerKind &&
                                modelOption.slug === props.model;
                              const providerFavorites =
                                props.favoriteModelsByProvider[section.backingProvider];
                              const providerRecents =
                                props.recentModelsByProvider[section.backingProvider];
                              return (
                                <PickerModelRow
                                  key={`${section.option.value}:${modelOption.slug}`}
                                  modelOption={modelOption}
                                  backingProvider={section.backingProvider}
                                  providerPickerKind={section.option.value}
                                  isSelected={isSelected}
                                  isFavorite={providerFavorites.includes(modelOption.slug)}
                                  isRecent={providerRecents.includes(modelOption.slug)}
                                  favoriteLabel={copy.favorite}
                                  recentLabel={copy.recent}
                                  isDisabledByProviderLock={section.isDisabledByProviderLock}
                                  disabled={props.disabled ?? false}
                                  serviceTierSetting={props.serviceTierSetting}
                                  openRouterContextLengthsBySlug={
                                    props.openRouterContextLengthsBySlug
                                  }
                                  opencodeContextLengthsBySlug={props.opencodeContextLengthsBySlug}
                                  onSelect={() => {
                                    handleModelChange(
                                      section.option.value,
                                      modelOption.slug,
                                      section.modelOptions,
                                      section.isDisabledByProviderLock,
                                    );
                                  }}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </CollapsiblePanel>
                  </Collapsible>
                );
              })
            )}

            {/* Coming soon / unavailable */}
            {unavailableOptions.length > 0 ? (
              <section className="rounded-xl border border-dashed border-border/50 bg-muted/10 px-4 py-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                  {copy.comingSoon}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {unavailableOptions.map((option) => {
                    const OptionIcon = option.icon;
                    return (
                      <Badge key={option.id} variant="outline" size="sm" className="gap-1.5">
                        <OptionIcon className="size-3.5 opacity-70" />
                        {option.label}
                      </Badge>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>

          {/* Footer toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/15 px-3 py-2">
            <p className="text-[11px] text-muted-foreground/65 leading-relaxed">
              {props.hasHiddenModels ? copy.hiddenModelsHint : copy.pickModelHint}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setIsOpen(false);
                  props.onOpenUsageDashboard();
                }}
              >
                <BarChart3Icon className="size-3.5" />
                {props.language === "fa" ? "مصرف" : "Usage"}
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setIsOpen(false);
                  props.onOpenProviderSetup();
                }}
              >
                <PlusIcon className="size-3.5" />
                {copy.connectProvider}
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setIsOpen(false);
                  props.onOpenManageModels();
                }}
              >
                <SlidersHorizontalIcon className="size-3.5" />
                {copy.manageModels}
              </Button>
            </div>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
});
