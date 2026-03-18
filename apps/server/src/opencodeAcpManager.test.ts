import { OPENCODE_DEFAULT_MODEL } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  buildOpenCodeCliArgs,
  buildOpenCodeCliEnv,
  isOpenCodeDefaultModel,
  isOpenCodeModelAvailable,
  normalizeOpenCodeStartErrorMessage,
  readAvailableOpenCodeModelIds,
} from "./opencodeAcpManager";

describe("opencodeAcpManager model availability", () => {
  it("reads ACP-advertised model ids", () => {
    expect(
      readAvailableOpenCodeModelIds({
        currentModelId: "z-ai/glm-4.5",
        availableModels: [
          { modelId: "z-ai/glm-4.5", name: "GLM 4.5" },
          { modelId: "minimax/MiniMax-M2.7", name: "MiniMax M2.7" },
        ],
      }),
    ).toEqual(["z-ai/glm-4.5", "minimax/MiniMax-M2.7"]);
  });

  it("treats requested models as unavailable when ACP advertises a different model set", () => {
    expect(
      isOpenCodeModelAvailable(
        {
          currentModelId: "z-ai/glm-4.5",
          availableModels: [{ modelId: "z-ai/glm-4.5", name: "GLM 4.5" }],
        },
        "minimax/MiniMax-M2.7",
      ),
    ).toBe(false);
  });

  it("allows requested models when ACP has not advertised any model set yet", () => {
    expect(isOpenCodeModelAvailable(null, "z-ai/glm-4.5")).toBe(true);
  });

  it("detects the OpenCode default sentinel", () => {
    expect(isOpenCodeDefaultModel(OPENCODE_DEFAULT_MODEL)).toBe(true);
    expect(isOpenCodeDefaultModel("z-ai/glm-4.5")).toBe(false);
  });
});

describe("opencodeAcpManager startup", () => {
  it("builds ACP startup args with the requested working directory", () => {
    expect(buildOpenCodeCliArgs({ cwd: "/tmp/project" })).toEqual(["acp", "--cwd", "/tmp/project"]);
  });

  it("injects OPENROUTER_API_KEY into the OpenCode subprocess env when provided", () => {
    expect(
      buildOpenCodeCliEnv({
        runtimeMode: "full-access",
        openRouterApiKey: "sk-or-secret",
        baseEnv: {
          PATH: "/usr/bin",
          HOME: "/tmp/home",
        },
      }),
    ).toEqual({
      PATH: "/usr/bin",
      HOME: "/tmp/home",
      OPENROUTER_API_KEY: "sk-or-secret",
    });
  });

  it("preserves unrelated env vars for full-access sessions", () => {
    expect(
      buildOpenCodeCliEnv({
        runtimeMode: "full-access",
        baseEnv: {
          PATH: "/usr/bin",
          HOME: "/tmp/home",
        },
      }),
    ).toEqual({
      PATH: "/usr/bin",
      HOME: "/tmp/home",
    });
  });

  it("merges approval-required permissions into OPENCODE_CONFIG_CONTENT", () => {
    expect(
      buildOpenCodeCliEnv({
        runtimeMode: "approval-required",
        baseEnv: {
          PATH: "/usr/bin",
          OPENCODE_CONFIG_CONTENT: JSON.stringify({
            permission: { read: "allow" },
            model: "z-ai/glm-4.5",
          }),
        },
      }),
    ).toEqual({
      PATH: "/usr/bin",
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        permission: { read: "allow", edit: "ask", bash: "ask" },
        model: "z-ai/glm-4.5",
      }),
    });
  });
});

describe("opencodeAcpManager errors", () => {
  it("rewrites missing OPENROUTER_API_KEY errors with actionable guidance", () => {
    expect(
      normalizeOpenCodeStartErrorMessage("Missing environment variable: 'OPENROUTER_API_KEY'."),
    ).toBe(
      "OpenCode provider config requires OPENROUTER_API_KEY. Add an OpenRouter API key in CUT3 Settings or export OPENROUTER_API_KEY before starting CUT3.",
    );
  });

  it("normalizes authentication errors into a login message", () => {
    expect(normalizeOpenCodeStartErrorMessage("Authentication required")).toBe(
      "OpenCode requires authentication. Run `opencode auth login` and try again.",
    );
  });

  it("preserves unrelated startup errors", () => {
    expect(
      normalizeOpenCodeStartErrorMessage("OpenCode ACP initialize timed out after 10000ms."),
    ).toBe("OpenCode ACP initialize timed out after 10000ms.");
  });
});
