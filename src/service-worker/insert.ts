// Insert (G9, G13): one mapping line, validated, its name checked free, and placed against the document as
// this queued operation read it, so two inserts of one name can never both be stored.
import { insertMapping } from '../document/insertion';
import type { InsertReply, InsertRequest } from '../requests';
import { readStoredDocument, storeDocument } from './store-document';

export async function insert(request: InsertRequest): Promise<InsertReply> {
  const read = await readStoredDocument();
  const result = insertMapping(read.document, { name: request.name, url: request.url, note: request.note }, request.heading);
  if (result.kind !== 'applied') return result;
  await storeDocument(read, result.document);
  return { kind: 'applied', line: result.line, text: result.text, headingMissing: result.headingMissing };
}
