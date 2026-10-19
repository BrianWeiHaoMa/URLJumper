// The line diff the merge pairs each side with the base by (G18; How G17/G18/G20/G21, "a longest-common-
// subsequence diff of each side against the base"): exact, pairing as many lines as a full table of the two
// texts' lines would, so repeated lines such as blank lines and headings pair as the specification says and
// not as a heuristic guesses; and linear in memory, since E3 allows 10,000 lines a side, where a full table
// would hold 10^8 cells. It is Myers' O(ND) diff with the middle-snake bisection, over numbers standing for
// the lines so that comparing two lines is one integer test; its time is quadratic at worst, which for E3's
// largest texts is under a second.

/**
 * A run of base lines one side replaced: base lines `start` to `end` (from 0, `end` excluded) became `lines`,
 * none for a removal. A pure insertion has `start === end`: its lines go in the gap before base line `start`.
 */
export interface LineChange {
  start: number;
  end: number;
  lines: string[];
}

/**
 * How `side` differs from `base`, two texts as lines compared by exact text: the changes in base order, each
 * separated from the next by at least one line the two share, the lines left out of every change being a
 * longest common subsequence of the two.
 */
export function lineChanges(base: readonly string[], side: readonly string[]): LineChange[] {
  const [a, b] = numbered(base, side);
  const changes: LineChange[] = [];
  let baseAt = 0;
  let sideAt = 0;
  // Every line from `baseAt` to `i` and from `sideAt` to `j` is unpaired: one change, when there is any.
  const changeUpTo = (i: number, j: number) => {
    if (i > baseAt || j > sideAt) changes.push({ start: baseAt, end: i, lines: side.slice(sideAt, j) });
  };
  pairLines(a, b, (i, j) => {
    changeUpTo(i, j);
    baseAt = i + 1;
    sideAt = j + 1;
  });
  changeUpTo(base.length, side.length);
  return changes;
}

// The two texts' lines as numbers, equal lines equal numbers.
function numbered(a: readonly string[], b: readonly string[]): [Int32Array, Int32Array] {
  const ids = new Map<string, number>();
  const number = (line: string) => {
    let id = ids.get(line);
    if (id === undefined) ids.set(line, (id = ids.size));
    return id;
  };
  return [Int32Array.from(a, number), Int32Array.from(b, number)];
}

/** Calls `pair(i, j)` for each pair of a longest common subsequence of `a` and `b`, in order. */
function pairLines(a: Int32Array, b: Int32Array, pair: (i: number, j: number) => void): void {
  // Common lines at either end pair at once; what lies between is split at a point on a shortest edit path,
  // which halves the edits on each side, so the recursion is as deep as the log of the edit count.
  const between = (a0: number, a1: number, b0: number, b1: number) => {
    while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) pair(a0++, b0++);
    let tail = 0;
    while (a0 < a1 - tail && b0 < b1 - tail && a[a1 - tail - 1] === b[b1 - tail - 1]) tail++;
    if (a0 < a1 - tail && b0 < b1 - tail) {
      const split = middleSnake(a, b, a0, a1 - tail, b0, b1 - tail);
      if (split !== null) {
        between(a0, split[0], b0, split[1]);
        between(split[0], a1 - tail, split[1], b1 - tail);
      }
    }
    for (let k = tail; k > 0; k--) pair(a1 - k, b1 - k);
  };
  between(0, a.length, 0, b.length);
}

/**
 * A point on a shortest edit path from a[a0..a1) to b[b0..b1), found where the forward and the backward
 * search meet, or null when the two have no line in common. Both have at least one line.
 */
function middleSnake(a: Int32Array, b: Int32Array, a0: number, a1: number, b0: number, b1: number): [number, number] | null {
  const n = a1 - a0;
  const m = b1 - b0;
  const maxD = Math.ceil((n + m) / 2);
  const offset = maxD;
  const length = 2 * maxD + 2;
  // How far along `a` the furthest forward (v1) and backward (v2) path on each diagonal has reached.
  const v1 = new Int32Array(length).fill(-1);
  const v2 = new Int32Array(length).fill(-1);
  v1[offset + 1] = 0;
  v2[offset + 1] = 0;
  const delta = n - m;
  // With an odd difference the forward search finds the meeting; with an even one, the backward search.
  const front = delta % 2 !== 0;
  let k1start = 0;
  let k1end = 0;
  let k2start = 0;
  let k2end = 0;
  for (let d = 0; d < maxD; d++) {
    for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      const k1o = offset + k1;
      let x1 = k1 === -d || (k1 !== d && v1[k1o - 1]! < v1[k1o + 1]!) ? v1[k1o + 1]! : v1[k1o - 1]! + 1;
      let y1 = x1 - k1;
      while (x1 < n && y1 < m && a[a0 + x1] === b[b0 + y1]) {
        x1++;
        y1++;
      }
      v1[k1o] = x1;
      if (x1 > n) k1end += 2;
      else if (y1 > m) k1start += 2;
      else if (front) {
        const k2o = offset + delta - k1;
        if (k2o >= 0 && k2o < length && v2[k2o] !== -1 && x1 >= n - v2[k2o]!) return [a0 + x1, b0 + y1];
      }
    }
    for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      const k2o = offset + k2;
      let x2 = k2 === -d || (k2 !== d && v2[k2o - 1]! < v2[k2o + 1]!) ? v2[k2o + 1]! : v2[k2o - 1]! + 1;
      let y2 = x2 - k2;
      while (x2 < n && y2 < m && a[a1 - x2 - 1] === b[b1 - y2 - 1]) {
        x2++;
        y2++;
      }
      v2[k2o] = x2;
      if (x2 > n) k2end += 2;
      else if (y2 > m) k2start += 2;
      else if (!front) {
        const k1o = offset + delta - k2;
        if (k1o >= 0 && k1o < length && v1[k1o] !== -1) {
          const x1 = v1[k1o]!;
          const y1 = offset + x1 - k1o;
          if (x1 >= n - x2) return [a0 + x1, b0 + y1];
        }
      }
    }
  }
  return null;
}
