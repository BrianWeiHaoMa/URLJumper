import { expect, test } from 'vitest';
import { anchorAt, findAnchor } from './anchor';
import { readDocument } from './grammar';

const find = (document: string, number: number, text: string) => findAnchor(readDocument(document).lines, number, text);

test('the mapping line with the text at the number', () => {
  expect(find('a  x:1\nb  y:2\n', 2, 'b  y:2')).toBe(2);
});

test('else the single mapping line with the text, wherever it moved', () => {
  expect(find('\\ new\n\\ lines\na  x:1\nb  y:2\n', 2, 'b  y:2')).toBe(4);
  expect(find('b  y:2\n', 5, 'b  y:2')).toBe(1);
});

test('the exact text, without the line ending, whitespace included', () => {
  expect(find('b  y:2\r\n', 1, 'b  y:2')).toBe(1);
  expect(find('b  y:2 \n', 1, 'b  y:2')).toBeUndefined();
  expect(find('b   y:2\n', 1, 'b  y:2')).toBeUndefined();
});

test('never a line that is not a mapping line', () => {
  expect(find('what  is  this\n', 1, 'what  is  this')).toBeUndefined();
  expect(find('\\ heading\n', 1, '\\ heading')).toBeUndefined();
  expect(find('b  x:1\nb  y:2\n', 2, 'b  y:2')).toBeUndefined();
});

test("a line's anchor is its number and exact text from one read, for a mapping line alone", () => {
  expect(anchorAt('\\ top\na  x:1 \\ note\r\nb  y:2', 2)).toEqual({ line: 2, text: 'a  x:1 \\ note' });
  expect(anchorAt('\\ top\na  x:1\n', 1)).toBeUndefined();
  expect(anchorAt('a  x:1\na  y:2\n', 2)).toBeUndefined();
  expect(anchorAt('a  x:1\n', 3)).toBeUndefined();
});
