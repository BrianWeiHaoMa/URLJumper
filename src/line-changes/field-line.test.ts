import { expect, test } from 'vitest';
import { fieldLine } from './field-line';

// A 14 px font with a 13 px ascent and a 3 px descent on a 26 px line leaves 18 px above the baseline and 8 below.
const font = { ascent: 13, descent: 3 };

test("a value whose ink stays a pixel inside the base's room keeps the base, also with nothing below the baseline (G7)", () => {
  expect(fieldLine({ ...font, above: 11, below: 3 }, 26, 14)).toBe(26);
  expect(fieldLine({ ...font, above: 17, below: 7 }, 26, 14)).toBe(26);
  expect(fieldLine({ ...font, above: 0, below: -1 }, 26, 14)).toBe(26);
});

test('ink past that raises the line by twice what its deeper side lacks, in whole pixels (G7, E8)', () => {
  // 0.08 px above lacking: one pixel more.
  expect(fieldLine({ ...font, above: 17.08, below: 6.1 }, 26, 14)).toBe(27);
  // Below lacks 7.79 px, above 3: the line is the font's box with 7.79 px more on each side.
  expect(fieldLine({ ...font, above: 15, below: 9.79 }, 26, 14)).toBe(32);
  expect(fieldLine({ ascent: 13.25, descent: 3.5, above: 21.5, below: 0 }, 26, 14)).toBe(36);
});

test('the line stops at four times the font size, past which the marks are cut (G7)', () => {
  expect(fieldLine({ ...font, above: 140, below: 0 }, 26, 14)).toBe(56);
  expect(fieldLine({ ascent: 15, descent: 4, above: 0, below: 62.7 }, 30, 16)).toBe(64);
  expect(fieldLine({ ascent: 11, descent: 3, above: 62.4, below: 47.2 }, 26, 12)).toBe(48);
  expect(fieldLine({ ...font, above: 140, below: 0 }, 26, 13.5)).toBe(54);
  // A stack that needs the cap exactly is held whole.
  expect(fieldLine({ ...font, above: 32, below: 0 }, 26, 14)).toBe(56);
  expect(fieldLine({ ...font, above: 31, below: 0 }, 26, 14)).toBe(54);
});

test("the stylesheet's line is never lowered", () => {
  expect(fieldLine({ ...font, above: 140, below: 0 }, 30, 7)).toBe(30);
});
