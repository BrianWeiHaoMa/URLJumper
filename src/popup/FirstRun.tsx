// The first-run state (In use, "First run"; G30): while the document is absent or holds only whitespace, the
// popup shows it in place of search: *Name this page*, selected so Enter starts it, *Load example mappings*,
// which has the worker store F11's example document, and the shortcuts as Chrome reports them now, with the
// way to Chrome's page for changing them (E6). A footer says what Enter does.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { chromeMessage, send, type LoadExampleReply } from '../requests';
import { useFitToViewport } from './fit-to-viewport';
import './first-run.css';

/** Chrome's page for changing extensions' shortcuts. An extension page's link to it opens nothing, so a button opens it in a tab. */
const SHORTCUTS_PAGE = 'chrome://extensions/shortcuts';
/** F5's commands, in its order. */
const COMMANDS = ['open-new-tab', 'open-same-tab', 'name-this-page'];

interface FirstRunProps {
  /** Whether the popup knows the page it names yet, so that *Name this page* opens the form. */
  ready: boolean;
  /** The last change's confirmation, with its Undo, while it lives. */
  confirmation: ReactNode;
  /** What Enter does while the confirmation's Undo has the focus; undefined while it does not. */
  undoFooter: string | undefined;
  /** Why the last attempt did nothing, until the next. */
  message: string | null;
  /** The *Name this page* button, which the popup focuses when nothing else has the focus. */
  namePage: RefObject<HTMLButtonElement | null>;
  onNamePage(): void;
  onMessage(message: string | null): void;
}

export function FirstRun({ ready, confirmation, undoFooter, message, namePage, onNamePage, onMessage }: FirstRunProps) {
  const layout = useFitToViewport();
  const [shortcuts, setShortcuts] = useState<chrome.commands.Command[]>([]);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const [focused, setFocused] = useState<'load' | 'shortcuts' | null>(null);

  // The keys Chrome has assigned now, never the suggested ones, which Chrome may have left unassigned (E6).
  useEffect(() => {
    void chrome.commands.getAll().then((all) => setShortcuts(COMMANDS.flatMap((name) => all.filter((command) => command.name === name))));
  }, []);

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

  const openShortcutsPage = () => {
    chrome.tabs.create({ url: SHORTCUTS_PAGE }).catch((error: unknown) => onMessage(`Chrome's shortcuts page did not open. Chrome said: ${chromeMessage(error)}`));
  };

  const footer =
    undoFooter ??
    (focused === 'load'
      ? loading
        ? 'Loading · Enter does nothing until it is stored'
        : 'Enter loads the example mappings'
      : focused === 'shortcuts'
        ? "Enter opens Chrome's shortcuts page"
        : ready
          ? 'Enter opens the Name form'
          : 'Enter does nothing until the popup is ready');

  return (
    <main className="popup" ref={layout.root}>
      <header className="form-header">
        <h1 className="form-title">No mappings yet</h1>
      </header>
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
          <dl className="shortcuts">
            {shortcuts.map((command) => (
              <div key={command.name} className="shortcut">
                <dt>{command.description}</dt>
                <dd>{command.shortcut || 'Not set'}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            className="first-run-action"
            onClick={openShortcutsPage}
            onFocus={() => setFocused('shortcuts')}
            onBlur={() => setFocused(null)}
          >
            Change shortcuts in Chrome
          </button>
        </div>
      </div>
      <footer className="footer">{footer}</footer>
    </main>
  );
}

function notLoaded(reply: Exclude<LoadExampleReply, { kind: 'applied' }>): string {
  if (reply.kind === 'not-empty') return 'The example mappings were not loaded: the document is no longer empty.';
  return `The example mappings were not loaded: nothing was stored. Chrome said: ${reply.message}`;
}
