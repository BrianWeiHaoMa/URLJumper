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

/** What makes a line unreadable; for a repeated name, `heldBy` is the number of the mapping line that has it. */
export type Unreadable = { problem: Exclude<UnreadableProblem, 'repeated-name'> } | { problem: 'repeated-name'; heldBy: number };

export type ReadLine =
  | (Line & { kind: 'blank' })
  /** A line holding a comment and nothing else; runs of them are headings (see `findSections`). */
  | (Line & { kind: 'comment' })
  /**
   * `urlStart`: where the URL starts in the line's exact text, as an index of UTF-16 code units; `noteStart`:
   * where its note starts, the same way, or null when the line has no note or an empty one.
   */
  | (Line & { kind: 'mapping'; mapping: Mapping; urlStart: number; noteStart: number | null })
  | (Line & { kind: 'unreadable' } & Unreadable);

/** An error of the document by F4: an unreadable line, by its number, with what makes it one. */
export type DocumentError = { line: number } & Unreadable;

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

/**
 * The name of the line `text` read on its own, as names are compared (`comparableName`); null when such a line
 * is not a mapping line, as a blank or comment line, which has no name.
 */
export function comparableLineName(text: string): string | null {
  const mapping = mappingOfLine(text);
  return mapping === undefined ? null : comparableName(mapping.name);
}

/**
 * The mapping of the line `text` read on its own, as line 1: its name, URL, and note as a change wrote or
 * found them; undefined when such a line is not a mapping line.
 */
export function mappingOfLine(text: string): Mapping | undefined {
  const read = readLine({ number: 1, text, ending: '' }, new Map());
  return read.kind === 'mapping' ? read.mapping : undefined;
}

export function readDocument(document: string): ReadDocument {
  const lines: ReadLine[] = [];
  const mappings: Mapping[] = [];
  // Only a mapping line lends its name: a line refused for its URL reserves nothing, as in 1.x.
  const namesSeen = new Map<string, number>();
  for (const line of splitLines(document)) {
    const read = readLine(line, namesSeen);
    lines.push(read);
    if (read.kind === 'mapping') mappings.push(read.mapping);
  }
  return { lines, mappings };
}

/**
 * Every error of `document` by F4, in line order: the lines it cannot read (G17). The Text view lists them
 * and refuses to save while there is one, and the worker refuses a *replace* whose text has one.
 */
export function documentErrors(document: string): DocumentError[] {
  const errors: DocumentError[] = [];
  for (const line of readDocument(document).lines) {
    if (line.kind !== 'unreadable') continue;
    errors.push(line.problem === 'repeated-name' ? { line: line.number, problem: line.problem, heldBy: line.heldBy } : { line: line.number, problem: line.problem });
  }
  return errors;
}

function readLine(line: Line, namesSeen: Map<string, number>): ReadLine {
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
  const heldBy = namesSeen.get(lowered);
  if (heldBy !== undefined) return { ...line, kind: 'unreadable', problem: 'repeated-name', heldBy };
  namesSeen.set(lowered, line.number);
  const comment = commentAt === -1 ? null : line.text.slice(commentAt + 1);
  const note = comment === null ? null : comment.trim();
  const contentStart = beforeComment.length - beforeComment.trimStart().length;
  return {
    ...line,
    kind: 'mapping',
    mapping: { line: line.number, name, url, note, key: mappingKey(name, url) },
    urlStart: contentStart + urlStart,
    noteStart: comment === null || note === '' ? null : commentAt + 1 + comment.length - comment.trimStart().length,
  };
}
