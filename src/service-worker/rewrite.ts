// Rewrite (G12, G13, G14): one mapping line, found again by its anchor in the document as this queued
// operation read it, its values re-validated there whatever the page checked, and written by F12 in its
// own columns; a line changed or gone since stores nothing and replies with the stored text.
import { rewriteMapping } from '../document/rewriting';
import type { RewriteReply, RewriteRequest } from '../requests';
import { readStoredDocument, storeDocument } from './store-document';

export async function rewrite(request: RewriteRequest): Promise<RewriteReply> {
  const read = await readStoredDocument();
  const result = rewriteMapping(read.document, request, { name: request.name, url: request.url, note: request.note });
  if (result.kind === 'stale') return { kind: 'stale', document: read.document };
  if (result.kind !== 'applied') return result;
  await storeDocument(read, result.document);
  return { kind: 'applied', line: result.line, text: result.text };
}
