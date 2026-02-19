import electronmon from "electronmon";
import waitOn from "wait-on";

import { desktopDir, resolveElectronPath } from "./electron-launcher.mjs";

const port = Number(process.env.ELECTRON_RENDERER_PORT ?? 5173);
const devServerUrl = `http://localhost:${port}`;

await waitOn({
  resources: [
    `tcp:${port}`,
    "file:dist-electron/main.js",
    "file:dist-electron/preload.js",
    "file:../server/dist/index.mjs",
  ],
});

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

await electronmon({
  cwd: desktopDir,
  args: ["dist-electron/main.js"],
  env: {
    ...childEnv,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
  electronPath: resolveElectronPath(),
});
