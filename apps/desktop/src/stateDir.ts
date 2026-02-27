import os from "node:os";
import path from "node:path";

export const DEFAULT_DESKTOP_STATE_DIR = path.join(os.homedir(), ".t3", "userdata");

export function resolveDesktopStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.T3CODE_STATE_DIR?.trim();
  if (value) {
    return value;
  }
  return DEFAULT_DESKTOP_STATE_DIR;
}
