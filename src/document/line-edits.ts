// The single-line edits of G12 as splices of the original line strings: every line but the one concerned
// keeps its exact text and its own ending, so it comes back byte for byte (R3). Only the document's last
// line ever changes besides: it gains the document's line ending when a line goes after it, and loses an
// ending when the line after it is taken away.
import type { Line, LineEnding } from './lines';

/** The ending a new line takes (F12): CRLF when the document's first line break is CRLF, else LF. */
export function documentLineEnding(lines: readonly Line[]): Exclude<LineEnding, ''> {
  return lines.find((line) => line.ending !== '')?.ending === '\r\n' ? '\r\n' : '\n';
}

/** The document of `lines` with `text` inserted as a line after line `after` (0: before line 1). */
export function insertLineAfter(lines: readonly Line[], after: number, text: string): string {
  const ending = documentLineEnding(lines);
  const edited: Pick<Line, 'text' | 'ending'>[] = [...lines];
  // The last line always ends without a break: going after it, the new line is the last, and the old last
  // line gains the document's ending.
  if (after === lines.length) edited.splice(after - 1, 1, { text: lines[after - 1]!.text, ending }, { text, ending: '' });
  else edited.splice(after, 0, { text, ending });
  return join(edited);
}

/**
 * The document of `lines` without line `number`, which an insert added and an Undo takes back (G12, G15). When
 * it is the last line, the line before becomes last and loses only the ending the insert gave it: the
 * document's line ending as it was before the insert, which the lines above still show. A line whose text
 * ended in a lone CR thus gets its CR back; the CR and the added LF had read as one CRLF ending.
 */
export function removeInsertedLine(lines: readonly Line[], number: number): string {
  const edited: Pick<Line, 'text' | 'ending'>[] = [...lines];
  if (number < lines.length || number === 1) {
    edited.splice(number - 1, 1);
  } else {
    const becomesLast = lines[number - 2]!;
    const given = documentLineEnding(lines.slice(0, number - 2));
    // An ending that does not end with the one given cannot be the insert's: the whole of it goes, since a
    // last line ends without a break.
    const kept = becomesLast.ending.endsWith(given) ? becomesLast.ending.slice(0, -given.length) : '';
    edited.splice(number - 2, 2, { text: becomesLast.text + kept, ending: '' });
  }
  return join(edited);
}

function join(lines: readonly Pick<Line, 'text' | 'ending'>[]): string {
  return lines.map((line) => line.text + line.ending).join('');
}
