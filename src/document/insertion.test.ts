import { describe, expect, test } from 'vitest';
import { readDocument } from './grammar';
import { documentLineEnding, type EndingGiven } from './line-edits';
import { splitLines } from './lines';
import { insertMapping, type InsertResult } from './insertion';
import { reinsertLine } from './put-back';
import { removeMapping } from './removal';
import type { HeadingIdentity } from './sections';

interface Case {
  document: string;
  name: string;
  url: string;
  note?: string;
  heading?: HeadingIdentity;
  /** The document after the insert, and the new line's number. */
  inserted: string;
  line: number;
  headingMissing?: boolean;
  /** What the insert gave the last line, when the new line went after it. */
  endingGiven?: EndingGiven;
}

const insert = (c: Pick<Case, 'document' | 'name' | 'url' | 'note' | 'heading'>): InsertResult =>
  insertMapping(c.document, { name: c.name, url: c.url, note: c.note ?? '' }, c.heading ?? null);

const STOCKS = 'stocks               https://s.example/';
const REPEATED_HEADINGS = '\\ Work\na     a:1\n\\ Work\n\\ more\nb     b:2\n\\ Work\nc     c:3\n';
const after7 = '\\ Work\na     a:1\n\\ Work\n\\ more\nb     b:2\n\\ Work\nc     c:3\nnew   n:8\n';

const CASES: Record<string, Case> = {
  'at the end, after the last line, before the empty line a final break leaves': {
    document: '\\ Daily\nmail                 https://mail.google.com/\n',
    name: 'stocks',
    url: 'https://s.example/',
    inserted: `\\ Daily\nmail                 https://mail.google.com/\n${STOCKS}\n`,
    line: 3,
  },
  'before trailing whitespace-only lines, with a final break': {
    document: 'a    x:1\n\n \t\n',
    name: 'b',
    url: 'y:2',
    inserted: 'a    x:1\nb    y:2\n\n \t\n',
    line: 2,
  },
  'before trailing whitespace-only lines, without a final break': {
    document: 'a    x:1\n\n \t',
    name: 'b',
    url: 'y:2',
    inserted: 'a    x:1\nb    y:2\n\n \t',
    line: 2,
  },
  'after the last line of a CRLF document without a final break: that line gains CRLF': {
    document: 'z    q:0\r\na    x:1',
    name: 'b',
    url: 'y:2',
    inserted: 'z    q:0\r\na    x:1\r\nb    y:2',
    line: 3,
    endingGiven: { text: 'a    x:1', ending: '\r\n' },
  },
  'after the only line, which has no break: it gains LF': {
    document: 'a    x:1',
    name: 'b',
    url: 'y:2',
    inserted: 'a    x:1\nb    y:2',
    line: 2,
    endingGiven: { text: 'a    x:1', ending: '\n' },
  },
  'mixed endings, first break LF: the new line takes LF and the CRLF line keeps its own': {
    document: 'a    x:1\nb    y:2\r\n',
    name: 'c',
    url: 'z:3',
    inserted: 'a    x:1\nb    y:2\r\nc    z:3\n',
    line: 3,
  },
  'mixed endings, first break CRLF: the old last line gains CRLF': {
    document: 'a    x:1\r\nb    y:2\nc    z:3',
    name: 'd',
    url: 'w:4',
    inserted: 'a    x:1\r\nb    y:2\nc    z:3\r\nd    w:4',
    line: 4,
    endingGiven: { text: 'c    z:3', ending: '\r\n' },
  },
  'into a section followed by another': {
    document: '\\ Work\nmail  m:1\n\n\\ Home\ntv    t:2\n',
    name: 'new',
    url: 'n:3',
    heading: { texts: ['\\ Work'], before: 0 },
    inserted: '\\ Work\nmail  m:1\nnew   n:3\n\n\\ Home\ntv    t:2\n',
    line: 3,
  },
  'into a repeated heading text, by the runs with exactly its texts before it': {
    document: REPEATED_HEADINGS,
    name: 'new',
    url: 'n:8',
    heading: { texts: ['\\ Work'], before: 1 },
    inserted: after7,
    line: 8,
  },
  'into a two-line heading': {
    document: REPEATED_HEADINGS,
    name: 'new',
    url: 'n:8',
    heading: { texts: ['\\ Work', '\\ more'], before: 0 },
    inserted: '\\ Work\na     a:1\n\\ Work\n\\ more\nb     b:2\nnew   n:8\n\\ Work\nc     c:3\n',
    line: 6,
  },
  'a heading gone: to the end of the document, saying so': {
    document: REPEATED_HEADINGS,
    name: 'new',
    url: 'n:8',
    heading: { texts: ['\\ Gone'], before: 0 },
    inserted: after7,
    line: 8,
    headingMissing: true,
  },
  'a heading with fewer runs of its texts than named: to the end, saying so': {
    document: REPEATED_HEADINGS,
    name: 'new',
    url: 'n:8',
    heading: { texts: ['\\ Work'], before: 2 },
    inserted: after7,
    line: 8,
    headingMissing: true,
  },
  'into a section with no mapping: the column of the nearest mapping line below': {
    document: '\\ Top\n\n\\ Rest\nb     y:2\n',
    name: 'new',
    url: 'n:1',
    heading: { texts: ['\\ Top'], before: 0 },
    inserted: '\\ Top\nnew   n:1\n\n\\ Rest\nb     y:2\n',
    line: 2,
  },
  'after a trailing comment line, which holds more than whitespace': {
    document: 'a       x:1\n\\ Archive\n',
    name: 'new',
    url: 'n:2',
    inserted: 'a       x:1\n\\ Archive\nnew     n:2\n',
    line: 3,
  },
  'after an unreadable line, which holds more than whitespace but lends no column': {
    document: 'a       x:1\nwhat  is  this\n',
    name: 'new',
    url: 'n:2',
    inserted: 'a       x:1\nwhat  is  this\nnew     n:2\n',
    line: 3,
  },
  'the nearest mapping above wins over the one below': {
    document: '\\ A\na         x:1\noops\n\\ B\nb  y:2\n',
    name: 'new',
    url: 'n:5',
    heading: { texts: ['\\ A'], before: 0 },
    inserted: '\\ A\na         x:1\noops\nnew       n:5\n\\ B\nb  y:2\n',
    line: 4,
  },
  'a name only an unreadable line has is free, and that line stays unreadable': {
    document: 'stocks notaurl\n',
    name: 'stocks',
    url: 'https://s.example/',
    inserted: `stocks notaurl\n${STOCKS}\n`,
    line: 2,
  },
  'into an absent or empty document: at its start, column 22': {
    document: '',
    name: 'stocks',
    url: 'https://s.example/',
    inserted: `${STOCKS}\n`,
    line: 1,
  },
  'into a whitespace-only document: at its start': {
    document: ' \n\t',
    name: 'stocks',
    url: 'https://s.example/',
    inserted: `${STOCKS}\n \n\t`,
    line: 1,
  },
  'into an empty CRLF document: the new line takes CRLF': {
    document: '\r\n',
    name: 'stocks',
    url: 'https://s.example/',
    inserted: `${STOCKS}\r\n\r\n`,
    line: 1,
  },
  'beside a tab-aligned neighbor, a name too long for its column gets one space': {
    document: 'gh\thttps://github.com/\n',
    name: 'stocks',
    url: 'https://s.example/',
    inserted: 'gh\thttps://github.com/\nstocks https://s.example/\n',
    line: 2,
  },
  'beside an indented neighbor: the column counts its leading spaces': {
    document: '   a  https://x.example/\n',
    name: 'b',
    url: 'https://b.example/',
    inserted: '   a  https://x.example/\nb     https://b.example/\n',
    line: 2,
  },
  'beside astral characters: columns count code points, not UTF-16 units': {
    document: '😀😀 https://e.example/\n',
    name: 'a',
    url: 'https://a.example/',
    inserted: '😀😀 https://e.example/\na  https://a.example/\n',
    line: 2,
  },
  'an astral name with no neighbor': {
    document: '',
    name: '😀',
    url: 'https://a.example/',
    inserted: `😀${' '.repeat(20)}https://a.example/\n`,
    line: 1,
  },
  "the neighbor's URL column, where its name and note hold the same text": {
    document: 'https://x/ https://x/   \\ https://x/\n',
    name: 'a',
    url: 'https://a.example/',
    inserted: `https://x/ https://x/   \\ https://x/\na${' '.repeat(10)}https://a.example/\n`,
    line: 2,
  },
  'a name of 19 code points gets two spaces': {
    document: '',
    name: 'n'.repeat(19),
    url: 'u:1',
    inserted: `${'n'.repeat(19)}  u:1\n`,
    line: 1,
  },
  'a name of 20 code points gets one, the URL at column 22': {
    document: '',
    name: 'n'.repeat(20),
    url: 'u:1',
    inserted: `${'n'.repeat(20)} u:1\n`,
    line: 1,
  },
  'a name of 21 code points gets one': {
    document: '',
    name: 'n'.repeat(21),
    url: 'u:1',
    inserted: `${'n'.repeat(21)} u:1\n`,
    line: 1,
  },
  'a note, trimmed, after one space and a backslash': {
    document: '',
    name: 'n',
    url: 'u:1',
    note: '  see docs  ',
    inserted: `n${' '.repeat(20)}u:1 \\ see docs\n`,
    line: 1,
  },
  'a note of whitespace writes no comment': {
    document: '',
    name: 'n',
    url: 'u:1',
    note: '   ',
    inserted: `n${' '.repeat(20)}u:1\n`,
    line: 1,
  },
  'a name trimmed before it is written': {
    document: '',
    name: '  stocks  ',
    url: 'https://s.example/',
    inserted: `${STOCKS}\n`,
    line: 1,
  },
  'a lone CR ending the last line is content: the added LF reads with it as one CRLF ending': {
    document: 'a    x:1\r',
    name: 'b',
    url: 'y:2',
    inserted: 'a    x:1\r\nb    y:2',
    line: 2,
    endingGiven: { text: 'a    x:1\r', ending: '\n' },
  },
  'lone surrogates become U+FFFD in the name, the URL, and the note alike': {
    document: '',
    name: 'a\uD800',
    url: 'https://e.example/?q=\uDC00',
    note: 'x\uD800',
    inserted: `a�${' '.repeat(19)}https://e.example/?q=� \\ x�\n`,
    line: 1,
  },
};

describe('an insert writes one line by F12 where G9 places it, and leaves every other byte', () => {
  for (const [title, c] of Object.entries(CASES)) {
    test(title, () => {
      const result = insert(c);
      const newLine = splitLines(c.inserted)[c.line - 1]!.text;
      expect(result).toEqual({ kind: 'applied', document: c.inserted, line: c.line, text: newLine, headingMissing: c.headingMissing ?? false, endingGiven: c.endingGiven });
    });
  }
});

describe('read back, the new line is the mapping asked for and every other line is as it was', () => {
  for (const [title, c] of Object.entries(CASES)) {
    test(title, () => {
      const before = readDocument(c.document).lines;
      const after = readDocument(c.inserted).lines;
      const added = after[c.line - 1]!;
      expect(added.kind).toBe('mapping');
      if (added.kind !== 'mapping') return;
      const note = (c.note ?? '').toWellFormed().trim();
      expect(added.mapping).toMatchObject({ name: c.name.toWellFormed().trim(), url: c.url.toWellFormed(), note: note === '' ? null : note });

      expect(after).toHaveLength(before.length + 1);
      const gained = documentLineEnding(splitLines(c.document));
      before.forEach((line, i) => {
        const now = after[i < c.line - 1 ? i : i + 1]!;
        expect(now.kind, `line ${line.number}`).toBe(line.kind);
        // Only the old last line changes, when the new line goes after it: it gains the document's ending.
        const wasLastAndPassed = line.number === before.length && c.line > before.length;
        expect(now.text + now.ending, `line ${line.number}`).toBe(line.text + line.ending + (wasLastAndPassed ? gained : ''));
      });
    });
  }
});

describe("undone with its reply's line and text, every insert gives back the original string exactly", () => {
  for (const [title, c] of Object.entries(CASES)) {
    test(title, () => {
      const result = insert(c);
      if (result.kind !== 'applied') throw new Error(result.kind);
      expect(removeMapping(result.document, result, result.endingGiven)).toEqual({ kind: 'applied', document: c.document, line: c.line, text: result.text });
    });
  }
});

describe('an insert is refused, writing nothing, when the values break a rule or the name is taken', () => {
  test('a taken name names the line that has it', () => {
    expect(insert({ document: '\\ notes\n\nnot a mapping\nalpha  a:1\nStocks  s:1\n', name: 'STOCKS', url: 'https://s.example/' })).toEqual({ kind: 'name-taken', line: 5 });
  });

  test('a lone surrogate in the name is checked as the U+FFFD it is stored as', () => {
    const first = insert({ document: '', name: 'a\uD800', url: 'https://e.example/' });
    if (first.kind !== 'applied') throw new Error(first.kind);
    expect(insert({ document: first.document, name: 'a\uD800', url: 'https://f.example/' })).toEqual({ kind: 'name-taken', line: 1 });
    expect(insert({ document: first.document, name: 'a�', url: 'https://f.example/' })).toEqual({ kind: 'name-taken', line: 1 });
  });

  test('an invalid value names its field and rule', () => {
    expect(insert({ document: '', name: 'a\\b', url: 'https://s.example/' })).toEqual({ kind: 'invalid', field: 'name', rule: 'backslash' });
    expect(insert({ document: '', name: 'a', url: 'https://x y' })).toEqual({ kind: 'invalid', field: 'url', rule: 'whitespace' });
    expect(insert({ document: '', name: 'a', url: 'https://x', note: 'a\nb' })).toEqual({ kind: 'invalid', field: 'note', rule: 'line-break' });
    expect(insert({ document: '', name: 'a', url: 'https://x', note: '\nhello\r\n' })).toEqual({ kind: 'invalid', field: 'note', rule: 'line-break' });
  });
});

describe("an Undo's Undo puts the line back as the insert left the document, and its own Undo takes it away again", () => {
  for (const [title, c] of Object.entries(CASES)) {
    test(title, () => {
      const inserted = insert(c);
      if (inserted.kind !== 'applied') throw new Error(inserted.kind);
      const undone = removeMapping(inserted.document, inserted, inserted.endingGiven);
      if (undone.kind !== 'applied') throw new Error(undone.kind);
      const putBack = reinsertLine(undone.document, undone.line, undone.text);
      expect(putBack).toEqual({ kind: 'applied', document: c.inserted, line: c.line, text: inserted.text, endingGiven: inserted.endingGiven });
      if (putBack.kind !== 'applied') throw new Error(putBack.kind);
      expect(removeMapping(c.inserted, { line: c.line, text: inserted.text }, putBack.endingGiven)).toMatchObject({ kind: 'applied', document: c.document });
    });
  }
});
