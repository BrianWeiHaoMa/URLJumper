// The writer's *move* and the Undo act that moves a line back (G12, G13, G15, G21, G26, G27, R1), sent as a
// page sends them: a mapping line is cut and pasted directly before the previous mapping line or directly after
// the next, found again by its text, written with `usage` in the same `set`, and nothing is stored when the
// line changed, the document admits no such move, going back would pass a line with its name, or Chrome
// refuses the write.
import type { MoveRequest, UndoRequest } from '../src/requests.ts';
import { exampleFromSpecification, expect, recordWorkerCalls, refuseWorkerStorage, test, type LoadedExtension } from './extension.ts';

const moveOf = (line: number, text: string, direction: 'up' | 'down'): MoveRequest => ({ kind: 'move', line, text, direction });
const moveBackOf = (moved: Moved): UndoRequest => ({ kind: 'undo', act: 'move-back', line: moved.line, text: moved.text, to: moved.from });

type Moved = { kind: 'applied'; line: number; text: string; from: number };

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

/** Sends `request` and returns its applied reply, failing on any other. */
async function applied(extension: LoadedExtension, request: MoveRequest | UndoRequest): Promise<Moved> {
  const reply = (await extension.sendRequest(request)) as Moved;
  expect(reply, JSON.stringify(request)).toMatchObject({ kind: 'applied' });
  return reply;
}

test("F11's news moved up changes places with cal, every other byte the same, in one set with the usage, whose learning stays", async ({ extension }) => {
  const example = exampleFromSpecification();
  const lines = example.split('\n');
  const usage = { 'news\nhttps://news.ycombinator.com/': [1_700_000_000_001, 1_700_000_000_002], 'mail\nhttps://mail.google.com/': [1_700_000_000_003] };
  await extension.seedStorage({ mappings: example, usage });
  const calls = await recordWorkerCalls(extension.worker);
  const changes = await extension.watchStorage();

  expect(await extension.sendRequest(moveOf(4, lines[3]!, 'up'))).toEqual({ kind: 'applied', line: 3, text: lines[3], from: 4 });
  expect(await extension.readStorage()).toEqual({ mappings: [...lines.slice(0, 2), lines[3], lines[2], ...lines.slice(4)].join('\n'), usage });
  const sets = (await calls()).filter(([method]) => method === 'storage.set');
  expect(sets.map(([, items]) => Object.keys(items as object).sort())).toEqual([['mappings', 'usage']]);
  // Chrome reports only keys whose value changed: the usage was written unchanged.
  await expect.poll(async () => (await changes()).length).toBe(1);
  expect(Object.keys((await changes())[0]!)).toEqual(['mappings']);
});

test('a move goes past comment, blank, tab-separated, and unreadable lines as G12 says, with its endings; its Undo moves it back, and that Undo its own', async ({ extension }) => {
  for (const [original, line, text, direction, moved, back] of [
    ['A u:1\n\\ heading\n\nB u:2\n', 4, 'B u:2', 'up', 'B u:2\nA u:1\n\\ heading\n\n', 'A u:1\n\\ heading\n\nB u:2\n'],
    ['A u:1\n\\ heading\n\nB u:2\n', 1, 'A u:1', 'down', '\\ heading\n\nB u:2\nA u:1\n', 'A u:1\n\\ heading\n\nB u:2\n'],
    ['A u:1\nx\tu:9\nB u:2', 3, 'B u:2', 'up', 'A u:1\nB u:2\nx\tu:9', 'A u:1\nx\tu:9\nB u:2'],
    ['\\ top\nA u:1\nB u:2\n', 2, 'A u:1', 'down', '\\ top\nB u:2\nA u:1\n', '\\ top\nA u:1\nB u:2\n'],
    ['a u:1\na v:2\nb u:3', 3, 'b u:3', 'up', 'b u:3\na u:1\na v:2', 'a u:1\na v:2\nb u:3'],
    // A line that stops being last gains the document's ending as it stands, a line that becomes last loses its own.
    ['X u:1\r\nY u:2\nZ u:3', 3, 'Z u:3', 'up', 'X u:1\r\nZ u:3\r\nY u:2', 'X u:1\r\nY u:2\r\nZ u:3'],
    ['A u:1\nB u:2\r\nC u:3', 2, 'B u:2', 'down', 'A u:1\nC u:3\nB u:2', 'A u:1\nB u:2\nC u:3'],
  ] as const) {
    await extension.seedStorage({ mappings: original });
    const move = await applied(extension, moveOf(line, text, direction));
    expect(await storedDocument(extension), JSON.stringify(original)).toBe(moved);
    const moveBack = await applied(extension, moveBackOf(move));
    expect(moveBack).toEqual({ kind: 'applied', line, text, from: move.line });
    expect(await storedDocument(extension), JSON.stringify(original)).toBe(back);
    expect(await extension.sendRequest(moveBackOf(moveBack))).toEqual(move);
    expect(await storedDocument(extension), JSON.stringify(original)).toBe(moved);
  }
});

test('a refused move writes nothing: the first mapping up, the last down, past a line with its name, a line changed or unreadable', async ({ extension }) => {
  const document = '\\ top\na u:1\na v:2\nb u:3\nc u:4\r';
  await extension.seedStorage({ mappings: document, usage: { 'b\nu:3': [1_700_000_000_000] } });
  const before = await extension.readStorage();
  const changes = await extension.watchStorage();

  for (const request of [
    moveOf(2, 'a u:1', 'up'),
    // Past `a v:2`, which repeats its name: that line would become the mapping and this one unreadable.
    moveOf(2, 'a u:1', 'down'),
    // Found by its text, though named at another number.
    moveOf(9, 'a u:1', 'down'),
    moveOf(5, 'c u:4\r', 'down'),
  ]) {
    expect(await extension.sendRequest(request), JSON.stringify(request)).toEqual({ kind: 'immovable', document });
  }
  for (const request of [moveOf(3, 'a v:2', 'up'), moveOf(4, 'b u:9', 'up'), moveOf(9, 'gone u:9', 'down')]) {
    expect(await extension.sendRequest(request), JSON.stringify(request)).toEqual({ kind: 'stale', document });
  }
  expect(await extension.readStorage()).toEqual(before);

  // Events arrive in order: if any refusal had written, its change would come before this one.
  expect(await extension.sendRequest(moveOf(9, 'b u:3', 'up'))).toEqual({ kind: 'applied', line: 2, text: 'b u:3', from: 4 });
  await expect.poll(async () => (await changes()).length).toBe(1);
  expect((await changes())[0]!.mappings!.newValue).toBe('\\ top\nb u:3\na u:1\na v:2\nc u:4\r');
  expect((await extension.readStorage()).usage).toEqual(before.usage);
});

test('a move back goes to the number its line had, after the last line when there are fewer lines now; refused past a line with its name or when its line changed', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'a u:1\nb u:2\nc u:3\n' });
  const move = await applied(extension, moveOf(3, 'c u:3', 'up'));
  expect(move).toEqual({ kind: 'applied', line: 2, text: 'c u:3', from: 3 });
  // Another window removed the lines it went back among, then added one after it: it goes back last.
  await extension.seedStorage({ mappings: 'c u:3\n\\ new' });
  expect(await extension.sendRequest(moveBackOf(move))).toEqual({ kind: 'applied', line: 2, text: 'c u:3', from: 1 });
  expect(await storedDocument(extension)).toBe('\\ new\nc u:3');

  await extension.seedStorage({ mappings: 'a u:1\na v:2\nb u:3' });
  const up = await applied(extension, moveOf(3, 'b u:3', 'up'));
  // Another window added a line repeating its name where it would go back past it.
  const repeated = 'b u:3\nb x:9\na u:1\na v:2';
  await extension.seedStorage({ mappings: repeated });
  expect(await extension.sendRequest(moveBackOf(up))).toEqual({ kind: 'name-taken', line: 2 });
  const changed = 'b u:4\na u:1\na v:2';
  await extension.seedStorage({ mappings: changed });
  expect(await extension.sendRequest(moveBackOf(up))).toEqual({ kind: 'stale', document: changed });
  expect(await storedDocument(extension)).toBe(changed);
});

test('a line ending in a lone CR moves and goes back as any other, the CR joining an ending G12 gives it, and the reply giving its text as it now reads', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'a u:1\nb u:2\r\r\nc u:3' });
  const down = await applied(extension, moveOf(2, 'b u:2\r', 'down'));
  expect(down).toEqual({ kind: 'applied', line: 3, text: 'b u:2\r', from: 2 });
  expect(await storedDocument(extension)).toBe('a u:1\nc u:3\nb u:2\r');
  expect(await extension.sendRequest(moveBackOf(down))).toEqual({ kind: 'applied', line: 2, text: 'b u:2', from: 3 });
  expect(await storedDocument(extension)).toBe('a u:1\nb u:2\r\nc u:3');

  await extension.seedStorage({ mappings: 'a u:1\nb u:2\r' });
  const up = await applied(extension, moveOf(2, 'b u:2\r', 'up'));
  expect(up).toEqual({ kind: 'applied', line: 1, text: 'b u:2', from: 2 });
  expect(await storedDocument(extension)).toBe('b u:2\r\na u:1');
  expect(await extension.sendRequest(moveBackOf(up))).toEqual({ kind: 'applied', line: 2, text: 'b u:2', from: 1 });
  // The first line break is now CRLF: the line that stops being last gains it.
  expect(await storedDocument(extension)).toBe('a u:1\r\nb u:2');
});

test('two moves of one line sent at once from two pages: one is stored, the other refused with the stored text', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'a u:1\nb u:2' });
  const [first, second] = [await extension.openRequestPage(), await extension.openRequestPage()];

  const replies = (await Promise.all([first.send(moveOf(2, 'b u:2', 'up')), second.send(moveOf(2, 'b u:2', 'up'))])) as { kind: string }[];
  expect(await storedDocument(extension)).toBe('b u:2\na u:1');
  expect(replies.map((reply) => reply.kind).sort()).toEqual(['applied', 'immovable']);
  expect(replies.find((reply) => reply.kind === 'immovable')).toEqual({ kind: 'immovable', document: 'b u:2\na u:1' });
});

test("a move or move back Chrome refuses replies with Chrome's message and leaves the document and usage as they were", async ({ extension }) => {
  const usage = { 'z\nu:3': [1_700_000_000_000] };
  // Moved up, Z gains a CRLF and Y loses an LF: one byte more than there is room for.
  const document = 'X u:1\r\nY u:2\nZ u:3';
  await extension.seedStorage({ mappings: document, usage });
  await extension.fillStorage(0);
  expect(await extension.sendRequest(moveOf(3, 'Z u:3', 'up'))).toEqual({ kind: 'storage-failed', message: 'Resource::kQuotaBytes quota exceeded' });
  expect(await extension.readStorage()).toMatchObject({ mappings: document, usage });

  await extension.seedStorage({ mappings: 'Z u:3\r\nX u:1\r\nY u:2', usage });
  await refuseWorkerStorage(extension.worker, 'set', 'IO error: refused');
  expect(await extension.sendRequest({ kind: 'undo', act: 'move-back', line: 1, text: 'Z u:3', to: 2 })).toEqual({ kind: 'storage-failed', message: 'IO error: refused' });
  expect(await extension.readStorage()).toEqual({ mappings: 'Z u:3\r\nX u:1\r\nY u:2', usage });
});
