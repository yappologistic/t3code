import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default mergeConfig(
  viteConfig,
  defineConfig({
    root: webRoot,
    resolve: {
      alias: {
        "~": srcPath,
      },
    },
    optimizeDeps: {
      include: [
        "@pierre/diffs",
        "@pierre/diffs/react",
        "@pierre/diffs/worker/worker.js",
        "vitest/browser",
        "vitest-browser-react",
      ],
    },
    test: {
      include: [
        "src/components/ChatView.browser.tsx",
        "src/components/KeybindingsToast.browser.tsx",
        "src/components/PiProvider.browser.tsx",
        "src/components/ThreadNewButton.browser.tsx",
        "src/components/ui/sidebar.browser.tsx",
      ],
      browser: {
        enabled: true,
        provider: playwright(),
        instances: [{ browser: "chromium" }],
        headless: true,
      },
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  }),
);
