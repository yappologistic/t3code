import { spawn } from "node:child_process";

import {
  desktopDir,
  resolveElectronPath,
  resolveLinuxDesktopLaunchEnv,
} from "./electron-launcher.mjs";

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

const electronPath = resolveElectronPath();
const linuxDesktopLaunchEnv = resolveLinuxDesktopLaunchEnv({
  electronBinaryPath: electronPath,
  mainEntryPath: "dist-electron/main.js",
});

const child = spawn(electronPath, ["dist-electron/main.js"], {
  stdio: "inherit",
  cwd: desktopDir,
  env: {
    ...childEnv,
    ...linuxDesktopLaunchEnv,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
