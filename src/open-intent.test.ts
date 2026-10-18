import { expect, test } from 'vitest';
import { intentFor, isFresh, isOpenIntent, sameIntent, startMode } from './open-intent';

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
  expect(isOpenIntent({ kind: 'name-page', windowId: 3, time: 5 })).toBe(true);
  for (const value of [
    undefined,
    null,
    'new-tab',
    { kind: 'other', windowId: 3, time: 5 },
    { kind: 'new-tab', time: 5 },
    { kind: 'new-tab', windowId: 3 },
    { kind: 'new-tab', windowId: 3.5, time: 5 },
    { kind: 'name-page', windowId: '3', time: 5 },
  ]) {
    expect(isOpenIntent(value)).toBe(false);
  }
});

test("a name-link record is an intent only with its link's address, and the page's address and title, when given, as text", () => {
  const link = { kind: 'name-link', windowId: 3, time: 5, linkUrl: 'https://l.example/a' };
  expect(isOpenIntent(link)).toBe(true);
  expect(isOpenIntent({ ...link, pageUrl: 'https://p.example/', pageTitle: 'The page' })).toBe(true);
  expect(isOpenIntent({ ...link, pageTitle: '' })).toBe(true);
  for (const value of [
    { kind: 'name-link', windowId: 3, time: 5 },
    { ...link, linkUrl: '' },
    { ...link, linkUrl: 7 },
    { ...link, pageUrl: null },
    { ...link, pageTitle: 1 },
    { ...link, windowId: undefined },
  ]) {
    expect(isOpenIntent(value)).toBe(false);
  }
});

test('the popup honors only a fresh record for its own window', () => {
  const intent = { kind: 'this-tab', windowId: 3, time: 1_000_000 } as const;
  expect(intentFor(intent, 3, 1_009_999)).toEqual(intent);
  expect(intentFor(intent, 4, 1_000_000)).toBeUndefined();
  expect(intentFor(intent, undefined, 1_000_000)).toBeUndefined();
  expect(intentFor(intent, 3, 1_011_000)).toBeUndefined();
  expect(intentFor({ ...intent, kind: 'other' }, 3, 1_000_000)).toBeUndefined();
  expect(intentFor({ kind: 'name-link', windowId: 3, time: 1_000_000 }, 3, 1_000_000)).toBeUndefined();
});

test('only an honored this-tab record starts the popup in This tab', () => {
  expect(startMode({ kind: 'this-tab', windowId: 3, time: 5 })).toBe('this-tab');
  expect(startMode({ kind: 'new-tab', windowId: 3, time: 5 })).toBe('new-tab');
  expect(startMode({ kind: 'name-page', windowId: 3, time: 5 })).toBe('new-tab');
  expect(startMode({ kind: 'name-link', windowId: 3, time: 5, linkUrl: 'https://l.example/' })).toBe('new-tab');
  expect(startMode(undefined)).toBe('new-tab');
});

test('two records are the same when they name the same window and time', () => {
  const intent = { kind: 'this-tab', windowId: 3, time: 5 } as const;
  expect(sameIntent(intent, { ...intent, kind: 'new-tab' })).toBe(true);
  expect(sameIntent(intent, { ...intent, time: 6 })).toBe(false);
  expect(sameIntent(intent, { ...intent, windowId: 4 })).toBe(false);
});
