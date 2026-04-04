import { describe, expect, it } from "vitest";

import { resolveInitialDesktopWsUrl } from "./preloadWsUrl";

describe("resolveInitialDesktopWsUrl", () => {
  it("prefers the environment-provided desktop websocket url", () => {
    expect(
      resolveInitialDesktopWsUrl({
        envValue: "ws://127.0.0.1:3773/?token=env-token",
        argv: ["electron", "app.js", "--rowl-desktop-ws-url=ws://127.0.0.1:4000"],
      }),
    ).toBe("ws://127.0.0.1:3773/?token=env-token");
  });

  it("falls back to the browser window additional argument when env is unavailable", () => {
    expect(
      resolveInitialDesktopWsUrl({
        envValue: undefined,
        argv: ["electron", "app.js", "--rowl-desktop-ws-url=ws://127.0.0.1:4000/?token=test"],
      }),
    ).toBe("ws://127.0.0.1:4000/?token=test");
  });

  it("returns null when no initial websocket url is available", () => {
    expect(
      resolveInitialDesktopWsUrl({
        envValue: undefined,
        argv: ["electron", "app.js"],
      }),
    ).toBeNull();
  });
});
