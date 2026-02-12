import fs from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { CodexTextGenerator } from "./codexTextGenerator";
import type { ProcessRunOptions, ProcessRunResult } from "./processRunner";

type ProcessRunner = (
  command: string,
  args: readonly string[],
  options?: ProcessRunOptions,
) => Promise<ProcessRunResult>;

function getArgValue(args: readonly string[], flag: string): string {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) {
    throw new Error(`Missing argument value for ${flag}`);
  }
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing argument value for ${flag}`);
  }
  return value;
}

function okResult(): ProcessRunResult {
  return {
    stdout: "",
    stderr: "",
    code: 0,
    signal: null,
    timedOut: false,
  };
}

function commitInput() {
  return {
    cwd: process.cwd(),
    branch: "feat/example",
    stagedSummary: "M apps/server/src/gitManager.ts",
    stagedPatch: "diff --git a/file b/file",
  };
}

describe("CodexTextGenerator", () => {
  it("uses gpt-5.3-codex-spark when available with medium reasoning effort", async () => {
    const models: string[] = [];
    const configs: string[] = [];

    const runner: ProcessRunner = async (command, args) => {
      expect(command).toBe("codex");
      models.push(getArgValue(args, "--model"));
      configs.push(getArgValue(args, "--config"));

      const outputPath = getArgValue(args, "--output-last-message");
      await fs.writeFile(
        outputPath,
        JSON.stringify({
          subject: "Add stacked git actions menu behavior",
          body: "- Keep menu actions visible\n- Improve disabled states",
        }),
        "utf8",
      );
      return okResult();
    };

    const generator = new CodexTextGenerator({ runProcess: runner });
    const result = await generator.generateCommitMessage(commitInput());

    expect(result.subject).toBe("Add stacked git actions menu behavior");
    expect(models).toEqual(["gpt-5.3-codex-spark"]);
    expect(configs).toEqual(['model_reasoning_effort="medium"']);
  });

  it("uses gpt-5.3-codex-spark for PR content generation", async () => {
    const models: string[] = [];

    const runner: ProcessRunner = async (command, args) => {
      expect(command).toBe("codex");
      models.push(getArgValue(args, "--model"));

      const outputPath = getArgValue(args, "--output-last-message");
      await fs.writeFile(
        outputPath,
        JSON.stringify({
          title: "Improve Git action modal behavior",
          body: "## Summary\n- Update PR generation model\n\n## Testing\n- Not run",
        }),
        "utf8",
      );
      return okResult();
    };

    const generator = new CodexTextGenerator({ runProcess: runner });
    const result = await generator.generatePrContent({
      cwd: process.cwd(),
      baseBranch: "main",
      headBranch: "feat/example",
      commitSummary: "abc123 Update model",
      diffSummary: "1 file changed",
      diffPatch: "diff --git a/file b/file",
    });

    expect(result.title).toBe("Improve Git action modal behavior");
    expect(models).toEqual(["gpt-5.3-codex-spark"]);
  });

  it("propagates generation failures without retrying a second model", async () => {
    const models: string[] = [];

    const runner: ProcessRunner = async (_command, args) => {
      models.push(getArgValue(args, "--model"));
      throw new Error("Request timed out while contacting Codex.");
    };

    const generator = new CodexTextGenerator({ runProcess: runner });

    await expect(generator.generateCommitMessage(commitInput())).rejects.toThrow(
      "Request timed out while contacting Codex.",
    );
    expect(models).toEqual(["gpt-5.3-codex-spark"]);
  });
});
