import path from "node:path";

import { Effect, Layer } from "effect";

import { OrchestrationEventRepository } from "../persistence/Services/OrchestrationEvents";
import { makeSqliteOrchestrationEventRepository } from "../persistence/Layers/OrchestrationEvents";
import { OrchestrationEngine } from "./engine";
import { OrchestrationConfig, OrchestrationEngineService } from "./services";

export const OrchestrationEventRepositoryLive = Layer.effect(
  OrchestrationEventRepository,
  Effect.map(OrchestrationConfig, ({ stateDir }) => {
    const dbPath = path.join(stateDir, "orchestration.sqlite");
    return makeSqliteOrchestrationEventRepository(dbPath);
  }),
);

export const OrchestrationEngineLive = Layer.effect(
  OrchestrationEngineService,
  Effect.map(OrchestrationEventRepository, (eventRepository) => {
    return new OrchestrationEngine(eventRepository);
  }),
);

export const OrchestrationLive = OrchestrationEngineLive.pipe(
  Layer.provide(OrchestrationEventRepositoryLive),
);
