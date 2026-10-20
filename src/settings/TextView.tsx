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
// The draft is kept by the worker as it is typed, with its base (G19; State `draft`; `draft-keeping.ts`), and
// goes once the stored document holds its text. As the view opens it offers a draft another view kept, to
// resume, text and base restored, or to discard (`DraftOffer`); one the stored document holds is dropped
// without asking. On the options page, Import's text arrives as the draft against the base the view loads,
// after asking whether to replace a kept draft with unsaved changes (G19, G20). A switch to the List view over
// unsaved changes asks first: save and switch, keep the draft and switch, or stay (`SwitchQuestion`; G19).
import { useEffect, useRef, useState } from 'react';
import { documentErrors, type DocumentError } from '../document/grammar';
import { textAreaLineStart } from '../document/lines';
import { mergeTexts, type MergePart } from '../document/merge';
import { documentHolds, isDraft, isNamed, nameOf, type Draft } from '../draft';
import { chromeMessage, send } from '../requests';
import { readMappings } from '../stored-document';
import { CopyTabUrl } from './CopyTabUrl';
import { discardDraft, draftRequestsAnswered, keepDraft, type DraftKeeping } from './draft-keeping';
import { DraftOffer } from './DraftOffer';
import { MergeOffer } from './MergeOffer';
import type { SettingsView, SettingsViewProps } from './settings-view';
import { SwitchQuestion } from './SwitchQuestion';
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

export function TextView({ sayWhatEnterDoes, caretLine, openerTab, imported, guardSwitch }: SettingsViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  // The stored document as the view last loaded it or saved it.
  const base = useRef('');
  // What the text area held after the last load or applied Save: while it still holds that, nothing is typed.
  // Null once a Save did not store: the text submitted is the user's, kept until a Save stores or the view
  // closes, so no read replaces it or the outcome said of it (G17).
  const loadedText = useRef<string | null>('');
  // Whether the text area has held the stored document, which it does from the first read on.
  const everLoaded = useRef(false);
  // The stored document as last read: the text holds no unsaved change while it is this (G19).
  const stored = useRef('');
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
  // The draft another Text view kept, offered as this one opens and followed in storage until the user resumes
  // or discards it, or asked about when Import's file waits; the text area takes no typing meanwhile.
  const [kept, setKept] = useState<Draft | null>(null);
  const keptNow = useRef<Draft | null>(null);
  // Import's file, taken once, until its text is in the text area: the name it is asked about by.
  const importing = useRef(imported ?? null);
  const [importingName, setImportingName] = useState(imported?.fileName ?? null);
  const mounted = useRef(false);
  const [discardFailure, setDiscardFailure] = useState<string | null>(null);
  // What Chrome said when the worker did not keep this view's draft, shown apart from what Save came to.
  const [notKept, setNotKept] = useState<string | null>(null);
  const keeping = useRef<DraftKeeping | null>(null);
  const firstCaretLine = useRef(caretLine);
  const readStored = useRef(() => {});
  // While a switch to the List view is asked about: the host's way to show it, once the user answers to switch.
  const switching = useRef<(() => void) | null>(null);
  // A switch to the List view made while Import's file waits to go into the text area: it waits with the file.
  const switchWithFile = useRef<(() => void) | null>(null);
  // Whether Chrome refused the first read, which leaves Import's file no base to go in against.
  const firstReadRefused = useRef(false);
  const [asking, setAsking] = useState(false);
  // What Enter does on the question's control that has the focus.
  const [questionSays, setQuestionSays] = useState<string | null>(null);

  // The document is read as the view opens and again after every change to it (State). A read that lands
  // while nothing is typed loads the stored document as both texts; one that lands over typing changes
  // neither, so the next Save is refused rather than overwriting what the view did not show (G18). Reads
  // that land during a Save are left to the read made after its reply. The first read also takes the kept
  // draft, and while one is offered every change to it is read too.
  useEffect(() => {
    let open = true;
    mounted.current = true;
    const keeper = keepDraft(
      (message) => {
        if (open) setNotKept(message);
      },
      () => void read(),
    );
    keeping.current = keeper;
    const landed = (storedText: string, draft: Draft | undefined) => {
      const area = textArea.current;
      if (!open || area === null) return;
      stored.current = storedText;
      if (!everLoaded.current) return firstShown(area, storedText, draft);
      if (keptNow.current !== null) follow(storedText, draft);
      if (inFlight.current) return;
      // Nothing typed since the load: the text area holds what it loaded, and the keeper keeps no text the loaded
      // document does not hold, as it keeps one typed back to a CRLF document's, with LF endings (S14, G19).
      if (storedText !== base.current && area.value === loadedText.current && !keeper.unsaved(base.current)) {
        const [start, end] = [area.selectionStart, area.selectionEnd];
        area.value = storedText;
        base.current = storedText;
        loadedText.current = area.value;
        area.setSelectionRange(Math.min(start, area.value.length), Math.min(end, area.value.length));
        setOutcome(null);
        keeper.settled();
      }
      // After any load above, which leaves nothing unsaved.
      switchUnasked();
    };
    let reads = 0;
    const read = async () => {
      const made = ++reads;
      // A Text view opened again in this page reads `draft` once the closed one's requests have landed (G19).
      if (!everLoaded.current) await draftRequestsAnswered();
      let items: Record<string, unknown>;
      // Storage answers with what it holds then or later, after every edit the keeper has been told of so far.
      const seen = keeper.reading();
      try {
        items = await chrome.storage.local.get(['mappings', 'draft']);
      } catch (error) {
        if (open && !everLoaded.current) {
          setOutcome({ kind: 'unread', message: chromeMessage(error) });
          firstReadRefused.current = true;
          settleSwitchWithFile(false);
        }
        return;
      }
      const storedText = readMappings(items.mappings);
      // Every answer tells the keeper whether the stored document held the text after it was made (G19), even
      // after the view has closed, except during a Save, whose reply is followed by a read. One answered after a
      // later read was made shows an older state than the later one, which lands instead.
      if (!inFlight.current) keeper.storedRead(storedText, seen, made === reads);
      if (made === reads) landed(storedText, isDraft(items.draft) ? items.draft : undefined);
    };
    readStored.current = () => void read();
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area !== 'local') return;
      if ('mappings' in changes || ('draft' in changes && (!everLoaded.current || keptNow.current !== null))) void read();
    };
    // Leaving the page sends what is not yet sent, where Chrome lets the page finish it.
    const leaving = () => void keeper.flush();
    chrome.storage.onChanged.addListener(changed);
    window.addEventListener('pagehide', leaving);
    void read();
    return () => {
      open = false;
      mounted.current = false;
      chrome.storage.onChanged.removeListener(changed);
      window.removeEventListener('pagehide', leaving);
      // Leaving the view while the page stays open, by Back or for another view, sends what is not yet sent (G19).
      void keeper.flush();
    };
  }, []);

  // A switch to the List view (by its id in `views.ts`, which lists this view) over unsaved changes, as the
  // keeper of the draft tells them, waits on the user's answer (G19); any other switch, and one with nothing
  // unsaved, goes at once, and the view's leaving keeps the draft, as a return to search does. Import's file is
  // an unsaved change the keeper is told of only once it is in the text area (G20): until then a switch to the
  // List view waits with it, so the file is never dropped unasked.
  useEffect(() => {
    const mayAsk = (to: SettingsView) => to.id === 'list';
    guardSwitch?.({
      mayAsk,
      switching: (to, proceed) => {
        if (mayAsk(to) && fileWaitsForView()) {
          switchWithFile.current = proceed;
          return;
        }
        if (!mayAsk(to) || keeping.current?.unsaved(stored.current) !== true) return proceed();
        switching.current = proceed;
        setAsking(true);
      },
    });
    return () => guardSwitch?.(null);
  }, [guardSwitch]);

  // The first read: the stored document as both texts, and a kept draft offered, or asked about when Import's
  // file waits; with no kept draft, Import's file is the draft against the stored document as its base (G20). A
  // kept draft the stored document holds is no unsaved change and goes without asking (How G19).
  const firstShown = (area: HTMLTextAreaElement, storedText: string, draft: Draft | undefined) => {
    everLoaded.current = true;
    base.current = storedText;
    area.value = storedText;
    loadedText.current = area.value;
    const line = firstCaretLine.current;
    if (draft !== undefined && !documentHolds(storedText, draft.text)) showKept(draft);
    else {
      // With a draft to drop, Import's file waits for the drop.
      if (draft !== undefined) drop(draft);
      else takeImport();
      if (importing.current === null) placeCaret(area, line === undefined ? 0 : textAreaLineStart(storedText, line), line !== undefined);
    }
    setLoaded(true);
  };

  const showKept = (draft: Draft) => {
    keptNow.current = draft;
    setKept(draft);
    // A kept draft found as Import's file waits is asked about first: a switch the file held gives way to it.
    switchWithFile.current = null;
  };

  // A kept draft the stored document holds goes without asking (How G19), by its name alone: read with it, the
  // document held its text after it was typed, so a change landing since leaves it no unsaved edit. Import's file
  // goes in once the draft has gone.
  const drop = (draft: Draft) => {
    void discardDraft(nameOf(draft)).then(() => {
      if (mounted.current && importing.current !== null && keptNow.current === null) takeImport();
    });
  };

  // Import's file goes into the text area as the draft, against the base the view loaded; nothing is stored.
  // Its edit is made when the user imported, or when they chose to replace a kept draft with it, so a draft typed
  // since in another view stays the newer one (Composition, *draft set*).
  const takeImport = (madeAt = importing.current?.time) => {
    const area = textArea.current;
    const file = importing.current;
    if (area === null || file === null) return;
    importing.current = null;
    setImportingName(null);
    area.value = file.text;
    loadedText.current = null;
    keeping.current?.edited(area.value, base.current, stored.current, madeAt);
    void keeping.current?.flush();
    placeCaret(area, 0, true);
    settleSwitchWithFile(true);
  };

  // Whether Import's file waits for the view, not for the user's answer about a kept draft: for the first read
  // to give it a base, or for a kept draft the stored document holds to be dropped.
  const fileWaitsForView = () => importing.current !== null && keptNow.current === null && !firstReadRefused.current;

  // A switch the file held, now that the file is the draft (`asks`) or cannot be: it asks over unsaved text as
  // any switch to the List view does, else goes.
  const settleSwitchWithFile = (asks: boolean) => {
    const proceed = switchWithFile.current;
    if (proceed === null) return;
    switchWithFile.current = null;
    if (!asks || keeping.current?.unsaved(stored.current) !== true) return proceed();
    switching.current = proceed;
    setAsking(true);
  };

  // While a kept draft is offered or asked about, it is the draft stored now: withdrawn once there is none, or
  // dropped once the stored document holds its text.
  const follow = (storedText: string, draft: Draft | undefined) => {
    if (draft !== undefined && !documentHolds(storedText, draft.text)) return showKept(draft);
    withdraw();
    if (draft !== undefined) drop(draft);
    else takeImport();
  };

  // The offer goes; if it had the focus, the text area takes it, the caret on the fragment's line.
  const withdraw = () => {
    const area = textArea.current;
    const hadFocus = root.current?.querySelector('.draft-offer')?.contains(document.activeElement) === true;
    keptNow.current = null;
    setKept(null);
    setDiscardFailure(null);
    const line = firstCaretLine.current;
    if (area !== null && hadFocus) placeCaret(area, line === undefined ? 0 : textAreaLineStart(area.value, line), true);
  };

  // The draft's own text and base: the base it was typed against, so a Save over a document changed since is
  // refused and reaches the merge rather than overwriting that change (G18).
  const resume = () => {
    const area = textArea.current;
    const draft = keptNow.current;
    if (area === null || draft === null) return;
    area.value = draft.text;
    base.current = draft.base;
    // The resumed text is the user's: no read replaces it, as after a Save that did not store.
    loadedText.current = null;
    keeping.current?.holds(draft);
    withdraw();
  };

  const discardKept = async () => {
    const draft = keptNow.current;
    if (draft === null) return;
    setDiscardFailure(null);
    const reply = await discardDraft(nameOf(draft));
    // An offer that has since followed a newer draft stays: the user discarded the one shown before.
    if (!isNamed(keptNow.current ?? undefined, draft)) return;
    if (reply.kind === 'storage-failed') setDiscardFailure(reply.message);
    else withdraw();
  };

  // Import's file replaces the kept draft the user was asked about, which a discard then names until the
  // view's own draft is stored.
  const replaceWithImport = () => {
    const draft = keptNow.current;
    if (draft === null) return;
    keeping.current?.holds(draft);
    keptNow.current = null;
    setKept(null);
    takeImport(Date.now());
  };

  // Kept, the draft is offered as any kept draft is, and Import's file goes nowhere.
  const keepInsteadOfImport = () => {
    importing.current = null;
    setImportingName(null);
  };

  // What the text area holds is kept as the draft, with the base it is typed against; once the stored document
  // holds it, the draft goes instead (G19).
  const keepText = () => {
    const area = textArea.current;
    if (area !== null) keeping.current?.edited(area.value, base.current, stored.current);
  };

  // Whether the Save stored the text.
  const save = async (): Promise<boolean> => {
    const area = textArea.current;
    if (area === null || !everLoaded.current || inFlight.current || offer !== null || keptNow.current !== null || importing.current !== null || switching.current !== null) return false;
    const text = area.value;
    const errors = documentErrors(text);
    if (errors.length > 0) {
      loadedText.current = null;
      setOutcome({ kind: 'errors', errors });
      return false;
    }
    inFlight.current = true;
    setSaving(true);
    setOutcome(null);
    // The text submitted is the draft first, so a Save refused, or cut short by the popup closing, leaves it kept.
    await keeping.current?.flush();
    const reply = await send({ kind: 'replace', text, base: base.current });
    inFlight.current = false;
    setSaving(false);
    loadedText.current = reply.kind === 'applied' ? text : null;
    if (reply.kind === 'applied') {
      base.current = text;
      keeping.current?.settled();
      setOutcome({ kind: 'saved' });
      switchUnasked();
    } else if (reply.kind === 'invalid') setOutcome({ kind: 'errors', errors: documentErrors(text) });
    else if (reply.kind === 'changed') {
      setOutcome({ kind: 'changed' });
      setOffer({ parts: mergeTexts(base.current, text, reply.document), stored: reply.document });
    }
    // Chrome refused the write, or no reply came and it may have landed: either way the texts stay as they
    // were, so the next Save applies if nothing landed and is refused if it did, never overwriting it (G21).
    else setOutcome({ kind: 'failed', message: reply.message });
    readStored.current();
    return reply.kind === 'applied';
  };

  // The question's answers. *Save and switch* is the view's own Save, and the switch follows only once it stored
  // the text; else the view stays as a plain Save leaves it, the focus on Save (G17, G18, G21). *Stay* gives the
  // focus back to the text area, the caret where it was.
  const saveAndSwitch = async () => {
    const proceed = switching.current;
    if (proceed === null || saveWaits) return;
    switching.current = null;
    setAsking(false);
    saveButton.current?.focus();
    if ((await save()) && mounted.current) proceed();
  };
  const keepAndSwitch = () => switching.current?.();
  const stay = () => {
    switching.current = null;
    setAsking(false);
    textArea.current?.focus();
  };
  // A question whose text the stored document comes to hold, as a Save in flight as it was asked stores it, has
  // nothing left to ask: it goes, and the switch goes ahead, as one with nothing unsaved does (G19).
  const switchUnasked = () => {
    const proceed = switching.current;
    if (proceed === null || keeping.current?.unsaved(stored.current) === true) return;
    switching.current = null;
    setAsking(false);
    proceed();
  };

  // The merge, with the versions chosen, becomes the draft and the stored text it merged the base, so the next
  // Save stores both sides' changes, or is refused again if the document changed since. Nothing is stored here.
  // It is an edit: the kept draft takes the new base even when the text is as it was, so a draft resumed later
  // is not merged again against the old one.
  const bringIn = (merged: string) => {
    const area = textArea.current;
    if (area === null || offer === null) return;
    area.value = merged;
    base.current = offer.stored;
    setOffer(null);
    setOutcome({ kind: 'merged' });
    placeCaret(area, 0, true);
    keepText();
  };

  // The caret at the start of `line` of the text as the text area holds it now, the line in view (G17).
  const showLine = (line: number) => {
    const area = textArea.current;
    if (area !== null) placeCaret(area, textAreaLineStart(area.value, line), true);
  };

  const waiting = kept === null ? (importingName === null ? null : 'import') : importingName === null ? 'offer' : 'question';
  const saveWaits = !loaded || saving || offer !== null || waiting !== null;
  const enter = questionSays ?? offerSays ?? whatEnterDoes(focused, { loaded, saving, offered: offer !== null, waiting, asking });
  useEffect(() => sayWhatEnterDoes?.(enter), [enter, sayWhatEnterDoes]);

  return (
    <div className="text-view" ref={root}>
      {asking && (
        <SwitchQuestion
          saveWaits={saveWaits ? whatEnterDoes('save', { loaded, saving, offered: offer !== null, waiting, asking: false }) : null}
          onSave={() => void saveAndSwitch()}
          onKeep={keepAndSwitch}
          onStay={stay}
          onSayEnter={setQuestionSays}
        />
      )}
      <p className="settings-text" id="text-view-hint">
        One mapping per line: a name, spaces, and a URL that starts with a scheme, as https: does. A backslash (\) starts a comment, and a line
        of only a comment is a section heading. %s in a URL takes the text typed after the name.
      </p>
      {kept !== null && (
        <DraftOffer
          // Asked about Import's file, then offered: shown afresh, so the focus is on its first answer again.
          key={importingName === null ? 'offer' : 'import'}
          draft={kept}
          importing={importingName}
          changedSince={kept.base !== stored.current}
          failure={discardFailure}
          onResume={resume}
          onDiscard={() => void discardKept()}
          onReplace={replaceWithImport}
          onKeep={keepInsteadOfImport}
          onSayEnter={setOfferSays}
        />
      )}
      <textarea
        ref={textArea}
        className="text-view-area"
        aria-label="Document"
        aria-describedby="text-view-hint"
        wrap="off"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        // Read-only until it holds the stored document, from Save until the worker's reply, while a change is
        // offered, whose merge is of the text submitted, while a kept draft is offered, until Import's file is in,
        // and while a switch to the List view is asked about.
        readOnly={saveWaits || asking}
        onInput={() => {
          keepText();
          setOutcome((shown) => (shown?.kind === 'saved' ? null : shown));
        }}
        onFocus={() => setFocused('text')}
        onBlur={() => setFocused(null)}
      />
      <div className="settings-action">
        <button
          ref={saveButton}
          type="button"
          className="settings-button"
          aria-disabled={saveWaits || asking}
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
      {notKept !== null && (
        <p className="settings-alert" role="alert">
          Your unsaved text is not kept for later, so it is lost if this view closes; it is still here to save. Chrome said: {notKept}
        </p>
      )}
      {offer !== null && <MergeOffer parts={offer.parts} onBringIn={bringIn} onSayEnter={setOfferSays} />}
      {outcome?.kind === 'errors' && <TextErrors errors={outcome.errors} onShow={showLine} onFocusLine={(line) => setFocused(line === null ? null : { line })} />}
    </div>
  );
}

/**
 * What Enter does where the focus is (L2), given whether the document is read, a Save is under way, a change is
 * offered, what the view waits for: a kept draft offered, asked about for Import, or Import's file going in, and
 * whether a switch to the List view is asked about.
 */
function whatEnterDoes(
  focused: Focused,
  { loaded, saving, offered, waiting, asking }: { loaded: boolean; saving: boolean; offered: boolean; waiting: 'offer' | 'question' | 'import' | null; asking: boolean },
): string {
  if (focused === null) return 'Enter does nothing';
  if (focused === 'copy') return "Enter copies the tab's address";
  if (typeof focused === 'object') return `Enter moves the caret to line ${focused.line}`;
  if (!loaded) return 'Enter does nothing until the document is read';
  if (saving) return 'Saving · Enter does nothing until it is stored';
  if (offered) return 'Enter does nothing until the change is brought in';
  if (waiting === 'offer') return 'Enter does nothing until the unsaved text is resumed or discarded';
  if (waiting === 'question') return 'Enter does nothing until the unsaved text is kept or replaced';
  if (waiting === 'import') return 'Enter does nothing until the file is in';
  if (asking) return 'Enter does nothing until the switch to List is answered';
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
