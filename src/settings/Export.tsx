// *Export…* (F10, G20, G31; Composition, "Chrome"): the Text view's control, an icon in the host's header at its
// top right, in both hosts, beside Import. It downloads the stored document as `URLJumperMappings.txt`, the
// backup the user keeps. What is stored when Export is activated, read then, never a copy read earlier or
// text that passed through a text area, which turns CRLF into LF (S14); the Blob of that string is its UTF-8,
// with no byte-order mark added. An absent document exports as an empty file. Why nothing was exported shows
// in the view, where it stands.
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { chromeMessage } from '../requests';
import { readMappings } from '../stored-document';
import '../icons.css';
import './settings.css';
import './text-view.css';

export const EXPORT_FILE_NAME = 'URLJumperMappings.txt';

interface ExportProps {
  /** The host's place for the view's controls in its header; none until it is drawn, and the control with it. */
  header: HTMLElement | null | undefined;
  onFocusChange(focused: boolean): void;
}

export function Export({ header, onFocusChange }: ExportProps) {
  const [message, setMessage] = useState<string | null>(null);
  // The last download's address, kept until the next one: Chrome reads it after the click has returned.
  const lastUrl = useRef<string | null>(null);

  const exportDocument = async () => {
    setMessage(null);
    let text: string;
    try {
      const { mappings } = await chrome.storage.local.get('mappings');
      text = readMappings(mappings);
    } catch (error) {
      setMessage(`Not exported. Chrome said: ${chromeMessage(error)}`);
      return;
    }
    if (lastUrl.current !== null) URL.revokeObjectURL(lastUrl.current);
    lastUrl.current = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = lastUrl.current;
    anchor.download = EXPORT_FILE_NAME;
    anchor.click();
  };

  return (
    <>
      {header &&
        createPortal(
          <button
            type="button"
            className="icon-button text-view-export"
            aria-label="Export…"
            title="Export your stored mappings"
            onClick={() => void exportDocument()}
            onFocus={() => onFocusChange(true)}
            onBlur={() => onFocusChange(false)}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M2.5 10v3.5h11V10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 10V2.5M5 5.5l3-3 3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
