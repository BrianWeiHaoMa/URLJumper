import { expect, test } from 'vitest';
import { lineInFragment, settingsFragment, viewInFragment } from './settings-view';

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

test('the fragment names the Text view\'s line as decimal digits naming a number from 1, among other parameters', () => {
  expect(lineInFragment('#view=text&line=3')).toBe(3);
  expect(lineInFragment('#line=250&view=text')).toBe(250);
  expect(lineInFragment('#view=text&line=007')).toBe(7);
  expect(lineInFragment('#view=text&line=99999999999999999999')).toBe(1e20);
});

test('a line that is not decimal digits naming a number from 1 is no line', () => {
  for (const hash of ['', '#view=text', '#view=text&line=', '#view=text&line=0', '#view=text&line=x', '#view=text&line=-3', '#view=text&line=+3', '#view=text&line=1e3', '#view=text&line=3.5', '#view=text&line= 3', '#view=text&line=%D9%A3']) {
    expect(lineInFragment(hash), hash).toBeUndefined();
  }
});
