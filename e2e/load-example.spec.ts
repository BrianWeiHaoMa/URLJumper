import { exampleFromSpecification, expect, test } from './extension.ts';

const EXAMPLE_KEYS = [
  'mail\nhttps://mail.google.com/',
  'cal\nhttps://calendar.google.com/',
  'news\nhttps://news.ycombinator.com/',
  'g\nhttps://www.google.com/search?q=%s',
  'yt\nhttps://www.youtube.com/results?search_query=%s',
  'wiki\nhttps://en.wikipedia.org/w/index.php?search=%s',
  'team calendar\nhttps://calendar.google.com/calendar/u/0/r/week',
];

test("load example stores F11's text into an absent document, each example mapping created with one use at one time", async ({ extension }) => {
  const example = exampleFromSpecification();
  await extension.seedStorage({ usage: { 'old\nhttps://o.example/': [1_700_000_000_000] } });
  const changes = await extension.watchStorage();

  const before = Date.now();
  expect(await extension.sendRequest({ kind: 'load-example' })).toEqual({ kind: 'applied', text: example, first: 1, last: 12 });
  const after = Date.now();
  const { mappings, usage } = await extension.readStorage();
  expect(mappings).toBe(example);
  const times = usage as Record<string, number[]>;
  expect(Object.keys(times).sort()).toEqual([...EXAMPLE_KEYS].sort());
  const [time] = times[EXAMPLE_KEYS[0]!]!;
  expect(time).toBeGreaterThanOrEqual(before);
  expect(time).toBeLessThanOrEqual(after);
  for (const key of EXAMPLE_KEYS) expect(times[key]).toEqual([time]);
  await expect.poll(async () => (await changes()).map((change) => Object.keys(change).sort())).toEqual([['mappings', 'usage']]);
});

test('load example replaces a document of whitespace alone', async ({ extension }) => {
  await extension.seedStorage({ mappings: ' \n\t\n' });
  expect(await extension.sendRequest({ kind: 'load-example' })).toMatchObject({ kind: 'applied', first: 1, last: 12 });
  expect((await extension.readStorage()).mappings).toBe(exampleFromSpecification());
});

test('load example is refused, writing nothing, once the document holds anything but whitespace', async ({ extension }) => {
  for (const mappings of ['\\ notes\n', 'mine  https://m.example/\n']) {
    await extension.seedStorage({ mappings, usage: { 'mine\nhttps://m.example/': [1_700_000_000_000] } });
    const before = await extension.readStorage();
    const changes = await extension.watchStorage();

    expect(await extension.sendRequest({ kind: 'load-example' })).toEqual({ kind: 'not-empty' });
    expect(await extension.readStorage()).toEqual(before);
    // Events arrive in order: had the refusal written, its change would come before this insert's.
    expect(await extension.sendRequest({ kind: 'insert', name: 'fence', url: 'https://f.example/', note: '', heading: null })).toMatchObject({ kind: 'applied' });
    await expect.poll(async () => (await changes()).length).toBe(1);
  }
});
