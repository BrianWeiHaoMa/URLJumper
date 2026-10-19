// The popup (In use, "Jump", "Name this page", "Name from a search", "Name a link", "First run"): search,
// with the search box and the mode chip, the confirmation of the last change with its Undo, the list seven
// rows at a time with a cue for the rest, what the page is called (G10), and the *Name this page* button; the
// Name form, also opened for a command or a menu item that asked for it; or, while the document is empty,
// the first-run state in search's place (G30). A footer says what Enter does. Everything shown derives from
// storage, read when the popup opens and again after every change; a mapping opens only through the worker's
// jump, sent from the popup's Enter handler or a row's click handler (R4), never from anything else.
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type MouseEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { flushSync } from 'react-dom';
import { isArgumentAlias } from '../document/argument';
import { isEmptyDocument } from '../document/example';
import { readDocument } from '../document/grammar';
import { mappingOfPage } from '../document/page-mapping';
import type { SearchOrder, SearchRow } from '../document/search';
import type { Usage } from '../document/score';
import { intentFor, startMode, type OpenIntent, type OpenMode } from '../open-intent';
import { applyTheme, readSearchOrder, readTheme, type Theme } from '../preferences';
import { send, type JumpReply, type JumpRequest } from '../requests';
import { Confirmation, offersUndo, undoFooter, useConfirmationLifetime, useUndo, type Confirmed, type Outcome } from './Confirmation';
import { FirstRun } from './FirstRun';
import { move, newList, outsideWindow, relist, scroll, WINDOW_ROWS, type ListState } from './list-state';
import { NameForm, type NameSubject, type Saved } from './NameForm';
import { Row, rowId } from './Row';
import { useFitToViewport } from './fit-to-viewport';

interface Stored {
  document: string;
  order: SearchOrder;
  usage: Usage | undefined;
  theme: Theme;
}

/** The tab the popup was opened on: its id and window, and its address and title when Chrome granted them (E5). */
interface Opener {
  tabId: number | undefined;
  windowId: number | undefined;
  url: string | undefined;
  title: string | undefined;
  mode: OpenMode;
  /** What the honored record asked the Name form to name, until the form has opened for it. */
  asks: NameSubject | undefined;
}

/** Search, or the Name form opened with a name to start with; `opened` counts the openings, so each starts afresh. */
type View = { kind: 'search' } | { kind: 'name'; name: string; subject: NameSubject; opened: number };

interface State {
  /** What storage held at the last read; undefined until the first read. */
  stored: Stored | undefined;
  /** Undefined until the tab and the mode its opening asked for are known. */
  opener: Opener | undefined;
  view: View;
  typed: string;
  list: ListState;
  mode: OpenMode;
  /** The control in search whose focus changes what Enter does, if one has it. */
  focused: 'chip' | 'name-page' | 'undo' | null;
  /** Why the last jump did not open, or the example mappings were not loaded; kept until the user types or tries again. */
  message: string | null;
  /** The last change's confirmation, a save's or an Undo's, until its lifetime ends (G15). */
  confirmed: Confirmed | null;
  /** How many confirmations and form openings there have been. */
  count: number;
}

type MappingRow = Exclude<SearchRow, { group: 'name' }>;

type Action =
  | { kind: 'stored'; stored: Stored; now: number }
  | { kind: 'opener'; opener: Opener; now: number }
  | { kind: 'typed'; typed: string; now: number }
  | { kind: 'move'; step: 1 | -1 }
  | { kind: 'scroll'; rows: number }
  | { kind: 'flip' }
  | { kind: 'focused'; focused: State['focused'] }
  | { kind: 'message'; message: string | null }
  | { kind: 'name'; name: string }
  | { kind: 'cancel' }
  | { kind: 'saved'; saved: Saved; now: number }
  | { kind: 'undone'; outcome: Outcome }
  | { kind: 'confirmation-ended'; id: number };

const STORED_KEYS = ['mappings', 'usage', 'searchOrder', 'themePref'];
const NO_ROWS: ListState = { rows: [], blank: true, selected: null, top: 0 };
const MODE_LABEL: Record<OpenMode, string> = { 'new-tab': 'New tab', 'this-tab': 'This tab' };
// Pixels of wheel movement that move the window by one row.
const WHEEL_ROW_PIXELS = 40;

export function Popup() {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const wheel = useRef(0);
  const layout = useFitToViewport();
  const searchBox = useRef<HTMLInputElement>(null);
  const namePage = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const endConfirmation = useCallback((id: number) => dispatch({ kind: 'confirmation-ended', id }), []);
  useConfirmationLifetime(state.confirmed, endConfirmation, confirmation);
  const { undo, undoing } = useUndo(state.confirmed, (outcome) => dispatch({ kind: 'undone', outcome }));

  const ready = state.stored !== undefined && state.opener !== undefined;
  // Shown only once the popup knows whether it opened for the Name form, so keys typed until then go to the search box.
  const firstRun = ready && state.view.kind === 'search' && isEmptyDocument(state.stored!.document);

  // Focus taken away with what held it gives it to the view's first control instead of to nothing (G32): Undo
  // going with its confirmation or for a refusal, or the view switching between search and the first run. An
  // Undo still offered there takes it back.
  useLayoutEffect(() => {
    if (document.activeElement !== document.body) return;
    if (state.focused === 'undo') confirmation.current?.querySelector('button')?.focus();
    else (firstRun ? namePage : searchBox).current?.focus();
  }, [state.confirmed, firstRun]);

  useEffect(() => {
    // Every read asks for the keys again, and Chrome answers reads in the order they were made, so the last
    // answer shows the latest change, whenever its event arrived. Drawn before the next key arrives (flushSync),
    // so a Name form these open has the keyboard from then on.
    const read = () =>
      chrome.storage.local.get(STORED_KEYS).then((items) => flushSync(() => dispatch({ kind: 'stored', stored: readStored(items), now: Date.now() })));
    const changed = (_changes: unknown, area: string) => {
      if (area === 'local') void read();
    };
    chrome.storage.onChanged.addListener(changed);
    void read();
    void findOpener().then((opener) => flushSync(() => dispatch({ kind: 'opener', opener, now: Date.now() })));
    return () => chrome.storage.onChanged.removeListener(changed);
  }, []);

  const theme = state.stored?.theme ?? 'system';
  useEffect(() => applyTheme(theme), [theme]);

  // The selected row is always in view, also when the view has to scroll (G3, G7), when a message above the
  // rows pushes them down, and when search is shown again after the Name form.
  useLayoutEffect(() => {
    if (state.list.selected !== null) document.getElementById(rowId(state.list.selected))?.scrollIntoView({ block: 'nearest' });
  }, [state.list.selected, state.list.top, state.message, state.confirmed, state.view]);

  const other = otherMode(state.mode);

  const jump = async (row: MappingRow, mode: OpenMode) => {
    if (!ready) return;
    const request = jumpRequest(row, mode, state.opener);
    if (request === undefined) {
      dispatch({ kind: 'message', message: 'Not opened: Chrome did not say which tab this popup was opened on.' });
      return;
    }
    dispatch({ kind: 'message', message: null });
    const reply = await send(request);
    if (reply.kind === 'opened') window.close();
    else dispatch({ kind: 'message', message: notOpened(reply) });
  };

  // The Name form opens only once the popup knows the document and the page it names.
  const openForm = (name: string) => {
    if (ready) dispatch({ kind: 'name', name });
  };
  // The Name row opens the form with its text, whatever the mode (G4); every other row opens its mapping.
  const act = (row: SearchRow, mode: OpenMode) => (row.group === 'name' ? openForm(row.name) : void jump(row, mode));

  // Search's keys, wherever the focus is (the search box, the view when Chrome lets it take focus to scroll,
  // or nothing), so the footer is true for all of them; on a button, Enter and Space activate it instead.
  // In the first run, Enter starts *Name this page* (G30). The Name form has its own Enter; Escape closes the
  // popup from every view.
  const onKey = useRef<(event: KeyboardEvent) => void>(() => {});
  onKey.current = (event: KeyboardEvent) => {
    // A key that ends an input method's composition belongs to the composition.
    if (event.isComposing) return;
    if (event.key === 'Escape') window.close();
    else if (state.view.kind !== 'search') return;
    else if (event.target instanceof Element && event.target.closest('button')) return;
    else if (firstRun) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      openForm('');
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      dispatch({ kind: 'move', step: event.key === 'ArrowDown' ? 1 : -1 });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = state.list.selected === null ? undefined : state.list.rows[state.list.selected];
      if (selected) act(selected, event.shiftKey ? other : state.mode);
    }
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey.current(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  const onRowClick = (row: SearchRow, event: MouseEvent) => act(row, event.shiftKey ? other : state.mode);

  const onWheel = (event: ReactWheelEvent) => {
    const pixels = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * WHEEL_ROW_PIXELS;
    wheel.current += event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? pixels * WINDOW_ROWS : pixels;
    const rows = Math.trunc(wheel.current / WHEEL_ROW_PIXELS);
    if (rows === 0) return;
    wheel.current -= rows * WHEEL_ROW_PIXELS;
    dispatch({ kind: 'scroll', rows });
  };

  const storedDocument = state.stored?.document;
  const pageUrl = state.opener?.url;
  const thisPage = useMemo(
    () => (storedDocument === undefined || pageUrl === undefined ? undefined : mappingOfPage(readDocument(storedDocument).mappings, pageUrl)),
    [storedDocument, pageUrl],
  );

  if (state.view.kind === 'name' && state.stored !== undefined) {
    return (
      <NameForm
        key={state.view.opened}
        document={state.stored.document}
        name={state.view.name}
        subject={state.view.subject}
        onSaved={(saved) => dispatch({ kind: 'saved', saved, now: Date.now() })}
        onCancel={() => dispatch({ kind: 'cancel' })}
      />
    );
  }

  const shownConfirmation = state.confirmed !== null && (
    <Confirmation
      confirmed={state.confirmed}
      own={confirmation}
      undoing={undoing}
      onUndo={() => void undo()}
      onUndoFocus={(focused) => dispatch({ kind: 'focused', focused: focused ? 'undo' : null })}
      onTyping={() => searchBox.current?.focus()}
    />
  );

  if (firstRun) {
    return (
      <FirstRun
        ready={ready}
        confirmation={shownConfirmation}
        undoFooter={state.focused === 'undo' && state.confirmed !== null ? undoFooter(state.confirmed.outcome, undoing) : undefined}
        message={state.message}
        namePage={namePage}
        onNamePage={() => openForm('')}
        onMessage={(message) => dispatch({ kind: 'message', message })}
      />
    );
  }

  const { list } = state;
  const shown = list.rows.slice(list.top, list.top + WINDOW_ROWS);
  const { above, below } = outsideWindow(list);
  const cue = [above > 0 ? `${above} more above` : '', below > 0 ? `${below} more below` : ''].filter(Boolean).join(' · ');

  return (
    <main className="popup" ref={layout.root}>
      <header className="search-bar">
        <input
          ref={searchBox}
          className="search-box"
          type="text"
          role="combobox"
          aria-label="Search mappings by name or address"
          aria-autocomplete="list"
          aria-expanded={list.rows.length > 0}
          aria-controls={list.rows.length > 0 ? 'rows' : undefined}
          aria-activedescendant={list.selected === null ? undefined : rowId(list.selected)}
          placeholder="Type a name"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          value={state.typed}
          onChange={(event) => dispatch({ kind: 'typed', typed: event.target.value, now: Date.now() })}
        />
        <button
          type="button"
          className="chip"
          aria-label={`${MODE_LABEL[state.mode]} mode; activate to switch to ${MODE_LABEL[other]}`}
          // A click flips the chip and leaves the typing in the search box.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => dispatch({ kind: 'flip' })}
          onFocus={() => dispatch({ kind: 'focused', focused: 'chip' })}
          onBlur={() => dispatch({ kind: 'focused', focused: null })}
        >
          {MODE_LABEL[state.mode]}
        </button>
      </header>
      <div className="view" ref={layout.view} role="region" aria-label="Search results">
        <div className="view-content" ref={layout.content}>
          {shownConfirmation}
          {state.message !== null && (
            <p className="message" role="alert">
              {state.message}
            </p>
          )}
          {list.rows.length > 0 && (
            // Pressing a row keeps the focus, and with it the typing, in the search box.
            <ul id="rows" className="rows" role="listbox" aria-label="Mappings" onMouseDown={(event) => event.preventDefault()} onWheel={onWheel}>
              {shown.map((row, i) => (
                <Row
                  key={list.top + i}
                  row={row}
                  index={list.top + i}
                  count={list.rows.length}
                  selected={list.selected === list.top + i}
                  onClick={(event) => onRowClick(row, event)}
                />
              ))}
            </ul>
          )}
          {cue !== '' && <p className="cue">{cue}</p>}
          {/* In the view, which scrolls, since a name may be as long as the document. */}
          {thisPage && <p className="this-page">This page is "{thisPage.name}"</p>}
        </div>
      </div>
      <div className="page-bar">
        <button
          type="button"
          className="name-page"
          onClick={() => openForm('')}
          onFocus={() => dispatch({ kind: 'focused', focused: 'name-page' })}
          onBlur={() => dispatch({ kind: 'focused', focused: null })}
        >
          Name this page
        </button>
      </div>
      <footer className="footer">
        {footer(state, ready, undoing)}
      </footer>
    </main>
  );
}

function initialState(): State {
  return {
    stored: undefined,
    opener: undefined,
    view: { kind: 'search' },
    typed: '',
    list: NO_ROWS,
    mode: 'new-tab',
    focused: null,
    message: null,
    confirmed: null,
    count: 0,
  };
}

function reduce(state: State, action: Action): State {
  const next = reduceAction(state, action);
  // Undo has gone once its confirmation has, whether or not Chrome said the focus left it.
  return next.focused === 'undo' && !offersUndo(next.confirmed) ? { ...next, focused: null } : next;
}

function reduceAction(state: State, action: Action): State {
  switch (action.kind) {
    case 'stored': {
      const input = { ...searchInputs(action.stored), typed: state.typed, now: action.now };
      return openAsked({ ...state, stored: action.stored, list: state.stored === undefined ? newList(input) : relist(state.list, input) }, action.now);
    }
    case 'opener':
      return openAsked({ ...state, opener: action.opener, mode: action.opener.mode }, action.now);
    case 'typed':
      // An edit of the search box is the user's next action (G15).
      return { ...state, typed: action.typed, list: listFor(state, action.typed, action.now), message: null, confirmed: null };
    case 'move': {
      const list = move(state.list, action.step);
      return { ...state, list, confirmed: list.selected === state.list.selected ? state.confirmed : null };
    }
    case 'scroll': {
      // Moving the window, which can carry the selection along, is the user's next action too (G15).
      const list = scroll(state.list, action.rows);
      return { ...state, list, confirmed: list.top === state.list.top ? state.confirmed : null };
    }
    case 'flip':
      return { ...state, mode: otherMode(state.mode) };
    case 'focused':
      return { ...state, focused: action.focused };
    case 'message':
      return { ...state, message: action.message };
    case 'name':
      return withForm(state, action.name, { kind: 'page', url: state.opener?.url, title: state.opener?.title });
    case 'cancel':
      return { ...state, view: { kind: 'search' } };
    case 'saved': {
      const { headingMissing, ...changed } = action.saved;
      // Back to a blank search box, where an Enter left over from the save opens nothing (G3).
      return {
        ...state,
        view: { kind: 'search' },
        typed: '',
        list: listFor(state, '', action.now),
        message: null,
        confirmed: { id: state.count + 1, outcome: { kind: 'saved', changed, headingMissing } },
        count: state.count + 1,
      };
    }
    case 'undone':
      // An Undo is a change of its own: its outcome replaces the confirmation and starts its own lifetime (G15).
      return { ...state, confirmed: { id: state.count + 1, outcome: action.outcome }, count: state.count + 1 };
    case 'confirmation-ended':
      return state.confirmed?.id === action.id ? { ...state, confirmed: null } : state;
  }
}

function withForm(state: State, name: string, subject: NameSubject): State {
  return { ...state, view: { kind: 'name', name, subject, opened: state.count + 1 }, focused: null, confirmed: null, count: state.count + 1 };
}

/**
 * The Name form a command or a menu item asked for (F5, G29), once the document and the page are known. Keys
 * typed before it showed went to the search box; they are the name typed so far, and move to its name field.
 */
function openAsked(state: State, now: number): State {
  const { opener, stored } = state;
  if (opener?.asks === undefined || stored === undefined) return state;
  const opened = withForm({ ...state, opener: { ...opener, asks: undefined }, typed: '' }, state.typed, opener.asks);
  return { ...opened, list: listFor(opened, '', now) };
}

function listFor(state: State, typed: string, now: number): ListState {
  return state.stored === undefined ? NO_ROWS : newList({ ...searchInputs(state.stored), typed, now });
}

function searchInputs(stored: Stored) {
  return { document: stored.document, order: stored.order, usage: stored.usage };
}

function readStored(items: Record<string, unknown>): Stored {
  const { mappings, usage, searchOrder, themePref } = items;
  return {
    document: typeof mappings === 'string' ? mappings : '',
    order: readSearchOrder(searchOrder),
    usage: typeof usage === 'object' && usage !== null ? (usage as Usage) : undefined,
    theme: readTheme(themePref),
  };
}

/**
 * The tab the popup was opened on, its start mode, and the Name form its opening asked for: from `openIntent`
 * when it names this window and is fresh, which the popup then removes; a record for another window stays
 * for that window (G5).
 */
async function findOpener(): Promise<Opener> {
  try {
    const [[tab], { openIntent }] = await Promise.all([chrome.tabs.query({ active: true, currentWindow: true }), chrome.storage.local.get('openIntent')]);
    const intent = intentFor(openIntent, tab?.windowId, Date.now());
    // Through the worker, never with a page's own read and removal: a record written between those two calls,
    // for another window, would go too. Awaited, so the popup shows the mode it honored only once no later
    // popup in this window, the toolbar's included, can honor the record again.
    if (intent !== undefined) await send({ kind: 'remove-intent', windowId: intent.windowId, time: intent.time });
    const url = tab?.url || undefined;
    return { tabId: tab?.id, windowId: tab?.windowId, url, title: tab?.title, mode: startMode(intent), asks: askedSubject(intent, url, tab?.title) };
  } catch {
    return { tabId: undefined, windowId: undefined, url: undefined, title: undefined, mode: startMode(undefined), asks: undefined };
  }
}

/** What an honored record asks the Name form to name: the page (F5, G29), or a link on it (G11); nothing for search. */
function askedSubject(intent: OpenIntent | undefined, url: string | undefined, title: string | undefined): NameSubject | undefined {
  if (intent?.kind === 'name-page') return { kind: 'page', url, title };
  if (intent?.kind === 'name-link') return { kind: 'link', url: intent.linkUrl, pageUrl: intent.pageUrl, pageTitle: intent.pageTitle, tabUrl: url };
  return undefined;
}

/** The jump for `row` in `mode`: the mapping as stored, the argument only for the argument row (G6), in the popup's window or tab. */
function jumpRequest(row: MappingRow, mode: OpenMode, opener: Opener | undefined): JumpRequest | undefined {
  const { name, url } = row.mapping;
  const argument = row.group === 'argument' ? row.argument : null;
  if (mode === 'new-tab') return { kind: 'jump', name, url, argument, mode, active: true, ...(opener?.windowId === undefined ? {} : { windowId: opener.windowId }) };
  if (opener?.tabId === undefined) return undefined;
  return { kind: 'jump', name, url, argument, mode, tabId: opener.tabId };
}

function notOpened(reply: Exclude<JumpReply, { kind: 'opened' }>): string {
  if (reply.kind === 'failed') return `Not opened. Chrome said: ${reply.message}`;
  return `Not opened, because URLJumper could not save this use of it. Chrome said: ${reply.message}`;
}

function otherMode(mode: OpenMode): OpenMode {
  return mode === 'new-tab' ? 'this-tab' : 'new-tab';
}

/** What Enter does now (L2). */
function footer(state: State, ready: boolean, undoing: boolean): string {
  const { list, mode } = state;
  if (state.focused === 'chip') return `Enter or Space switches to ${MODE_LABEL[otherMode(mode)]}`;
  if (state.focused === 'undo' && state.confirmed !== null) return undoFooter(state.confirmed.outcome, undoing);
  if (!ready) return 'Enter does nothing until the popup is ready';
  if (state.focused === 'name-page') return 'Enter opens the Name form';
  // Typed text always lists a row, the Name row at least.
  if (list.rows.length === 0) return 'No mappings to list · Enter does nothing';
  const selected = list.selected === null ? undefined : list.rows[list.selected];
  if (selected === undefined) return 'Enter does nothing · Down selects a row';
  if (selected.group === 'name') return 'Enter opens the Name form';
  const where = (m: OpenMode) => (m === 'new-tab' ? 'in a new tab' : 'in this tab');
  const opens = selected.group !== 'argument' && isArgumentAlias(selected.mapping.url) ? 'Enter opens it with %s empty' : 'Enter opens it';
  return `${opens} ${where(mode)} · Shift+Enter ${where(otherMode(mode))}`;
}
