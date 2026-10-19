// The three-way line merge of a Text view Save refused because the stored document changed (G18; How
// G17/G18/G20/G21): of the base the view loaded, the text it submitted, and the stored text. Lines are compared
// by content without their endings, so a CRLF base and stored text meet the LF text a text area gives (S14),
// and each side is paired with the base by the exact line diff (`line-diff.ts`), which gives that side's
// changes: runs of base lines, possibly none, replaced by the side's lines.
//
// Two changes, one from each side, meet when they share a base line, when one inserts at a gap strictly inside
// the other's run, or when both insert at the same gap. Changes that only touch do not: an insertion where the
// other side's run starts goes before it, one where it ends goes after it, and changes to neighbouring lines are
// both kept. Changes that meet in a chain form one region, and each side's version of it is that side's whole
// text for the region's base lines, the lines it left alone included, so choosing a version drops nothing of
// that side. A region whose two versions hold the same lines is a change both sides made alike, brought in
// once. Two insertions at one gap are brought in together: the stored side's lines, then those of the submitted
// text the line diff of the two leaves unpaired, so the lines it pairs, which both inserted, are there once (a
// Save that landed without its reply comes back once however much was typed after it) and every other line of
// both is kept, the stored side's first; unless a line only one side inserted shares a name (F4) with a line
// only the other inserted, which makes the two insertions a conflict. Every other region is offered in both
// versions, none chosen in advance, for the user's choice.
import { comparableLineName } from './grammar';
import { lineChanges, type LineChange } from './line-diff';
import { splitLines } from './lines';

export type MergeSide = 'stored' | 'submitted';

/** One side's version of a region both changed: its lines, and where they are in that side's own text. */
export interface MergeVersion {
  lines: string[];
  /** The number, from 1, of the version's first line in its side's text; with no lines, of the line that follows where they were. */
  line: number;
}

/** A part of the merge, in document order: lines settled, or a region both sides changed differently. */
export type MergePart = { kind: 'settled'; lines: string[] } | { kind: 'conflict'; stored: MergeVersion; submitted: MergeVersion };

type SideChange = LineChange & { side: MergeSide };

/**
 * The merge of `submitted`, a text written over `base`, with `stored`, the stored document now: settled lines
 * and conflicts in document order, consecutive settled lines in one part.
 */
export function mergeTexts(base: string, submitted: string, stored: string): MergePart[] {
  const baseLines = contents(base);
  const sideLines = { stored: contents(stored), submitted: contents(submitted) };
  const changes = {
    stored: lineChanges(baseLines, sideLines.stored).map((change) => ({ ...change, side: 'stored' as const })),
    submitted: lineChanges(baseLines, sideLines.submitted).map((change) => ({ ...change, side: 'submitted' as const })),
  };
  const taken = { stored: 0, submitted: 0 };
  // The change next in base order: by its first base line, an insertion before a run that starts at its gap,
  // and of two insertions at one gap the stored side's first.
  const peek = (): SideChange | undefined => {
    const stored = changes.stored[taken.stored];
    const submitted = changes.submitted[taken.submitted];
    if (stored === undefined || submitted === undefined) return stored ?? submitted;
    if (stored.start !== submitted.start) return stored.start < submitted.start ? stored : submitted;
    return submitted.start === submitted.end && stored.start !== stored.end ? submitted : stored;
  };

  const parts: MergePart[] = [];
  const settle = (lines: readonly string[], from = 0, to = lines.length) => {
    if (from >= to) return;
    let last = parts[parts.length - 1];
    if (last?.kind !== 'settled') parts.push((last = { kind: 'settled', lines: [] }));
    for (let at = from; at < to; at++) last.lines.push(lines[at]!);
  };
  // Each side's line count less the base's, over the changes already merged: where a base gap is in its text.
  const shift = { stored: 0, submitted: 0 };
  let baseAt = 0;

  for (let first = peek(); first !== undefined; first = peek()) {
    taken[first.side]++;
    const region: SideChange[] = [first];
    const start = first.start;
    let end = first.end;
    for (let next = peek(); next !== undefined && joins(region, start, end, next); next = peek()) {
      taken[next.side]++;
      region.push(next);
      end = Math.max(end, next.end);
    }
    settle(baseLines, baseAt, start);
    baseAt = end;
    if (region.length === 1) settle(first.lines);
    else {
      const version = (side: MergeSide): MergeVersion => ({ lines: sideText(baseLines, region, side, start, end), line: start + shift[side] + 1 });
      const [stored, submitted] = [version('stored'), version('submitted')];
      const together = start === end ? bothInserted(stored.lines, submitted.lines) : sameLines(stored.lines, submitted.lines) ? stored.lines : null;
      if (together !== null) settle(together);
      else parts.push({ kind: 'conflict', stored, submitted });
    }
    for (const change of region) shift[change.side] += change.lines.length - (change.end - change.start);
  }
  settle(baseLines, baseAt);
  return parts;
}

/**
 * The merged text: the settled lines and, for each conflict in order, the version `choices` names, joined by
 * LF, as a text area holds them (S14). Every conflict needs its choice.
 */
export function mergedText(parts: readonly MergePart[], choices: readonly MergeSide[]): string {
  const lines: string[] = [];
  let conflict = 0;
  for (const part of parts) {
    if (part.kind === 'settled') {
      for (const line of part.lines) lines.push(line);
      continue;
    }
    const side = choices[conflict++];
    if (side === undefined) throw new Error(`no version chosen for conflict ${conflict}`);
    for (const line of part[side].lines) lines.push(line);
  }
  return lines.join('\n');
}

/** Each line's content, without its ending. */
function contents(text: string): string[] {
  return splitLines(text).map((line) => line.text);
}

/**
 * Whether `next`, the change next in base order, meets the region of changes merged so far, whose base lines run
 * from `start` to `end`. Every base line and every gap strictly inside such a run lies within one of the
 * region's changes, and a side's own changes never meet, so a change that meets the run meets one of the other
 * side's. A region without base lines is one insertion, which an insertion at its gap from the other side joins.
 */
function joins(region: readonly SideChange[], start: number, end: number, next: SideChange): boolean {
  if (start < end) return next.start < next.end ? next.start < end : start < next.start && next.start < end;
  const [only] = region;
  return region.length === 1 && only!.side !== next.side && next.start === start && next.end === start;
}

/**
 * The lines the stored side and the submitted text inserted at one gap, brought in together: the stored side's,
 * then the submitted text's that the line diff of the two leaves unpaired, so the lines it pairs are there once
 * and the other lines of both are kept, the stored side's first, as *How* orders lines inserted at one gap
 * even where the submitted text put one of its own before a line both inserted; null when a line only one side
 * inserted shares a name with a line only the other inserted.
 */
function bothInserted(stored: readonly string[], submitted: readonly string[]): string[] | null {
  const changes = lineChanges(stored, submitted);
  const storedOnly = changes.flatMap((change) => stored.slice(change.start, change.end));
  const submittedOnly = changes.flatMap((change) => change.lines);
  if (shareName(storedOnly, submittedOnly)) return null;
  const lines = stored.slice();
  for (const line of submittedOnly) lines.push(line);
  return lines;
}

/** `side`'s lines for base lines `start` to `end`: its changes in the region, and the base lines it left alone. */
function sideText(baseLines: readonly string[], region: readonly SideChange[], side: MergeSide, start: number, end: number): string[] {
  const lines: string[] = [];
  let at = start;
  for (const change of region) {
    if (change.side !== side) continue;
    for (; at < change.start; at++) lines.push(baseLines[at]!);
    for (const line of change.lines) lines.push(line);
    at = change.end;
  }
  for (; at < end; at++) lines.push(baseLines[at]!);
  return lines;
}

function sameLines(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, at) => line === b[at]);
}

/** Whether a line of `a` and a line of `b` have one name, compared as F4 compares names. */
function shareName(a: readonly string[], b: readonly string[]): boolean {
  const names = new Set(a.map(comparableLineName).filter((name) => name !== null));
  return b.some((line) => {
    const name = comparableLineName(line);
    return name !== null && names.has(name);
  });
}
