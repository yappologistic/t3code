import { createRequire } from "node:module";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  mergeMacUpdateManifests,
  parseMacUpdateManifest,
  serializeMacUpdateManifest,
} from "./merge-mac-update-manifests.ts";

function makeMergedMacManifestYaml(): string {
  const arm64 = parseMacUpdateManifest(
    `version: 0.0.12-fork.2
files:
  - url: Rowl-macOS-0.0.12-fork.2-arm64.zip
    sha512: arm64zip
    size: 10
  - url: Rowl-macOS-0.0.12-fork.2-arm64.dmg
    sha512: arm64dmg
    size: 11
path: Rowl-macOS-0.0.12-fork.2-arm64.zip
sha512: arm64zip
releaseDate: '2026-03-12T23:30:00.000Z'
`,
    "latest-mac.yml",
  );

  const x64 = parseMacUpdateManifest(
    `version: 0.0.12-fork.2
files:
  - url: Rowl-macOS-0.0.12-fork.2-x64.zip
    sha512: x64zip
    size: 12
  - url: Rowl-macOS-0.0.12-fork.2-x64.dmg
    sha512: x64dmg
    size: 13
path: Rowl-macOS-0.0.12-fork.2-x64.zip
sha512: x64zip
releaseDate: '2026-03-12T23:31:00.000Z'
`,
    "latest-mac-x64.yml",
  );

  return serializeMacUpdateManifest(mergeMacUpdateManifests(arm64, x64));
}

type ElectronUpdaterModules = {
  MacUpdater: typeof import("../apps/desktop/node_modules/electron-updater/out/MacUpdater.js").MacUpdater;
  parseUpdateInfo: typeof import("../apps/desktop/node_modules/electron-updater/out/providers/Provider.js").parseUpdateInfo;
  resolveFiles: typeof import("../apps/desktop/node_modules/electron-updater/out/providers/Provider.js").resolveFiles;
};

const require = createRequire(import.meta.url);
const childProcessModule = require("child_process") as typeof import("node:child_process");
const originalExecFileSync = childProcessModule.execFileSync;

async function loadElectronUpdaterModules(args: {
  uname: string;
  rosetta: boolean;
}): Promise<ElectronUpdaterModules> {
  childProcessModule.execFileSync = ((file: string) => {
    if (file === "sysctl") {
      if (args.rosetta) {
        return "sysctl.proc_translated: 1";
      }
      throw new Error("sysctl unavailable");
    }

    if (file === "uname") {
      return args.uname;
    }

    throw new Error(`Unexpected command: ${file}`);
  }) as typeof childProcessModule.execFileSync;

  const [{ MacUpdater }, providerModule] = await Promise.all([
    import("../apps/desktop/node_modules/electron-updater/out/MacUpdater.js"),
    import("../apps/desktop/node_modules/electron-updater/out/providers/Provider.js"),
  ]);

  return {
    MacUpdater,
    parseUpdateInfo: providerModule.parseUpdateInfo,
    resolveFiles: providerModule.resolveFiles,
  };
}

function makeDownloadUpdateOptions(modules: ElectronUpdaterModules) {
  const yaml = makeMergedMacManifestYaml();
  const channelFileUrl = new URL(
    "https://example.com/releases/download/v0.0.12-fork.2/latest-mac.yml",
  );
  const info = modules.parseUpdateInfo(yaml, "latest-mac.yml", channelFileUrl);
  const provider = {
    resolveFiles: (updateInfo: Parameters<ElectronUpdaterModules["resolveFiles"]>[0]) =>
      modules.resolveFiles(
        updateInfo,
        new URL("https://example.com/releases/download/v0.0.12-fork.2/"),
      ),
  };

  return {
    updateInfoAndProvider: {
      info,
      provider,
    },
    disableDifferentialDownload: true,
    requestHeaders: undefined,
    cancellationToken: {
      cancelled: false,
      cancel: () => undefined,
      createPromise: () => new Promise<never>(() => undefined),
      onCancel: () => undefined,
      dispose: () => undefined,
    },
  } as any;
}

function makeFakeMacUpdater(MacUpdater: ElectronUpdaterModules["MacUpdater"]): any {
  const updater = Object.create(MacUpdater.prototype) as any;
  updater._logger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  updater.executeDownload = vi.fn(async (options: { fileInfo: { url: URL } }) => options.fileInfo);
  return updater;
}

async function selectMacUpdateFile(args: { uname: string; rosetta: boolean }): Promise<string> {
  const modules = await loadElectronUpdaterModules(args);
  const updater = makeFakeMacUpdater(modules.MacUpdater);

  await (modules.MacUpdater.prototype as any).doDownloadUpdate.call(
    updater,
    makeDownloadUpdateOptions(modules),
  );

  expect(updater.executeDownload).toHaveBeenCalledTimes(1);
  const call = updater.executeDownload.mock.calls[0]?.[0] as { fileInfo: { url: URL } } | undefined;
  expect(call).toBeDefined();
  return call?.fileInfo.url.pathname ?? "";
}

afterEach(() => {
  childProcessModule.execFileSync = originalExecFileSync;
  vi.restoreAllMocks();
});

describe("merge-mac-update-manifests electron-updater compatibility", () => {
  it("selects the x64 zip for x64 macOS hosts", async () => {
    await expect(
      selectMacUpdateFile({ uname: "Darwin x86_64 Apple Kernel Version", rosetta: false }),
    ).resolves.toContain("Rowl-macOS-0.0.12-fork.2-x64.zip");
  });

  it("selects the arm64 zip for native arm64 macOS hosts", async () => {
    await expect(
      selectMacUpdateFile({ uname: "Darwin ARM64 Apple Kernel Version", rosetta: false }),
    ).resolves.toContain("Rowl-macOS-0.0.12-fork.2-arm64.zip");
  });

  it("selects the arm64 zip for Rosetta-translated macOS hosts", async () => {
    await expect(
      selectMacUpdateFile({ uname: "Darwin x86_64 Apple Kernel Version", rosetta: true }),
    ).resolves.toContain("Rowl-macOS-0.0.12-fork.2-arm64.zip");
  });
});
