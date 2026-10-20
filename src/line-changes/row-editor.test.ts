import { describe, expect, test } from 'vitest';
import type { MappingFields } from '../document/validation';
import { movesAdmitted } from '../document/moving';
import { destination, lineFields, moveFooter, notMovedText, saveCheck, textViewLine, whatBecameOf } from './row-editor';

const fields = (name: string, url: string, note = ''): MappingFields => ({ name, url, note });
const DOC = '\\ Work\nmail   https://m.example/   \\ inbox\nyt     https://y.example/?q=%s\nStocks https://s.example/\n';
const MAIL = { line: 2, text: 'mail   https://m.example/   \\ inbox' };

test('the fields an editor starts with are the line as loaded: its name, URL, and note, empty for none (G14)', () => {
  expect(lineFields(MAIL.text)).toEqual(fields('mail', 'https://m.example/', 'inbox'));
  expect(lineFields('yt     https://y.example/?q=%s')).toEqual(fields('yt', 'https://y.example/?q=%s', ''));
});

describe('what Save would write, and what stops it, against the document as last read (G8, G14)', () => {
  test("the line's own name is free; another line's is taken, named beside a value's problem", () => {
    expect(saveCheck(DOC, MAIL, fields('MAIL', 'https://m2.example/'))).toEqual({ line: 2, problem: null, takenBy: null, stale: false });
    expect(saveCheck(DOC, MAIL, fields('stocks', ''))).toEqual({ line: 2, problem: { field: 'url', rule: 'no-scheme' }, takenBy: expect.objectContaining({ line: 4 }), stale: false });
  });

  test('the line where it stands now, lines added above since it loaded', () => {
    expect(saveCheck(`\\ new\n\\ lines\n${DOC}`, MAIL, fields('mail', 'https://m.example/'))).toMatchObject({ line: 4, stale: false });
  });

  test("a line gone or changed since it loaded: nothing stops Save but a value's own problem, and the worker answers stale", () => {
    expect(saveCheck(DOC.replace('inbox', 'later'), MAIL, fields('stocks', 'https://m.example/'))).toEqual({ line: 2, problem: null, takenBy: null, stale: true });
    expect(saveCheck(DOC.replace('inbox', 'later'), MAIL, fields('mail', 'no scheme'))).toMatchObject({ problem: { field: 'url', rule: 'whitespace' }, stale: true });
  });

  test('with no anchor, a new line at the end, every name taken', () => {
    expect(saveCheck(`${DOC}\n\n`, null, fields('Mail', 'https://m.example/'))).toEqual({ line: 5, problem: null, takenBy: expect.objectContaining({ line: 2 }), stale: false });
    expect(saveCheck(DOC, null, fields('new', 'https://n.example/'))).toEqual({ line: 5, problem: null, takenBy: null, stale: false });
  });
});

describe('what became of a line a change found stale, by the stored document the worker refused against (G13)', () => {
  test('its name now on a changed line, wherever it stands: that line as it now stands', () => {
    const changed = `\\ new\n${DOC.replace('https://m.example/   \\ inbox', 'https://elsewhere.example/')}`;
    expect(whatBecameOf(changed, MAIL)).toEqual({ kind: 'changed', now: { line: 3, text: 'mail   https://elsewhere.example/' } });
    expect(whatBecameOf(DOC.replace('mail ', 'MAIL '), MAIL)).toEqual({ kind: 'changed', now: { line: 2, text: 'MAIL   https://m.example/   \\ inbox' } });
  });

  test('renamed or removed: gone, never the line now at the old number', () => {
    expect(whatBecameOf(DOC.replace('mail ', 'post '), MAIL)).toEqual({ kind: 'gone' });
    expect(whatBecameOf(DOC.replace(`${MAIL.text}\n`, ''), MAIL)).toEqual({ kind: 'gone' });
    expect(whatBecameOf('', MAIL)).toEqual({ kind: 'gone' });
  });
});

test('Open in text names the line where it stands in the document as last read, else the number it loaded with', () => {
  expect(textViewLine(DOC, MAIL)).toBe(2);
  expect(textViewLine(`\\ a\n\\ b\n${DOC}`, MAIL)).toBe(4);
  expect(textViewLine(DOC.replace('inbox', 'later'), MAIL)).toBe(2);
});

describe("Copy link's destination is where opening the row goes, from the line as anchored (G31, F9)", () => {
  test("the argument row's URL filled with its argument; any other row's with every %s removed", () => {
    expect(destination('yt  https://y.example/?q=%s&r=%s', 'lo-fi beats')).toBe('https://y.example/?q=lo-fi%20beats&r=lo-fi%20beats');
    expect(destination('yt  https://y.example/?q=%s&r=%s', null)).toBe('https://y.example/?q=&r=');
    expect(destination(MAIL.text, null)).toBe('https://m.example/');
  });

  test('none when longer than Chrome opens', () => {
    expect(destination('yt  https://y.example/?q=%s', 'x'.repeat(2_097_152))).toBeUndefined();
  });
});

describe('what Enter does on a move, and what a refused one says (G12, G13, L2)', () => {
  const doc = '\\ top\nA u:1\n\\ later\nB u:2\nC u:3\n';
  const B = { line: 4, text: 'B u:2' };

  test('where an admitted move takes the line, by the document as last read', () => {
    const { up, down } = movesAdmitted(doc, B);
    expect(moveFooter('up', up, 4)).toBe('Enter moves line 4 up to line 2');
    expect(moveFooter('down', down, 4)).toBe('Enter moves line 4 down to line 5');
  });

  test('nothing at the first or last mapping, or with a line with its name in the way, saying why', () => {
    expect(moveFooter('up', movesAdmitted(doc, { line: 2, text: 'A u:1' }).up, 2)).toBe('Enter does nothing · line 2 is the first mapping');
    expect(moveFooter('down', movesAdmitted(doc, { line: 5, text: 'C u:3' }).down, 5)).toBe('Enter does nothing · line 5 is the last mapping');
    expect(moveFooter('down', movesAdmitted('a u:1\na v:2\nb u:3', { line: 1, text: 'a u:1' }).down, 1)).toBe('Enter does nothing · line 2, which has this name, is in the way');
  });

  test('a line changed or gone since is offered as an attempt, the worker saying what became of it', () => {
    expect(moveFooter('up', movesAdmitted(doc, { line: 4, text: 'B u:9' }).up, 4)).toBe('Enter tries to move line 4 up · the line has changed');
  });

  test('a move refused as immovable says why, by the document it was refused on, where the line now stands', () => {
    // Another page moved B to the top since.
    expect(notMovedText('B u:2\n\\ top\nA u:1\n\\ later\nC u:3\n', B, 'up')).toBe('Not moved: line 1 is the first mapping now, and nothing was stored.');
    expect(notMovedText('a u:1\na v:2\nb u:3', { line: 1, text: 'a u:1' }, 'down')).toBe('Not moved: line 2, which has this name, is in the way now, and nothing was stored.');
  });
});
