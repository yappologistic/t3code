import { registerCustomTheme, type ThemeRegistrationResolved } from "@pierre/diffs";

import { type AppliedCustomThemeId } from "./customThemes";
import { ALL_DIFF_THEME_NAMES, resolveDiffThemeName, type DiffThemeName } from "./diffRendering";

export const T3_CHAT_CODE_THEME_NAME = "t3-chat-code-dark" as const;
export const T3_CHAT_CODE_THEME_BACKGROUND = "#1a1821" as const;
export const T3_CHAT_CODE_THEME_FOREGROUND = "#a5a1b0" as const;

export type ChatCodeThemeName = DiffThemeName | typeof T3_CHAT_CODE_THEME_NAME;

const T3_CHAT_CODE_THEME = {
  name: T3_CHAT_CODE_THEME_NAME,
  type: "dark",
  colors: {
    "editor.background": T3_CHAT_CODE_THEME_BACKGROUND,
    "editor.foreground": T3_CHAT_CODE_THEME_FOREGROUND,
  },
  fg: T3_CHAT_CODE_THEME_FOREGROUND,
  bg: T3_CHAT_CODE_THEME_BACKGROUND,
  settings: [
    {
      settings: {
        foreground: T3_CHAT_CODE_THEME_FOREGROUND,
        background: T3_CHAT_CODE_THEME_BACKGROUND,
      },
    },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: {
        foreground: "#5c6370",
        fontStyle: "italic",
      },
    },
    {
      scope: [
        "keyword",
        "storage",
        "keyword.control",
        "keyword.operator.word",
        "keyword.control.directive",
        "keyword.other.directive",
        "meta.preprocessor",
        "punctuation.definition.directive",
      ],
      settings: {
        foreground: "#e06c75",
      },
    },
    {
      scope: [
        "storage.type",
        "support.type",
        "support.type.primitive",
        "entity.name.type",
        "entity.name.class",
        "entity.name.struct",
        "entity.name.enum",
        "entity.name.namespace",
      ],
      settings: {
        foreground: "#c678dd",
      },
    },
    {
      scope: [
        "string",
        "string.quoted",
        "string.quoted.other.lt-gt.include",
        "entity.name.filename",
      ],
      settings: {
        foreground: "#98c379",
      },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "variable.function",
        "meta.function-call",
        "variable",
        "variable.language",
        "variable.other.readwrite",
        "variable.other.object",
        "support.variable",
      ],
      settings: {
        foreground: "#61afef",
      },
    },
    {
      scope: [
        "constant.numeric",
        "constant.language",
        "constant.character.escape",
        "constant.other",
      ],
      settings: {
        foreground: "#c678dd",
      },
    },
    {
      scope: [
        "keyword.operator",
        "punctuation",
        "meta.brace",
        "meta.delimiter",
        "meta.separator",
      ],
      settings: {
        foreground: "#5c6370",
      },
    },
  ],
} as const satisfies ThemeRegistrationResolved;

let chatCodeThemesRegistered = false;

export function ensureChatCodeThemesRegistered(): void {
  if (chatCodeThemesRegistered) {
    return;
  }

  registerCustomTheme(T3_CHAT_CODE_THEME_NAME, () => Promise.resolve(T3_CHAT_CODE_THEME));
  chatCodeThemesRegistered = true;
}

ensureChatCodeThemesRegistered();

export const ALL_CHAT_CODE_THEME_NAMES = [
  ...ALL_DIFF_THEME_NAMES,
  T3_CHAT_CODE_THEME_NAME,
] as const satisfies readonly ChatCodeThemeName[];

export function resolveChatCodeThemeName(
  theme: "light" | "dark",
  activeCustomThemeId: AppliedCustomThemeId | null = null,
): ChatCodeThemeName {
  if (activeCustomThemeId === "t3-chat-theme") {
    return T3_CHAT_CODE_THEME_NAME;
  }

  return resolveDiffThemeName(theme, activeCustomThemeId);
}