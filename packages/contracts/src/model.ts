import { Schema } from "effect";
import { ProviderKind } from "./orchestration";

export const CODEX_REASONING_EFFORT_OPTIONS = ["xhigh", "high", "medium", "low"] as const;
export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORT_OPTIONS)[number];
export const COPILOT_REASONING_EFFORT_VALUES = CODEX_REASONING_EFFORT_OPTIONS;
export const COPILOT_REASONING_EFFORT_OPTIONS = ["low", "medium", "high"] as const;
export type CopilotReasoningEffort = (typeof COPILOT_REASONING_EFFORT_VALUES)[number];
export const OPENROUTER_FREE_ROUTER_MODEL = "openrouter/free" as const;
export const OPENCODE_DEFAULT_MODEL = "opencode/default" as const;

export const CodexModelOptions = Schema.Struct({
  reasoningEffort: Schema.optional(Schema.Literals(CODEX_REASONING_EFFORT_OPTIONS)),
  fastMode: Schema.optional(Schema.Boolean),
});
export type CodexModelOptions = typeof CodexModelOptions.Type;

export const CopilotModelOptions = Schema.Struct({
  reasoningEffort: Schema.optional(Schema.Literals(COPILOT_REASONING_EFFORT_VALUES)),
});
export type CopilotModelOptions = typeof CopilotModelOptions.Type;

export const ProviderModelOptions = Schema.Struct({
  codex: Schema.optional(CodexModelOptions),
  copilot: Schema.optional(CopilotModelOptions),
});
export type ProviderModelOptions = typeof ProviderModelOptions.Type;

type ModelOption = {
  readonly slug: string;
  readonly name: string;
};

export type ModelContextWindowSource = "provider-doc" | "vendor-doc" | "provider-config";

export type ModelContextWindowInfo = {
  readonly totalTokens?: number;
  readonly source: ModelContextWindowSource;
  readonly note?: string;
};

const COPILOT_VENDOR_LIMIT_NOTE =
  "GitHub Copilot does not publish a separate context-window limit for this model; the total below comes from the model vendor docs.";
const COPILOT_ANTHROPIC_LONG_CONTEXT_NOTE =
  "Anthropic documents a 200K standard window and 1M beta access for some API setups. GitHub Copilot does not publish whether that extended path is enabled.";
const COPILOT_GEMINI_PREVIEW_NOTE =
  "Google documented Gemini 3 Pro at a 1M input window before deprecating the preview model. GitHub Copilot does not publish a separate limit for its Gemini 3 Pro offering.";

export const MODEL_OPTIONS_BY_PROVIDER = {
  codex: [
    { slug: "gpt-5.4", name: "GPT-5.4" },
    { slug: "gpt-5-codex", name: "GPT-5 Codex" },
    { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
    { slug: "gpt-5.3-codex-spark", name: "GPT-5.3 Codex Spark" },
    { slug: "gpt-5.2-codex", name: "GPT-5.2 Codex" },
    { slug: "gpt-5.2", name: "GPT-5.2" },
    { slug: OPENROUTER_FREE_ROUTER_MODEL, name: "OpenRouter Free Router" },
  ],
  copilot: [
    { slug: "claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
    { slug: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    { slug: "claude-haiku-4.5", name: "Claude Haiku 4.5" },
    { slug: "claude-opus-4.6", name: "Claude Opus 4.6" },
    { slug: "claude-opus-4.6-fast", name: "Claude Opus 4.6 Fast" },
    { slug: "claude-opus-4.5", name: "Claude Opus 4.5" },
    { slug: "claude-sonnet-4", name: "Claude Sonnet 4" },
    { slug: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview" },
    { slug: "gpt-5.4", name: "GPT-5.4" },
    { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
    { slug: "gpt-5.2-codex", name: "GPT-5.2 Codex" },
    { slug: "gpt-5.2", name: "GPT-5.2" },
    { slug: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max" },
    { slug: "gpt-5.1-codex", name: "GPT-5.1 Codex" },
    { slug: "gpt-5.1", name: "GPT-5.1" },
    { slug: "gpt-5.1-codex-mini", name: "GPT-5.1 Codex Mini" },
    { slug: "gpt-5-mini", name: "GPT-5 Mini" },
    { slug: "gpt-4.1", name: "GPT-4.1" },
  ],
  kimi: [{ slug: "kimi-for-coding", name: "Kimi for Coding" }],
  opencode: [{ slug: OPENCODE_DEFAULT_MODEL, name: "OpenCode Default" }],
} as const satisfies Record<ProviderKind, readonly ModelOption[]>;
export type ModelOptionsByProvider = typeof MODEL_OPTIONS_BY_PROVIDER;

type BuiltInModelSlug = ModelOptionsByProvider[ProviderKind][number]["slug"];
export type ModelSlug = BuiltInModelSlug | (string & {});

export const DEFAULT_MODEL_BY_PROVIDER = {
  codex: "gpt-5.4",
  copilot: "claude-sonnet-4.5",
  kimi: "kimi-for-coding",
  opencode: OPENCODE_DEFAULT_MODEL,
} as const satisfies Record<ProviderKind, ModelSlug>;

export const MODEL_CONTEXT_WINDOW_INFO_BY_PROVIDER = {
  codex: {
    "gpt-5.4": {
      totalTokens: 1_000_000,
      source: "provider-doc",
      note: "OpenAI documents GPT-5.4 with a 1M-token context window.",
    },
    "gpt-5-codex": {
      totalTokens: 400_000,
      source: "provider-doc",
    },
    "gpt-5.3-codex": {
      totalTokens: 400_000,
      source: "vendor-doc",
    },
    "gpt-5.3-codex-spark": {
      totalTokens: 128_000,
      source: "provider-doc",
      note: "Codex documents GPT-5.3 Codex Spark as a 128K text-only research preview.",
    },
    "gpt-5.2-codex": {
      totalTokens: 400_000,
      source: "vendor-doc",
    },
    "gpt-5.2": {
      totalTokens: 400_000,
      source: "vendor-doc",
    },
    [OPENROUTER_FREE_ROUTER_MODEL]: {
      source: "provider-doc",
      note: "OpenRouter routes this alias to a currently available free model based on the request. Context window varies by the routed model.",
    },
  },
  copilot: {
    "claude-sonnet-4.6": {
      totalTokens: 200_000,
      source: "vendor-doc",
      note: COPILOT_ANTHROPIC_LONG_CONTEXT_NOTE,
    },
    "claude-sonnet-4.5": {
      totalTokens: 200_000,
      source: "vendor-doc",
      note: COPILOT_ANTHROPIC_LONG_CONTEXT_NOTE,
    },
    "claude-haiku-4.5": {
      totalTokens: 200_000,
      source: "vendor-doc",
      note: COPILOT_VENDOR_LIMIT_NOTE,
    },
    "claude-opus-4.6": {
      totalTokens: 200_000,
      source: "vendor-doc",
      note: COPILOT_ANTHROPIC_LONG_CONTEXT_NOTE,
    },
    "claude-opus-4.6-fast": {
      source: "vendor-doc",
      note: "GitHub exposes Claude Opus 4.6 fast mode as a preview, but Anthropic does not publish a separate context-window limit for that mode.",
    },
    "claude-opus-4.5": {
      totalTokens: 200_000,
      source: "vendor-doc",
      note: COPILOT_VENDOR_LIMIT_NOTE,
    },
    "claude-sonnet-4": {
      totalTokens: 200_000,
      source: "vendor-doc",
      note: COPILOT_ANTHROPIC_LONG_CONTEXT_NOTE,
    },
    "gemini-3-pro-preview": {
      totalTokens: 1_000_000,
      source: "vendor-doc",
      note: COPILOT_GEMINI_PREVIEW_NOTE,
    },
    "gpt-5.4": {
      totalTokens: 1_000_000,
      source: "vendor-doc",
      note: COPILOT_VENDOR_LIMIT_NOTE,
    },
    "gpt-5.3-codex": {
      totalTokens: 400_000,
      source: "vendor-doc",
      note: COPILOT_VENDOR_LIMIT_NOTE,
    },
    "gpt-5.2-codex": {
      totalTokens: 400_000,
      source: "vendor-doc",
      note: COPILOT_VENDOR_LIMIT_NOTE,
    },
    "gpt-5.2": {
      totalTokens: 400_000,
      source: "vendor-doc",
      note: COPILOT_VENDOR_LIMIT_NOTE,
    },
    "gpt-5.1-codex-max": {
      totalTokens: 400_000,
      source: "vendor-doc",
      note: COPILOT_VENDOR_LIMIT_NOTE,
    },
    "gpt-5.1-codex": {
      totalTokens: 400_000,
      source: "vendor-doc",
      note: COPILOT_VENDOR_LIMIT_NOTE,
    },
    "gpt-5.1": {
      totalTokens: 400_000,
      source: "vendor-doc",
      note: COPILOT_VENDOR_LIMIT_NOTE,
    },
    "gpt-5.1-codex-mini": {
      totalTokens: 400_000,
      source: "vendor-doc",
      note: COPILOT_VENDOR_LIMIT_NOTE,
    },
    "gpt-5-mini": {
      totalTokens: 400_000,
      source: "vendor-doc",
      note: COPILOT_VENDOR_LIMIT_NOTE,
    },
    "gpt-4.1": {
      totalTokens: 1_047_576,
      source: "vendor-doc",
      note: COPILOT_VENDOR_LIMIT_NOTE,
    },
  },
  kimi: {
    "kimi-for-coding": {
      totalTokens: 262_144,
      source: "provider-config",
      note: "The Kimi integration configures a default max_context_size of 262,144 tokens.",
    },
  },
  opencode: {
    [OPENCODE_DEFAULT_MODEL]: {
      source: "provider-config",
      note: "CUT3 leaves model selection to OpenCode's own provider/config defaults until the session advertises a concrete model list.",
    },
  },
} as const satisfies Record<ProviderKind, Record<string, ModelContextWindowInfo>>;

export const MODEL_SLUG_ALIASES_BY_PROVIDER = {
  codex: {
    "5.4": "gpt-5.4",
    "5.3": "gpt-5.3-codex",
    "gpt-5.3": "gpt-5.3-codex",
    "5.3-spark": "gpt-5.3-codex-spark",
    "gpt-5.3-spark": "gpt-5.3-codex-spark",
  },
  copilot: {},
  kimi: {},
  opencode: {},
} as const satisfies Record<ProviderKind, Record<string, ModelSlug>>;

export const REASONING_EFFORT_OPTIONS_BY_PROVIDER = {
  codex: CODEX_REASONING_EFFORT_OPTIONS,
  copilot: COPILOT_REASONING_EFFORT_OPTIONS,
  kimi: [],
  opencode: [],
} as const satisfies Record<ProviderKind, readonly CodexReasoningEffort[]>;

export const DEFAULT_REASONING_EFFORT_BY_PROVIDER = {
  codex: "high",
  copilot: "high",
  kimi: null,
  opencode: null,
} as const satisfies Record<ProviderKind, CodexReasoningEffort | null>;
