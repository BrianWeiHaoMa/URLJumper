// The popup's Name form (In use, "Name this page", "Name from a search", "Name a link"; G7, G25, L2;
// Composition, "Popup"): the form as a view of its own, taking the popup's search while it is open: above, the
// title for a page or a link; below the header, after an update from 1.x, the notice of what is new (G25); the
// form scrolling between header and footer (G7); and a footer that says what Enter does where the focus is.
// It gives the form what the popup has: the document as last read, and what the popup was asked to name.
import { useLayoutEffect, useRef, useState } from 'react';
import { NameForm, type NameSubject } from '../line-changes/NameForm';
import type { Outcome } from '../line-changes/outcomes';
import { useFitToViewport } from './fit-to-viewport';
import { footerWithNotice } from './upgrade-notice';
import { UpgradeNotice, type Notice } from './UpgradeNotice';

interface PopupNameFormProps {
  /** The stored document as last read. */
  document: string;
  /** The name to start with: empty, the Name row's typed text, or what was typed before a form a command or menu item asked for showed. */
  name: string;
  subject: NameSubject;
  /** The notice of what is new, while it shows. */
  notice: Notice;
  onSaved(outcome: Outcome): void;
  onEdit(line: number): void;
  onCancel(): void;
}

export function PopupNameForm({ document, name, subject, notice, onSaved, onEdit, onCancel }: PopupNameFormProps) {
  const layout = useFitToViewport();
  const nameField = useRef<HTMLInputElement>(null);
  const [enterSays, setEnterSays] = useState('Enter does nothing');
  // The form focuses its name field in its own layout effect, which runs before this frame's first fit, so
  // Chrome scrolled to that focus in a popup not yet fitted and a long title above could leave the field out
  // of the fitted view. Once fitted, the view goes back to its top and scrolls as that focus scrolls a fitted
  // popup: not at all when the field shows whole, to the nearer edge when part of it does, centered when none
  // does (G7, G32).
  useLayoutEffect(() => {
    const view = layout.view.current;
    const field = nameField.current;
    if (view === null || field === null || field.ownerDocument.activeElement !== field) return;
    view.scrollTop = 0;
    const shown = view.getBoundingClientRect();
    const { top, bottom } = field.getBoundingClientRect();
    if (bottom <= shown.top || top >= shown.bottom) field.scrollIntoView({ block: 'center' });
    else if (top < shown.top || bottom > shown.bottom) field.scrollIntoView({ block: 'nearest' });
  }, []);

  return (
    <main className="popup" ref={layout.root}>
      <header className="form-header">
        <h1 className="form-title">{subject.kind === 'link' ? 'Name this link' : 'Name this page'}</h1>
      </header>
      <UpgradeNotice notice={notice} start={nameField} />
      <div className="view" ref={layout.view} role="region" aria-label="Name form">
        <div className="view-content" ref={layout.content}>
          <NameForm
            document={document}
            name={name}
            subject={subject}
            start={nameField}
            onSaved={onSaved}
            onEdit={onEdit}
            onCancel={onCancel}
            sayWhatEnterDoes={setEnterSays}
          />
        </div>
      </div>
      <footer className="footer">{footerWithNotice(enterSays, notice)}</footer>
    </main>
  );
}
