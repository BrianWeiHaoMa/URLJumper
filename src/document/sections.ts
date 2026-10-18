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
