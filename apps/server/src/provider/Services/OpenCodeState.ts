import type {
  ServerOpenCodeState,
  ServerOpenCodeStateInput,
  ServerOpenCodeAddCredentialInput,
  ServerOpenCodeRemoveCredentialInput,
  ServerOpenCodeCredentialResult,
} from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

export interface OpenCodeStateShape {
  readonly getState: (input?: ServerOpenCodeStateInput) => Effect.Effect<ServerOpenCodeState>;
  readonly addCredential: (
    input: ServerOpenCodeAddCredentialInput,
  ) => Effect.Effect<ServerOpenCodeCredentialResult>;
  readonly removeCredential: (
    input: ServerOpenCodeRemoveCredentialInput,
  ) => Effect.Effect<ServerOpenCodeCredentialResult>;
}

export class OpenCodeState extends ServiceMap.Service<OpenCodeState, OpenCodeStateShape>()(
  "cut3/provider/Services/OpenCodeState",
) {}
