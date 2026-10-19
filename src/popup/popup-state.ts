// The popup's state and its rules, pure, for `Popup.tsx`: what storage and the opener tab gave it, the view it
// shows, the typed text with its list, and every transition of them (G3, G4, G5, G15), as one reducer; and
// what is read from that state: what Enter does, for the footer (L2), the jump a row asks for (G6) and what a
// refused one says, the key that edits the selected row (P1), and which line a focused pencil edits. Sending
// the jump is the component's, from its Enter and click handlers only (R4).
import type { Anchor } from '../document/anchor';
import { isArgumentAlias } from '../document/argument';
import type { Mapping } from '../document/grammar';
import type { SearchOrder, SearchRow } from '../document/search';
import type { Usage } from '../document/score';
import type { OpenMode } from '../open-intent';
import type { Theme } from '../preferences';
import type { JumpReply, JumpRequest } from '../requests';
import { offersUndo, undoFooter, type Confirmed, type Outcome } from '../line-changes/outcomes';
import { move, newList, relist, sameList, scroll, type ListState } from './list-state';
import type { NameSubject } from './NameForm';
import type { MappingRow } from './Row';

export interface Stored {
  document: string;
  order: SearchOrder;
  usage: Usage | undefined;
  theme: Theme;
  /** Whether the worker's mark of an update from 1.x is pending (G25). */
  upgradeNotice: boolean;
}

/** The tab the popup was opened on: its id and window, and its address and title when Chrome granted them (E5). */
export interface Opener {
  tabId: number | undefined;
  windowId: number | undefined;
  url: string | undefined;
  title: string | undefined;
  mode: OpenMode;
  /** What the honored record asked the Name form to name, until the form has opened for it. */
  asks: NameSubject | undefined;
}

/**
 * Search, the Name form opened with a name to start with, a line's editor opened on its anchor with the
 * argument row's argument (`opened` counts the openings, so each starts afresh), or settings.
 */
type View =
  | { kind: 'search' }
  | { kind: 'name'; name: string; subject: NameSubject; opened: number }
  | { kind: 'editor'; anchor: Anchor; argument: string | null; opened: number }
  | { kind: 'settings' };

export interface State {
  /** What storage held at the last read; undefined until the first read. */
  stored: Stored | undefined;
  /** Undefined until the tab and the mode its opening asked for are known. */
  opener: Opener | undefined;
  view: View;
  typed: string;
  list: ListState;
  /** How many times the selection has been set, by Up or Down or by a new list: each brings its row into view (G3). */
  selections: number;
  mode: OpenMode;
  /**
   * The control in search whose focus changes what Enter does, if one has it: a pencil, a row's or *This page
   * is*'s, by the key of the mapping it edits.
   */
  focused: 'chip' | 'settings' | 'name-page' | 'undo' | { edit: string } | null;
  /** Why the last jump did not open, or the example mappings were not loaded; kept until the user types or tries again. */
  message: string | null;
  /** The last change's confirmation, a save's or an Undo's, until its lifetime ends (G15). */
  confirmed: Confirmed | null;
  /** How many confirmations and form openings there have been. */
  count: number;
}

export type Action =
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
  | { kind: 'settings' }
  | { kind: 'edit'; anchor: Anchor; argument: string | null }
  | { kind: 'changed'; outcome: Outcome; now: number }
  | { kind: 'undone'; outcome: Outcome }
  | { kind: 'confirmation-ended'; id: number };

const NO_ROWS: ListState = { rows: [], blank: true, selected: null, top: 0 };
export const MODE_LABEL: Record<OpenMode, string> = { 'new-tab': 'New tab', 'this-tab': 'This tab' };

export function initialState(): State {
  return {
    stored: undefined,
    opener: undefined,
    view: { kind: 'search' },
    typed: '',
    list: NO_ROWS,
    selections: 0,
    mode: 'new-tab',
    focused: null,
    message: null,
    confirmed: null,
    count: 0,
  };
}

export function reduce(state: State, action: Action): State {
  const next = reduceAction(state, action);
  // Undo has gone once its confirmation has, whether or not Chrome said the focus left it.
  return next.focused === 'undo' && !offersUndo(next.confirmed) ? { ...next, focused: null } : next;
}

function reduceAction(state: State, action: Action): State {
  switch (action.kind) {
    case 'stored': {
      const input = { ...searchInputs(action.stored), typed: state.typed, now: action.now };
      const list = state.stored === undefined ? newList(input) : relist(state.list, input);
      return openAsked({ ...state, stored: action.stored, list, selections: sameList(state.list, list) ? state.selections : state.selections + 1 }, action.now);
    }
    case 'opener':
      return openAsked({ ...state, opener: action.opener, mode: action.opener.mode }, action.now);
    case 'typed':
      // An edit of the search box is the user's next action (G15).
      return { ...state, typed: action.typed, list: listFor(state, action.typed, action.now), selections: state.selections + 1, message: null, confirmed: null };
    case 'move': {
      const list = move(state.list, action.step);
      return { ...state, list, selections: state.selections + 1, confirmed: list.selected === state.list.selected ? state.confirmed : null };
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
    case 'settings':
      // Opening settings is the user's next action: the confirmation and its Undo end (G15).
      return { ...state, view: { kind: 'settings' }, focused: null, message: null, confirmed: null };
    case 'edit':
      // Opening the editor is the user's next action: the confirmation and its Undo end (G15).
      return {
        ...state,
        view: { kind: 'editor', anchor: action.anchor, argument: action.argument, opened: state.count + 1 },
        focused: null,
        message: null,
        confirmed: null,
        count: state.count + 1,
      };
    case 'changed':
      // A change the Name form or the editor stored: back to a blank search box, where an Enter left over from
      // the save opens nothing (G3, G4), with its confirmation.
      return {
        ...state,
        view: { kind: 'search' },
        typed: '',
        list: listFor(state, '', action.now),
        message: null,
        confirmed: { id: state.count + 1, outcome: action.outcome },
        count: state.count + 1,
      };
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

/** The jump for `row` in `mode`: the mapping as stored, the argument only for the argument row (G6), in the popup's window or tab. */
export function jumpRequest(row: MappingRow, mode: OpenMode, opener: Opener | undefined): JumpRequest | undefined {
  const { name, url } = row.mapping;
  const argument = row.group === 'argument' ? row.argument : null;
  if (mode === 'new-tab') return { kind: 'jump', name, url, argument, mode, active: true, ...(opener?.windowId === undefined ? {} : { windowId: opener.windowId }) };
  if (opener?.tabId === undefined) return undefined;
  return { kind: 'jump', name, url, argument, mode, tabId: opener.tabId };
}

export function notOpened(reply: Exclude<JumpReply, { kind: 'opened' }>): string {
  if (reply.kind === 'failed') return `Not opened. Chrome said: ${reply.message}`;
  return `Not opened, because URLJumper could not save this use of it. Chrome said: ${reply.message}`;
}

/** What tells the pencils of search apart, the window's and *This page is*'s, so a change of them is seen. */
export function editControlsOf(rows: readonly SearchRow[], thisPage: Mapping | undefined): string {
  return JSON.stringify([rows.map((row) => (row.group === 'name' ? null : row.mapping.key)), thisPage?.key ?? null]);
}

/** The line the pencil for the mapping keyed `key` edits, as this render shows it; undefined once it has gone. */
export function editedLine(key: string, shown: readonly SearchRow[], thisPage: Mapping | undefined): number | undefined {
  if (thisPage?.key === key) return thisPage.line;
  for (const row of shown) if (row.group !== 'name' && row.mapping.key === key) return row.mapping.line;
  return undefined;
}

/** Ctrl+E, which edits the selected row on every platform (P1). */
export function isEditKey(event: KeyboardEvent): boolean {
  return event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === 'e';
}

export function otherMode(mode: OpenMode): OpenMode {
  return mode === 'new-tab' ? 'this-tab' : 'new-tab';
}

/** What Enter does now (L2); `shown` is the selection while its row is in view, `editLine` the line of the pencil with the focus. */
export function footer(state: State, shown: number | null, ready: boolean, undoing: boolean, editLine: number | undefined): string {
  const { list, mode } = state;
  if (state.focused === 'chip') return `Enter or Space switches to ${MODE_LABEL[otherMode(mode)]}`;
  if (state.focused === 'undo' && state.confirmed !== null) return undoFooter(state.confirmed.outcome, undoing);
  if (!ready) return 'Enter does nothing until the popup is ready';
  if (state.focused === 'name-page') return 'Enter opens the Name form';
  if (state.focused === 'settings') return 'Enter opens settings';
  if (editLine !== undefined) return `Enter edits line ${editLine}`;
  // Typed text always lists a row, the Name row at least.
  if (list.rows.length === 0) return 'No mappings to list · Enter does nothing';
  // Held back while its row is out of view (G3).
  if (list.selected !== null && shown === null) return 'Enter does nothing · Up or Down selects a row';
  const selected = shown === null ? undefined : list.rows[shown];
  if (selected === undefined) return 'Enter does nothing · Down selects a row';
  if (selected.group === 'name') return 'Enter opens the Name form';
  const where = (m: OpenMode) => (m === 'new-tab' ? 'in a new tab' : 'in this tab');
  const opens = selected.group !== 'argument' && isArgumentAlias(selected.mapping.url) ? 'Enter opens it with %s empty' : 'Enter opens it';
  return `${opens} ${where(mode)} · Shift+Enter ${where(otherMode(mode))}`;
}
