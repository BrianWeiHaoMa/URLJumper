import { describe, expect, test } from 'vitest';
import type { UndoReply, UndoRequest } from '../requests';
import { confirmationText, insertedOutcome, offersUndo, outcomeOfUndo, removedOutcome, rewrittenOutcome, undoFooter, undoLabel, type Outcome } from './outcomes';

const LINE = 'stocks               https://s.example/   \\ daily';
const FORMER = 'stock  https://s.example/';

/** `outcome`'s Undo, failing for a refusal, which offers none. */
function undoOf(outcome: Outcome): UndoRequest {
  if (outcome.kind === 'refused') throw new Error(`refused: ${outcome.message}`);
  return outcome.undo;
}

describe('each stored change offers the inverse request as its Undo, built from the reply alone (G15)', () => {
  test("an insert's Undo removes its line, handing back the ending it gave the line before (G12)", () => {
    const endingGiven = { text: 'last  l:1\r', ending: '\r\n' } as const;
    const saved = insertedOutcome({ kind: 'applied', line: 4, text: LINE, headingMissing: false, endingGiven });
    expect(saved).toEqual({ kind: 'saved', name: 'stocks', line: 4, headingMissing: false, undo: { kind: 'undo', act: 'remove', line: 4, text: LINE, endingGiven } });
    expect(undoOf(insertedOutcome({ kind: 'applied', line: 2, text: LINE, headingMissing: true }))).toEqual({ kind: 'undo', act: 'remove', line: 2, text: LINE });
  });

  test("a rewrite's Undo restores the line's former exact text, never values formatted again", () => {
    expect(rewrittenOutcome({ kind: 'applied', line: 7, text: LINE }, FORMER)).toEqual({
      kind: 'rewritten',
      name: 'stocks',
      line: 7,
      undo: { kind: 'undo', act: 'restore', line: 7, text: LINE, former: FORMER },
    });
  });

  test("a Delete's Undo puts the line back as the line number it had", () => {
    expect(removedOutcome({ kind: 'applied', line: 3, text: LINE })).toEqual({ kind: 'removed', name: 'stocks', line: 3, undo: { kind: 'undo', act: 'reinsert', line: 3, text: LINE } });
  });
});

describe("each Undo is a change of its own, whose outcome offers that change's inverse (G12, G15)", () => {
  test("removing an inserted line: its Undo puts it back; that put-back's Undo removes it again with the ending the put-back gave", () => {
    const removed = outcomeOfUndo({ kind: 'undo', act: 'remove', line: 4, text: LINE }, { kind: 'applied', line: 4, text: LINE });
    expect(removed).toEqual({ kind: 'removed', name: 'stocks', line: 4, undo: { kind: 'undo', act: 'reinsert', line: 4, text: LINE } });
    const endingGiven = { text: 'last  l:1', ending: '\n' } as const;
    const putBack = outcomeOfUndo(undoOf(removed), { kind: 'applied', line: 4, text: LINE, endingGiven });
    expect(putBack).toEqual({ kind: 'put-back', name: 'stocks', line: 4, undo: { kind: 'undo', act: 'remove', line: 4, text: LINE, endingGiven } });
    expect(undoOf(outcomeOfUndo({ kind: 'undo', act: 'reinsert', line: 4, text: LINE }, { kind: 'applied', line: 2, text: LINE }))).toEqual({ kind: 'undo', act: 'remove', line: 2, text: LINE });
  });

  test("restoring a rewritten line: its Undo restores the rewritten text, and that one's the former again", () => {
    const rewritten = rewrittenOutcome({ kind: 'applied', line: 7, text: LINE }, FORMER);
    const restored = outcomeOfUndo(undoOf(rewritten), { kind: 'applied', line: 7, text: FORMER });
    expect(restored).toEqual({ kind: 'restored', name: 'stock', line: 7, undo: { kind: 'undo', act: 'restore', line: 7, text: FORMER, former: LINE } });
    const again = outcomeOfUndo(undoOf(restored), { kind: 'applied', line: 5, text: LINE });
    expect(again).toEqual({ kind: 'restored', name: 'stocks', line: 5, undo: { kind: 'undo', act: 'restore', line: 5, text: LINE, former: FORMER } });
  });
});

describe('an Undo that stored nothing says why and offers nothing (G15, G21)', () => {
  const refused = (request: UndoRequest, reply: UndoReply) => confirmationText(outcomeOfUndo(request, reply));
  const stale: UndoReply = { kind: 'stale', document: '' };

  test('Chrome refused to store', () => {
    const outcome = outcomeOfUndo({ kind: 'undo', act: 'remove', line: 4, text: LINE }, { kind: 'storage-failed', message: 'quota' });
    expect(outcome).toEqual({ kind: 'refused', message: 'Not undone: nothing was stored. Chrome said: quota' });
    expect(offersUndo({ id: 1, outcome })).toBe(false);
  });

  test('the line is not as the change left it', () => {
    expect(refused({ kind: 'undo', act: 'remove', line: 4, text: LINE }, stale)).toBe('Not undone: line 4, "stocks", was changed or removed since. Nothing was stored.');
    expect(refused({ kind: 'undo', act: 'restore', line: 7, text: LINE, former: FORMER }, stale)).toBe('Not undone: line 7, "stocks", was changed or removed since. Nothing was stored.');
    expect(refused({ kind: 'undo', act: 'reinsert', line: 3, text: LINE }, stale)).toBe('Not undone: "stocks" can no longer go back as line 3. Nothing was stored.');
  });

  test('another line has the name the Undo would write, the name named as it would be written', () => {
    expect(refused({ kind: 'undo', act: 'reinsert', line: 3, text: LINE }, { kind: 'name-taken', line: 9 })).toBe('Not undone: line 9 already has the name "stocks". Nothing was stored.');
    expect(refused({ kind: 'undo', act: 'restore', line: 7, text: LINE, former: FORMER }, { kind: 'name-taken', line: 2 })).toBe('Not undone: line 2 already has the name "stock". Nothing was stored.');
  });
});

describe('the confirmation names the name and the line (L2), and its Undo says what it undoes', () => {
  const undo: UndoRequest = { kind: 'undo', act: 'remove', line: 1, text: LINE };
  const cases: [Outcome, string, string, string][] = [
    [{ kind: 'saved', name: 'a b', line: 3, undo, headingMissing: false }, 'Saved "a b" as line 3', 'Undo saving "a b"', 'Enter undoes the save, removing its line'],
    [{ kind: 'rewritten', name: 'a b', line: 3, undo }, 'Changed "a b" on line 3', 'Undo changing "a b"', 'Enter undoes the change, restoring the line as it was'],
    [{ kind: 'restored', name: 'a b', line: 3, undo }, 'Changed "a b" back on line 3', 'Undo changing back "a b"', 'Enter undoes changing the line back, changing it again'],
    [{ kind: 'removed', name: 'a b', line: 3, undo }, 'Removed "a b" from line 3', 'Undo removing "a b"', 'Enter undoes the removal, putting the line back'],
    [{ kind: 'put-back', name: 'a b', line: 3, undo }, 'Put "a b" back as line 3', 'Undo putting back "a b"', 'Enter undoes putting the line back, removing it again'],
  ];
  for (const [outcome, text, label, footer] of cases) {
    test(outcome.kind, () => {
      expect(confirmationText(outcome)).toBe(text);
      if (outcome.kind !== 'refused') expect(undoLabel(outcome)).toBe(label);
      expect(undoFooter(outcome, false)).toBe(footer);
      expect(undoFooter(outcome, true)).toBe('Undoing · Enter does nothing until it is stored');
      expect(offersUndo({ id: 1, outcome })).toBe(true);
    });
  }

  test('a save whose chosen heading was not found says it went to the end (G9)', () => {
    expect(confirmationText({ kind: 'saved', name: 'a', line: 9, undo, headingMissing: true })).toBe('Saved "a" as line 9, at the end of the document: the heading you chose was not found');
  });
});
