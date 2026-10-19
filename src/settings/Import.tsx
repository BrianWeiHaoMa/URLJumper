// *Import…* (In use, "Edit the text"; G20, F10; Composition, "Chrome"): on the options page, beside Preferences
// and Export, it reads a file the user chooses, any file, as UTF-8 with `File.text()`, which drops a leading
// byte-order mark and reads an invalid byte as U+FFFD (S14), and hands it to the page, which shows it in the
// Text view as the draft. The Text view asks there, after the page's draft requests have landed, before it
// replaces a kept draft with unsaved changes (G19); nothing is stored until Save, and Import writes nothing (R1).
import { useState } from 'react';
import { chromeMessage } from '../requests';
import type { ImportedText } from './settings-view';
import './settings.css';

interface ImportProps {
  /** Shows the Text view with the file's text as its draft. */
  onImport(imported: ImportedText): void;
}

export function Import({ onImport }: ImportProps) {
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
        (text) => onImport({ text, fileName: file.name, time }),
        (error: unknown) => setMessage(`Not imported: ${file.name} could not be read. Chrome said: ${chromeMessage(error)}`),
      );
    });
    input.click();
  };

  return (
    <section className="settings-section" aria-labelledby="import-heading">
      <h2 className="settings-heading" id="import-heading">
        Import
      </h2>
      <p className="settings-text">Reads a text file you choose into the Text view, in place of what it shows. Nothing is stored until you save it there.</p>
      {message !== null && (
        <p className="settings-alert" role="alert">
          {message}
        </p>
      )}
      <button type="button" className="settings-button" onClick={pick}>
        Import…
      </button>
    </section>
  );
}
