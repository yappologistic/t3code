import { type ChildProcessWithoutNullStreams, spawnSync } from "node:child_process";

import * as acp from "@agentclientprotocol/sdk";
import type { ProviderApprovalDecision } from "@t3tools/contracts";

export type AcpPermissionRequestType =
  | "command_execution_approval"
  | "file_read_approval"
  | "file_change_approval";

export function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export function readResumeSessionId(input: {
  readonly resumeCursor?: unknown;
}): string | undefined {
  return asString(asObject(input.resumeCursor)?.sessionId);
}

export function mapToolKindToItemType(kind: acp.ToolKind | null | undefined) {
  switch (kind) {
    case "execute":
      return "command_execution" as const;
    case "edit":
    case "delete":
    case "move":
      return "file_change" as const;
    case "search":
    case "fetch":
    case "read":
      return "dynamic_tool_call" as const;
    case "think":
      return "reasoning" as const;
    default:
      return "dynamic_tool_call" as const;
  }
}

export function mapToolKindToRequestType(
  kind: acp.ToolKind | null | undefined,
): AcpPermissionRequestType {
  switch (kind) {
    case "execute":
      return "command_execution_approval";
    case "edit":
    case "delete":
    case "move":
      return "file_change_approval";
    default:
      return "file_read_approval";
  }
}

export function mapToolCallStatus(
  status: acp.ToolCallStatus | null | undefined,
): "inProgress" | "completed" | "failed" | undefined {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "pending":
    case "in_progress":
      return "inProgress";
    default:
      return undefined;
  }
}

export function mapPlanEntryStatus(
  status: acp.PlanEntryStatus,
): "pending" | "inProgress" | "completed" {
  switch (status) {
    case "in_progress":
      return "inProgress";
    case "completed":
      return "completed";
    case "pending":
    default:
      return "pending";
  }
}

export function extractTextFromContentBlock(
  block: acp.ContentBlock | undefined,
): string | undefined {
  if (!block || typeof block !== "object" || !("type" in block)) {
    return undefined;
  }
  if (block.type === "text") {
    return block.text;
  }
  return undefined;
}

export function summarizeToolContent(
  content: ReadonlyArray<acp.ToolCallContent> | null | undefined,
) {
  if (!content) {
    return undefined;
  }

  for (const entry of content) {
    if (entry.type === "content") {
      const text = extractTextFromContentBlock(entry.content);
      if (text && text.trim().length > 0) {
        return text.trim();
      }
    }

    if (entry.type === "diff") {
      const path = entry.path?.trim();
      if (path) {
        return path;
      }
    }
  }

  return undefined;
}

export function createPermissionOutcome(
  decision: ProviderApprovalDecision,
  options: ReadonlyArray<acp.PermissionOption>,
): acp.RequestPermissionResponse {
  const selectByKind = (
    expectedKind: acp.PermissionOptionKind,
  ): acp.RequestPermissionResponse | undefined => {
    const option = options.find((candidate) => candidate.kind === expectedKind);
    if (!option) {
      return undefined;
    }
    return {
      outcome: {
        outcome: "selected",
        optionId: option.optionId,
      },
    };
  };

  switch (decision) {
    case "acceptForSession":
      return (
        selectByKind("allow_always") ??
        selectByKind("allow_once") ?? {
          outcome: { outcome: "cancelled" },
        }
      );
    case "accept":
      return (
        selectByKind("allow_once") ?? {
          outcome: { outcome: "cancelled" },
        }
      );
    case "decline":
      return (
        selectByKind("reject_once") ??
        selectByKind("reject_always") ?? {
          outcome: { outcome: "cancelled" },
        }
      );
    case "cancel":
    default:
      return { outcome: { outcome: "cancelled" } };
  }
}

export function permissionDecisionFromOutcome(
  outcome: acp.RequestPermissionResponse["outcome"],
  options: ReadonlyArray<acp.PermissionOption>,
): ProviderApprovalDecision {
  if (outcome.outcome === "cancelled") {
    return "cancel";
  }

  const selectedOption = options.find((option) => option.optionId === outcome.optionId);
  switch (selectedOption?.kind) {
    case "allow_always":
      return "acceptForSession";
    case "reject_once":
    case "reject_always":
      return "decline";
    case "allow_once":
    default:
      return "accept";
  }
}

export function killChildTree(child: ChildProcessWithoutNullStreams): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fallback to direct kill below.
    }
  }
  child.kill();
}
