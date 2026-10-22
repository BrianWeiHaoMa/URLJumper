// *Import…* (In use, "Edit the text"; G20, F10, G31; Composition, "Chrome"): the Text view's control, an icon in
// the host's header at its top right, in both hosts. It reads a file the user chooses, any file, as UTF-8 with
// `File.text()`, which drops a leading byte-order mark and reads an invalid byte as U+FFFD (S14), and hands it
// to the Text view, which shows itself afresh with the file as the draft. The Text view asks there, after the
// page's draft requests have landed, before it replaces a kept draft with unsaved changes (G19); nothing is
// stored until Save, and Import writes nothing (R1). Why a file was not read, or not taken, shows in the view.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { chromeMessage } from '../requests';
import '../icons.css';
import './settings.css';
import './text-view.css';

/** A file's text Import brings to the Text view as its draft (G20). */
export interface ImportedText {
  /** The file's text as `File.text()` read it (S14). */
  text: string;
  /** The file's name, which the Text view asks by before it replaces a kept draft with unsaved changes (G19). */
  fileName: string;
  /** When the user imported it, in milliseconds since the Unix epoch: the time of the edit it makes. */
  time: number;
}

interface ImportProps {
  /** The host's place for the view's controls in its header; none until it is drawn, and the control with it. */
  header: HTMLElement | null | undefined;
  /** Shows the Text view afresh with the file's text as its draft; resolves with why it did not, or null. */
  onImport(imported: ImportedText): Promise<string | null>;
  onFocusChange(focused: boolean): void;
}

export function Import({ header, onImport, onFocusChange }: ImportProps) {
  const [message, setMessage] = useState<string | null>(null);

  // The chooser is a file input made for each activation and never put in the page, as Export's anchor is.
  const pick = () => {
    setMessage(null);
    const input = Object.assign(document.createElement('input'), { type: 'file' });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file === undefined) return;
      const time = Date.now();
      file.text().then(
        async (text) => setMessage(await onImport({ text, fileName: file.name, time })),
        (error: unknown) => setMessage(`Not imported: ${file.name} could not be read. Chrome said: ${chromeMessage(error)}`),
      );
    });
    input.click();
  };

  return (
    <>
      {header &&
        createPortal(
          <button
            type="button"
            className="icon-button text-view-import"
            aria-label="Import…"
            title="Import a text file to edit, stored when you save"
            onClick={pick}
            onFocus={() => onFocusChange(true)}
            onBlur={() => onFocusChange(false)}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M2.5 10v3.5h11V10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 2.5v7.5M5 7l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>,
          header,
        )}
      {message !== null && (
        <p className="settings-alert text-view-file-alert" role="alert">
          {message}
        </p>
      )}
    </>
  );
}
