// The Text view (In use, "Edit the text", "The most common failure"; G16, G17, G18, G21, G31; Composition,
// "Settings views"): the whole stored document in a native text area with a short grammar hint, and Save.
// The view holds two texts: the draft, which is what the text area holds, and the base, the stored string
// exactly as read (CRLF endings and all, empty when absent), never taken from the text area, which turns CRLF
// into LF (S14). The base moves only when the view loads the stored document and after an applied Save, so
// the worker's check that the stored document is still the base keeps a Save from overwriting a change the
// view did not take in (G18). Save validates the draft with the document module and stores it, through the
// worker's *replace*, exactly as the text area holds it, or stores nothing and lists every error by its line.
// In the popup it also offers *Copy tab URL*.
import { useEffect, useRef, useState } from 'react';
import { documentErrors, type DocumentError } from '../document/grammar';
import { textAreaLineStart } from '../document/lines';
import { chromeMessage, send } from '../requests';
import { CopyTabUrl } from './CopyTabUrl';
import type { SettingsViewProps } from './settings-view';
import { TextErrors } from './TextErrors';
import './settings.css';
import './text-view.css';

/** What the last Save came to, or why the document could not be read; shown until the next Save. */
type Outcome =
  | { kind: 'saved' }
  | { kind: 'errors'; errors: DocumentError[] }
  | { kind: 'changed' }
  | { kind: 'failed'; message: string }
  | { kind: 'unread'; message: string };

/** Where the focus is among the view's controls, which says what Enter does: an error by its line. */
type Focused = 'text' | 'save' | 'copy' | { line: number } | null;

export function TextView({ sayWhatEnterDoes, caretLine, openerTab }: SettingsViewProps) {
  const textArea = useRef<HTMLTextAreaElement>(null);
  // The stored document as the view last loaded it or saved it.
  const base = useRef('');
  // What the text area held after the last load or applied Save: while it still holds that, nothing is typed.
  // Null once a Save did not store: the text submitted is the user's, kept until a Save stores or the view
  // closes, so no read replaces it or the outcome said of it (G17).
  const loadedText = useRef<string | null>('');
  // Whether the text area has held the stored document, which it does from the first read on.
  const everLoaded = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [focused, setFocused] = useState<Focused>(null);
  const firstCaretLine = useRef(caretLine);
  const readStored = useRef(() => {});

  // The document is read as the view opens and again after every change to it (State). A read that lands
  // while nothing is typed loads the stored document as both texts; one that lands over typing changes
  // neither, so the next Save is refused rather than overwriting what the view did not show (G18). Reads
  // that land during a Save are left to the read made after its reply.
  useEffect(() => {
    let open = true;
    const landed = (stored: string) => {
      const area = textArea.current;
      if (!open || area === null || inFlight.current) return;
      const first = !everLoaded.current;
      if (!first && (stored === base.current || area.value !== loadedText.current)) return;
      const [start, end] = [area.selectionStart, area.selectionEnd];
      area.value = stored;
      base.current = stored;
      loadedText.current = area.value;
      if (first) {
        everLoaded.current = true;
        placeCaret(area, firstCaretLine.current === undefined ? 0 : textAreaLineStart(stored, firstCaretLine.current), firstCaretLine.current !== undefined);
        setLoaded(true);
      } else {
        area.setSelectionRange(Math.min(start, area.value.length), Math.min(end, area.value.length));
        setOutcome(null);
      }
    };
    const read = () =>
      chrome.storage.local.get('mappings').then(
        ({ mappings }) => landed(typeof mappings === 'string' ? mappings : ''),
        (error: unknown) => {
          if (open && !everLoaded.current) setOutcome({ kind: 'unread', message: chromeMessage(error) });
        },
      );
    readStored.current = () => void read();
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && 'mappings' in changes) void read();
    };
    chrome.storage.onChanged.addListener(changed);
    void read();
    return () => {
      open = false;
      chrome.storage.onChanged.removeListener(changed);
    };
  }, []);

  const save = async () => {
    const area = textArea.current;
    if (area === null || !everLoaded.current || inFlight.current) return;
    const text = area.value;
    const errors = documentErrors(text);
    if (errors.length > 0) {
      loadedText.current = null;
      setOutcome({ kind: 'errors', errors });
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setOutcome(null);
    const reply = await send({ kind: 'replace', text, base: base.current });
    inFlight.current = false;
    setSaving(false);
    loadedText.current = reply.kind === 'applied' ? text : null;
    if (reply.kind === 'applied') {
      base.current = text;
      setOutcome({ kind: 'saved' });
    } else if (reply.kind === 'invalid') setOutcome({ kind: 'errors', errors: documentErrors(text) });
    else if (reply.kind === 'changed') setOutcome({ kind: 'changed' });
    // Chrome refused the write, or no reply came and it may have landed: either way the texts stay as they
    // were, so the next Save applies if nothing landed and is refused if it did, never overwriting it (G21).
    else setOutcome({ kind: 'failed', message: reply.message });
    readStored.current();
  };

  // The caret at the start of `line` of the text as the text area holds it now, the line in view (G17).
  const showLine = (line: number) => {
    const area = textArea.current;
    if (area !== null) placeCaret(area, textAreaLineStart(area.value, line), true);
  };

  const enter =
    focused === 'text'
      ? !loaded
        ? 'Enter does nothing until the document is read'
        : saving
          ? 'Saving · Enter does nothing until it is stored'
          : 'Enter starts a new line'
      : focused === 'save'
        ? saving
          ? 'Saving · Enter does nothing until it is stored'
          : loaded
            ? 'Enter saves the text'
            : 'Enter does nothing until the document is read'
        : focused === 'copy'
          ? "Enter copies the tab's address"
          : focused !== null
            ? `Enter moves the caret to line ${focused.line}`
            : 'Enter does nothing';
  useEffect(() => sayWhatEnterDoes?.(enter), [enter, sayWhatEnterDoes]);

  return (
    <div className="text-view">
      <p className="settings-text" id="text-view-hint">
        One mapping per line: a name, spaces, and a URL that starts with a scheme, as https: does. A backslash (\) starts a comment, and a line
        of only a comment is a section heading. %s in a URL takes the text typed after the name.
      </p>
      <textarea
        ref={textArea}
        className="text-view-area"
        aria-label="Document"
        aria-describedby="text-view-hint"
        wrap="off"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        // Read-only until it holds the stored document, and from Save until the worker's reply.
        readOnly={!loaded || saving}
        onInput={() => setOutcome((shown) => (shown?.kind === 'saved' ? null : shown))}
        onFocus={() => setFocused('text')}
        onBlur={() => setFocused(null)}
      />
      <div className="settings-action">
        <button
          type="button"
          className="settings-button"
          aria-disabled={!loaded || saving}
          onClick={() => void save()}
          onFocus={() => setFocused('save')}
          onBlur={() => setFocused(null)}
        >
          Save
        </button>
        {openerTab && <CopyTabUrl url={openerTab.url} onFocusChange={(on) => setFocused(on ? 'copy' : null)} />}
      </div>
      <p className="text-view-status" role="status">
        {saving ? 'Saving…' : outcome === null ? '' : outcomeText(outcome)}
      </p>
      {outcome?.kind === 'errors' && <TextErrors errors={outcome.errors} onShow={showLine} onFocusLine={(line) => setFocused(line === null ? null : { line })} />}
    </div>
  );
}

function outcomeText(outcome: Outcome): string {
  switch (outcome.kind) {
    case 'saved':
      return 'Saved';
    case 'errors':
      return 'Not saved';
    case 'changed':
      return 'Not saved: the stored document changed after this text was loaded, in another view or window. Your text is kept as you typed it.';
    case 'failed':
      return `Not saved: your text is kept as you typed it. Chrome said: ${outcome.message}`;
    case 'unread':
      return `The document could not be read. Chrome said: ${outcome.message}`;
  }
}

/**
 * Puts the caret at offset `at` of the text area's text, a line's start, with that line in the text area's
 * visible box; with `focus`, the text area takes the focus first and is scrolled whole into view. Its lines
 * do not wrap, so the line's top is its row times the line height.
 */
function placeCaret(area: HTMLTextAreaElement, at: number, focus: boolean) {
  if (focus) {
    area.focus();
    area.scrollIntoView({ block: 'nearest' });
  }
  area.setSelectionRange(at, at);
  const style = getComputedStyle(area);
  const lineHeight = parseFloat(style.lineHeight);
  let row = 0;
  for (let next = area.value.indexOf('\n'); next !== -1 && next < at; next = area.value.indexOf('\n', next + 1)) row++;
  const top = parseFloat(style.paddingTop) + row * lineHeight;
  if (top < area.scrollTop || top + lineHeight > area.scrollTop + area.clientHeight) area.scrollTop = Math.max(0, top - (area.clientHeight - lineHeight) / 2);
  area.scrollLeft = 0;
}
