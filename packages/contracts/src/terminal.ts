import { z } from "zod";

export const terminalCommandInputSchema = z.object({
  command: z.string().trim().min(1).max(4000),
  cwd: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
});

export const terminalCommandResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  code: z.number().nullable(),
  signal: z.string().nullable(),
  timedOut: z.boolean(),
});

export type TerminalCommandInput = z.infer<typeof terminalCommandInputSchema>;
export type TerminalCommandResult = z.infer<typeof terminalCommandResultSchema>;
