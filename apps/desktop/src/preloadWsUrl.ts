const DESKTOP_WS_URL_ARG_PREFIX = "--rowl-desktop-ws-url=";

export function resolveInitialDesktopWsUrl(args: {
  envValue: string | null | undefined;
  argv: readonly string[];
}): string | null {
  const envValue = args.envValue?.trim() ?? "";
  if (envValue.length > 0) {
    return envValue;
  }

  for (const arg of args.argv) {
    if (!arg.startsWith(DESKTOP_WS_URL_ARG_PREFIX)) {
      continue;
    }

    const value = arg.slice(DESKTOP_WS_URL_ARG_PREFIX.length).trim();
    return value.length > 0 ? value : null;
  }

  return null;
}
