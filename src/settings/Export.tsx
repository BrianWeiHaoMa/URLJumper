// Export (F10, G20; Composition, "Chrome"): downloads the stored document as `URLJumperMappings.txt`, the
// backup the user keeps. What is stored when Export is activated, read then, never a copy read earlier or
// text that passed through a text area, which turns CRLF into LF (S14); the Blob of that string is its UTF-8,
// with no byte-order mark added. An absent document exports as an empty file.
import { useRef, useState } from 'react';
import { chromeMessage } from '../requests';
import './settings.css';

const FILE_NAME = 'URLJumperMappings.txt';

export function Export() {
  const [message, setMessage] = useState<string | null>(null);
  // The last download's address, kept until the next one: Chrome reads it after the click has returned.
  const lastUrl = useRef<string | null>(null);

  const exportDocument = async () => {
    setMessage(null);
    let text: string;
    try {
      const { mappings } = await chrome.storage.local.get('mappings');
      text = typeof mappings === 'string' ? mappings : '';
    } catch (error) {
      setMessage(`Not exported. Chrome said: ${chromeMessage(error)}`);
      return;
    }
    if (lastUrl.current !== null) URL.revokeObjectURL(lastUrl.current);
    lastUrl.current = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = lastUrl.current;
    anchor.download = FILE_NAME;
    anchor.click();
  };

  return (
    <section className="settings-section" aria-labelledby="export-heading">
      <h2 className="settings-heading" id="export-heading">
        Export
      </h2>
      <p className="settings-text">Downloads the stored document as {FILE_NAME}. It is the only copy of your mappings: keep the file as your backup.</p>
      {message !== null && (
        <p className="settings-alert" role="alert">
          {message}
        </p>
      )}
      <button type="button" className="settings-button" onClick={() => void exportDocument()}>
        Export…
      </button>
    </section>
  );
}
