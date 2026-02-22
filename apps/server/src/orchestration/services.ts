import { Context } from "effect";

import { OrchestrationEngine } from "./engine";

export class OrchestrationEngineService extends Context.Tag("orchestration/Engine")<
  OrchestrationEngineService,
  OrchestrationEngine
>() {}
