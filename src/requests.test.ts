import { afterEach, expect, test, vi } from 'vitest';
import { isRequest, send, type JumpRequest, type RemoveIntentRequest } from './requests';

const JUMP: JumpRequest = { kind: 'jump', name: 'alpha', url: 'https://a.example/', argument: null, mode: 'new-tab', active: true };
const REMOVE_INTENT: RemoveIntentRequest = { kind: 'remove-intent', windowId: 3, time: 1_700_000_000_000 };

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
    { ...JUMP, mode: 'window' },
    { kind: 'jump', name: 'a', url: 'https://a.example/', argument: null, mode: 'this-tab', tabId: 1.5 },
    { kind: 'jump', name: 'a', url: 'https://a.example/', argument: null, mode: 'this-tab' },
  ]) {
    expect(isRequest(value)).toBe(false);
  }
});
