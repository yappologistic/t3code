import { describe, expect, it } from "vitest";

import { buildNewThreadDraftContextPatch } from "./newThreadDraftContext";

describe("buildNewThreadDraftContextPatch", () => {
  it("returns null when no context overrides are provided", () => {
    expect(buildNewThreadDraftContextPatch(undefined)).toBeNull();
    expect(buildNewThreadDraftContextPatch({})).toBeNull();
  });

  it("preserves explicit worktree overrides", () => {
    expect(
      buildNewThreadDraftContextPatch({
        branch: "feature/worktree",
        worktreePath: "/tmp/feature-worktree",
        envMode: "worktree",
      }),
    ).toEqual({
      branch: "feature/worktree",
      worktreePath: "/tmp/feature-worktree",
      envMode: "worktree",
    });
  });

  it("clears inherited branch and worktree state when switching an existing draft back to local", () => {
    expect(
      buildNewThreadDraftContextPatch({
        envMode: "local",
      }),
    ).toEqual({
      branch: null,
      worktreePath: null,
      envMode: "local",
    });
  });

  it("keeps an explicit local branch override while still clearing worktree reuse", () => {
    expect(
      buildNewThreadDraftContextPatch({
        branch: "main",
        envMode: "local",
      }),
    ).toEqual({
      branch: "main",
      worktreePath: null,
      envMode: "local",
    });
  });
});
