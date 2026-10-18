import { expect, test } from 'vitest';
import { isFresh, isOpenIntent } from './open-intent';

test('a record is fresh for ten seconds after it was written, and never before', () => {
  const intent = { kind: 'this-tab', windowId: 3, time: 1_000_000 } as const;
  expect(isFresh(intent, 1_000_000)).toBe(true);
  expect(isFresh(intent, 1_009_999)).toBe(true);
  expect(isFresh(intent, 1_010_000)).toBe(false);
  expect(isFresh(intent, 999_999)).toBe(false);
});

test('only a record with a known kind, a window id, and a time is an intent', () => {
  expect(isOpenIntent({ kind: 'new-tab', windowId: 3, time: 5 })).toBe(true);
  expect(isOpenIntent({ kind: 'this-tab', windowId: 3, time: 5 })).toBe(true);
  for (const value of [undefined, null, 'new-tab', { kind: 'other', windowId: 3, time: 5 }, { kind: 'new-tab', time: 5 }, { kind: 'new-tab', windowId: 3 }, { kind: 'new-tab', windowId: 3.5, time: 5 }]) {
    expect(isOpenIntent(value)).toBe(false);
  }
});
