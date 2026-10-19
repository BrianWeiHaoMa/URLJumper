// The draft (G19; Composition, *draft set*, *draft discard*, *replace*; State `draft`): the one unsaved Text
// view edit the worker keeps, written and removed only here (R1), each time on the one queue, so no other
// request's write lands between its read of `draft` and the write it makes from it.
import { documentHolds, isDraft, isNamed, keepsArrival, type Draft } from '../draft';
import type { DraftDiscardReply, DraftDiscardRequest, DraftSetReply, DraftSetRequest } from '../requests';

/** Stores the edit sent as `draft`, unless the stored draft is newer. */
export async function setDraft({ text, base, time, view, number }: DraftSetRequest): Promise<DraftSetReply> {
  const stored = await readDraft();
  const draft: Draft = { text, base, time, view, number };
  if (keepsArrival(stored, draft)) await chrome.storage.local.set({ draft });
  return { kind: 'done' };
}

/** Removes `draft` only while it is the edit named and, given `ifStored`, while the stored document is that text. */
export async function discardDraft({ view, number, ifStored }: DraftDiscardRequest): Promise<DraftDiscardReply> {
  const { draft, mappings } = await chrome.storage.local.get(['draft', 'mappings']);
  if (ifStored !== undefined && !documentHolds(typeof mappings === 'string' ? mappings : '', ifStored)) return { kind: 'changed' };
  if (isDraft(draft) && isNamed(draft, { view, number })) await chrome.storage.local.remove('draft');
  return { kind: 'done' };
}

/** After *replace* stored `text`: removes `draft` when its text is that text, which the stored document now holds. */
export async function removeDraftStoredAs(text: string): Promise<void> {
  const stored = await readDraft();
  if (stored !== undefined && documentHolds(text, stored.text)) await chrome.storage.local.remove('draft');
}

async function readDraft(): Promise<Draft | undefined> {
  const { draft } = await chrome.storage.local.get('draft');
  return isDraft(draft) ? draft : undefined;
}
