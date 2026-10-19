// The stored document as numbered lines. Lines end at LF or CRLF only (a lone CR is content), are
// numbered from 1, and the text after the last line break is a line, empty when the document ends with one.
// Every line keeps its exact text and its own ending, so joining them gives back the document byte for byte.

export type LineEnding = '\r\n' | '\n' | '';

export interface Line {
  number: number;
  /** The line's exact text: its content without its line ending. */
  text: string;
  ending: LineEnding;
}

export function splitLines(document: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (let breakAt = document.indexOf('\n'); breakAt !== -1; breakAt = document.indexOf('\n', start)) {
    const crlf = document[breakAt - 1] === '\r';
    lines.push({
      number: lines.length + 1,
      text: document.slice(start, crlf ? breakAt - 1 : breakAt),
      ending: crlf ? '\r\n' : '\n',
    });
    start = breakAt + 1;
  }
  lines.push({ number: lines.length + 1, text: document.slice(start), ending: '' });
  return lines;
}

/**
 * Where line `line` of `document` starts in a text area that holds it, in UTF-16 code units, as a caret is
 * placed: a text area turns CRLF and a lone CR into LF (S14), so each line before it takes its exact text
 * and one character. Before the first line, the first line's start; past the last, the last line's start.
 */
export function textAreaLineStart(document: string, line: number): number {
  const lines = splitLines(document);
  const before = Math.max(0, Math.min(line, lines.length) - 1);
  let start = 0;
  for (let index = 0; index < before; index++) start += lines[index]!.text.length + 1;
  return start;
}
