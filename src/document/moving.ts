// Moving one mapping line (G12, G13, G15): cut and pasted directly before the previous mapping line (up) or
// directly after the next (down), so comment, blank, and unreadable lines keep their order and every other
// mapping its place among them; and the Undo that moves it back to the number it had. The line is found again
// by its anchor, so only a mapping line ever moves (R3). One check on the result keeps "no mapping moves past
// another line with its name": every other line keeps the kind it had. The only other line with a mapping's
// name is an unreadable line repeating it; passed, it would become the mapping and the moved line unreadable
// without a byte of either changing (G13: no unreadable line of the extension's own making).
import { findAnchor, type Anchor } from './anchor';
import { readDocument, type ReadLine } from './grammar';
import { moveLine } from './line-edits';

export type MoveDirection = 'up' | 'down';

export type MoveResult =
  /** `from`: where the line was found; `line`: its number now; `text`: its exact text now, one CR shorter when a lone CR it ended in joined an ending it gained. */
  | { kind: 'applied'; document: string; from: number; line: number; text: string }
  /** No mapping line, or several, stands as `anchor` names it: the line changed or went since it was loaded. */
  | { kind: 'stale' }
  | Immovable;

/** The document admits no such move: no mapping line before the line (up) or after it (down), `passing` null; or a line with its name in the way, `passing` its number. */
export type Immovable = { kind: 'immovable'; passing: number | null };

/** `document` with the mapping line `anchor` names moved one mapping line up or down (G12). */
export function moveMapping(document: string, anchor: Anchor, direction: MoveDirection): MoveResult {
  const { lines } = readDocument(document);
  const from = findAnchor(lines, anchor.line, anchor.text);
  if (from === undefined) return { kind: 'stale' };
  const to = neighbouringMapping(lines, from, direction);
  if (to === undefined) return { kind: 'immovable', passing: null };
  const after = moveLine(lines, from, to);
  const moved = readDocument(after).lines;
  const passing = lineWithItsNamePassed(lines, moved, from, to);
  if (passing !== undefined) return { kind: 'immovable', passing };
  return { kind: 'applied', document: after, from, line: to, text: moved[to - 1]!.text };
}

/** What `moveMapping` would do with the mapping line `anchor` names: applied from line `from` to line `line`, stale, or refused and why. */
export type MoveOffer = { kind: 'applied'; from: number; line: number } | { kind: 'stale' } | Immovable;

/** What each move of the mapping line `anchor` names would come to on `document` as last read: the moves a row editor offers, and why one is not. */
export function movesAdmitted(document: string, anchor: Anchor): Record<MoveDirection, MoveOffer> {
  const offer = (direction: MoveDirection): MoveOffer => {
    const result = moveMapping(document, anchor, direction);
    return result.kind === 'applied' ? { kind: 'applied', from: result.from, line: result.line } : result;
  };
  return { up: offer('up'), down: offer('down') };
}

export type MoveBackResult =
  /** `from`: where the line was found; `line`: its number now; `text`: its exact text now, one CR shorter when a lone CR it ended in joined an ending it gained. */
  | { kind: 'applied'; document: string; line: number; text: string; from: number }
  /** No mapping line, or several, stands as `anchor` names it: the line is not as the move left it. */
  | { kind: 'stale' }
  /** Going back would pass a line with its name: `line` is that line's number. */
  | { kind: 'name-taken'; line: number };

/**
 * `document` with the mapping line `anchor` names, the line as a move (or a move back) left it, moved back so
 * that it is line `to`, the number it had, or the last line when the document now has fewer than `to` lines
 * (Composition, *undo*). Not the opposite move, which would not put back the lines between in their order.
 */
export function moveLineBack(document: string, anchor: Anchor, to: number): MoveBackResult {
  const { lines } = readDocument(document);
  const from = findAnchor(lines, anchor.line, anchor.text);
  if (from === undefined) return { kind: 'stale' };
  const line = Math.min(to, lines.length);
  const after = moveLine(lines, from, line);
  const moved = readDocument(after).lines;
  const passed = lineWithItsNamePassed(lines, moved, from, line);
  if (passed !== undefined) return { kind: 'name-taken', line: passed };
  return { kind: 'applied', document: after, line, text: moved[line - 1]!.text, from };
}

/** The number of the mapping line before line `from` (up) or after it (down); undefined when there is none. */
function neighbouringMapping(lines: readonly ReadLine[], from: number, direction: MoveDirection): number | undefined {
  const others = direction === 'up' ? lines.slice(0, from - 1).reverse() : lines.slice(from);
  return others.find((line) => line.kind === 'mapping')?.number;
}

/**
 * The number in `lines` of the line that moving line `from` to line `to`, giving `moved`, passed with the
 * moved line's name: an unreadable line repeating it, which would now read as the mapping (and the moved line
 * then as the repeat); undefined when every other line reads as the kind it was. Nothing else changes a line's
 * kind: a move keeps every byte, and an ending gained at the document's end can only join a lone CR the line
 * ended in, whitespace either way, making its exact text one CR shorter and nothing more.
 */
function lineWithItsNamePassed(lines: readonly ReadLine[], moved: readonly ReadLine[], from: number, to: number): number | undefined {
  const order = lines.map((line) => line.number).filter((number) => number !== from);
  order.splice(to - 1, 0, from);
  return order.find((number, index) => number !== from && moved[index]!.kind !== lines[number - 1]!.kind);
}
