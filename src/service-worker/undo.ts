// Undo (G15): reverses a single-line change only while its line still stands as the change left it, in the
// document as this queued operation read it, and, for a line put back, while its name is free of other lines;
// otherwise nothing is stored and the reply says why, with the stored text when the line no longer stands.
import { reinsertLine, undoInsert } from '../document/insertion';
import type { UndoReply, UndoRequest } from '../requests';
import { readStoredDocument, storeDocument } from './store-document';

export async function undo(request: UndoRequest): Promise<UndoReply> {
  const read = await readStoredDocument();
  const result = request.act === 'remove' ? undoInsert(read.document, request.line, request.text) : reinsertLine(read.document, request.line, request.text);
  if (result.kind === 'name-taken') return result;
  // A text that would not stand as one mapping line where it goes back is a line that no longer stands.
  if (result.kind !== 'applied') return { kind: 'stale', document: read.document };
  await storeDocument(read, result.document);
  return { kind: 'applied', line: result.line, text: result.text };
}
