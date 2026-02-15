import { z } from "zod";
import { keybindingsConfigSchema } from "./keybindings";

export const serverConfigSchema = z.object({
  cwd: z.string().min(1),
  keybindings: keybindingsConfigSchema.default([]),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
