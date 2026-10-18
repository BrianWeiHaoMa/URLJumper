import { expect, test } from 'vitest';
import { EXAMPLE_DOCUMENT, isEmptyDocument, loadExample } from './example';
import { readDocument } from './grammar';
import { findSections } from './sections';

test('the example is twelve lines with LF endings and a final break, every one readable', () => {
  expect(EXAMPLE_DOCUMENT.endsWith('\n')).toBe(true);
  expect(EXAMPLE_DOCUMENT).not.toContain('\r');
  const { lines, mappings } = readDocument(EXAMPLE_DOCUMENT);
  expect(lines).toHaveLength(13);
  expect(lines.filter((line) => line.kind === 'unreadable')).toEqual([]);
  expect(mappings.map(({ name }) => name)).toEqual(['mail', 'cal', 'news', 'g', 'yt', 'wiki', 'team calendar']);
  expect(findSections(lines)).toHaveLength(3);
});

test('a document is empty when it holds nothing but whitespace as \\s matches it', () => {
  for (const document of ['', ' ', '\n', ' \n\t\n', '\r\n', ' 　']) expect(isEmptyDocument(document), JSON.stringify(document)).toBe(true);
  for (const document of ['\\ notes\n', 'x', ' a  x:1']) expect(isEmptyDocument(document), JSON.stringify(document)).toBe(false);
});

test('the example is loaded only into an empty document, and writes lines 1 to 12', () => {
  expect(loadExample('')).toEqual({ kind: 'applied', document: EXAMPLE_DOCUMENT, first: 1, last: 12 });
  expect(loadExample(' \n\t\n')).toEqual({ kind: 'applied', document: EXAMPLE_DOCUMENT, first: 1, last: 12 });
  expect(loadExample('\\ notes\n')).toEqual({ kind: 'not-empty' });
  expect(loadExample('a  x:1\n')).toEqual({ kind: 'not-empty' });
});
