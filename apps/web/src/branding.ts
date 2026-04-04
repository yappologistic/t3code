import { resolveAppReleaseBranding } from "@t3tools/shared/appRelease";

export const APP_BASE_NAME = "Rowl";
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
const appReleaseBranding = resolveAppReleaseBranding({
  version: APP_VERSION,
  isDevelopment: import.meta.env.DEV,
});
export const APP_STAGE_LABEL = appReleaseBranding.stageLabel;
export const APP_DISPLAY_NAME = appReleaseBranding.displayName;
