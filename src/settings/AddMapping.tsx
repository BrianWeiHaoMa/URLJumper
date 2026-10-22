// *Add mapping* (In use, "Edit the list"; G8, G9, G11, G21, G31, G32, N6, L2): the List view's control, there
// also when the document has no mapping, and the Name form it opens: the one form the popup's search opens
// (src/line-changes/NameForm.tsx), with no page, so no line about a tab and no *This page is*, an empty URL
// field, and the name field empty with the focus (G11, N6), given the document as the view last read it. The
// control is a plus in the host's header, at its top right, where it stays while the form is open; the form
// opens at the top of the view, in the popup with its *Copy tab URL*. The view confirms what it stores, opens the
// row editor for *Edit "‹name›" instead*, and makes every other edit wait while the form's Save awaits its reply
// (G21); Cancel stores nothing and gives the focus back to the control (G32). It writes only through the form's
// insert (R1).
import { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { anchorAt, type Anchor } from '../document/anchor';
import { PlusIcon } from '../icons';
import { NameForm, type NameSubject } from '../line-changes/NameForm';
import type { Outcome } from '../line-changes/outcomes';
import { CopyTabUrl } from './CopyTabUrl';

const NO_PAGE: NameSubject = { kind: 'none' };

interface AddMappingProps {
  /** The stored document as the view last read it. */
  document: string;
  /** Whether the form is open. */
  open: boolean;
  /** The host's place for the view's controls in its header; none until it is drawn, and the control with it. */
  header: HTMLElement | null | undefined;
  /** The tab the popup was opened on, whose address the form's *Copy tab URL* copies; undefined on the options page. */
  openerTab: { url: string | undefined } | undefined;
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
  /** Called with the control or the form's *Copy tab URL* as either gains the focus, and with null as it loses it. */
  onFocusChange(focused: 'add' | 'copy' | null): void;
}

export function AddMapping({ document, open, header, openerTab, waiting, onOpen, onSaved, onEditInstead, onCancel, onBusy, onTyped, sayWhatEnterDoes, onFocusChange }: AddMappingProps) {
  const control = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const heading = useId();
  // Set by Cancel, so the control it brings back takes the focus the form had, never leaving it on nothing (G32).
  const cancelled = useRef(false);
  // The form shown from its top, whole where it fits: Chrome's own scroll to its focused name field would leave a
  // form taller than the view opening part way down.
  useLayoutEffect(() => {
    if (open) form.current?.scrollIntoView({ block: 'nearest' });
    else if (cancelled.current) control.current?.focus();
    cancelled.current = false;
  }, [open]);

  const activate = () => {
    if (waiting) return;
    if (!open) return onOpen();
    // The plus stays in the header while the form is open, which a long list may have scrolled away.
    form.current?.scrollIntoView({ block: 'nearest' });
    nameField.current?.focus();
  };
  const focusEvents = { onFocus: () => onFocusChange('add'), onBlur: () => onFocusChange(null) };
  // In the host's header once it is drawn, there while the form is open.
  const shownControl = header
    ? createPortal(
        <button ref={control} type="button" className="icon-button list-add" aria-label="Add mapping" title="Add mapping" aria-disabled={waiting} onClick={activate} {...focusEvents}>
          <PlusIcon />
        </button>,
        header,
      )
    : null;
  if (!open) return shownControl;
  return (
    <>
      {shownControl}
      <section className="list-name-form" ref={form} aria-labelledby={heading} onInput={onTyped}>
        <h2 id={heading} className="settings-heading list-name-form-heading">
          Add mapping
        </h2>
        {openerTab && (
          <div className="settings-action list-name-form-copy">
            <CopyTabUrl url={openerTab.url} onFocusChange={(on) => onFocusChange(on ? 'copy' : null)} />
          </div>
        )}
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
    </>
  );
}
