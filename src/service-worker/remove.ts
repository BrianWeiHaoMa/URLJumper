// Remove (G12, G13): one mapping line, found again by its anchor in the document as this queued operation
// read it; a line changed or gone since stores nothing and replies with the stored text.
import { removeMapping } from '../document/removal';
import type { RemoveReply, RemoveRequest } from '../requests';
import { readStoredDocument, storeDocument } from './store-document';

export async function remove(request: RemoveRequest): Promise<RemoveReply> {
  const read = await readStoredDocument();
  const result = removeMapping(read.document, request);
  if (result.kind !== 'applied') return { kind: 'stale', document: read.document };
  await storeDocument(read, result.document);
  return { kind: 'applied', line: result.line, text: result.text };
}
