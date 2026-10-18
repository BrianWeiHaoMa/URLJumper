// The document's grammar (F4, 1.x's): each line is blank, comment-only, a mapping, or unreadable, and each
// mapping has a name, a URL, a note (F14), and a key. Whitespace is what ECMAScript `\s` matches, which is
// also what `String.prototype.trim` removes; names compare after `toLowerCase()`.
import { splitLines, type Line } from './lines';

export interface Mapping {
  line: number;
  name: string;
  url: string;
  /** The line's comment without its backslash and surrounding whitespace; null when the line has none. */
  note: string | null;
  /** What usage is recorded under: see `mappingKey`. */
  key: string;
}

/** Why a line is not a mapping: one run of text where a name and a URL are needed, a URL without a
 *  scheme, or a name an earlier mapping line already has. */
export type UnreadableProblem = 'needs-name-and-url' | 'no-scheme' | 'repeated-name';

export type ReadLine =
  | (Line & { kind: 'blank' })
  /** A line holding a comment and nothing else; runs of them are headings (see `findSections`). */
  | (Line & { kind: 'comment' })
  /** `urlStart`: where the URL starts in the line's exact text, as an index of UTF-16 code units. */
  | (Line & { kind: 'mapping'; mapping: Mapping; urlStart: number })
  | (Line & { kind: 'unreadable'; problem: UnreadableProblem });

export interface ReadDocument {
  lines: ReadLine[];
  /** The mapping lines' mappings, in line order. */
  mappings: Mapping[];
}

// ASCII only, as 1.x's `/^[a-z][a-z\d+.-]*:/i`.
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const WHITESPACE = /\s/;

/** Whether `url` begins with a scheme (F4). */
export function hasScheme(url: string): boolean {
  return SCHEME.test(url);
}

/** What names are compared by: two names are the same when these are equal (F4, as 1.x compared them). */
export function comparableName(name: string): string {
  return name.toLowerCase();
}

/** A mapping's key: its lowercased name, a line feed, and its URL as written. */
export function mappingKey(name: string, url: string): string {
  return `${comparableName(name)}\n${url}`;
}

export function readDocument(document: string): ReadDocument {
  const lines: ReadLine[] = [];
  const mappings: Mapping[] = [];
  // Only a mapping line lends its name: a line refused for its URL reserves nothing, as in 1.x.
  const namesSeen = new Set<string>();
  for (const line of splitLines(document)) {
    const read = readLine(line, namesSeen);
    lines.push(read);
    if (read.kind === 'mapping') mappings.push(read.mapping);
  }
  return { lines, mappings };
}

function readLine(line: Line, namesSeen: Set<string>): ReadLine {
  const commentAt = line.text.indexOf('\\');
  const beforeComment = commentAt === -1 ? line.text : line.text.slice(0, commentAt);
  const content = beforeComment.trim();
  if (content === '') return { ...line, kind: commentAt === -1 ? 'blank' : 'comment' };

  // Scanned by hand rather than by a regular expression anchored at the end, which backtracks
  // quadratically on long runs; a line may be as long as the whole document (E3).
  let urlStart = content.length;
  while (urlStart > 0 && !WHITESPACE.test(content.charAt(urlStart - 1))) urlStart--;
  if (urlStart === 0) return { ...line, kind: 'unreadable', problem: 'needs-name-and-url' };
  const url = content.slice(urlStart);
  if (!hasScheme(url)) return { ...line, kind: 'unreadable', problem: 'no-scheme' };
  let nameEnd = urlStart;
  while (WHITESPACE.test(content.charAt(nameEnd - 1))) nameEnd--;
  const name = content.slice(0, nameEnd);

  const lowered = comparableName(name);
  if (namesSeen.has(lowered)) return { ...line, kind: 'unreadable', problem: 'repeated-name' };
  namesSeen.add(lowered);
  const note = commentAt === -1 ? null : line.text.slice(commentAt + 1).trim();
  const contentStart = beforeComment.length - beforeComment.trimStart().length;
  return {
    ...line,
    kind: 'mapping',
    mapping: { line: line.number, name, url, note, key: mappingKey(name, url) },
    urlStart: contentStart + urlStart,
  };
}
