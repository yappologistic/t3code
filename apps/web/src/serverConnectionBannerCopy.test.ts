import { describe, expect, it } from "vitest";

import {
  getServerConnectionBannerDescription,
  getServerConnectionBannerTitle,
} from "./serverConnectionBannerCopy";

describe("getServerConnectionBannerTitle", () => {
  it("uses a desktop-specific connecting title in Electron", () => {
    expect(getServerConnectionBannerTitle({ retrying: false, isElectron: true })).toContain(
      "Connecting to T3 Code",
    );
  });

  it("keeps the local server title in the browser", () => {
    expect(getServerConnectionBannerTitle({ retrying: false, isElectron: false })).toBe(
      "Connecting to local server",
    );
  });

  it("uses the shared retry title in all environments", () => {
    expect(getServerConnectionBannerTitle({ retrying: true, isElectron: true })).toBe(
      "Connection lost",
    );
  });
});

describe("getServerConnectionBannerDescription", () => {
  it("uses desktop-specific retry guidance in Electron", () => {
    expect(getServerConnectionBannerDescription({ retrying: true, isElectron: true })).toContain(
      "restart T3 Code",
    );
  });

  it("keeps dev-server retry guidance in the browser", () => {
    expect(getServerConnectionBannerDescription({ retrying: true, isElectron: false })).toContain(
      "restart the local dev server",
    );
  });

  it("uses desktop-specific startup wording in Electron", () => {
    expect(getServerConnectionBannerDescription({ retrying: false, isElectron: true })).toContain(
      "bundled desktop service",
    );
  });
});
