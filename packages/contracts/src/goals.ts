import { Schema } from "effect";

import { IsoDateTime, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas";

export const GoalId = TrimmedNonEmptyString.pipe(Schema.brand("GoalId"));
export type GoalId = typeof GoalId.Type;

export const Goal = Schema.Struct({
  id: GoalId,
  projectId: ProjectId,
  text: TrimmedNonEmptyString,
  isMain: Schema.Boolean,
  linkedThreadIds: Schema.Array(ThreadId),
  createdAt: IsoDateTime,
});
export type Goal = typeof Goal.Type;

export const CreateGoalInput = Schema.Struct({
  projectId: ProjectId,
  text: TrimmedNonEmptyString,
  isMain: Schema.Boolean,
});
export type CreateGoalInput = typeof CreateGoalInput.Type;

export const CreateGoalResult = Schema.Struct({
  goal: Goal,
});
export type CreateGoalResult = typeof CreateGoalResult.Type;

export const GetGoalInput = Schema.Struct({
  id: GoalId,
});
export type GetGoalInput = typeof GetGoalInput.Type;

export const GetGoalResult = Schema.Struct({
  goal: Goal,
});
export type GetGoalResult = typeof GetGoalResult.Type;

export const ListGoalsByProjectInput = Schema.Struct({
  projectId: ProjectId,
});
export type ListGoalsByProjectInput = typeof ListGoalsByProjectInput.Type;

export const ListGoalsByProjectResult = Schema.Struct({
  goals: Schema.Array(Goal),
});
export type ListGoalsByProjectResult = typeof ListGoalsByProjectResult.Type;

export const SetMainGoalInput = Schema.Struct({
  id: GoalId,
  isMain: Schema.Boolean,
});
export type SetMainGoalInput = typeof SetMainGoalInput.Type;

export const SetMainGoalResult = Schema.Struct({
  goal: Goal,
});
export type SetMainGoalResult = typeof SetMainGoalResult.Type;

export const LinkThreadToGoalInput = Schema.Struct({
  goalId: GoalId,
  threadId: ThreadId,
});
export type LinkThreadToGoalInput = typeof LinkThreadToGoalInput.Type;

export const LinkThreadToGoalResult = Schema.Struct({
  goal: Goal,
});
export type LinkThreadToGoalResult = typeof LinkThreadToGoalResult.Type;

export const UnlinkThreadFromGoalInput = Schema.Struct({
  goalId: GoalId,
  threadId: ThreadId,
});
export type UnlinkThreadFromGoalInput = typeof UnlinkThreadFromGoalInput.Type;

export const UnlinkThreadFromGoalResult = Schema.Struct({
  goal: Goal,
});
export type UnlinkThreadFromGoalResult = typeof UnlinkThreadFromGoalResult.Type;

export const UpdateGoalTextInput = Schema.Struct({
  id: GoalId,
  text: TrimmedNonEmptyString,
});
export type UpdateGoalTextInput = typeof UpdateGoalTextInput.Type;

export const UpdateGoalTextResult = Schema.Struct({
  goal: Goal,
});
export type UpdateGoalTextResult = typeof UpdateGoalTextResult.Type;

export const DeleteGoalInput = Schema.Struct({
  id: GoalId,
});
export type DeleteGoalInput = typeof DeleteGoalInput.Type;

export const DeleteGoalResult = Schema.Struct({});
export type DeleteGoalResult = typeof DeleteGoalResult.Type;
