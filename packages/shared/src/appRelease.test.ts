import { describe, expect, it } from "vitest";

import {
  getVersionPrereleaseTag,
  isForkPrereleaseVersion,
  isPrereleaseVersion,
  resolveAppReleaseBranding,
} from "./appRelease";

describe("getVersionPrereleaseTag", () => {
  it("returns null for stable versions", () => {
    expect(getVersionPrereleaseTag("1.2.3")).toBeNull();
  });

  it("returns the prerelease tag for tagged builds", () => {
    expect(getVersionPrereleaseTag("0.0.11-alpha.3")).toBe("alpha");
  });
});

describe("isPrereleaseVersion", () => {
  it("returns true for tagged prerelease versions", () => {
    expect(isPrereleaseVersion("0.0.11-alpha.3")).toBe(true);
  });

  it("returns false for stable versions", () => {
    expect(isPrereleaseVersion("1.2.3")).toBe(false);
  });
});

describe("isForkPrereleaseVersion", () => {
  it("returns true for fork prerelease versions", () => {
    expect(isForkPrereleaseVersion("0.0.11-fork.3")).toBe(true);
  });

  it("returns false for non-fork prerelease versions", () => {
    expect(isForkPrereleaseVersion("0.0.11-alpha.1")).toBe(false);
  });
});

describe("resolveAppReleaseBranding", () => {
  it("keeps local dev-server sessions on unified Rowl branding", () => {
    expect(resolveAppReleaseBranding({ version: "1.2.3", isDevelopment: true })).toEqual({
      stageLabel: "Rowl",
      displayName: "Rowl",
      productName: "Rowl",
      appId: "com.t3tools.rowl",
      stateDirName: "rowl",
      userDataDirName: "rowl",
    });
  });

  it("keeps prerelease packages on unified Rowl branding", () => {
    expect(resolveAppReleaseBranding({ version: "0.0.11-alpha.3", isDevelopment: false })).toEqual({
      stageLabel: "Rowl",
      displayName: "Rowl",
      productName: "Rowl",
      appId: "com.t3tools.rowl",
      stateDirName: "rowl",
      userDataDirName: "rowl",
    });
  });

  it("keeps fork prerelease packages on unified Rowl branding", () => {
    expect(resolveAppReleaseBranding({ version: "0.0.11-fork.3", isDevelopment: false })).toEqual({
      stageLabel: "Rowl",
      displayName: "Rowl",
      productName: "Rowl",
      appId: "com.t3tools.rowl",
      stateDirName: "rowl",
      userDataDirName: "rowl",
    });
  });

  it("keeps stable packaged builds on unified Rowl branding", () => {
    expect(resolveAppReleaseBranding({ version: "1.2.3", isDevelopment: false })).toEqual({
      stageLabel: "Rowl",
      displayName: "Rowl",
      productName: "Rowl",
      appId: "com.t3tools.rowl",
      stateDirName: "rowl",
      userDataDirName: "rowl",
    });
  });
});
