// Move (G12, G13): one mapping line, found again by its anchor in the document as this queued operation read
// it, cut and pasted past the neighbouring mapping line; a line changed or gone since, or a move the document
// no longer admits, stores nothing and replies with the stored text.
import { moveMapping } from '../document/moving';
import type { MoveReply, MoveRequest } from '../requests';
import { readStoredDocument, storeDocument } from './store-document';

export async function move(request: MoveRequest): Promise<MoveReply> {
  const read = await readStoredDocument();
  const result = moveMapping(read.document, request, request.direction);
  if (result.kind !== 'applied') return { kind: result.kind, document: read.document };
  await storeDocument(read, result.document);
  return { kind: 'applied', line: result.line, text: result.text, from: result.from };
}
