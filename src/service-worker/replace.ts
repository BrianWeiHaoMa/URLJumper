// A Text view's Save (G17, G18, G21, G22; Composition, *replace*): the whole document replaced by the text the
// view sent, exactly as sent, through the one write path, so the learned usage it leaves lands with it (R1).
// Only while the stored document is still the base the view loaded, so no save overwrites a change it did not
// see (G18); and only when the text has no F4 error, so no surface can store an unreadable line by skipping
// its own check (G17). Stored, the draft goes when the document now holds its text (G19).
import { documentErrors } from '../document/grammar';
import { splitLines } from '../document/lines';
import type { ReplaceReply, ReplaceRequest } from '../requests';
import { removeDraftStoredAs } from './draft';
import { readStoredDocument, storeDocument } from './store-document';

export async function replace({ text, base }: ReplaceRequest): Promise<ReplaceReply> {
  const read = await readStoredDocument();
  if (read.document !== base) return { kind: 'changed', document: read.document };
  const [error] = documentErrors(text);
  if (error) return { kind: 'invalid', ...error };
  await storeDocument(read, text);
  // In this operation and after the write, so a refused store keeps the draft and no *draft set* comes between
  // (How G19). Chrome refusing the removal leaves the Save applied, since its text is stored; the draft left
  // equals the stored document, and the next Text view that opens drops it.
  await removeDraftStoredAs(text).catch(() => undefined);
  return { kind: 'applied', text, first: 1, last: splitLines(text).length };
}
