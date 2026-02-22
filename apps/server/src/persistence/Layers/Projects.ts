import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  ProjectAddInput,
  ProjectAddResult,
  ProjectListResult,
  ProjectRecord,
  ProjectScript,
  ProjectUpdateScriptsResult,
} from "@t3tools/contracts";
import {
  normalizeProjectScripts,
  projectAddInputSchema,
  projectRecordSchema,
  projectRemoveInputSchema,
  projectScriptsSchema,
  projectUpdateScriptsInputSchema,
} from "@t3tools/contracts";
import * as SqlClient from "@effect/sql/SqlClient";
import * as SqlSchema from "@effect/sql/SqlSchema";
import { Effect, Layer, Option, Schema } from "effect";

import { ProjectRepository, type ProjectRepositoryShape } from "../Services/Projects";

const ProjectRowSchema = Schema.Struct({
  id: Schema.String,
  cwd: Schema.String,
  name: Schema.String,
  scriptsJson: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

type ProjectRow = Schema.Schema.Type<typeof ProjectRowSchema>;

const FindByIdRequestSchema = Schema.Struct({
  id: Schema.String,
});

const FindByCwdRequestSchema = Schema.Struct({
  cwd: Schema.String,
});

const InsertProjectRequestSchema = Schema.Struct({
  id: Schema.String,
  cwd: Schema.String,
  name: Schema.String,
  scriptsJson: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

const UpdateScriptsRequestSchema = Schema.Struct({
  id: Schema.String,
  scriptsJson: Schema.String,
  updatedAt: Schema.String,
});

const DeleteProjectRequestSchema = Schema.Struct({
  id: Schema.String,
});

function cloneScripts(scripts: readonly ProjectScript[]): ProjectScript[] {
  const cloned: ProjectScript[] = [];
  for (const script of scripts) {
    cloned.push({
      id: script.id,
      name: script.name,
      command: script.command,
      icon: script.icon,
      runOnWorktreeCreate: script.runOnWorktreeCreate,
    });
  }
  return cloned;
}

function normalizeCwd(rawCwd: string): string {
  const resolved = path.resolve(rawCwd.trim());
  const normalized = path.normalize(resolved);
  if (process.platform === "win32") {
    return normalized.toLowerCase();
  }
  return normalized;
}

function isDirectory(cwd: string): boolean {
  try {
    return fs.statSync(cwd).isDirectory();
  } catch {
    return false;
  }
}

function inferProjectName(cwd: string): string {
  const name = path.basename(cwd);
  return name.length > 0 ? name : "project";
}

function parseScriptsJson(raw: string): ProjectScript[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const scripts = projectScriptsSchema.parse(parsed);
    return normalizeProjectScripts(scripts);
  } catch {
    return [];
  }
}

function rowToProjectRecord(row: ProjectRow): ProjectRecord {
  return projectRecordSchema.parse({
    id: row.id,
    cwd: row.cwd,
    name: row.name,
    scripts: parseScriptsJson(row.scriptsJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

const makeRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const listProjectRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectRowSchema,
    execute: () =>
      sql`
        SELECT
          id,
          cwd,
          name,
          scripts_json AS "scriptsJson",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projects
        ORDER BY created_at DESC
      `,
  });

  const findProjectById = SqlSchema.findOne({
    Request: FindByIdRequestSchema,
    Result: ProjectRowSchema,
    execute: ({ id }) =>
      sql`
        SELECT
          id,
          cwd,
          name,
          scripts_json AS "scriptsJson",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projects
        WHERE id = ${id}
      `,
  });

  const findProjectByCwd = SqlSchema.findOne({
    Request: FindByCwdRequestSchema,
    Result: ProjectRowSchema,
    execute: ({ cwd }) =>
      sql`
        SELECT
          id,
          cwd,
          name,
          scripts_json AS "scriptsJson",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projects
        WHERE cwd = ${cwd}
      `,
  });

  const insertProject = SqlSchema.single({
    Request: InsertProjectRequestSchema,
    Result: ProjectRowSchema,
    execute: (request) =>
      sql`
        INSERT INTO projects (
          id,
          cwd,
          name,
          scripts_json,
          created_at,
          updated_at
        )
        VALUES (
          ${request.id},
          ${request.cwd},
          ${request.name},
          ${request.scriptsJson},
          ${request.createdAt},
          ${request.updatedAt}
        )
        RETURNING
          id,
          cwd,
          name,
          scripts_json AS "scriptsJson",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
  });

  const updateProjectScripts = SqlSchema.single({
    Request: UpdateScriptsRequestSchema,
    Result: ProjectRowSchema,
    execute: (request) =>
      sql`
        UPDATE projects
        SET
          scripts_json = ${request.scriptsJson},
          updated_at = ${request.updatedAt}
        WHERE id = ${request.id}
        RETURNING
          id,
          cwd,
          name,
          scripts_json AS "scriptsJson",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
  });

  const deleteProject = SqlSchema.void({
    Request: DeleteProjectRequestSchema,
    execute: ({ id }) => sql`DELETE FROM projects WHERE id = ${id}`,
  });

  const list: ProjectRepositoryShape["list"] = () =>
    listProjectRows(undefined).pipe(
      Effect.map((rows): ProjectListResult => rows.map(rowToProjectRecord)),
      Effect.map((projects) =>
        projects.map((project) => ({ ...project, scripts: cloneScripts(project.scripts) })),
      ),
      Effect.orDie,
    );

  const add: ProjectRepositoryShape["add"] = (rawInput) =>
    Effect.gen(function* () {
      const input = projectAddInputSchema.parse(rawInput as ProjectAddInput);
      const normalizedCwd = normalizeCwd(input.cwd);
      if (!isDirectory(normalizedCwd)) {
        return yield* Effect.fail(new Error(`Project path does not exist: ${normalizedCwd}`));
      }

      const existing = yield* findProjectByCwd({ cwd: normalizedCwd }).pipe(Effect.orDie);
      if (Option.isSome(existing)) {
        const project = rowToProjectRecord(existing.value);
        const result: ProjectAddResult = {
          project: {
            ...project,
            scripts: cloneScripts(project.scripts),
          },
          created: false,
        };
        return result;
      }

      const now = new Date().toISOString();
      const row = yield* insertProject({
        id: randomUUID(),
        cwd: normalizedCwd,
        name: inferProjectName(normalizedCwd),
        scriptsJson: "[]",
        createdAt: now,
        updatedAt: now,
      }).pipe(Effect.orDie);

      const created = rowToProjectRecord(row);
      const result: ProjectAddResult = {
        project: {
          ...created,
          scripts: cloneScripts(created.scripts),
        },
        created: true,
      };
      return result;
    });

  const remove: ProjectRepositoryShape["remove"] = (rawInput) =>
    Effect.gen(function* () {
      const input = projectRemoveInputSchema.parse(rawInput);
      yield* deleteProject({ id: input.id }).pipe(Effect.orDie);
    });

  const updateScripts: ProjectRepositoryShape["updateScripts"] = (rawInput) =>
    Effect.gen(function* () {
      const input = projectUpdateScriptsInputSchema.parse(rawInput);
      const existing = yield* findProjectById({ id: input.id }).pipe(Effect.orDie);
      if (Option.isNone(existing)) {
        return yield* Effect.fail(new Error(`Project not found: ${input.id}`));
      }

      const nextScripts = normalizeProjectScripts(projectScriptsSchema.parse(input.scripts));
      const nextUpdatedAt = new Date().toISOString();
      const updatedRow = yield* updateProjectScripts({
        id: input.id,
        scriptsJson: JSON.stringify(nextScripts),
        updatedAt: nextUpdatedAt,
      }).pipe(Effect.orDie);

      const updated = rowToProjectRecord(updatedRow);
      const result: ProjectUpdateScriptsResult = {
        project: {
          ...updated,
          scripts: cloneScripts(updated.scripts),
        },
      };
      return result;
    });

  const pruneMissing: ProjectRepositoryShape["pruneMissing"] = () =>
    listProjectRows(undefined).pipe(
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (row) => {
          const normalizedCwd = normalizeCwd(row.cwd);
          if (isDirectory(normalizedCwd)) {
            return Effect.void;
          }
          return deleteProject({ id: row.id }).pipe(Effect.orDie);
        }),
      ),
      Effect.asVoid,
      Effect.orDie,
    );

  return {
    list,
    add,
    remove,
    updateScripts,
    pruneMissing,
  } satisfies ProjectRepositoryShape;
});

export const ProjectRepositoryLive = Layer.effect(ProjectRepository, makeRepository);
