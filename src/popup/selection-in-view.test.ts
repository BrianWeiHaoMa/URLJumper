import { expect, test } from 'vitest';
import { visibleIn } from './selection-in-view';

// A view from 100 to 300 pixels down the popup.
const view = { top: 100, bottom: 300 };
const row = (top: number, height = 46) => ({ top, bottom: top + height });

test("a row is visible whole inside the view, also with its edges on the view's", () => {
  expect(visibleIn(row(150), view)).toBe(true);
  expect(visibleIn(row(100), view)).toBe(true);
  expect(visibleIn(row(254), view)).toBe(true);
});

test('a row cut at either edge, by more than layout rounds, is not visible, nor is one wholly outside', () => {
  expect(visibleIn(row(99), view)).toBe(false);
  expect(visibleIn(row(255), view)).toBe(false);
  expect(visibleIn(row(40), view)).toBe(false);
  expect(visibleIn(row(310), view)).toBe(false);
  // Half a pixel either way is layout's rounding.
  expect(visibleIn(row(99.5), view)).toBe(true);
  expect(visibleIn(row(254.5), view)).toBe(true);
  expect(visibleIn(row(99.4), view)).toBe(false);
});

test('in a view shorter than a row, a row filling it is visible and one that leaves part of it uncovered is not', () => {
  const short = { top: 100, bottom: 130 };
  expect(visibleIn(row(100), short)).toBe(true);
  expect(visibleIn(row(84), short)).toBe(true);
  expect(visibleIn(row(110), short)).toBe(false);
  expect(visibleIn(row(70), short)).toBe(false);
});
