import { describe, expect, it } from "vitest";

import {
  buildRecentModelSelection,
  normalizeModelPreferenceSlugs,
  prioritizeModelOptions,
} from "./modelPreferences";

describe("normalizeModelPreferenceSlugs", () => {
  it("normalizes and deduplicates provider model references", () => {
    expect(
      normalizeModelPreferenceSlugs([" gpt-5.4 ", "5.4", "custom/model", "custom/model"], "codex"),
    ).toEqual(["gpt-5.4", "custom/model"]);
  });
});

describe("buildRecentModelSelection", () => {
  it("moves the newest model to the front and keeps the list bounded", () => {
    expect(buildRecentModelSelection(["gpt-5.3-codex", "gpt-5.4"], "codex", "gpt-5.4", 2)).toEqual([
      "gpt-5.4",
      "gpt-5.3-codex",
    ]);
  });
});

describe("prioritizeModelOptions", () => {
  it("sorts favorites first, then recents, then preserves the rest", () => {
    const ordered = prioritizeModelOptions(
      [{ slug: "gpt-5.4" }, { slug: "gpt-5.3-codex" }, { slug: "gpt-5.2" }],
      ["gpt-5.3-codex"],
      ["gpt-5.4"],
    );

    expect(ordered.map((option) => option.slug)).toEqual(["gpt-5.3-codex", "gpt-5.4", "gpt-5.2"]);
  });
});
