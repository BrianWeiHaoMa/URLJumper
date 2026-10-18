import { expect, test } from 'vitest';
import { readDocument } from './grammar';
import { formatNewLine, urlColumn } from './line-format';

const columnAfter = (document: string, after: number) => urlColumn(readDocument(document).lines, after);

test("the column is where the neighbor's URL starts, counted in code points from 1", () => {
  expect(columnAfter('gh\thttps://github.com/\n', 1)).toBe(4);
  expect(columnAfter('   a  https://x.example/\n', 1)).toBe(7);
  expect(columnAfter('😀😀 https://e.example/\n', 1)).toBe(4);
  expect(columnAfter('a  https://x\n', 1)).toBe(4);
});

test("the neighbor's URL is its last run before the comment, never an earlier copy of its text", () => {
  expect(columnAfter('https://x/ https://x/   \\ https://x/\n', 1)).toBe(12);
});

test('the nearest mapping line above, the line itself included, else below, else 22', () => {
  const document = '\\ A\nb  x:1\nbad\n\\ B\nlonger    y:2\n';
  expect(columnAfter(document, 3)).toBe(4);
  expect(columnAfter(document, 2)).toBe(4);
  expect(columnAfter(document, 1)).toBe(4);
  expect(columnAfter(document, 5)).toBe(11);
  expect(columnAfter('\\ only\nwhat  is  this\n', 2)).toBe(22);
  expect(columnAfter('', 0)).toBe(22);
  expect(columnAfter('\\ top\n\nb     y:2\n', 0)).toBe(7);
});

test('the name, spaces up to the column, and the URL; one space when the name leaves no room', () => {
  expect(formatNewLine({ name: 'a', url: 'u:1', note: '' }, 4)).toBe('a  u:1');
  expect(formatNewLine({ name: 'abc', url: 'u:1', note: '' }, 4)).toBe('abc u:1');
  expect(formatNewLine({ name: 'abcd', url: 'u:1', note: '' }, 4)).toBe('abcd u:1');
  expect(formatNewLine({ name: '😀', url: 'u:1', note: '' }, 22)).toBe(`😀${' '.repeat(20)}u:1`);
});

test('a note follows the URL after one space and a backslash and a space', () => {
  expect(formatNewLine({ name: 'a', url: 'u:1', note: 'see docs' }, 4)).toBe('a  u:1 \\ see docs');
});
