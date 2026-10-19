import { expect, test } from 'vitest';
import { documentLineEnding, insertLineAfter, moveLine, removeLine, replaceLine } from './line-edits';
import { splitLines } from './lines';

test("the document's line ending is CRLF when its first break is, else LF, LF too with no break", () => {
  expect(documentLineEnding(splitLines('a\r\nb\nc'))).toBe('\r\n');
  expect(documentLineEnding(splitLines('a\nb\r\nc'))).toBe('\n');
  expect(documentLineEnding(splitLines('a'))).toBe('\n');
  expect(documentLineEnding(splitLines('a\r'))).toBe('\n');
  expect(documentLineEnding(splitLines('a\r\r\nb'))).toBe('\r\n');
});

test('a line inserted before another takes the document ending, and every line keeps its own', () => {
  expect(insertLineAfter(splitLines('a\r\nb\nc\r\n'), 1, 'new')).toEqual({ document: 'a\r\nnew\r\nb\nc\r\n' });
  expect(insertLineAfter(splitLines('a\nb'), 0, 'new')).toEqual({ document: 'new\na\nb' });
  expect(insertLineAfter(splitLines(''), 0, 'new')).toEqual({ document: 'new\n' });
});

test('a line inserted after the last: that line gains the document ending, given back with what it was, and the new one has none', () => {
  expect(insertLineAfter(splitLines('a\r\nb'), 2, 'new')).toEqual({ document: 'a\r\nb\r\nnew', endingGiven: { text: 'b', ending: '\r\n' } });
  expect(insertLineAfter(splitLines('a'), 1, 'new')).toEqual({ document: 'a\nnew', endingGiven: { text: 'a', ending: '\n' } });
  expect(insertLineAfter(splitLines('a\r'), 1, 'new')).toEqual({ document: 'a\r\nnew', endingGiven: { text: 'a\r', ending: '\n' } });
  expect(insertLineAfter(splitLines('a\n'), 2, 'new')).toEqual({ document: 'a\n\nnew', endingGiven: { text: '', ending: '\n' } });
});

test('a removed line that is not last goes with its own ending, never the next line\'s', () => {
  expect(removeLine(splitLines('a\r\nnew\nb'), 2)).toBe('a\r\nb');
  expect(removeLine(splitLines('new\n'), 1)).toBe('');
  expect(removeLine(splitLines('a a:1\r\nb b:1\nc c:1'), 1)).toBe('b b:1\nc c:1');
  expect(removeLine(splitLines('a a:1\nb b:1\n'), 2)).toBe('a a:1\n');
  // What a change gave a last line counts only when the line removed is last.
  expect(removeLine(splitLines('a\r\nnew\nb'), 2, { text: 'a\r', ending: '\n' })).toBe('a\r\nb');
});

test('a removed last line: the line before becomes last and loses its whole ending', () => {
  expect(removeLine(splitLines('a a:1\r\nb b:1\nc c:1'), 3)).toBe('a a:1\r\nb b:1');
  expect(removeLine(splitLines('a a:1\nb b:1\r\nc c:1'), 3)).toBe('a a:1\nb b:1');
  expect(removeLine(splitLines('a\nnew'), 2)).toBe('a');
  expect(removeLine(splitLines('a\r\nnew'), 2)).toBe('a');
  expect(removeLine(splitLines('new'), 1)).toBe('');
});

test('a removed last line given what a change gave the line before: exactly that goes, whatever the first break is now', () => {
  expect(removeLine(splitLines('a\nnew'), 2, { text: 'a', ending: '\n' })).toBe('a');
  expect(removeLine(splitLines('a\r\nb\r\nnew'), 3, { text: 'b', ending: '\r\n' })).toBe('a\r\nb');
  // Its text ended in a lone CR, which read with the LF it was given as one CRLF ending: the CR stays.
  expect(removeLine(splitLines('a\r\nnew'), 2, { text: 'a\r', ending: '\n' })).toBe('a\r');
  expect(removeLine(splitLines('a\nb\r\nnew'), 3, { text: 'b\r', ending: '\n' })).toBe('a\nb\r');
  // The first break is LF now, but the change gave CRLF: CRLF goes.
  expect(removeLine(splitLines('a\nb\r\nnew'), 3, { text: 'b', ending: '\r\n' })).toBe('a\nb');
  // The line before is not the one the change gave an ending to: its own whole ending goes.
  expect(removeLine(splitLines('z\nq\r\nnew'), 3, { text: 'p', ending: '\n' })).toBe('z\nq');
  expect(removeLine(splitLines('a\r\nb\nnew'), 3, { text: 'b', ending: '\r\n' })).toBe('a\r\nb');
});

test('a moved line keeps its own ending, and every other line its own, while neither it nor its place is last', () => {
  expect(moveLine(splitLines('a\r\nb\nc\r\nd'), 1, 3)).toBe('b\nc\r\na\r\nd');
  expect(moveLine(splitLines('a\r\nb\nc\r\nd'), 3, 1)).toBe('c\r\na\r\nb\nd');
  // The empty line a final line break leaves stays last.
  expect(moveLine(splitLines('a\nb\r\n'), 1, 2)).toBe('b\r\na\n');
  expect(moveLine(splitLines('a\nb\r\n'), 2, 2)).toBe('a\nb\r\n');
});

test('a last line moved up gains the document ending, and the line that becomes last loses its own', () => {
  expect(moveLine(splitLines('x\r\ny\nz'), 3, 2)).toBe('x\r\nz\r\ny');
  expect(moveLine(splitLines('x\ny\r\nz'), 3, 1)).toBe('z\nx\ny');
});

test("a line moved to last loses its own ending, and the old last line gains the document's, not the moved line's", () => {
  expect(moveLine(splitLines('a\nb\r\nc'), 2, 3)).toBe('a\nc\nb');
  // The document's ending is read before the move: the moved line held its first break.
  expect(moveLine(splitLines('a\r\nb'), 1, 2)).toBe('b\r\na');
  expect(moveLine(splitLines('a\nb\r\nc\nd'), 1, 4)).toBe('b\r\nc\nd\na');
});

test('a replaced line keeps its own ending, and every other line its own', () => {
  expect(replaceLine(splitLines('a  u:1\nb  v:2\r\nc  w:3'), 2, 'x  v:2')).toBe('a  u:1\nx  v:2\r\nc  w:3');
  expect(replaceLine(splitLines('a  u:1\nb  v:2\r\nc  w:3'), 3, 'x  w:3')).toBe('a  u:1\nb  v:2\r\nx  w:3');
  expect(replaceLine(splitLines('a  u:1\n'), 1, 'x  u:1')).toBe('x  u:1\n');
});
