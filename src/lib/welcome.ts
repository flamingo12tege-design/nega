/** Queued welcome announcement for a freshly registered member. */

const KEY = "cas.welcome.pending.v1";

export type QueuedWelcome = {
  credited: boolean;
  memberId: string;
  signedIn: boolean;
};

export function queueWelcome(data: QueuedWelcome) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...data, queuedAt: Date.now() }));
  } catch {
    // Ignore storage failures; registration still succeeds.
  }
}

export function getQueuedWelcome(): QueuedWelcome | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const queuedAt = Number(parsed["queuedAt"]);
    if (!Number.isFinite(queuedAt) || Date.now() - queuedAt > 30 * 60 * 1000) return null;

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

export function clearQueuedWelcome() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Ignore storage failures.
  }
}
