import { type ProviderKind } from "@t3tools/contracts";
import { getModelDisplayName } from "@t3tools/shared/model";
import { formatGitHubCopilotPlan } from "@t3tools/shared/copilotPlan";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3Icon,
  CircleAlertIcon,
  CircleDollarSignIcon,
  Clock3Icon,
  Layers3Icon,
} from "lucide-react";
import { memo, type ReactNode, useMemo } from "react";

import { type AppLanguage, getAppLanguageDetails } from "../../appLanguage";
import {
  describeContextWindowState,
  getDocumentedContextWindowOverride,
  shouldHideContextWindowForModel,
} from "../../lib/contextWindow";
import { isAvailableCopilotUsage, isUnavailableCopilotUsage } from "../../lib/modelPickerHelpers";
import { serverCopilotUsageQueryOptions } from "../../lib/serverReactQuery";
import {
  describeUsageDashboardSnapshot,
  describeUsageSpendState,
  describeUsageTokenBreakdown,
} from "../../lib/usageDashboard";
import { cn } from "../../lib/utils";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Separator } from "../ui/separator";
import { Button } from "../ui/button";

function formatTimestamp(value: string | undefined, locale: string): string | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

function formatTokenValue(value: number | null, locale: string, unavailableLabel: string): string {
  if (value === null) {
    return unavailableLabel;
  }
  return `${formatNumber(value, locale)} tokens`;
}

function formatCurrency(value: number | null, locale: string, unavailableLabel: string): string {
  if (value === null) {
    return unavailableLabel;
  }
  const minimumFractionDigits = value === 0 ? 2 : value < 1 ? 4 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

function normalizeSnapshotProvider(
  provider: string | undefined,
  fallback: ProviderKind,
): ProviderKind {
  switch (provider) {
    case "codex":
    case "copilot":
    case "kimi":
    case "opencode":
    case "pi":
      return provider;
    default:
      return fallback;
  }
}

function providerLabel(provider: ProviderKind, language: AppLanguage): string {
  switch (provider) {
    case "codex":
      return "Codex";
    case "copilot":
      return "GitHub Copilot";
    case "kimi":
      return "Kimi Code";
    case "opencode":
      return "OpenCode";
    case "pi":
      return language === "fa" ? "Pi" : "Pi";
  }
}

function snapshotScopeLabel(scope: "thread" | "turn" | null, language: AppLanguage): string {
  if (scope === "thread") {
    return language === "fa" ? "آخرین نمای رشته" : "Latest thread snapshot";
  }
  if (scope === "turn") {
    return language === "fa" ? "آخرین نوبت تکمیل شده" : "Last completed turn";
  }
  return language === "fa" ? "بدون داده زنده" : "No live snapshot";
}

function getUsageDashboardCopy(language: AppLanguage) {
  if (language === "fa") {
    return {
      title: "داشبورد مصرف",
      description:
        "پنجرهٔ زمینه، جزئیات توکن، هزینهٔ گزارش شده و سهمیهٔ ارائه‌دهنده را برای رشتهٔ فعلی مرور کنید.",
      currentSelection: "انتخاب فعلی",
      latestSnapshot: "آخرین نما",
      contextWindow: "پنجرهٔ زمینه",
      tokenBreakdown: "جزئیات توکن",
      spend: "هزینه",
      copilotBilling: "صورتحساب GitHub Copilot",
      close: "بستن",
      used: "استفاده شده",
      remaining: "باقی مانده",
      total: "کل",
      documentedTotal: "کل مستند",
      loading: "در حال بارگذاری...",
      unavailable: "ناموجود",
      noMatchingSnapshotTitle: "هنوز نمای منطبق وجود ندارد",
      noMatchingSnapshotDescription:
        "آخرین دادهٔ ذخیره شده برای مدل یا ارائه‌دهندهٔ دیگری بوده است. پس از ارسال نوبت بعدی با انتخاب فعلی، مصرف و هزینه تازه می‌شود.",
      noRuntimeDataTitle: "هنوز دادهٔ زنده‌ای گزارش نشده است",
      noRuntimeDataDescription:
        "هنگامی که ارائه‌دهنده مصرف یا هزینه را برگرداند، این داشبورد به‌روزرسانی می‌شود.",
      contextUnavailable: "این مدل هنوز اندازهٔ قابل اتکای پنجرهٔ زمینه را گزارش نکرده است.",
      routedContextTitle: "مدل مسیربندی شده",
      routedContextDescription:
        "مدل‌های OpenRouter که از مسیر Codex اجرا می‌شوند می‌توانند در هر نوبت تغییر کنند، بنابراین نمایش باقی‌ماندهٔ زمینه قابل اتکا نیست.",
      spendUnavailable: "ارائه‌دهنده برای این نمای منطبق هزینه‌ای گزارش نکرد.",
      tokensUnavailable: "این نما جزئیات کافی برای شکستن توکن‌ها را ارائه نکرد.",
      input: "ورودی",
      output: "خروجی",
      reasoning: "استدلال",
      cacheRead: "خواندن کش",
      cacheWrite: "نوشتن کش",
      plan: "پلن",
      resets: "بازنشانی",
      overage: "مازاد",
      included: "درخواست های پریمیوم",
      latestStored: "آخرین نمای ذخیره شده",
      costSourceSnapshot: "هزینه مستقیماً با همین نما ذخیره شد.",
      costSourceUsage: "هزینه از payload مصرف ارائه‌دهنده استخراج شد.",
    };
  }

  return {
    title: "Usage dashboard",
    description:
      "Review context window, token breakdown, latest reported spend, and provider quota for the current thread.",
    currentSelection: "Current selection",
    latestSnapshot: "Latest snapshot",
    contextWindow: "Context window",
    tokenBreakdown: "Token breakdown",
    spend: "Spend",
    copilotBilling: "GitHub Copilot billing",
    close: "Close",
    used: "Used",
    remaining: "Remaining",
    total: "Total",
    documentedTotal: "Documented total",
    loading: "Loading...",
    unavailable: "Unavailable",
    noMatchingSnapshotTitle: "No matching snapshot yet",
    noMatchingSnapshotDescription:
      "The latest stored usage came from a different provider or model. Send the next turn with the current selection to refresh usage and spend details.",
    noRuntimeDataTitle: "No live usage has been reported yet",
    noRuntimeDataDescription:
      "This dashboard updates as soon as the provider returns token or cost data.",
    contextUnavailable: "This model has not reported a reliable context window yet.",
    routedContextTitle: "Routed model",
    routedContextDescription:
      "OpenRouter models routed through Codex can change between turns, so remaining-context math is not reliable here.",
    spendUnavailable: "The provider did not report cost for the latest matching snapshot.",
    tokensUnavailable: "This snapshot did not include enough detail for a token breakdown.",
    input: "Input",
    output: "Output",
    reasoning: "Reasoning",
    cacheRead: "Cache read",
    cacheWrite: "Cache write",
    plan: "Plan",
    resets: "Resets",
    overage: "Overage",
    included: "Premium requests",
    latestStored: "Latest stored snapshot",
    costSourceSnapshot: "Cost was stored directly on this snapshot.",
    costSourceUsage: "Cost was derived from the provider usage payload.",
  };
}

function MetricCard(props: {
  title: string;
  icon: typeof Layers3Icon;
  primary: string;
  secondary?: string | null;
  tertiary?: string | null;
  children?: ReactNode;
}) {
  const Icon = props.icon;

  return (
    <Card className="min-h-40 border-border/70 bg-muted/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-muted-foreground/75" />
          {props.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="font-semibold text-2xl leading-tight">{props.primary}</div>
        {props.secondary ? (
          <div className="text-muted-foreground text-sm leading-relaxed">{props.secondary}</div>
        ) : null}
        {props.tertiary ? (
          <div className="text-muted-foreground/75 text-[11px] leading-relaxed">
            {props.tertiary}
          </div>
        ) : null}
        {props.children}
      </CardContent>
    </Card>
  );
}

export const UsageDashboardDialog = memo(function UsageDashboardDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: AppLanguage;
  provider: ProviderKind;
  model: string | null | undefined;
  tokenUsage?: unknown;
  opencodeContextLengthsBySlug?: ReadonlyMap<string, number | null>;
}) {
  const locale = getAppLanguageDetails(props.language).locale;
  const copy = getUsageDashboardCopy(props.language);
  const snapshotState = useMemo(
    () =>
      describeUsageDashboardSnapshot({
        provider: props.provider,
        model: props.model,
        tokenUsage: props.tokenUsage,
      }),
    [props.model, props.provider, props.tokenUsage],
  );
  const matchingSnapshot = snapshotState.matchingSnapshot;
  const contextState = describeContextWindowState({
    provider: props.provider,
    model: props.model,
    tokenUsage: props.tokenUsage,
    ...getDocumentedContextWindowOverride(props),
  });
  const tokenBreakdown = useMemo(
    () => describeUsageTokenBreakdown(matchingSnapshot),
    [matchingSnapshot],
  );
  const spendState = useMemo(() => describeUsageSpendState(matchingSnapshot), [matchingSnapshot]);
  const copilotUsageQuery = useQuery(
    serverCopilotUsageQueryOptions(props.open && props.provider === "copilot"),
  );

  const selectedModelLabel = props.model ? getModelDisplayName(props.model, props.provider) : "—";
  const latestSnapshotProvider = normalizeSnapshotProvider(
    matchingSnapshot?.provider ?? snapshotState.latestSnapshot?.provider,
    props.provider,
  );
  const latestSnapshotModel = matchingSnapshot?.model ?? snapshotState.latestSnapshot?.model;
  const latestSnapshotTimestamp =
    matchingSnapshot?.observedAt ?? snapshotState.latestSnapshot?.observedAt ?? null;
  const copilotUsageData = copilotUsageQuery.data ?? null;
  const copilotUsage = isAvailableCopilotUsage(copilotUsageData) ? copilotUsageData : null;
  const unavailableCopilotUsage = isUnavailableCopilotUsage(copilotUsageData)
    ? copilotUsageData
    : null;
  const hasTokenBreakdown =
    tokenBreakdown.totalTokens !== null ||
    tokenBreakdown.inputTokens !== null ||
    tokenBreakdown.outputTokens !== null ||
    tokenBreakdown.reasoningTokens !== null ||
    tokenBreakdown.cacheReadTokens !== null ||
    tokenBreakdown.cacheWriteTokens !== null;

  const contextPrimary = (() => {
    if (shouldHideContextWindowForModel(props.provider, props.model)) {
      return copy.unavailable;
    }
    if (
      contextState.totalLabel !== null &&
      contextState.usedLabel !== null &&
      contextState.remainingLabel !== null
    ) {
      return `${contextState.usedLabel} / ${contextState.totalLabel}`;
    }
    if (contextState.totalLabel !== null) {
      return contextState.totalLabel;
    }
    return copy.unavailable;
  })();
  const contextSecondary = (() => {
    if (shouldHideContextWindowForModel(props.provider, props.model)) {
      return copy.routedContextDescription;
    }
    if (
      contextState.totalLabel !== null &&
      contextState.usedLabel !== null &&
      contextState.remainingLabel !== null
    ) {
      return `${copy.remaining}: ${contextState.remainingLabel}`;
    }
    if (contextState.totalLabel !== null) {
      return `${copy.documentedTotal}: ${contextState.totalLabel}`;
    }
    return copy.contextUnavailable;
  })();
  const contextTertiary =
    shouldHideContextWindowForModel(props.provider, props.model) || contextState.note === null
      ? null
      : contextState.note;

  const spendSecondary =
    spendState.totalCostUsd !== null
      ? matchingSnapshot?.kind === "thread"
        ? snapshotScopeLabel("thread", props.language)
        : snapshotScopeLabel("turn", props.language)
      : copy.spendUnavailable;
  const spendTertiary =
    spendState.source === "snapshot"
      ? copy.costSourceSnapshot
      : spendState.source === "usage"
        ? copy.costSourceUsage
        : null;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5" data-usage-dashboard="true">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" size="sm">
              {copy.currentSelection}
            </Badge>
            <span className="font-medium text-sm text-foreground">
              {providerLabel(props.provider, props.language)} · {selectedModelLabel}
            </span>
            {matchingSnapshot?.kind ? (
              <Badge variant="outline" size="sm">
                {snapshotScopeLabel(matchingSnapshot.kind, props.language)}
              </Badge>
            ) : null}
          </div>

          {snapshotState.hasSelectionMismatch && snapshotState.latestSnapshot ? (
            <Alert variant="warning">
              <CircleAlertIcon />
              <div>
                <AlertTitle>{copy.noMatchingSnapshotTitle}</AlertTitle>
                <AlertDescription>
                  <div>{copy.noMatchingSnapshotDescription}</div>
                  <div className="text-muted-foreground/80 text-[11px]">
                    {copy.latestStored}: {providerLabel(latestSnapshotProvider, props.language)}
                    {latestSnapshotModel
                      ? ` · ${getModelDisplayName(latestSnapshotModel, latestSnapshotProvider)}`
                      : ""}
                    {latestSnapshotTimestamp
                      ? ` · ${formatTimestamp(latestSnapshotTimestamp, locale)}`
                      : ""}
                  </div>
                </AlertDescription>
              </div>
            </Alert>
          ) : null}

          {!snapshotState.latestSnapshot ? (
            <Alert variant="info">
              <CircleAlertIcon />
              <div>
                <AlertTitle>{copy.noRuntimeDataTitle}</AlertTitle>
                <AlertDescription>{copy.noRuntimeDataDescription}</AlertDescription>
              </div>
            </Alert>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <MetricCard
              title={copy.contextWindow}
              icon={Layers3Icon}
              primary={contextPrimary}
              secondary={contextSecondary}
              tertiary={contextTertiary}
            >
              {contextState.totalTokens !== null && contextState.usedTokens !== null ? (
                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-2">
                    <div className="text-muted-foreground/75">{copy.used}</div>
                    <div className="font-medium text-foreground/90">
                      {formatTokenValue(contextState.usedTokens, locale, copy.unavailable)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-2">
                    <div className="text-muted-foreground/75">{copy.remaining}</div>
                    <div className="font-medium text-foreground/90">
                      {formatTokenValue(contextState.remainingTokens, locale, copy.unavailable)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-2">
                    <div className="text-muted-foreground/75">{copy.total}</div>
                    <div className="font-medium text-foreground/90">
                      {formatTokenValue(contextState.totalTokens, locale, copy.unavailable)}
                    </div>
                  </div>
                </div>
              ) : null}
            </MetricCard>

            <MetricCard
              title={copy.latestSnapshot}
              icon={Clock3Icon}
              primary={snapshotScopeLabel(matchingSnapshot?.kind ?? null, props.language)}
              secondary={
                latestSnapshotModel
                  ? `${providerLabel(latestSnapshotProvider, props.language)} · ${getModelDisplayName(latestSnapshotModel, latestSnapshotProvider)}`
                  : copy.unavailable
              }
              tertiary={formatTimestamp(latestSnapshotTimestamp ?? undefined, locale)}
            />

            <MetricCard
              title={copy.tokenBreakdown}
              icon={BarChart3Icon}
              primary={
                tokenBreakdown.totalTokens !== null
                  ? formatTokenValue(tokenBreakdown.totalTokens, locale, copy.unavailable)
                  : copy.unavailable
              }
              secondary={
                hasTokenBreakdown
                  ? matchingSnapshot?.kind === "thread"
                    ? snapshotScopeLabel("thread", props.language)
                    : snapshotScopeLabel("turn", props.language)
                  : copy.tokensUnavailable
              }
            >
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                {[
                  [copy.input, tokenBreakdown.inputTokens],
                  [copy.output, tokenBreakdown.outputTokens],
                  [copy.reasoning, tokenBreakdown.reasoningTokens],
                  [copy.cacheRead, tokenBreakdown.cacheReadTokens],
                  [copy.cacheWrite, tokenBreakdown.cacheWriteTokens],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-2"
                  >
                    <div className="text-muted-foreground/75">{label}</div>
                    <div
                      className={cn(
                        "font-medium text-foreground/90",
                        value === null && "text-muted-foreground/55",
                      )}
                    >
                      {formatTokenValue(value as number | null, locale, copy.unavailable)}
                    </div>
                  </div>
                ))}
              </div>
            </MetricCard>

            <MetricCard
              title={copy.spend}
              icon={CircleDollarSignIcon}
              primary={formatCurrency(spendState.totalCostUsd, locale, copy.unavailable)}
              secondary={spendSecondary}
              tertiary={spendTertiary}
            />
          </div>

          {props.provider === "copilot" ? (
            <Card className="border-border/70 bg-muted/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{copy.copilotBilling}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {copilotUsageQuery.isLoading && copilotUsageQuery.data == null ? (
                  <div className="text-muted-foreground text-sm">{copy.loading}</div>
                ) : unavailableCopilotUsage ? (
                  <Alert variant="warning">
                    <CircleAlertIcon />
                    <div>
                      <AlertTitle>{copy.copilotBilling}</AlertTitle>
                      <AlertDescription>{unavailableCopilotUsage.message}</AlertDescription>
                    </div>
                  </Alert>
                ) : copilotUsage ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-border/60 bg-background/60 px-3.5 py-3">
                        <div className="text-muted-foreground/75 text-xs">{copy.included}</div>
                        <div className="mt-1 font-semibold text-lg">
                          {formatNumber(copilotUsage.remaining, locale)} /{" "}
                          {formatNumber(copilotUsage.entitlement, locale)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/60 px-3.5 py-3">
                        <div className="text-muted-foreground/75 text-xs">{copy.plan}</div>
                        <div className="mt-1 font-semibold text-lg">
                          {formatGitHubCopilotPlan(copilotUsage.plan)}
                        </div>
                        <div className="text-muted-foreground text-xs">{copilotUsage.login}</div>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/60 px-3.5 py-3">
                        <div className="text-muted-foreground/75 text-xs">{copy.resets}</div>
                        <div className="mt-1 font-semibold text-lg">
                          {formatTimestamp(copilotUsage.resetAt, locale) ?? copy.unavailable}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {copy.overage}:{" "}
                          {copilotUsage.overagePermitted
                            ? formatNumber(copilotUsage.overageCount, locale)
                            : copy.unavailable}
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div className="text-muted-foreground text-xs leading-relaxed">
                      {copilotUsage.unlimited
                        ? props.language === "fa"
                          ? "این حساب مصرف پریمیوم نامحدود گزارش می‌کند."
                          : "This account reports unlimited premium usage."
                        : props.language === "fa"
                          ? `${formatNumber(copilotUsage.used, locale)} درخواست پریمیوم مصرف شده و ${formatNumber(copilotUsage.remaining, locale)} باقی مانده است.`
                          : `${formatNumber(copilotUsage.used, locale)} premium requests used and ${formatNumber(copilotUsage.remaining, locale)} remaining.`}
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground text-sm">{copy.unavailable}</div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => props.onOpenChange(false)}>
            {copy.close}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
});
