// Why the popup was opened: the record the service worker stores under `openIntent` just before it opens
// the popup, and the popup honors only for its own window and only while it is fresh (G5).

export type OpenIntentKind = 'new-tab' | 'this-tab';

export interface OpenIntent {
  kind: OpenIntentKind;
  /** The window the popup is opened for. */
  windowId: number;
  /** When it was written, in milliseconds since the Unix epoch. */
  time: number;
}

/** How long a record stays fresh. */
const LIFETIME_MS = 10_000;

/** Whether `intent`, read at `now`, was written within the last ten seconds. */
export function isFresh(intent: OpenIntent, now: number): boolean {
  const age = now - intent.time;
  return age >= 0 && age < LIFETIME_MS;
}

/** Whether `value`, as read from storage, is an intent record. */
export function isOpenIntent(value: unknown): value is OpenIntent {
  if (typeof value !== 'object' || value === null) return false;
  const { kind, windowId, time } = value as Record<string, unknown>;
  return (kind === 'new-tab' || kind === 'this-tab') && Number.isInteger(windowId) && Number.isFinite(time);
}
