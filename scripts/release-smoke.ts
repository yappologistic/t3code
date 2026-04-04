import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const workspaceFiles = [
  "package.json",
  "bun.lock",
  "apps/server/package.json",
  "apps/desktop/package.json",
  "apps/web/package.json",
  "apps/marketing/package.json",
  "packages/contracts/package.json",
  "packages/shared/package.json",
  "scripts/package.json",
] as const;

function copyWorkspaceManifestFixture(targetRoot: string): void {
  for (const relativePath of workspaceFiles) {
    const sourcePath = resolve(repoRoot, relativePath);
    const destinationPath = resolve(targetRoot, relativePath);
    mkdirSync(dirname(destinationPath), { recursive: true });
    cpSync(sourcePath, destinationPath);
  }
}

function writeMacManifestFixtures(targetRoot: string): { arm64Path: string; x64Path: string } {
  const assetDirectory = resolve(targetRoot, "release-assets");
  mkdirSync(assetDirectory, { recursive: true });

  const arm64Path = resolve(assetDirectory, "latest-mac.yml");
  const x64Path = resolve(assetDirectory, "latest-mac-x64.yml");

  writeFileSync(
    arm64Path,
    `version: 9.9.9-smoke.0
files:
  - url: Rowl-macOS-9.9.9-smoke.0-arm64.zip
    sha512: arm64zip
    size: 125621344
  - url: Rowl-macOS-9.9.9-smoke.0-arm64.dmg
    sha512: arm64dmg
    size: 131754935
path: Rowl-macOS-9.9.9-smoke.0-arm64.zip
sha512: arm64zip
releaseDate: '2026-03-08T10:32:14.587Z'
`,
  );

  writeFileSync(
    x64Path,
    `version: 9.9.9-smoke.0
files:
  - url: Rowl-macOS-9.9.9-smoke.0-x64.zip
    sha512: x64zip
    size: 132000112
  - url: Rowl-macOS-9.9.9-smoke.0-x64.dmg
    sha512: x64dmg
    size: 138148807
path: Rowl-macOS-9.9.9-smoke.0-x64.zip
sha512: x64zip
releaseDate: '2026-03-08T10:36:07.540Z'
`,
  );

  return { arm64Path, x64Path };
}

function assertContains(haystack: string, needle: string, message: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(message);
  }
}

const tempRoot = mkdtempSync(join(tmpdir(), "t3-release-smoke-"));

try {
  copyWorkspaceManifestFixture(tempRoot);

  execFileSync(
    process.execPath,
    [
      resolve(repoRoot, "scripts/update-release-package-versions.ts"),
      "9.9.9-smoke.0",
      "--root",
      tempRoot,
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );

  execFileSync("bun", ["install", "--lockfile-only", "--ignore-scripts"], {
    cwd: tempRoot,
    stdio: "inherit",
  });

  const lockfile = readFileSync(resolve(tempRoot, "bun.lock"), "utf8");
  assertContains(
    lockfile,
    `"version": "9.9.9-smoke.0"`,
    "Expected bun.lock to contain the smoke version.",
  );

  const { arm64Path, x64Path } = writeMacManifestFixtures(tempRoot);
  execFileSync(
    process.execPath,
    [resolve(repoRoot, "scripts/merge-mac-update-manifests.ts"), arm64Path, x64Path],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );

  const mergedManifest = readFileSync(arm64Path, "utf8");
  assertContains(
    mergedManifest,
    "Rowl-macOS-9.9.9-smoke.0-arm64.zip",
    "Merged manifest is missing the arm64 asset.",
  );
  assertContains(
    mergedManifest,
    "Rowl-macOS-9.9.9-smoke.0-x64.zip",
    "Merged manifest is missing the x64 asset.",
  );

  const checksumAssetPath = resolve(
    tempRoot,
    "release-assets",
    "Rowl-linux-9.9.9-smoke.0-x86_64.AppImage",
  );
  writeFileSync(checksumAssetPath, "linux-release-asset");
  execFileSync(
    process.execPath,
    [
      resolve(repoRoot, "scripts/create-release-checksums.ts"),
      resolve(tempRoot, "release-assets"),
      "--output",
      resolve(tempRoot, "release-assets", "SHA256SUMS"),
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );

  const checksumManifest = readFileSync(resolve(tempRoot, "release-assets", "SHA256SUMS"), "utf8");
  assertContains(
    checksumManifest,
    "Rowl-linux-9.9.9-smoke.0-x86_64.AppImage",
    "Expected SHA256SUMS to include the Linux release asset.",
  );
  assertContains(
    checksumManifest,
    "latest-mac.yml",
    "Expected SHA256SUMS to include the merged macOS update manifest.",
  );

  console.log("Release smoke checks passed.");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
