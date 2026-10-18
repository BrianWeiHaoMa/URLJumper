import { expect, test } from 'vitest';
import { enqueue } from './queue';

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

test('queued operations run one at a time, in the order they were queued', async () => {
  const seen: string[] = [];
  const operation = (name: string) => async () => {
    seen.push(`${name} starts`);
    await tick();
    seen.push(`${name} ends`);
    return name;
  };
  expect(await Promise.all([enqueue(operation('a')), enqueue(operation('b')), enqueue(operation('c'))])).toEqual(['a', 'b', 'c']);
  expect(seen).toEqual(['a starts', 'a ends', 'b starts', 'b ends', 'c starts', 'c ends']);
});

test('an operation that fails rejects its own caller and holds up none after it', async () => {
  const failed = enqueue(async () => {
    await tick();
    throw new Error('refused');
  });
  const next = enqueue(async () => 'ran');
  await expect(failed).rejects.toThrow('refused');
  expect(await next).toBe('ran');
});
