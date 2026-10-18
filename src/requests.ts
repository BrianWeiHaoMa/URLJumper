// What the extension's pages ask the service worker, the only writer, to do, and what it answers. Every
// request and reply is declared here once, and pages send them only through `send`.

/** Opens a mapping: the worker records the use when the document holds the mapping, then navigates (G6, G26). */
export type JumpRequest = {
  kind: 'jump';
  /** The mapping's name and URL as the document holds them, never the typed text. */
  name: string;
  url: string;
  /** The argument row's argument, filled in for every `%s`; null for every other row, an argument alias's included. */
  argument: string | null;
} & (
  | { mode: 'new-tab'; /** Whether the new tab becomes the active one. */ active: boolean }
  | { mode: 'this-tab'; /** The tab to navigate. */ tabId: number }
);

/**
 * Removes the `openIntent` record a popup honored, named by its window and time, only while it is still that
 * record: one written since, for another opening, stays (Composition, "Popup"). The worker writes every
 * record on its one queue, so none lands between that check and the removal, as one could between a page's
 * own read and removal.
 */
export type RemoveIntentRequest = { kind: 'remove-intent'; windowId: number; time: number };

export type Request = JumpRequest | RemoveIntentRequest;

/** Chrome refused to store; nothing of the request was stored. */
export type StorageFailed = { kind: 'storage-failed'; message: string };

export type JumpReply =
  | { kind: 'opened' }
  /** Chrome refused the navigation, or the address is longer than Chrome opens. */
  | { kind: 'failed'; message: string }
  | StorageFailed;

/** `done` whether or not the record was still there to remove. */
export type RemoveIntentReply = { kind: 'done' } | StorageFailed;

export type ReplyTo<R extends Request> = R extends JumpRequest ? JumpReply : R extends RemoveIntentRequest ? RemoveIntentReply : never;

/** What a page shows when the worker gave no reply and Chrome no reason. */
const NO_REPLY = "URLJumper's service worker did not reply.";

/**
 * Sends `request` to the service worker and resolves to its reply. Never rejects: a failed send, no reply,
 * or a reply this module does not declare for the request resolves to `storage-failed`.
 */
export async function send<R extends Request>(request: R): Promise<ReplyTo<R>> {
  let reply: unknown;
  try {
    reply = await chrome.runtime.sendMessage(request);
  } catch (error) {
    return { kind: 'storage-failed', message: chromeMessage(error) } as ReplyTo<R>;
  }
  return (isReplyTo(request, reply) ? reply : { kind: 'storage-failed', message: NO_REPLY }) as ReplyTo<R>;
}

/** Whether `value`, as the worker received it, is a request declared here. */
export function isRequest(value: unknown): value is Request {
  if (!isRecord(value)) return false;
  if (value.kind === 'remove-intent') return Number.isInteger(value.windowId) && Number.isFinite(value.time);
  if (value.kind !== 'jump') return false;
  const { name, url, argument, mode } = value;
  if (typeof name !== 'string' || typeof url !== 'string' || (argument !== null && typeof argument !== 'string')) return false;
  if (mode === 'new-tab') return typeof value.active === 'boolean';
  return mode === 'this-tab' && Number.isInteger(value.tabId);
}

function isReplyTo(request: Request, value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'storage-failed') return typeof value.message === 'string';
  if (request.kind === 'remove-intent') return value.kind === 'done';
  return value.kind === 'opened' || (value.kind === 'failed' && typeof value.message === 'string');
}

/** The message Chrome gave with a refusal. */
export function chromeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
