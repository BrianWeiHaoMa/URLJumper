// The popup's settings (In use, "Preferences"; G31; Composition, "Popup"): the settings views inside the
// popup, reached by the gear in search and in the first-run state. Its header holds the way back, the list of
// views, the view's own controls (the List view's *Add mapping*), and *Open in tab*, which opens the options
// page on the view shown; between header and footer the view scrolls (G7), and the footer says what Enter does
// wherever the focus is (L2). It gives the views the tab the popup was opened on, whose address *Copy tab URL*
// copies, shows its Text view on a line when the List view asks, and lets the view shown ask before another is
// shown in its place. It holds none of the views' logic and offers no Import or Export, which are the full page's.
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { chromeMessage } from '../requests';
import { settingsFragment, type SettingsView, type SwitchGuard } from '../settings/settings-view';
import { enterOnView, SettingsNav } from '../settings/SettingsNav';
import { SETTINGS_VIEWS, TEXT_VIEW } from '../settings/views';
import '../icons.css';
import { useFitToViewport } from './fit-to-viewport';
import './popup-settings.css';

interface PopupSettingsProps {
  /** The address of the tab the popup was opened on; undefined when Chrome granted none (E5). */
  tabUrl: string | undefined;
  /** Returns to search, or to the first-run state while the document is empty. */
  onBack(): void;
}

export function PopupSettings({ tabUrl, onBack }: PopupSettingsProps) {
  const layout = useFitToViewport();
  // Settings open on the first view of the list.
  const [shown, setShown] = useState<SettingsView>(SETTINGS_VIEWS[0]);
  // The line the Text view shows when the List view asked for it; showing another view drops it.
  const [caretLine, setCaretLine] = useState<number>();
  const [viewSays, setViewSays] = useState('Enter does nothing');
  const [focused, setFocused] = useState<'back' | 'open-in-tab' | SettingsView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Where in the header the view shown puts its own controls, once drawn.
  const [viewControls, setViewControls] = useState<HTMLElement | null>(null);
  // What the view shown asks before another is shown in its place, as it registered it (G19).
  const switchGuard = useRef<SwitchGuard | null>(null);
  const guardSwitch = useCallback((guard: SwitchGuard | null) => {
    switchGuard.current = guard;
  }, []);

  // The focus goes to the view's first control as it is shown, never to nothing (G32): while the view has none
  // yet, as the List view before its first read, and the control that had it went with the view left, as the
  // answer to its question does, to the shown view's button.
  useLayoutEffect(() => {
    const controls = layout.view.current?.querySelectorAll<HTMLElement>('.view-content *') ?? [];
    const first = [...controls].find((control) => control.tabIndex >= 0 && !control.matches(':disabled'));
    if (first !== undefined) first.focus();
    else if (document.activeElement === document.body) layout.root.current?.querySelector<HTMLElement>('.settings-nav [aria-current="page"]')?.focus();
  }, [shown]);

  const show = (view: SettingsView) => {
    if (view === shown) return;
    const proceed = () => {
      setCaretLine(undefined);
      setShown(view);
    };
    if (switchGuard.current === null) proceed();
    else switchGuard.current.switching(view, proceed);
  };
  const showTextView = (line: number) => {
    setCaretLine(line);
    setShown(TEXT_VIEW);
  };

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
          ? enterOnView(focused, shown, switchGuard.current?.mayAsk(focused) ?? false)
          : viewSays;
  const { View } = shown;

  return (
    <main className="popup" ref={layout.root}>
      <header className="settings-bar">
        <button type="button" className="settings-bar-button" onClick={onBack} onFocus={() => setFocused('back')} onBlur={() => setFocused(null)}>
          Back
        </button>
        <SettingsNav views={SETTINGS_VIEWS} shown={shown} onShow={show} onFocusView={setFocused} />
        <span className="settings-bar-view-controls" ref={setViewControls} />
        <button
          type="button"
          className="icon-button open-in-tab"
          aria-label="Open in tab"
          title="Open in tab"
          onClick={openInTab}
          onFocus={() => setFocused('open-in-tab')}
          onBlur={() => setFocused(null)}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M6.5 3.5h-3v9h9v-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9.5 2.5h4v4M13.5 2.5 8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </header>
      <div className="view" ref={layout.view} role="region" aria-label={shown.title}>
        <div className="view-content" ref={layout.content}>
          {message !== null && (
            <p className="message" role="alert">
              {message}
            </p>
          )}
          <View
            sayWhatEnterDoes={setViewSays}
            openerTab={{ url: tabUrl }}
            headerControls={viewControls}
            caretLine={caretLine}
            showTextView={showTextView}
            guardSwitch={guardSwitch}
          />
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
    <button
      type="button"
      className="icon-button settings-gear"
      aria-label="Settings"
      title="Settings"
      onClick={onClick}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="2.2" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <rect key={angle} x="6.9" y="0.8" width="2.2" height="3.4" rx="0.6" fill="currentColor" transform={`rotate(${angle} 8 8)`} />
        ))}
      </svg>
    </button>
  );
}
