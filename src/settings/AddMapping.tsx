// *Add mapping* (In use, "Edit the list"; G8, G9, G11, G21, G32, N6, L2): the List view's control after its
// last line, there also when the document has no mapping, and the Name form it opens in its place: the one form
// the popup's search opens (src/line-changes/NameForm.tsx), with no page, so no line about a tab and no *This
// page is*, an empty URL field, and the name field empty with the focus (G11, N6), given the document as the
// view last read it. The view confirms what it stores, opens the row editor for *Edit "‹name›" instead*, and
// makes every other edit wait while the form's Save awaits its reply (G21); Cancel stores nothing and gives the
// focus back to the control (G32). It writes only through the form's insert (R1).
import { useId, useLayoutEffect, useRef } from 'react';
import { anchorAt, type Anchor } from '../document/anchor';
import { NameForm, type NameSubject } from '../line-changes/NameForm';
import type { Outcome } from '../line-changes/outcomes';

const NO_PAGE: NameSubject = { kind: 'none' };

interface AddMappingProps {
  /** The stored document as the view last read it. */
  document: string;
  /** Whether the form is open in the control's place. */
  open: boolean;
  /** While true the control is offered but waits, as the pencils do while a change awaits its reply. */
  waiting: boolean;
  onOpen(): void;
  /** Called with the stored insert's outcome, which the view confirms; the view closes the form. */
  onSaved(outcome: Outcome): void;
  /** Opens the row editor on the line as the document the form rendered holds it; the view closes the form. */
  onEditInstead(anchor: Anchor): void;
  onCancel(): void;
  onBusy(busy: boolean): void;
  /** Called as the user types in the form: their next action, which ends a confirmation an Undo sent before it opened (G15). */
  onTyped(): void;
  sayWhatEnterDoes(text: string): void;
  onFocusChange(focused: boolean): void;
}

export function AddMapping({ document, open, waiting, onOpen, onSaved, onEditInstead, onCancel, onBusy, onTyped, sayWhatEnterDoes, onFocusChange }: AddMappingProps) {
  const control = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const heading = useId();
  // Set by Cancel, so the control it brings back takes the focus the form had, never leaving it on nothing (G32).
  const cancelled = useRef(false);
  // The form, opened at the bottom of a long list, shown from its top, whole where it fits: Chrome's own scroll to
  // its focused name field would leave a form taller than the view opening part way down.
  useLayoutEffect(() => {
    if (open) form.current?.scrollIntoView({ block: 'nearest' });
    else if (cancelled.current) control.current?.focus();
    cancelled.current = false;
  }, [open]);

  if (!open) {
    return (
      <button
        ref={control}
        type="button"
        className="settings-button list-add"
        aria-disabled={waiting}
        onClick={() => {
          if (!waiting) onOpen();
        }}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
      >
        Add mapping
      </button>
    );
  }
  return (
    <section className="list-name-form" ref={form} aria-labelledby={heading} onInput={onTyped}>
      <h2 id={heading} className="settings-heading list-name-form-heading">
        Add mapping
      </h2>
      <NameForm
        document={document}
        name=""
        subject={NO_PAGE}
        start={nameField}
        onSaved={onSaved}
        // The line's anchor from the document this render's form shows, never from a later read (G13).
        onEdit={(line) => {
          const anchor = anchorAt(document, line);
          if (anchor !== undefined) onEditInstead(anchor);
        }}
        onCancel={() => {
          cancelled.current = true;
          onCancel();
        }}
        cancelSays="Enter returns to the list"
        onBusy={onBusy}
        sayWhatEnterDoes={sayWhatEnterDoes}
      />
    </section>
  );
}
