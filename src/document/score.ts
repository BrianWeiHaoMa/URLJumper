// The use score Smart order ranks mappings by (G27): each kept use counts 1, halving every seven days. Also
// what a write of the document does to the learned usage it reads (P3).
import { readDocument } from './grammar';

/** Stored usage: for each mapping key, the times of its last uses in milliseconds since the Unix epoch, newest last. */
export type Usage = Readonly<Record<string, readonly number[]>>;

const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_LIFE_DAYS = 7;
/** How many use times each mapping keeps (P3). */
const KEPT_USES = 10;

/** `usage` with a use of the mapping keyed `key` at `time`: its times gain `time` last and keep the newest ten. */
export function recordUse(usage: Usage | undefined, key: string, time: number): Usage {
  return { ...usage, [key]: [...(usage?.[key] ?? []), time].slice(-KEPT_USES) };
}

/**
 * `usage` after the document changed from `before` to `after` at `time`: a mapping whose key `before` did not
 * hold is created, a use (G26), and gets exactly that one use, whatever its key held; an entry whose key no
 * mapping of `after` has is dropped, so a renamed mapping or a changed URL learns afresh (G27); every other
 * entry stays as it was.
 */
export function usageAfterWrite(usage: Usage | undefined, before: string, after: string, time: number): Usage {
  const keysBefore = new Set(readDocument(before).mappings.map((mapping) => mapping.key));
  const written: Record<string, readonly number[]> = {};
  for (const { key } of readDocument(after).mappings) {
    const times = keysBefore.has(key) ? usage?.[key] : [time];
    if (times) written[key] = times;
  }
  return written;
}

/**
 * The base-2 logarithm of the use score, Σ over the times of 2^(−age in days ÷ 7), each age measured back
 * from `now`; −Infinity for no times. The logarithm orders mappings as the score does, and still tells uses
 * apart where the score itself rounds to 0, as a single use does about 20.6 years after it happened.
 */
export function useScoreLog2(times: readonly number[], now: number): number {
  const exponent = (time: number) => -(now - time) / DAY_MS / HALF_LIFE_DAYS;
  let largest = -Infinity;
  for (const time of times) largest = Math.max(largest, exponent(time));
  if (largest === -Infinity) return -Infinity;
  let sum = 0;
  for (const time of times) sum += 2 ** (exponent(time) - largest);
  return largest + Math.log2(sum);
}
