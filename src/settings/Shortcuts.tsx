// The shortcuts as Chrome has assigned them now, with the way to Chrome's page for changing them (E6, F5),
// shown by Preferences and by the popup's first-run state. Read as the view opens and again whenever its page
// is back in front, since the user changes them on Chrome's page, in another tab, and Chrome reports no change.
// Nothing here changes a shortcut.
import { useEffect, useState } from 'react';
import { chromeMessage } from '../requests';
import './settings.css';

/** Chrome's page for changing extensions' shortcuts. An extension page's link to it opens nothing, so a button opens it in a tab. */
const SHORTCUTS_PAGE = 'chrome://extensions/shortcuts';
/** F5's commands, in its order. */
const COMMANDS = ['open-new-tab', 'open-same-tab', 'name-this-page'];

interface ShortcutsProps {
  /** Called as the button that opens Chrome's page gains and loses the focus. */
  onFocusChange(focused: boolean): void;
  /** Called with why Chrome's page did not open. */
  onMessage(message: string): void;
}

export function Shortcuts({ onFocusChange, onMessage }: ShortcutsProps) {
  const [shortcuts, setShortcuts] = useState<chrome.commands.Command[]>([]);

  // The keys Chrome has assigned now, never the suggested ones, which Chrome may have left unassigned (E6).
  // Chrome answers reads in the order they were made, so the last shows the latest.
  useEffect(() => {
    const read = () =>
      void chrome.commands.getAll().then((all) => setShortcuts(COMMANDS.flatMap((name) => all.filter((command) => command.name === name))));
    const readIfShown = () => {
      if (document.visibilityState === 'visible') read();
    };
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', readIfShown);
    read();
    return () => {
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', readIfShown);
    };
  }, []);

  const openShortcutsPage = () => {
    chrome.tabs.create({ url: SHORTCUTS_PAGE }).catch((error: unknown) => onMessage(`Chrome's shortcuts page did not open. Chrome said: ${chromeMessage(error)}`));
  };

  return (
    <>
      <dl className="shortcuts">
        {shortcuts.map((command) => (
          <div key={command.name} className="shortcut">
            <dt>{command.description}</dt>
            <dd>{command.shortcut || 'Not set'}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="settings-button" onClick={openShortcutsPage} onFocus={() => onFocusChange(true)} onBlur={() => onFocusChange(false)}>
        Change shortcuts in Chrome
      </button>
    </>
  );
}
