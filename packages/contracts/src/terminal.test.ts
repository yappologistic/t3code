import { describe, expect, it } from "vitest";

import { terminalCommandInputSchema } from "./terminal";

describe("terminalCommandInputSchema", () => {
  it("accepts a valid command", () => {
    const result = terminalCommandInputSchema.safeParse({
      command: "echo hello",
    });
    expect(result.success).toBe(true);
  });

  it("trims whitespace", () => {
    const result = terminalCommandInputSchema.parse({
      command: "  echo hello  ",
    });
    expect(result.command).toBe("echo hello");
  });

  it("rejects an empty command", () => {
    const result = terminalCommandInputSchema.safeParse({ command: "   " });
    expect(result.success).toBe(false);
  });
});
