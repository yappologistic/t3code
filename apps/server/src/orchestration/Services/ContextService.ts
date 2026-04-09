/**
 * ContextService - Service interface for context node management.
 *
 * Manages context nodes including CRUD operations, compression,
 * and context budget tracking.
 *
 * @module ContextService
 */
import {
  CompressContextNodeInput,
  CompressContextNodeResult,
  ContextBudget,
  ContextNode,
  ContextNodeId,
  CreateContextNodeInput,
  CreateContextNodeResult,
  DeleteContextNodeInput,
  DeleteContextNodeResult,
  GetContextNodeInput,
  GetContextNodeResult,
  ListContextNodesByProjectInput,
  ListContextNodesByProjectResult,
  ListContextNodesByThreadInput,
  ListContextNodesByThreadResult,
  RestoreContextNodeInput,
  RestoreContextNodeResult,
} from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ContextServiceError } from "../Errors.ts";

export interface ContextServiceShape {
  readonly createContextNode: (
    input: CreateContextNodeInput,
  ) => Effect.Effect<CreateContextNodeResult, ContextServiceError>;

  readonly getContextNode: (
    input: GetContextNodeInput,
  ) => Effect.Effect<GetContextNodeResult, ContextServiceError>;

  readonly listContextNodesByProject: (
    input: ListContextNodesByProjectInput,
  ) => Effect.Effect<ListContextNodesByProjectResult, ContextServiceError>;

  readonly listContextNodesByThread: (
    input: ListContextNodesByThreadInput,
  ) => Effect.Effect<ListContextNodesByThreadResult, ContextServiceError>;

  readonly compressContextNode: (
    input: CompressContextNodeInput,
  ) => Effect.Effect<CompressContextNodeResult, ContextServiceError>;

  readonly restoreContextNode: (
    input: RestoreContextNodeInput,
  ) => Effect.Effect<RestoreContextNodeResult, ContextServiceError>;

  readonly deleteContextNode: (
    input: DeleteContextNodeInput,
  ) => Effect.Effect<DeleteContextNodeResult, ContextServiceError>;

  readonly getContextBudget: (
    projectId: string,
  ) => Effect.Effect<ContextBudget, ContextServiceError>;
}

export class ContextService extends ServiceMap.Service<ContextService, ContextServiceShape>()(
  "rowl/orchestration/Services/ContextService",
) {}
