/**
 * ProviderHealth - Provider readiness status service.
 *
 * Owns provider install/auth reachability checks and exposes an effect that
 * transport layers can rerun when they need a fresh snapshot.
 *
 * @module ProviderHealth
 */
import type { ServerProviderStatus } from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

export interface ProviderHealthShape {
  /**
   * Read provider health statuses on demand.
   */
  readonly getStatuses: Effect.Effect<ReadonlyArray<ServerProviderStatus>>;
}

export class ProviderHealth extends ServiceMap.Service<ProviderHealth, ProviderHealthShape>()(
  "cut3/provider/Services/ProviderHealth",
) {}
