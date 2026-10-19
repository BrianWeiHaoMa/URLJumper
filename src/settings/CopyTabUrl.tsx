// *Copy tab URL* (G31; Composition, "Chrome"): in the popup's Text view alone, the address of the tab the
// popup was opened on, as the host gives it, put on the clipboard inside the user's click or key, which the
// clipboard needs (S14). Without Chrome's grant there is no address (E5), and nothing to copy.
import { useState } from 'react';
import { chromeMessage } from '../requests';

interface CopyTabUrlProps {
  /** The opener tab's address; undefined when Chrome granted none. */
  url: string | undefined;
  onFocusChange(focused: boolean): void;
}

export function CopyTabUrl({ url, onFocusChange }: CopyTabUrlProps) {
  const [said, setSaid] = useState<string | null>(null);
  if (url === undefined) return <p className="settings-text">Copy tab URL: Chrome gave no address for the tab this popup was opened on.</p>;

  const copy = () => {
    setSaid(null);
    navigator.clipboard.writeText(url).then(
      () => setSaid("Copied the tab's address"),
      (error: unknown) => setSaid(`Not copied. Chrome said: ${chromeMessage(error)}`),
    );
  };

  return (
    <>
      <button type="button" className="settings-button" onClick={copy} onFocus={() => onFocusChange(true)} onBlur={() => onFocusChange(false)}>
        Copy tab URL
      </button>
      {said !== null && (
        <p className="settings-text" role="status">
          {said}
        </p>
      )}
    </>
  );
}
