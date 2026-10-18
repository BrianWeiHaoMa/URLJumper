// Load example mappings (G30, F11): the example document, stored only while the document is absent or holds
// only whitespace, so it never replaces anything the user wrote (G22).
import { loadExample } from '../document/example';
import type { LoadExampleReply } from '../requests';
import { readStoredDocument, storeDocument } from './store-document';

export async function loadExampleDocument(): Promise<LoadExampleReply> {
  const read = await readStoredDocument();
  const result = loadExample(read.document);
  if (result.kind === 'not-empty') return result;
  await storeDocument(read, result.document);
  return { kind: 'applied', text: result.document, first: result.first, last: result.last };
}
