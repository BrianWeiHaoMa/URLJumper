import { expect, test } from 'vitest';
import type { Outcome } from '../line-changes/outcomes';
import { confirmationPlace, editorPlace, listEntries, listItems, whatEnterDoes, type ListItem } from './list-view';

const DOC = [
  '\\ Daily',
  '\\ second heading line',
  'mail  https://mail.example/  \\ its note',
  '',
  'cal\thttps://cal.example/',
  'just-a-name',
  '\\',
  'last  https://l.example/',
].join('\n');

/** Each item as `kind line: what it shows`. */
const shown = (items: readonly ListItem[]) =>
  items.map((item) => `${item.kind} ${item.line}: ${item.kind === 'heading' ? item.name : item.kind === 'mapping' ? `${item.mapping.name} ${item.mapping.url} ${item.mapping.note}` : item.text}`);

test("lines are listed in document order by the document's own numbers: a heading once, by its text or its first line, and no blank line", () => {
  expect(shown(listItems(DOC))).toEqual([
    'heading 1: Daily second heading line',
    'mapping 3: mail https://mail.example/ its note',
    'mapping 5: cal https://cal.example/ null',
    'unreadable 6: just-a-name',
    'heading 7: Heading at line 7',
    'mapping 8: last https://l.example/ null',
  ]);
});

test("a mapping row carries its line's exact text, the anchor a change from it names; an unreadable row its raw text and why", () => {
  const items = listItems('a  https://a/  \\  note  \r\nbroken\t   address\r\na  https://other/\n');
  expect(items[0]).toMatchObject({ kind: 'mapping', line: 1, text: 'a  https://a/  \\  note  ', mapping: { name: 'a', note: 'note' } });
  expect(items[1]).toMatchObject({ kind: 'unreadable', line: 2, text: 'broken\t   address', error: { line: 2, problem: 'no-scheme' } });
  expect(items[2]).toMatchObject({ kind: 'unreadable', line: 3, error: { line: 3, problem: 'repeated-name', heldBy: 1 } });
  expect(listItems('')).toEqual([]);
  expect(listItems('\n  \n')).toEqual([]);
});

test('keys are unique, a mapping row keyed by its text, and a line added above leaves every key as it was', () => {
  const doc = '\\ h\nx\nm  https://m/\n\\ h\nx\n';
  const keys = listItems(doc).map((item) => item.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).toContain('mapping m  https://m/');
  expect(listItems(`n  https://n/\n${doc}`).map((item) => item.key).slice(1)).toEqual(keys);
});

test('an editor stands on its line, found again by its text; changed, on the line with its name; gone, at the number it had', () => {
  const anchor = { line: 3, text: 'mail  https://mail.example/  \\ its note' };
  expect(editorPlace(DOC, anchor)).toEqual({ kind: 'on', line: 3 });
  expect(editorPlace(`\\ new\n${DOC}`, anchor)).toEqual({ kind: 'on', line: 4 });
  expect(editorPlace(DOC.replace('https://mail.example/', 'https://other/'), anchor)).toEqual({ kind: 'on', line: 3 });
  expect(editorPlace(DOC.replace('mail  https://mail.example/  \\ its note\n', '').replace('last', 'mail'), anchor)).toEqual({ kind: 'on', line: 7 });
  expect(editorPlace(DOC.replace('mail  https://mail.example/  \\ its note\n', ''), anchor)).toEqual({ kind: 'before', line: 3 });
  // An unreadable line with the text is never its line (G16).
  expect(editorPlace('mail  https://first/\nmail  https://mail.example/  \\ its note', anchor)).toEqual({ kind: 'on', line: 1 });
});

test('the editor stands in for its row, or before the first item at its number, after the last when the document is shorter', () => {
  const items = listItems(DOC);
  const lines = (entries: ReturnType<typeof listEntries>) => entries.map((entry) => `${entry.kind} ${entry.line}`);
  expect(lines(listEntries(items, { key: 'editor 1', place: { kind: 'on', line: 5 } }, null))).toEqual(['heading 1', 'mapping 3', 'editor 5', 'unreadable 6', 'heading 7', 'mapping 8']);
  expect(lines(listEntries(items, { key: 'editor 1', place: { kind: 'before', line: 4 } }, null))).toEqual(['heading 1', 'mapping 3', 'editor 4', 'mapping 5', 'unreadable 6', 'heading 7', 'mapping 8']);
  expect(lines(listEntries(items, { key: 'editor 1', place: { kind: 'before', line: 20 } }, null)).at(-1)).toBe('editor 20');
  // `on` a line no mapping row has now stands where that line is.
  expect(lines(listEntries(items, { key: 'editor 1', place: { kind: 'on', line: 6 } }, null))).toEqual(['heading 1', 'mapping 3', 'mapping 5', 'editor 6', 'unreadable 6', 'heading 7', 'mapping 8']);
});

test('a confirmation stands after the line its change left, where a removed line was, and after an editor on its line', () => {
  const items = listItems(DOC);
  const lines = (entries: ReturnType<typeof listEntries>) => entries.map((entry) => `${entry.kind} ${entry.line}`);
  expect(lines(listEntries(items, null, { kind: 'after', line: 3 }))).toEqual(['heading 1', 'mapping 3', 'confirmation 3', 'mapping 5', 'unreadable 6', 'heading 7', 'mapping 8']);
  expect(lines(listEntries(items, null, { kind: 'before', line: 5 }))).toEqual(['heading 1', 'mapping 3', 'confirmation 5', 'mapping 5', 'unreadable 6', 'heading 7', 'mapping 8']);
  expect(lines(listEntries(items, { key: 'editor 1', place: { kind: 'on', line: 5 } }, { kind: 'after', line: 5 })).slice(2, 4)).toEqual(['editor 5', 'confirmation 5']);

  const undo = { kind: 'undo', act: 'reinsert', line: 5, text: 'cal\thttps://cal.example/' } as const;
  const removed: Outcome = { kind: 'removed', name: 'cal', line: 5, undo };
  expect(confirmationPlace(removed, { kind: 'after', line: 1 })).toEqual({ kind: 'before', line: 5 });
  expect(confirmationPlace({ ...removed, kind: 'rewritten' }, { kind: 'after', line: 1 })).toEqual({ kind: 'after', line: 5 });
  expect(confirmationPlace({ kind: 'refused', message: 'Not undone' }, { kind: 'before', line: 5 })).toEqual({ kind: 'before', line: 5 });
});

test("the footer names the line of a row's control and Add mapping's form, and says while an edit waits; on Undo it is Undo's, in an editor or the form what it says", () => {
  const none = { confirmed: null, undoing: false, waiting: false, adding: false, editorSays: null };
  expect(whatEnterDoes({ control: 'pencil', line: 3 }, none)).toBe('Enter edits line 3');
  expect(whatEnterDoes({ control: 'fix', line: 6 }, none)).toBe('Enter shows the Text view at line 6');
  expect(whatEnterDoes({ control: 'fix', line: 6 }, { ...none, waiting: true })).toBe('Enter does nothing until the change is stored');
  expect(whatEnterDoes({ control: 'pencil', line: 3 }, { ...none, waiting: true, editorSays: 'Saving · Enter does nothing until it is stored' })).toBe('Enter does nothing until the change is stored');
  expect(whatEnterDoes('add', none)).toBe('Enter opens the Name form for a new mapping');
  expect(whatEnterDoes('add', { ...none, waiting: true })).toBe('Enter does nothing until the change is stored');
  expect(whatEnterDoes('add', { ...none, adding: true, editorSays: 'Enter saves it as line 9' })).toBe('Enter goes to the Name form');
  expect(whatEnterDoes('copy', { ...none, adding: true, editorSays: 'Enter saves it as line 9' })).toBe("Enter copies the tab's address");
  const confirmed = { id: 1, outcome: { kind: 'removed', name: 'cal', line: 5, undo: { kind: 'undo', act: 'reinsert', line: 5, text: 'cal u:1' } } } as const;
  expect(whatEnterDoes('undo', { ...none, confirmed })).toBe('Enter undoes the removal, putting the line back');
  expect(whatEnterDoes('undo', { ...none, confirmed, undoing: true })).toBe('Undoing · Enter does nothing until it is stored');
  expect(whatEnterDoes(null, { ...none, editorSays: 'Enter saves line 3' })).toBe('Enter saves line 3');
  expect(whatEnterDoes(null, none)).toBe('Enter does nothing');
});
