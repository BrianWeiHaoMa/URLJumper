// The writer's *rewrite* and *remove*, and the Undo acts that reverse them and an insert (G12, G13, G14, G15,
// G21, G27, F12, R1), sent as a page sends them: each change finds its line again by its text, writes that
// line alone with `usage` in the same `set`, and stores nothing when the line changed, a name is taken, a
// value breaks a rule, or Chrome refuses the write.
import type { InsertRequest, RemoveRequest, RewriteRequest, UndoRequest } from '../src/requests.ts';
import { exampleFromSpecification, expect, recordWorkerCalls, refuseWorkerStorage, test, type LoadedExtension } from './extension.ts';

const rewriteOf = (line: number, text: string, name: string, url: string, note = ''): RewriteRequest => ({ kind: 'rewrite', line, text, name, url, note });
const removeOf = (line: number, text: string): RemoveRequest => ({ kind: 'remove', line, text });
const insertOf = (name: string, url: string): InsertRequest => ({ kind: 'insert', name, url, note: '', heading: null });

type Applied = { kind: 'applied'; line: number; text: string; endingGiven?: { text: string; ending: '\n' | '\r\n' } };

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

/** Sends `request` and returns its applied reply, failing on any other. */
async function applied(extension: LoadedExtension, request: RewriteRequest | RemoveRequest | InsertRequest | UndoRequest): Promise<Applied> {
  const reply = (await extension.sendRequest(request)) as Applied;
  expect(reply, JSON.stringify(request)).toMatchObject({ kind: 'applied' });
  return reply;
}

test("a rewrite of F11's news line keeps its URL's column and its note's, every other line as it was, in one change with the usage", async ({ extension }) => {
  const example = exampleFromSpecification();
  const news = example.split('\n')[3]!;
  await extension.seedStorage({ mappings: example });
  const changes = await extension.watchStorage();

  const text = `hn  ${news.slice('news'.length)}`;
  expect(await extension.sendRequest(rewriteOf(4, news, 'hn', 'https://news.ycombinator.com/', 'a comment after a mapping is its note'))).toEqual({ kind: 'applied', line: 4, text });
  expect(text.indexOf('https://')).toBe(news.indexOf('https://'));
  expect(text.indexOf('\\ a comment')).toBe(news.indexOf('\\ a comment'));
  expect(await storedDocument(extension)).toBe(example.replace(news, text));
  await expect.poll(async () => (await changes()).length).toBe(1);
  expect(Object.keys((await changes())[0]!).sort()).toEqual(['mappings', 'usage']);
});

test('a rewrite finds its line by its text after lines were added above it, and keeps its ending', async ({ extension }) => {
  await extension.seedStorage({ mappings: '\\ new\nn  n:1\na  u:1\nb  v:2\r\nc  w:3' });
  expect(await extension.sendRequest(rewriteOf(2, 'b  v:2', 'bb', 'v:3'))).toEqual({ kind: 'applied', line: 4, text: 'bb v:3' });
  expect(await extension.sendRequest(rewriteOf(5, 'c  w:3', 'c', 'w:4', 'note'))).toEqual({ kind: 'applied', line: 5, text: 'c  w:4 \\ note' });
  expect(await storedDocument(extension)).toBe('\\ new\nn  n:1\na  u:1\nbb v:3\r\nc  w:4 \\ note');
});

test("a rename learns afresh, a note or the name's case alone keeps the learning, and a remove drops it, each with the document in one set", async ({ extension }) => {
  const key = 'stocks\nhttps://s.example/';
  const times = [1_700_000_000_001, 1_700_000_000_002];
  await extension.seedStorage({ mappings: 'stocks  https://s.example/\n', usage: { [key]: times } });
  const calls = await recordWorkerCalls(extension.worker);
  const changes = await extension.watchStorage();

  await applied(extension, rewriteOf(1, 'stocks  https://s.example/', 'stocks', 'https://s.example/', 'daily'));
  expect(await extension.readStorage()).toEqual({ mappings: 'stocks  https://s.example/ \\ daily\n', usage: { [key]: times } });
  await applied(extension, rewriteOf(1, 'stocks  https://s.example/ \\ daily', 'Stocks', 'https://s.example/', 'daily'));
  expect(await extension.readStorage()).toEqual({ mappings: 'Stocks  https://s.example/ \\ daily\n', usage: { [key]: times } });
  // Chrome reports only keys whose value changed, so the usage written unchanged shows in the calls alone.
  const sets = (await calls()).filter(([method]) => method === 'storage.set');
  expect(sets.map(([, items]) => Object.keys(items as object).sort())).toEqual([['mappings', 'usage'], ['mappings', 'usage']]);
  await expect.poll(async () => (await changes()).length).toBe(2);
  expect((await changes()).map((change) => Object.keys(change))).toEqual([['mappings'], ['mappings']]);

  const before = Date.now();
  await applied(extension, rewriteOf(1, 'Stocks  https://s.example/ \\ daily', 'shares', 'https://s.example/'));
  const after = Date.now();
  const renamed = await extension.readStorage();
  expect(renamed.mappings).toBe('shares  https://s.example/\n');
  const usage = renamed.usage as Record<string, number[]>;
  expect(Object.keys(usage)).toEqual(['shares\nhttps://s.example/']);
  expect(usage['shares\nhttps://s.example/']).toHaveLength(1);
  expect(usage['shares\nhttps://s.example/']![0]).toBeGreaterThanOrEqual(before);
  expect(usage['shares\nhttps://s.example/']![0]).toBeLessThanOrEqual(after);

  await applied(extension, removeOf(1, 'shares  https://s.example/'));
  expect(await extension.readStorage()).toEqual({ mappings: '', usage: {} });
  await expect.poll(async () => (await changes()).length).toBe(4);
  expect((await changes()).slice(2).map((change) => Object.keys(change).sort())).toEqual([
    ['mappings', 'usage'],
    ['mappings', 'usage'],
  ]);
});

test('a remove takes its line away with its own ending, and a last line leaves the line before without its own', async ({ extension }) => {
  for (const [document, line, text, removed] of [
    ['a a:1\r\nb b:1\nc c:1', 1, 'a a:1', 'b b:1\nc c:1'],
    ['a a:1\r\nb b:1\nc c:1', 3, 'c c:1', 'a a:1\r\nb b:1'],
    ['a a:1\nb b:1\r\nc c:1', 3, 'c c:1', 'a a:1\nb b:1'],
    ['a a:1\nb b:1\n', 2, 'b b:1', 'a a:1\n'],
    ['a a:1', 1, 'a a:1', ''],
  ] as const) {
    await extension.seedStorage({ mappings: document });
    expect(await extension.sendRequest(removeOf(line, text))).toEqual({ kind: 'applied', line, text });
    expect(await storedDocument(extension), JSON.stringify(document)).toBe(removed);
  }
});

test('a refused rewrite or remove writes nothing: a line changed, gone, or unreadable, a taken name, a value that breaks a rule', async ({ extension }) => {
  const document = 'Stocks  https://s.example/\nhold  https://h.example/\nb  x:1\nb  v:2\n';
  await extension.seedStorage({ mappings: document, usage: { 'stocks\nhttps://s.example/': [1_700_000_000_000] } });
  const before = await extension.readStorage();
  const changes = await extension.watchStorage();
  const stocks = 'Stocks  https://s.example/';

  for (const request of [
    rewriteOf(1, 'Stocks  https://other.example/', 'a', 'u:1'),
    rewriteOf(9, 'gone  https://g.example/', 'a', 'u:1'),
    // Line 4 has the text but repeats line 3's name: it is unreadable, never an anchor.
    rewriteOf(4, 'b  v:2', 'c', 'v:2'),
    removeOf(4, 'b  v:2'),
    removeOf(1, 'Stocks  https://other.example/'),
  ]) {
    expect(await extension.sendRequest(request), JSON.stringify(request)).toEqual({ kind: 'stale', document });
  }
  expect(await extension.sendRequest(rewriteOf(1, stocks, 'HOLD', 'https://s.example/'))).toEqual({ kind: 'name-taken', line: 2 });
  for (const [values, problem] of [
    [['', 'u:1', ''], { field: 'name', rule: 'empty' }],
    [['a\\b', 'u:1', ''], { field: 'name', rule: 'backslash' }],
    [['a\nb', 'u:1', ''], { field: 'name', rule: 'line-break' }],
    [['a', 'u:1 x', ''], { field: 'url', rule: 'whitespace' }],
    [['a', 'u:1\\x', ''], { field: 'url', rule: 'backslash' }],
    [['a', 'é:x', ''], { field: 'url', rule: 'no-scheme' }],
    [['a', 'u:1', 'a\rb'], { field: 'note', rule: 'line-break' }],
  ] as const) {
    const [name, url, note] = values;
    expect(await extension.sendRequest(rewriteOf(1, stocks, name, url, note)), JSON.stringify(values)).toEqual({ kind: 'invalid', ...problem });
  }
  expect(await extension.readStorage()).toEqual(before);

  // Events arrive in order: if any refusal had written, its change would come before this one.
  await applied(extension, insertOf('fence', 'https://f.example/'));
  await expect.poll(async () => (await changes()).length).toBe(1);
  expect((await changes())[0]!.mappings!.newValue).toBe(`${document}fence https://f.example/\n`);
});

test('two rewrites of one line sent at once from two pages: one is stored, the other is stale with the stored text', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'a  u:1\nb  v:2\n' });
  const [first, second] = [await extension.openRequestPage(), await extension.openRequestPage()];

  const replies = (await Promise.all([first.send(rewriteOf(2, 'b  v:2', 'one', 'v:2')), second.send(rewriteOf(2, 'b  v:2', 'two', 'v:2'))])) as { kind: string }[];
  const stored = (await storedDocument(extension)) as string;
  expect(replies.map((reply) => reply.kind).sort()).toEqual(['applied', 'stale']);
  expect(replies.find((reply) => reply.kind === 'stale')).toEqual({ kind: 'stale', document: stored });
  expect(['a  u:1\none v:2\n', 'a  u:1\ntwo v:2\n']).toContain(stored);
});

test("a rewrite's Undo restores the former text exactly, the restore's own Undo the rewrite; refused when the name was taken or the line changed", async ({ extension }) => {
  const former = '  Stocks\t https://s.example/   \\  its note ';
  const original = `\\ Money\n${former}\r\nz  z:1\n`;
  await extension.seedStorage({ mappings: original });

  const rewrite = await applied(extension, rewriteOf(2, former, 'shares', 'https://t.example/'));
  expect(rewrite).toEqual({ kind: 'applied', line: 2, text: 'shares    https://t.example/' });
  const rewritten = `\\ Money\n${rewrite.text}\r\nz  z:1\n`;
  expect(await storedDocument(extension)).toBe(rewritten);

  const restore: UndoRequest = { kind: 'undo', act: 'restore', line: rewrite.line, text: rewrite.text, former };
  expect(await extension.sendRequest(restore)).toEqual({ kind: 'applied', line: 2, text: former });
  expect(await storedDocument(extension)).toBe(original);
  expect(await extension.sendRequest({ kind: 'undo', act: 'restore', line: 2, text: former, former: rewrite.text })).toEqual({ kind: 'applied', line: 2, text: rewrite.text });
  expect(await storedDocument(extension)).toBe(rewritten);

  // Another window took the former name meanwhile, then changed the rewritten line.
  const taken = `${rewritten}STOCKS  https://u.example/\n`;
  await extension.seedStorage({ mappings: taken });
  expect(await extension.sendRequest(restore)).toEqual({ kind: 'name-taken', line: 4 });
  const changed = taken.replace(rewrite.text, 'shares  https://other.example/');
  await extension.seedStorage({ mappings: changed });
  expect(await extension.sendRequest(restore)).toEqual({ kind: 'stale', document: changed });
  expect(await storedDocument(extension)).toBe(changed);
});

test('the Undo of a line put after the last line takes back exactly the ending it gave, though the lines before changed since', async ({ extension }) => {
  // A CRLF first line removed after the insert: the LF document's last line comes back as it was.
  await extension.seedStorage({ mappings: 'first first:1\r\nsecond second:1\nlast last:1' });
  const inserted = await applied(extension, insertOf('new', 'n:1'));
  expect(inserted.endingGiven).toEqual({ text: 'last last:1', ending: '\r\n' });
  await applied(extension, removeOf(1, 'first first:1'));
  await applied(extension, { kind: 'undo', act: 'remove', line: inserted.line, text: inserted.text, endingGiven: inserted.endingGiven });
  expect(await storedDocument(extension)).toBe('second second:1\nlast last:1');

  // The line the insert gave an ending to removed since: the line now before loses its own CRLF whole.
  await extension.seedStorage({ mappings: 'z z:1\nq q:1\r\np p:1' });
  const after = await applied(extension, insertOf('n', 'n:1'));
  await applied(extension, removeOf(3, 'p p:1'));
  await applied(extension, { kind: 'undo', act: 'remove', line: after.line, text: after.text, endingGiven: after.endingGiven });
  expect(await storedDocument(extension)).toBe('z z:1\nq q:1');

  // A remove's Undo puts its line back after the last line; a CRLF first line removed; that Undo's Undo.
  await extension.seedStorage({ mappings: 'x x:1\r\na a:1\nb b:1' });
  const removed = await applied(extension, removeOf(3, 'b b:1'));
  const putBack = await applied(extension, { kind: 'undo', act: 'reinsert', line: removed.line, text: removed.text });
  expect(putBack).toEqual({ kind: 'applied', line: 3, text: 'b b:1', endingGiven: { text: 'a a:1', ending: '\r\n' } });
  expect(await storedDocument(extension)).toBe('x x:1\r\na a:1\r\nb b:1');
  await applied(extension, removeOf(1, 'x x:1'));
  await applied(extension, { kind: 'undo', act: 'remove', line: putBack.line, text: putBack.text, endingGiven: putBack.endingGiven });
  expect(await storedDocument(extension)).toBe('a a:1');
});

test("a rewrite or remove Chrome refuses replies with Chrome's message and leaves the document and usage as they were", async ({ extension }) => {
  const usage = { 'stocks\nhttps://s.example/': [1_700_000_000_000] };
  const document = 'stocks  https://s.example/\nkeep  https://k.example/\n';
  await extension.seedStorage({ mappings: document, usage });
  await extension.fillStorage(16);
  expect(await extension.sendRequest(rewriteOf(1, 'stocks  https://s.example/', 'stocks', `https://s.example/${'a'.repeat(64)}`))).toEqual({
    kind: 'storage-failed',
    message: 'Resource::kQuotaBytes quota exceeded',
  });
  expect(await extension.readStorage()).toMatchObject({ mappings: document, usage });

  await refuseWorkerStorage(extension.worker, 'set', 'IO error: refused');
  expect(await extension.sendRequest(removeOf(2, 'keep  https://k.example/'))).toEqual({ kind: 'storage-failed', message: 'IO error: refused' });
  expect(await extension.readStorage()).toMatchObject({ mappings: document, usage });
});
