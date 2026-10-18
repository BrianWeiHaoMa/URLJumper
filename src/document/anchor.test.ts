import { expect, test } from 'vitest';
import { findAnchor } from './anchor';
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
