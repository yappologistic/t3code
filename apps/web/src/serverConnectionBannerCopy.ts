import { APP_DISPLAY_NAME } from "./branding";

export function getServerConnectionBannerTitle(args: {
  retrying: boolean;
  isElectron: boolean;
}): string {
  if (args.retrying) {
    return "Connection lost";
  }

  return args.isElectron ? `Connecting to ${APP_DISPLAY_NAME}` : "Connecting to local server";
}

export function getServerConnectionBannerDescription(args: {
  retrying: boolean;
  isElectron: boolean;
}): string {
  if (args.retrying) {
    return args.isElectron
      ? "The app is retrying the websocket connection automatically. If this keeps happening, restart T3 Code."
      : "The app is retrying the websocket connection automatically. If this keeps happening, restart the local dev server.";
  }

  return args.isElectron
    ? "The app is waiting for the bundled desktop service before live data and actions become available."
    : "The app is waiting for the local server before live data and actions become available.";
}
