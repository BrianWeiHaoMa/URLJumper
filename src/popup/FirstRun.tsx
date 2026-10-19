// The first-run state (In use, "First run"; G30): while the document is absent or holds only whitespace, the
// popup shows it in place of search: *Name this page*, selected so Enter starts it, *Load example mappings*,
// which has the worker store F11's example document, and the shortcuts as Chrome reports them now, with the
// way to Chrome's page for changing them (E6). Its header has the gear to settings, never focused first. Below
// the header, after an update from 1.x, the notice of what is new (G25). A footer says what Enter does.
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { send, type LoadExampleReply } from '../requests';
import { Shortcuts } from '../settings/Shortcuts';
import { useFitToViewport } from './fit-to-viewport';
import { SettingsGear } from './PopupSettings';
import { footerWithNotice } from './upgrade-notice';
import { UpgradeNotice, type Notice } from './UpgradeNotice';
import './first-run.css';

interface FirstRunProps {
  /** Whether the popup knows the page it names yet, so that *Name this page* opens the form. */
  ready: boolean;
  /** The last change's confirmation, with its Undo, while it lives. */
  confirmation: ReactNode;
  /** What Enter does while the confirmation's Undo has the focus; undefined while it does not. */
  undoFooter: string | undefined;
  /** Why the last attempt did nothing, until the next. */
  message: string | null;
  /** The notice of what is new, while it shows. */
  notice: Notice;
  /** The *Name this page* button, which the popup focuses when nothing else has the focus. */
  namePage: RefObject<HTMLButtonElement | null>;
  onNamePage(): void;
  onSettings(): void;
  onMessage(message: string | null): void;
}

export function FirstRun({ ready, confirmation, undoFooter, message, notice, namePage, onNamePage, onSettings, onMessage }: FirstRunProps) {
  const layout = useFitToViewport();
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const [focused, setFocused] = useState<'settings' | 'load' | 'shortcuts' | null>(null);

  const loadExample = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    onMessage(null);
    const reply = await send({ kind: 'load-example' });
    inFlight.current = false;
    setLoading(false);
    // Once stored, the document's change shows its mappings in search.
    if (reply.kind !== 'applied') onMessage(notLoaded(reply));
  };

  const footer =
    undoFooter ??
    (focused === 'load'
      ? loading
        ? 'Loading · Enter does nothing until it is stored'
        : 'Enter loads the example mappings'
      : focused === 'shortcuts'
        ? "Enter opens Chrome's shortcuts page"
        : focused === 'settings'
          ? 'Enter opens settings'
          : ready
          ? 'Enter opens the Name form'
          : 'Enter does nothing until the popup is ready');

  return (
    <main className="popup" ref={layout.root}>
      <header className="form-header">
        <h1 className="form-title">No mappings yet</h1>
        <SettingsGear onClick={onSettings} onFocusChange={(on) => setFocused(on ? 'settings' : null)} />
      </header>
      <UpgradeNotice notice={notice} start={namePage} />
      <div className="view" ref={layout.view} role="region" aria-label="Getting started">
        <div className="view-content" ref={layout.content}>
          {confirmation}
          {message !== null && (
            <p className="message" role="alert">
              {message}
            </p>
          )}
          <p className="first-run-intro">Give the page you are on a name to open it by, or load example mappings to see how they are written.</p>
          <div className="first-run-actions">
            <button ref={namePage} type="button" className="first-run-action name-first" onClick={onNamePage}>
              Name this page
            </button>
            <button
              type="button"
              className="first-run-action"
              aria-disabled={loading}
              onClick={() => void loadExample()}
              onFocus={() => setFocused('load')}
              onBlur={() => setFocused(null)}
            >
              Load example mappings
            </button>
          </div>
          <h2 className="first-run-heading">Shortcuts</h2>
          <div className="first-run-shortcuts">
            <Shortcuts onFocusChange={(on) => setFocused(on ? 'shortcuts' : null)} onMessage={onMessage} />
          </div>
        </div>
      </div>
      <footer className="footer">{footerWithNotice(footer, notice)}</footer>
    </main>
  );
}

function notLoaded(reply: Exclude<LoadExampleReply, { kind: 'applied' }>): string {
  if (reply.kind === 'not-empty') return 'The example mappings were not loaded: the document is no longer empty.';
  return `The example mappings were not loaded: nothing was stored. Chrome said: ${reply.message}`;
}
