import { describe, expect, it } from "vitest";

import {
  buildKimiApiKeyConfig,
  buildKimiCliArgs,
  isKimiModelAvailable,
  isKimiLoginProbeUnauthenticated,
  normalizeKimiStartErrorMessage,
  readAvailableKimiModelIds,
} from "./kimiAcpManager";

describe("kimiAcpManager model availability", () => {
  it("reads ACP-advertised model ids", () => {
    expect(
      readAvailableKimiModelIds({
        currentModelId: "kimi-for-coding",
        availableModels: [
          { modelId: "kimi-for-coding", name: "Kimi for Coding" },
          { modelId: "kimi-thinking", name: "Kimi Thinking" },
        ],
      }),
    ).toEqual(["kimi-for-coding", "kimi-thinking"]);
  });

  it("treats requested models as unavailable when ACP advertises a different model set", () => {
    expect(
      isKimiModelAvailable(
        {
          currentModelId: "kimi-for-coding",
          availableModels: [{ modelId: "kimi-for-coding", name: "Kimi for Coding" }],
        },
        "kimi-thinking",
      ),
    ).toBe(false);
  });

  it("allows requested models when ACP has not advertised any model set yet", () => {
    expect(isKimiModelAvailable(null, "kimi-for-coding")).toBe(true);
  });

  it("builds ACP startup args with the requested Kimi model", () => {
    expect(
      buildKimiCliArgs({
        runtimeMode: "full-access",
        model: "kimi-k2-thinking",
      }),
    ).toEqual(["--yolo", "--model", "kimi-k2-thinking", "acp"]);
  });

  it("includes the generated config file before starting ACP", () => {
    expect(
      buildKimiCliArgs({
        runtimeMode: "approval-required",
        model: "kimi-for-coding",
        configFilePath: "/tmp/t3code-kimi/config.json",
      }),
    ).toEqual([
      "--config-file",
      "/tmp/t3code-kimi/config.json",
      "--model",
      "kimi-for-coding",
      "acp",
    ]);
  });

  it("builds a Kimi config from an API key with search and fetch services", () => {
    expect(
      buildKimiApiKeyConfig({
        apiKey: "sk-kimi-test",
        model: "kimi-k2-thinking",
      }),
    ).toEqual({
      default_model: "kimi-k2-thinking",
      providers: {
        "t3code-kimi": {
          type: "kimi",
          base_url: "https://api.kimi.com/coding/v1",
          api_key: "sk-kimi-test",
        },
      },
      models: {
        "kimi-k2-thinking": {
          provider: "t3code-kimi",
          model: "kimi-k2-thinking",
          max_context_size: 262144,
        },
        "kimi-for-coding": {
          provider: "t3code-kimi",
          model: "kimi-for-coding",
          max_context_size: 262144,
        },
      },
      services: {
        moonshot_search: {
          base_url: "https://api.kimi.com/coding/v1/search",
          api_key: "sk-kimi-test",
        },
        moonshot_fetch: {
          base_url: "https://api.kimi.com/coding/v1/fetch",
          api_key: "sk-kimi-test",
        },
      },
    });
  });

  it("detects unauthenticated Kimi login probe output", () => {
    expect(
      isKimiLoginProbeUnauthenticated({
        stdout:
          '{"type":"verification_url","message":"Verification URL: https://www.kimi.com/code/authorize_device?user_code=ABCD-1234"}',
      }),
    ).toBe(true);
  });

  it("normalizes timed out Kimi startup into a login error when probe output shows auth is required", () => {
    expect(
      normalizeKimiStartErrorMessage({
        rawMessage: "Kimi ACP initialize timed out after 10000ms.",
        loginProbeOutput: {
          stdout: '{"type":"waiting","message":"Waiting for user authorization...: Authorization is pending"}',
        },
      }),
    ).toBe("Kimi Code CLI requires authentication. Run `kimi login` and try again.");
  });
});
