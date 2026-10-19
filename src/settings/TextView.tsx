// The Text view (In use, "Edit the text", "The most common failure"; G16, G17, G18, G21, G31; Composition,
// "Settings views"): the whole stored document in a native text area with a short grammar hint, and Save.
// The view holds two texts: the draft, which is what the text area holds, and the base, the stored string
// exactly as read (CRLF endings and all, empty when absent), never taken from the text area, which turns CRLF
// into LF (S14). The base moves only when the view loads the stored document, after an applied Save, and when
// a change is brought in, so the worker's check that the stored document is still the base keeps a Save from
// overwriting a change the view did not take in (G18). Save validates the draft with the document module and
// stores it, through the worker's *replace*, exactly as the text area holds it, or stores nothing and lists
// every error by its line. Refused because the stored document changed, it offers to bring that change into
// the draft (`MergeOffer`), the text area read-only until it is brought in, since the merge is of the text
// submitted. In the popup it also offers *Copy tab URL*.
import { useEffect, useRef, useState } from 'react';
import { documentErrors, type DocumentError } from '../document/grammar';
import { textAreaLineStart } from '../document/lines';
import { mergeTexts, type MergePart } from '../document/merge';
import { chromeMessage, send } from '../requests';
import { CopyTabUrl } from './CopyTabUrl';
import { MergeOffer } from './MergeOffer';
import type { SettingsViewProps } from './settings-view';
import { TextErrors } from './TextErrors';
import './settings.css';
import './text-view.css';

/** What the last Save came to, or why the document could not be read; shown until the next Save. */
type Outcome =
  | { kind: 'saved' }
  | { kind: 'errors'; errors: DocumentError[] }
  | { kind: 'changed' }
  | { kind: 'merged' }
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
  // After a Save refused as `changed`, until the change is brought in: the merge of the text submitted with the
  // stored text the reply carried, which becomes the base when the merge is brought in (G18).
  const [offer, setOffer] = useState<{ parts: MergePart[]; stored: string } | null>(null);
  // What Enter does on the offer's control that has the focus.
  const [offerSays, setOfferSays] = useState<string | null>(null);
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
    if (area === null || !everLoaded.current || inFlight.current || offer !== null) return;
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
    else if (reply.kind === 'changed') {
      setOutcome({ kind: 'changed' });
      setOffer({ parts: mergeTexts(base.current, text, reply.document), stored: reply.document });
    }
    // Chrome refused the write, or no reply came and it may have landed: either way the texts stay as they
    // were, so the next Save applies if nothing landed and is refused if it did, never overwriting it (G21).
    else setOutcome({ kind: 'failed', message: reply.message });
    readStored.current();
  };

  // The merge, with the versions chosen, becomes the draft and the stored text it merged the base, so the next
  // Save stores both sides' changes, or is refused again if the document changed since. Nothing is stored here.
  const bringIn = (merged: string) => {
    const area = textArea.current;
    if (area === null || offer === null) return;
    area.value = merged;
    base.current = offer.stored;
    setOffer(null);
    setOutcome({ kind: 'merged' });
    placeCaret(area, 0, true);
  };

  // The caret at the start of `line` of the text as the text area holds it now, the line in view (G17).
  const showLine = (line: number) => {
    const area = textArea.current;
    if (area !== null) placeCaret(area, textAreaLineStart(area.value, line), true);
  };

  const enter = offerSays ?? whatEnterDoes(focused, { loaded, saving, offered: offer !== null });
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
        // Read-only until it holds the stored document, from Save until the worker's reply, and while a change
        // is offered, whose merge is of the text submitted.
        readOnly={!loaded || saving || offer !== null}
        onInput={() => setOutcome((shown) => (shown?.kind === 'saved' ? null : shown))}
        onFocus={() => setFocused('text')}
        onBlur={() => setFocused(null)}
      />
      <div className="settings-action">
        <button
          type="button"
          className="settings-button"
          aria-disabled={!loaded || saving || offer !== null}
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
      {offer !== null && <MergeOffer parts={offer.parts} onBringIn={bringIn} onSayEnter={setOfferSays} />}
      {outcome?.kind === 'errors' && <TextErrors errors={outcome.errors} onShow={showLine} onFocusLine={(line) => setFocused(line === null ? null : { line })} />}
    </div>
  );
}

/** What Enter does where the focus is (L2), given whether the document is read, a Save is under way, and a change is offered. */
function whatEnterDoes(focused: Focused, { loaded, saving, offered }: { loaded: boolean; saving: boolean; offered: boolean }): string {
  if (focused === null) return 'Enter does nothing';
  if (focused === 'copy') return "Enter copies the tab's address";
  if (typeof focused === 'object') return `Enter moves the caret to line ${focused.line}`;
  if (!loaded) return 'Enter does nothing until the document is read';
  if (saving) return 'Saving · Enter does nothing until it is stored';
  if (offered) return 'Enter does nothing until the change is brought in';
  return focused === 'text' ? 'Enter starts a new line' : 'Enter saves the text';
}

function outcomeText(outcome: Outcome): string {
  switch (outcome.kind) {
    case 'saved':
      return 'Saved';
    case 'errors':
      return 'Not saved';
    case 'changed':
      return 'Not saved: the stored document changed after this text was loaded, in another view or window. Your text is kept as you typed it.';
    case 'merged':
      return "The stored document's change is in your text. It is not stored until you save.";
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
