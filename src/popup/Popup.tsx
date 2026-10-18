// The popup's search (In use, "Jump"): the search box with the mode chip, the list seven rows at a time with
// a cue for the rest, and a footer saying what Enter does. Everything shown derives from storage, read when
// the popup opens and again after every change; a mapping opens only through the worker's jump, sent from
// the popup's Enter handler or a row's click handler (R4), never from anything else.
import { useEffect, useLayoutEffect, useReducer, useRef, type MouseEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { isArgumentAlias } from '../document/argument';
import type { SearchOrder } from '../document/search';
import type { Usage } from '../document/score';
import { intentFor, startMode, type OpenMode } from '../open-intent';
import { applyTheme, readSearchOrder, readTheme, type Theme } from '../preferences';
import { send, type JumpReply, type JumpRequest } from '../requests';
import { move, newList, outsideWindow, relist, scroll, WINDOW_ROWS, type ListedRow, type ListState } from './list-state';
import { Row, rowId } from './Row';
import { useFitToViewport } from './fit-to-viewport';

interface Stored {
  document: string;
  order: SearchOrder;
  usage: Usage | undefined;
  theme: Theme;
}

interface State {
  /** What storage held at the last read; undefined until the first read. */
  stored: Stored | undefined;
  /** The tab the popup was opened on, and the mode its opening asked for; undefined until both are known. */
  opener: { tabId: number | undefined; mode: OpenMode } | undefined;
  typed: string;
  list: ListState;
  mode: OpenMode;
  chipFocused: boolean;
  /** Why the last jump did not open; kept until the user types or jumps again. */
  message: string | null;
}

type Action =
  | { kind: 'stored'; stored: Stored; now: number }
  | { kind: 'opener'; tabId: number | undefined; mode: OpenMode }
  | { kind: 'typed'; typed: string; now: number }
  | { kind: 'move'; step: 1 | -1 }
  | { kind: 'scroll'; rows: number }
  | { kind: 'flip' }
  | { kind: 'chip-focused'; focused: boolean }
  | { kind: 'message'; message: string | null };

const STORED_KEYS = ['mappings', 'usage', 'searchOrder', 'themePref'];
const NO_ROWS: ListState = { rows: [], blank: true, selected: null, top: 0 };
const MODE_LABEL: Record<OpenMode, string> = { 'new-tab': 'New tab', 'this-tab': 'This tab' };
// Pixels of wheel movement that move the window by one row.
const WHEEL_ROW_PIXELS = 40;

export function Popup() {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const wheel = useRef(0);
  const layout = useFitToViewport();

  useEffect(() => {
    // Every read asks for the keys again, and Chrome answers reads in the order they were made, so the last
    // answer shows the latest change, whenever its event arrived.
    const read = () =>
      chrome.storage.local.get(STORED_KEYS).then((items) => dispatch({ kind: 'stored', stored: readStored(items), now: Date.now() }));
    const changed = (_changes: unknown, area: string) => {
      if (area === 'local') void read();
    };
    chrome.storage.onChanged.addListener(changed);
    void read();
    void findOpener().then(({ tabId, mode }) => dispatch({ kind: 'opener', tabId, mode }));
    return () => chrome.storage.onChanged.removeListener(changed);
  }, []);

  const theme = state.stored?.theme ?? 'system';
  useEffect(() => applyTheme(theme), [theme]);

  // The selected row is always in view, also when the view has to scroll (G3, G7) and when a message above
  // the rows pushes them down.
  useLayoutEffect(() => {
    if (state.list.selected !== null) document.getElementById(rowId(state.list.selected))?.scrollIntoView({ block: 'nearest' });
  }, [state.list.selected, state.list.top, state.message]);

  const other = otherMode(state.mode);
  const ready = state.stored !== undefined && state.opener !== undefined;

  const jump = async (row: ListedRow, mode: OpenMode) => {
    if (!ready) return;
    const request = jumpRequest(row, mode, state.opener?.tabId);
    if (request === undefined) {
      dispatch({ kind: 'message', message: 'Not opened: Chrome did not say which tab this popup was opened on.' });
      return;
    }
    dispatch({ kind: 'message', message: null });
    const reply = await send(request);
    if (reply.kind === 'opened') window.close();
    else dispatch({ kind: 'message', message: notOpened(reply) });
  };

  // The popup's keys, wherever the focus is (the search box, the view when Chrome lets it take focus to
  // scroll, or nothing), so the footer is true for all of them; on the chip, Enter and Space flip it instead.
  const onKey = useRef<(event: KeyboardEvent) => void>(() => {});
  onKey.current = (event: KeyboardEvent) => {
    // A key that ends an input method's composition belongs to the composition.
    if (event.isComposing) return;
    if (event.key === 'Escape') window.close();
    else if (event.target instanceof Element && event.target.closest('button')) return;
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      dispatch({ kind: 'move', step: event.key === 'ArrowDown' ? 1 : -1 });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = state.list.selected === null ? undefined : state.list.rows[state.list.selected];
      if (selected) void jump(selected, event.shiftKey ? other : state.mode);
    }
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey.current(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  const onRowClick = (row: ListedRow, event: MouseEvent) => void jump(row, event.shiftKey ? other : state.mode);

  const onWheel = (event: ReactWheelEvent) => {
    const pixels = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * WHEEL_ROW_PIXELS;
    wheel.current += event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? pixels * WINDOW_ROWS : pixels;
    const rows = Math.trunc(wheel.current / WHEEL_ROW_PIXELS);
    if (rows === 0) return;
    wheel.current -= rows * WHEEL_ROW_PIXELS;
    dispatch({ kind: 'scroll', rows });
  };

  const { list } = state;
  const shown = list.rows.slice(list.top, list.top + WINDOW_ROWS);
  const { above, below } = outsideWindow(list);
  const cue = [above > 0 ? `${above} more above` : '', below > 0 ? `${below} more below` : ''].filter(Boolean).join(' · ');

  return (
    <main className="popup" ref={layout.root}>
      <header className="search-bar">
        <input
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
          onFocus={() => dispatch({ kind: 'chip-focused', focused: true })}
          onBlur={() => dispatch({ kind: 'chip-focused', focused: false })}
        >
          {MODE_LABEL[state.mode]}
        </button>
      </header>
      <div className="view" ref={layout.view} role="region" aria-label="Search results">
        <div className="view-content" ref={layout.content}>
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
        </div>
      </div>
      <footer className="footer">
        {footer(state, ready)}
      </footer>
    </main>
  );
}

function initialState(): State {
  return { stored: undefined, opener: undefined, typed: '', list: NO_ROWS, mode: 'new-tab', chipFocused: false, message: null };
}

function reduce(state: State, action: Action): State {
  switch (action.kind) {
    case 'stored': {
      const input = { ...searchInputs(action.stored), typed: state.typed, now: action.now };
      return { ...state, stored: action.stored, list: state.stored === undefined ? newList(input) : relist(state.list, input) };
    }
    case 'opener':
      return { ...state, opener: { tabId: action.tabId, mode: action.mode }, mode: action.mode };
    case 'typed': {
      const list = state.stored === undefined ? NO_ROWS : newList({ ...searchInputs(state.stored), typed: action.typed, now: action.now });
      return { ...state, typed: action.typed, list, message: null };
    }
    case 'move':
      return { ...state, list: move(state.list, action.step) };
    case 'scroll':
      return { ...state, list: scroll(state.list, action.rows) };
    case 'flip':
      return { ...state, mode: otherMode(state.mode) };
    case 'chip-focused':
      return { ...state, chipFocused: action.focused };
    case 'message':
      return { ...state, message: action.message };
  }
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
 * The tab the popup was opened on, and its start mode: from `openIntent` when it names this window and is
 * fresh, which the popup then removes; a record for another window stays for that window (G5).
 */
async function findOpener(): Promise<{ tabId: number | undefined; mode: OpenMode }> {
  try {
    const [[tab], { openIntent }] = await Promise.all([chrome.tabs.query({ active: true, currentWindow: true }), chrome.storage.local.get('openIntent')]);
    const intent = intentFor(openIntent, tab?.windowId, Date.now());
    // Through the worker, never with a page's own read and removal: a record written between those two calls,
    // for another window, would go too. Awaited, so the popup shows the mode it honored only once no later
    // popup in this window, the toolbar's included, can honor the record again.
    if (intent !== undefined) await send({ kind: 'remove-intent', windowId: intent.windowId, time: intent.time });
    return { tabId: tab?.id, mode: startMode(intent) };
  } catch {
    return { tabId: undefined, mode: startMode(undefined) };
  }
}

/** The jump for `row` in `mode`: the mapping as stored, and the argument only for the argument row (G6). */
function jumpRequest(row: ListedRow, mode: OpenMode, openerTabId: number | undefined): JumpRequest | undefined {
  const { name, url } = row.mapping;
  const argument = row.group === 'argument' ? row.argument : null;
  if (mode === 'new-tab') return { kind: 'jump', name, url, argument, mode, active: true };
  if (openerTabId === undefined) return undefined;
  return { kind: 'jump', name, url, argument, mode, tabId: openerTabId };
}

function notOpened(reply: Exclude<JumpReply, { kind: 'opened' }>): string {
  if (reply.kind === 'failed') return `Not opened. Chrome said: ${reply.message}`;
  return `Not opened, because URLJumper could not save this use of it. Chrome said: ${reply.message}`;
}

function otherMode(mode: OpenMode): OpenMode {
  return mode === 'new-tab' ? 'this-tab' : 'new-tab';
}

/** What Enter does now (L2). */
function footer(state: State, ready: boolean): string {
  const { list, mode } = state;
  if (state.chipFocused) return `Enter or Space switches to ${MODE_LABEL[otherMode(mode)]}`;
  if (!ready) return 'Enter does nothing until the popup is ready';
  if (list.rows.length === 0) return list.blank ? 'No mappings to list · Enter does nothing' : 'No mapping matches · Enter does nothing';
  const selected = list.selected === null ? undefined : list.rows[list.selected];
  if (selected === undefined) return 'Enter does nothing · Down selects a row';
  const where = (m: OpenMode) => (m === 'new-tab' ? 'in a new tab' : 'in this tab');
  const opens = selected.group !== 'argument' && isArgumentAlias(selected.mapping.url) ? 'Enter opens it with %s empty' : 'Enter opens it';
  return `${opens} ${where(mode)} · Shift+Enter ${where(otherMode(mode))}`;
}
