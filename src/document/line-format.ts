// The text of a line the extension writes (F12): the name, spaces, the URL, and, with a note, spaces, `\ `,
// and the note. Columns count Unicode code points from 1, so a tab or an emoji is one column.
import type { ReadLine } from './grammar';
import type { MappingFields } from './validation';

/** Where the URL starts when no mapping line lends a column. */
const DEFAULT_URL_COLUMN = 22;

/**
 * The column a new line's URL starts at when the line goes after line `after` (0: before line 1): the column
 * of the URL on the nearest mapping line above, line `after` included, else on the nearest below, else 22.
 * An unreadable or comment line lends no column.
 */
export function urlColumn(lines: readonly ReadLine[], after: number): number {
  const above = lines.slice(0, after).findLast((line) => line.kind === 'mapping');
  const neighbor = above ?? lines.slice(after).find((line) => line.kind === 'mapping');
  if (neighbor?.kind !== 'mapping') return DEFAULT_URL_COLUMN;
  return columnOf(neighbor.text, neighbor.urlStart);
}

/** The new line for valid `fields` with its URL at `column`, or one space after the name when the name leaves no room. */
export function formatNewLine({ name, url, note }: MappingFields, column: number): string {
  // F12 names no column for a new line's note: one space before it, and none at all without a note.
  return `${atColumn(name, column, url)}${note === '' ? '' : ` \\ ${note}`}`;
}

/**
 * Mapping line `line` rewritten with valid `fields` (F12): the name starts the line, the URL starts at the
 * column it starts at on `line`, and the note's first character at the column the note's has there, each
 * with one space before it instead when what comes before leaves none. The note's backslash stands two
 * columns before the note, as on every line the extension writes; a line with no note, or an empty one,
 * lends no column, and a note added to it follows the URL after one space. Without a note the line ends at
 * its URL (G14).
 */
export function formatRewrittenLine(line: Extract<ReadLine, { kind: 'mapping' }>, { name, url, note }: MappingFields): string {
  const throughUrl = atColumn(name, columnOf(line.text, line.urlStart), url);
  if (note === '') return throughUrl;
  // With no column to keep, the column 0 asks for no more than the one space.
  const noteColumn = line.noteStart === null ? 0 : columnOf(line.text, line.noteStart);
  return atColumn(throughUrl, noteColumn - 2, `\\ ${note}`);
}

/** `before`, then spaces up to `column`, or one space when `before` leaves no room, then `after`. */
function atColumn(before: string, column: number, after: string): string {
  return `${before}${' '.repeat(Math.max(1, column - 1 - codePoints(before)))}${after}`;
}

/** The column, from 1 in code points, of the character at UTF-16 index `index` of `text`. */
function columnOf(text: string, index: number): number {
  return codePoints(text.slice(0, index)) + 1;
}

function codePoints(text: string): number {
  let count = 0;
  for (const _ of text) count++;
  return count;
}
