import { describe, expect, test } from 'vitest';
import { mappingKey, readDocument, type ReadLine } from './grammar';

const read = (...lines: string[]) => readDocument(lines.join('\n')).lines;

/** A line's kind, with the problem of an unreadable one. */
const kind = (line: ReadLine | undefined) =>
  line?.kind === 'unreadable' ? `unreadable: ${line.problem}` : line?.kind;

const mappingOf = (text: string) => {
  const [line] = read(text);
  if (line?.kind !== 'mapping') throw new Error(`not a mapping: ${JSON.stringify(text)} is ${kind(line)}`);
  return line.mapping;
};

describe('blank and comment lines', () => {
  test('the empty document is one blank line with no mappings', () => {
    const { lines, mappings } = readDocument('');
    expect(lines.map(kind)).toEqual(['blank']);
    expect(mappings).toEqual([]);
  });

  test('the empty line after a final break is blank', () => {
    expect(read('a https://a', '').map(kind)).toEqual(['mapping', 'blank']);
  });

  test('whitespace is what \\s matches: a line of U+3000 alone is blank', () => {
    expect(read('\u3000', ' \t\u00A0\uFEFF').map(kind)).toEqual(['blank', 'blank']);
  });

  test('a line holding a comment and nothing else is a comment line, even when it looks like a URL', () => {
    expect(read('\\https://x', '   \\ indented', '\\').map(kind)).toEqual(['comment', 'comment', 'comment']);
  });
});

describe('mapping lines', () => {
  test('the URL is the last run of non-whitespace and the name keeps its inner whitespace', () => {
    expect(mappingOf('team  calendar\t https://c')).toMatchObject({ name: 'team  calendar', url: 'https://c' });
    expect(mappingOf('  spaced  out   https://s  ')).toMatchObject({ name: 'spaced  out', url: 'https://s' });
  });

  test('any \\s separates, a non-breaking space included', () => {
    expect(mappingOf('a\u00A0https://x')).toMatchObject({ name: 'a', url: 'https://x' });
  });

  test('a backslash inside a would-be URL starts the comment, which is the note', () => {
    expect(mappingOf('a https://x.com/a\\b')).toMatchObject({ name: 'a', url: 'https://x.com/a', note: 'b' });
    expect(read('a\\https://x').map(kind)).toEqual(['unreadable: needs-name-and-url']);
  });

  test('a note loses its backslash and surrounding whitespace; later backslashes belong to it', () => {
    expect(mappingOf('news https://n  \\  a \\ b ').note).toBe('a \\ b');
    expect(mappingOf('news https://n \\').note).toBe('');
    expect(mappingOf('news https://n').note).toBeNull();
  });

  test('a scheme is an ASCII letter, then ASCII letters, digits, +, . or -, then a colon, in either case', () => {
    for (const text of ['a HTTPS://x', 'a h+t.t-p:x', 'a x:', 'a Z9:']) expect(read(text).map(kind)).toEqual(['mapping']);
    for (const text of ['a 1http://x', 'a ñ:x', 'a https//x', 'a \u212A:x', 'a \u017F:x', 'a a\u0661:x', 'a +a:x']) {
      expect(read(text).map(kind), text).toEqual(['unreadable: no-scheme']);
    }
  });

  test('a line of one run of text has no name and URL', () => {
    expect(read('https://x', 'name', '  https://x  \\ note').map(kind)).toEqual([
      'unreadable: needs-name-and-url',
      'unreadable: needs-name-and-url',
      'unreadable: needs-name-and-url',
    ]);
  });

  test('the key is the lowercased name, a line feed, and the URL as written', () => {
    expect(mappingOf('Mail https://A.example').key).toBe('mail\nhttps://A.example');
    expect(mappingKey('Mail', 'https://A.example')).toBe('mail\nhttps://A.example');
  });

  test('a mapping carries its line number', () => {
    const { mappings } = readDocument('\\ h\n\na https://a\r\nb https://b');
    expect(mappings.map(({ line, name }) => [line, name])).toEqual([[3, 'a'], [4, 'b']]);
  });
});

describe('repeated names', () => {
  test('a name an earlier mapping line has, in another case, is unreadable', () => {
    expect(read('Mail https://a', 'mail https://b').map(kind)).toEqual(['mapping', 'unreadable: repeated-name']);
  });

  test('a line refused for its URL reserves no name', () => {
    expect(read('x notaurl', 'x https://b').map(kind)).toEqual(['unreadable: no-scheme', 'mapping']);
  });

  test('names compare after toLowerCase, which keeps ß apart from SS', () => {
    expect(read('Straße https://a', 'STRASSE https://b').map(kind)).toEqual(['mapping', 'mapping']);
  });

  test('the first of several same-named lines stays the mapping', () => {
    const { lines, mappings } = readDocument('a https://1\nA https://2\na https://3');
    expect(lines.map(kind)).toEqual(['mapping', 'unreadable: repeated-name', 'unreadable: repeated-name']);
    expect(mappings.map(({ url }) => url)).toEqual(['https://1']);
  });
});

test('each line keeps its exact text and ending', () => {
  const { lines } = readDocument('a https://a \\ n\r\n\\ h\nbad');
  expect(lines.map(({ number, text, ending }) => [number, text, ending])).toEqual([
    [1, 'a https://a \\ n', '\r\n'],
    [2, '\\ h', '\n'],
    [3, 'bad', ''],
  ]);
});

test('a line as long as E3 allows reads without backtracking over its runs', () => {
  const line = `a${' '.repeat(250_000)}${'x'.repeat(250_000)}\u00A0https://y`;
  const started = Date.now();
  expect(readDocument(line).mappings).toMatchObject([{ name: `a${' '.repeat(250_000)}${'x'.repeat(250_000)}`, url: 'https://y' }]);
  expect(Date.now() - started).toBeLessThan(1_000);
});
