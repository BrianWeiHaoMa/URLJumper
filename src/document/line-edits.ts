// The single-line edits of G12 as splices of the original line strings: every line but the one concerned
// keeps its exact text and its own ending, so it comes back byte for byte (R3). Only an ending at the
// document's end ever changes besides: the last line gains the document's line ending when a line goes after
// it, and a line that becomes last, when the line after it is taken away or moved, loses one.
import type { Line, LineEnding } from './lines';

/**
 * What a change that put a line after the document's last line gave that last line: its exact text before
 * the change, and the ending the change gave it. The Undo that takes the new line away is handed this back,
 * since the document can no longer tell it once its first line break has changed (G12).
 */
export interface EndingGiven {
  text: string;
  ending: Exclude<LineEnding, ''>;
}

/** A document a line was inserted into, and, when the line went after the last line, the ending that line was given. */
export interface Inserted {
  document: string;
  endingGiven?: EndingGiven;
}

/** The ending a new line takes (F12): CRLF when the document's first line break is CRLF, else LF. */
export function documentLineEnding(lines: readonly Line[]): Exclude<LineEnding, ''> {
  return lines.find((line) => line.ending !== '')?.ending === '\r\n' ? '\r\n' : '\n';
}

/** The document of `lines` with `text` inserted as a line after line `after` (0: before line 1). */
export function insertLineAfter(lines: readonly Line[], after: number, text: string): Inserted {
  const ending = documentLineEnding(lines);
  const edited: Pick<Line, 'text' | 'ending'>[] = [...lines];
  if (after < lines.length) {
    edited.splice(after, 0, { text, ending });
    return { document: join(edited) };
  }
  // The last line always ends without a break: going after it, the new line is the last, and the old last
  // line gains the document's ending.
  const last = lines[after - 1]!;
  edited.splice(after - 1, 1, { text: last.text, ending }, { text, ending: '' });
  return { document: join(edited), endingGiven: { text: last.text, ending } };
}

/**
 * The document of `lines` without line `number` (G12). A line that is not last goes with its own ending.
 * When it is the last of several, the line before becomes last and loses its whole ending, unless it reads
 * as exactly the text and ending `endingGiven` says a change that put the removed line after it gave it:
 * then it becomes that text again, so a lone CR it ended in, which read with the LF given as one CRLF
 * ending, comes back.
 */
export function removeLine(lines: readonly Line[], number: number, endingGiven?: EndingGiven): string {
  const edited: Pick<Line, 'text' | 'ending'>[] = [...lines];
  if (number < lines.length || number === 1) {
    edited.splice(number - 1, 1);
  } else {
    const becomesLast = lines[number - 2]!;
    const given = endingGiven !== undefined && becomesLast.text + becomesLast.ending === endingGiven.text + endingGiven.ending;
    edited.splice(number - 2, 2, { text: given ? endingGiven.text : becomesLast.text, ending: '' });
  }
  return join(edited);
}

/**
 * The document of `lines` with line `from` cut and pasted so that it becomes line `to` (G12): every line keeps
 * its own ending, but when the line goes from last or to last, the line that becomes last loses its own and
 * the one that stops being last gains the document's, as the document stands before the move.
 */
export function moveLine(lines: readonly Line[], from: number, to: number): string {
  const edited: Pick<Line, 'text' | 'ending'>[] = [...lines];
  const [moved] = edited.splice(from - 1, 1);
  edited.splice(to - 1, 0, moved!);
  const last = lines.length;
  if ((from === last) !== (to === last)) {
    const stopsBeingLast = from === last ? to - 1 : last - 2;
    edited[stopsBeingLast] = { text: edited[stopsBeingLast]!.text, ending: documentLineEnding(lines) };
    edited[last - 1] = { text: edited[last - 1]!.text, ending: '' };
  }
  return join(edited);
}

/** The document of `lines` with line `number`'s exact text replaced by `text`, its own ending kept. */
export function replaceLine(lines: readonly Line[], number: number, text: string): string {
  const edited: Pick<Line, 'text' | 'ending'>[] = [...lines];
  edited.splice(number - 1, 1, { text, ending: lines[number - 1]!.ending });
  return join(edited);
}

function join(lines: readonly Pick<Line, 'text' | 'ending'>[]): string {
  return lines.map((line) => line.text + line.ending).join('');
}
