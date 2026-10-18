import { expect, test } from 'vitest';
import { splitLines } from './lines';

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
