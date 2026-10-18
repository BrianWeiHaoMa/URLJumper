import { expect, test } from 'vitest';
import { readDocument } from './grammar';
import { mappingOfPage } from './page-mapping';

const pageOf = (document: string, address: string) => mappingOfPage(readDocument(document).mappings, address)?.name;

test('the first mapping in document order whose URL is the address', () => {
  const document = 'news  https://n.example/\nstocks  https://s.example/\nportfolio  https://s.example/\n';
  expect(pageOf(document, 'https://s.example/')).toBe('stocks');
  expect(pageOf(document, 'https://n.example/')).toBe('news');
});

test('the URL must equal the address exactly: nothing is normalized', () => {
  const document = 'stocks  https://s.example/path\n';
  for (const address of ['https://s.example/path/', 'https://s.example/Path', 'HTTPS://s.example/path', 'https://s.example/path#top', ' https://s.example/path', '']) {
    expect(pageOf(document, address), address).toBeUndefined();
  }
});

test('a line the extension cannot read names no page', () => {
  // The second line repeats the first's name, so it is unreadable.
  expect(pageOf('a  https://a.example/\nA  https://s.example/\nnot a mapping\n', 'https://s.example/')).toBeUndefined();
});
