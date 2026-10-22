import { describe, expect, test } from 'vitest';
import { EXAMPLE_DOCUMENT } from './example';
import { mappingOfLine } from './grammar';
import { splitLines } from './lines';
import { rewriteChecks, rewriteMapping } from './rewriting';
import type { MappingFields } from './validation';

const fields = (name: string, url: string, note = ''): MappingFields => ({ name, url, note });

/** Every line of `before` but line `line` is in `after`, byte for byte with its ending. */
function othersUnchanged(before: string, after: string, line: number) {
  const was = splitLines(before);
  const now = splitLines(after);
  expect(now).toHaveLength(was.length);
  was.forEach((old, i) => {
    if (old.number === line) expect(now[i]!.ending, `line ${old.number}'s ending`).toBe(old.ending);
    else expect(now[i]!.text + now[i]!.ending, `line ${old.number}`).toBe(old.text + old.ending);
  });
}

describe('a rewrite writes its one line anew and leaves every other byte (G12, F12)', () => {
  test("F11's news line renamed hn: its columns kept, every other line as it was", () => {
    const result = rewriteMapping(EXAMPLE_DOCUMENT, { line: 4, text: EXAMPLE_DOCUMENT.split('\n')[3]! }, fields('hn', 'https://news.ycombinator.com/', 'a comment after a mapping is its note'));
    if (result.kind !== 'applied') throw new Error(result.kind);
    expect(result.text).toBe(`hn${' '.repeat(19)}https://news.ycombinator.com/            \\ a comment after a mapping is its note`);
    expect(result.line).toBe(4);
    expect(splitLines(result.document)[3]!.text).toBe(result.text);
    othersUnchanged(EXAMPLE_DOCUMENT, result.document, 4);
  });

  test('a line keeps its own ending: CRLF in a mixed document, none as the last line', () => {
    const document = 'a  u:1\nb  v:2\r\nc  w:3';
    expect(rewriteMapping(document, { line: 2, text: 'b  v:2' }, fields('bb', 'v:2'))).toEqual({ kind: 'applied', document: 'a  u:1\nbb v:2\r\nc  w:3', line: 2, text: 'bb v:2' });
    expect(rewriteMapping(document, { line: 3, text: 'c  w:3' }, fields('c', 'w:4'))).toEqual({ kind: 'applied', document: 'a  u:1\nb  v:2\r\nc  w:4', line: 3, text: 'c  w:4' });
  });

  test('the values are written as validation gives them: the name and note trimmed, a lone surrogate as U+FFFD', () => {
    expect(rewriteMapping('a  u:1\n', { line: 1, text: 'a  u:1' }, fields('  b \n', 'u:\uD800', '  see  '))).toEqual({ kind: 'applied', document: 'b  u:\uFFFD \\ see\n', line: 1, text: 'b  u:\uFFFD \\ see' });
  });
});

describe('a rewrite finds its line again by the anchor, and only a mapping line (G13, R3, G16)', () => {
  test('two lines inserted above since: the line at its new number is rewritten', () => {
    expect(rewriteMapping('\\ new\nn  n:1\na  u:1\nb  v:2\n', { line: 2, text: 'b  v:2' }, fields('c', 'v:2'))).toEqual({
      kind: 'applied',
      document: '\\ new\nn  n:1\na  u:1\nc  v:2\n',
      line: 4,
      text: 'c  v:2',
    });
  });

  test('a line changed or gone since is stale', () => {
    expect(rewriteMapping('a  u:1\nb  v:3\n', { line: 2, text: 'b  v:2' }, fields('c', 'v:2'))).toEqual({ kind: 'stale' });
    expect(rewriteMapping('a  u:1\n', { line: 2, text: 'b  v:2' }, fields('c', 'v:2'))).toEqual({ kind: 'stale' });
  });

  test('an unreadable line with the exact text at the number, and no mapping line with it, is stale', () => {
    expect(rewriteMapping('b  x:1\nb  v:2\n', { line: 2, text: 'b  v:2' }, fields('c', 'v:2'))).toEqual({ kind: 'stale' });
    expect(rewriteMapping('b  x:1\nwhat  is  this\n', { line: 2, text: 'what  is  this' }, fields('c', 'v:2'))).toEqual({ kind: 'stale' });
  });
});

describe("a rewrite's name is checked against every mapping line but its own (G13, F4)", () => {
  const document = 'Stocks  s:1\nhold   h:1\nbad name only\nshares x:1\nshares y:2\n';

  test('the name kept, or only its case changed, is free', () => {
    expect(rewriteMapping(document, { line: 1, text: 'Stocks  s:1' }, fields('Stocks', 's:2'))).toMatchObject({ kind: 'applied', text: 'Stocks  s:2' });
    expect(rewriteMapping(document, { line: 1, text: 'Stocks  s:1' }, fields('stocks', 's:1'))).toMatchObject({ kind: 'applied', text: 'stocks  s:1' });
  });

  test("another mapping line's name, in any case, is taken: that line's number, whichever side it is on", () => {
    expect(rewriteMapping(document, { line: 1, text: 'Stocks  s:1' }, fields('HOLD', 's:1'))).toEqual({ kind: 'name-taken', line: 2 });
    expect(rewriteMapping(document, { line: 2, text: 'hold   h:1' }, fields('stocks', 'h:1'))).toEqual({ kind: 'name-taken', line: 1 });
  });

  test('a name only an unreadable line repeats is free', () => {
    expect(rewriteMapping(document, { line: 1, text: 'Stocks  s:1' }, fields('bad name', 's:1'))).toMatchObject({ kind: 'applied', text: 'bad name s:1' });
  });
});

describe('a rewrite whose values break G8 or G14 names the field and the rule, and writes nothing (How G8/G14)', () => {
  const anchor = { line: 1, text: 'a  u:1' };
  const cases: [MappingFields, { field: string; rule: string }][] = [
    [fields('', 'u:1'), { field: 'name', rule: 'empty' }],
    [fields(' \t', 'u:1'), { field: 'name', rule: 'empty' }],
    [fields('a\\b', 'u:1'), { field: 'name', rule: 'backslash' }],
    [fields('a\nb', 'u:1'), { field: 'name', rule: 'line-break' }],
    [fields('a\rb', 'u:1'), { field: 'name', rule: 'line-break' }],
    [fields('a', 'u:1 x'), { field: 'url', rule: 'whitespace' }],
    [fields('a', 'u:1\n'), { field: 'url', rule: 'whitespace' }],
    [fields('a', 'u:1\\x'), { field: 'url', rule: 'backslash' }],
    [fields('a', 'example.com/path'), { field: 'url', rule: 'no-scheme' }],
    [fields('a', 'u:1', 'a\nb'), { field: 'note', rule: 'line-break' }],
    [fields('a', 'u:1', 'note\r'), { field: 'note', rule: 'line-break' }],
  ];
  for (const [values, problem] of cases) {
    test(JSON.stringify(values), () => {
      expect(rewriteMapping('a  u:1\n', anchor, values)).toEqual({ kind: 'invalid', ...problem });
    });
  }

  test('a line break at the edge of the name is trimmed away and accepted', () => {
    expect(rewriteMapping('a  u:1\n', anchor, fields('\nb\r\n', 'u:1'))).toMatchObject({ kind: 'applied', text: 'b  u:1' });
  });

  test('a backslash in the note is written as typed, and the line reads back with that note (F4)', () => {
    const result = rewriteMapping('a  u:1\n', anchor, fields('a', 'u:1', 'see \\ docs'));
    expect(result).toMatchObject({ kind: 'applied', text: 'a  u:1 \\ see \\ docs' });
    if (result.kind !== 'applied') throw new Error(result.kind);
    expect(mappingOfLine(result.text)?.note).toBe('see \\ docs');
  });
});

describe("what a row editor shows before Save: rewriteMapping's checks, every problem at once (G8, G14)", () => {
  const document = '\\ top\nalpha  a:1\nStocks  s:1\n';
  const anchor = { line: 3, text: 'Stocks  s:1' };

  test("the line's own name, or its case changed, is free", () => {
    expect(rewriteChecks(document, anchor, fields('Stocks', 's:2'))).toEqual({ kind: 'found', line: 3, problem: null, takenBy: null });
    expect(rewriteChecks(document, anchor, fields('STOCKS', 's:1'))).toEqual({ kind: 'found', line: 3, problem: null, takenBy: null });
  });

  test("another line's name is taken, named beside a value's problem", () => {
    expect(rewriteChecks(document, anchor, fields('Alpha', ''))).toEqual({
      kind: 'found',
      line: 3,
      problem: { field: 'url', rule: 'no-scheme' },
      takenBy: expect.objectContaining({ line: 2, name: 'alpha' }),
    });
    expect(rewriteMapping(document, anchor, fields('Alpha', ''))).toEqual({ kind: 'invalid', field: 'url', rule: 'no-scheme' });
  });

  test('the line where it stands now, lines above added since', () => {
    expect(rewriteChecks(`\\ new\n${document}`, anchor, fields('Stocks', 's:1'))).toMatchObject({ kind: 'found', line: 4 });
  });

  test('stale where rewriteMapping is, whatever the values', () => {
    expect(rewriteChecks(document.replace('s:1', 's:9'), anchor, fields('', ''))).toEqual({ kind: 'stale' });
    expect(rewriteMapping(document.replace('s:1', 's:9'), anchor, fields('', ''))).toEqual({ kind: 'stale' });
  });
});
