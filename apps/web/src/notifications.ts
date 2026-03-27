/**
 * Desktop/browser notification utilities.
 *
 * Uses the Web Notifications API which works in both browser and Electron.
 * Notifications are only shown when the setting is enabled and the window
 * is not focused (so they don't annoy users who are actively watching).
 */
import { getAppSettingsSnapshot } from "./appSettings";

const NOTIFICATION_AUTO_CLOSE_MS = 8_000;

function getNotificationCopy(language: string) {
  if (language === "fa") {
    return {
      title: "CUT3 — کار تمام شد",
    };
  }
  return {
    title: "CUT3 — Task Complete",
  };
}

/**
 * Request permission to show desktop notifications.
 *
 * Returns `true` if permission was granted, `false` otherwise.
 * Safe to call multiple times — returns immediately if already granted/denied.
 */
export function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return Promise.resolve(false);
  if (Notification.permission === "granted") return Promise.resolve(true);
  if (Notification.permission === "denied") return Promise.resolve(false);

  return Notification.requestPermission().then(
    (permission) => permission === "granted",
    () => false,
  );
}

/**
 * Check if notification permission is currently granted.
 */
export function isNotificationPermissionGranted(): boolean {
  if (typeof Notification === "undefined") return false;
  return Notification.permission === "granted";
}

/**
 * Show a desktop notification for a completed agent turn.
 *
 * Only fires when:
 * 1. `enableDesktopNotifications` is true in app settings
 * 2. Notification API is available and permission is granted
 * 3. The document is NOT focused (user is in another window/app)
 */
export function showTurnCompleteNotification(options: {
  threadTitle: string;
  messageSnippet: string;
  onClick?: () => void;
}): void {
  const settings = getAppSettingsSnapshot();
  if (!settings.enableDesktopNotifications) return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (document.hasFocus()) return;

  const { threadTitle, messageSnippet, onClick } = options;
  const copy = getNotificationCopy(settings.language);
  const body = threadTitle ? `${threadTitle}\n${messageSnippet}` : messageSnippet;

  try {
    const notification = new Notification(copy.title, {
      body: body.length > 200 ? `${body.slice(0, 197)}…` : body,
      silent: false,
    });

    if (onClick) {
      notification.addEventListener("click", () => {
        window.focus();
        onClick();
        notification.close();
      });
    }

    setTimeout(() => notification.close(), NOTIFICATION_AUTO_CLOSE_MS);
  } catch {
    // Notification creation can throw in restrictive environments.
  }
}
