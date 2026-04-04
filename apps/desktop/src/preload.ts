import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@t3tools/contracts";
import { resolveInitialDesktopWsUrl } from "./preloadWsUrl";

const PICK_FOLDER_CHANNEL = "desktop:pick-folder";
const CONFIRM_CHANNEL = "desktop:confirm";
const SET_THEME_CHANNEL = "desktop:set-theme";
const CONTEXT_MENU_CHANNEL = "desktop:context-menu";
const OPEN_EXTERNAL_CHANNEL = "desktop:open-external";
const SECRET_GET_CHANNEL = "desktop:secret-get";
const SECRET_SET_CHANNEL = "desktop:secret-set";
const MENU_ACTION_CHANNEL = "desktop:menu-action";
const BACKEND_WS_URL_UPDATED_CHANNEL = "desktop:backend-ws-url-updated";
const UPDATE_STATE_CHANNEL = "desktop:update-state";
const UPDATE_GET_STATE_CHANNEL = "desktop:update-get-state";
const UPDATE_DOWNLOAD_CHANNEL = "desktop:update-download";
const UPDATE_INSTALL_CHANNEL = "desktop:update-install";
let wsUrl = process.env.ROWL_DESKTOP_WS_URL ?? null;
wsUrl = resolveInitialDesktopWsUrl({ envValue: wsUrl, argv: process.argv });

ipcRenderer.on(BACKEND_WS_URL_UPDATED_CHANNEL, (_event, nextUrl: unknown) => {
  wsUrl = typeof nextUrl === "string" && nextUrl.length > 0 ? nextUrl : null;
});

contextBridge.exposeInMainWorld("desktopBridge", {
  getWsUrl: () => wsUrl,
  onBackendWsUrlUpdated: (listener) => {
    listener(wsUrl);

    const wrappedListener = (_event: Electron.IpcRendererEvent, nextUrl: unknown) => {
      listener(typeof nextUrl === "string" && nextUrl.length > 0 ? nextUrl : null);
    };

    ipcRenderer.on(BACKEND_WS_URL_UPDATED_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(BACKEND_WS_URL_UPDATED_CHANNEL, wrappedListener);
    };
  },
  getSecret: (key) => ipcRenderer.invoke(SECRET_GET_CHANNEL, key),
  setSecret: (key, value) => ipcRenderer.invoke(SECRET_SET_CHANNEL, key, value),
  pickFolder: () => ipcRenderer.invoke(PICK_FOLDER_CHANNEL),
  confirm: (message) => ipcRenderer.invoke(CONFIRM_CHANNEL, message),
  setTheme: (theme) => ipcRenderer.invoke(SET_THEME_CHANNEL, theme),
  showContextMenu: (items, position) => ipcRenderer.invoke(CONTEXT_MENU_CHANNEL, items, position),
  openExternal: (url: string) => ipcRenderer.invoke(OPEN_EXTERNAL_CHANNEL, url),
  onMenuAction: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action !== "string") return;
      listener(action);
    };

    ipcRenderer.on(MENU_ACTION_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(MENU_ACTION_CHANNEL, wrappedListener);
    };
  },
  getUpdateState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) return;
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(UPDATE_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, wrappedListener);
    };
  },
} satisfies DesktopBridge);
