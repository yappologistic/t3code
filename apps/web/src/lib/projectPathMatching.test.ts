import { describe, expect, it } from "vitest";

import {
  normalizeWorkspacePathForComparison,
  workspacePathsLikelyMatch,
} from "./projectPathMatching";

describe("normalizeWorkspacePathForComparison", () => {
  it("returns null for empty values", () => {
    expect(normalizeWorkspacePathForComparison(undefined)).toBeNull();
    expect(normalizeWorkspacePathForComparison(null)).toBeNull();
    expect(normalizeWorkspacePathForComparison("   ")).toBeNull();
  });

  it("trims whitespace and trailing separators", () => {
    expect(normalizeWorkspacePathForComparison("  /repo/project///  ")).toBe("/repo/project");
  });

  it("normalizes windows separators, dot segments, and case-insensitive casing", () => {
    expect(normalizeWorkspacePathForComparison("C:\\Users\\Me\\Repo\\")).toBe("c:/users/me/repo");
    expect(normalizeWorkspacePathForComparison("C:\\Users\\Me\\Repo\\.\\src\\..\\")).toBe(
      "c:/users/me/repo",
    );
    expect(normalizeWorkspacePathForComparison("/repo/../../workspace")).toBe("/workspace");
    expect(normalizeWorkspacePathForComparison("C:\\repo\\..\\..\\workspace")).toBe("c:/workspace");
  });
});

describe("workspacePathsLikelyMatch", () => {
  it("matches paths that only differ by trailing separators", () => {
    expect(workspacePathsLikelyMatch("/repo/project", "/repo/project/")).toBe(true);
  });

  it("matches windows paths that only differ by slash style, casing, or dot segments", () => {
    expect(workspacePathsLikelyMatch("C:\\Users\\Me\\Repo", "c:/Users/Me/Repo/")).toBe(true);
    expect(workspacePathsLikelyMatch("C:\\Users\\Me\\Repo", "c:/users/me/repo/./src/..")).toBe(
      true,
    );
  });

  it("does not collapse genuinely different paths", () => {
    expect(workspacePathsLikelyMatch("/repo/project", "/repo/project-two")).toBe(false);
  });
});
