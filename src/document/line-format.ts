// The text of a line the extension writes (F12): the name, spaces, the URL, and, with a note, a space, `\ `,
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
  return codePoints(neighbor.text.slice(0, neighbor.urlStart)) + 1;
}

/** The new line for valid `fields` with its URL at `column`, or one space after the name when the name leaves no room. */
export function formatNewLine({ name, url, note }: MappingFields, column: number): string {
  const spaces = ' '.repeat(Math.max(1, column - 1 - codePoints(name)));
  // F12 names no column for a new line's note: one space before it, and none at all without a note.
  return `${name}${spaces}${url}${note === '' ? '' : ` \\ ${note}`}`;
}

function codePoints(text: string): number {
  let count = 0;
  for (const _ of text) count++;
  return count;
}
