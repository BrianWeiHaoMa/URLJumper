import { expect, test } from 'vitest';
import { splitLines, textAreaLineStart } from './lines';

const rejoin = (document: string) => splitLines(document).map(({ text, ending }) => text + ending).join('');

test('LF and CRLF end lines, numbered from 1, and the text after the last break is a line', () => {
  const document = 'a https://a\r\nb https://b\nc https://c';
  expect(splitLines(document)).toEqual([
    { number: 1, text: 'a https://a', ending: '\r\n' },
    { number: 2, text: 'b https://b', ending: '\n' },
    { number: 3, text: 'c https://c', ending: '' },
  ]);
  expect(rejoin(document)).toBe(document);
});

test('a lone CR separates nothing', () => {
  expect(splitLines('a https://a\rb https://b')).toEqual([{ number: 1, text: 'a https://a\rb https://b', ending: '' }]);
});

test('a document ending with a break ends with an empty line', () => {
  expect(splitLines('a https://a\n')).toEqual([
    { number: 1, text: 'a https://a', ending: '\n' },
    { number: 2, text: '', ending: '' },
  ]);
  expect(splitLines('')).toEqual([{ number: 1, text: '', ending: '' }]);
});

test('a CR before CRLF stays in the line, and consecutive breaks make empty lines', () => {
  expect(splitLines('a\r\r\n\n\r\n')).toEqual([
    { number: 1, text: 'a\r', ending: '\r\n' },
    { number: 2, text: '', ending: '\n' },
    { number: 3, text: '', ending: '\r\n' },
    { number: 4, text: '', ending: '' },
  ]);
});

test('joining the lines gives back the document exactly', () => {
  for (const document of ['', '\n', '\r\n', '\r', 'x\r', '\\ h\r\nx https://x \\ n\n\n\t\r\ny https://y\r\n', 'a\n\r\nb\r\r\nc']) {
    expect(rejoin(document)).toBe(document);
  }
});

test("a line's start in a text area: each line before it counts its text and one character, whatever its ending", () => {
  const document = 'a  https://a/\r\nbb  https://b/\r\ncc  https://c/\r\n';
  const shown = document.replace(/\r\n?/g, '\n');
  for (const line of [1, 2, 3, 4]) {
    const start = textAreaLineStart(document, line);
    expect(start).toBe(shown.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0));
  }
  expect(textAreaLineStart(document, 3)).toBe(shown.indexOf('cc'));
});

test('a lone CR, which a text area shows as a break, keeps the line it is in: line 2 starts after it', () => {
  const document = 'x  https://x/\ry  https://y/\nlast  https://l/';
  expect(textAreaLineStart(document, 2)).toBe('x  https://x/\ny  https://y/\n'.length);
  // A CR before a CRLF is content too, and shown as a break of its own.
  expect(textAreaLineStart('a\r\r\nb', 2)).toBe('a\n\n'.length);
});

test('before the first line is the start; past the last line is the last line\'s start', () => {
  expect(textAreaLineStart('a\nb\nc', 0)).toBe(0);
  expect(textAreaLineStart('a\nb\nc', 1)).toBe(0);
  expect(textAreaLineStart('a\nb\nc', 999)).toBe(4);
  expect(textAreaLineStart('a\nb\n', 999)).toBe(4);
  expect(textAreaLineStart('', 5)).toBe(0);
});
