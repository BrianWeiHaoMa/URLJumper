// Inserting one mapping line (G9, G12, F12): what the worker stores and what the Name form previews come
// from this same function. The line goes after the last line that holds more than whitespace (a comment line
// does), at the start when there is none, or, for a section, after the last such line of that section; a
// heading no longer found sends it to the end of the document. Its Undo is `removeMapping` (`removal.ts`).
import { readDocument, type ReadLine } from './grammar';
import { insertLineAfter, type EndingGiven } from './line-edits';
import { formatNewLine, urlColumn } from './line-format';
import { findSection, type HeadingIdentity } from './sections';
import { validateMapping, type MappingFields, type Validation } from './validation';

export type InsertResult =
  /**
   * `line` is the new line's number and `text` its exact text; `headingMissing` says a chosen heading was not
   * found and the line went to the end; `endingGiven`, present when the line went after the last line, is
   * what its Undo is handed back.
   */
  | { kind: 'applied'; document: string; line: number; text: string; headingMissing: boolean; endingGiven?: EndingGiven }
  | Exclude<Validation, { kind: 'valid' }>;

/** `document` with a line for `fields` inserted at the end, or into the section headed `heading`, once `fields` are valid against it. */
export function insertMapping(document: string, fields: MappingFields, heading: HeadingIdentity | null): InsertResult {
  const { lines, mappings } = readDocument(document);
  const validation = validateMapping(fields, mappings);
  if (validation.kind !== 'valid') return validation;
  const { after, headingMissing } = insertionPoint(lines, heading);
  const text = formatNewLine(validation.fields, urlColumn(lines, after));
  return { kind: 'applied', ...insertLineAfter(lines, after, text), line: after + 1, text, headingMissing };
}

/** The line a new line goes after (0: before line 1) for a target of the end of the document or `heading`'s section. */
export function insertionPoint(lines: readonly ReadLine[], heading: HeadingIdentity | null): { after: number; headingMissing: boolean } {
  const section = heading === null ? undefined : findSection(lines, heading);
  if (section) return { after: lastLineHolding(lines, section.heading.first, section.last), headingMissing: false };
  return { after: lastLineHolding(lines, 1, lines.length), headingMissing: heading !== null };
}

/** The last line from `first` to `last` that holds more than whitespace; 0 when none does. */
function lastLineHolding(lines: readonly ReadLine[], first: number, last: number): number {
  return lines.slice(first - 1, last).findLast((line) => /\S/.test(line.text))?.number ?? 0;
}
