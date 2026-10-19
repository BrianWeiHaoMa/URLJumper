// The popup's settings (In use, "Preferences"; G31; Composition, "Popup"): the settings views inside the
// popup, reached by the gear in search and in the first-run state. Its header holds the way back, the list of
// views, and *Open in tab*, which opens the options page on the view shown; between header and footer the
// view scrolls (G7), and the footer says what Enter does wherever the focus is (L2). It holds none of the
// views' logic and offers no Import or Export, which are the full page's.
import { useLayoutEffect, useState } from 'react';
import { chromeMessage } from '../requests';
import { settingsFragment, type SettingsView } from '../settings/settings-view';
import { enterOnView, SettingsNav } from '../settings/SettingsNav';
import { SETTINGS_VIEWS } from '../settings/views';
import { useFitToViewport } from './fit-to-viewport';
import './popup-settings.css';

interface PopupSettingsProps {
  /** Returns to search, or to the first-run state while the document is empty. */
  onBack(): void;
}

export function PopupSettings({ onBack }: PopupSettingsProps) {
  const layout = useFitToViewport();
  // Settings open on the first view of the list.
  const [shown, setShown] = useState<SettingsView>(SETTINGS_VIEWS[0]);
  const [viewSays, setViewSays] = useState('Enter does nothing');
  const [focused, setFocused] = useState<'back' | 'open-in-tab' | SettingsView | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // The focus goes to the view's first control as it is shown, never to nothing (G32).
  useLayoutEffect(() => {
    const controls = layout.view.current?.querySelectorAll<HTMLElement>('.view-content *') ?? [];
    [...controls].find((control) => control.tabIndex >= 0 && !control.matches(':disabled'))?.focus();
  }, [shown]);

  const openInTab = () => {
    setMessage(null);
    // A new tab with the view in its fragment; Chrome's own way to the options page reuses an open one,
    // fragment and all. The tab takes the focus, so Chrome closes the popup.
    chrome.tabs
      .create({ url: chrome.runtime.getURL(`options.html${settingsFragment(shown.id)}`) })
      .catch((error: unknown) => setMessage(`Settings did not open in a tab. Chrome said: ${chromeMessage(error)}`));
  };

  const footer =
    focused === 'back'
      ? 'Enter leaves settings'
      : focused === 'open-in-tab'
        ? 'Enter opens settings in a tab'
        : focused !== null
          ? enterOnView(focused, shown)
          : viewSays;
  const { View } = shown;

  return (
    <main className="popup" ref={layout.root}>
      <header className="settings-bar">
        <button type="button" className="settings-bar-button" onClick={onBack} onFocus={() => setFocused('back')} onBlur={() => setFocused(null)}>
          Back
        </button>
        <SettingsNav views={SETTINGS_VIEWS} shown={shown} onShow={setShown} onFocusView={setFocused} />
        <button type="button" className="settings-bar-button open-in-tab" onClick={openInTab} onFocus={() => setFocused('open-in-tab')} onBlur={() => setFocused(null)}>
          Open in tab
        </button>
      </header>
      <div className="view" ref={layout.view} role="region" aria-label={shown.title}>
        <div className="view-content" ref={layout.content}>
          {message !== null && (
            <p className="message" role="alert">
              {message}
            </p>
          )}
          <View sayWhatEnterDoes={setViewSays} />
        </div>
      </div>
      <footer className="footer">{footer}</footer>
    </main>
  );
}

interface SettingsGearProps {
  onClick(): void;
  onFocusChange(focused: boolean): void;
}

/** The gear that opens the popup's settings, drawn inline so nothing loads from outside the package (R6). */
export function SettingsGear({ onClick, onFocusChange }: SettingsGearProps) {
  return (
    <button type="button" className="settings-gear" aria-label="Settings" onClick={onClick} onFocus={() => onFocusChange(true)} onBlur={() => onFocusChange(false)}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="2.2" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <rect key={angle} x="6.9" y="0.8" width="2.2" height="3.4" rx="0.6" fill="currentColor" transform={`rotate(${angle} 8 8)`} />
        ))}
      </svg>
    </button>
  );
}
