// The popup's Name form (In use, "Name this page", "Name from a search", "Name a link"; G7, G25, L2;
// Composition, "Popup"): the form as a view of its own, taking the popup's search while it is open: above, the
// title for a page or a link; below the header, after an update from 1.x, the notice of what is new (G25); the
// form scrolling between header and footer (G7); and a footer that says what Enter does where the focus is.
// It gives the form what the popup has: the document as last read, and what the popup was asked to name.
import { useRef, useState } from 'react';
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
