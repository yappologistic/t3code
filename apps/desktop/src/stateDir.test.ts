import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_DESKTOP_STATE_DIR, resolveDesktopStateDir } from "./stateDir";

describe("resolveDesktopStateDir", () => {
  it("returns env override when provided", () => {
    const resolved = resolveDesktopStateDir({
      T3CODE_STATE_DIR: "  /tmp/t3-dev-state  ",
    });

    expect(resolved).toBe("/tmp/t3-dev-state");
  });

  it("falls back to default userdata dir when override is missing", () => {
    const resolved = resolveDesktopStateDir({});

    expect(resolved).toBe(DEFAULT_DESKTOP_STATE_DIR);
    expect(resolved).toBe(path.join(os.homedir(), ".t3", "userdata"));
  });
});
