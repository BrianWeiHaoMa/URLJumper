import { expect, test } from 'vitest';
import { fillArgument, isArgumentAlias } from './argument';

test('a URL holding %s is an argument alias', () => {
  expect(isArgumentAlias('https://e/?q=%s')).toBe(true);
  expect(isArgumentAlias('https://e/?q=%S')).toBe(false);
  expect(isArgumentAlias('https://e/')).toBe(false);
});

test('every %s takes the argument encoded as a URI component, a space as %20', () => {
  expect(fillArgument('https://e/?q=%s&r=%s', 'a b&c/d')).toBe('https://e/?q=a%20b%26c%2Fd&r=a%20b%26c%2Fd');
  expect(fillArgument('https://www.youtube.com/results?search_query=%s', 'lo-fi beats')).toBe(
    'https://www.youtube.com/results?search_query=lo-fi%20beats',
  );
});

test('with no argument every %s is removed', () => {
  expect(fillArgument('https://e/?q=%s&r=%s', '')).toBe('https://e/?q=&r=');
});

test('the substituted argument is not searched for %s again', () => {
  expect(fillArgument('https://e/?q=%s&r=%s', '%s')).toBe('https://e/?q=%25s&r=%25s');
});

test('letters, digits, and - _ . ! ~ * \' ( ) stay; everything else is its UTF-8 bytes', () => {
  expect(fillArgument('x:%s', "Az09-_.!~*'()")).toBe("x:Az09-_.!~*'()");
  expect(fillArgument('x:%s', 'é')).toBe('x:%C3%A9');
  expect(fillArgument('x:%s', '😀')).toBe('x:%F0%9F%98%80');
  expect(fillArgument('x:%s', '+#?=$')).toBe('x:%2B%23%3F%3D%24');
});

test('a filled URL is undefined past 2,097,152 characters, the longest Chrome navigates to', () => {
  expect(fillArgument('x:%s', 'a'.repeat(2_097_150))?.length).toBe(2_097_152);
  expect(fillArgument('x:%s', 'a'.repeat(2_097_151))).toBeUndefined();
  // The length is the encoded one: 12 characters for each astral character, 9 for each lone surrogate's U+FFFD.
  expect(fillArgument('x:%s%s', '😀'.repeat(87_381))?.length).toBe(2_097_146);
  expect(fillArgument('x:%s%s', '😀'.repeat(87_382))).toBeUndefined();
  expect(fillArgument('x:%s', '\uD800'.repeat(233_016))?.length).toBe(2_097_146);
  expect(fillArgument('x:%s', '\uD800'.repeat(233_017))).toBeUndefined();
});

test('a fill too long to build is undefined, not an exception', () => {
  expect(fillArgument(`x:${'%s'.repeat(65_536)}`, 'a'.repeat(65_536))).toBeUndefined();
  expect(fillArgument('x:%s', 'a'.repeat(3_000_000))).toBeUndefined();
});

test('a lone surrogate is encoded as U+FFFD instead of throwing', () => {
  expect(fillArgument('x:%s', '\uD83D')).toBe('x:%EF%BF%BD');
  expect(fillArgument('x:%s', 'a\uDC00b')).toBe('x:a%EF%BF%BDb');
});
