// The confirmation of a single-line change (G9, G15, L2): it names the name and the line, says when the
// chosen heading was not found, and offers Undo. An Undo is a change of its own, so its confirmation offers
// Undo in turn: a save's Undo removes the line, that Undo's Undo puts the line back as the same line number,
// and the Undo of that removes it again. A refused Undo says nothing was stored and why, offering nothing.
// Each lives in the popup's memory alone (State) and only until the first of the user's next action in the
// popup, ten seconds, or the popup closing (G15).
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { send, type UndoReply, type UndoRequest } from '../requests';
import type { Saved } from './NameForm';

/** A line as a change left it or took it away: its name, and the number and exact text the worker replied. */
type ChangedLine = Omit<Saved, 'headingMissing'>;

export type Outcome =
  /** A save; Undo removes its line. */
  | { kind: 'saved'; changed: ChangedLine; headingMissing: boolean }
  /** An Undo took the line away; Undo puts it back as the same line number. */
  | { kind: 'removed'; changed: ChangedLine }
  /** An Undo's Undo put the line back; Undo removes it again. */
  | { kind: 'put-back'; changed: ChangedLine }
  /** An Undo stored nothing, for this reason; nothing is offered. */
  | { kind: 'refused'; message: string };

export interface Confirmed {
  /** Raised for each confirmation, so a new one replaces the old and starts its own ten seconds. */
  id: number;
  outcome: Outcome;
}

const LIFETIME_MS = 10_000;

/**
 * Pointer or key activation of these ends a confirmation, unless it is one of the confirmation's own. Focus
 * moving (Tab, Shift+Tab, a click into a field), the pointer, the wheel, and redraws do not, so the keyboard
 * can reach what the confirmation offers.
 */
const CONTROLS = 'button, a[href], select, summary, input[type=checkbox], input[type=radio], [role=button], [role=option], [role=listbox]';

interface ConfirmationProps {
  confirmed: Confirmed;
  own: RefObject<HTMLDivElement | null>;
  /** Whether an Undo awaits its reply. */
  undoing: boolean;
  onUndo(): void;
  onUndoFocus(focused: boolean): void;
  /** Called on a character typed on Undo, before it lands: it moves the focus to where typing goes. */
  onTyping(): void;
}

export function Confirmation({ confirmed, own, undoing, onUndo, onUndoFocus, onTyping }: ConfirmationProps) {
  const { outcome } = confirmed;
  const onKeyDown = (event: ReactKeyboardEvent) => {
    // A held Enter undoes once, not back and forth.
    if (event.key === 'Enter' && event.repeat) event.preventDefault();
    else if (isTyping(event)) onTyping();
  };
  return (
    <div className={outcome.kind === 'refused' ? 'confirmation refused' : 'confirmation'} ref={own}>
      {/* The same live region for every outcome, so a screen reader hears each one replace the last. */}
      <p className="confirmation-text" role="status">
        {confirmationText(outcome)}
      </p>
      {outcome.kind !== 'refused' && (
        <button
          type="button"
          className="undo"
          aria-label={`Undo ${UNDOES[outcome.kind]} "${outcome.changed.name}"`}
          aria-disabled={undoing}
          onClick={onUndo}
          onFocus={() => onUndoFocus(true)}
          onBlur={() => onUndoFocus(false)}
          onKeyDown={onKeyDown}
        >
          Undo
        </button>
      )}
    </div>
  );
}

const UNDOES = { saved: 'saving', removed: 'removing', 'put-back': 'putting back' } as const;

/** Whether `confirmed` still offers Undo. */
export function offersUndo(confirmed: Confirmed | null): boolean {
  return confirmed !== null && confirmed.outcome.kind !== 'refused';
}

/** What Enter does while Undo has the focus (L2); like every footer it holds no name, which can be as long as the document. */
export function undoFooter(outcome: Outcome, undoing: boolean): string {
  if (undoing) return 'Undoing · Enter does nothing until it is stored';
  if (outcome.kind === 'removed') return 'Enter undoes the removal, putting the line back';
  if (outcome.kind === 'put-back') return 'Enter undoes putting the line back, removing it again';
  return 'Enter undoes the save, removing its line';
}

/**
 * Undo of `confirmed`'s change: sends its inverse, nothing while one awaits its reply, and gives the
 * outcome to `onOutcome`, as a confirmation of its own, whether or not the old one is still shown by then.
 */
export function useUndo(confirmed: Confirmed | null, onOutcome: (outcome: Outcome) => void) {
  const inFlight = useRef(false);
  const [undoing, setUndoing] = useState(false);
  const undo = async () => {
    const outcome = confirmed?.outcome;
    if (outcome === undefined || outcome.kind === 'refused' || inFlight.current) return;
    const { name, line, text } = outcome.changed;
    const request: UndoRequest = { kind: 'undo', act: outcome.kind === 'removed' ? 'reinsert' : 'remove', line, text };
    inFlight.current = true;
    setUndoing(true);
    const reply = await send(request);
    inFlight.current = false;
    setUndoing(false);
    onOutcome(outcomeAfter(name, request, reply));
  };
  return { undo, undoing };
}

function outcomeAfter(name: string, request: UndoRequest, reply: UndoReply): Outcome {
  if (reply.kind !== 'applied') return { kind: 'refused', message: refusalText(name, request, reply) };
  const changed = { name, line: reply.line, text: reply.text };
  return request.act === 'remove' ? { kind: 'removed', changed } : { kind: 'put-back', changed };
}

function refusalText(name: string, request: UndoRequest, reply: Exclude<UndoReply, { kind: 'applied' }>): string {
  if (reply.kind === 'storage-failed') return `Not undone: nothing was stored. Chrome said: ${reply.message}`;
  if (reply.kind === 'name-taken') return `Not undone: line ${reply.line} already has the name "${name}". Nothing was stored.`;
  if (request.act === 'remove') return `Not undone: line ${request.line}, "${name}", was changed or removed since. Nothing was stored.`;
  return `Not undone: "${name}" can no longer go back as line ${request.line}. Nothing was stored.`;
}

function confirmationText(outcome: Outcome): string {
  if (outcome.kind === 'refused') return outcome.message;
  const { name, line } = outcome.changed;
  if (outcome.kind === 'removed') return `Removed "${name}" from line ${line}`;
  if (outcome.kind === 'put-back') return `Put "${name}" back as line ${line}`;
  const missing = outcome.headingMissing ? ', at the end of the document: the heading you chose was not found' : '';
  return `Saved "${name}" as line ${line}${missing}`;
}

/** A key that types a character; Space activates the button instead. */
function isTyping(event: ReactKeyboardEvent): boolean {
  return [...event.key].length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing;
}

/**
 * Ends `confirmed` (through `end`) ten seconds after it appeared, or at the user's next action: Enter or
 * Escape, or activating a control, anywhere but on its own controls inside `own`. Editing the search box
 * and moving the selection end it where the popup handles them.
 */
export function useConfirmationLifetime(confirmed: Confirmed | null, end: (id: number) => void, own: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (confirmed === null) return;
    const ownTarget = (event: Event) => event.target instanceof Node && own.current?.contains(event.target) === true;
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === 'Escape') && !ownTarget(event)) end(confirmed.id);
    };
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(CONTROLS) && !ownTarget(event)) end(confirmed.id);
    };
    const timer = setTimeout(() => end(confirmed.id), LIFETIME_MS);
    // Captured, so the confirmation has ended before the key or click does what it does.
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onClick, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick, true);
    };
  }, [confirmed, end, own]);
}
