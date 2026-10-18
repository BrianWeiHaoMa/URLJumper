// Why the popup was opened: the record the service worker stores under `openIntent` just before it opens
// the popup, and the popup honors only for its own window and only while it is fresh (G5).
import type { JumpRequest } from './requests';

/**
 * What the popup is opened for, without the window and time the worker adds: search in New tab or This tab
 * mode, or the Name form for the page (`name-page`) or for a link on it (`name-link`), with the link's
 * address and its page's address and title as Chrome gave them.
 */
export type IntentSubject =
  | { kind: 'new-tab' | 'this-tab' | 'name-page' }
  | { kind: 'name-link'; linkUrl: string; pageUrl?: string; pageTitle?: string };

export type OpenIntentKind = IntentSubject['kind'];

/** Where a jump opens its mapping: a new tab, or the tab the popup was opened on. */
export type OpenMode = JumpRequest['mode'];

export type OpenIntent = IntentSubject & {
  /** The window the popup is opened for. */
  windowId: number;
  /** When it was written, in milliseconds since the Unix epoch. */
  time: number;
};

/** How long a record stays fresh. */
const LIFETIME_MS = 10_000;

/** Whether `intent`, read at `now`, was written within the last ten seconds. */
export function isFresh(intent: OpenIntent, now: number): boolean {
  const age = now - intent.time;
  return age >= 0 && age < LIFETIME_MS;
}

/** Whether `a` and `b` are the same record: the same window, written at the same time. */
export function sameIntent(a: Pick<OpenIntent, 'windowId' | 'time'>, b: OpenIntent): boolean {
  return a.windowId === b.windowId && a.time === b.time;
}

/**
 * The record the popup in window `windowId` honors, read from storage at `now`: one for that window, and
 * fresh. A record for another window, or an old one, is not honored (Composition, "Popup").
 */
export function intentFor(value: unknown, windowId: number | undefined, now: number): OpenIntent | undefined {
  return isOpenIntent(value) && value.windowId === windowId && isFresh(value, now) ? value : undefined;
}

/** The mode a popup starts in (G5): This tab only for an honored `this-tab` record; New tab for every other record and for none. */
export function startMode(intent: OpenIntent | undefined): OpenMode {
  return intent?.kind === 'this-tab' ? 'this-tab' : 'new-tab';
}

/** Whether `value`, as read from storage, is an intent record; a `name-link` record only with its link's address. */
export function isOpenIntent(value: unknown): value is OpenIntent {
  if (typeof value !== 'object' || value === null) return false;
  const { kind, windowId, time, linkUrl, pageUrl, pageTitle } = value as Record<string, unknown>;
  if (!Number.isInteger(windowId) || !Number.isFinite(time)) return false;
  if (kind === 'new-tab' || kind === 'this-tab' || kind === 'name-page') return true;
  return kind === 'name-link' && typeof linkUrl === 'string' && linkUrl !== '' && isOptionalText(pageUrl) && isOptionalText(pageTitle);
}

function isOptionalText(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}
