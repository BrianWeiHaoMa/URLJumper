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
  const keeper = keepDraft(() => {}, () => {});
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
  const keeper = keepDraft(() => {}, () => {});
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
  const keeper = keepDraft(() => {}, () => {});
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

test('typed back to the stored document as last read, the view reads again; that read, showing the document holding the text, drops the change not yet sent and discards the draft sent, by name, once it has its reply', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  let readsAsked = 0;
  const keeper = keepDraft(() => {}, () => readsAsked++);
  keeper.edited('ab', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  keeper.edited('abc', 'base', STORED);
  expect(readsAsked).toBe(0);
  keeper.edited(STORED, 'base', STORED);
  expect(readsAsked).toBe(1);
  keeper.storedRead(STORED, keeper.reading(), true);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toHaveLength(1);
  sent[0]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  const { view } = sent[0]!.request as { view: string };
  expect(sent.map(({ request }) => request)).toEqual([expect.objectContaining({ kind: 'draft-set', text: 'ab' }), { kind: 'draft-discard', view, number: 1 }]);
  sent[1]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  // Discarded, there is nothing to name: the next read of the same document sends nothing.
  keeper.storedRead(STORED, keeper.reading(), true);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toHaveLength(2);
  expect(readsAsked).toBe(1);
});

test('a read made after the text, of a document that comes to hold it, discards the draft by name alone and keeps nothing again; one that holds no unsaved text sends nothing', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {}, () => {});
  keeper.storedRead(STORED, keeper.reading(), true);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toEqual([]);
  keeper.edited('typed', STORED, STORED);
  await vi.advanceTimersByTimeAsync(300);
  sent[0]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  keeper.storedRead('other', keeper.reading(), true);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toHaveLength(1);
  // Another page stored the text after it was typed: it is no unsaved edit, whatever the document becomes since.
  keeper.storedRead('typed', keeper.reading(), true);
  await vi.advanceTimersByTimeAsync(0);
  expect(sent[1]!.request).toEqual({ kind: 'draft-discard', view: (sent[0]!.request as { view: string }).view, number: 1 });
  sent[1]!.answer({ kind: 'done' });
  keeper.storedRead('changed again', keeper.reading(), true);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toHaveLength(2);
});

test('a read made before the text, answered late, that shows the document holding it discards nothing: the view reads again, unless a later read was made since', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  let readsAsked = 0;
  const keeper = keepDraft(() => {}, () => readsAsked++);
  const before = keeper.reading();
  keeper.edited('typed', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  sent[0]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  keeper.storedRead('typed', before, false);
  expect(readsAsked).toBe(0);
  keeper.storedRead('typed', before, true);
  expect(readsAsked).toBe(1);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toHaveLength(1);
  // The read made again shows the document changed since: the text stays kept.
  keeper.storedRead('changed', keeper.reading(), true);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toHaveLength(1);
  expect(readsAsked).toBe(1);
});

test("a text equal to the stored document as last read stays kept until a read made since shows it held: Save's flush sends it", async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {}, () => {});
  keeper.edited('old', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  sent[0]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  keeper.edited('typed', 'base', 'typed');
  let flushed = false;
  void keeper.flush().then(() => (flushed = true));
  await vi.advanceTimersByTimeAsync(0);
  expect(sent[1]!.request).toMatchObject({ kind: 'draft-set', text: 'typed', base: 'base', number: 2 });
  expect(flushed).toBe(false);
  sent[1]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  expect(flushed).toBe(true);
});

test('an edit given the time it was made is sent with that time', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  keepDraft(() => {}, () => {}).edited('imported', 'base', STORED, 1_600_000_000_000);
  await vi.advanceTimersByTimeAsync(300);
  expect(sent[0]!.request).toMatchObject({ kind: 'draft-set', text: 'imported', time: 1_600_000_000_000 });
});

test('a text equal to the stored document as last read, with no draft sent, is kept within 300 ms while no read made since shows it held', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  let readsAsked = 0;
  const keeper = keepDraft(() => {}, () => readsAsked++);
  const before = keeper.reading();
  keeper.edited('typed', 'base', 'typed');
  expect(readsAsked).toBe(1);
  // A read made before the edit, answered late, shows the document holding it too.
  keeper.storedRead('typed', before, false);
  await vi.advanceTimersByTimeAsync(300);
  expect(sent.map(({ request }) => request)).toEqual([expect.objectContaining({ kind: 'draft-set', text: 'typed', base: 'base', time: 1_700_000_000_000 })]);
});

test('a set Chrome refused leaves the draft before it stored: a discard names both, and the refused change goes again with the next', async () => {
  const sent = chromeAnsweringOnRequest();
  const said: (string | null)[] = [];
  const { keepDraft } = await keeping();
  const keeper = keepDraft((message) => said.push(message), () => {});
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
  keeper.storedRead(STORED, keeper.reading(), true);
  expect(said.at(-1)).toBeNull();
  for (let at = 3; at < 6; at++) {
    await vi.advanceTimersByTimeAsync(0);
    sent[at]?.answer({ kind: 'done' });
  }
  const { view } = sent[0]!.request as { view: string };
  expect(sent.slice(3).map(({ request }) => request)).toEqual([1, 2, 3].map((number) => ({ kind: 'draft-discard', view, number })));
});

test("settled, as after the view's Save stored its text, each draft the view holds goes by name alone, and a later read of a document changed since keeps nothing again", async () => {
  const sent = chromeAnsweringOnRequest();
  const said: (string | null)[] = [];
  const { keepDraft } = await keeping();
  const keeper = keepDraft((message) => said.push(message), () => {});
  keeper.edited('a', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  sent[0]!.answer({ kind: 'done' });
  keeper.edited('ab', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  sent[1]!.answer({ kind: 'storage-failed', message: 'Resource::kQuotaBytes quota exceeded' });
  await vi.advanceTimersByTimeAsync(0);
  keeper.settled();
  expect(said.at(-1)).toBeNull();
  for (let at = 2; at < 4; at++) {
    await vi.advanceTimersByTimeAsync(0);
    sent[at]?.answer({ kind: 'done' });
  }
  const { view } = sent[0]!.request as { view: string };
  expect(sent.slice(2).map(({ request }) => request)).toEqual([1, 2].map((number) => ({ kind: 'draft-discard', view, number })));
  // Read again over a document another page changed, the saved text is no unsaved change of the view's.
  keeper.storedRead('ab  https://other/\n', keeper.reading(), true);
  keeper.storedRead('ab', keeper.reading(), true);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(sent).toHaveLength(4);
});

test('a read answered after a later one was made, made since the text and showing the document holding it, still lets the draft go, after a set still on its way', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {}, () => {});
  keeper.edited('typed', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  expect(sent).toHaveLength(1);
  keeper.storedRead('typed', keeper.reading(), false);
  sent[0]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  const { view } = sent[0]!.request as { view: string };
  expect(sent.slice(1).map(({ request }) => request)).toEqual([{ kind: 'draft-discard', view, number: 1 }]);
  sent[1]!.answer({ kind: 'done' });
  // A later read of a document changed since keeps nothing again.
  keeper.storedRead('changed', keeper.reading(), true);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sent).toHaveLength(2);
});

test('a draft the view took over is the one a discard names, until the view sends one of its own', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {}, () => {});
  keeper.holds({ text: 'theirs', base: 'base', time: 1, view: 'earlier-view', number: 7 });
  keeper.storedRead('theirs', keeper.reading(), true);
  await vi.advanceTimersByTimeAsync(0);
  expect(sent.map(({ request }) => request)).toEqual([{ kind: 'draft-discard', view: 'earlier-view', number: 7 }]);
  sent[0]!.answer({ kind: 'done' });

  keeper.holds({ text: 'theirs', base: 'base', time: 1, view: 'earlier-view', number: 8 });
  keeper.edited('typed', 'base', STORED);
  await vi.advanceTimersByTimeAsync(300);
  sent[1]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  keeper.edited(STORED, 'base', STORED);
  keeper.storedRead(STORED, keeper.reading(), true);
  await vi.advanceTimersByTimeAsync(0);
  expect(sent[2]!.request).toEqual({ kind: 'draft-discard', view: (sent[1]!.request as { view: string }).view, number: 1 });
});

test("each view opened has an identifier of its own, and the page sends its views' draft requests one after another", async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft, draftRequestsAnswered, discardDraft } = await keeping();
  const first = keepDraft(() => {}, () => {});
  const second = keepDraft(() => {}, () => {});
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

test('the view holds an unsaved change while a text it kept, or is about to keep, is one the stored document as last read does not hold', async () => {
  const sent = chromeAnsweringOnRequest();
  const { keepDraft } = await keeping();
  const keeper = keepDraft(() => {}, () => {});
  const crlf = 'a  https://a/\r\n';
  // Loaded and untouched, a CRLF document too, though the text area shows it with LF endings: none.
  expect(keeper.unsaved(crlf)).toBe(false);
  // Typed back to that document's text, which the text area holds with LF endings: one, about to be kept.
  keeper.edited('a  https://a/\n', crlf, crlf);
  expect(keeper.unsaved(crlf)).toBe(true);
  expect(keeper.unsaved('a  https://a/\n')).toBe(false);
  // Stored as the draft, it stays one until the document holds it.
  await vi.advanceTimersByTimeAsync(300);
  sent[0]!.answer({ kind: 'done' });
  await vi.advanceTimersByTimeAsync(0);
  expect(keeper.unsaved(crlf)).toBe(true);
  // Settled, as after the view's Save stored the text: none.
  keeper.settled();
  expect(keeper.unsaved(crlf)).toBe(false);
  // A draft the view took over, resumed, is one.
  keeper.holds({ text: 'b  https://b/\n', base: crlf, time: 1_700_000_000_000, view: 'another-view', number: 2 });
  expect(keeper.unsaved(crlf)).toBe(true);
});
