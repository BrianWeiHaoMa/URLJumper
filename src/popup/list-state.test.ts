import { expect, test } from 'vitest';
import type { SearchInput } from '../document/search';
import { move, newList, outsideWindow, relist, sameList, scroll, type ListState } from './list-state';

const NOW = Date.UTC(2026, 9, 18, 12);

// Mappings named m1 … m<count>, one per line.
const lines = (count: number) => Array.from({ length: count }, (_, i) => `m${i + 1}  https://e.example/${i + 1}`);

const input = (document: readonly string[], typed: string, extra: Partial<SearchInput> = {}): SearchInput => ({
  document: document.join('\n'),
  typed,
  order: 'document',
  usage: undefined,
  now: NOW,
  ...extra,
});

const names = (list: ListState) => list.rows.map((row) => (row.group === 'name' ? `Name "${row.name}"` : row.mapping.name));
const repeat = (list: ListState, step: 1 | -1, times: number) => Array.from({ length: times }).reduce<ListState>((l) => move(l, step), list);

test('a blank box lists every mapping with nothing selected; Down selects the first row, Up does nothing', () => {
  const list = newList(input(lines(20), '  '));
  expect(list.rows).toHaveLength(20);
  expect([list.blank, list.selected, list.top]).toEqual([true, null, 0]);
  expect(move(list, -1).selected).toBeNull();
  expect(move(list, 1).selected).toBe(0);
});

test('typed text selects the first row of each new list', () => {
  const list = newList(input(['st  x:1', 'stocks  x:2', 'start  x:3'], 's'));
  expect([list.blank, list.selected]).toEqual([false, 0]);
  const moved = repeat(list, 1, 2);
  expect(moved.selected).toBe(2);
  expect(newList(input(['st  x:1', 'stocks  x:2', 'start  x:3'], 'st')).selected).toBe(0);
});

test('text matching no name lists the Name row, selected when it is the only row and last after address matches', () => {
  const list = newList(input(lines(3), ' nothing  '));
  expect([names(list), list.blank, list.selected]).toEqual([['Name "nothing"'], false, 0]);
  expect(move(list, 1)).toEqual(list);
  const addressed = newList(input(lines(3), 'e.example/2'));
  expect([names(addressed), addressed.selected]).toEqual([['m2', 'Name "e.example/2"'], 0]);
  expect(move(addressed, 1).selected).toBe(1);
  expect(outsideWindow(addressed)).toEqual({ above: 0, below: 0 });
  // Text that starts a name lists no Name row.
  expect(names(newList(input(lines(3), 'm2')))).toEqual(['m2']);
});

test('a storage change that leaves the Name row as it was keeps the selection on it', () => {
  const list = move(newList(input(lines(3), 'e.example/2')), 1);
  expect(relist(list, input([...lines(3), '\\ a comment'], 'e.example/2')).selected).toBe(1);
  // The document gains a mapping with the name: a new list, its first row selected.
  const named = relist(list, input([...lines(3), 'e.example/2  x:1'], 'e.example/2'));
  expect([names(named), named.selected]).toEqual([['e.example/2', 'm2'], 0]);
});

test('Up on the first row selects the last and moves the window to the end; Down on the last returns to the top', () => {
  const list = newList(input(lines(20), 'm'));
  const last = move(list, -1);
  expect([last.selected, last.top]).toEqual([19, 13]);
  expect(outsideWindow(last)).toEqual({ above: 13, below: 0 });
  const first = move(last, 1);
  expect([first.selected, first.top]).toEqual([0, 0]);
  expect(outsideWindow(first)).toEqual({ above: 0, below: 13 });
});

test('the window follows the selection one row at a time', () => {
  const list = newList(input(lines(20), 'm'));
  expect([repeat(list, 1, 6).top, repeat(list, 1, 7).top, repeat(list, 1, 8).top]).toEqual([0, 1, 2]);
  const back = repeat(repeat(list, 1, 8), -1, 7);
  expect([back.selected, back.top]).toEqual([1, 1]);
});

test('scrolling moves the window inside the list and carries the selection along inside it', () => {
  const list = newList(input(lines(20), 'm'));
  const scrolled = scroll(list, 3);
  expect([scrolled.top, scrolled.selected]).toEqual([3, 3]);
  const end = scroll(list, 100);
  expect([end.top, end.selected]).toEqual([13, 13]);
  expect(scroll(end, -100).top).toBe(0);
  expect(scroll(end, -100).selected).toBe(6);
  const blank = scroll(newList(input(lines(20), '')), 5);
  expect([blank.top, blank.selected]).toEqual([5, null]);
  expect(move(blank, 1).selected).toBe(5);
  expect(scroll(newList(input(lines(5), '')), 3).top).toBe(0);
});

test('with every row in the window nothing lies outside it', () => {
  expect(outsideWindow(newList(input(lines(7), '')))).toEqual({ above: 0, below: 0 });
  expect(outsideWindow(newList(input(lines(20), '')))).toEqual({ above: 0, below: 13 });
});

test('a storage change that leaves the rows as they were keeps the selection and window', () => {
  const list = scroll(move(newList(input(lines(20), '')), 1), 4);
  const again = relist(list, input([...lines(20), '\\ a comment'], ''));
  expect([again.selected, again.top]).toEqual([list.selected, list.top]);
  expect(sameList(list, again)).toBe(true);
});

test('a storage change that changes the rows starts a new list, as G3 starts one', () => {
  const typed = repeat(newList(input(lines(20), 'm')), 1, 9);
  const more = relist(typed, input(['m0  x:0', ...lines(20)], 'm'));
  expect([more.selected, more.top]).toEqual([0, 0]);
  expect(sameList(typed, more)).toBe(false);
  // A new list whose selection is again the first row at the top is still a new list.
  const first = newList(input(lines(20), 'm'));
  expect(sameList(first, relist(first, input(['m0  x:0', ...lines(20)], 'm')))).toBe(false);
  const blank = move(newList(input(lines(20), '')), 1);
  const reordered = relist(blank, input(lines(20), '', { order: 'smart', usage: { ['m20\nhttps://e.example/20']: [NOW] } }));
  expect(names(reordered)[0]).toBe('m20');
  expect([reordered.selected, reordered.top]).toEqual([null, 0]);
});
