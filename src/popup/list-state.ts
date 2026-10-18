// The popup's list (G3, F13): the rows of the search list, the window of seven of them on screen, and the
// selected row, which is always inside the window.
import { searchList, type SearchInput, type SearchRow } from '../document/search';

/** How many rows the popup shows at a time (F13). */
export const WINDOW_ROWS = 7;

export interface ListState {
  /** The search list's rows as it returns them, the Name row included. */
  rows: readonly SearchRow[];
  /** Whether the typed text was blank, so the rows are every mapping and nothing is selected until Down. */
  blank: boolean;
  /** The selected row's index in `rows`, or null when nothing is selected. */
  selected: number | null;
  /** The index in `rows` of the window's first row. */
  top: number;
}

/** A new list for `input`: for typed text its first row is selected, for blank text nothing is (G3). */
export function newList(input: SearchInput): ListState {
  const found = searchList(input);
  // The search list holds `all` rows exactly when the text is blank, and for other text at least the Name row.
  const blank = found.length === 0 || found[0]!.group === 'all';
  return { rows: found, blank, selected: !blank && found.length > 0 ? 0 : null, top: 0 };
}

/** The list for `input` after a storage change: the same rows keep their selection and window; other rows are a new list. */
export function relist(list: ListState, input: SearchInput): ListState {
  const next = newList(input);
  return next.blank === list.blank && sameRows(next.rows, list.rows) ? { ...list, rows: next.rows } : next;
}

/**
 * The list with the selection moved one row down or up, wrapping at the ends, and the window following it.
 * With nothing selected, Down selects the window's first row and Up does nothing (G3).
 */
export function move(list: ListState, step: 1 | -1): ListState {
  const count = list.rows.length;
  if (count === 0) return list;
  if (list.selected === null) return step === 1 ? select(list, list.top) : list;
  return select(list, (list.selected + step + count) % count);
}

/** The list with its window moved by `rows` (negative for up), kept inside the list, and the selection kept inside the window. */
export function scroll(list: ListState, rows: number): ListState {
  const top = clamp(list.top + rows, 0, Math.max(0, list.rows.length - WINDOW_ROWS));
  const selected = list.selected === null ? null : clamp(list.selected, top, top + WINDOW_ROWS - 1);
  return { ...list, top, selected };
}

/** How many rows lie above and below the window. */
export function outsideWindow(list: ListState): { above: number; below: number } {
  return { above: list.top, below: Math.max(0, list.rows.length - list.top - WINDOW_ROWS) };
}

function select(list: ListState, selected: number): ListState {
  let top = list.top;
  if (selected < top) top = selected;
  else if (selected >= top + WINDOW_ROWS) top = selected - WINDOW_ROWS + 1;
  return { ...list, selected, top };
}

function sameRows(a: readonly SearchRow[], b: readonly SearchRow[]): boolean {
  return a.length === b.length && a.every((row, i) => rowIdentity(row) === rowIdentity(b[i]!));
}

function rowIdentity(row: SearchRow): string {
  if (row.group === 'name') return `name\n${row.name}`;
  const argument = row.group === 'argument' ? row.argument : '';
  return `${row.group}\n${row.mapping.line}\n${row.mapping.key}\n${argument}`;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
