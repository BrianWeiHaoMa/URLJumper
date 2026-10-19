import { describe, expect, test } from 'vitest';
import { insertMapping } from './insertion';
import { reinsertLine } from './put-back';
import { removeMapping } from './removal';

const STOCKS = 'stocks               https://s.example/';

/** Each step's document, failing at the first step that is refused. */
function applied(result: { kind: string; document?: string }): string {
  if (result.kind !== 'applied' || result.document === undefined) throw new Error(result.kind);
  return result.document;
}

describe('a remove takes away exactly its line (G12)', () => {
  test('a line that is not last goes with its own ending', () => {
    expect(removeMapping('a a:1\r\nb b:1\nc c:1', { line: 1, text: 'a a:1' })).toEqual({ kind: 'applied', document: 'b b:1\nc c:1', line: 1, text: 'a a:1' });
    expect(removeMapping('a a:1\nb b:1\n', { line: 2, text: 'b b:1' })).toEqual({ kind: 'applied', document: 'a a:1\n', line: 2, text: 'b b:1' });
  });

  test('a last line: the line before becomes last without its own ending, no lone CR left', () => {
    expect(removeMapping('a a:1\r\nb b:1\nc c:1', { line: 3, text: 'c c:1' })).toMatchObject({ document: 'a a:1\r\nb b:1' });
    expect(removeMapping('a a:1\nb b:1\r\nc c:1', { line: 3, text: 'c c:1' })).toMatchObject({ document: 'a a:1\nb b:1' });
  });

  test('the only line leaves the empty document', () => {
    expect(removeMapping('a a:1', { line: 1, text: 'a a:1' })).toEqual({ kind: 'applied', document: '', line: 1, text: 'a a:1' });
  });

  test('the line is found by its text when lines were added above it since', () => {
    const inserted = `\\ top\n\\ Daily\nmail                 https://mail.google.com/\n${STOCKS}\n`;
    expect(removeMapping(inserted, { line: 3, text: STOCKS })).toEqual({
      kind: 'applied',
      document: '\\ top\n\\ Daily\nmail                 https://mail.google.com/\n',
      line: 4,
      text: STOCKS,
    });
  });

  test('a line changed since is stale', () => {
    expect(removeMapping('\\ Daily\nmail  https://mail.google.com/\nstocks               https://other.example/\n', { line: 3, text: STOCKS })).toEqual({ kind: 'stale' });
  });

  test('a line now unreadable, its name repeating an earlier line, is stale', () => {
    expect(removeMapping(`stocks  https://other/\n\\ Daily\nmail  https://mail.google.com/\n${STOCKS}\n`, { line: 3, text: STOCKS })).toEqual({ kind: 'stale' });
  });

  test('an unreadable line with the text at the number is passed over for the mapping line that has it, and alone it is stale', () => {
    expect(removeMapping('\\ x\na  x:1\n\\ y\na  x:1\n', { line: 4, text: 'a  x:1' })).toEqual({ kind: 'applied', document: '\\ x\n\\ y\na  x:1\n', line: 2, text: 'a  x:1' });
    expect(removeMapping('b  x:1\nb  x:2\n', { line: 2, text: 'b  x:2' })).toEqual({ kind: 'stale' });
  });
});

describe("an Undo that takes away a line put after the last line takes back exactly the ending that change gave (G12)", () => {
  test('a lone CR the last line ended in comes back: only the LF the insert gave is taken', () => {
    expect(removeMapping('a    x:1\r\nb    y:2', { line: 2, text: 'b    y:2' }, { text: 'a    x:1\r', ending: '\n' })).toMatchObject({ document: 'a    x:1\r' });
    expect(removeMapping('z    q:0\na    x:1\r\nb    y:2', { line: 3, text: 'b    y:2' }, { text: 'a    x:1\r', ending: '\n' })).toMatchObject({ document: 'z    q:0\na    x:1\r' });
    // In a CRLF document the insert gave CRLF, and that is what goes.
    expect(removeMapping('z    q:0\r\na    x:1\r\nb    y:2', { line: 3, text: 'b    y:2' }, { text: 'a    x:1', ending: '\r\n' })).toMatchObject({ document: 'z    q:0\r\na    x:1' });
  });

  test('without what the change gave, as from a raw request, the line before loses its whole ending', () => {
    expect(removeMapping('a    x:1\r\nb    y:2', { line: 2, text: 'b    y:2' })).toMatchObject({ document: 'a    x:1' });
  });

  test('an insert at the end, then a CRLF first line removed, then its Undo: the LF last line is as it was', () => {
    const inserted = insertMapping('first first:1\r\nsecond second:1\nlast last:1', { name: 'new', url: 'n:1', note: '' }, null);
    if (inserted.kind !== 'applied') throw new Error(inserted.kind);
    const removed = applied(removeMapping(inserted.document, { line: 1, text: 'first first:1' }));
    expect(removeMapping(removed, { line: inserted.line, text: inserted.text }, inserted.endingGiven)).toMatchObject({ kind: 'applied', document: 'second second:1\nlast last:1', line: 3 });
  });

  test("an insert at the end, then the line it gave an ending removed, then its Undo: the line now before loses its own CRLF whole", () => {
    const inserted = insertMapping('z z:1\nq q:1\r\np p:1', { name: 'n', url: 'n:1', note: '' }, null);
    if (inserted.kind !== 'applied') throw new Error(inserted.kind);
    expect(inserted.document).toBe('z z:1\nq q:1\r\np p:1\nn n:1');
    const removed = applied(removeMapping(inserted.document, { line: 3, text: 'p p:1' }));
    expect(removeMapping(removed, { line: inserted.line, text: inserted.text }, inserted.endingGiven)).toMatchObject({ kind: 'applied', document: 'z z:1\nq q:1' });
  });

  test('a lone CR last line, an insert after it, its Undo: the lone CR is there again', () => {
    const inserted = insertMapping('a    x:1\r', { name: 'b', url: 'y:2', note: '' }, null);
    if (inserted.kind !== 'applied') throw new Error(inserted.kind);
    expect(removeMapping(inserted.document, inserted, inserted.endingGiven)).toMatchObject({ document: 'a    x:1\r' });
  });

  test('a remove, its Undo putting the line back after the last line, a CRLF first line removed, then that Undo\'s Undo', () => {
    const removed = removeMapping('x x:1\r\na a:1\nb b:1', { line: 3, text: 'b b:1' });
    if (removed.kind !== 'applied') throw new Error(removed.kind);
    expect(removed.document).toBe('x x:1\r\na a:1');
    const putBack = reinsertLine(removed.document, removed.line, removed.text);
    expect(putBack).toEqual({ kind: 'applied', document: 'x x:1\r\na a:1\r\nb b:1', line: 3, text: 'b b:1', endingGiven: { text: 'a a:1', ending: '\r\n' } });
    if (putBack.kind !== 'applied') throw new Error(putBack.kind);
    const firstGone = applied(removeMapping(putBack.document, { line: 1, text: 'x x:1' }));
    expect(removeMapping(firstGone, putBack, putBack.endingGiven)).toMatchObject({ kind: 'applied', document: 'a a:1', line: 2 });
  });
});
