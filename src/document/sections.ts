// Headings and sections (F14). A heading is a maximal run of consecutive comment-only lines; its section
// runs from the heading to the line before the next heading, or to the document's last line. Lines before
// the first heading are in no section.
import type { ReadLine } from './grammar';

export interface Section {
  /** The heading's first and last line numbers. */
  heading: { first: number; last: number };
  /** The section's last line number; it starts at the heading's first. */
  last: number;
}

export function findSections(lines: readonly ReadLine[]): Section[] {
  const sections: Section[] = [];
  const lastLine = lines.at(-1)?.number ?? 0;
  let current: Section | undefined;
  let previousWasComment = false;
  for (const line of lines) {
    const isComment = line.kind === 'comment';
    if (isComment && previousWasComment && current) {
      current.heading.last = line.number;
    } else if (isComment) {
      if (current) current.last = line.number - 1;
      current = { heading: { first: line.number, last: line.number }, last: lastLine };
      sections.push(current);
    }
    previousWasComment = isComment;
  }
  return sections;
}

/**
 * A heading as a surface names it: the exact texts of its lines, and how many headings with exactly those
 * texts come before it. A heading is found again by both, so lines added or removed elsewhere since it was
 * named do not change which heading it is (G9).
 */
export interface HeadingIdentity {
  texts: string[];
  before: number;
}

/** Each section, in document order, with its heading's identity. */
export function namedSections(lines: readonly ReadLine[]): (Section & { identity: HeadingIdentity })[] {
  const seen = new Map<string, number>();
  return findSections(lines).map((section) => {
    const texts = lines.slice(section.heading.first - 1, section.heading.last).map((line) => line.text);
    const textsKey = JSON.stringify(texts);
    const before = seen.get(textsKey) ?? 0;
    seen.set(textsKey, before + 1);
    return { ...section, identity: { texts, before } };
  });
}

/**
 * What the Section choice shows for `heading` (P2): each line's comment text, after its first backslash with
 * the surrounding whitespace removed as a note's is, joined by single spaces; a line with no such text adds
 * nothing. Empty when no line has any, and the heading is then shown by its first line's number.
 */
export function headingText(lines: readonly ReadLine[], heading: Section['heading']): string {
  return lines
    .slice(heading.first - 1, heading.last)
    .map((line) => line.text.slice(line.text.indexOf('\\') + 1).trim())
    .filter((text) => text !== '')
    .join(' ');
}

/** What a surface calls `heading` (P2): its text (`headingText`), or, with none, its first line's number. */
export function headingName(lines: readonly ReadLine[], heading: Section['heading']): string {
  return headingText(lines, heading) || `Heading at line ${heading.first}`;
}

/** The section whose heading has `identity`; undefined when no heading has it now. */
export function findSection(lines: readonly ReadLine[], identity: HeadingIdentity): Section | undefined {
  const textsKey = JSON.stringify(identity.texts);
  return namedSections(lines).find((section) => JSON.stringify(section.identity.texts) === textsKey && section.identity.before === identity.before);
}
