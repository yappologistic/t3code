/**
 * FeatureService - Service interface for feature management.
 *
 * Manages features within projects including CRUD operations and stage
 * transitions.
 *
 * @module FeatureService
 */
import {
  CreateFeatureInput,
  CreateFeatureResult,
  DeleteFeatureInput,
  DeleteFeatureResult,
  Feature,
  FeatureId,
  FeatureStage,
  GetFeatureInput,
  GetFeatureResult,
  ListFeaturesByProjectInput,
  ListFeaturesByProjectResult,
  UpdateFeatureInput,
  UpdateFeatureResult,
  UpdateFeatureStageInput,
  UpdateFeatureStageResult,
} from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { FeatureServiceError } from "../Errors.ts";

export interface FeatureServiceShape {
  readonly createFeature: (
    input: CreateFeatureInput,
  ) => Effect.Effect<CreateFeatureResult, FeatureServiceError>;

  readonly getFeature: (
    input: GetFeatureInput,
  ) => Effect.Effect<GetFeatureResult, FeatureServiceError>;

  readonly listFeaturesByProject: (
    input: ListFeaturesByProjectInput,
  ) => Effect.Effect<ListFeaturesByProjectResult, FeatureServiceError>;

  readonly updateFeature: (
    input: UpdateFeatureInput,
  ) => Effect.Effect<UpdateFeatureResult, FeatureServiceError>;

  readonly updateFeatureStage: (
    input: UpdateFeatureStageInput,
  ) => Effect.Effect<UpdateFeatureStageResult, FeatureServiceError>;

  readonly deleteFeature: (
    input: DeleteFeatureInput,
  ) => Effect.Effect<DeleteFeatureResult, FeatureServiceError>;
}

export class FeatureService extends ServiceMap.Service<FeatureService, FeatureServiceShape>()(
  "rowl/orchestration/Services/FeatureService",
) {}
