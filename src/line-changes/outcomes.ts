// The outcome of a single-line change and its confirmation's rules (G9, G12, G15, L2): what each stored change
// hands its host, built from the worker's reply alone; the text that names its name and line; and the Undo
// it offers, which is the inverse request, kept in memory alone (State). An Undo is a change of its own, so
// its outcome offers Undo in turn: an insert's Undo removes the line and that removal's Undo puts it back; a
// Delete's Undo puts the line back and that Undo's removes it again; a rewrite's Undo restores the former
// text and that restore's Undo the text it replaced. A refused Undo stores nothing and offers nothing.
import { mappingOfLine } from '../document/grammar';
import type { EndingGiven } from '../document/line-edits';
import type { InsertReply, RemoveReply, RewriteReply, UndoReply, UndoRequest } from '../requests';

export type Outcome =
  /** An insert: the Name form's, or a row editor's of a line gone since it loaded; `headingMissing` says it went to the end (G9). */
  | { kind: 'saved'; name: string; line: number; undo: UndoRequest; headingMissing: boolean }
  /**
   * `rewritten`: a row editor's Save; `restored`: an Undo put a rewritten line's former text back; `removed`: a
   * Delete, or an Undo took an inserted line away; `put-back`: an Undo put a removed line back.
   */
  | { kind: 'rewritten' | 'restored' | 'removed' | 'put-back'; name: string; line: number; undo: UndoRequest }
  /** An Undo stored nothing, for this reason; nothing is offered. */
  | { kind: 'refused'; message: string };

export interface Confirmed {
  /** Raised for each confirmation, so a new one replaces the old and starts its own ten seconds. */
  id: number;
  outcome: Outcome;
}

type Applied<R> = Extract<R, { kind: 'applied' }>;

/** An insert stored: Undo takes the line away, and from the line before it exactly the ending the insert gave (G12). */
export function insertedOutcome(reply: Applied<InsertReply>): Outcome {
  return { kind: 'saved', name: nameOf(reply.text), line: reply.line, undo: removal(reply), headingMissing: reply.headingMissing };
}

/** A rewrite stored over the line whose exact text was `former`: Undo puts that text back as it was, never formatted again. */
export function rewrittenOutcome(reply: Applied<RewriteReply>, former: string): Outcome {
  return { kind: 'rewritten', name: nameOf(reply.text), line: reply.line, undo: { kind: 'undo', act: 'restore', line: reply.line, text: reply.text, former } };
}

/** A Delete stored: Undo puts the line back as the line number it had. */
export function removedOutcome(reply: Applied<RemoveReply>): Outcome {
  return { kind: 'removed', name: nameOf(reply.text), line: reply.line, undo: { kind: 'undo', act: 'reinsert', line: reply.line, text: reply.text } };
}

/** What the Undo `request` came to, by the worker's `reply`: a change of its own with its own Undo, or a refusal. */
export function outcomeOfUndo(request: UndoRequest, reply: UndoReply): Outcome {
  if (reply.kind !== 'applied') return { kind: 'refused', message: refusalText(request, reply) };
  const { line, text } = reply;
  const name = nameOf(text);
  if (request.act === 'remove') return { kind: 'removed', name, line, undo: { kind: 'undo', act: 'reinsert', line, text } };
  if (request.act === 'reinsert') return { kind: 'put-back', name, line, undo: removal(reply) };
  return { kind: 'restored', name, line, undo: { kind: 'undo', act: 'restore', line, text, former: request.text } };
}

/** What the confirmation says: the name and the line (L2), or why an Undo stored nothing. */
export function confirmationText(outcome: Outcome): string {
  switch (outcome.kind) {
    case 'refused':
      return outcome.message;
    case 'saved':
      return `Saved "${outcome.name}" as line ${outcome.line}${outcome.headingMissing ? ', at the end of the document: the heading you chose was not found' : ''}`;
    case 'rewritten':
      return `Changed "${outcome.name}" on line ${outcome.line}`;
    case 'restored':
      return `Changed "${outcome.name}" back on line ${outcome.line}`;
    case 'removed':
      return `Removed "${outcome.name}" from line ${outcome.line}`;
    case 'put-back':
      return `Put "${outcome.name}" back as line ${outcome.line}`;
  }
}

const UNDOES = { saved: 'saving', rewritten: 'changing', restored: 'changing back', removed: 'removing', 'put-back': 'putting back' } as const;

/** The name a screen reader speaks for Undo (G32). */
export function undoLabel(outcome: Exclude<Outcome, { kind: 'refused' }>): string {
  return `Undo ${UNDOES[outcome.kind]} "${outcome.name}"`;
}

/** Whether `confirmed` still offers Undo. */
export function offersUndo(confirmed: Confirmed | null): boolean {
  return confirmed !== null && confirmed.outcome.kind !== 'refused';
}

/** What Enter does while Undo has the focus (L2); like every footer it holds no name, which can be as long as the document. */
export function undoFooter(outcome: Outcome, undoing: boolean): string {
  if (undoing) return 'Undoing · Enter does nothing until it is stored';
  if (outcome.kind === 'removed') return 'Enter undoes the removal, putting the line back';
  if (outcome.kind === 'put-back') return 'Enter undoes putting the line back, removing it again';
  if (outcome.kind === 'rewritten') return 'Enter undoes the change, restoring the line as it was';
  if (outcome.kind === 'restored') return 'Enter undoes changing the line back, changing it again';
  return 'Enter undoes the save, removing its line';
}

/** The Undo of a change that added a line: its removal, sending back the ending the change gave the line before it, if any. */
function removal(reply: { line: number; text: string; endingGiven?: EndingGiven }): UndoRequest {
  const { line, text, endingGiven } = reply;
  return endingGiven === undefined ? { kind: 'undo', act: 'remove', line, text } : { kind: 'undo', act: 'remove', line, text, endingGiven };
}

function refusalText(request: UndoRequest, reply: Exclude<UndoReply, { kind: 'applied' }>): string {
  if (reply.kind === 'storage-failed') return `Not undone: nothing was stored. Chrome said: ${reply.message}`;
  if (reply.kind === 'name-taken') return `Not undone: line ${reply.line} already has the name "${nameOf(request.act === 'restore' ? request.former : request.text)}". Nothing was stored.`;
  if (request.act === 'reinsert') return `Not undone: "${nameOf(request.text)}" can no longer go back as line ${request.line}. Nothing was stored.`;
  return `Not undone: line ${request.line}, "${nameOf(request.text)}", was changed or removed since. Nothing was stored.`;
}

/** The name of the mapping line whose exact text the worker replied. */
function nameOf(text: string): string {
  return mappingOfLine(text)?.name ?? '';
}
