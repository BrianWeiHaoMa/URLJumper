// Undo (G15): reverses a single-line change only while its line still stands as the change left it, in the
// document as this queued operation read it; otherwise nothing is stored and the reply gives the stored text.
import { undoInsert } from '../document/insertion';
import type { UndoReply, UndoRequest } from '../requests';
import { readStoredDocument, storeDocument } from './store-document';

export async function undo(request: UndoRequest): Promise<UndoReply> {
  const read = await readStoredDocument();
  const result = undoInsert(read.document, request.line, request.text);
  if (result.kind === 'stale') return { kind: 'stale', document: read.document };
  await storeDocument(read, result.document);
  return { kind: 'applied', line: result.line, text: result.text };
}
