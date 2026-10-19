// What the extension's pages ask the service worker, the only writer, to do, and what it answers. Every
// request and reply is declared here once, and pages send them only through `send`.
import type { DocumentError } from './document/grammar';
import type { EndingGiven } from './document/line-edits';
import type { HeadingIdentity } from './document/sections';
import type { FieldProblem } from './document/validation';
import { isDraft, isDraftName, type Draft, type DraftName } from './draft';

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
 * Rewrites one mapping line (G12, G13, G14): the line named by `line` and `text`, its number and exact text
 * from one read the surface loaded, found again as the mapping line with that text at that number, else as
 * the single mapping line with that text. The worker validates the values against the document as it reads
 * it, every other mapping line's name taken, and writes the line by F12 in its own columns with its own ending.
 */
export type RewriteRequest = { kind: 'rewrite'; line: number; text: string; name: string; url: string; /** Empty for no note. */ note: string };

/** Removes one mapping line (G12, G13), named and found again as a *rewrite*'s is. */
export type RemoveRequest = { kind: 'remove'; line: number; text: string };

/**
 * Reverses a change (G15) by its act, each naming a line by the number and exact text the change's reply
 * gave, found again as a *rewrite*'s is. `remove` takes away the line an insert or a `reinsert` added, and
 * when that line is last, takes back from the line before exactly `endingGiven`, which that change's reply
 * carried (absent, the line before loses its whole ending). `reinsert` puts back the exact text of a line a
 * change took away as line `line`, its former number, or after the last line when the document now has fewer
 * than `line` − 1 lines. `restore` puts `former`, the exact text the line had before a rewrite (or a
 * restore), back in its place. A `reinsert` or `restore` is refused while another mapping line has the name
 * it writes, and is `stale` when its text would not read there as one mapping line.
 */
export type UndoRequest = { kind: 'undo'; line: number; text: string } & (
  | { act: 'remove'; endingGiven?: EndingGiven }
  | { act: 'reinsert' }
  | { act: 'restore'; former: string }
);

/**
 * A Text view's Save (G17, G18): stores `text`, exactly as given, in place of the stored document, only while
 * the stored document is still `base`, the string the view loaded (empty when absent), and only when `text`
 * has no F4 error.
 */
export type ReplaceRequest = { kind: 'replace'; text: string; base: string };

/** Stores the example document (F11), only into a document that is absent or holds only whitespace (G30). */
export type LoadExampleRequest = { kind: 'load-example' };

/**
 * *Reset learned order* (G27): removes `usage`, the learned usage, on the worker's queue, so a jump queued
 * before it is removed with the rest and one queued after it records only its own use.
 */
export type ResetUsageRequest = { kind: 'reset-usage' };

/**
 * Keeps a Text view's unsaved text as the draft (G19; Composition, *draft set*): stored as `draft` unless the
 * stored draft is newer, so a late coalesced write never overtakes a newer edit from another view.
 */
export type DraftSetRequest = { kind: 'draft-set' } & Draft;

/**
 * Removes the draft named by its view and number, only while `draft` is still that edit, so a discard removes
 * exactly the draft it names and never a later one (Composition, *draft discard*).
 */
export type DraftDiscardRequest = { kind: 'draft-discard' } & DraftName;

export type Request =
  | JumpRequest
  | RemoveIntentRequest
  | InsertRequest
  | RewriteRequest
  | RemoveRequest
  | UndoRequest
  | ReplaceRequest
  | LoadExampleRequest
  | ResetUsageRequest
  | DraftSetRequest
  | DraftDiscardRequest;

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
  /**
   * Stored: the new line's number and exact text; `headingMissing` says the heading was not found and the
   * line went to the end (G9); `endingGiven`, present when the line went after the last line, goes back
   * with its Undo.
   */
  | { kind: 'applied'; line: number; text: string; headingMissing: boolean; endingGiven?: EndingGiven }
  /** A value breaks a rule of G8 or G14; nothing was stored. */
  | ({ kind: 'invalid' } & FieldProblem)
  /** Another mapping line has the name: `line` is its number. Nothing was stored. */
  | { kind: 'name-taken'; line: number }
  | StorageFailed;

/** The line no longer stands as the surface loaded it, or as the change left it; nothing was stored. `document` is the stored text, empty when absent. */
type Stale = { kind: 'stale'; document: string };

export type RewriteReply =
  /** Stored: the number the line had where it was found, and the exact text written. */
  | { kind: 'applied'; line: number; text: string }
  | Stale
  /** Another mapping line has the name: `line` is its number. Nothing was stored. */
  | { kind: 'name-taken'; line: number }
  /** A value breaks a rule of G8 or G14; nothing was stored. */
  | ({ kind: 'invalid' } & FieldProblem)
  | StorageFailed;

export type RemoveReply =
  /** Stored: the number the line had where it was found, and its exact text, taken away. */
  | { kind: 'applied'; line: number; text: string }
  | Stale
  | StorageFailed;

export type UndoReply =
  /**
   * Stored: the number and exact text of the line taken away, put back, or restored; `endingGiven`, present
   * when a `reinsert` put the line after the last line, goes back with its Undo.
   */
  | { kind: 'applied'; line: number; text: string; endingGiven?: EndingGiven }
  | Stale
  /** Another mapping line has the name the line would have again: `line` is its number. Nothing was stored. */
  | { kind: 'name-taken'; line: number }
  | StorageFailed;

export type ReplaceReply =
  /** Stored: the text, and the first and last lines it wrote, which are all of its lines. */
  | { kind: 'applied'; text: string; first: number; last: number }
  /** The stored document is no longer the base; nothing was stored. `document` is the stored text, empty when absent. */
  | { kind: 'changed'; document: string }
  /** The text has an F4 error, the first of which this is; nothing was stored. */
  | ({ kind: 'invalid' } & DocumentError)
  | StorageFailed;

export type LoadExampleReply =
  /** Stored: the text, and the first and last lines it wrote. */
  | { kind: 'applied'; text: string; first: number; last: number }
  /** The document holds more than whitespace; nothing was stored. */
  | { kind: 'not-empty' }
  | StorageFailed;

/** `done` once no learned usage is stored, whether or not there was any. */
export type ResetUsageReply = { kind: 'done' } | StorageFailed;

/** `done` once `draft` holds the edit sent or a newer one. */
export type DraftSetReply = { kind: 'done' } | StorageFailed;

/** `done` once `draft` no longer holds the edit named, whether or not it was there to remove. */
export type DraftDiscardReply = { kind: 'done' } | StorageFailed;

export type ReplyTo<R extends Request> = R extends JumpRequest
  ? JumpReply
  : R extends RemoveIntentRequest
    ? RemoveIntentReply
    : R extends InsertRequest
      ? InsertReply
      : R extends RewriteRequest
        ? RewriteReply
        : R extends RemoveRequest
          ? RemoveReply
          : R extends UndoRequest
            ? UndoReply
            : R extends ReplaceRequest
              ? ReplaceReply
              : R extends LoadExampleRequest
                ? LoadExampleReply
                : R extends ResetUsageRequest
                  ? ResetUsageReply
                  : R extends DraftSetRequest
                    ? DraftSetReply
                    : R extends DraftDiscardRequest
                      ? DraftDiscardReply
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
    case 'rewrite':
      return isLineNumber(value.line) && typeof value.text === 'string' && typeof value.name === 'string' && typeof value.url === 'string' && typeof value.note === 'string';
    case 'remove':
      return isLineNumber(value.line) && typeof value.text === 'string';
    case 'undo':
      if (!isLineNumber(value.line) || typeof value.text !== 'string') return false;
      if (value.act === 'remove') return value.endingGiven === undefined || isEndingGiven(value.endingGiven);
      if (value.act === 'restore') return typeof value.former === 'string';
      return value.act === 'reinsert';
    case 'replace':
      return typeof value.text === 'string' && typeof value.base === 'string';
    case 'load-example':
    case 'reset-usage':
      return true;
    case 'draft-set':
      return isDraft(value);
    case 'draft-discard':
      return isDraftName(value);
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

function isEndingGiven(value: unknown): value is EndingGiven {
  return isRecord(value) && typeof value.text === 'string' && (value.ending === '\n' || value.ending === '\r\n');
}

function isLineNumber(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1;
}

function isDocumentError(value: Record<string, unknown>): boolean {
  if (!isLineNumber(value.line)) return false;
  if (value.problem === 'repeated-name') return isLineNumber(value.heldBy);
  return value.problem === 'needs-name-and-url' || value.problem === 'no-scheme';
}

function isReplyTo(request: Request, value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'storage-failed') return typeof value.message === 'string';
  switch (request.kind) {
    case 'remove-intent':
    case 'reset-usage':
    case 'draft-set':
    case 'draft-discard':
      return value.kind === 'done';
    case 'insert':
      if (value.kind === 'applied') return isChangedLine(value) && typeof value.headingMissing === 'boolean' && hasEndingGiven(value);
      return isValuesRefusal(value);
    case 'rewrite':
      if (value.kind === 'applied') return isChangedLine(value);
      return isValuesRefusal(value) || isStale(value);
    case 'remove':
      return value.kind === 'applied' ? isChangedLine(value) : isStale(value);
    case 'undo':
      if (value.kind === 'applied') return isChangedLine(value) && hasEndingGiven(value);
      if (value.kind === 'name-taken') return isLineNumber(value.line);
      return isStale(value);
    case 'replace':
      if (value.kind === 'applied') return typeof value.text === 'string' && isLineNumber(value.first) && isLineNumber(value.last);
      if (value.kind === 'changed') return typeof value.document === 'string';
      return value.kind === 'invalid' && isDocumentError(value);
    case 'load-example':
      if (value.kind === 'applied') return typeof value.text === 'string' && isLineNumber(value.first) && isLineNumber(value.last);
      return value.kind === 'not-empty';
    case 'jump':
      return value.kind === 'opened' || (value.kind === 'failed' && typeof value.message === 'string');
  }
}

/** An applied single-line change's line: its number and exact text. */
function isChangedLine(value: Record<string, unknown>): boolean {
  return isLineNumber(value.line) && typeof value.text === 'string';
}

/** Whether `value` carries no `endingGiven`, or a well-formed one. */
function hasEndingGiven(value: Record<string, unknown>): boolean {
  return value.endingGiven === undefined || isEndingGiven(value.endingGiven);
}

/** A refusal of the values an insert or a rewrite was sent: a rule they break, or a name another line has. */
function isValuesRefusal(value: Record<string, unknown>): boolean {
  if (value.kind === 'invalid') return typeof value.field === 'string' && typeof value.rule === 'string';
  return value.kind === 'name-taken' && isLineNumber(value.line);
}

function isStale(value: Record<string, unknown>): boolean {
  return value.kind === 'stale' && typeof value.document === 'string';
}

/** The message Chrome gave with a refusal. */
export function chromeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
