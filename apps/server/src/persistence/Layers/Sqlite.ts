import fs from "node:fs";
import path from "node:path";

import * as SqlClient from "@effect/sql/SqlClient";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { Context, Effect, Layer } from "effect";

import { runMigrations } from "../Migrations";

export interface PersistenceConfigShape {
  readonly dbPath: string;
}

export class PersistenceConfig extends Context.Tag("persistence/Config")<
  PersistenceConfig,
  PersistenceConfigShape
>() {}

export function makeSqlitePersistenceLive(dbPath: string) {
  const SqliteClientLive = Layer.unwrapEffect(
    Effect.sync(() => {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      return SqliteClient.layer({ filename: dbPath });
    }),
  );

  return Layer.scoped(
    SqlClient.SqlClient,
    Effect.gen(function* () {
      const sql = yield* SqliteClient.SqliteClient;
      yield* sql`PRAGMA journal_mode = WAL;`;
      yield* sql`PRAGMA foreign_keys = ON;`;
      yield* runMigrations;
      return sql;
    }),
  ).pipe(Layer.provide(SqliteClientLive));
}

export const SqlitePersistenceLive = Layer.unwrapEffect(
  Effect.map(PersistenceConfig, ({ dbPath }) => makeSqlitePersistenceLive(dbPath)),
);
