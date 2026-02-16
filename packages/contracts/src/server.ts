import { z } from "zod";
import { resolvedKeybindingsConfigSchema } from "./keybindings";

export const serverConfigSchema = z.object({
  cwd: z.string().min(1),
  keybindings: resolvedKeybindingsConfigSchema.default([]),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
