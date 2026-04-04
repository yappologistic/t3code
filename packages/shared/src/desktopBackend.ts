export const DESKTOP_BACKEND_READY_PREFIX = "[rowl-desktop-ready]";

export interface DesktopBackendReadyPayload {
  readonly port: number;
}

export function formatDesktopBackendReadyLine(input: DesktopBackendReadyPayload): string {
  return `${DESKTOP_BACKEND_READY_PREFIX}${JSON.stringify({ port: input.port })}`;
}

export function parseDesktopBackendReadyLine(line: string): DesktopBackendReadyPayload | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(DESKTOP_BACKEND_READY_PREFIX)) {
    return null;
  }

  const payloadText = trimmed.slice(DESKTOP_BACKEND_READY_PREFIX.length).trim();
  if (payloadText.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(payloadText) as { port?: unknown };
    const port = parsed.port;
    if (typeof port !== "number" || !Number.isInteger(port)) {
      return null;
    }
    if (port < 1 || port > 65535) {
      return null;
    }
    return { port };
  } catch {
    return null;
  }
}

export function createDesktopBackendWsUrl(input: {
  readonly port: number;
  readonly authToken: string;
}): string {
  return `ws://127.0.0.1:${input.port}/?token=${encodeURIComponent(input.authToken)}`;
}
