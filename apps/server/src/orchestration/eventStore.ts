import fs from "node:fs";
import path from "node:path";

import type { OrchestrationEvent } from "@t3tools/contracts";
import { OrchestrationEventSchema } from "@t3tools/contracts";
import type { SqlClient as SqlClientService } from "@effect/sql/SqlClient";
import * as SqlClient  from "@effect/sql/SqlClient";
import * as SqlSchema from "@effect/sql/SqlSchema";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { Effect, ManagedRuntime, Schema } from "effect";

export interface OrchestrationEventStore {
  append(event: Omit<OrchestrationEvent, "sequence">): Effect.Effect<OrchestrationEvent>;
  readFromSequence(sequenceExclusive: number, limit?: number): Effect.Effect<OrchestrationEvent[]>;
  readAll(): Effect.Effect<OrchestrationEvent[]>;
  close(): void;
}

const decodeEvent = Schema.decodeUnknownSync(OrchestrationEventSchema);

const EventRowSchema = Schema.Struct({
  sequence: Schema.Number,
  eventId: Schema.String,
  type: Schema.String,
  aggregateType: Schema.String,
  aggregateId: Schema.String,
  occurredAt: Schema.String,
  commandId: Schema.NullOr(Schema.String),
  payloadJson: Schema.String,
});

type EventRow = Schema.Schema.Type<typeof EventRowSchema>;

const AppendEventRequestSchema = Schema.Struct({
  eventId: Schema.String,
  type: Schema.String,
  aggregateType: Schema.String,
  aggregateId: Schema.String,
  occurredAt: Schema.String,
  commandId: Schema.NullOr(Schema.String),
  payloadJson: Schema.String,
});

const ReadFromSequenceRequestSchema = Schema.Struct({
  sequenceExclusive: Schema.Number,
  limit: Schema.Number,
});

const appendEventRow = SqlSchema.single({
  Request: AppendEventRequestSchema,
  Result: EventRowSchema,
  execute: (request) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql`
        INSERT INTO orchestration_events (
          event_id,
          event_type,
          aggregate_type,
          aggregate_id,
          occurred_at,
          command_id,
          payload_json
        )
        VALUES (
          ${request.eventId},
          ${request.type},
          ${request.aggregateType},
          ${request.aggregateId},
          ${request.occurredAt},
          ${request.commandId},
          ${request.payloadJson}
        )
        RETURNING
          sequence,
          event_id AS "eventId",
          event_type AS "type",
          aggregate_type AS "aggregateType",
          aggregate_id AS "aggregateId",
          occurred_at AS "occurredAt",
          command_id AS "commandId",
          payload_json AS "payloadJson"
      `,
    ),
});

const readEventRowsFromSequence = SqlSchema.findAll({
  Request: ReadFromSequenceRequestSchema,
  Result: EventRowSchema,
  execute: (request) =>
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql`
        SELECT
          sequence,
          event_id AS "eventId",
          event_type AS "type",
          aggregate_type AS "aggregateType",
          aggregate_id AS "aggregateId",
          occurred_at AS "occurredAt",
          command_id AS "commandId",
          payload_json AS "payloadJson"
        FROM orchestration_events
        WHERE sequence > ${request.sequenceExclusive}
        ORDER BY sequence ASC
        LIMIT ${request.limit}
      `,
    ),
});

function eventRowToOrchestrationEvent(row: EventRow): OrchestrationEvent {
  return decodeEvent({
    sequence: row.sequence,
    eventId: row.eventId,
    type: row.type,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    occurredAt: row.occurredAt,
    commandId: row.commandId,
    payload: JSON.parse(row.payloadJson) as unknown,
  });
}

export class SqliteEventStore implements OrchestrationEventStore {
  private readonly runtime: ManagedRuntime.ManagedRuntime<SqlClientService, unknown>;
  private readonly migrated: Promise<void>;
  private closed = false;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.runtime = ManagedRuntime.make(
      SqliteClient.layer({
        filename: dbPath,
      }),
    );
    this.migrated = this.runtime.runPromise(this.migrate()).then(() => undefined);
  }

  private provideSql<A, E>(
    effect: Effect.Effect<A, E, SqlClientService>,
  ): Effect.Effect<A, E | unknown> {
    return Effect.provide(effect, this.runtime);
  }

  private ensureMigrated(): Effect.Effect<void> {
    return Effect.promise(() => this.migrated);
  }

  private migrate(): Effect.Effect<void, unknown, SqlClientService> {
    return Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`PRAGMA journal_mode = WAL;`;
      yield* sql`PRAGMA foreign_keys = ON;`;
      yield* sql`
        CREATE TABLE IF NOT EXISTS orchestration_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL UNIQUE,
          event_type TEXT NOT NULL,
          aggregate_type TEXT NOT NULL,
          aggregate_id TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          command_id TEXT,
          payload_json TEXT NOT NULL
        )
      `;
      yield* sql`
        CREATE INDEX IF NOT EXISTS idx_orch_events_aggregate
        ON orchestration_events(aggregate_type, aggregate_id, sequence)
      `;
    });
  }

  append(event: Omit<OrchestrationEvent, "sequence">): Effect.Effect<OrchestrationEvent> {
    return Effect.gen(this, function* () {
      yield* this.ensureMigrated();
      const row = yield* this.provideSql(
        appendEventRow({
          eventId: event.eventId,
          type: event.type,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          occurredAt: event.occurredAt,
          commandId: event.commandId,
          payloadJson: JSON.stringify(event.payload),
        }),
      );
      return eventRowToOrchestrationEvent(row);
    }).pipe(Effect.orDie);
  }

  readFromSequence(sequenceExclusive: number, limit = 1_000): Effect.Effect<OrchestrationEvent[]> {
    return Effect.gen(this, function* () {
      yield* this.ensureMigrated();
      const rows = yield* this.provideSql(
        readEventRowsFromSequence({
          sequenceExclusive,
          limit,
        }),
      );
      return rows.map(eventRowToOrchestrationEvent);
    }).pipe(Effect.orDie);
  }

  readAll(): Effect.Effect<OrchestrationEvent[]> {
    return this.readFromSequence(0, Number.MAX_SAFE_INTEGER);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    void this.runtime.dispose();
  }
}
