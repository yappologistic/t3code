import { Schema } from "effect";

import { IsoDateTime, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas";

export const FeatureStage = Schema.Literals(["backlog", "in_progress", "done", "wishlist"]);
export type FeatureStage = typeof FeatureStage.Type;

export const FeatureId = TrimmedNonEmptyString.pipe(Schema.brand("FeatureId"));
export type FeatureId = typeof FeatureId.Type;

export const Feature = Schema.Struct({
  id: FeatureId,
  projectId: ProjectId,
  name: TrimmedNonEmptyString,
  description: Schema.String,
  stage: FeatureStage,
  threadId: Schema.optional(ThreadId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  createdBy: Schema.Literals(["user", "pm"]),
});
export type Feature = typeof Feature.Type;

export const CreateFeatureInput = Schema.Struct({
  projectId: ProjectId,
  name: TrimmedNonEmptyString,
  description: Schema.String,
  stage: FeatureStage,
  threadId: Schema.optional(ThreadId),
  createdBy: Schema.Literals(["user", "pm"]),
});
export type CreateFeatureInput = typeof CreateFeatureInput.Type;

export const CreateFeatureResult = Schema.Struct({
  feature: Feature,
});
export type CreateFeatureResult = typeof CreateFeatureResult.Type;

export const GetFeatureInput = Schema.Struct({
  id: FeatureId,
});
export type GetFeatureInput = typeof GetFeatureInput.Type;

export const GetFeatureResult = Schema.Struct({
  feature: Feature,
});
export type GetFeatureResult = typeof GetFeatureResult.Type;

export const ListFeaturesByProjectInput = Schema.Struct({
  projectId: ProjectId,
});
export type ListFeaturesByProjectInput = typeof ListFeaturesByProjectInput.Type;

export const ListFeaturesByProjectResult = Schema.Struct({
  features: Schema.Array(Feature),
});
export type ListFeaturesByProjectResult = typeof ListFeaturesByProjectResult.Type;

export const UpdateFeatureStageInput = Schema.Struct({
  id: FeatureId,
  stage: FeatureStage,
});
export type UpdateFeatureStageInput = typeof UpdateFeatureStageInput.Type;

export const UpdateFeatureStageResult = Schema.Struct({
  feature: Feature,
});
export type UpdateFeatureStageResult = typeof UpdateFeatureStageResult.Type;

export const UpdateFeatureInput = Schema.Struct({
  id: FeatureId,
  name: Schema.optional(TrimmedNonEmptyString),
  description: Schema.optional(Schema.String),
  threadId: Schema.optional(Schema.NullOr(ThreadId)),
});
export type UpdateFeatureInput = typeof UpdateFeatureInput.Type;

export const UpdateFeatureResult = Schema.Struct({
  feature: Feature,
});
export type UpdateFeatureResult = typeof UpdateFeatureResult.Type;

export const DeleteFeatureInput = Schema.Struct({
  id: FeatureId,
});
export type DeleteFeatureInput = typeof DeleteFeatureInput.Type;

export const DeleteFeatureResult = Schema.Struct({});
export type DeleteFeatureResult = typeof DeleteFeatureResult.Type;
