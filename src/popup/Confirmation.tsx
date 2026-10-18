// The confirmation of a saved line (G9, L2): it names the name and the line, and says when the chosen
// heading was not found. It lives in the popup's memory alone (State) and only until the first of the
// user's next action in the popup, ten seconds, or the popup closing (G15).
import { useEffect, type RefObject } from 'react';
import type { Saved } from './NameForm';

export interface Confirmed {
  /** Raised for each confirmation, so a new one replaces the old and starts its own ten seconds. */
  id: number;
  saved: Saved;
}

const LIFETIME_MS = 10_000;

/**
 * Pointer or key activation of these ends a confirmation, unless it is one of the confirmation's own. Focus
 * moving (Tab, Shift+Tab, a click into a field), the pointer, the wheel, and redraws do not, so the keyboard
 * can reach what the confirmation offers.
 */
const CONTROLS = 'button, a[href], select, summary, input[type=checkbox], input[type=radio], [role=button], [role=option], [role=listbox]';

export function Confirmation({ confirmed, own }: { confirmed: Confirmed; own: RefObject<HTMLParagraphElement | null> }) {
  const { name, line, headingMissing } = confirmed.saved;
  return (
    <p className="confirmation" role="status" ref={own}>
      Saved "{name}" as line {line}
      {headingMissing ? ', at the end of the document: the heading you chose was not found' : ''}
    </p>
  );
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
