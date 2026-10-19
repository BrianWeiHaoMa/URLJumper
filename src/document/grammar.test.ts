import { describe, expect, test } from 'vitest';
import { comparableName, documentErrors, hasScheme, mappingKey, mappingOfLine, readDocument, type ReadLine } from './grammar';
import { validateMapping } from './validation';

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

  test("a mapping line records where its URL starts in the line's exact text", () => {
    const urlStart = (text: string) => {
      const [line] = read(text);
      return line?.kind === 'mapping' ? line.urlStart : undefined;
    };
    expect(urlStart('a https://x')).toBe(2);
    expect(urlStart('  team  calendar\t https://c  \\ https://c')).toBe(18);
    expect(urlStart('😀 https://x')).toBe(3);
  });

  test("a mapping line records where its note starts in the line's exact text, none without a note or with an empty one", () => {
    const noteStart = (text: string) => {
      const [line] = read(text);
      return line?.kind === 'mapping' ? line.noteStart : undefined;
    };
    expect(noteStart('a https://x \\ note')).toBe(14);
    expect(noteStart('a https://x\\note')).toBe(12);
    expect(noteStart('😀 https://x  \\\t note \\ more')).toBe(17);
    expect(noteStart('a https://x')).toBeNull();
    expect(noteStart('a https://x   \\   ')).toBeNull();
  });

  test('the scheme rule and the name comparison are the ones validation shares', () => {
    expect(hasScheme('a1+.-:x')).toBe(true);
    expect(hasScheme('\u212A:x')).toBe(false);
    expect(comparableName('\u212A')).toBe(comparableName('K'));
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

describe('the errors of a document (G17)', () => {
  test('every unreadable line is an error, in line order, with its number and problem', () => {
    const draft = ['mail  https://mail/', 'just-a-name', 'b  https://b/', '\\ heading', 'a  example.com', '', 'c  https://c/', 'x', 'Mail  https://m/'].join('\n');
    expect(documentErrors(draft)).toEqual([
      { line: 2, problem: 'needs-name-and-url' },
      { line: 5, problem: 'no-scheme' },
      { line: 8, problem: 'needs-name-and-url' },
      { line: 9, problem: 'repeated-name', heldBy: 1 },
    ]);
  });

  test('a repeated name names the mapping line that has it, not an earlier line refused for its URL', () => {
    expect(documentErrors('a  nourl\nA  https://1\na  https://2\nA  https://3')).toEqual([
      { line: 1, problem: 'no-scheme' },
      { line: 3, problem: 'repeated-name', heldBy: 2 },
      { line: 4, problem: 'repeated-name', heldBy: 2 },
    ]);
  });

  test('line numbers count LF and CRLF breaks only: a lone CR is content of its line', () => {
    expect(documentErrors('a  https://a/\r\njust-a-name\nb  https://b/\r\nname-only\r\n')).toEqual([
      { line: 2, problem: 'needs-name-and-url' },
      { line: 4, problem: 'needs-name-and-url' },
    ]);
    // A lone CR is whitespace inside the line: here it separates a name from something that is not a URL.
    expect(documentErrors('ok  https://ok/\na\rb\nlast  https://l/')).toEqual([{ line: 2, problem: 'no-scheme' }]);
    // And here a name that holds a URL and a CR from the URL that ends the line, which reads.
    expect(documentErrors('x  https://x/\ry  https://y/\nlast  https://l/')).toEqual([]);
    expect(documentErrors('just-a-name\r\nok  https://ok/')).toEqual([{ line: 1, problem: 'needs-name-and-url' }]);
  });

  test('an empty document, and one of only whitespace, comments, and blank lines, has no error', () => {
    for (const document of ['', '\n', '   \t\r\n\u00A0\n', '\\ only a comment\r\n\n']) expect(documentErrors(document), JSON.stringify(document)).toEqual([]);
  });

  test("lines F4 reads are no error, a note holding a backslash among them, which the rules for typed values refuse", () => {
    const draft = 'a  https://a/ \\ note\\more\nteam  calendar\t https://c/\nno\u00A0break space  https://n/\n';
    expect(documentErrors(draft)).toEqual([]);
    expect(validateMapping({ name: 'a', url: 'https://a/', note: 'note\\more' }, [])).toMatchObject({ kind: 'invalid', field: 'note' });
  });
});

test("a line read on its own gives its mapping, as a change wrote or found it; a line that is no mapping, none", () => {
  expect(mappingOfLine('news   https://n.example/   \\ my note ')).toEqual({ line: 1, name: 'news', url: 'https://n.example/', note: 'my note', key: 'news\nhttps://n.example/' });
  expect(mappingOfLine('a b  x:1')).toMatchObject({ name: 'a b', url: 'x:1', note: null });
  for (const text of ['', '  ', '\\ heading', 'just-a-name', 'name  no-scheme']) expect(mappingOfLine(text), text).toBeUndefined();
});
