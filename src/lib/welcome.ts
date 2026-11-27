/** Queued welcome announcement for a freshly registered member. */

const KEY = "cas.welcome.pending.v2";
const LEGACY_KEY = "cas.welcome.pending.v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Fired after a welcome is queued so the always-mounted root can show it. */
export const WELCOME_QUEUED_EVENT = "cas:welcome-queued";

export type QueuedWelcome = {
  credited: boolean;
  memberId: string;
  signedIn: boolean;
};

export function queueWelcome(data: QueuedWelcome) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, queuedAt: Date.now() }));
    // Drop any older copy so the announcement can never show twice.
    sessionStorage.removeItem(LEGACY_KEY);
  } catch {
    // Ignore storage failures; registration still succeeds.
  }

  // The registration page is often unmounted by the auth redirect before the
  // queue write finishes. The root listens for this event and shows the modal
  // itself, so the announcement is never lost to that race.
  try {
    window.dispatchEvent(new Event(WELCOME_QUEUED_EVENT));
  } catch {
    // Non-browser environments (SSR) simply skip the event.
  }
}

function parse(raw: string | null): QueuedWelcome | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const queuedAt = Number(parsed["queuedAt"]);
    if (!Number.isFinite(queuedAt) || Date.now() - queuedAt > MAX_AGE_MS) return null;

    const memberId = String(parsed["memberId"] ?? "");
    if (!memberId) return null;

    return {
      credited: parsed["credited"] === true,
      memberId,
      signedIn: parsed["signedIn"] === true,
    };
  } catch {
    return null;
  }
}

export function getQueuedWelcome(): QueuedWelcome | null {
  try {
    return parse(localStorage.getItem(KEY)) ?? parse(sessionStorage.getItem(LEGACY_KEY));
  } catch {
    return null;
  }
}

export function clearQueuedWelcome() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(LEGACY_KEY);
  } catch {
    // Ignore storage failures.
  }
}
