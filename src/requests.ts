// What the extension's pages ask the service worker, the only writer, to do, and what it answers. Every
// request and reply is declared here once, and pages send them only through `send`.
import type { HeadingIdentity } from './document/sections';
import type { FieldProblem } from './document/validation';

/** Opens a mapping: the worker records the use when the document holds the mapping, then navigates (G6, G26). */
export type JumpRequest = {
  kind: 'jump';
  /** The mapping's name and URL as the document holds them, never the typed text. */
  name: string;
  url: string;
  /** The argument row's argument, filled in for every `%s`; null for every other row, an argument alias's included. */
  argument: string | null;
} & (
  | {
      mode: 'new-tab';
      /** Whether the new tab becomes the active one. */
      active: boolean;
      /** The window the user acted in, which the tab opens in; absent, the window last focused when it opens. */
      windowId?: number;
    }
  | { mode: 'this-tab'; /** The tab to navigate. */ tabId: number }
);

/**
 * Removes the `openIntent` record a popup honored, named by its window and time, only while it is still that
 * record: one written since, for another opening, stays (Composition, "Popup"). The worker writes every
 * record on its one queue, so none lands between that check and the removal, as one could between a page's
 * own read and removal.
 */
export type RemoveIntentRequest = { kind: 'remove-intent'; windowId: number; time: number };

/**
 * Inserts one mapping line, formatted by F12, after the last line that holds more than whitespace: of the
 * document when `heading` is null, else of the section whose heading the surface loaded as `heading` (G9).
 * The worker validates the values and checks the name is free against the document as it reads it (G13).
 */
export type InsertRequest = { kind: 'insert'; name: string; url: string; /** Empty for no note. */ note: string; heading: HeadingIdentity | null };

/**
 * Reverses a change (G15) by its act. `remove` takes away the line an insert or a `reinsert` added, named by
 * the line number and exact text its reply gave, found again as the mapping line with that text at that
 * number, else as the single mapping line with that text. `reinsert` puts back the exact text of a line a
 * change took away as line `line`, its former number, or after the last line when the document now has fewer
 * than `line` − 1 lines, once no other mapping line has its name; a text that would not read there as one
 * mapping line is `stale`.
 */
export type UndoRequest = { kind: 'undo'; act: 'remove' | 'reinsert'; line: number; text: string };

/** Stores the example document (F11), only into a document that is absent or holds only whitespace (G30). */
export type LoadExampleRequest = { kind: 'load-example' };

export type Request = JumpRequest | RemoveIntentRequest | InsertRequest | UndoRequest | LoadExampleRequest;

/** Chrome refused to store; nothing of the request was stored. */
export type StorageFailed = { kind: 'storage-failed'; message: string };

export type JumpReply =
  | { kind: 'opened' }
  /** Chrome refused the navigation, or the address is longer than Chrome opens. */
  | { kind: 'failed'; message: string }
  | StorageFailed;

/** `done` whether or not the record was still there to remove. */
export type RemoveIntentReply = { kind: 'done' } | StorageFailed;

export type InsertReply =
  /** Stored: the new line's number and exact text; `headingMissing` says the heading was not found and the line went to the end (G9). */
  | { kind: 'applied'; line: number; text: string; headingMissing: boolean }
  /** A value breaks a rule of G8 or G14; nothing was stored. */
  | ({ kind: 'invalid' } & FieldProblem)
  /** Another mapping line has the name: `line` is its number. Nothing was stored. */
  | { kind: 'name-taken'; line: number }
  | StorageFailed;

export type UndoReply =
  /** Stored: the number and exact text of the line taken away or put back. */
  | { kind: 'applied'; line: number; text: string }
  /** The line no longer stands as the change left it; nothing was stored. `document` is the stored text, empty when absent. */
  | { kind: 'stale'; document: string }
  /** Another mapping line has the name of the line to put back: `line` is its number. Nothing was stored. */
  | { kind: 'name-taken'; line: number }
  | StorageFailed;

export type LoadExampleReply =
  /** Stored: the text, and the first and last lines it wrote. */
  | { kind: 'applied'; text: string; first: number; last: number }
  /** The document holds more than whitespace; nothing was stored. */
  | { kind: 'not-empty' }
  | StorageFailed;

export type ReplyTo<R extends Request> = R extends JumpRequest
  ? JumpReply
  : R extends RemoveIntentRequest
    ? RemoveIntentReply
    : R extends InsertRequest
      ? InsertReply
      : R extends UndoRequest
        ? UndoReply
        : R extends LoadExampleRequest
          ? LoadExampleReply
          : never;

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
  switch (value.kind) {
    case 'remove-intent':
      return Number.isInteger(value.windowId) && Number.isFinite(value.time);
    case 'insert':
      return typeof value.name === 'string' && typeof value.url === 'string' && typeof value.note === 'string' && (value.heading === null || isHeading(value.heading));
    case 'undo':
      return (value.act === 'remove' || value.act === 'reinsert') && isLineNumber(value.line) && typeof value.text === 'string';
    case 'load-example':
      return true;
    case 'jump':
      break;
    default:
      return false;
  }
  const { name, url, argument, mode } = value;
  if (typeof name !== 'string' || typeof url !== 'string' || (argument !== null && typeof argument !== 'string')) return false;
  if (mode === 'new-tab') return typeof value.active === 'boolean' && (value.windowId === undefined || Number.isInteger(value.windowId));
  return mode === 'this-tab' && Number.isInteger(value.tabId);
}

function isHeading(value: unknown): value is HeadingIdentity {
  if (!isRecord(value) || !Array.isArray(value.texts)) return false;
  return value.texts.every((text) => typeof text === 'string') && Number.isInteger(value.before) && (value.before as number) >= 0;
}

function isLineNumber(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1;
}

function isReplyTo(request: Request, value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'storage-failed') return typeof value.message === 'string';
  switch (request.kind) {
    case 'remove-intent':
      return value.kind === 'done';
    case 'insert':
      if (value.kind === 'applied') return isLineNumber(value.line) && typeof value.text === 'string' && typeof value.headingMissing === 'boolean';
      if (value.kind === 'invalid') return typeof value.field === 'string' && typeof value.rule === 'string';
      return value.kind === 'name-taken' && isLineNumber(value.line);
    case 'undo':
      if (value.kind === 'applied') return isLineNumber(value.line) && typeof value.text === 'string';
      if (value.kind === 'name-taken') return isLineNumber(value.line);
      return value.kind === 'stale' && typeof value.document === 'string';
    case 'load-example':
      if (value.kind === 'applied') return typeof value.text === 'string' && isLineNumber(value.first) && isLineNumber(value.last);
      return value.kind === 'not-empty';
    case 'jump':
      return value.kind === 'opened' || (value.kind === 'failed' && typeof value.message === 'string');
  }
}

/** The message Chrome gave with a refusal. */
export function chromeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
