import type {
  CodexReasoningEffort,
  ProviderKind,
  ServerCopilotReasoningProbe,
} from "@t3tools/contracts";
import {
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  isCodexOpenRouterModel,
} from "@t3tools/shared/model";

export function buildModelOptionsForDispatch(input: {
  readonly provider: ProviderKind;
  readonly supportsReasoningEffort: boolean;
  readonly selectedEffort: CodexReasoningEffort | null;
  readonly selectedCodexSupportsFastMode: boolean;
  readonly selectedCodexFastModeEnabled: boolean;
}) {
  if (input.provider === "codex") {
    const codexOptions = {
      ...(input.supportsReasoningEffort && input.selectedEffort
        ? { reasoningEffort: input.selectedEffort }
        : {}),
      ...(input.selectedCodexSupportsFastMode && input.selectedCodexFastModeEnabled
        ? { fastMode: true }
        : {}),
    };
    return Object.keys(codexOptions).length > 0 ? { codex: codexOptions } : undefined;
  }

  if (input.provider === "copilot") {
    const copilotReasoningEffort =
      input.supportsReasoningEffort && input.selectedEffort ? input.selectedEffort : undefined;
    return copilotReasoningEffort
      ? { copilot: { reasoningEffort: copilotReasoningEffort } }
      : undefined;
  }

  return undefined;
}

function resolveReasoningOptionsForSend(input: {
  readonly provider: ProviderKind;
  readonly model: string;
  readonly copilotReasoningProbe: ServerCopilotReasoningProbe | null | undefined;
  readonly openRouterSupportsReasoningEffort: boolean;
}): ReadonlyArray<CodexReasoningEffort> {
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

  return getReasoningEffortOptions(input.provider);
}

function resolveSelectedEffortForSend(input: {
  readonly provider: ProviderKind;
  readonly composerEffort: CodexReasoningEffort | null | undefined;
  readonly reasoningOptions: ReadonlyArray<CodexReasoningEffort>;
  readonly copilotReasoningProbe: ServerCopilotReasoningProbe | null | undefined;
}): CodexReasoningEffort | null {
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

  return input.reasoningOptions[0] ?? null;
}

export function buildModelOptionsForSend(input: {
  readonly provider: ProviderKind;
  readonly model: string;
  readonly composerEffort: CodexReasoningEffort | null | undefined;
  readonly codexFastModeEnabled: boolean;
  readonly copilotReasoningProbe: ServerCopilotReasoningProbe | null | undefined;
  readonly openRouterSupportsReasoningEffort: boolean;
}) {
  const reasoningOptions = resolveReasoningOptionsForSend({
    provider: input.provider,
    model: input.model,
    copilotReasoningProbe: input.copilotReasoningProbe,
    openRouterSupportsReasoningEffort: input.openRouterSupportsReasoningEffort,
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
