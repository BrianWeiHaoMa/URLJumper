// Removing one mapping line (G12, G13, G15): a *remove*, and the Undo that takes away the line an insert or
// a re-insertion added, each found again by its anchor, so lines added or removed above it since do not lose
// it, and only a mapping line is ever removed (R3).
import { findAnchor, type Anchor } from './anchor';
import { readDocument } from './grammar';
import { removeLine, type EndingGiven } from './line-edits';

export type RemoveResult =
  /** `line` is the number the line had where it was found, and `text` its exact text. */
  | { kind: 'applied'; document: string; line: number; text: string }
  /** No mapping line, or several, stands as `anchor` names it. */
  | { kind: 'stale' };

/**
 * `document` without the mapping line `anchor` names. When it is the last line, the line before loses its
 * own ending, or, given what the change that put the line after it gave it, exactly that (`removeLine`).
 */
export function removeMapping(document: string, anchor: Anchor, endingGiven?: EndingGiven): RemoveResult {
  const { lines } = readDocument(document);
  const found = findAnchor(lines, anchor.line, anchor.text);
  if (found === undefined) return { kind: 'stale' };
  return { kind: 'applied', document: removeLine(lines, found, endingGiven), line: found, text: anchor.text };
}
