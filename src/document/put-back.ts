// The Undo acts that write back the exact text a line had (G15): a line a change took away, put back at its
// former number, and a rewritten line's former text, restored in its place. What goes back is a line the
// document held, spliced as it was and never formatted again, so its columns and its note come back too;
// G8 and G14's rules for typed values are not applied to it (How G8/G14). Each is refused while another
// mapping line has its name, or when the text would not read where it lands as one mapping line with exactly
// that text, as a page can send any text (G13). A text is taken as Chrome stores it, a lone surrogate as
// U+FFFD, so its name is checked as it will be read.
import { findAnchor, type Anchor } from './anchor';
import { readDocument } from './grammar';
import { insertLineAfter, replaceLine, type EndingGiven } from './line-edits';
import { holderOfName, mappingsBesides } from './validation';

export type ReinsertResult =
  /** `endingGiven`, present when the line went after the last line, is what its Undo is handed back. */
  | { kind: 'applied'; document: string; line: number; text: string; endingGiven?: EndingGiven }
  /** Another mapping line has the line's name, compared as the grammar compares names; `line` is its number. */
  | { kind: 'name-taken'; line: number }
  /** The text would not stand where it goes as one mapping line with that exact text. */
  | { kind: 'unreadable' };

/**
 * `document` with `text`, the exact text of a line a change took away, put back as line `line`, its former
 * number, or after the last line when the document now has fewer than `line` − 1 lines (Composition, *undo*):
 * that last line may be the empty one a final line break leaves. It takes the document's line ending, or,
 * going after the last line, the old last line gains it (G12).
 */
export function reinsertLine(document: string, line: number, text: string): ReinsertResult {
  const kept = text.toWellFormed();
  const name = nameOnItsOwn(kept);
  if (name === undefined) return { kind: 'unreadable' };
  const { lines, mappings } = readDocument(document);
  const holder = holderOfName(mappings, name);
  if (holder) return { kind: 'name-taken', line: holder.line };
  const after = Math.min(line - 1, lines.length);
  const reinserted = insertLineAfter(lines, after, kept);
  if (!standsAs(reinserted.document, after + 1, kept)) return { kind: 'unreadable' };
  return { kind: 'applied', ...reinserted, line: after + 1, text: kept };
}

export type RestoreResult =
  /** `line` is where the line was found and `text` the exact text it holds again. */
  | { kind: 'applied'; document: string; line: number; text: string }
  /** No mapping line, or several, stands as `anchor` names it: the line is not as the rewrite left it. */
  | { kind: 'stale' }
  | { kind: 'name-taken'; line: number }
  | { kind: 'unreadable' };

/**
 * `document` with the mapping line `anchor` names, the line as a rewrite (or a restore) left it, holding
 * `former` again, the exact text it had before, with the line's own ending. Its name may be the line's own
 * now; any other mapping line having it refuses the restore.
 */
export function restoreLine(document: string, anchor: Anchor, former: string): RestoreResult {
  const { lines, mappings } = readDocument(document);
  const found = findAnchor(lines, anchor.line, anchor.text);
  if (found === undefined) return { kind: 'stale' };
  const kept = former.toWellFormed();
  const name = nameOnItsOwn(kept);
  if (name === undefined) return { kind: 'unreadable' };
  const holder = holderOfName(mappingsBesides(mappings, found), name);
  if (holder) return { kind: 'name-taken', line: holder.line };
  const restored = replaceLine(lines, found, kept);
  if (!standsAs(restored, found, kept)) return { kind: 'unreadable' };
  return { kind: 'applied', document: restored, line: found, text: kept };
}

/** The name of `text` read on its own as one mapping line; undefined when it is not exactly that. */
function nameOnItsOwn(text: string): string | undefined {
  const own = readDocument(text);
  return own.lines.length === 1 && own.mappings.length === 1 ? own.mappings[0]!.name : undefined;
}

/**
 * Whether line `number` of `document` reads as a mapping line with exact text `text`: a text ending in a lone
 * CR would read, with a line ending put after it, as a shorter line with a CRLF.
 */
function standsAs(document: string, number: number, text: string): boolean {
  const landed = readDocument(document).lines[number - 1];
  return landed?.kind === 'mapping' && landed.text === text;
}
