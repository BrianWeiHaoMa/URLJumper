// How a change finds again the line it was made on, by the number and exact text the line had when the
// surface loaded it (Composition, "Service worker"): the mapping line with that text at that number, else the
// single mapping line with that text, so lines added or removed above it since do not lose it. Only a mapping
// line can be an anchor (R3): an unreadable line with the same text is never one.
import { readDocument, type ReadLine } from './grammar';

/** A line as a surface loaded it, both from one read of the document: its number and its exact text. */
export interface Anchor {
  line: number;
  text: string;
}

/** The anchor of line `number` of `document`, its number and exact text from this one read; undefined unless it is a mapping line. */
export function anchorAt(document: string, number: number): Anchor | undefined {
  const line = readDocument(document).lines[number - 1];
  return line?.kind === 'mapping' ? { line: number, text: line.text } : undefined;
}

/** The number of the line a change names as `number` and `text`; undefined when no mapping line, or several, has the text. */
export function findAnchor(lines: readonly ReadLine[], number: number, text: string): number | undefined {
  if (lines[number - 1]?.kind === 'mapping' && lines[number - 1]!.text === text) return number;
  const matching = lines.filter((line) => line.kind === 'mapping' && line.text === text);
  return matching.length === 1 ? matching[0]!.number : undefined;
}
