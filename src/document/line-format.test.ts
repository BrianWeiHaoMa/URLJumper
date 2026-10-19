import { describe, expect, test } from 'vitest';
import { EXAMPLE_DOCUMENT } from './example';
import { readDocument } from './grammar';
import { formatNewLine, formatRewrittenLine, urlColumn } from './line-format';
import type { MappingFields } from './validation';

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

describe('a rewritten line keeps its own URL column and note column when the new values fit, else one space (F12)', () => {
  const rewritten = (text: string, fields: Partial<MappingFields>) => {
    const [line] = readDocument(text).lines;
    if (line?.kind !== 'mapping') throw new Error(`not a mapping line: ${text}`);
    return formatRewrittenLine(line, { name: line.mapping.name, url: line.mapping.url, note: line.mapping.note ?? '', ...fields });
  };

  test("F11's news line renamed: the URL and the note's first character stay in their columns", () => {
    const news = EXAMPLE_DOCUMENT.split('\n').find((line) => line.startsWith('news '))!;
    expect(rewritten(news, { name: 'hn' })).toBe(`hn  ${news.slice('news'.length)}`);
    expect(rewritten(news, { name: 'hn' }).indexOf('https://')).toBe(21);
  });

  test('a name too long for the URL column: one space; the note keeps its column while a space is left before its backslash', () => {
    const line = `n${' '.repeat(9)}u:1${' '.repeat(5)}\\ note`;
    expect(rewritten(line, { name: 'n'.repeat(10) })).toBe(`${'n'.repeat(10)} u:1${' '.repeat(4)}\\ note`);
    expect(rewritten(line, { name: 'n'.repeat(15) })).toBe(`${'n'.repeat(15)} u:1 \\ note`);
    expect(rewritten(line, { url: 'https://longer.example/' })).toBe(`n${' '.repeat(9)}https://longer.example/ \\ note`);
  });

  test('columns count code points: two emoji where the URL starts at column 22 leave 19 spaces', () => {
    expect(rewritten(`a${' '.repeat(20)}https://a.example/`, { name: '😀😀' })).toBe(`😀😀${' '.repeat(19)}https://a.example/`);
    expect(rewritten(`😀 u:1${' '.repeat(3)}\\ n`, { name: 'ab' })).toBe(`ab u:1  \\ n`);
  });

  test('a tab before the URL is one column; the rewritten line has spaces, the name at its start', () => {
    expect(rewritten('ab\thttps://a.example/', { name: 'x' })).toBe('x  https://a.example/');
    expect(rewritten('ab\thttps://a.example/', { name: 'abc' })).toBe('abc https://a.example/');
    expect(rewritten('   ab  https://a.example/', { name: 'x' })).toBe(`x${' '.repeat(6)}https://a.example/`);
  });

  test('a cleared note leaves the line ending at its URL; a note added where there was none follows the URL after one space', () => {
    expect(rewritten(`a  u:1${' '.repeat(6)}\\  old note`, { note: '' })).toBe('a  u:1');
    expect(rewritten('a  u:1', { note: 'new' })).toBe('a  u:1 \\ new');
    // A bare backslash is an empty note, which lends no column.
    expect(rewritten(`a  u:1${' '.repeat(6)}\\`, { note: 'new' })).toBe('a  u:1 \\ new');
  });

  test("the note's column is its first character's, wherever its backslash stood", () => {
    expect(rewritten('a  u:1    \\note', { note: 'other' })).toBe('a  u:1   \\ other');
    expect(rewritten('a  u:1    \\    note', { note: 'other' })).toBe('a  u:1       \\ other');
  });
});
