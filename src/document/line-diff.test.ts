import { describe, expect, test } from 'vitest';
import { lineChanges, type LineChange } from './line-diff';

/** `base` with `changes` applied, which must give back the side they were taken from. */
function applied(base: readonly string[], changes: readonly LineChange[]): string[] {
  const lines: string[] = [];
  let at = 0;
  for (const change of changes) {
    lines.push(...base.slice(at, change.start), ...change.lines);
    at = change.end;
  }
  return [...lines, ...base.slice(at)];
}

/** How many lines the changes leave paired: the base lines no change replaces. */
const paired = (base: readonly string[], changes: readonly LineChange[]) => base.length - changes.reduce((sum, change) => sum + change.end - change.start, 0);

/** The length of a longest common subsequence, from the full table, as a reference on small texts. */
function tableLength(a: readonly string[], b: readonly string[]): number {
  let row = new Array<number>(b.length + 1).fill(0);
  for (const line of a) {
    const next = [0];
    for (let j = 1; j <= b.length; j++) next[j] = line === b[j - 1] ? row[j - 1]! + 1 : Math.max(row[j]!, next[j - 1]!);
    row = next;
  }
  return row[b.length]!;
}

function seeded(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
}

describe('the changes', () => {
  test('of a side equal to the base are none', () => {
    expect(lineChanges(['a', '', 'b'], ['a', '', 'b'])).toEqual([]);
  });

  test('an insertion, a removal, and a replacement each name their base lines', () => {
    expect(lineChanges(['a', 'b', 'c'], ['a', 'x', 'b', 'c'])).toEqual([{ start: 1, end: 1, lines: ['x'] }]);
    expect(lineChanges(['a', 'b', 'c'], ['a', 'c'])).toEqual([{ start: 1, end: 2, lines: [] }]);
    expect(lineChanges(['a', 'b', 'c'], ['a', 'y', 'c'])).toEqual([{ start: 1, end: 2, lines: ['y'] }]);
  });

  test('from or to no lines at all', () => {
    expect(lineChanges([], ['a', 'b'])).toEqual([{ start: 0, end: 0, lines: ['a', 'b'] }]);
    expect(lineChanges(['a', 'b'], [])).toEqual([{ start: 0, end: 2, lines: [] }]);
    expect(lineChanges([], [])).toEqual([]);
  });

  test('of texts with no line in common is one replacement', () => {
    expect(lineChanges(['a', 'b'], ['c', 'd', 'e'])).toEqual([{ start: 0, end: 2, lines: ['c', 'd', 'e'] }]);
  });

  test('compare lines by their exact text: a line differing only in a trailing space or a CR is another line', () => {
    expect(lineChanges(['a', 'b'], ['a ', 'b\r'])).toEqual([{ start: 0, end: 2, lines: ['a ', 'b\r'] }]);
  });
});

describe('on many random small pairs, lines drawn from a small set with blank and comment lines among them', () => {
  const random = seeded(11);
  const set = ['', '', '\\ heading', 'a  https://a/', 'b  https://b/', 'c  https://c/', '  '];
  const text = () => Array.from({ length: Math.floor(random() * 30) }, () => set[Math.floor(random() * set.length)]!);
  const pairs = Array.from({ length: 2_000 }, () => [text(), text()] as const);

  test('applying the changes to the base gives the side', () => {
    for (const [base, side] of pairs) expect(applied(base, lineChanges(base, side))).toEqual(side);
  });

  test('the lines left paired are as many as a full-table longest common subsequence', () => {
    for (const [base, side] of pairs) expect(paired(base, lineChanges(base, side)), JSON.stringify({ base, side })).toBe(tableLength(base, side));
  });

  test('changes are in base order, each separated from the next by a line the two share', () => {
    for (const [base, side] of pairs) {
      const changes = lineChanges(base, side);
      for (const [at, change] of changes.entries()) {
        expect(change.start <= change.end && (change.start < change.end || change.lines.length > 0)).toBe(true);
        if (at > 0) expect(change.start).toBeGreaterThan(changes[at - 1]!.end);
      }
    }
  });
});
