import type { InsertRequest, UndoRequest } from '../src/requests.ts';
import { expect, test, type LoadedExtension } from './extension.ts';

const insertOf = (name: string, url: string, heading: InsertRequest['heading'] = null, note = ''): InsertRequest => ({
  kind: 'insert',
  name,
  url,
  note,
  heading,
});
const undoOf = (line: number, text: string): UndoRequest => ({ kind: 'undo', act: 'remove', line, text });

const DAILY = '\\ Daily\nmail                 https://mail.google.com/\n';
const STOCKS = 'stocks               https://s.example/';

type Changes = () => Promise<Record<string, chrome.storage.StorageChange>[]>;

// The changes recorded once there are `count` of them: a write's event can arrive just after its reply.
async function changesWhen(changes: Changes, count: number) {
  await expect.poll(async () => (await changes()).length).toBe(count);
  return changes();
}

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

test('an insert stores one line after the last line holding more than whitespace, per F12, in one change with the usage', async ({ extension }) => {
  await extension.seedStorage({ mappings: DAILY });
  const changes = await extension.watchStorage();

  expect(await extension.sendRequest(insertOf('stocks', 'https://s.example/'))).toEqual({ kind: 'applied', line: 3, text: STOCKS, headingMissing: false });
  expect(await storedDocument(extension)).toBe(`${DAILY}${STOCKS}\n`);
  const [change] = await changesWhen(changes, 1);
  expect(Object.keys(change!).sort()).toEqual(['mappings', 'usage']);
  expect(change!.mappings!.newValue).toBe(`${DAILY}${STOCKS}\n`);
});

test('an insert into a section goes after its last line; a heading no longer found sends it to the end, and the reply says so', async ({ extension }) => {
  await extension.seedStorage({ mappings: '\\ Work\nmail  m:1\n\n\\ Home\ntv    t:2\n' });
  const changes = await extension.watchStorage();

  expect(await extension.sendRequest(insertOf('new', 'n:3', { texts: ['\\ Work'], before: 0 }))).toEqual({
    kind: 'applied',
    line: 3,
    text: 'new   n:3',
    headingMissing: false,
  });
  expect(await storedDocument(extension)).toBe('\\ Work\nmail  m:1\nnew   n:3\n\n\\ Home\ntv    t:2\n');

  expect(await extension.sendRequest(insertOf('gone', 'g:4', { texts: ['\\ Work'], before: 1 }))).toEqual({
    kind: 'applied',
    line: 7,
    text: 'gone  g:4',
    headingMissing: true,
  });
  expect(await storedDocument(extension)).toBe('\\ Work\nmail  m:1\nnew   n:3\n\n\\ Home\ntv    t:2\ngone  g:4\n');
  const recorded = await changesWhen(changes, 2);
  expect(recorded.map((change) => Object.keys(change).sort())).toEqual([
    ['mappings', 'usage'],
    ['mappings', 'usage'],
  ]);
});

test('an insert is a creation: one use at its time under the new key, held uses kept, stray ones dropped; its undo takes them back', async ({ extension }) => {
  const held = 'held\nhttps://h.example/';
  const stocks = 'stocks\nhttps://s.example/';
  const seeded = 'held  https://h.example/\n';
  const usage = { [held]: [1_700_000_000_001, 1_700_000_000_002, 1_700_000_000_003], 'stray\nhttps://gone.example/': [1_700_000_000_004] };
  await extension.seedStorage({ mappings: seeded, usage: { ...usage, [stocks]: [1, 2, 3, 4, 5] } });
  const changes = await extension.watchStorage();

  const before = Date.now();
  const reply = await extension.sendRequest(insertOf('stocks', 'https://s.example/'));
  const after = Date.now();
  expect(reply).toEqual({ kind: 'applied', line: 2, text: 'stocks https://s.example/', headingMissing: false });
  const stored = await extension.readStorage();
  expect(stored.mappings).toBe(`${seeded}stocks https://s.example/\n`);
  const { [stocks]: created, ...others } = stored.usage as Record<string, number[]>;
  expect(others).toEqual({ [held]: usage[held] });
  expect(created).toHaveLength(1);
  expect(created![0]).toBeGreaterThanOrEqual(before);
  expect(created![0]).toBeLessThanOrEqual(after);

  expect(await extension.sendRequest(undoOf(2, 'stocks https://s.example/'))).toEqual({ kind: 'applied', line: 2, text: 'stocks https://s.example/' });
  expect(await extension.readStorage()).toMatchObject({ mappings: seeded, usage: { [held]: usage[held] } });
  expect(Object.keys((await extension.readStorage()).usage as object)).toEqual([held]);
  const recorded = await changesWhen(changes, 2);
  expect(recorded.map((change) => Object.keys(change).sort())).toEqual([
    ['mappings', 'usage'],
    ['mappings', 'usage'],
  ]);
});

test('undo finds the inserted line by its text after lines were added above it, and gives back the document exactly', async ({ extension }) => {
  await extension.seedStorage({ mappings: DAILY });
  expect(await extension.sendRequest(insertOf('stocks', 'https://s.example/'))).toMatchObject({ kind: 'applied', line: 3, text: STOCKS });
  const { usage } = await extension.readStorage();
  // Another view's change since, standing in for one: a line put before line 1.
  await extension.seedStorage({ mappings: `\\ top\n${DAILY}${STOCKS}\n`, usage });

  expect(await extension.sendRequest(undoOf(3, STOCKS))).toEqual({ kind: 'applied', line: 4, text: STOCKS });
  expect(await storedDocument(extension)).toBe(`\\ top\n${DAILY}`);
});

test('a CRLF document without a final break, and a last line ending in a lone CR, come back from the undo byte for byte', async ({ extension }) => {
  for (const [document, inserted] of [
    ['z    q:0\r\na    x:1', 'z    q:0\r\na    x:1\r\nb    y:2'],
    ['a    x:1\r', 'a    x:1\r\nb    y:2'],
  ]) {
    await extension.seedStorage({ mappings: document });
    const reply = await extension.sendRequest(insertOf('b', 'y:2'));
    expect(await storedDocument(extension)).toBe(inserted);
    const { line, text } = reply as { line: number; text: string };
    expect(await extension.sendRequest(undoOf(line, text))).toEqual({ kind: 'applied', line, text: 'b    y:2' });
    expect(await storedDocument(extension)).toBe(document);
  }
});

test('a refused insert or undo writes nothing: a taken name, an invalid value, a line changed or unreadable', async ({ extension }) => {
  const document = 'Stocks  https://s.example/\nwhat  is  this\n';
  await extension.seedStorage({ mappings: document, usage: { 'stocks\nhttps://s.example/': [1_700_000_000_000] } });
  const before = await extension.readStorage();
  const changes = await extension.watchStorage();

  expect(await extension.sendRequest(insertOf('STOCKS', 'https://t.example/'))).toEqual({ kind: 'name-taken', line: 1 });
  expect(await extension.sendRequest(insertOf('a\\b', 'https://t.example/'))).toEqual({ kind: 'invalid', field: 'name', rule: 'backslash' });
  expect(await extension.sendRequest(insertOf('a', 'https://t.example/ x'))).toEqual({ kind: 'invalid', field: 'url', rule: 'whitespace' });
  expect(await extension.sendRequest(insertOf('a', 'é:x'))).toEqual({ kind: 'invalid', field: 'url', rule: 'no-scheme' });
  expect(await extension.sendRequest(insertOf('a', 'https://t.example/', null, 'a\rb'))).toEqual({ kind: 'invalid', field: 'note', rule: 'line-break' });
  expect(await extension.sendRequest(insertOf('a', 'https://t.example/', null, '\nhello\r\n'))).toEqual({ kind: 'invalid', field: 'note', rule: 'line-break' });
  expect(await extension.sendRequest(undoOf(1, 'Stocks  https://other.example/'))).toEqual({ kind: 'stale', document });
  expect(await extension.sendRequest(undoOf(2, 'what  is  this'))).toEqual({ kind: 'stale', document });
  expect(await extension.readStorage()).toEqual(before);

  // Events arrive in order: if any refusal had written, its change would come before this one.
  expect(await extension.sendRequest(insertOf('fence', 'https://f.example/'))).toMatchObject({ kind: 'applied', line: 3 });
  const [change] = await changesWhen(changes, 1);
  expect(change!.mappings!.newValue).toBe(`${document}fence   https://f.example/\n`);
});

test('an undo is stale, writing nothing, once the inserted line changed or now repeats an earlier name', async ({ extension }) => {
  for (const changed of [`${DAILY}stocks               https://other.example/\n`, `stocks  https://other/\n${DAILY}${STOCKS}\n`]) {
    await extension.seedStorage({ mappings: DAILY });
    expect(await extension.sendRequest(insertOf('stocks', 'https://s.example/'))).toMatchObject({ kind: 'applied', line: 3 });
    const { usage } = await extension.readStorage();
    await extension.seedStorage({ mappings: changed, usage });
    const changes = await extension.watchStorage();

    expect(await extension.sendRequest(undoOf(3, STOCKS))).toEqual({ kind: 'stale', document: changed });
    expect(await extension.readStorage()).toEqual({ mappings: changed, usage });
    expect(await changes()).toEqual([]);
  }
});

test('two inserts of one name sent at once from two pages: one is stored, the other is told the line that has it', async ({ extension }) => {
  await extension.seedStorage({ mappings: DAILY });
  const [first, second] = [await extension.openRequestPage(), await extension.openRequestPage()];

  const replies = await Promise.all([first.send(insertOf('stocks', 'https://s.example/')), second.send(insertOf('Stocks', 'https://other.example/'))]);
  const applied = replies.find((reply) => (reply as { kind: string }).kind === 'applied') as { line: number; text: string };
  expect(applied).toMatchObject({ line: 3 });
  expect(replies.filter((reply) => reply !== applied)).toEqual([{ kind: 'name-taken', line: 3 }]);
  expect(await storedDocument(extension)).toBe(`${DAILY}${applied.text}\n`);
});

test("an insert and a jump of another mapping sent together: the creation's use and the jump's are both stored", async ({ extension, site }) => {
  const page = site.pageUrl('Held');
  await extension.seedStorage({ mappings: `held  ${page}\n` });
  const [first, second] = [await extension.openRequestPage(), await extension.openRequestPage()];

  const replies = await Promise.all([
    first.send(insertOf('stocks', 'https://s.example/')),
    second.send({ kind: 'jump', name: 'held', url: page, argument: null, mode: 'new-tab', active: false }),
  ]);
  expect(replies).toEqual([{ kind: 'applied', line: 2, text: 'stocks https://s.example/', headingMissing: false }, { kind: 'opened' }]);
  const usage = (await extension.readStorage()).usage as Record<string, number[]>;
  expect(Object.keys(usage).sort()).toEqual([`held\n${page}`, 'stocks\nhttps://s.example/']);
  expect(usage[`held\n${page}`]).toHaveLength(1);
  expect(usage['stocks\nhttps://s.example/']).toHaveLength(1);
});

test('a jump to the mapping just inserted opens it and records a second use after its creation', async ({ extension, site }) => {
  const page = site.pageUrl('Named just now');
  await extension.seedStorage({ mappings: DAILY });
  expect(await extension.sendRequest(insertOf('stocks', page))).toMatchObject({ kind: 'applied', line: 3 });
  expect(await extension.sendRequest({ kind: 'jump', name: 'stocks', url: page, argument: null, mode: 'new-tab', active: true })).toEqual({ kind: 'opened' });
  await expect.poll(() => extension.tabUrls()).toContain(page);
  const [creation, jump, ...more] = ((await extension.readStorage()).usage as Record<string, number[]>)[`stocks\n${page}`]!;
  expect(more).toEqual([]);
  expect(jump).toBeGreaterThanOrEqual(creation!);
});

test("a set Chrome refuses replies with Chrome's message and leaves the document and usage as they were", async ({ extension }) => {
  const usage = { 'mail\nhttps://mail.google.com/': [1_700_000_000_000] };
  await extension.seedStorage({ mappings: DAILY, usage });
  await extension.fillStorage(16);

  expect(await extension.sendRequest(insertOf('stocks', 'https://s.example/'))).toEqual({ kind: 'storage-failed', message: 'Resource::kQuotaBytes quota exceeded' });
  expect(await extension.readStorage()).toMatchObject({ mappings: DAILY, usage });
});

test('an insert whose page closed before the reply is still stored', async ({ extension }) => {
  // A document near E3's size makes each write take long enough that the page closes while its insert waits.
  const lines = Array.from({ length: 9_000 }, (_, i) => `name${i}  https://example${i}.example/a/path/long/enough/to/fill/the/document/to/near/its/size`);
  const document = `${lines.join('\n')}\n`;
  await extension.seedStorage({ mappings: document });
  const closing = await extension.openRequestPage();

  const ahead = Array.from({ length: 8 }, (_, i) => extension.sendRequest(insertOf(`ahead${i}`, 'https://a.example/')));
  // Once the first is done, the rest are queued, and the next insert waits behind them.
  await Promise.race(ahead);
  await closing.sendAndClose(insertOf('closed', 'https://c.example/'));
  // The page is gone while its insert still waits: no reply can reach it.
  expect(await storedDocument(extension)).not.toContain('closed');
  expect((await Promise.all(ahead)).every((reply) => (reply as { kind: string }).kind === 'applied')).toBe(true);
  await expect.poll(async () => storedDocument(extension), { timeout: 10_000 }).toMatch(/\nclosed +https:\/\/c\.example\/\n$/);
});

test('lone surrogates are stored as U+FFFD, and the line replied is the line stored, which its undo takes back', async ({ extension }) => {
  await extension.seedStorage({ mappings: '' });
  const reply = await extension.sendRequest(insertOf('a\uD800', 'https://e.example/?q=\uDC00', null, 'x\uD800'));
  const text = `a�${' '.repeat(19)}https://e.example/?q=� \\ x�`;
  expect(reply).toEqual({ kind: 'applied', line: 1, text, headingMissing: false });
  expect(await storedDocument(extension)).toBe(`${text}\n`);

  expect(await extension.sendRequest(insertOf('a\uD800', 'https://f.example/'))).toEqual({ kind: 'name-taken', line: 1 });
  expect(await extension.sendRequest(insertOf('a�', 'https://f.example/'))).toEqual({ kind: 'name-taken', line: 1 });
  expect(await extension.sendRequest(undoOf(1, text))).toEqual({ kind: 'applied', line: 1, text });
  expect(await storedDocument(extension)).toBe('');
});
