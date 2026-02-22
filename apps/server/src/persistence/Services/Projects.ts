import type {
  ProjectAddInput,
  ProjectAddResult,
  ProjectListResult,
  ProjectRemoveInput,
  ProjectUpdateScriptsInput,
  ProjectUpdateScriptsResult,
} from "@t3tools/contracts";
import { Context } from "effect";
import type { Effect } from "effect";

export interface ProjectRepositoryShape {
  readonly list: () => Effect.Effect<ProjectListResult>;
  readonly add: (input: ProjectAddInput) => Effect.Effect<ProjectAddResult, Error>;
  readonly remove: (input: ProjectRemoveInput) => Effect.Effect<void, Error>;
  readonly updateScripts: (
    input: ProjectUpdateScriptsInput,
  ) => Effect.Effect<ProjectUpdateScriptsResult, Error>;
  readonly pruneMissing: () => Effect.Effect<void>;
}

export class ProjectRepository extends Context.Tag("persistence/ProjectRepository")<
  ProjectRepository,
  ProjectRepositoryShape
>() {}
