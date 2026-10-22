import { describe, expect, test } from 'vitest';
import { readDocument } from '../document/grammar';
import type { Outcome } from '../line-changes/outcomes';
import type { SearchRow } from '../document/search';
import {
  editControlsOf,
  editedLine,
  footer,
  initialState,
  isEditKey,
  jumpRequest,
  notOpened,
  reduce,
  type Action,
  type Opener,
  type State,
  type Stored,
} from './popup-state';
import type { MappingRow } from './Row';

const NOW = Date.UTC(2026, 9, 19, 12);

const DOCUMENT = [
  'st      https://st.example/',
  'stocks  https://stocks.example/',
  'start   https://start.example/',
  'yt      https://www.youtube.com/results?search_query=%s',
].join('\n');

// Mappings named m1 … m<count>, one per line: more than the seven rows a window shows.
const many = (count: number) => Array.from({ length: count }, (_, i) => `m${i + 1}  https://e.example/${i + 1}`).join('\n');

const stored = (document: string): Stored => ({ document, order: 'document', usage: undefined, theme: 'system', popupSettingsView: 'preferences', upgradeNotice: false });

const opener = (extra: Partial<Opener> = {}): Opener => ({
  tabId: 7,
  windowId: 3,
  url: 'https://page.example/',
  title: 'A page',
  mode: 'new-tab',
  asks: undefined,
  ...extra,
});

const saved: Outcome = { kind: 'saved', name: 'stocks', line: 2, undo: { kind: 'undo', act: 'remove', line: 2, text: 'stocks  https://stocks.example/' }, headingMissing: false };
const removed: Outcome = { kind: 'removed', name: 'stocks', line: 2, undo: { kind: 'undo', act: 'reinsert', line: 2, text: 'stocks  https://stocks.example/' } };
const refused: Outcome = { kind: 'refused', message: 'Not undone: line 2 has changed.' };

const run = (state: State, ...actions: Action[]) => actions.reduce(reduce, state);
const ready = (document = DOCUMENT, extra: Partial<Opener> = {}) =>
  run(initialState(), { kind: 'stored', stored: stored(document), now: NOW }, { kind: 'opener', opener: opener(extra), now: NOW });
const typed = (text: string): Action => ({ kind: 'typed', typed: text, now: NOW });
const names = (state: State) => state.list.rows.map((row) => (row.group === 'name' ? `Name "${row.name}"` : row.mapping.name));

/** The listed row at `index`, failing for the Name row, which lists no mapping. */
function mappingRow(state: State, index: number): MappingRow {
  const row = state.list.rows[index];
  if (row === undefined || row.group === 'name') throw new Error(`no mapping row at ${index}`);
  return row;
}

describe('what storage gives and what is typed (G3, G15)', () => {
  test('the first read with nothing typed lists every mapping with nothing selected; typing selects the first row and is the next action', () => {
    const first = run(initialState(), { kind: 'stored', stored: stored(DOCUMENT), now: NOW });
    expect([names(first), first.list.blank, first.list.selected, first.selections]).toEqual([['st', 'stocks', 'start', 'yt'], true, null, 1]);
    const before = run(first, { kind: 'opener', opener: opener(), now: NOW }, { kind: 'changed', outcome: saved, now: NOW }, { kind: 'message', message: 'Not opened.' });
    expect([before.confirmed, before.message]).not.toEqual([null, null]);
    const after = run(before, typed('st'));
    expect([after.typed, names(after), after.list.selected]).toEqual(['st', ['st', 'stocks', 'start'], 0]);
    expect([after.selections, after.message, after.confirmed]).toEqual([before.selections + 1, null, null]);
  });

  test('a read whose rows for the typed text are the same keeps the selection and the window and brings nothing into view', () => {
    const scrolled = run(ready(many(12)), typed('m'), { kind: 'move', step: -1 });
    expect([scrolled.list.selected, scrolled.list.top]).toEqual([11, 5]);
    const reread = run(scrolled, { kind: 'stored', stored: stored(`${many(12)}\n\\ a comment below`), now: NOW });
    expect([reread.list.selected, reread.list.top, reread.selections]).toEqual([11, 5, scrolled.selections]);
  });

  test('a read whose rows differ, a mapping added above, is a new list: its first row selected and brought into view', () => {
    const moved = run(ready(), typed('st'), { kind: 'move', step: 1 });
    const added = run(moved, { kind: 'stored', stored: stored(`stx  https://x.example/\n${DOCUMENT}`), now: NOW });
    expect([names(added), added.list.selected, added.list.top, added.selections]).toEqual([['st', 'stx', 'stocks', 'start'], 0, 0, moved.selections + 1]);
  });
});

describe('a Name form the opening asked for (F5, G29, G11)', () => {
  test('asked before the first read: search until the document is known, then the form with what was typed as its name', () => {
    const asks = { kind: 'page', url: 'https://page.example/', title: 'A page' } as const;
    const waiting = run(initialState(), { kind: 'opener', opener: opener({ asks, mode: 'this-tab' }), now: NOW }, typed('sto'));
    expect([waiting.view, waiting.opener?.asks, waiting.mode, waiting.list.rows]).toEqual([{ kind: 'search' }, asks, 'this-tab', []]);
    const opened = run(waiting, { kind: 'stored', stored: stored(DOCUMENT), now: NOW });
    expect(opened.view).toEqual({ kind: 'name', name: 'sto', subject: asks, opened: 1 });
    expect([opened.typed, names(opened), opened.list.selected, opened.opener?.asks, opened.count]).toEqual(['', ['st', 'stocks', 'start', 'yt'], null, undefined, 1]);
    // Asked once: a later read leaves the form as it is.
    expect(run(opened, { kind: 'stored', stored: stored(DOCUMENT), now: NOW }).view).toEqual(opened.view);
  });

  test('asked after the first read: the form at once, for a link as for a page', () => {
    const asks = { kind: 'link', url: 'https://link.example/', pageUrl: 'https://page.example/', pageTitle: 'A page', tabUrl: 'https://page.example/' } as const;
    const opened = run(initialState(), { kind: 'stored', stored: stored(DOCUMENT), now: NOW }, { kind: 'opener', opener: opener({ asks }), now: NOW });
    expect(opened.view).toEqual({ kind: 'name', name: '', subject: asks, opened: 1 });
    expect(opened.opener?.asks).toBeUndefined();
  });

  test('an opening that asks for nothing stays in search, in the mode it asked for (G5)', () => {
    const state = ready(DOCUMENT, { mode: 'this-tab' });
    expect([state.view, state.mode, state.count]).toEqual([{ kind: 'search' }, 'this-tab', 0]);
  });
});

describe('Up, Down, and the wheel (G3, G15)', () => {
  test('Down from the last row selects the first, Up from the first the last; each counts as a selection', () => {
    const list = run(ready(), typed('st'));
    const last = run(list, { kind: 'move', step: -1 });
    expect([last.list.selected, last.selections]).toEqual([2, list.selections + 1]);
    expect(run(last, { kind: 'move', step: 1 }).list.selected).toBe(0);
  });

  test('a move that leaves the selection where it was keeps the confirmation; one that changes it ends it', () => {
    const one = run(ready(), typed('stocks'), { kind: 'undone', outcome: saved });
    expect(names(one)).toEqual(['stocks']);
    const kept = run(one, { kind: 'move', step: 1 });
    expect([kept.list.selected, kept.confirmed, kept.selections]).toEqual([0, one.confirmed, one.selections + 1]);
    const three = run(ready(), typed('st'), { kind: 'undone', outcome: saved });
    expect(run(three, { kind: 'move', step: 1 }).confirmed).toBeNull();
  });

  test('the wheel moves the window inside the list, taking the selection along; the confirmation ends only when the window moved', () => {
    const list = run(ready(many(10)), typed('m'), { kind: 'undone', outcome: saved });
    const still = run(list, { kind: 'scroll', rows: -1 });
    expect([still.list.top, still.list.selected, still.confirmed, still.selections]).toEqual([0, 0, list.confirmed, list.selections]);
    const scrolled = run(list, { kind: 'scroll', rows: 5 });
    expect([scrolled.list.top, scrolled.list.selected, scrolled.confirmed, scrolled.selections]).toEqual([3, 3, null, list.selections]);
  });
});

describe('the chip and the views (G5, G15)', () => {
  test('the chip flips to the other mode and back', () => {
    const state = ready();
    expect(run(state, { kind: 'flip' }).mode).toBe('this-tab');
    expect(run(state, { kind: 'flip' }, { kind: 'flip' }).mode).toBe('new-tab');
  });

  test('back from a view, search is as it was left: the typed text, the list, and the mode', () => {
    const left = run(ready(), typed('st'), { kind: 'move', step: 1 }, { kind: 'flip' });
    const back = run(left, { kind: 'name', name: 'st' }, { kind: 'cancel' });
    expect(back.view).toEqual({ kind: 'search' });
    expect([back.typed, back.list, back.mode]).toEqual([left.typed, left.list, 'this-tab']);
  });

  test('opening the Name form or the editor ends the confirmation and the focus and starts the view afresh', () => {
    const before = run(ready(), { kind: 'changed', outcome: saved, now: NOW }, { kind: 'focused', focused: 'undo' });
    expect([before.count, before.focused]).toEqual([1, 'undo']);
    const named = run(before, { kind: 'name', name: 'st' });
    expect(named.view).toEqual({ kind: 'name', name: 'st', subject: { kind: 'page', url: 'https://page.example/', title: 'A page' }, opened: 2 });
    expect([named.confirmed, named.focused, named.count]).toEqual([null, null, 2]);
    const anchor = { line: 2, text: 'stocks  https://stocks.example/' };
    const edited = run(before, { kind: 'message', message: 'Not opened.' }, { kind: 'edit', anchor, argument: 'x' });
    expect(edited.view).toEqual({ kind: 'editor', anchor, argument: 'x', opened: 2 });
    expect([edited.confirmed, edited.focused, edited.message, edited.count]).toEqual([null, null, null, 2]);
  });

  test('opening settings ends the confirmation, the focus, and the message, and counts no opening', () => {
    const before = run(ready(), { kind: 'changed', outcome: saved, now: NOW }, { kind: 'focused', focused: 'undo' }, { kind: 'message', message: 'Not opened.' });
    const settings = run(before, { kind: 'settings' });
    expect([settings.view, settings.confirmed, settings.focused, settings.message, settings.count]).toEqual([{ kind: 'settings' }, null, null, null, before.count]);
  });
});

describe('a stored change and its confirmation (G3, G4, G15)', () => {
  test('a change returns to a blank search box with nothing selected, so an Enter left over opens nothing, and confirms it', () => {
    const form = run(ready(), typed('st'), { kind: 'message', message: 'Not opened.' }, { kind: 'name', name: 'st' });
    const changed = run(form, { kind: 'changed', outcome: saved, now: NOW });
    expect([changed.view, changed.typed, names(changed), changed.list.selected, changed.message]).toEqual([{ kind: 'search' }, '', ['st', 'stocks', 'start', 'yt'], null, null]);
    expect([changed.confirmed, changed.count]).toEqual([{ id: 2, outcome: saved }, 2]);
  });

  test('an Undo is a change of its own: a new confirmation with its own id', () => {
    const changed = run(ready(), { kind: 'changed', outcome: saved, now: NOW });
    const undone = run(changed, { kind: 'undone', outcome: removed });
    expect([undone.confirmed, undone.count, undone.typed]).toEqual([{ id: 2, outcome: removed }, 2, '']);
  });

  test("a confirmation's end removes it only while it is the one shown", () => {
    const undone = run(ready(), { kind: 'changed', outcome: saved, now: NOW }, { kind: 'undone', outcome: removed });
    expect(run(undone, { kind: 'confirmation-ended', id: 1 })).toBe(undone);
    expect(run(undone, { kind: 'confirmation-ended', id: 2 }).confirmed).toBeNull();
  });

  test('Undo loses the focus once nothing offers it: a refused Undo, the end of its confirmation, or none at all', () => {
    const focused = run(ready(), { kind: 'changed', outcome: saved, now: NOW }, { kind: 'focused', focused: 'undo' });
    expect(focused.focused).toBe('undo');
    expect(run(focused, { kind: 'undone', outcome: refused }).focused).toBeNull();
    expect(run(focused, { kind: 'confirmation-ended', id: 1 }).focused).toBeNull();
    expect(run(ready(), { kind: 'focused', focused: 'undo' }).focused).toBeNull();
    expect(run(focused, { kind: 'focused', focused: 'chip' }).focused).toBe('chip');
  });
});

describe('the footer says what Enter does (L2)', () => {
  // `shown` is the selection while its row is in view, as the component passes it.
  const say = (state: State, extra: { shown?: number | null; ready?: boolean; undoing?: boolean; editLine?: number } = {}) =>
    footer(state, extra.shown === undefined ? state.list.selected : extra.shown, extra.ready ?? true, extra.undoing ?? false, extra.editLine);

  test('on the chip, Undo, Name this page, the gear, or a pencil, what that control does', () => {
    const state = run(ready(), typed('st'), { kind: 'changed', outcome: saved, now: NOW });
    const on = (focused: State['focused']) => ({ ...state, focused });
    expect(say(on('chip'))).toBe('Enter or Space switches to This tab');
    expect(say({ ...on('chip'), mode: 'this-tab' })).toBe('Enter or Space switches to New tab');
    expect(say(on('undo'))).toBe('Enter undoes the save, removing its line');
    expect(say(on('undo'), { undoing: true })).toBe('Undoing · Enter does nothing until it is stored');
    expect(say(on('name-page'))).toBe('Enter opens the Name form');
    expect(say(on('settings'))).toBe('Enter opens settings');
    expect(say(on({ edit: 'stocks\nhttps://stocks.example/' }), { editLine: 2 })).toBe('Enter edits line 2');
  });

  test('until the popup is ready, Enter does nothing, whatever is selected', () => {
    expect(say(run(ready(), typed('st')), { ready: false })).toBe('Enter does nothing until the popup is ready');
    expect(say({ ...run(ready(), typed('st')), focused: 'chip' }, { ready: false })).toBe('Enter or Space switches to This tab');
    expect(say({ ...run(ready(), typed('st')), focused: 'name-page' }, { ready: false })).toBe('Enter does nothing until the popup is ready');
  });

  test('with no row, nothing selected, or the selection out of view, Enter does nothing', () => {
    expect(say(ready('\\ only a heading'))).toBe('No mappings to list · Enter does nothing');
    expect(say(ready())).toBe('Enter does nothing · Down selects a row');
    expect(say(run(ready(), typed('st')), { shown: null })).toBe('Enter does nothing · Up or Down selects a row');
  });

  test('on the Name row, Enter opens the form', () => {
    const state = run(ready(), typed('nothing'));
    expect(names(state)).toEqual(['Name "nothing"']);
    expect(say(state)).toBe('Enter opens the Name form');
  });

  test("on a mapping, Enter opens it in the chip's mode and Shift+Enter in the other", () => {
    expect(say(run(ready(), typed('st')))).toBe('Enter opens it in a new tab · Shift+Enter in this tab');
    expect(say(run(ready(), typed('st'), { kind: 'flip' }))).toBe('Enter opens it in this tab · Shift+Enter in a new tab');
  });

  test('on an argument alias without an argument, Enter opens it with %s empty; on the argument row, it opens the filled URL', () => {
    const alias = run(ready(), typed('yt'));
    expect(alias.list.rows[0]?.group).toBe('exact');
    expect(say(alias)).toBe('Enter opens it with %s empty in a new tab · Shift+Enter in this tab');
    const argument = run(ready(), typed('yt lo-fi beats'));
    expect(argument.list.rows[0]?.group).toBe('argument');
    expect(say(argument)).toBe('Enter opens it in a new tab · Shift+Enter in this tab');
  });
});

describe('the jump a row asks for (G6), sent by the component alone (R4)', () => {
  const st = mappingRow(run(ready(), typed('st')), 0);

  test('New tab: the mapping as stored, made active, in the window the popup was opened in when Chrome said which', () => {
    expect(jumpRequest(st, 'new-tab', opener())).toStrictEqual({ kind: 'jump', name: 'st', url: 'https://st.example/', argument: null, mode: 'new-tab', active: true, windowId: 3 });
    const noWindow = { kind: 'jump', name: 'st', url: 'https://st.example/', argument: null, mode: 'new-tab', active: true };
    expect(jumpRequest(st, 'new-tab', opener({ windowId: undefined }))).toStrictEqual(noWindow);
    expect(jumpRequest(st, 'new-tab', undefined)).toStrictEqual(noWindow);
  });

  test('This tab: the tab the popup was opened on, and no jump when Chrome did not say which', () => {
    expect(jumpRequest(st, 'this-tab', opener())).toStrictEqual({ kind: 'jump', name: 'st', url: 'https://st.example/', argument: null, mode: 'this-tab', tabId: 7 });
    expect(jumpRequest(st, 'this-tab', opener({ tabId: undefined }))).toBeUndefined();
    expect(jumpRequest(st, 'this-tab', undefined)).toBeUndefined();
  });

  test('the argument goes only with the argument row; an alias listed by its name goes without one', () => {
    const yt = 'https://www.youtube.com/results?search_query=%s';
    const argument = mappingRow(run(ready(), typed('yt lo-fi beats')), 0);
    expect(jumpRequest(argument, 'new-tab', opener())).toMatchObject({ name: 'yt', url: yt, argument: 'lo-fi beats' });
    const alias = mappingRow(run(ready(), typed('yt')), 0);
    expect(jumpRequest(alias, 'new-tab', opener())).toMatchObject({ name: 'yt', url: yt, argument: null });
  });

  test("a jump that did not open says why, in Chrome's words", () => {
    expect(notOpened({ kind: 'failed', message: 'Cannot navigate.' })).toBe('Not opened. Chrome said: Cannot navigate.');
    expect(notOpened({ kind: 'storage-failed', message: 'Quota exceeded.' })).toBe('Not opened, because URLJumper could not save this use of it. Chrome said: Quota exceeded.');
  });
});

describe('the key that edits the selected row (P1)', () => {
  const key = (key: string, modifiers: { ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}) =>
    ({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...modifiers }) as KeyboardEvent;

  test('Ctrl+E, with e or E, and nothing else', () => {
    expect(isEditKey(key('e', { ctrlKey: true }))).toBe(true);
    expect(isEditKey(key('E', { ctrlKey: true }))).toBe(true);
    expect(isEditKey(key('e', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isEditKey(key('e', { ctrlKey: true, altKey: true }))).toBe(false);
    expect(isEditKey(key('e', { ctrlKey: true, metaKey: true }))).toBe(false);
    expect(isEditKey(key('e', { metaKey: true }))).toBe(false);
    expect(isEditKey(key('e'))).toBe(false);
    expect(isEditKey(key('r', { ctrlKey: true }))).toBe(false);
  });
});

describe("the pencils' keys (G32, L2)", () => {
  const document = readDocument(DOCUMENT).mappings;
  const page = document[3]!;
  const shown: SearchRow[] = run(ready(), typed('st')).list.rows.slice();

  test('a focused pencil edits the line of its row, or of This page is, and none once its mapping has gone', () => {
    expect(editedLine(document[1]!.key, shown, undefined)).toBe(2);
    expect(editedLine(page.key, shown, page)).toBe(4);
    expect(editedLine(page.key, shown, undefined)).toBeUndefined();
    expect(editedLine('gone\nhttps://gone.example/', shown, page)).toBeUndefined();
  });

  test('the pencils shown change when a row of the window or This page is changes, and only then', () => {
    const same = editControlsOf(shown, page);
    expect(editControlsOf(shown.slice(), page)).toBe(same);
    expect(editControlsOf(shown.slice(1), page)).not.toBe(same);
    expect(editControlsOf(shown, undefined)).not.toBe(same);
    expect(editControlsOf(shown, document[0])).not.toBe(same);
    // The Name row has no pencil.
    expect(editControlsOf([{ group: 'name', name: 'st' }], undefined)).toBe(editControlsOf([{ group: 'name', name: 'other' }], undefined));
  });
});
