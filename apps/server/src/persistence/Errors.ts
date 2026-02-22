import { ParseResult, Schema } from "effect";

export class PersistenceSqlError extends Schema.TaggedError<PersistenceSqlError>()(
  "PersistenceSqlError",
  {
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `SQL error in ${this.operation}: ${this.detail}`;
  }
}

export class PersistenceDecodeError extends Schema.TaggedError<PersistenceDecodeError>()(
  "PersistenceDecodeError",
  {
    operation: Schema.String,
    issue: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Decode error in ${this.operation}: ${this.issue}`;
  }
}

export class PersistenceSerializationError extends Schema.TaggedError<PersistenceSerializationError>()(
  "PersistenceSerializationError",
  {
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Serialization error in ${this.operation}: ${this.detail}`;
  }
}

export class ProjectValidationError extends Schema.TaggedError<ProjectValidationError>()(
  "ProjectValidationError",
  {
    operation: Schema.String,
    issue: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Project validation failed in ${this.operation}: ${this.issue}`;
  }
}

export class ProjectPathMissingError extends Schema.TaggedError<ProjectPathMissingError>()(
  "ProjectPathMissingError",
  {
    cwd: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Project path does not exist: ${this.cwd}`;
  }
}

export class ProjectNotFoundError extends Schema.TaggedError<ProjectNotFoundError>()(
  "ProjectNotFoundError",
  {
    projectId: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Project not found: ${this.projectId}`;
  }
}

export type ProjectRepositoryError =
  | PersistenceSqlError
  | PersistenceDecodeError
  | PersistenceSerializationError
  | ProjectValidationError
  | ProjectPathMissingError
  | ProjectNotFoundError;

export type OrchestrationEventRepositoryError =
  | PersistenceSqlError
  | PersistenceDecodeError
  | PersistenceSerializationError;

export function toPersistenceSqlError(operation: string) {
  return (cause: unknown): PersistenceSqlError =>
    new PersistenceSqlError({
      operation,
      detail: `Failed to execute ${operation}`,
      cause,
    });
}

export function toPersistenceDecodeError(operation: string) {
  return (error: ParseResult.ParseError): PersistenceDecodeError =>
    new PersistenceDecodeError({
      operation,
      issue: ParseResult.TreeFormatter.formatErrorSync(error),
      cause: error,
    });
}

export function toPersistenceDecodeCauseError(operation: string) {
  return (cause: unknown): PersistenceDecodeError =>
    new PersistenceDecodeError({
      operation,
      issue: `Failed to execute ${operation}`,
      cause,
    });
}

export function toPersistenceSerializationError(operation: string) {
  return (cause: unknown): PersistenceSerializationError =>
    new PersistenceSerializationError({
      operation,
      detail: `Failed to execute ${operation}`,
      cause,
    });
}
