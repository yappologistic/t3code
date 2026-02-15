import { z } from "zod";

export const keybindingCommandSchema = z.enum([
  "terminal.toggle",
  "terminal.split",
  "terminal.new",
  "chat.new",
  "editor.openFavorite",
]);

const keybindingValueSchema = z.string().trim().min(1).max(64);
const keybindingWhenSchema = z.string().trim().min(1).max(256);

export const keybindingRuleSchema = z.object({
  key: keybindingValueSchema,
  command: keybindingCommandSchema,
  when: keybindingWhenSchema.optional(),
});

export const keybindingsConfigSchema = z.array(keybindingRuleSchema).max(256);

export type KeybindingCommand = z.infer<typeof keybindingCommandSchema>;
export type KeybindingRule = z.infer<typeof keybindingRuleSchema>;
export type KeybindingsConfig = z.infer<typeof keybindingsConfigSchema>;
