import { describe, expect, it } from "vitest";
import type { DesktopUpdateState } from "@t3tools/contracts";

import {
  getCanRetryAfterDownloadFailure,
  getAutoUpdateDisabledReason,
  getVersionPrereleaseChannel,
  nextStatusAfterDownloadFailure,
  resolveAutoUpdaterTrack,
  shouldBroadcastDownloadProgress,
} from "./updateState";

const baseState: DesktopUpdateState = {
  enabled: true,
  status: "idle",
  currentVersion: "1.0.0",
  hostArch: "x64",
  appArch: "x64",
  runningUnderArm64Translation: false,
  availableVersion: null,
  downloadedVersion: null,
  downloadPercent: null,
  checkedAt: null,
  message: null,
  errorContext: null,
  canRetry: false,
};

describe("shouldBroadcastDownloadProgress", () => {
  it("broadcasts the first downloading progress update", () => {
    expect(
      shouldBroadcastDownloadProgress(
        { ...baseState, status: "downloading", downloadPercent: null },
        1,
      ),
    ).toBe(true);
  });

  it("skips progress updates within the same 10% bucket", () => {
    expect(
      shouldBroadcastDownloadProgress(
        { ...baseState, status: "downloading", downloadPercent: 11.2 },
        18.7,
      ),
    ).toBe(false);
  });

  it("broadcasts progress updates when a new 10% bucket is reached", () => {
    expect(
      shouldBroadcastDownloadProgress(
        { ...baseState, status: "downloading", downloadPercent: 19.9 },
        20.1,
      ),
    ).toBe(true);
  });

  it("broadcasts progress updates when a retry resets the download percentage", () => {
    expect(
      shouldBroadcastDownloadProgress(
        { ...baseState, status: "downloading", downloadPercent: 50.4 },
        0.2,
      ),
    ).toBe(true);
  });
});

describe("getAutoUpdateDisabledReason", () => {
  it("reports development builds as disabled", () => {
    expect(
      getAutoUpdateDisabledReason({
        isDevelopment: true,
        isPackaged: false,
        platform: "darwin",
        appImage: undefined,
        disabledByEnv: false,
      }),
    ).toContain("packaged production builds");
  });

  it("reports env-disabled auto updates", () => {
    expect(
      getAutoUpdateDisabledReason({
        isDevelopment: false,
        isPackaged: true,
        platform: "darwin",
        appImage: undefined,
        disabledByEnv: true,
      }),
    ).toContain("ROWL_DISABLE_AUTO_UPDATE");
  });

  it("reports linux non-AppImage builds as disabled", () => {
    expect(
      getAutoUpdateDisabledReason({
        isDevelopment: false,
        isPackaged: true,
        platform: "linux",
        appImage: undefined,
        disabledByEnv: false,
      }),
    ).toContain("AppImage");
  });
});

describe("nextStatusAfterDownloadFailure", () => {
  it("returns available when an update version is still known", () => {
    expect(
      nextStatusAfterDownloadFailure({
        ...baseState,
        status: "downloading",
        availableVersion: "1.1.0",
      }),
    ).toBe("available");
  });

  it("returns error when no update version can be retried", () => {
    expect(
      nextStatusAfterDownloadFailure({
        ...baseState,
        status: "downloading",
        availableVersion: null,
      }),
    ).toBe("error");
  });
});

describe("getVersionPrereleaseChannel", () => {
  it("returns null for stable versions", () => {
    expect(getVersionPrereleaseChannel("1.2.3")).toBeNull();
  });

  it("returns the prerelease label for tagged builds", () => {
    expect(getVersionPrereleaseChannel("0.0.11-fork.2")).toBe("fork");
  });

  it("ignores numeric-only prerelease identifiers", () => {
    expect(getVersionPrereleaseChannel("1.2.3-1.2")).toBeNull();
  });
});

describe("resolveAutoUpdaterTrack", () => {
  it("keeps stable builds on the latest channel", () => {
    expect(resolveAutoUpdaterTrack("1.2.3")).toEqual({
      channel: "latest",
      allowPrerelease: false,
    });
  });

  it("enables prerelease checks on the current prerelease channel", () => {
    expect(resolveAutoUpdaterTrack("0.0.11-fork.2")).toEqual({
      channel: "fork",
      allowPrerelease: true,
    });
  });
});

describe("getCanRetryAfterDownloadFailure", () => {
  it("returns true when an available version is still present", () => {
    expect(
      getCanRetryAfterDownloadFailure({
        ...baseState,
        status: "downloading",
        availableVersion: "1.1.0",
      }),
    ).toBe(true);
  });

  it("returns false when no version is available to retry", () => {
    expect(
      getCanRetryAfterDownloadFailure({
        ...baseState,
        status: "downloading",
        availableVersion: null,
      }),
    ).toBe(false);
  });
});
