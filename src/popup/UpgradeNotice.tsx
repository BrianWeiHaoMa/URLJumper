// The notice of what is new (In use, "Upgrade from 1.x"; G25; State, `upgradeNotice`): one line, shown in
// search, the first-run state, and the Name form while the worker's `pending` mark of an update from 1.x
// stands and this popup has not dismissed it. Any keystroke but Tab and Shift+Tab dismisses it and still does
// what it does, also in settings, where it is not drawn; its close control dismisses it; activating it opens
// the what's-new page bundled with the extension in a new tab, and dismisses it too. A dismissal removes
// `upgradeNotice`, the one removal of it; a popup closed without one leaves the notice for the next.
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { chromeMessage } from '../requests';
import { activatesControl, dismissesNotice, type NoticeControl } from './upgrade-notice';
import './upgrade-notice.css';

/** The page the notice opens, at the package's root. */
const WHATS_NEW_PAGE = 'whats-new.html';

export interface Notice {
  /** Whether the notice shows where a view draws it: the last read found `upgradeNotice` pending, and this popup has not dismissed it. */
  shown: boolean;
  /** Which of its controls has the focus, which the footer follows. */
  focused: NoticeControl | null;
  dismiss(): void;
  onFocusChange(control: NoticeControl | null): void;
  /** Called by the notice as a view draws it (true) and takes it away (false); while drawn, it takes its keystrokes itself. */
  onDrawn(drawn: boolean): void;
}

/**
 * The notice's state for the whole popup, across its views. `pending` is whether the popup's last read found
 * `upgradeNotice` pending. A dismissal holds in this popup whatever a later answer says: a read made before
 * the removal can answer after it.
 */
export function useUpgradeNotice(pending: boolean): Notice {
  const [dismissed, setDismissed] = useState(false);
  const removed = useRef(false);
  const [focused, setFocused] = useState<NoticeControl | null>(null);
  const drawn = useRef(false);
  const dismiss = useCallback(() => {
    if (removed.current) return;
    removed.current = true;
    // Issued here, before anything that can close the popup (Escape, the new tab taking the focus) runs: a
    // removal left to a later effect or callback rests on that running before the popup closes. Should Chrome
    // refuse it, the next popup shows the notice again, which is all a refusal can cost.
    chrome.storage.local.remove('upgradeNotice').catch(() => undefined);
    setDismissed(true);
  }, []);
  const shown = pending && !dismissed;
  // In settings, which do not draw the notice, a keystroke dismisses it all the same: this popup showed it.
  useLayoutEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => {
      if (!drawn.current && dismissesNotice(event)) dismiss();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [shown, dismiss]);
  const onDrawn = useCallback((on: boolean) => {
    drawn.current = on;
  }, []);
  return { shown, focused, dismiss, onFocusChange: setFocused, onDrawn };
}

interface UpgradeNoticeProps {
  notice: Notice;
  /** The control the view starts on, which takes the focus when the notice goes with the focus in it (G32). */
  start: RefObject<HTMLElement | null>;
}

export function UpgradeNotice({ notice, start }: UpgradeNoticeProps) {
  const own = useRef<HTMLDivElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const { shown, dismiss, onFocusChange, onDrawn } = notice;

  // A focus inside the notice goes to where the view starts before the notice goes, never to nothing, so a
  // character typed on the notice lands there.
  const leave = useCallback(() => {
    if (own.current?.contains(document.activeElement)) start.current?.focus();
    dismiss();
  }, [dismiss, start]);

  const open = useCallback(() => {
    leave();
    // After the removal: the new tab takes the focus, and Chrome closes the popup.
    chrome.tabs
      .create({ url: chrome.runtime.getURL(WHATS_NEW_PAGE) })
      .catch((error: unknown) => setFailure(`What's new did not open in a tab. Chrome said: ${chromeMessage(error)}`));
  }, [leave]);

  useLayoutEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => {
      if (!dismissesNotice(event)) return;
      // Enter or Space on one of the notice's controls is that control's activation, done here: the control
      // goes with the notice before its own activation, on a later event, could reach it.
      if (activatesControl(event) && (event.target === openButton.current || event.target === closeButton.current)) {
        event.preventDefault();
        if (event.target === openButton.current) open();
        else leave();
        return;
      }
      leave();
    };
    // Captured, so the notice is dismissed before the key does what it does, and the key is let through.
    document.addEventListener('keydown', onKey, true);
    onDrawn(true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      onDrawn(false);
    };
  }, [shown, leave, open, onDrawn]);

  if (failure !== null) {
    return (
      <p className="message upgrade-notice-failure" role="alert">
        {failure}
      </p>
    );
  }
  if (!shown) return null;
  return (
    <div className="upgrade-notice" ref={own} role="region" aria-label="What's new">
      <button
        ref={openButton}
        type="button"
        className="upgrade-notice-open"
        onClick={open}
        onFocus={() => onFocusChange('open')}
        onBlur={() => onFocusChange(null)}
      >
        URLJumper 2.0 is here: see what's new
      </button>
      <button
        ref={closeButton}
        type="button"
        className="upgrade-notice-close"
        aria-label="Close the notice of what's new"
        title="Close"
        onClick={leave}
        onFocus={() => onFocusChange('close')}
        onBlur={() => onFocusChange(null)}
      >
        ×
      </button>
    </div>
  );
}
