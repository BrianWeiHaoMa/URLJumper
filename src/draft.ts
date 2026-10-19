// The Text view's unsaved text as the service worker keeps it under `draft` (G19; State): one draft, the most
// recent edit, with the base it was typed against, when it was made, and which edit it is. The worker writes
// it on *draft set* and removes it on *draft discard* or once a *replace* stored its text; the Text views and
// Import read it to offer it back or to ask before replacing it.

/** Which edit a draft is: the identifier of the Text view that sent it, random for each Text view opened, and the number that view raised for it. */
export interface DraftName {
  view: string;
  number: number;
}

export interface Draft extends DraftName {
  /** What the text area held. */
  text: string;
  /** The stored document as the view loaded it, which the text was typed against (G18). */
  base: string;
  /** When the edit was made, in the page, in milliseconds since the Unix epoch. */
  time: number;
}

/** Whether `value`, as read from storage or received by the worker, holds a draft's fields. */
export function isDraft(value: unknown): value is Draft {
  if (!isDraftName(value)) return false;
  const { text, base, time } = value as unknown as Record<string, unknown>;
  return typeof text === 'string' && typeof base === 'string' && Number.isFinite(time);
}

/** Whether `value` names a draft: a view's identifier and a number from 1. */
export function isDraftName(value: unknown): value is DraftName {
  if (typeof value !== 'object' || value === null) return false;
  const { view, number } = value as Record<string, unknown>;
  return typeof view === 'string' && view !== '' && Number.isInteger(number) && (number as number) >= 1;
}

/** The name of `draft`, which a discard of it gives. */
export function nameOf(draft: DraftName): DraftName {
  return { view: draft.view, number: draft.number };
}

/**
 * Whether a draft made at `time` is stored over `stored` (Composition, *draft set*): unless `stored` holds a
 * newer time, so a late write never overtakes a newer edit. Edits within the same millisecond are equally
 * recent, and the later to arrive is kept.
 */
export function keepsArrival(stored: Draft | undefined, { time }: Pick<Draft, 'time'>): boolean {
  return stored === undefined || stored.time <= time;
}

/** Whether `stored` is the draft `name` names, by both its view and its number (Composition, *draft discard*). */
export function isNamed(stored: Draft | undefined, name: DraftName): boolean {
  return stored !== undefined && stored.view === name.view && stored.number === name.number;
}

/**
 * Whether the stored `document` holds `text`, so a draft of it is no unsaved change (G19). Exact equality,
 * CRLF and all, the comparison *replace*'s base check makes: a CRLF document's LF rendering, which a text area
 * gives (S14), is a change, since saving it would change the stored bytes.
 */
export function documentHolds(document: string, text: string): boolean {
  return document === text;
}

/** When a draft was typed, as the views say it, in English (N11). */
export function typedAt(draft: Pick<Draft, 'time'>): string {
  return new Date(draft.time).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });
}
