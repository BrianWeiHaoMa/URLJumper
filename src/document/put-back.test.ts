import { describe, expect, test } from 'vitest';
import { reinsertLine, restoreLine } from './put-back';
import { rewriteMapping } from './rewriting';

const STOCKS = 'stocks               https://s.example/';

describe("a line put back where a change took it away: its text as it was, once its name is free (G15)", () => {
  test('the text goes back as it was, its columns and note kept, not formatted again', () => {
    expect(reinsertLine('a  x:1\nc  z:3\n', 2, '  b\ty:2    \\  its note ')).toEqual({
      kind: 'applied',
      document: 'a  x:1\n  b\ty:2    \\  its note \nc  z:3\n',
      line: 2,
      text: '  b\ty:2    \\  its note ',
    });
  });

  test('into a document now shorter than the line before it: after the last line, the empty one a final break leaves included, saying what that line was given', () => {
    expect(reinsertLine('a  x:1', 5, 'b  y:2')).toEqual({ kind: 'applied', document: 'a  x:1\nb  y:2', line: 2, text: 'b  y:2', endingGiven: { text: 'a  x:1', ending: '\n' } });
    expect(reinsertLine('a  x:1\r\nc  z:3', 9, 'b  y:2')).toEqual({ kind: 'applied', document: 'a  x:1\r\nc  z:3\r\nb  y:2', line: 3, text: 'b  y:2', endingGiven: { text: 'c  z:3', ending: '\r\n' } });
    expect(reinsertLine('a  x:1\n', 9, 'b  y:2')).toEqual({ kind: 'applied', document: 'a  x:1\n\nb  y:2', line: 3, text: 'b  y:2', endingGiven: { text: '', ending: '\n' } });
    expect(reinsertLine('', 3, 'b  y:2')).toEqual({ kind: 'applied', document: '\nb  y:2', line: 2, text: 'b  y:2', endingGiven: { text: '', ending: '\n' } });
    // With exactly line − 1 lines it is the new last line, still at its number.
    expect(reinsertLine('a  x:1\nc  z:3', 3, 'b  y:2')).toEqual({ kind: 'applied', document: 'a  x:1\nc  z:3\nb  y:2', line: 3, text: 'b  y:2', endingGiven: { text: 'c  z:3', ending: '\n' } });
  });

  test("a name another mapping line now has, in any case, is taken: that line's number, nothing written", () => {
    expect(reinsertLine('z  q:0\nnot a mapping\nSTOCKS  https://t.example/\n', 2, STOCKS)).toEqual({ kind: 'name-taken', line: 3 });
    // A later line with the name counts as much as an earlier one: putting the text back would make it unreadable.
    expect(reinsertLine('z  q:0\nStocks  https://t.example/\n', 1, STOCKS)).toEqual({ kind: 'name-taken', line: 2 });
    // A lone surrogate is checked as the U+FFFD it is stored as.
    expect(reinsertLine('a�  y:2\n', 2, 'a\uD800  x:1')).toEqual({ kind: 'name-taken', line: 1 });
    expect(reinsertLine('', 1, 'a\uD800  x:1')).toEqual({ kind: 'applied', document: 'a�  x:1\n', line: 1, text: 'a�  x:1' });
  });

  test('a name only an unreadable line has is free, and that line stays as it was', () => {
    expect(reinsertLine('stocks notaurl\n', 1, STOCKS)).toEqual({ kind: 'applied', document: `${STOCKS}\nstocks notaurl\n`, line: 1, text: STOCKS });
  });

  test('a text that is not one mapping line where it lands is refused: a comment, a blank, two lines, an unreadable line', () => {
    for (const text of ['\\ Work', '', '   ', 'a  x:1\nb  y:2', 'a  x:1\r\n', 'what  is  this', 'stocks', 'b  y:2\r\nc  z:3']) {
      expect(reinsertLine('a  x:1\nc  z:3\n', 2, text), JSON.stringify(text)).toEqual({ kind: 'unreadable' });
    }
  });

  test('a text ending in a lone CR stands only as the last line: before another it would read with the ending as CRLF', () => {
    expect(reinsertLine('a  x:1\nc  z:3\n', 2, 'b  y:2\r')).toEqual({ kind: 'unreadable' });
    expect(reinsertLine('a  x:1', 2, 'b  y:2\r')).toEqual({ kind: 'applied', document: 'a  x:1\nb  y:2\r', line: 2, text: 'b  y:2\r', endingGiven: { text: 'a  x:1', ending: '\n' } });
  });
});

describe("a rewritten line's former text restored in its place, once its name is free of other lines (G15)", () => {
  const ORIGINAL = '\\ Money\n  Stocks\t https://s.example/   \\  its note \r\nz  z:1\n';
  const FORMER = '  Stocks\t https://s.example/   \\  its note ';

  test('a rewrite, then its restore, gives back the document exactly, odd spacing and all; the restore\'s own restore gives back the rewrite', () => {
    const rewritten = rewriteMapping(ORIGINAL, { line: 2, text: FORMER }, { name: 'shares', url: 'https://t.example/', note: '' });
    if (rewritten.kind !== 'applied') throw new Error(rewritten.kind);
    expect(rewritten.document).toBe('\\ Money\nshares    https://t.example/\r\nz  z:1\n');

    const restored = restoreLine(rewritten.document, { line: rewritten.line, text: rewritten.text }, FORMER);
    expect(restored).toEqual({ kind: 'applied', document: ORIGINAL, line: 2, text: FORMER });
    expect(restoreLine(ORIGINAL, { line: 2, text: FORMER }, rewritten.text)).toEqual({ kind: 'applied', document: rewritten.document, line: 2, text: rewritten.text });
  });

  test('the line is found by its text when lines were added above it since; its own name, in any case, is free', () => {
    const now = '\\ top\n\\ Money\nSTOCKS   https://s.example/\r\nz  z:1\n';
    expect(restoreLine(now, { line: 2, text: 'STOCKS   https://s.example/' }, FORMER)).toEqual({
      kind: 'applied',
      document: `\\ top\n\\ Money\n${FORMER}\r\nz  z:1\n`,
      line: 3,
      text: FORMER,
    });
  });

  test("a name another mapping line has now, in any case, is taken: that line's number, nothing written", () => {
    const now = '\\ Money\nshares   https://t.example/\r\nz  z:1\nSTOCKS  https://u.example/\n';
    expect(restoreLine(now, { line: 2, text: 'shares   https://t.example/' }, FORMER)).toEqual({ kind: 'name-taken', line: 4 });
    // As Chrome stores it, a lone surrogate is U+FFFD.
    expect(restoreLine('a�  y:2\nb  x:1\n', { line: 2, text: 'b  x:1' }, 'a\uD800  x:1')).toEqual({ kind: 'name-taken', line: 1 });
    expect(restoreLine('b  x:1\n', { line: 1, text: 'b  x:1' }, 'a\uD800  x:1')).toEqual({ kind: 'applied', document: 'a�  x:1\n', line: 1, text: 'a�  x:1' });
  });

  test('a name only an unreadable line has is free', () => {
    expect(restoreLine('b  x:1\nstocks notaurl\n', { line: 1, text: 'b  x:1' }, STOCKS)).toEqual({ kind: 'applied', document: `${STOCKS}\nstocks notaurl\n`, line: 1, text: STOCKS });
  });

  test('a line no longer as the rewrite left it is stale: changed, gone, or now unreadable', () => {
    expect(restoreLine('\\ Money\nshares   https://other.example/\nz  z:1\n', { line: 2, text: 'shares   https://t.example/' }, FORMER)).toEqual({ kind: 'stale' });
    expect(restoreLine('z  z:1\n', { line: 2, text: 'shares   https://t.example/' }, FORMER)).toEqual({ kind: 'stale' });
    expect(restoreLine('shares  q:1\nshares   https://t.example/\n', { line: 2, text: 'shares   https://t.example/' }, FORMER)).toEqual({ kind: 'stale' });
  });

  test('a former text that would not read in its place as one mapping line with exactly that text is refused', () => {
    for (const text of ['\\ Work', '', 'a  x:1\nb  y:2', 'what  is  this', 'b  y:2\r']) {
      expect(restoreLine('a  x:1\nc  z:3\n', { line: 1, text: 'a  x:1' }, text), JSON.stringify(text)).toEqual({ kind: 'unreadable' });
    }
    // As the last line, a text ending in a lone CR stands as it is.
    expect(restoreLine('a  x:1\nc  z:3', { line: 2, text: 'c  z:3' }, 'c  z:3\r')).toEqual({ kind: 'applied', document: 'a  x:1\nc  z:3\r', line: 2, text: 'c  z:3\r' });
  });
});
