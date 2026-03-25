import type {
  CodexReasoningEffort,
  CopilotReasoningEffort,
  ProviderKind,
  ProviderReasoningLevel,
  ServerCopilotReasoningProbe,
} from "@t3tools/contracts";
import {
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  isCodexOpenRouterModel,
} from "@t3tools/shared/model";

function isCodexReasoningEffort(
  value: ProviderReasoningLevel | null,
): value is CodexReasoningEffort {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function isCopilotReasoningEffort(
  value: ProviderReasoningLevel | null,
): value is CopilotReasoningEffort {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

export function buildModelOptionsForDispatch(input: {
  readonly provider: ProviderKind;
  readonly supportsReasoningEffort: boolean;
  readonly selectedEffort: ProviderReasoningLevel | null;
  readonly selectedCodexSupportsFastMode: boolean;
  readonly selectedCodexFastModeEnabled: boolean;
}) {
  if (input.provider === "codex") {
    const reasoningEffort =
      input.supportsReasoningEffort && isCodexReasoningEffort(input.selectedEffort)
        ? input.selectedEffort
        : undefined;
    const codexOptions = {
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(input.selectedCodexSupportsFastMode && input.selectedCodexFastModeEnabled
        ? { fastMode: true }
        : {}),
    };
    return Object.keys(codexOptions).length > 0 ? { codex: codexOptions } : undefined;
  }

  if (input.provider === "copilot") {
    const reasoningEffort =
      input.supportsReasoningEffort && isCopilotReasoningEffort(input.selectedEffort)
        ? input.selectedEffort
        : undefined;
    return reasoningEffort ? { copilot: { reasoningEffort } } : undefined;
  }

  if (input.provider === "pi") {
    const thinkingLevel =
      input.supportsReasoningEffort && input.selectedEffort ? input.selectedEffort : undefined;
    return thinkingLevel ? { pi: { thinkingLevel } } : undefined;
  }

  return undefined;
}

function resolveReasoningOptionsForSend(input: {
  readonly provider: ProviderKind;
  readonly model: string;
  readonly copilotReasoningProbe: ServerCopilotReasoningProbe | null | undefined;
  readonly openRouterSupportsReasoningEffort: boolean;
  readonly piSupportsReasoning: boolean;
  readonly piReasoningOptions?: ReadonlyArray<ProviderReasoningLevel> | null | undefined;
}): ReadonlyArray<ProviderReasoningLevel> {
  if (input.provider === "copilot") {
    if (
      input.copilotReasoningProbe?.status === "supported" &&
      input.copilotReasoningProbe.model === input.model
    ) {
      return input.copilotReasoningProbe.options;
    }
    return [];
  }

  if (input.provider === "codex" && isCodexOpenRouterModel(input.model)) {
    return input.openRouterSupportsReasoningEffort ? getReasoningEffortOptions("codex") : [];
  }

  if (input.provider === "pi") {
    if (input.piReasoningOptions && input.piReasoningOptions.length > 0) {
      return input.piReasoningOptions;
    }
    return input.piSupportsReasoning ? getReasoningEffortOptions("pi") : [];
  }

  return getReasoningEffortOptions(input.provider);
}

function resolveSelectedEffortForSend(input: {
  readonly provider: ProviderKind;
  readonly composerEffort: ProviderReasoningLevel | null | undefined;
  readonly reasoningOptions: ReadonlyArray<ProviderReasoningLevel>;
  readonly copilotReasoningProbe: ServerCopilotReasoningProbe | null | undefined;
}): ProviderReasoningLevel | null {
  if (input.reasoningOptions.length === 0) {
    return null;
  }

  const probeCurrentValue =
    input.provider === "copilot" && input.copilotReasoningProbe?.status === "supported"
      ? (input.copilotReasoningProbe.currentValue ?? null)
      : null;
  const preferredEfforts = [
    input.composerEffort ?? null,
    probeCurrentValue,
    getDefaultReasoningEffort(input.provider),
  ];

  for (const effort of preferredEfforts) {
    if (effort && input.reasoningOptions.includes(effort)) {
      return effort;
    }
  }

  return input.provider === "pi" ? null : (input.reasoningOptions[0] ?? null);
}

export function buildModelOptionsForSend(input: {
  readonly provider: ProviderKind;
  readonly model: string;
  readonly composerEffort: ProviderReasoningLevel | null | undefined;
  readonly codexFastModeEnabled: boolean;
  readonly copilotReasoningProbe: ServerCopilotReasoningProbe | null | undefined;
  readonly openRouterSupportsReasoningEffort: boolean;
  readonly piSupportsReasoning: boolean;
  readonly piReasoningOptions?: ReadonlyArray<ProviderReasoningLevel> | null | undefined;
}) {
  const reasoningOptions = resolveReasoningOptionsForSend({
    provider: input.provider,
    model: input.model,
    copilotReasoningProbe: input.copilotReasoningProbe,
    openRouterSupportsReasoningEffort: input.openRouterSupportsReasoningEffort,
    piSupportsReasoning: input.piSupportsReasoning,
    piReasoningOptions: input.piReasoningOptions,
  });
  const selectedEffort = resolveSelectedEffortForSend({
    provider: input.provider,
    composerEffort: input.composerEffort,
    reasoningOptions,
    copilotReasoningProbe: input.copilotReasoningProbe,
  });

  return buildModelOptionsForDispatch({
    provider: input.provider,
    supportsReasoningEffort: reasoningOptions.length > 0,
    selectedEffort,
    selectedCodexSupportsFastMode:
      input.provider === "codex" && !isCodexOpenRouterModel(input.model),
    selectedCodexFastModeEnabled: input.provider === "codex" ? input.codexFastModeEnabled : false,
  });
}
