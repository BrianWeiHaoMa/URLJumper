import { afterEach, expect, test, vi } from 'vitest';
import {
  isRequest,
  send,
  type DraftDiscardRequest,
  type DraftSetRequest,
  type InsertRequest,
  type JumpRequest,
  type LoadExampleRequest,
  type MoveRequest,
  type RemoveIntentRequest,
  type RemoveRequest,
  type ReplaceRequest,
  type ResetUsageRequest,
  type RewriteRequest,
  type UndoRequest,
} from './requests';

const JUMP: JumpRequest = { kind: 'jump', name: 'alpha', url: 'https://a.example/', argument: null, mode: 'new-tab', active: true };
const REMOVE_INTENT: RemoveIntentRequest = { kind: 'remove-intent', windowId: 3, time: 1_700_000_000_000 };
const INSERT: InsertRequest = { kind: 'insert', name: 'stocks', url: 'https://s.example/', note: '', heading: null };
const UNDO: UndoRequest = { kind: 'undo', act: 'remove', line: 3, text: 'stocks               https://s.example/' };
const REINSERT: UndoRequest = { ...UNDO, act: 'reinsert' };
const UNDO_GIVEN: UndoRequest = { ...UNDO, endingGiven: { text: 'mail  https://mail.google.com/', ending: '\r\n' } };
const RESTORE: UndoRequest = { kind: 'undo', act: 'restore', line: 3, text: 'shares               https://s.example/', former: 'stocks  https://s.example/  \ its note' };
const REWRITE: RewriteRequest = { kind: 'rewrite', line: 3, text: 'stocks  https://s.example/', name: 'shares', url: 'https://s.example/', note: '' };
const REMOVE: RemoveRequest = { kind: 'remove', line: 3, text: 'stocks  https://s.example/' };
const MOVE: MoveRequest = { kind: 'move', line: 3, text: 'stocks  https://s.example/', direction: 'up' };
const MOVE_BACK: UndoRequest = { kind: 'undo', act: 'move-back', line: 2, text: 'stocks  https://s.example/', to: 3 };
const LOAD_EXAMPLE: LoadExampleRequest = { kind: 'load-example' };
const RESET_USAGE: ResetUsageRequest = { kind: 'reset-usage' };
const REPLACE: ReplaceRequest = { kind: 'replace', text: 'a  https://a.example/\nb  https://b.example/\n', base: 'a  https://a.example/\r\n' };
const DRAFT_SET: DraftSetRequest = { kind: 'draft-set', text: 'a  https://a.example/\nb', base: 'a  https://a.example/\r\n', time: 1_700_000_000_500, view: '0b5c6d3e-1f2a-4b3c-8d4e-5f6a7b8c9d0e', number: 3 };
const DRAFT_DISCARD: DraftDiscardRequest = { kind: 'draft-discard', view: DRAFT_SET.view, number: 3 };
const NO_REPLY = { kind: 'storage-failed', message: "URLJumper's service worker did not reply." };

// Chrome's transport, replaced; `send` is the product's.
function chromeWhoseSendMessage(sendMessage: (message: unknown) => Promise<unknown>) {
  const sent: unknown[] = [];
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: (message: unknown) => {
        sent.push(message);
        return sendMessage(message);
      },
    },
  });
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("send passes the request to Chrome as it is and resolves to the worker's reply", async () => {
  const sent = chromeWhoseSendMessage(async () => ({ kind: 'failed', message: 'No tab with id: 7.' }));
  expect(await send(JUMP)).toEqual({ kind: 'failed', message: 'No tab with id: 7.' });
  expect(sent).toEqual([JUMP]);
  chromeWhoseSendMessage(async () => ({ kind: 'opened' }));
  expect(await send(JUMP)).toEqual({ kind: 'opened' });
});

test("a send Chrome rejects resolves to storage-failed with Chrome's message", async () => {
  chromeWhoseSendMessage(() => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')));
  expect(await send(JUMP)).toEqual({ kind: 'storage-failed', message: 'Could not establish connection. Receiving end does not exist.' });
});

test('a send that throws before it is under way resolves to storage-failed', async () => {
  chromeWhoseSendMessage(() => {
    throw new Error('Extension context invalidated.');
  });
  expect(await send(JUMP)).toEqual({ kind: 'storage-failed', message: 'Extension context invalidated.' });
});

test('no reply, or one not declared for the request, resolves to storage-failed with a fixed message', async () => {
  for (const reply of [undefined, null, 'opened', {}, { kind: 'applied' }, { kind: 'failed' }, { kind: 'storage-failed', message: 3 }, { kind: 'done' }]) {
    chromeWhoseSendMessage(async () => reply);
    expect(await send(JUMP)).toEqual({ kind: 'storage-failed', message: "URLJumper's service worker did not reply." });
  }
  for (const reply of [undefined, { kind: 'opened' }, { kind: 'failed', message: 'No tab with id: 7.' }]) {
    chromeWhoseSendMessage(async () => reply);
    expect(await send(REMOVE_INTENT)).toEqual({ kind: 'storage-failed', message: "URLJumper's service worker did not reply." });
  }
});

test("a request to remove an intent resolves to the worker's reply for it", async () => {
  const sent = chromeWhoseSendMessage(async () => ({ kind: 'done' }));
  expect(await send(REMOVE_INTENT)).toEqual({ kind: 'done' });
  expect(sent).toEqual([REMOVE_INTENT]);
  chromeWhoseSendMessage(async () => ({ kind: 'storage-failed', message: 'IO error' }));
  expect(await send(REMOVE_INTENT)).toEqual({ kind: 'storage-failed', message: 'IO error' });
});

test('the worker accepts only a request declared here', () => {
  expect(isRequest(JUMP)).toBe(true);
  expect(isRequest({ ...JUMP, argument: 'lo-fi beats' })).toBe(true);
  expect(isRequest({ ...JUMP, windowId: 7 })).toBe(true);
  expect(isRequest({ kind: 'jump', name: 'a', url: 'https://a.example/', argument: null, mode: 'this-tab', tabId: 4 })).toBe(true);
  expect(isRequest(REMOVE_INTENT)).toBe(true);
  for (const value of [
    { ...REMOVE_INTENT, windowId: undefined },
    { ...REMOVE_INTENT, windowId: 3.5 },
    { ...REMOVE_INTENT, time: '1700000000000' },
    { ...REMOVE_INTENT, time: Number.NaN },
    undefined,
    'jump',
    { ...JUMP, kind: 'replace' },
    { ...JUMP, name: undefined },
    { ...JUMP, url: 1 },
    { ...JUMP, argument: undefined },
    { ...JUMP, active: undefined },
    { ...JUMP, windowId: 1.5 },
    { ...JUMP, windowId: '7' },
    { ...JUMP, mode: 'window' },
    { kind: 'jump', name: 'a', url: 'https://a.example/', argument: null, mode: 'this-tab', tabId: 1.5 },
    { kind: 'jump', name: 'a', url: 'https://a.example/', argument: null, mode: 'this-tab' },
  ]) {
    expect(isRequest(value)).toBe(false);
  }
});

test('the requests that write the document, each with the replies declared for it', async () => {
  const replies: [InsertRequest | RewriteRequest | RemoveRequest | MoveRequest | UndoRequest | LoadExampleRequest, unknown[]][] = [
    [INSERT, [
      { kind: 'applied', line: 3, text: 'stocks               https://s.example/', headingMissing: false },
      { kind: 'applied', line: 2, text: 'stocks https://s.example/', headingMissing: false, endingGiven: { text: 'a  x:1\r', ending: '\n' } },
      { kind: 'invalid', field: 'url', rule: 'no-scheme' },
      { kind: 'name-taken', line: 5 },
      { kind: 'storage-failed', message: 'Resource::kQuotaBytes quota exceeded' },
    ]],
    [REWRITE, [
      { kind: 'applied', line: 4, text: 'shares  https://s.example/' },
      { kind: 'stale', document: 'a  x:1\n' },
      { kind: 'name-taken', line: 2 },
      { kind: 'invalid', field: 'note', rule: 'backslash' },
      { kind: 'storage-failed', message: 'Resource::kQuotaBytes quota exceeded' },
    ]],
    [REMOVE, [{ kind: 'applied', line: 3, text: REMOVE.text }, { kind: 'stale', document: '' }, { kind: 'storage-failed', message: 'IO error' }]],
    [MOVE, [
      { kind: 'applied', line: 2, text: MOVE.text, from: 3 },
      { kind: 'stale', document: 'a  x:1\n' },
      { kind: 'immovable', document: '' },
      { kind: 'storage-failed', message: 'Resource::kQuotaBytes quota exceeded' },
    ]],
    [MOVE_BACK, [{ kind: 'applied', line: 3, text: MOVE_BACK.text, from: 2 }, { kind: 'stale', document: '' }, { kind: 'name-taken', line: 4 }, { kind: 'storage-failed', message: 'IO error' }]],
    [UNDO, [{ kind: 'applied', line: 3, text: UNDO.text }, { kind: 'stale', document: '' }]],
    [UNDO_GIVEN, [{ kind: 'applied', line: 3, text: UNDO.text }]],
    [RESTORE, [{ kind: 'applied', line: 3, text: RESTORE.former }, { kind: 'stale', document: '' }, { kind: 'name-taken', line: 1 }]],
    [REINSERT, [
      { kind: 'applied', line: 3, text: UNDO.text },
      { kind: 'applied', line: 3, text: UNDO.text, endingGiven: { text: '', ending: '\n' } },
      { kind: 'stale', document: 'a  x:1\n' },
      { kind: 'name-taken', line: 2 },
      { kind: 'storage-failed', message: 'Resource::kQuotaBytes quota exceeded' },
    ]],
    [LOAD_EXAMPLE, [{ kind: 'applied', text: '\\ Daily\n', first: 1, last: 12 }, { kind: 'not-empty' }]],
  ];
  for (const [request, declared] of replies) {
    for (const reply of declared) {
      const sent = chromeWhoseSendMessage(async () => reply);
      expect(await send(request)).toEqual(reply);
      expect(sent).toEqual([request]);
    }
  }
});

test('a reply declared for another request, or missing a field, is no reply', async () => {
  const malformedEndings = [{ text: 'a', ending: '\r' }, { text: 'a', ending: '' }, { text: 1, ending: '\n' }, { ending: '\n' }, 'a\n', null];
  const undeclared: [InsertRequest | RewriteRequest | RemoveRequest | MoveRequest | UndoRequest | LoadExampleRequest, unknown[]][] = [
    [INSERT, [
      { kind: 'applied', line: 3, text: 'x' },
      { kind: 'name-taken' },
      { kind: 'name-taken', line: 0 },
      { kind: 'invalid', field: 'url' },
      { kind: 'stale', document: '' },
      { kind: 'opened' },
      ...malformedEndings.map((endingGiven) => ({ kind: 'applied', line: 3, text: 'x', headingMissing: false, endingGiven })),
    ]],
    [REWRITE, [{ kind: 'applied', line: 3 }, { kind: 'applied', text: 'x' }, { kind: 'stale' }, { kind: 'name-taken', line: 0 }, { kind: 'invalid', rule: 'empty' }, { kind: 'changed', document: '' }, { kind: 'done' }]],
    [REMOVE, [{ kind: 'applied', line: 0, text: 'x' }, { kind: 'applied', line: 3 }, { kind: 'stale' }, { kind: 'name-taken', line: 2 }, { kind: 'invalid', field: 'name', rule: 'empty' }]],
    [RESTORE, [{ kind: 'applied', line: 3 }, { kind: 'stale' }, { kind: 'name-taken' }, ...malformedEndings.map((endingGiven) => ({ kind: 'applied', line: 3, text: 'x', endingGiven }))]],
    [UNDO, [{ kind: 'applied', line: 3 }, { kind: 'stale' }, { kind: 'not-empty' }, { kind: 'name-taken' }, { kind: 'name-taken', line: 0 }, { kind: 'applied', line: 3, text: 'x', from: 2 }]],
    // An applied move always says where it found its line; a refused one carries the stored text.
    [MOVE, [
      { kind: 'applied', line: 2, text: 'x' },
      { kind: 'applied', line: 2, text: 'x', from: 0 },
      { kind: 'applied', line: 2, from: 3 },
      { kind: 'immovable' },
      { kind: 'immovable', document: 3 },
      { kind: 'stale' },
      { kind: 'name-taken', line: 2 },
      { kind: 'invalid', field: 'name', rule: 'empty' },
      { kind: 'changed', document: '' },
    ]],
    [MOVE_BACK, [
      { kind: 'applied', line: 3, text: 'x' },
      { kind: 'applied', line: 3, text: 'x', from: '2' },
      { kind: 'applied', line: 3, text: 'x', from: 2, endingGiven: { text: 'a', ending: '\n' } },
      { kind: 'immovable', document: '' },
      { kind: 'name-taken' },
    ]],
    [REINSERT, [{ kind: 'applied', text: 'x' }, { kind: 'invalid', field: 'name', rule: 'empty' }, { kind: 'done' }]],
    [LOAD_EXAMPLE, [{ kind: 'applied', text: 'x' }, { kind: 'done' }, { kind: 'stale', document: '' }]],
  ];
  for (const [request, replies] of undeclared) {
    for (const reply of replies) {
      chromeWhoseSendMessage(async () => reply);
      expect(await send(request), JSON.stringify(reply)).toEqual(NO_REPLY);
    }
  }
  chromeWhoseSendMessage(async () => ({ kind: 'not-empty' }));
  expect(await send(JUMP)).toEqual(NO_REPLY);
});

test('the worker accepts the writing requests only with every field of its declared type', () => {
  expect(isRequest(INSERT)).toBe(true);
  expect(isRequest({ ...INSERT, note: 'see docs', heading: { texts: ['\\ Work', '\\ more'], before: 2 } })).toBe(true);
  expect(isRequest(UNDO)).toBe(true);
  expect(isRequest(UNDO_GIVEN)).toBe(true);
  expect(isRequest({ ...UNDO, endingGiven: { text: '', ending: '\n' } })).toBe(true);
  expect(isRequest(REINSERT)).toBe(true);
  expect(isRequest(RESTORE)).toBe(true);
  expect(isRequest({ ...RESTORE, former: '' })).toBe(true);
  expect(isRequest(REWRITE)).toBe(true);
  expect(isRequest({ ...REWRITE, note: 'see docs' })).toBe(true);
  expect(isRequest(REMOVE)).toBe(true);
  expect(isRequest(MOVE)).toBe(true);
  expect(isRequest({ ...MOVE, direction: 'down' })).toBe(true);
  expect(isRequest(MOVE_BACK)).toBe(true);
  expect(isRequest(LOAD_EXAMPLE)).toBe(true);
  for (const value of [
    { ...INSERT, name: undefined },
    { ...INSERT, url: null },
    { ...INSERT, note: undefined },
    { ...INSERT, heading: undefined },
    { ...INSERT, heading: { texts: '\\ Work', before: 0 } },
    { ...INSERT, heading: { texts: [1], before: 0 } },
    { ...INSERT, heading: { texts: ['\\ Work'], before: -1 } },
    { ...INSERT, heading: { texts: ['\\ Work'], before: 0.5 } },
    { ...UNDO, act: 'restore' },
    { ...RESTORE, former: undefined },
    { ...RESTORE, former: 3 },
    { ...RESTORE, line: 0 },
    { ...RESTORE, text: null },
    { ...UNDO, endingGiven: { text: 'a', ending: '\r' } },
    { ...UNDO, endingGiven: { text: 'a', ending: '' } },
    { ...UNDO, endingGiven: { text: 1, ending: '\n' } },
    { ...UNDO, endingGiven: { ending: '\n' } },
    { ...UNDO, endingGiven: 'a\n' },
    { ...UNDO, endingGiven: null },
    { ...REWRITE, name: undefined },
    { ...REWRITE, url: 1 },
    { ...REWRITE, note: undefined },
    { ...REWRITE, text: undefined },
    { ...REWRITE, line: 0 },
    { ...REWRITE, line: '3' },
    { ...REMOVE, text: undefined },
    { ...REMOVE, line: 1.5 },
    { kind: 'rewrites', line: 3, text: 'x', name: 'a', url: 'u:1', note: '' },
    { ...MOVE, direction: undefined },
    { ...MOVE, direction: 'left' },
    { ...MOVE, direction: 'Up' },
    { ...MOVE, line: 0 },
    { ...MOVE, text: undefined },
    { ...MOVE_BACK, to: undefined },
    { ...MOVE_BACK, to: 0 },
    { ...MOVE_BACK, to: 2.5 },
    { ...MOVE_BACK, to: '3' },
    { ...MOVE_BACK, act: 'move' },
    { ...MOVE_BACK, line: 0 },
    { ...UNDO, line: 0 },
    { ...UNDO, line: 2.5 },
    { ...UNDO, text: undefined },
    { ...REINSERT, act: 'Reinsert' },
    { ...REINSERT, line: 0 },
    { ...REINSERT, text: 3 },
    { kind: 'load-examples' },
  ]) {
    expect(isRequest(value), JSON.stringify(value)).toBe(false);
  }
});

test("a request to reset the learned order resolves to the worker's reply for it, and to no other", async () => {
  expect(isRequest(RESET_USAGE)).toBe(true);
  expect(isRequest({ kind: 'reset' })).toBe(false);
  for (const reply of [{ kind: 'done' }, { kind: 'storage-failed', message: 'IO error' }]) {
    const sent = chromeWhoseSendMessage(async () => reply);
    expect(await send(RESET_USAGE)).toEqual(reply);
    expect(sent).toEqual([RESET_USAGE]);
  }
  for (const reply of [undefined, { kind: 'applied' }, { kind: 'opened' }, { kind: 'storage-failed' }]) {
    chromeWhoseSendMessage(async () => reply);
    expect(await send(RESET_USAGE), JSON.stringify(reply)).toEqual(NO_REPLY);
  }
  chromeWhoseSendMessage(() => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')));
  expect(await send(RESET_USAGE)).toEqual({ kind: 'storage-failed', message: 'Could not establish connection. Receiving end does not exist.' });
});

test("a Text view's Save is a replace of the text and the base it was loaded with, each a string, possibly empty", () => {
  expect(isRequest(REPLACE)).toBe(true);
  expect(isRequest({ kind: 'replace', text: '', base: '' })).toBe(true);
  for (const value of [
    { ...REPLACE, text: undefined },
    { ...REPLACE, text: null },
    { ...REPLACE, text: ['a  https://a.example/'] },
    { ...REPLACE, base: undefined },
    { ...REPLACE, base: null },
    { kind: 'replace', text: 'a  https://a.example/' },
    { kind: 'Replace', text: '', base: '' },
  ]) {
    expect(isRequest(value), JSON.stringify(value)).toBe(false);
  }
});

test("a replace resolves to the worker's reply for it: stored, refused over a changed document or a text with an F4 error, or not stored", async () => {
  const declared = [
    { kind: 'applied', text: REPLACE.text, first: 1, last: 3 },
    { kind: 'changed', document: 'c  https://c.example/\n' },
    { kind: 'changed', document: '' },
    { kind: 'invalid', line: 12, problem: 'needs-name-and-url' },
    { kind: 'invalid', line: 5, problem: 'no-scheme' },
    { kind: 'invalid', line: 9, problem: 'repeated-name', heldBy: 1 },
    { kind: 'storage-failed', message: 'Resource::kQuotaBytes quota exceeded' },
  ];
  for (const reply of declared) {
    const sent = chromeWhoseSendMessage(async () => reply);
    expect(await send(REPLACE)).toEqual(reply);
    expect(sent).toEqual([REPLACE]);
  }
  const undeclared = [
    undefined,
    { kind: 'applied', text: REPLACE.text },
    { kind: 'applied', text: REPLACE.text, first: 0, last: 3 },
    { kind: 'changed' },
    { kind: 'stale', document: '' },
    { kind: 'invalid', field: 'url', rule: 'no-scheme' },
    { kind: 'invalid', line: 0, problem: 'no-scheme' },
    { kind: 'invalid', line: 3, problem: 'unreadable' },
    { kind: 'invalid', line: 9, problem: 'repeated-name' },
    { kind: 'not-empty' },
    { kind: 'done' },
  ];
  for (const reply of undeclared) {
    chromeWhoseSendMessage(async () => reply);
    expect(await send(REPLACE), JSON.stringify(reply)).toEqual(NO_REPLY);
  }
  chromeWhoseSendMessage(() => Promise.reject(new Error('Message length exceeded maximum allowed length.')));
  expect(await send(REPLACE)).toEqual({ kind: 'storage-failed', message: 'Message length exceeded maximum allowed length.' });
});

test('a draft set is the text, its base, the time of the edit, and the view and number that name it; a draft discard is that name', () => {
  expect(isRequest(DRAFT_SET)).toBe(true);
  expect(isRequest({ ...DRAFT_SET, text: '', base: '' })).toBe(true);
  expect(isRequest(DRAFT_DISCARD)).toBe(true);
  for (const value of [
    { ...DRAFT_SET, text: undefined },
    { ...DRAFT_SET, text: ['a'] },
    { ...DRAFT_SET, base: undefined },
    { ...DRAFT_SET, base: null },
    { ...DRAFT_SET, time: undefined },
    { ...DRAFT_SET, time: '1700000000500' },
    { ...DRAFT_SET, time: Number.POSITIVE_INFINITY },
    { ...DRAFT_SET, view: '' },
    { ...DRAFT_SET, view: undefined },
    { ...DRAFT_SET, number: 0 },
    { ...DRAFT_SET, number: 2.5 },
    { ...DRAFT_SET, kind: 'draft' },
    { ...DRAFT_DISCARD, view: '' },
    { ...DRAFT_DISCARD, view: 3 },
    { ...DRAFT_DISCARD, number: undefined },
    { ...DRAFT_DISCARD, number: -1 },
    { kind: 'draft-discard' },
  ]) {
    expect(isRequest(value), JSON.stringify(value)).toBe(false);
  }
});

test("a draft set or discard resolves to the worker's reply for it, and to no other", async () => {
  for (const request of [DRAFT_SET, DRAFT_DISCARD]) {
    for (const reply of [{ kind: 'done' }, { kind: 'storage-failed', message: 'Resource::kQuotaBytes quota exceeded' }]) {
      const sent = chromeWhoseSendMessage(async () => reply);
      expect(await send(request)).toEqual(reply);
      expect(sent).toEqual([request]);
    }
    for (const reply of [undefined, { kind: 'applied' }, { kind: 'opened' }, { kind: 'changed' }, { kind: 'stale', document: '' }, { kind: 'storage-failed' }]) {
      chromeWhoseSendMessage(async () => reply);
      expect(await send(request), JSON.stringify(reply)).toEqual(NO_REPLY);
    }
    chromeWhoseSendMessage(() => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')));
    expect(await send(request)).toEqual({ kind: 'storage-failed', message: 'Could not establish connection. Receiving end does not exist.' });
  }
});
