import { expect, test } from 'vitest';
import { recordUse, useScoreLog2 } from './score';

const NOW = Date.UTC(2026, 9, 18, 12);
const DAY = 24 * 60 * 60 * 1000;
const score = (times: number[]) => 2 ** useScoreLog2(times, NOW);

test('a use counts 1 when it happens and halves every seven days', () => {
  expect(score([NOW])).toBe(1);
  expect(score([NOW - 7 * DAY])).toBeCloseTo(0.5, 12);
  expect(score([NOW - 14 * DAY])).toBeCloseTo(0.25, 12);
  expect(score([NOW - DAY / 2])).toBeCloseTo(2 ** (-0.5 / 7), 12);
});

test('uses add up', () => {
  expect(score([NOW, NOW])).toBe(2);
  expect(score([NOW - 7 * DAY, NOW])).toBeCloseTo(1.5, 12);
  expect(useScoreLog2([], NOW)).toBe(-Infinity);
});

test('one use within 24 hours outscores ten uses all older than 30 days', () => {
  const recent = useScoreLog2([NOW - (DAY - 1)], NOW);
  const old = useScoreLog2(Array.from({ length: 10 }, () => NOW - 30 * DAY - 1), NOW);
  expect(recent).toBeGreaterThan(old);
});

test('uses decades old still compare, where the score itself rounds to 0', () => {
  const at2050 = Date.UTC(2050, 0, 1);
  const from2027 = useScoreLog2([Date.UTC(2027, 0, 1)], at2050);
  const from2028 = useScoreLog2([Date.UTC(2028, 0, 1)], at2050);
  expect(2 ** from2028).toBe(0);
  expect(from2028).toBeGreaterThan(from2027);
  expect(from2028).toBeCloseTo(-(at2050 - Date.UTC(2028, 0, 1)) / DAY / 7, 9);
});

test('a use is recorded last under its key, and other keys keep their times', () => {
  const usage = { 'a\nhttps://a.example/': [1, 2], 'b\nhttps://b.example/': [3] };
  expect(recordUse(usage, 'a\nhttps://a.example/', 4)).toEqual({ 'a\nhttps://a.example/': [1, 2, 4], 'b\nhttps://b.example/': [3] });
  expect(recordUse(undefined, 'c\nhttps://c.example/', 5)).toEqual({ 'c\nhttps://c.example/': [5] });
  expect(usage).toEqual({ 'a\nhttps://a.example/': [1, 2], 'b\nhttps://b.example/': [3] });
});

test('a mapping keeps its last ten uses, the oldest dropped first', () => {
  let usage = recordUse(undefined, 'k', 1);
  for (let time = 2; time <= 11; time++) usage = recordUse(usage, 'k', time);
  expect(usage).toEqual({ k: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] });
  expect(recordUse({ k: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }, 'k', 13)).toEqual({ k: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13] });
});
