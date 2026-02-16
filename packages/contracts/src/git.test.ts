import { describe, expect, it } from "vitest";

import {
  gitPullInputSchema,
  gitPullResultSchema,
  gitRunStackedActionInputSchema,
  gitRunStackedActionResultSchema,
  gitStackedActionSchema,
  gitStatusInputSchema,
  gitStatusResultSchema,
} from "./git";

describe("git contracts", () => {
  it("parses git status input and trims cwd", () => {
    const parsed = gitStatusInputSchema.parse({ cwd: "  /tmp/repo  " });
    expect(parsed.cwd).toBe("/tmp/repo");
  });

  it("parses git pull input and trims cwd", () => {
    const parsed = gitPullInputSchema.parse({ cwd: "  /tmp/repo  " });
    expect(parsed.cwd).toBe("/tmp/repo");
  });

  it("parses git status result", () => {
    const parsed = gitStatusResultSchema.parse({
      branch: "feature/git-actions",
      hasWorkingTreeChanges: true,
      workingTree: {
        files: [
          { path: "src/git.ts", insertions: 8, deletions: 2 },
          { path: "src/git.test.ts", insertions: 4, deletions: 1 },
        ],
        insertions: 12,
        deletions: 3,
      },
      hasUpstream: false,
      aheadCount: 0,
      behindCount: 0,
      pr: null,
    });
    expect(parsed.branch).toBe("feature/git-actions");
    expect(parsed.hasWorkingTreeChanges).toBe(true);
    expect(parsed.workingTree.files[0]?.insertions).toBe(8);
    expect(parsed.workingTree.files).toHaveLength(2);
  });

  it("accepts supported stacked actions", () => {
    expect(gitStackedActionSchema.parse("commit")).toBe("commit");
    expect(gitStackedActionSchema.parse("commit_push")).toBe("commit_push");
    expect(gitStackedActionSchema.parse("commit_push_pr")).toBe("commit_push_pr");
  });

  it("parses stacked action input", () => {
    const parsed = gitRunStackedActionInputSchema.parse({
      cwd: "/tmp/repo",
      action: "commit_push",
    });
    expect(parsed.action).toBe("commit_push");
  });

  it("accepts custom commit message input", () => {
    const parsed = gitRunStackedActionInputSchema.parse({
      cwd: "/tmp/repo",
      action: "commit",
      commitMessage: "  chore: update git action modal  ",
    });
    expect(parsed.commitMessage).toBe("chore: update git action modal");
  });

  it("parses stacked action result with metadata", () => {
    const parsed = gitRunStackedActionResultSchema.parse({
      action: "commit_push_pr",
      commit: {
        status: "created",
        commitSha: "abc123",
        subject: "Implement stacked git actions",
      },
      push: {
        status: "pushed",
        branch: "feature/git-actions",
        upstreamBranch: "origin/feature/git-actions",
        setUpstream: true,
      },
      pr: {
        status: "created",
        url: "https://github.com/pingdotgg/codething-mvp/pull/123",
        number: 123,
        baseBranch: "main",
        headBranch: "feature/git-actions",
        title: "Add stacked git actions workflow",
      },
    });

    expect(parsed.commit.status).toBe("created");
    expect(parsed.pr.number).toBe(123);
  });

  it("parses git pull result", () => {
    const parsed = gitPullResultSchema.parse({
      status: "pulled",
      branch: "feature/my-branch",
      upstreamBranch: "origin/feature/my-branch",
    });
    expect(parsed.status).toBe("pulled");
    expect(parsed.branch).toBe("feature/my-branch");
  });
});
