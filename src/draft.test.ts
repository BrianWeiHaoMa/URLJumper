import { expect, test } from 'vitest';
import { documentHolds, isDraft, isDraftName, isNamed, keepsArrival, nameOf, type Draft } from './draft';

const DRAFT: Draft = { text: 'a  https://a/\nb  https://b/\n', base: 'a  https://a/\n', time: 1_700_000_000_500, view: 'view-x', number: 5 };

test('an arrival is stored over no draft, an older one, or one of the same millisecond, and never over a newer one', () => {
  expect(keepsArrival(undefined, { time: 1 })).toBe(true);
  expect(keepsArrival(DRAFT, { time: DRAFT.time + 1 })).toBe(true);
  // The same millisecond: equally recent, and the later to arrive is kept.
  expect(keepsArrival(DRAFT, { time: DRAFT.time })).toBe(true);
  expect(keepsArrival(DRAFT, { time: DRAFT.time - 1 })).toBe(false);
  expect(keepsArrival(DRAFT, { time: 0 })).toBe(false);
});

test('a discard names a draft by both its view and its number, and no other', () => {
  expect(isNamed(DRAFT, { view: 'view-x', number: 5 })).toBe(true);
  expect(isNamed(DRAFT, nameOf(DRAFT))).toBe(true);
  expect(isNamed(DRAFT, { view: 'view-x', number: 4 })).toBe(false);
  expect(isNamed(DRAFT, { view: 'view-x', number: 6 })).toBe(false);
  expect(isNamed(DRAFT, { view: 'view-y', number: 5 })).toBe(false);
  expect(isNamed(undefined, { view: 'view-x', number: 5 })).toBe(false);
});

test('the name of a draft is its view and number alone', () => {
  expect(nameOf(DRAFT)).toEqual({ view: 'view-x', number: 5 });
});

test('a draft is a text, a base, a time, a view, and a number from 1', () => {
  expect(isDraft(DRAFT)).toBe(true);
  expect(isDraft({ ...DRAFT, text: '', base: '' })).toBe(true);
  expect(isDraft({ ...DRAFT, kind: 'draft-set' })).toBe(true);
  for (const value of [
    undefined,
    null,
    'a  https://a/',
    { ...DRAFT, text: undefined },
    { ...DRAFT, text: null },
    { ...DRAFT, base: undefined },
    { ...DRAFT, base: 3 },
    { ...DRAFT, time: undefined },
    { ...DRAFT, time: '1700000000500' },
    { ...DRAFT, time: Number.NaN },
    { ...DRAFT, view: '' },
    { ...DRAFT, view: 7 },
    { ...DRAFT, number: 0 },
    { ...DRAFT, number: 1.5 },
    { ...DRAFT, number: '5' },
  ]) {
    expect(isDraft(value), JSON.stringify(value)).toBe(false);
  }
});

test('a draft is named by a view and a number from 1', () => {
  expect(isDraftName({ view: 'v', number: 1 })).toBe(true);
  for (const value of [undefined, null, { view: 'v' }, { number: 1 }, { view: '', number: 1 }, { view: 'v', number: 0 }, { view: 'v', number: -2 }, { view: 'v', number: 2.5 }]) {
    expect(isDraftName(value), JSON.stringify(value)).toBe(false);
  }
});

test('the stored document holds a text only when the two are the same string, CRLF and all', () => {
  expect(documentHolds('a  https://a/\n', 'a  https://a/\n')).toBe(true);
  expect(documentHolds('', '')).toBe(true);
  expect(documentHolds('a  https://a/\r\nb  https://b/\r\n', 'a  https://a/\nb  https://b/\n')).toBe(false);
  expect(documentHolds('a  https://a/\n', 'a  https://a/')).toBe(false);
  expect(documentHolds('A  https://a/\n', 'a  https://a/\n')).toBe(false);
});
