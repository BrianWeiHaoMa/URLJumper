import { expect, test } from 'vitest';
import { documentLineEnding, insertLineAfter, removeInsertedLine } from './line-edits';
import { splitLines } from './lines';

test("the document's line ending is CRLF when its first break is, else LF, LF too with no break", () => {
  expect(documentLineEnding(splitLines('a\r\nb\nc'))).toBe('\r\n');
  expect(documentLineEnding(splitLines('a\nb\r\nc'))).toBe('\n');
  expect(documentLineEnding(splitLines('a'))).toBe('\n');
  expect(documentLineEnding(splitLines('a\r'))).toBe('\n');
  expect(documentLineEnding(splitLines('a\r\r\nb'))).toBe('\r\n');
});

test('a line inserted before another takes the document ending, and every line keeps its own', () => {
  expect(insertLineAfter(splitLines('a\r\nb\nc\r\n'), 1, 'new')).toBe('a\r\nnew\r\nb\nc\r\n');
  expect(insertLineAfter(splitLines('a\nb'), 0, 'new')).toBe('new\na\nb');
  expect(insertLineAfter(splitLines(''), 0, 'new')).toBe('new\n');
});

test('a line inserted after the last: that line gains the document ending and the new one has none', () => {
  expect(insertLineAfter(splitLines('a\r\nb'), 2, 'new')).toBe('a\r\nb\r\nnew');
  expect(insertLineAfter(splitLines('a'), 1, 'new')).toBe('a\nnew');
  expect(insertLineAfter(splitLines('a\r'), 1, 'new')).toBe('a\r\nnew');
});

test('a removed line that is not last goes with its own ending', () => {
  expect(removeInsertedLine(splitLines('a\r\nnew\nb'), 2)).toBe('a\r\nb');
  expect(removeInsertedLine(splitLines('new\n'), 1)).toBe('');
});

test('a removed last line: the line before loses the ending the insert gave it, the document ending before the insert', () => {
  expect(removeInsertedLine(splitLines('a\nnew'), 2)).toBe('a');
  expect(removeInsertedLine(splitLines('a\r\nb\r\nnew'), 3)).toBe('a\r\nb');
  // Its text ended in a lone CR, which reads with the LF the insert gave as one CRLF ending: the CR stays.
  expect(removeInsertedLine(splitLines('a\r\nnew'), 2)).toBe('a\r');
  expect(removeInsertedLine(splitLines('a\nb\r\nnew'), 3)).toBe('a\nb\r');
  // An LF where the document ending is CRLF was not the insert's to give; a last line ends without a break.
  expect(removeInsertedLine(splitLines('a\r\nb\nnew'), 3)).toBe('a\r\nb');
  expect(removeInsertedLine(splitLines('new'), 1)).toBe('');
});
