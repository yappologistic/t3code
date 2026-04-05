import { describe, expect, it } from "vitest";

import {
  getServerConnectionBannerDescription,
  getServerConnectionBannerTitle,
} from "./serverConnectionBannerCopy";

describe("getServerConnectionBannerTitle", () => {
  it("uses a desktop-specific connecting title in Electron", () => {
    expect(
      getServerConnectionBannerTitle({ retrying: false, isElectron: true, language: "en" }),
    ).toContain("Connecting to Rowl");
  });

  it("keeps the local server title in the browser", () => {
    expect(
      getServerConnectionBannerTitle({ retrying: false, isElectron: false, language: "en" }),
    ).toBe("Connecting to local server");
  });

  it("uses the shared retry title in all environments", () => {
    expect(
      getServerConnectionBannerTitle({ retrying: true, isElectron: true, language: "en" }),
    ).toBe("Connection lost");
  });

  it("returns Persian connection titles when Persian is selected", () => {
    expect(
      getServerConnectionBannerTitle({ retrying: false, isElectron: true, language: "fa" }),
    ).toContain("در حال اتصال");
    expect(
      getServerConnectionBannerTitle({ retrying: true, isElectron: false, language: "fa" }),
    ).toBe("اتصال قطع شد");
  });
});

describe("getServerConnectionBannerDescription", () => {
  it("uses desktop-specific retry guidance in Electron", () => {
    expect(
      getServerConnectionBannerDescription({ retrying: true, isElectron: true, language: "en" }),
    ).toContain("restart Rowl");
  });

  it("keeps dev-server retry guidance in the browser", () => {
    expect(
      getServerConnectionBannerDescription({ retrying: true, isElectron: false, language: "en" }),
    ).toContain("restart the local dev server");
  });

  it("uses desktop-specific startup wording in Electron", () => {
    expect(
      getServerConnectionBannerDescription({ retrying: false, isElectron: true, language: "en" }),
    ).toContain("bundled desktop service");
  });

  it("returns Persian connection descriptions when Persian is selected", () => {
    expect(
      getServerConnectionBannerDescription({ retrying: false, isElectron: false, language: "fa" }),
    ).toContain("سرور محلی");
  });
});
