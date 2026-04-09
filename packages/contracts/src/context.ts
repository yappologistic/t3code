import { Schema } from "effect";

import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas";

export const ContextNodeType = Schema.Literals(["messages", "file", "artifact", "memory"]);
export type ContextNodeType = typeof ContextNodeType.Type;

export const ContextNodeId = TrimmedNonEmptyString.pipe(Schema.brand("ContextNodeId"));
export type ContextNodeId = typeof ContextNodeId.Type;

export const ContextNode = Schema.Struct({
  id: ContextNodeId,
  projectId: ProjectId,
  threadId: ThreadId,
  type: ContextNodeType,
  summary: TrimmedNonEmptyString,
  size: NonNegativeInt,
  compressed: Schema.Boolean,
  createdAt: IsoDateTime,
});
export type ContextNode = typeof ContextNode.Type;

export const ContextBudget = Schema.Struct({
  total: NonNegativeInt,
  used: NonNegativeInt,
  available: NonNegativeInt,
  compressionRatio: Schema.Number,
});
export type ContextBudget = typeof ContextBudget.Type;

export const GetContextNodeInput = Schema.Struct({
  id: ContextNodeId,
});
export type GetContextNodeInput = typeof GetContextNodeInput.Type;

export const GetContextNodeResult = Schema.Struct({
  node: ContextNode,
});
export type GetContextNodeResult = typeof GetContextNodeResult.Type;

export const ListContextNodesByProjectInput = Schema.Struct({
  projectId: ProjectId,
});
export type ListContextNodesByProjectInput = typeof ListContextNodesByProjectInput.Type;

export const ListContextNodesByProjectResult = Schema.Struct({
  nodes: Schema.Array(ContextNode),
  budget: ContextBudget,
});
export type ListContextNodesByProjectResult = typeof ListContextNodesByProjectResult.Type;

export const ListContextNodesByThreadInput = Schema.Struct({
  threadId: ThreadId,
});
export type ListContextNodesByThreadInput = typeof ListContextNodesByThreadInput.Type;

export const ListContextNodesByThreadResult = Schema.Struct({
  nodes: Schema.Array(ContextNode),
});
export type ListContextNodesByThreadResult = typeof ListContextNodesByThreadResult.Type;

export const CompressContextNodeInput = Schema.Struct({
  id: ContextNodeId,
});
export type CompressContextNodeInput = typeof CompressContextNodeInput.Type;

export const CompressContextNodeResult = Schema.Struct({
  node: ContextNode,
});
export type CompressContextNodeResult = typeof CompressContextNodeResult.Type;

export const RestoreContextNodeInput = Schema.Struct({
  id: ContextNodeId,
});
export type RestoreContextNodeInput = typeof RestoreContextNodeInput.Type;

export const RestoreContextNodeResult = Schema.Struct({
  node: ContextNode,
});
export type RestoreContextNodeResult = typeof RestoreContextNodeResult.Type;

export const CreateContextNodeInput = Schema.Struct({
  projectId: ProjectId,
  threadId: ThreadId,
  type: ContextNodeType,
  summary: TrimmedNonEmptyString,
  size: NonNegativeInt,
});
export type CreateContextNodeInput = typeof CreateContextNodeInput.Type;

export const CreateContextNodeResult = Schema.Struct({
  node: ContextNode,
});
export type CreateContextNodeResult = typeof CreateContextNodeResult.Type;

export const DeleteContextNodeInput = Schema.Struct({
  id: ContextNodeId,
});
export type DeleteContextNodeInput = typeof DeleteContextNodeInput.Type;

export const DeleteContextNodeResult = Schema.Struct({});
export type DeleteContextNodeResult = typeof DeleteContextNodeResult.Type;
