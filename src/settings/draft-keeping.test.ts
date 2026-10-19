import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Request } from '../requests';

// Chrome's transport, replaced, each message answered when the check says; the keeping and `send` are the product's.
function chromeAnsweringOnRequest() {
  const sent: { request: Request; answer(reply: unknown): void }[] = [];
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: (request: Request) => new Promise((answer) => sent.push({ request, answer })),
    },
  });
  return sent;
}

// A fresh module for each check: the page's one turn of draft requests starts empty.
const keeping = () => import('./draft-keeping');

const STORED = 'a  https://a/\n';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ now: 1_700_000_000_000 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('changes within 300 ms go as one draft set, with the last text and the time of the last change', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {});
  keeper.edited('a', 'base', STORED);
  await vi.advanceTimersByTimeAsync(100);
  keeper.edited('ab', 'base', STORED);
  await vi.advanceTimersByTimeAsync(150);
  keeper.edited('abc', 'base', STORED);
  expect(sent).toEqual([]);
  await vi.advanceTimersByTimeAsync(50);
  expect(sent.map(({ request }) => request)).toEqual([{ kind: 'draft-set', text: 'abc', base: 'base', time: 1_700_000_000_250, view: expect.any(String), number: 1 }]);
});

test('no draft set is sent while the previous one awaits its reply; the changes made meanwhile go as one once it comes', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {});
  keeper.edited('a', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  expect(sent).toHaveLength(1);
  keeper.edited('ab', 'base', STORED);
  await vi.advanceTimersByTimeAsync(1_000);
  keeper.edited('abc', 'base', STORED);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toHaveLength(1);
  sent[0]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  expect(sent.map(({ request }) => request)).toEqual([
    expect.objectContaining({ text: 'a', number: 1 }),
    expect.objectContaining({ text: 'abc', time: 1_700_000_001_300, number: 2 }),
  ]);
  expect(sent[1]!.request).toMatchObject({ view: (sent[0]!.request as { view: string }).view });
});

test('flush sends the change not yet sent at once and resolves once it has its reply', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {});
  keeper.edited('a', 'base', STORED);
  let flushed = false;
  void keeper.flush().then(() => (flushed = true));
  await vi.advanceTimersByTimeAsync(0);
  expect(sent.map(({ request }) => request)).toEqual([expect.objectContaining({ kind: 'draft-set', text: 'a' })]);
  expect(flushed).toBe(false);
  sent[0]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  expect(flushed).toBe(true);
  // Nothing more goes when the coalescing time would have ended.
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toHaveLength(1);
});

test('typed back to the stored document, the change not yet sent is dropped and the draft sent is discarded once it has its reply, only while the stored document is that text', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {});
  keeper.edited('ab', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  keeper.edited('abc', 'base', STORED);
  keeper.edited(STORED, 'base', STORED);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toHaveLength(1);
  sent[0]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  const { view } = sent[0]!.request as { view: string };
  expect(sent.map(({ request }) => request)).toEqual([expect.objectContaining({ kind: 'draft-set', text: 'ab' }), { kind: 'draft-discard', view, number: 1, ifStored: STORED }]);
  sent[1]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  // Discarded, there is nothing to name: the next read of the same document sends nothing.
  keeper.storedRead(STORED, STORED, 'base');
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toHaveLength(2);
});

test('a read of a document that comes to hold the text discards the draft; one that holds no unsaved text sends nothing', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {});
  keeper.storedRead(STORED, STORED, STORED);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toEqual([]);
  keeper.edited('typed', STORED, STORED);
  await vi.advanceTimersByTimeAsync(300);
  sent[0]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  keeper.storedRead('other', 'typed', STORED);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toHaveLength(1);
  keeper.storedRead('typed', 'typed', STORED);
  await vi.advanceTimersByTimeAsync(0);
  expect(sent[1]!.request).toEqual({ kind: 'draft-discard', view: (sent[0]!.request as { view: string }).view, number: 1, ifStored: 'typed' });
});

test('a discard the worker refuses because the stored document changed since it was read keeps the text again, with its base and the time it was made', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {});
  keeper.edited('typed', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  sent[0]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(5_000);
  // A read answered late shows the document holding the text.
  keeper.storedRead('typed', 'typed', 'base');
  await vi.advanceTimersByTimeAsync(0);
  expect(sent[1]!.request).toMatchObject({ kind: 'draft-discard', number: 1, ifStored: 'typed' });
  sent[1]!.answer({ kind: 'changed' });
  await vi.advanceTimersByTimeAsync(300);
  expect(sent[2]!.request).toMatchObject({ kind: 'draft-set', text: 'typed', base: 'base', time: 1_700_000_000_000, number: 2 });
});

test("Save's flush waits for a text kept again because the worker refused its discard while the flush was under way", async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {});
  keeper.edited('old', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  sent[0]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  keeper.edited('typed', 'base', 'typed');
  await vi.advanceTimersByTimeAsync(0);
  expect(sent[1]!.request).toMatchObject({ kind: 'draft-discard', number: 1, ifStored: 'typed' });
  let flushed = false;
  void keeper.flush().then(() => (flushed = true));
  sent[1]!.answer({ kind: 'changed' });
  await vi.advanceTimersByTimeAsync(0);
  expect(sent[2]!.request).toMatchObject({ kind: 'draft-set', text: 'typed', base: 'base', number: 2 });
  expect(flushed).toBe(false);
  sent[2]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  expect(flushed).toBe(true);
});

test('an edit given the time it was made is sent with that time', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  keepDraft(() => {}).edited('imported', 'base', STORED, 1_600_000_000_000);
  await vi.advanceTimersByTimeAsync(300);
  expect(sent[0]!.request).toMatchObject({ kind: 'draft-set', text: 'imported', time: 1_600_000_000_000 });
});

test('a text let go with no draft to discard is kept again once a read shows the stored document does not hold it', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {});
  keeper.edited('typed', 'base', STORED);
  // Within 300 ms, a read answered late shows the document holding it: nothing was sent, nothing is discarded.
  keeper.storedRead('typed', 'typed', 'base');
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toEqual([]);
  keeper.storedRead('changed again', 'typed', 'base');
  await vi.advanceTimersByTimeAsync(300);
  expect(sent.map(({ request }) => request)).toEqual([expect.objectContaining({ kind: 'draft-set', text: 'typed', base: 'base', time: 1_700_000_000_000 })]);
});

test('a set Chrome refused leaves the draft before it stored: a discard names both, and the refused change goes again with the next', async () => {
  const sent = chromeAnsweringOnRequest();
  const said: (string | null)[] = [];
  const { keepDraft } = await keeping();
  const keeper = keepDraft((message) => said.push(message));
  keeper.edited('a', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  sent[0]!.answer({ kind: 'done' });
  keeper.edited('ab', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  sent[1]!.answer({ kind: 'storage-failed', message: 'Resource::kQuotaBytes quota exceeded' });
  await vi.advanceTimersByTimeAsync(1_000);
  expect(said).toEqual([null, 'Resource::kQuotaBytes quota exceeded']);
  // Not sent again by itself.
  expect(sent).toHaveLength(2);
  void keeper.flush();
  await vi.advanceTimersByTimeAsync(0);
  expect(sent[2]!.request).toMatchObject({ kind: 'draft-set', text: 'ab', number: 3 });
  sent[2]!.answer({ kind: 'storage-failed', message: 'Resource::kQuotaBytes quota exceeded' });
  await vi.advanceTimersByTimeAsync(0);
  keeper.edited(STORED, 'base', STORED);
  expect(said.at(-1)).toBeNull();
  for (let at = 3; at < 6; at++) {
    await vi.advanceTimersByTimeAsync(0);
    sent[at]?.answer({ kind: 'done' });
  }
  const { view } = sent[0]!.request as { view: string };
  expect(sent.slice(3).map(({ request }) => request)).toEqual([1, 2, 3].map((number) => ({ kind: 'draft-discard', view, number, ifStored: STORED })));
});

test('a draft the view took over is the one a discard names, until the view sends one of its own', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {});
  keeper.holds({ text: 'theirs', base: 'base', time: 1, view: 'earlier-view', number: 7 });
  keeper.storedRead('theirs', 'theirs', 'base');
  await vi.advanceTimersByTimeAsync(0);
  expect(sent.map(({ request }) => request)).toEqual([{ kind: 'draft-discard', view: 'earlier-view', number: 7, ifStored: 'theirs' }]);
  sent[0]!.answer({ kind: 'done' });

  keeper.holds({ text: 'theirs', base: 'base', time: 1, view: 'earlier-view', number: 8 });
  keeper.edited('typed', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  sent[1]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  keeper.edited(STORED, 'base', STORED);
  await vi.advanceTimersByTimeAsync(0);
  expect(sent[2]!.request).toEqual({ kind: 'draft-discard', view: (sent[1]!.request as { view: string }).view, number: 1, ifStored: STORED });
});

test("each view opened has an identifier of its own, and the page sends its views' draft requests one after another", async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft, draftRequestsAnswered, discardDraft } = await keeping();
  const first = keepDraft(() => {});
  const second = keepDraft(() => {});
  first.edited('one', 'base', STORED);
  void first.flush();
  second.edited('two', 'base', STORED);
  void second.flush();
  void discardDraft({ view: 'other', number: 2 });
  let answered = false;
  void draftRequestsAnswered().then(() => (answered = true));
  for (let at = 0; at < 3; at++) {
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(at + 1);
    expect(answered).toBe(false);
    sent[at]!.answer({ kind: 'done' });
  }
  await vi.advanceTimersByTimeAsync(0);
  expect(answered).toBe(true);
  const [one, two, discard] = sent.map(({ request }) => request) as [{ view: string }, { view: string }, unknown];
  expect(one).toMatchObject({ text: 'one', number: 1 });
  expect(two).toMatchObject({ text: 'two', number: 1 });
  expect(one.view).not.toBe(two.view);
  // The user's own discard rests on no text.
  expect(discard).toEqual({ kind: 'draft-discard', view: 'other', number: 2 });
});
