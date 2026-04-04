import * as ChildProcess from "node:child_process";
import * as Crypto from "node:crypto";
import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  protocol,
  safeStorage,
  shell,
} from "electron";
import type { MenuItemConstructorOptions } from "electron";
import type {
  DesktopSecretKey,
  DesktopTheme,
  DesktopUpdateActionResult,
  DesktopUpdateState,
} from "@t3tools/contracts";
import { autoUpdater } from "electron-updater";

import type { ContextMenuItem } from "@t3tools/contracts";
import { resolveAppReleaseBranding } from "@t3tools/shared/appRelease";
import {
  createDesktopBackendWsUrl,
  parseDesktopBackendReadyLine,
} from "@t3tools/shared/desktopBackend";
import { RotatingFileSink } from "@t3tools/shared/logging";
import { showDesktopConfirmDialog } from "./confirmDialog";
import { fixPath } from "./fixPath";
import {
  getAutoUpdateDisabledReason,
  resolveAutoUpdaterTrack,
  shouldBroadcastDownloadProgress,
} from "./updateState";
import { getLegacyUserDataDirNames, resolveDesktopUserDataPath } from "./userDataPath";
import { normalizeDesktopSecretValue, shouldPersistDesktopSecrets } from "./secretStorage";
import {
  createInitialDesktopUpdateState,
  reduceDesktopUpdateStateOnCheckFailure,
  reduceDesktopUpdateStateOnCheckStart,
  reduceDesktopUpdateStateOnDownloadComplete,
  reduceDesktopUpdateStateOnDownloadFailure,
  reduceDesktopUpdateStateOnDownloadProgress,
  reduceDesktopUpdateStateOnDownloadStart,
  reduceDesktopUpdateStateOnInstallFailure,
  reduceDesktopUpdateStateOnNoUpdate,
  reduceDesktopUpdateStateOnUpdateAvailable,
} from "./updateMachine";
import { isArm64HostRunningIntelBuild, resolveDesktopRuntimeInfo } from "./runtimeArch";

fixPath();

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
const DESKTOP_SCHEME = "rowl";
const ROOT_DIR = Path.resolve(__dirname, "../../..");
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const appReleaseBranding = resolveAppReleaseBranding({
  version: app.getVersion(),
  isDevelopment,
});
const STATE_DIR =
  process.env.ROWL_STATE_DIR?.trim() ||
  Path.join(OS.homedir(), ".t3", appReleaseBranding.stateDirName);
const APP_DISPLAY_NAME = appReleaseBranding.displayName;
const APP_USER_MODEL_ID = appReleaseBranding.appId;
const USER_DATA_DIR_NAME = appReleaseBranding.userDataDirName;
const LEGACY_USER_DATA_DIR_NAMES = getLegacyUserDataDirNames({
  appDisplayName: APP_DISPLAY_NAME,
});
const COMMIT_HASH_PATTERN = /^[0-9a-f]{7,40}$/i;
const COMMIT_HASH_DISPLAY_LENGTH = 12;
const LOG_DIR = Path.join(STATE_DIR, "logs");
const SECRET_SETTINGS_PATH = Path.join(STATE_DIR, "secret-settings.json");
const LOG_FILE_MAX_BYTES = 10 * 1024 * 1024;
const LOG_FILE_MAX_FILES = 10;
const APP_RUN_ID = Crypto.randomBytes(6).toString("hex");
const AUTO_UPDATE_STARTUP_DELAY_MS = 15_000;
const AUTO_UPDATE_POLL_INTERVAL_MS = 4 * 60 * 60 * 1000;
const BACKEND_READY_TIMEOUT_MS = 15_000;

type DesktopUpdateErrorContext = DesktopUpdateState["errorContext"];

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess.ChildProcess | null = null;
let backendPort = 0;
let backendAuthToken = "";
let backendWsUrl = "";
let backendStartupPromise: Promise<void> | null = null;
const sessionSecretSettings = new Map<DesktopSecretKey, string>();
let hasLoggedInsecureSecretStorage = false;
let restartAttempt = 0;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let isQuitting = false;
let desktopProtocolRegistered = false;
let aboutCommitHashCache: string | null | undefined;
let desktopLogSink: RotatingFileSink | null = null;
let backendLogSink: RotatingFileSink | null = null;
let restoreStdIoCapture: (() => void) | null = null;

let destructiveMenuIconCache: Electron.NativeImage | null | undefined;
let windowIconCache: Electron.NativeImage | null | undefined;
const desktopRuntimeInfo = resolveDesktopRuntimeInfo({
  platform: process.platform,
  processArch: process.arch,
  runningUnderArm64Translation: app.runningUnderARM64Translation === true,
});
const initialUpdateState = (): DesktopUpdateState =>
  createInitialDesktopUpdateState(app.getVersion(), desktopRuntimeInfo);

function logTimestamp(): string {
  return new Date().toISOString();
}

function logScope(scope: string): string {
  return `${scope} run=${APP_RUN_ID}`;
}

function sanitizeLogValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function writeDesktopLogHeader(message: string): void {
  const line = `[${logTimestamp()}] [${logScope("desktop")}] ${message}`;
  if (!app.isPackaged) {
    process.stdout.write(`${line}\n`);
  }
  if (!desktopLogSink) return;
  desktopLogSink.write(`${line}\n`);
}

function writeBackendSessionBoundary(phase: "START" | "END", details: string): void {
  if (!backendLogSink) return;
  const normalizedDetails = sanitizeLogValue(details);
  backendLogSink.write(
    `[${logTimestamp()}] ---- APP SESSION ${phase} run=${APP_RUN_ID} ${normalizedDetails} ----\n`,
  );
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getSafeExternalUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return null;
  }

  return parsedUrl.toString();
}

function getSafeTheme(rawTheme: unknown): DesktopTheme | null {
  if (rawTheme === "light" || rawTheme === "dark" || rawTheme === "system") {
    return rawTheme;
  }

  return null;
}

function getSafeDesktopSecretKey(rawKey: unknown): DesktopSecretKey | null {
  return rawKey === "openRouterApiKey" || rawKey === "kimiApiKey" ? rawKey : null;
}

function readStoredDesktopSecrets(): Partial<Record<DesktopSecretKey, { encrypted: string }>> {
  if (!FS.existsSync(SECRET_SETTINGS_PATH)) {
    return {};
  }

  try {
    const raw = FS.readFileSync(SECRET_SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, { encrypted?: unknown }>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const result: Partial<Record<DesktopSecretKey, { encrypted: string }>> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key !== "openRouterApiKey" && key !== "kimiApiKey") {
        continue;
      }
      if (!value || typeof value !== "object" || typeof value.encrypted !== "string") {
        continue;
      }
      result[key] = { encrypted: value.encrypted };
    }
    return result;
  } catch {
    return {};
  }
}

function writeStoredDesktopSecrets(
  value: Partial<Record<DesktopSecretKey, { encrypted: string }>>,
): void {
  if (Object.keys(value).length === 0) {
    try {
      FS.rmSync(SECRET_SETTINGS_PATH, { force: true });
    } catch {
      // Ignore cleanup failures.
    }
    return;
  }

  FS.mkdirSync(Path.dirname(SECRET_SETTINGS_PATH), { recursive: true });
  FS.writeFileSync(SECRET_SETTINGS_PATH, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function shouldPersistDesktopSecretsSecurely(): boolean {
  return shouldPersistDesktopSecrets({
    platform: process.platform,
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    selectedStorageBackend:
      process.platform === "linux" && typeof safeStorage.getSelectedStorageBackend === "function"
        ? safeStorage.getSelectedStorageBackend()
        : null,
  });
}

function readDesktopSecret(key: DesktopSecretKey): string | null {
  const sessionValue = sessionSecretSettings.get(key);
  if (sessionValue !== undefined) {
    return sessionValue;
  }

  const storedValue = readStoredDesktopSecrets()[key];
  if (!storedValue || !safeStorage.isEncryptionAvailable()) {
    return null;
  }

  try {
    const decryptedValue = normalizeDesktopSecretValue(
      safeStorage.decryptString(Buffer.from(storedValue.encrypted, "base64")),
    );
    if (decryptedValue !== null) {
      sessionSecretSettings.set(key, decryptedValue);
    }
    return decryptedValue;
  } catch (error) {
    console.warn(`[desktop] Failed to read stored secret '${key}'`, error);
    return null;
  }
}

function writeDesktopSecret(key: DesktopSecretKey, rawValue: unknown): void {
  const value = normalizeDesktopSecretValue(rawValue);
  const storedSecrets = readStoredDesktopSecrets();

  if (value === null) {
    sessionSecretSettings.delete(key);
    if (storedSecrets[key]) {
      delete storedSecrets[key];
      writeStoredDesktopSecrets(storedSecrets);
    }
    return;
  }

  sessionSecretSettings.set(key, value);

  if (!shouldPersistDesktopSecretsSecurely()) {
    if (!hasLoggedInsecureSecretStorage) {
      hasLoggedInsecureSecretStorage = true;
      console.warn(
        "[desktop] secure secret storage unavailable; keeping secrets in memory for this app session only",
      );
    }
    if (storedSecrets[key]) {
      delete storedSecrets[key];
      writeStoredDesktopSecrets(storedSecrets);
    }
    return;
  }

  try {
    storedSecrets[key] = {
      encrypted: safeStorage.encryptString(value).toString("base64"),
    };
    writeStoredDesktopSecrets(storedSecrets);
  } catch (error) {
    console.error(`[desktop] Failed to persist secret '${key}'`, error);
  }
}

function writeDesktopStreamChunk(
  streamName: "stdout" | "stderr",
  chunk: unknown,
  encoding: BufferEncoding | undefined,
): void {
  if (!desktopLogSink) return;
  const buffer = Buffer.isBuffer(chunk)
    ? chunk
    : Buffer.from(String(chunk), typeof chunk === "string" ? encoding : undefined);
  desktopLogSink.write(`[${logTimestamp()}] [${logScope(streamName)}] `);
  desktopLogSink.write(buffer);
  if (buffer.length === 0 || buffer[buffer.length - 1] !== 0x0a) {
    desktopLogSink.write("\n");
  }
}

function installStdIoCapture(): void {
  if (!app.isPackaged || desktopLogSink === null || restoreStdIoCapture !== null) {
    return;
  }

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  const patchWrite =
    (streamName: "stdout" | "stderr", originalWrite: typeof process.stdout.write) =>
    (
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ): boolean => {
      const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
      writeDesktopStreamChunk(streamName, chunk, encoding);
      if (typeof encodingOrCallback === "function") {
        return originalWrite(chunk, encodingOrCallback);
      }
      if (callback !== undefined) {
        return originalWrite(chunk, encoding, callback);
      }
      if (encoding !== undefined) {
        return originalWrite(chunk, encoding);
      }
      return originalWrite(chunk);
    };

  process.stdout.write = patchWrite("stdout", originalStdoutWrite);
  process.stderr.write = patchWrite("stderr", originalStderrWrite);

  restoreStdIoCapture = () => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    restoreStdIoCapture = null;
  };
}

function initializePackagedLogging(): void {
  if (!app.isPackaged) return;
  try {
    desktopLogSink = new RotatingFileSink({
      filePath: Path.join(LOG_DIR, "desktop-main.log"),
      maxBytes: LOG_FILE_MAX_BYTES,
      maxFiles: LOG_FILE_MAX_FILES,
    });
    backendLogSink = new RotatingFileSink({
      filePath: Path.join(LOG_DIR, "server-child.log"),
      maxBytes: LOG_FILE_MAX_BYTES,
      maxFiles: LOG_FILE_MAX_FILES,
    });
    installStdIoCapture();
    writeDesktopLogHeader(`runtime log capture enabled logDir=${LOG_DIR}`);
  } catch (error) {
    // Logging setup should never block app startup.
    console.error("[desktop] failed to initialize packaged logging", error);
  }
}

function writeBackendStreamChunk(
  streamName: "stdout" | "stderr",
  chunk: unknown,
  encoding: BufferEncoding | undefined,
): Buffer {
  const buffer = Buffer.isBuffer(chunk)
    ? chunk
    : Buffer.from(String(chunk), typeof chunk === "string" ? encoding : undefined);
  if (backendLogSink) {
    backendLogSink.write(buffer);
  }
  if (!app.isPackaged) {
    if (streamName === "stdout") {
      process.stdout.write(buffer);
    } else {
      process.stderr.write(buffer);
    }
  }
  return buffer;
}

function attachBackendOutput(
  child: ChildProcess.ChildProcess,
  options?: { readonly onStdoutLine?: (line: string) => void },
): void {
  let stdoutBuffer = "";
  const handleStdoutChunk = (chunk: unknown) => {
    const buffer = writeBackendStreamChunk("stdout", chunk, undefined);
    if (!options?.onStdoutLine) {
      return;
    }
    stdoutBuffer += buffer.toString("utf8");
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      options.onStdoutLine(line);
    }
  };
  child.stdout?.on("data", handleStdoutChunk);
  child.stderr?.on("data", (chunk) => {
    writeBackendStreamChunk("stderr", chunk, undefined);
  });
}

initializePackagedLogging();

function getDestructiveMenuIcon(): Electron.NativeImage | undefined {
  if (process.platform !== "darwin") return undefined;
  if (destructiveMenuIconCache !== undefined) {
    return destructiveMenuIconCache ?? undefined;
  }
  try {
    const icon = nativeImage.createFromNamedImage("trash").resize({
      width: 14,
      height: 14,
    });
    if (icon.isEmpty()) {
      destructiveMenuIconCache = null;
      return undefined;
    }
    icon.setTemplateImage(true);
    destructiveMenuIconCache = icon;
    return icon;
  } catch {
    destructiveMenuIconCache = null;
    return undefined;
  }
}
let updatePollTimer: ReturnType<typeof setInterval> | null = null;
let updateStartupTimer: ReturnType<typeof setTimeout> | null = null;
let updateCheckInFlight = false;
let updateDownloadInFlight = false;
let updaterConfigured = false;
let updateState: DesktopUpdateState = initialUpdateState();
const hasSingleInstanceLock = app.requestSingleInstanceLock();

function resolveUpdaterErrorContext(): DesktopUpdateErrorContext {
  if (updateDownloadInFlight) return "download";
  if (updateCheckInFlight) return "check";
  return updateState.errorContext;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: DESKTOP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function resolveAppRoot(): string {
  if (!app.isPackaged) {
    return ROOT_DIR;
  }
  return app.getAppPath();
}

/** Read the baked-in app-update.yml config (if applicable). */
function readAppUpdateYml(): Record<string, string> | null {
  try {
    // electron-updater reads from process.resourcesPath in packaged builds,
    // or dev-app-update.yml via app.getAppPath() in dev.
    const ymlPath = app.isPackaged
      ? Path.join(process.resourcesPath, "app-update.yml")
      : Path.join(app.getAppPath(), "dev-app-update.yml");
    const raw = FS.readFileSync(ymlPath, "utf-8");
    // The YAML is simple key-value pairs — avoid pulling in a YAML parser by
    // doing a line-based parse (fields: provider, owner, repo, releaseType, …).
    const entries: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match?.[1] && match[2]) entries[match[1]] = match[2].trim();
    }
    return entries.provider ? entries : null;
  } catch {
    return null;
  }
}

function normalizeCommitHash(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!COMMIT_HASH_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed.slice(0, COMMIT_HASH_DISPLAY_LENGTH).toLowerCase();
}

function resolveEmbeddedCommitHash(): string | null {
  const packageJsonPath = Path.join(resolveAppRoot(), "package.json");
  if (!FS.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const raw = FS.readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { rowlCommitHash?: unknown };
    return normalizeCommitHash(parsed.rowlCommitHash);
  } catch {
    return null;
  }
}

function resolveAboutCommitHash(): string | null {
  if (aboutCommitHashCache !== undefined) {
    return aboutCommitHashCache;
  }

  const envCommitHash = normalizeCommitHash(process.env.ROWL_COMMIT_HASH);
  if (envCommitHash) {
    aboutCommitHashCache = envCommitHash;
    return aboutCommitHashCache;
  }

  // Only packaged builds are required to expose commit metadata.
  if (!app.isPackaged) {
    aboutCommitHashCache = null;
    return aboutCommitHashCache;
  }

  aboutCommitHashCache = resolveEmbeddedCommitHash();

  return aboutCommitHashCache;
}

function resolveBackendEntry(): string {
  return Path.join(resolveAppRoot(), "apps/server/dist/index.mjs");
}

function resolveBackendCwd(): string {
  const override = process.env.ROWL_BACKEND_CWD?.trim();
  if (override) {
    return override;
  }
  if (!app.isPackaged) {
    return resolveAppRoot();
  }
  return OS.homedir();
}

function resolveDesktopStaticDir(): string | null {
  const appRoot = resolveAppRoot();
  const candidates = [
    Path.join(appRoot, "apps/server/dist/client"),
    Path.join(appRoot, "apps/web/dist"),
  ];

  for (const candidate of candidates) {
    if (FS.existsSync(Path.join(candidate, "index.html"))) {
      return candidate;
    }
  }

  return null;
}

function resolveDesktopStaticPath(staticRoot: string, requestUrl: string): string {
  const url = new URL(requestUrl);
  const rawPath = decodeURIComponent(url.pathname);
  const normalizedPath = Path.posix.normalize(rawPath).replace(/^\/+/, "");
  if (normalizedPath.includes("..")) {
    return Path.join(staticRoot, "index.html");
  }

  const requestedPath = normalizedPath.length > 0 ? normalizedPath : "index.html";
  const resolvedPath = Path.join(staticRoot, requestedPath);

  if (Path.extname(resolvedPath)) {
    return resolvedPath;
  }

  const nestedIndex = Path.join(resolvedPath, "index.html");
  if (FS.existsSync(nestedIndex)) {
    return nestedIndex;
  }

  return Path.join(staticRoot, "index.html");
}

function isStaticAssetRequest(requestUrl: string): boolean {
  try {
    const url = new URL(requestUrl);
    return Path.extname(url.pathname).length > 0;
  } catch {
    return false;
  }
}

function handleFatalStartupError(stage: string, error: unknown): void {
  const message = formatErrorMessage(error);
  const detail =
    error instanceof Error && typeof error.stack === "string" ? `\n${error.stack}` : "";
  writeDesktopLogHeader(`fatal startup error stage=${stage} message=${message}`);
  console.error(`[desktop] fatal startup error (${stage})`, error);
  if (!isQuitting) {
    isQuitting = true;
    dialog.showErrorBox("Rowl failed to start", `Stage: ${stage}\n${message}${detail}`);
  }
  stopBackend();
  restoreStdIoCapture?.();
  app.quit();
}

function broadcastBackendWsUrl(): void {
  if (!backendWsUrl) return;
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(BACKEND_WS_URL_UPDATED_CHANNEL, backendWsUrl);
  }
}

function updateBackendWsUrl(port: number): void {
  backendPort = port;
  backendWsUrl = createDesktopBackendWsUrl({
    port,
    authToken: backendAuthToken,
  });
  process.env.ROWL_DESKTOP_WS_URL = backendWsUrl;
  writeDesktopLogHeader(`backend websocket url updated port=${port}`);
  broadcastBackendWsUrl();
}

function focusOrRestoreMainWindow(): void {
  const targetWindow =
    mainWindow ??
    BrowserWindow.getAllWindows()[0] ??
    (app.isReady() && backendWsUrl ? createWindow() : null);
  if (!targetWindow) {
    return;
  }
  if (targetWindow.isMinimized()) {
    targetWindow.restore();
  }
  if (!targetWindow.isVisible()) {
    targetWindow.show();
  }
  targetWindow.focus();
}

function registerDesktopProtocol(): void {
  if (isDevelopment || desktopProtocolRegistered) return;

  const staticRoot = resolveDesktopStaticDir();
  if (!staticRoot) {
    throw new Error(
      "Desktop static bundle missing. Build apps/server (with bundled client) first.",
    );
  }

  const staticRootResolved = Path.resolve(staticRoot);
  const staticRootPrefix = `${staticRootResolved}${Path.sep}`;
  const fallbackIndex = Path.join(staticRootResolved, "index.html");

  protocol.registerFileProtocol(DESKTOP_SCHEME, (request, callback) => {
    try {
      const candidate = resolveDesktopStaticPath(staticRootResolved, request.url);
      const resolvedCandidate = Path.resolve(candidate);
      const isInRoot =
        resolvedCandidate === fallbackIndex || resolvedCandidate.startsWith(staticRootPrefix);
      const isAssetRequest = isStaticAssetRequest(request.url);

      if (!isInRoot || !FS.existsSync(resolvedCandidate)) {
        if (isAssetRequest) {
          callback({ error: -6 });
          return;
        }
        callback({ path: fallbackIndex });
        return;
      }

      callback({ path: resolvedCandidate });
    } catch {
      callback({ path: fallbackIndex });
    }
  });

  desktopProtocolRegistered = true;
}

function dispatchMenuAction(action: string): void {
  const existingWindow =
    BrowserWindow.getFocusedWindow() ?? mainWindow ?? BrowserWindow.getAllWindows()[0];
  const targetWindow = existingWindow ?? (backendWsUrl ? createWindow() : null);
  if (!targetWindow) {
    return;
  }
  if (!existingWindow) {
    mainWindow = targetWindow;
  }

  const send = () => {
    if (targetWindow.isDestroyed()) return;
    targetWindow.webContents.send(MENU_ACTION_CHANNEL, action);
    if (!targetWindow.isVisible()) {
      targetWindow.show();
    }
    targetWindow.focus();
  };

  if (targetWindow.webContents.isLoadingMainFrame()) {
    targetWindow.webContents.once("did-finish-load", send);
    return;
  }

  send();
}

function handleCheckForUpdatesMenuClick(): void {
  const disabledReason = getAutoUpdateDisabledReason({
    isDevelopment,
    isPackaged: app.isPackaged,
    platform: process.platform,
    appImage: process.env.APPIMAGE,
    disabledByEnv: process.env.ROWL_DISABLE_AUTO_UPDATE === "1",
  });
  if (disabledReason) {
    console.info("[desktop-updater] Manual update check requested, but updates are disabled.");
    void dialog.showMessageBox({
      type: "info",
      title: "Updates unavailable",
      message: "Automatic updates are not available right now.",
      detail: disabledReason,
      buttons: ["OK"],
    });
    return;
  }

  if (!BrowserWindow.getAllWindows().length) {
    mainWindow = createWindow();
  }
  void checkForUpdatesFromMenu();
}

async function checkForUpdatesFromMenu(): Promise<void> {
  await checkForUpdates("menu");

  if (updateState.status === "up-to-date") {
    void dialog.showMessageBox({
      type: "info",
      title: "You're up to date!",
      message: `Rowl ${updateState.currentVersion} is currently the newest version available.`,
      buttons: ["OK"],
    });
  } else if (updateState.status === "error") {
    void dialog.showMessageBox({
      type: "warning",
      title: "Update check failed",
      message: "Could not check for updates.",
      detail: updateState.message ?? "An unknown error occurred. Please try again later.",
      buttons: ["OK"],
    });
  }
}

function configureApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [];

  if (process.platform === "darwin") {
    template.push({
      label: app.name,
      submenu: [
        { role: "about" },
        {
          label: "Check for Updates...",
          click: () => handleCheckForUpdatesMenuClick(),
        },
        { type: "separator" },
        {
          label: "Settings...",
          accelerator: "CmdOrCtrl+,",
          click: () => dispatchMenuAction("open-settings"),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  template.push(
    {
      label: "File",
      submenu: [
        ...(process.platform === "darwin"
          ? []
          : [
              {
                label: "Settings...",
                accelerator: "CmdOrCtrl+,",
                click: () => dispatchMenuAction("open-settings"),
              },
              { type: "separator" as const },
            ]),
        { role: process.platform === "darwin" ? "close" : "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Sidebar",
          accelerator: "CmdOrCtrl+B",
          click: () => dispatchMenuAction("toggle-sidebar"),
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn", accelerator: "CmdOrCtrl+=" },
        { role: "zoomIn", accelerator: "CmdOrCtrl+Plus", visible: false },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Check for Updates...",
          click: () => handleCheckForUpdatesMenuClick(),
        },
      ],
    },
  );

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function resolveResourcePath(fileName: string): string | null {
  const candidates = [
    Path.join(__dirname, "../resources", fileName),
    Path.join(__dirname, "../prod-resources", fileName),
    Path.join(process.resourcesPath, "resources", fileName),
    Path.join(process.resourcesPath, fileName),
  ];

  for (const candidate of candidates) {
    if (FS.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveIconPath(ext: "ico" | "icns" | "png"): string | null {
  return resolveResourcePath(`icon.${ext}`);
}

function resolveWindowIcon(): Electron.NativeImage | null {
  if (process.platform === "darwin") {
    return null;
  }

  if (windowIconCache !== undefined) {
    return windowIconCache;
  }

  const ext = process.platform === "win32" ? "ico" : "png";
  const iconPath = resolveIconPath(ext);
  if (!iconPath) {
    windowIconCache = null;
    return windowIconCache;
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.warn(`[desktop] window icon asset could not be loaded from ${iconPath}`);
    windowIconCache = null;
    return windowIconCache;
  }

  windowIconCache = icon;
  return windowIconCache;
}

/**
 * Resolve the Electron userData directory path.
 *
 * Electron derives the default userData path from `productName` in
 * package.json, which historically produced directories with spaces and
 * parentheses (e.g. `~/.config/T3 Code (Alpha)` on Linux). This is
 * unfriendly for shell usage and violates Linux naming conventions.
 *
 * We override it to a clean lowercase name (`cut3`). If the legacy
 * directory already exists we keep using it so existing users do not
 * lose their Chromium profile data (localStorage, cookies, sessions).
 */
function resolveUserDataPath(): string {
  const appDataBase =
    process.platform === "win32"
      ? process.env.APPDATA || Path.join(OS.homedir(), "AppData", "Roaming")
      : process.platform === "darwin"
        ? Path.join(OS.homedir(), "Library", "Application Support")
        : process.env.XDG_CONFIG_HOME || Path.join(OS.homedir(), ".config");

  return resolveDesktopUserDataPath({
    appDataBase,
    userDataDirName: USER_DATA_DIR_NAME,
    legacyDirNames: LEGACY_USER_DATA_DIR_NAMES,
    pathExists: FS.existsSync,
  });
}

function configureAppIdentity(): void {
  app.setName(APP_DISPLAY_NAME);
  const commitHash = resolveAboutCommitHash();
  app.setAboutPanelOptions({
    applicationName: APP_DISPLAY_NAME,
    applicationVersion: app.getVersion(),
    version: commitHash ?? "unknown",
  });

  if (process.platform === "win32") {
    app.setAppUserModelId(APP_USER_MODEL_ID);
  }

  if (process.platform === "darwin" && app.dock) {
    const iconPath = resolveIconPath("png");
    if (iconPath) {
      app.dock.setIcon(iconPath);
    }
  }
}

function clearUpdatePollTimer(): void {
  if (updateStartupTimer) {
    clearTimeout(updateStartupTimer);
    updateStartupTimer = null;
  }
  if (updatePollTimer) {
    clearInterval(updatePollTimer);
    updatePollTimer = null;
  }
}

function emitUpdateState(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(UPDATE_STATE_CHANNEL, updateState);
  }
}

function setUpdateState(patch: Partial<DesktopUpdateState>): void {
  updateState = { ...updateState, ...patch };
  emitUpdateState();
}

function shouldEnableAutoUpdates(): boolean {
  return (
    getAutoUpdateDisabledReason({
      isDevelopment,
      isPackaged: app.isPackaged,
      platform: process.platform,
      appImage: process.env.APPIMAGE,
      disabledByEnv: process.env.ROWL_DISABLE_AUTO_UPDATE === "1",
    }) === null
  );
}

async function checkForUpdates(reason: string): Promise<void> {
  if (isQuitting || !updaterConfigured || updateCheckInFlight) return;
  if (updateState.status === "downloading" || updateState.status === "downloaded") {
    console.info(
      `[desktop-updater] Skipping update check (${reason}) while status=${updateState.status}.`,
    );
    return;
  }
  updateCheckInFlight = true;
  setUpdateState(reduceDesktopUpdateStateOnCheckStart(updateState, new Date().toISOString()));
  console.info(`[desktop-updater] Checking for updates (${reason})...`);

  try {
    await autoUpdater.checkForUpdates();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setUpdateState(
      reduceDesktopUpdateStateOnCheckFailure(updateState, message, new Date().toISOString()),
    );
    console.error(`[desktop-updater] Failed to check for updates: ${message}`);
  } finally {
    updateCheckInFlight = false;
  }
}

async function downloadAvailableUpdate(): Promise<{ accepted: boolean; completed: boolean }> {
  if (!updaterConfigured || updateDownloadInFlight || updateState.status !== "available") {
    return { accepted: false, completed: false };
  }
  updateDownloadInFlight = true;
  setUpdateState(reduceDesktopUpdateStateOnDownloadStart(updateState));
  autoUpdater.disableDifferentialDownload = isArm64HostRunningIntelBuild(desktopRuntimeInfo);
  console.info("[desktop-updater] Downloading update...");

  try {
    await autoUpdater.downloadUpdate();
    return { accepted: true, completed: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setUpdateState(reduceDesktopUpdateStateOnDownloadFailure(updateState, message));
    console.error(`[desktop-updater] Failed to download update: ${message}`);
    return { accepted: true, completed: false };
  } finally {
    updateDownloadInFlight = false;
  }
}

async function installDownloadedUpdate(): Promise<{ accepted: boolean; completed: boolean }> {
  if (isQuitting || !updaterConfigured || updateState.status !== "downloaded") {
    return { accepted: false, completed: false };
  }

  isQuitting = true;
  clearUpdatePollTimer();
  try {
    await stopBackendAndWaitForExit();
    autoUpdater.quitAndInstall();
    return { accepted: true, completed: true };
  } catch (error: unknown) {
    const message = formatErrorMessage(error);
    isQuitting = false;
    setUpdateState(reduceDesktopUpdateStateOnInstallFailure(updateState, message));
    console.error(`[desktop-updater] Failed to install update: ${message}`);
    return { accepted: true, completed: false };
  }
}

function configureAutoUpdater(): void {
  const enabled = shouldEnableAutoUpdates();
  setUpdateState({
    ...createInitialDesktopUpdateState(app.getVersion(), desktopRuntimeInfo),
    enabled,
    status: enabled ? "idle" : "disabled",
  });
  if (!enabled) {
    return;
  }
  updaterConfigured = true;

  const githubToken =
    process.env.ROWL_DESKTOP_UPDATE_GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || "";
  if (githubToken) {
    // When a token is provided, re-configure the feed with `private: true` so
    // electron-updater uses the GitHub API (api.github.com) instead of the
    // public Atom feed (github.com/…/releases.atom) which rejects Bearer auth.
    const appUpdateYml = readAppUpdateYml();
    if (appUpdateYml?.provider === "github") {
      autoUpdater.setFeedURL({
        ...appUpdateYml,
        provider: "github" as const,
        private: true,
        token: githubToken,
      });
    }
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  const updaterTrack = resolveAutoUpdaterTrack(app.getVersion());
  autoUpdater.channel = updaterTrack.channel;
  autoUpdater.allowPrerelease = updaterTrack.allowPrerelease;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableDifferentialDownload = isArm64HostRunningIntelBuild(desktopRuntimeInfo);
  let lastLoggedDownloadMilestone = -1;

  console.info(
    `[desktop-updater] Configured update track channel=${updaterTrack.channel} allowPrerelease=${updaterTrack.allowPrerelease} version=${app.getVersion()}`,
  );

  if (isArm64HostRunningIntelBuild(desktopRuntimeInfo)) {
    console.info(
      "[desktop-updater] Apple Silicon host detected while running Intel build; updates will switch to arm64 packages.",
    );
  }

  autoUpdater.on("checking-for-update", () => {
    console.info("[desktop-updater] Looking for updates...");
  });
  autoUpdater.on("update-available", (info) => {
    setUpdateState(
      reduceDesktopUpdateStateOnUpdateAvailable(
        updateState,
        info.version,
        new Date().toISOString(),
      ),
    );
    lastLoggedDownloadMilestone = -1;
    console.info(`[desktop-updater] Update available: ${info.version}`);
  });
  autoUpdater.on("update-not-available", () => {
    setUpdateState(reduceDesktopUpdateStateOnNoUpdate(updateState, new Date().toISOString()));
    lastLoggedDownloadMilestone = -1;
    console.info("[desktop-updater] No updates available.");
  });
  autoUpdater.on("error", (error) => {
    const message = formatErrorMessage(error);
    if (!updateCheckInFlight && !updateDownloadInFlight) {
      setUpdateState({
        status: "error",
        message,
        checkedAt: new Date().toISOString(),
        downloadPercent: null,
        errorContext: resolveUpdaterErrorContext(),
        canRetry: updateState.availableVersion !== null || updateState.downloadedVersion !== null,
      });
    }
    console.error(`[desktop-updater] Updater error: ${message}`);
  });
  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.floor(progress.percent);
    if (
      shouldBroadcastDownloadProgress(updateState, progress.percent) ||
      updateState.message !== null
    ) {
      setUpdateState(reduceDesktopUpdateStateOnDownloadProgress(updateState, progress.percent));
    }
    const milestone = percent - (percent % 10);
    if (milestone > lastLoggedDownloadMilestone) {
      lastLoggedDownloadMilestone = milestone;
      console.info(`[desktop-updater] Download progress: ${percent}%`);
    }
  });
  autoUpdater.on("update-downloaded", (info) => {
    setUpdateState(reduceDesktopUpdateStateOnDownloadComplete(updateState, info.version));
    console.info(`[desktop-updater] Update downloaded: ${info.version}`);
  });

  clearUpdatePollTimer();

  updateStartupTimer = setTimeout(() => {
    updateStartupTimer = null;
    void checkForUpdates("startup");
  }, AUTO_UPDATE_STARTUP_DELAY_MS);
  updateStartupTimer.unref();

  updatePollTimer = setInterval(() => {
    void checkForUpdates("poll");
  }, AUTO_UPDATE_POLL_INTERVAL_MS);
  updatePollTimer.unref();
}
function backendEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ROWL_MODE: "desktop",
    ROWL_NO_BROWSER: "1",
    ROWL_PORT: "0",
    ROWL_STATE_DIR: STATE_DIR,
    ROWL_AUTH_TOKEN: backendAuthToken,
  };
}

function scheduleBackendRestart(reason: string): void {
  if (isQuitting || restartTimer) return;

  const delayMs = Math.min(500 * 2 ** restartAttempt, 10_000);
  restartAttempt += 1;
  console.error(`[desktop] backend exited unexpectedly (${reason}); restarting in ${delayMs}ms`);

  restartTimer = setTimeout(() => {
    restartTimer = null;
    void startBackend().catch((error) => {
      const message = formatErrorMessage(error);
      console.error(`[desktop] backend restart failed (${message})`);
      scheduleBackendRestart(message);
    });
  }, delayMs);
  restartTimer.unref();
}

async function startBackend(): Promise<void> {
  if (isQuitting) return;
  if (backendStartupPromise) {
    return backendStartupPromise;
  }
  if (backendProcess) {
    return;
  }

  backendStartupPromise = (async () => {
    const backendEntry = resolveBackendEntry();
    if (!FS.existsSync(backendEntry)) {
      throw new Error(`Missing server entry at ${backendEntry}`);
    }

    const child = ChildProcess.spawn(process.execPath, [backendEntry], {
      cwd: resolveBackendCwd(),
      // In Electron main, process.execPath points to the Electron binary.
      // Run the child in Node mode so this backend process does not become a GUI app instance.
      env: {
        ...backendEnv(),
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    backendProcess = child;

    let backendSessionClosed = false;
    const closeBackendSession = (details: string) => {
      if (backendSessionClosed) return;
      backendSessionClosed = true;
      writeBackendSessionBoundary("END", details);
    };

    writeBackendSessionBoundary(
      "START",
      `pid=${child.pid ?? "unknown"} port=auto cwd=${resolveBackendCwd()}`,
    );

    const readyPort = await new Promise<number>((resolve, reject) => {
      let settled = false;
      let ready = false;
      const settleResolve = (port: number) => {
        if (settled) return;
        settled = true;
        if (readyTimer) {
          clearTimeout(readyTimer);
        }
        ready = true;
        resolve(port);
      };
      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        if (readyTimer) {
          clearTimeout(readyTimer);
        }
        reject(error);
      };

      const readyTimer = setTimeout(() => {
        const error = new Error(
          `Backend did not become ready within ${BACKEND_READY_TIMEOUT_MS}ms.`,
        );
        closeBackendSession(`pid=${child.pid ?? "unknown"} error=${error.message}`);
        if (backendProcess === child) {
          backendProcess = null;
        }
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGTERM");
        }
        settleReject(error);
      }, BACKEND_READY_TIMEOUT_MS);
      readyTimer.unref();

      attachBackendOutput(child, {
        onStdoutLine: (line) => {
          const payload = parseDesktopBackendReadyLine(line);
          if (!payload) {
            return;
          }
          settleResolve(payload.port);
        },
      });

      child.once("spawn", () => {
        writeDesktopLogHeader(`backend spawned pid=${child.pid ?? "unknown"}`);
      });

      child.on("error", (error) => {
        if (backendProcess === child) {
          backendProcess = null;
        }
        closeBackendSession(`pid=${child.pid ?? "unknown"} error=${error.message}`);
        if (!ready) {
          settleReject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        scheduleBackendRestart(error.message);
      });

      child.on("exit", (code, signal) => {
        if (backendProcess === child) {
          backendProcess = null;
        }
        const reason = `code=${code ?? "null"} signal=${signal ?? "null"}`;
        closeBackendSession(`pid=${child.pid ?? "unknown"} ${reason}`);
        if (!ready) {
          settleReject(new Error(`Backend exited before ready (${reason}).`));
          return;
        }
        if (isQuitting) return;
        scheduleBackendRestart(reason);
      });
    });

    restartAttempt = 0;
    updateBackendWsUrl(readyPort);
  })().finally(() => {
    backendStartupPromise = null;
  });

  return backendStartupPromise;
}

function stopBackend(): void {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  const child = backendProcess;
  backendProcess = null;
  if (!child) return;

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, 2_000).unref();
  }
}

async function stopBackendAndWaitForExit(timeoutMs = 5_000): Promise<void> {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  const child = backendProcess;
  backendProcess = null;
  if (!child) return;
  const backendChild = child;
  if (backendChild.exitCode !== null || backendChild.signalCode !== null) return;

  await new Promise<void>((resolve) => {
    let settled = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
    let exitTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

    function settle(): void {
      if (settled) return;
      settled = true;
      backendChild.off("exit", onExit);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      if (exitTimeoutTimer) {
        clearTimeout(exitTimeoutTimer);
      }
      resolve();
    }

    function onExit(): void {
      settle();
    }

    backendChild.once("exit", onExit);
    backendChild.kill("SIGTERM");

    forceKillTimer = setTimeout(() => {
      if (backendChild.exitCode === null && backendChild.signalCode === null) {
        backendChild.kill("SIGKILL");
      }
    }, 2_000);
    forceKillTimer.unref();

    exitTimeoutTimer = setTimeout(() => {
      settle();
    }, timeoutMs);
    exitTimeoutTimer.unref();
  });
}

function registerIpcHandlers(): void {
  ipcMain.removeHandler(PICK_FOLDER_CHANNEL);
  ipcMain.handle(PICK_FOLDER_CHANNEL, async () => {
    const owner = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const result = owner
      ? await dialog.showOpenDialog(owner, {
          properties: ["openDirectory", "createDirectory"],
        })
      : await dialog.showOpenDialog({
          properties: ["openDirectory", "createDirectory"],
        });
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.removeHandler(CONFIRM_CHANNEL);
  ipcMain.handle(CONFIRM_CHANNEL, async (_event, message: unknown) => {
    if (typeof message !== "string") {
      return false;
    }

    const owner = BrowserWindow.getFocusedWindow() ?? mainWindow;
    return showDesktopConfirmDialog(message, owner);
  });

  ipcMain.removeHandler(SET_THEME_CHANNEL);
  ipcMain.handle(SET_THEME_CHANNEL, async (_event, rawTheme: unknown) => {
    const theme = getSafeTheme(rawTheme);
    if (!theme) {
      return;
    }

    nativeTheme.themeSource = theme;
  });

  ipcMain.removeHandler(CONTEXT_MENU_CHANNEL);
  ipcMain.handle(
    CONTEXT_MENU_CHANNEL,
    async (_event, items: ContextMenuItem[], position?: { x: number; y: number }) => {
      const normalizedItems = items
        .filter((item) => typeof item.id === "string" && typeof item.label === "string")
        .map((item) => ({
          id: item.id,
          label: item.label,
          destructive: item.destructive === true,
        }));
      if (normalizedItems.length === 0) {
        return null;
      }

      const popupPosition =
        position &&
        Number.isFinite(position.x) &&
        Number.isFinite(position.y) &&
        position.x >= 0 &&
        position.y >= 0
          ? {
              x: Math.floor(position.x),
              y: Math.floor(position.y),
            }
          : null;

      const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
      if (!window) return null;

      return new Promise<string | null>((resolve) => {
        const template: MenuItemConstructorOptions[] = [];
        let hasInsertedDestructiveSeparator = false;
        for (const item of normalizedItems) {
          if (item.destructive && !hasInsertedDestructiveSeparator && template.length > 0) {
            template.push({ type: "separator" });
            hasInsertedDestructiveSeparator = true;
          }
          const itemOption: MenuItemConstructorOptions = {
            label: item.label,
            click: () => resolve(item.id),
          };
          if (item.destructive) {
            const destructiveIcon = getDestructiveMenuIcon();
            if (destructiveIcon) {
              itemOption.icon = destructiveIcon;
            }
          }
          template.push(itemOption);
        }

        const menu = Menu.buildFromTemplate(template);
        menu.popup({
          window,
          ...popupPosition,
          callback: () => resolve(null),
        });
      });
    },
  );

  ipcMain.removeHandler(OPEN_EXTERNAL_CHANNEL);
  ipcMain.handle(OPEN_EXTERNAL_CHANNEL, async (_event, rawUrl: unknown) => {
    const externalUrl = getSafeExternalUrl(rawUrl);
    if (!externalUrl) {
      return false;
    }

    try {
      await shell.openExternal(externalUrl);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.removeHandler(SECRET_GET_CHANNEL);
  ipcMain.handle(SECRET_GET_CHANNEL, async (_event, rawKey: unknown) => {
    const key = getSafeDesktopSecretKey(rawKey);
    return key ? readDesktopSecret(key) : null;
  });

  ipcMain.removeHandler(SECRET_SET_CHANNEL);
  ipcMain.handle(SECRET_SET_CHANNEL, async (_event, rawKey: unknown, rawValue: unknown) => {
    const key = getSafeDesktopSecretKey(rawKey);
    if (!key) {
      return;
    }

    writeDesktopSecret(key, rawValue);
  });

  ipcMain.removeHandler(UPDATE_GET_STATE_CHANNEL);
  ipcMain.handle(UPDATE_GET_STATE_CHANNEL, async () => updateState);

  ipcMain.removeHandler(UPDATE_DOWNLOAD_CHANNEL);
  ipcMain.handle(UPDATE_DOWNLOAD_CHANNEL, async () => {
    const result = await downloadAvailableUpdate();
    return {
      accepted: result.accepted,
      completed: result.completed,
      state: updateState,
    } satisfies DesktopUpdateActionResult;
  });

  ipcMain.removeHandler(UPDATE_INSTALL_CHANNEL);
  ipcMain.handle(UPDATE_INSTALL_CHANNEL, async () => {
    if (isQuitting) {
      return {
        accepted: false,
        completed: false,
        state: updateState,
      } satisfies DesktopUpdateActionResult;
    }
    const result = await installDownloadedUpdate();
    return {
      accepted: result.accepted,
      completed: result.completed,
      state: updateState,
    } satisfies DesktopUpdateActionResult;
  });
}

function getIconOption(): { icon: Electron.NativeImage } | Record<string, never> {
  const icon = resolveWindowIcon();
  return icon ? { icon } : {};
}

function applyWindowIcon(window: BrowserWindow): void {
  const icon = resolveWindowIcon();
  if (!icon) {
    return;
  }

  window.setIcon(icon);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 840,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    ...getIconOption(),
    title: APP_DISPLAY_NAME,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: Path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: backendWsUrl ? [`--rowl-desktop-ws-url=${backendWsUrl}`] : [],
    },
  });

  applyWindowIcon(window);
  window.webContents.on("context-menu", (event, params) => {
    event.preventDefault();

    const menuTemplate: MenuItemConstructorOptions[] = [];

    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        menuTemplate.push({
          label: suggestion,
          click: () => window.webContents.replaceMisspelling(suggestion),
        });
      }
      if (params.dictionarySuggestions.length === 0) {
        menuTemplate.push({ label: "No suggestions", enabled: false });
      }
      menuTemplate.push({ type: "separator" });
    }

    menuTemplate.push(
      { role: "cut", enabled: params.editFlags.canCut },
      { role: "copy", enabled: params.editFlags.canCopy },
      { role: "paste", enabled: params.editFlags.canPaste },
      { role: "selectAll", enabled: params.editFlags.canSelectAll },
    );

    Menu.buildFromTemplate(menuTemplate).popup({ window });
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    const externalUrl = getSafeExternalUrl(url);
    if (externalUrl) {
      void shell.openExternal(externalUrl);
    }
    return { action: "deny" };
  });

  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2 || /websocket|mixed content|content security/i.test(message)) {
      console.warn(`[renderer-console] level=${level} ${message}`);
    }
  });

  window.on("page-title-updated", (event) => {
    event.preventDefault();
    window.setTitle(APP_DISPLAY_NAME);
  });
  window.webContents.on("did-finish-load", () => {
    window.setTitle(APP_DISPLAY_NAME);
    if (backendWsUrl) {
      window.webContents.send(BACKEND_WS_URL_UPDATED_CHANNEL, backendWsUrl);
    }
    emitUpdateState();
  });
  window.once("ready-to-show", () => {
    applyWindowIcon(window);
    window.show();
  });

  if (isDevelopment) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadURL(`${DESKTOP_SCHEME}://app/index.html`);
  }

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
}

// Override Electron's userData path before the `ready` event so that
// Chromium session data uses a filesystem-friendly directory name.
// Must be called synchronously at the top level — before `app.whenReady()`.
app.setPath("userData", resolveUserDataPath());

configureAppIdentity();

async function bootstrap(): Promise<void> {
  writeDesktopLogHeader("bootstrap start");
  backendAuthToken = Crypto.randomBytes(24).toString("hex");
  writeDesktopLogHeader("bootstrap generated backend auth token");

  registerIpcHandlers();
  writeDesktopLogHeader("bootstrap ipc handlers registered");
  await startBackend();
  writeDesktopLogHeader(`bootstrap backend ready port=${backendPort}`);
  mainWindow = createWindow();
  writeDesktopLogHeader("bootstrap main window created");
}

app.on("before-quit", () => {
  isQuitting = true;
  writeDesktopLogHeader("before-quit received");
  clearUpdatePollTimer();
  stopBackend();
  restoreStdIoCapture?.();
});

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    focusOrRestoreMainWindow();
  });

  app
    .whenReady()
    .then(() => {
      writeDesktopLogHeader("app ready");
      configureAppIdentity();
      configureApplicationMenu();
      registerDesktopProtocol();
      configureAutoUpdater();
      void bootstrap().catch((error) => {
        handleFatalStartupError("bootstrap", error);
      });

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void startBackend()
            .then(() => {
              if (BrowserWindow.getAllWindows().length === 0) {
                mainWindow = createWindow();
              } else {
                focusOrRestoreMainWindow();
              }
            })
            .catch((error) => {
              handleFatalStartupError("activate", error);
            });
        } else {
          focusOrRestoreMainWindow();
        }
      });
    })
    .catch((error) => {
      handleFatalStartupError("whenReady", error);
    });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

if (process.platform !== "win32") {
  process.on("SIGINT", () => {
    if (isQuitting) return;
    isQuitting = true;
    writeDesktopLogHeader("SIGINT received");
    clearUpdatePollTimer();
    stopBackend();
    restoreStdIoCapture?.();
    app.quit();
  });

  process.on("SIGTERM", () => {
    if (isQuitting) return;
    isQuitting = true;
    writeDesktopLogHeader("SIGTERM received");
    clearUpdatePollTimer();
    stopBackend();
    restoreStdIoCapture?.();
    app.quit();
  });
}
