// The confirmation of a single-line change (G9, G12, G15, L2): it names the name and the line, says when the
// chosen heading was not found, and offers Undo, whose outcome its host shows as a confirmation of its own,
// itself offering Undo (`outcomes.ts`). A refused Undo says nothing was stored and why, offering nothing.
// Each lives in its host's memory alone (State) and only until the first of the user's next action in that
// view, ten seconds, or the page closing (G15). It writes only through the worker's *undo* (R1).
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { send } from '../requests';
import { confirmationText, outcomeOfUndo, undoLabel, type Confirmed, type Outcome } from './outcomes';
import './confirmation.css';

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
          aria-label={undoLabel(outcome)}
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
    inFlight.current = true;
    setUndoing(true);
    const reply = await send(outcome.undo);
    inFlight.current = false;
    setUndoing(false);
    onOutcome(outcomeOfUndo(outcome.undo, reply));
  };
  return { undo, undoing };
}

/** A key that types a character; Space activates the button instead. */
function isTyping(event: ReactKeyboardEvent): boolean {
  return [...event.key].length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing;
}

/**
 * Ends `confirmed` (through `end`) ten seconds after it appeared, or at the user's next action: Enter or
 * Escape, or activating a control, anywhere but on its own controls inside `own`. The host ends it at its
 * view's other actions, as the popup does for an edit of the search box and a move of the selection.
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
