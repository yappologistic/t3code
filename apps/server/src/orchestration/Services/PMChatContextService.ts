/**
 * PMChatContextService - Service interface for PM chat context aggregation.
 *
 * Provides aggregated project context for PM chat including all threads,
 * features, goals, and context nodes.
 *
 * @module PMChatContextService
 */
import { ContextNode, Feature, Goal, ProjectId, ThreadId } from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { PMChatContextServiceError } from "../Errors.ts";

export interface PMChatProjectContext {
  readonly projectId: ProjectId;
  readonly threads: ReadonlyArray<{
    threadId: ThreadId;
    title: string;
    goalStatement: string;
    status: string;
  }>;
  readonly features: ReadonlyArray<Feature>;
  readonly goals: ReadonlyArray<Goal>;
  readonly contextNodes: ReadonlyArray<ContextNode>;
}

export interface PMChatContextServiceShape {
  readonly getProjectContext: (
    projectId: ProjectId,
  ) => Effect.Effect<PMChatProjectContext, PMChatContextServiceError>;
}

export class PMChatContextService extends ServiceMap.Service<
  PMChatContextService,
  PMChatContextServiceShape
>()("rowl/orchestration/Services/PMChatContextService") {}
