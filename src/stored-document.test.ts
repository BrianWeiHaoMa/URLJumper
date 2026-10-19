import { expect, test } from 'vitest';
import { readMappings, readUsage } from './stored-document';

test('the stored document is the string as stored, byte for byte; absence and anything else is the empty document', () => {
  expect(readMappings('')).toBe('');
  expect(readMappings('mail\thttps://m.example/\r\n\\ Work\r\n')).toBe('mail\thttps://m.example/\r\n\\ Work\r\n');
  for (const value of [undefined, null, 0, 12, true, ['mail https://m.example/'], { mappings: 'mail https://m.example/' }]) expect(readMappings(value)).toBe('');
});

test('the stored usage is the object as stored, the same one; absence and anything but a non-null object is none', () => {
  const usage = { 'mail\nhttps://m.example/': [1_000, 2_000] };
  expect(readUsage(usage)).toBe(usage);
  for (const value of [undefined, null, 'usage', 0, 7, true]) expect(readUsage(value)).toBeUndefined();
});
