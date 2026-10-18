import { expect, test } from 'vitest';
import { readSearchOrder, readTheme } from './preferences';

test('only `smart` is Smart order; absence and anything else is Document order', () => {
  expect(readSearchOrder('smart')).toBe('smart');
  for (const value of [undefined, 'document', 'Smart', null, 1]) expect(readSearchOrder(value)).toBe('document');
});

test('`light` and `dark` are themes; absence and anything else is System', () => {
  expect(readTheme('light')).toBe('light');
  expect(readTheme('dark')).toBe('dark');
  for (const value of [undefined, 'system', 'Dark', null]) expect(readTheme(value)).toBe('system');
});
