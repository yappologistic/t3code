import type { DesktopUpdateState } from "@t3tools/contracts";
import { getVersionPrereleaseTag } from "@t3tools/shared/appRelease";

const DEFAULT_DESKTOP_UPDATE_CHANNEL = "latest";

export function shouldBroadcastDownloadProgress(
  currentState: DesktopUpdateState,
  nextPercent: number,
): boolean {
  if (currentState.status !== "downloading") {
    return true;
  }

  const currentPercent = currentState.downloadPercent;
  if (currentPercent === null) {
    return true;
  }

  const previousStep = Math.floor(currentPercent / 10);
  const nextStep = Math.floor(nextPercent / 10);
  return nextStep !== previousStep || nextPercent === 100;
}

export function nextStatusAfterDownloadFailure(
  currentState: DesktopUpdateState,
): DesktopUpdateState["status"] {
  return currentState.availableVersion ? "available" : "error";
}

export function getCanRetryAfterDownloadFailure(currentState: DesktopUpdateState): boolean {
  return currentState.availableVersion !== null;
}

export function getAutoUpdateDisabledReason(args: {
  isDevelopment: boolean;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  appImage?: string | undefined;
  disabledByEnv: boolean;
}): string | null {
  if (args.isDevelopment || !args.isPackaged) {
    return "Automatic updates are only available in packaged production builds.";
  }
  if (args.disabledByEnv) {
    return "Automatic updates are disabled by the ROWL_DISABLE_AUTO_UPDATE setting.";
  }
  if (args.platform === "linux" && !args.appImage) {
    return "Automatic updates on Linux require running the AppImage build.";
  }
  return null;
}

export function getVersionPrereleaseChannel(version: string): string | null {
  return getVersionPrereleaseTag(version);
}

export function resolveAutoUpdaterTrack(version: string): {
  channel: string;
  allowPrerelease: boolean;
} {
  const prereleaseChannel = getVersionPrereleaseChannel(version);
  if (prereleaseChannel === null) {
    return {
      channel: DEFAULT_DESKTOP_UPDATE_CHANNEL,
      allowPrerelease: false,
    };
  }

  return {
    channel: prereleaseChannel,
    allowPrerelease: true,
  };
}
