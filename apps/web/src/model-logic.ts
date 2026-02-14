export {
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  normalizeModelSlug,
  resolveModelSlug,
} from "@t3tools/contracts";

export const REASONING_OPTIONS = ["xhigh", "high", "medium", "low"] as const;
export type ReasoningEffort = (typeof REASONING_OPTIONS)[number];
export const DEFAULT_REASONING: ReasoningEffort = "high";
