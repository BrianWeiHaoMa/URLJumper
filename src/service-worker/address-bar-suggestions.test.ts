import { describe, expect, test } from 'vitest';
import { fillArgument } from '../document/argument';
import { searchList, typedArgument, type SearchInput, type SearchOrder } from '../document/search';
import type { Usage } from '../document/score';
import { addressBarList, comparisonForm, enteredTarget, readAddressBarRecord, type AddressBarList } from './address-bar-suggestions';

const NOW = Date.UTC(2026, 9, 18, 12);
const DAY = 24 * 60 * 60 * 1000;

const inputs = (lines: readonly string[], order: SearchOrder = 'document', usage?: Usage): Omit<SearchInput, 'typed'> => ({
  document: lines.join('\n'),
  order,
  usage,
  now: NOW,
});
const list = (lines: readonly string[], typed: string, order?: SearchOrder, usage?: Usage) => addressBarList({ ...inputs(lines, order, usage), typed });

/** Every row's content, row 1's included, as Enter would rebuild it from the stored record. */
const contents = (shown: AddressBarList) => shown.record.rows.map((_, index) => contentFor(shown, index));
function contentFor(shown: AddressBarList, index: number): string {
  // Row 1 is the default and goes to Chrome without a content; the others' are in `suggestions`.
  if (index > 0) return shown.suggestions[index - 1]!.content;
  const [, name, url, suffix] = shown.record.rows[0]!;
  return (shown.record.argumentRow === 0 ? fillArgument(url, typedArgument(shown.record.typed, name)!)! : name) + suffix;
}

/** Chrome's later sanitizing of a content (S7), as an independent model: kWhitespaceUTF16 trimmed from the ends, then LF, CR, tab, U+2028, U+2029 removed. */
function sanitized(content: string): string {
  const whitespace = '\t\n\v\f\r \u0085\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000';
  let start = 0;
  let end = content.length;
  while (start < end && whitespace.includes(content[start]!)) start++;
  while (end > start && whitespace.includes(content[end - 1]!)) end--;
  return content.slice(start, end).replace(/[\n\r\t\u2028\u2029]/g, '');
}

/** A description's text as an XML parser reads it, given only the markup and entities the product writes. */
function readText(description: string): string {
  expect(description).toMatch(/^(?:[^&<]|&(?:amp|lt|gt);|<\/?(?:dim|url|match)>)*$/);
  expect(description).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/);
  expect(description.isWellFormed()).toBe(true);
  return description.replace(/<[^>]*>/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

describe('the list (G28, N4)', () => {
  const document = [
    'gm https://gm.example/',
    'gmail https://mail.example/',
    'g https://g.example/?q=%s',
    'my gmail https://my.example/',
    'inbox https://gm.example/inbox',
  ];

  test("is the popup's list for the text, groups (a) to (e), in its order, row 1 the default", () => {
    const shown = list(document, 'gm');
    expect(shown.record.rows.map(([line, name, url]) => [line, name, url])).toEqual([
      [1, 'gm', 'https://gm.example/'],
      [2, 'gmail', 'https://mail.example/'],
      [4, 'my gmail', 'https://my.example/'],
      [5, 'inbox', 'https://gm.example/inbox'],
    ]);
    expect(readText(shown.defaultDescription)).toBe('gm – https://gm.example/');
    expect(shown.suggestions.map(({ description }) => readText(description))).toEqual([
      'gmail – https://mail.example/',
      'my gmail – https://my.example/',
      'inbox – https://gm.example/inbox',
    ]);
  });

  test("follows the order preference and the usage, as the popup's list does (G2, G27)", () => {
    const usage = { 'inbox\nhttps://gm.example/inbox': [NOW - DAY], 'my gmail\nhttps://my.example/': [NOW - 40 * DAY] };
    for (const order of ['document', 'smart'] as const) {
      const expected = searchList({ ...inputs(document, order, usage), typed: 'mail' }).flatMap((row) => (row.group === 'name' ? [] : [row.mapping.name]));
      expect(list(document, 'mail', order, usage).record.rows.map(([, name]) => name), order).toEqual(expected);
    }
    expect(list(document, 'i', 'smart', usage).record.rows.map(([, name]) => name)).toEqual(['inbox', 'my gmail', 'gmail']);
  });

  test('the argument row shows its filled URL and is marked in the record', () => {
    const shown = list(['yt lo-fi mix https://a.example/', 'yt https://www.youtube.com/results?search_query=%s'], 'yt lo-fi');
    expect(shown.record.argumentRow).toBe(1);
    expect(shown.suggestions).toEqual([
      { content: 'https://www.youtube.com/results?search_query=lo-fi', description: expect.any(String) },
    ]);
    expect(readText(shown.suggestions[0]!.description)).toBe('yt – https://www.youtube.com/results?search_query=lo-fi');
  });

  test('blank text lists nothing, though the popup lists every mapping for it', () => {
    for (const typed of ['', '   ', '\t\u3000']) {
      const shown = list(document, typed);
      expect(shown.record, JSON.stringify(typed)).toEqual({ typed, rows: [], argumentRow: null });
      expect(shown.suggestions).toEqual([]);
      expect(shown.defaultDescription).toBe('Type the name of a URLJumper mapping');
    }
    expect(list([], '').defaultDescription).toBe('Type the name of a URLJumper mapping');
  });

  test('text matching no mapping lists no row, never the Name row, and the default says nothing matches', () => {
    for (const lines of [document, []]) {
      const shown = list(lines, 'qqq');
      expect(shown.record.rows).toEqual([]);
      expect(shown.suggestions).toEqual([]);
      expect(shown.defaultDescription).toBe('No URLJumper mapping matches');
    }
  });

  test('the Name row stays out even beside address matches', () => {
    expect(list(document, 'inbox.').record.rows).toEqual([]);
    expect(list(document, 'example/inbox').record.rows.map(([, name]) => name)).toEqual(['inbox']);
  });

  test('a list longer than Chrome ranks in order gives its first 1,001 rows, and each of them opens', () => {
    const lines = Array.from({ length: 1_200 }, (_, i) => `m${i} https://x.example/${i}`);
    const shown = list(lines, 'x.example');
    expect(shown.record.rows.map(([, name]) => name)).toEqual(lines.slice(0, 1_001).map((line) => line.split(' ')[0]));
    expect(shown.suggestions.map(({ content }) => content)).toEqual(lines.slice(1, 1_001).map((line) => line.split(' ')[0]));
    expect(enteredTarget('m1000', shown.record, inputs(lines))).toEqual({ name: 'm1000', url: 'https://x.example/1000', argument: null });
  });
});

describe('contents (How G28, S7)', () => {
  test("a mapping row's content is its name, and an argument row's its filled URL, when they collide with nothing", () => {
    const shown = list(['gmail https://mail.example/', 'gmx https://gmx.example/', 'g https://g.example/?q=%s'], 'g');
    expect(contents(shown)).toEqual(['g (line 3)', 'gmail', 'gmx']);
    const argument = list(['g x https://gx.example/', 'g https://g.example/?q=%s'], 'g x');
    expect(argument.suggestions.map(({ content }) => content)).toEqual(['https://g.example/?q=x']);
  });

  test('a content equal to the typed text in the comparison form gets its line', () => {
    expect(contents(list(['a https://a/', 'ab https://ab/'], 'a'))).toEqual(['a (line 1)', 'ab']);
    expect(contents(list(['ab https://ab/', 'ab\u0085 https://ab85/'], ' ab\t'))).toEqual(['ab (line 1)', 'ab\u0085 (line 2)']);
  });

  test("a content equal to an earlier row's in the comparison form gets its line; the earlier keeps its bare name", () => {
    const shown = list(['a https://a/', 'ab https://ab/', 'a\tb https://atb/', 'a\u2028b https://alb/'], 'a');
    expect(contents(shown)).toEqual(['a (line 1)', 'ab', 'a\tb (line 3)', 'a\u2028b (line 4)']);
    expect(new Set(contents(shown).map(comparisonForm)).size).toBe(4);
  });

  test('a mapping listed only by its address takes a suffix too when its name sanitizes to the typed text', () => {
    const shown = list(['ab https://ab/', 'ab\u0085 https://ab85/', 'a\tb https://x/ab'], 'ab');
    expect(shown.record.rows.map(([, name]) => name)).toEqual(['ab', 'ab\u0085', 'a\tb']);
    expect(contents(shown)).toEqual(['ab (line 1)', 'ab\u0085 (line 2)', 'a\tb (line 3)']);
  });

  test('a content the comparison form leaves empty is never given bare', () => {
    expect(contents(list(['\u0085 https://nel/', '\u0085\u0085 https://nel2/'], '\u0085'))).toEqual(['\u0085 (line 1)', '\u0085\u0085 (line 2)']);
  });

  test('a content still taken with its line takes " 2", " 3", and on', () => {
    const shown = list(['ab https://ab/', 'ab (line 3) https://x/', 'ab (line 3) 2 https://y/', 'a\tb https://atb/'], 'a');
    expect(contents(shown)).toEqual(['ab', 'ab (line 3)', 'ab (line 3) 2', 'a\tb (line 4)']);
    const crowded = list(['ab https://ab/', 'ab (line 4) https://x/', 'ab (line 4) 2 https://y/', 'a\tb https://atb/'], 'a');
    expect(contents(crowded)).toEqual(['ab', 'ab (line 4)', 'ab (line 4) 2', 'a\tb (line 4) 3']);
  });

  test('contents are unique among themselves and against the typed text, both as given and as later Chrome sanitizes them', () => {
    const names = ['a', 'ab', 'a\tb', 'a\u2028b', 'ab\u0085', '\u0085ab', 'a b', 'ab\uFEFF', '\uFEFFab', 'ab (line 2)'];
    const shown = list(names.map((name, i) => `${name} https://n${i}/`), 'ab');
    const all = contents(shown);
    for (const form of [(text: string) => text, sanitized]) {
      const seen = all.map(form);
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).not.toContain(form('ab'));
      expect(seen).not.toContain('');
    }
  });
});

describe('the comparison form', () => {
  test("trims Chrome's whitespace, then removes what Chrome removes, then trims ECMAScript's", () => {
    expect(comparisonForm('\u0085 a\tb\u2028c\u2029 \u3000')).toBe('abc');
    expect(comparisonForm('\uFEFFab\uFEFF')).toBe('ab');
    expect(comparisonForm(' a b ')).toBe('a b');
  });

  test('is the same for a content and for what later Chrome hands back for it', () => {
    for (const content of ['ab', ' ab', 'a\tb (line 3)', '\u0085ab\u0085', '\uFEFF\tab', 'a\r\nb', '\u2028\u0085']) {
      expect(comparisonForm(sanitized(content)), JSON.stringify(content)).toBe(comparisonForm(content));
    }
  });
});

describe('descriptions (How G1, G2, G28)', () => {
  test('are escaped XML that reads as the name and the URL', () => {
    const lines = ['R&D <tools> https://e.example/?a=1&b=2', 'R&D x]]>y https://f.example/?<c>'];
    const shown = list(lines, 'R&D');
    expect(readText(shown.defaultDescription)).toBe('R&D <tools> – https://e.example/?a=1&b=2');
    expect(readText(shown.suggestions[0]!.description)).toBe('R&D x]]>y – https://f.example/?<c>');
    expect(shown.suggestions[0]!.description).not.toContain(']]>');
  });

  test('show a character XML 1.0 cannot hold as U+FFFD', () => {
    const shown = list(['vt\u000Bname https://v/', 'vt\u0001\uFFFE\uFFFF\uD800x https://w/'], 'vt');
    expect(readText(shown.defaultDescription)).toBe('vt\uFFFDname – https://v/');
    expect(readText(shown.suggestions[0]!.description)).toBe('vt\uFFFD\uFFFD\uFFFD\uFFFDx – https://w/');
    expect(shown.suggestions.map(({ content }) => content)).toEqual(['vt\u0001\uFFFE\uFFFF\uD800x']);
  });

  test("the default's holds no %s, a U+2060 between each % and s; a later row's keeps %s as written", () => {
    const aliases = ['yt https://www.youtube.com/results?search_query=%s', 'yt%s https://y/%s/%s?%%s'];
    const shown = list(aliases, 'yt');
    expect(readText(shown.defaultDescription)).toBe('yt – https://www.youtube.com/results?search_query=%\u2060s');
    expect(readText(shown.suggestions[0]!.description)).toBe('yt%s – https://y/%s/%s?%%s');
    const other = list([...aliases].reverse(), 'yt');
    expect(readText(other.defaultDescription)).toBe('yt – https://www.youtube.com/results?search_query=%\u2060s');
    expect(readText(list(aliases.slice(1), 'yt%').defaultDescription)).toBe('yt%\u2060s – https://y/%\u2060s/%\u2060s?%%\u2060s');
  });
});

describe('the stored record (State, omnibox)', () => {
  test('holds the typed text and each row\'s line, name, URL, and suffix, and reads back from storage', () => {
    const shown = list(['a b c https://abc/', 'a https://a/?q=%s'], 'a b');
    expect(shown.record).toEqual({ typed: 'a b', rows: [[1, 'a b c', 'https://abc/', ''], [2, 'a', 'https://a/?q=%s', '']], argumentRow: 1 });
    expect(shown.suggestions.map(({ content }) => content)).toEqual(['https://a/?q=b']);
    expect(readAddressBarRecord(JSON.parse(JSON.stringify(shown.record)))).toEqual(shown.record);
  });

  test('anything else stored under the key reads as no record', () => {
    const rows = [[1, 'a', 'https://a/', '']];
    for (const value of [
      undefined,
      null,
      'a',
      { rows, argumentRow: null },
      { typed: 'a', rows: [[1, 'a', 'https://a/']], argumentRow: null },
      { typed: 'a', rows: [['1', 'a', 'https://a/', '']], argumentRow: null },
      { typed: 'a', rows, argumentRow: 1 },
      { typed: 'a', rows, argumentRow: -1 },
      { typed: 'a', rows },
    ]) {
      expect(readAddressBarRecord(value), JSON.stringify(value)).toBeUndefined();
    }
  });

  test('keeps no content: an alias with 500 %s filled by a 2,000-character argument stores far less than its content', () => {
    const shown = list(['big https://big.example/?' + 'p=%s&'.repeat(500)], `big ${'a'.repeat(2_000)}`);
    const [content] = contents(shown);
    expect(content!.length).toBeGreaterThan(1_000_000);
    expect(JSON.stringify(shown.record).length).toBeLessThan(6_000);
  });

  test.each([
    ['names that collide with nothing', (i: number) => `m${i}`],
    ['names that all sanitize alike, every one but the first suffixed', (i: number) => `a${i.toString(3).replaceAll('0', '\t').replaceAll('1', '\u2028').replaceAll('2', '\u2029')}b`],
  ])('with 10,000 rows of %s, holds at most 0.5 MB of line numbers, suffixes, and structure', (_, name) => {
    const lines = Array.from({ length: 10_000 }, (_, i) => `${name(i + 1)} https://example.com/${i + 1}`);
    const { record } = list(lines, lines[0]!.startsWith('m') ? 'm' : 'a');
    // Row 1 and the 1,000 after it, all Chrome ranks in order (G28).
    expect(record.rows).toHaveLength(1_001);
    const structure = { ...record, typed: '', rows: record.rows.map(([line, , , suffix]) => [line, '', '', suffix]) };
    expect(new TextEncoder().encode(JSON.stringify(structure)).length).toBeLessThanOrEqual(500_000);
  });
});

describe('what Enter opens (How G28)', () => {
  const document = ['gm https://gm.example/', 'gmail https://mail.example/', 'gmx https://gmx.example/', 'g https://g.example/?q=%s'];

  test('the typed text, however its whitespace came back, opens stored row 1', () => {
    const { record } = list(document, 'gm');
    for (const text of ['gm', ' gm ', 'gm\t', '\u0085gm']) expect(enteredTarget(text, record, inputs(document)), JSON.stringify(text)).toEqual({ name: 'gm', url: 'https://gm.example/', argument: null });
  });

  test("a row's content, as given or as later Chrome sanitizes it, opens that row", () => {
    const lines = ['a https://a/', 'ab https://ab/', 'a\tb https://atb/', 'ab\u0085 https://ab85/'];
    const shown = list(lines, 'a');
    shown.record.rows.forEach(([, name, url], index) => {
      for (const text of [contentFor(shown, index), sanitized(contentFor(shown, index))]) {
        expect(enteredTarget(text, shown.record, inputs(lines)), JSON.stringify(text)).toEqual({ name, url, argument: null });
      }
    });
  });

  test("the argument row's content opens the alias with the argument read again from the stored text", () => {
    const lines = ['İ Cat list https://e.example/list', 'İ https://e.example/?q=%s'];
    const shown = list(lines, 'İ Cat');
    expect(shown.suggestions.map(({ content }) => content)).toEqual(['https://e.example/?q=Cat']);
    expect(enteredTarget('https://e.example/?q=Cat', shown.record, inputs(lines))).toEqual({ name: 'İ', url: 'https://e.example/?q=%s', argument: 'Cat' });
    // Cut at the lowercased name's length, the argument would be `at`: no row has that content.
    expect(enteredTarget('https://e.example/?q=at', shown.record, inputs(lines))).toBeUndefined();
  });

  test('a stored row opens with the name and URL stored for it, whatever the document holds now', () => {
    const { record } = list(document, 'gm');
    const changed = inputs(['gm https://other.example/', 'gmail https://other.example/mail']);
    expect(enteredTarget('gmail', record, changed)).toEqual({ name: 'gmail', url: 'https://mail.example/', argument: null });
    expect(enteredTarget('gm', record, changed)).toEqual({ name: 'gm', url: 'https://gm.example/', argument: null });
  });

  test('text that is neither the stored text nor a content opens row 1 of a fresh list for it, if any', () => {
    const { record } = list(document, 'zz');
    expect(record.rows).toEqual([]);
    expect(enteredTarget('gmail', record, inputs(document))).toEqual({ name: 'gmail', url: 'https://mail.example/', argument: null });
    expect(enteredTarget('g lo-fi', record, inputs(document))).toEqual({ name: 'g', url: 'https://g.example/?q=%s', argument: 'lo-fi' });
    expect(enteredTarget('qqq', record, inputs(document))).toBeUndefined();
    expect(enteredTarget('gmx', undefined, inputs(document))).toEqual({ name: 'gmx', url: 'https://gmx.example/', argument: null });
  });

  test('blank text opens nothing, with or without a record', () => {
    for (const stored of [undefined, list(document, '').record, list(document, 'gm').record]) {
      for (const text of ['', '   ', '\u0085']) expect(enteredTarget(text, stored, inputs(document)), JSON.stringify([text, stored?.typed])).toBeUndefined();
    }
  });

  test("text only Chrome's trim leaves empty opens row 1 of its list like any other text", () => {
    const lines = ['\u0085 https://nel.example/'];
    expect(enteredTarget('\u0085', undefined, inputs(lines))).toEqual({ name: '\u0085', url: 'https://nel.example/', argument: null });
    expect(enteredTarget('\u0085', list(lines, '\u0085').record, inputs(lines))).toEqual({ name: '\u0085', url: 'https://nel.example/', argument: null });
    expect(enteredTarget('', undefined, inputs(lines))).toBeUndefined();
  });

  test('a list with no row opens nothing for its own text', () => {
    expect(enteredTarget('qqq', list(document, 'qqq').record, inputs(document))).toBeUndefined();
    // Also when the document came to match it since: the one suggestion shown said nothing matches (G28).
    const { record } = list(['other https://other.example/'], 'gmail');
    expect(enteredTarget('gmail', undefined, inputs(document))).toEqual({ name: 'gmail', url: 'https://mail.example/', argument: null });
    expect(enteredTarget('gmail', record, inputs(document))).toBeUndefined();
  });

  test("an alias with 500 %s opens its filled URL from its content", () => {
    const lines = ['big https://big.example/?' + 'p=%s&'.repeat(500)];
    const shown = list(lines, `big ${'a'.repeat(2_000)}`);
    expect(enteredTarget(contentFor(shown, 0), shown.record, inputs([]))).toEqual({ name: 'big', url: lines[0]!.slice(4), argument: 'a'.repeat(2_000) });
  });
});
