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
//
// A move is a removal and an insertion, so a mapping line one view moved or re-added and the other deleted would
// come back as a lone insertion, and a deletion saved in one view would be undone silently by the other (G18).
// So the names, as F4 compares them, of the mapping lines both sides removed (base lines a change of each side
// replaces, as the line diff pairs lines by content, whatever the region comes to) are gathered first, since the
// re-add can come before the removal; then each line one side alone inserted that carries such a name, in a change only that
// side made or among the lines both inserted at one gap, is offered as a conflict of its own between that line
// and no line, the lines around it settled as before. A line both sides inserted carries no such conflict.
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

/** Changes that meet, over base lines `start` to `end`; `at`, where the region begins in each side's text, from 1. */
interface Region {
  start: number;
  end: number;
  changes: SideChange[];
  at: Record<MergeSide, number>;
  /** Each side's version, when both sides changed the region. */
  versions?: Record<MergeSide, MergeVersion>;
}

/**
 * The merge of `submitted`, a text written over `base`, with `stored`, the stored document now: settled lines
 * and conflicts in document order, consecutive settled lines in one part.
 */
export function mergeTexts(base: string, submitted: string, stored: string): MergePart[] {
  const baseLines = contents(base);
  const regions = regionsOf(baseLines, contents(stored), contents(submitted));
  const removed = removedByBoth(baseLines, regions);

  const parts: MergePart[] = [];
  const settle = (lines: readonly string[], from = 0, to = lines.length) => {
    if (from >= to) return;
    let last = parts[parts.length - 1];
    if (last?.kind !== 'settled') parts.push((last = { kind: 'settled', lines: [] }));
    for (let at = from; at < to; at++) last.lines.push(lines[at]!);
  };
  // A line `side` alone inserted, at `line` of its text: settled, unless it carries a name both sides removed;
  // then offered against no line, at `otherLine` of the other side's text.
  const insert = (text: string, side: MergeSide, line: number, otherLine: number) => {
    const name = removed.size === 0 ? null : comparableLineName(text);
    if (name === null || !removed.has(name)) return settle([text]);
    const inserted = { lines: [text], line };
    const none = { lines: [], line: otherLine };
    parts.push(side === 'stored' ? { kind: 'conflict', stored: inserted, submitted: none } : { kind: 'conflict', stored: none, submitted: inserted });
  };
  let baseAt = 0;

  for (const { start, end, changes, at, versions } of regions) {
    settle(baseLines, baseAt, start);
    baseAt = end;
    if (versions === undefined) {
      const { side, lines } = changes[0]!;
      lines.forEach((text, i) => insert(text, side, at[side] + i, at[other(side)]));
    } else if (start === end) {
      const together = bothInserted(versions.stored.lines, versions.submitted.lines);
      if (together === null) parts.push({ kind: 'conflict', ...versions });
      for (const { text, only } of together ?? []) {
        if (only === undefined) settle([text]);
        else insert(text, only.side, at[only.side] + only.at, at[other(only.side)] + only.otherAt);
      }
    } else if (sameLines(versions.stored.lines, versions.submitted.lines)) settle(versions.stored.lines);
    else parts.push({ kind: 'conflict', ...versions });
  }
  settle(baseLines, baseAt);
  return parts;
}

/** Each side's changes against the base, joined into regions where they meet, in base order. */
function regionsOf(baseLines: readonly string[], storedLines: readonly string[], submittedLines: readonly string[]): Region[] {
  const changes = {
    stored: lineChanges(baseLines, storedLines).map((change) => ({ ...change, side: 'stored' as const })),
    submitted: lineChanges(baseLines, submittedLines).map((change) => ({ ...change, side: 'submitted' as const })),
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
  const regions: Region[] = [];
  // Each side's line count less the base's, over the changes already joined: where a base gap is in its text.
  const shift = { stored: 0, submitted: 0 };

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
    const at = { stored: start + shift.stored + 1, submitted: start + shift.submitted + 1 };
    const version = (side: MergeSide): MergeVersion => ({ lines: sideText(baseLines, region, side, start, end), line: at[side] });
    regions.push({ start, end, changes: region, at, versions: region.length === 1 ? undefined : { stored: version('stored'), submitted: version('submitted') } });
    for (const change of region) shift[change.side] += change.lines.length - (change.end - change.start);
  }
  return regions;
}

/**
 * The names, as F4 compares them, of the mapping lines both sides removed: the base lines that a change of each
 * side replaces, rewritten in place by one side or not.
 */
function removedByBoth(baseLines: readonly string[], regions: readonly Region[]): Set<string> {
  const removed = new Set<string>();
  for (const { start, end, changes, versions } of regions) {
    if (versions === undefined || start === end) continue;
    // How many of the region's changes replace each of its base lines: a side's own changes never overlap.
    const replacing = new Int32Array(end - start);
    for (const change of changes) for (let at = change.start; at < change.end; at++) replacing[at - start]!++;
    for (let at = start; at < end; at++) {
      const name = replacing[at - start] === 2 ? comparableLineName(baseLines[at]!) : null;
      if (name !== null) removed.add(name);
    }
  }
  return removed;
}

function other(side: MergeSide): MergeSide {
  return side === 'stored' ? 'submitted' : 'stored';
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
 * A line of those both sides inserted at one gap, brought in together; `only` names the side that alone inserted
 * it, with its index in that side's insertion and, in the other side's, the index of the line that follows
 * where it would be.
 */
interface GapLine {
  text: string;
  only?: { side: MergeSide; at: number; otherAt: number };
}

/**
 * The lines the stored side and the submitted text inserted at one gap, brought in together: the stored side's,
 * then the submitted text's that the line diff of the two leaves unpaired, so the lines it pairs are there once
 * and the other lines of both are kept, the stored side's first, as *How* orders lines inserted at one gap
 * even where the submitted text put one of its own before a line both inserted; null when a line only one side
 * inserted shares a name with a line only the other inserted.
 */
function bothInserted(stored: readonly string[], submitted: readonly string[]): GapLine[] | null {
  const changes = lineChanges(stored, submitted);
  const storedOnly = changes.flatMap((change) => stored.slice(change.start, change.end));
  const submittedOnly = changes.flatMap((change) => change.lines);
  if (shareName(storedOnly, submittedOnly)) return null;
  const lines: GapLine[] = stored.map((text) => ({ text }));
  // The submitted insertion's line count less the stored one's, over the changes before: where a stored line is in it.
  let shift = 0;
  for (const change of changes) {
    const there = change.start + shift;
    for (let at = change.start; at < change.end; at++) lines[at] = { text: stored[at]!, only: { side: 'stored', at, otherAt: there } };
    change.lines.forEach((text, i) => lines.push({ text, only: { side: 'submitted', at: there + i, otherAt: stored.length } }));
    shift += change.lines.length - (change.end - change.start);
  }
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
