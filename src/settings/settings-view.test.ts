import { expect, test } from 'vitest';
import { settingsFragment, viewInFragment } from './settings-view';

const VIEWS: [{ id: string }, { id: string }] = [{ id: 'preferences' }, { id: 'text' }];

test('the fragment names a view by its id, among other parameters, in any order', () => {
  expect(viewInFragment('#view=text', VIEWS)).toBe(VIEWS[1]);
  expect(viewInFragment('#view=text&line=12', VIEWS)).toBe(VIEWS[1]);
  expect(viewInFragment('#line=12&view=text', VIEWS)).toBe(VIEWS[1]);
  expect(viewInFragment('#view=preferences', VIEWS)).toBe(VIEWS[0]);
});

test('no fragment, no view parameter, or a view that does not exist opens the first view', () => {
  for (const hash of ['', '#', '#line=3', '#view=', '#view=list', '#view=Text', '#text']) expect(viewInFragment(hash, VIEWS), hash).toBe(VIEWS[0]);
});

test('the fragment a view is opened with names it again', () => {
  expect(settingsFragment('text')).toBe('#view=text');
  for (const view of VIEWS) expect(viewInFragment(settingsFragment(view.id), VIEWS)).toBe(view);
});
