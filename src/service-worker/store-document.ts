// The one write path of the document (R1): every write of `mappings` goes through `storeDocument`, which puts
// the recomputed `usage` in the same `set`, so the two land together or not at all (S1). Both are computed
// from what the same queued operation read with `readStoredDocument`, so no other write lands in between.
import { usageAfterWrite, type Usage } from '../document/score';

export interface StoredDocument {
  /** The stored document; the empty string when absent. */
  document: string;
  usage: Usage | undefined;
}

export async function readStoredDocument(): Promise<StoredDocument> {
  const { mappings, usage } = await chrome.storage.local.get(['mappings', 'usage']);
  return { document: typeof mappings === 'string' ? mappings : '', usage: usage as Usage | undefined };
}

/** Stores `document` in place of `read`'s, with the usage it leaves (creation and pruning, P3). Rejects as Chrome's `set` does. */
export async function storeDocument(read: StoredDocument, document: string): Promise<void> {
  await chrome.storage.local.set({ mappings: document, usage: usageAfterWrite(read.usage, read.document, document, Date.now()) });
}
