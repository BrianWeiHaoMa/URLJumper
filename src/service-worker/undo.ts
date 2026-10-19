// Undo (G15): reverses a single-line change only while its line still stands as the change left it, in the
// document as this queued operation read it, and, for a line put back or restored, while its name is free of
// other lines; otherwise nothing is stored and the reply says why, with the stored text when the line no
// longer stands.
import { reinsertLine, restoreLine } from '../document/put-back';
import { removeMapping } from '../document/removal';
import type { UndoReply, UndoRequest } from '../requests';
import { readStoredDocument, storeDocument } from './store-document';

export async function undo(request: UndoRequest): Promise<UndoReply> {
  const read = await readStoredDocument();
  const result = act(read.document, request);
  if (result.kind === 'name-taken') return result;
  // A text that would not stand as one mapping line where it goes back is a line that no longer stands.
  if (result.kind !== 'applied') return { kind: 'stale', document: read.document };
  await storeDocument(read, result.document);
  const { document: _, ...reply } = result;
  return reply;
}

function act(document: string, request: UndoRequest) {
  switch (request.act) {
    case 'remove':
      return removeMapping(document, request, request.endingGiven);
    case 'reinsert':
      return reinsertLine(document, request.line, request.text);
    case 'restore':
      return restoreLine(document, request, request.former);
  }
}
