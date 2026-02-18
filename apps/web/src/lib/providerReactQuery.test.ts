import type { NativeApi } from "@t3tools/contracts";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { checkpointDiffQueryOptions, providerQueryKeys } from "./providerReactQuery";

describe("providerQueryKeys.checkpointDiff", () => {
  it("includes cacheScope so reused turn counts do not collide", () => {
    const baseInput = {
      sessionId: "session-id",
      threadRuntimeId: "thread-id",
      fromTurnCount: 1,
      toTurnCount: 2,
    } as const;

    expect(
      providerQueryKeys.checkpointDiff({
        ...baseInput,
        cacheScope: "turn:old-turn",
      }),
    ).not.toEqual(
      providerQueryKeys.checkpointDiff({
        ...baseInput,
        cacheScope: "turn:new-turn",
      }),
    );
  });
});

describe("checkpointDiffQueryOptions", () => {
  it("forwards checkpoint range to the provider API", async () => {
    const getCheckpointDiff = vi.fn().mockResolvedValue({ diff: "patch" });
    const api = {
      providers: {
        getCheckpointDiff,
      },
    } as unknown as NativeApi;

    const options = checkpointDiffQueryOptions(api, {
      sessionId: "session-id",
      threadRuntimeId: "thread-id",
      fromTurnCount: 3,
      toTurnCount: 4,
      cacheScope: "turn:abc",
    });

    const queryClient = new QueryClient();
    await queryClient.fetchQuery(options);

    expect(getCheckpointDiff).toHaveBeenCalledWith({
      sessionId: "session-id",
      fromTurnCount: 3,
      toTurnCount: 4,
    });
  });
});
