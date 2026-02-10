/**
 * Copies the built web app into dist/client/ so the published npm package
 * includes the web UI. This runs as a post-build step.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, "../../web/dist");
const target = path.resolve(__dirname, "../dist/client");

if (!fs.existsSync(webDist)) {
  console.log(
    "⚠ Web dist not found — skipping client bundle. Run `bun run --cwd apps/web build` first.",
  );
  process.exit(0);
}

fs.cpSync(webDist, target, { recursive: true });
console.log("✓ Bundled web app into dist/client");
