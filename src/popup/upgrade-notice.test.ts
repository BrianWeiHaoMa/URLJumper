import { expect, test } from 'vitest';
import { activatesControl, dismissesNotice, footerWithNotice } from './upgrade-notice';

const key = (key: string, modifiers: { ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}) => ({
  key,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...modifiers,
});

test('every keystroke dismisses the notice: a letter, a digit, Space, Enter, Escape, an arrow, Backspace, a function key', () => {
  for (const pressed of ['m', 'M', '7', ' ', 'Enter', 'Escape', 'ArrowDown', 'ArrowUp', 'Backspace', 'Delete', 'F1', 'F5', 'Home', 'é', 'Dead', 'Process', 'CapsLock']) {
    expect(dismissesNotice(key(pressed)), pressed).toBe(true);
  }
  expect(dismissesNotice(key('m', { shiftKey: true }))).toBe(true);
  expect(dismissesNotice(key('Enter', { shiftKey: true }))).toBe(true);
  expect(dismissesNotice(key('e', { ctrlKey: true }))).toBe(true);
});

test('Tab and Shift+Tab move the focus to and from the notice without dismissing it', () => {
  expect(dismissesNotice(key('Tab'))).toBe(false);
  expect(dismissesNotice(key('Tab', { shiftKey: true }))).toBe(false);
});

test('Tab with another modifier is another keystroke, and dismisses', () => {
  expect(dismissesNotice(key('Tab', { ctrlKey: true }))).toBe(true);
  expect(dismissesNotice(key('Tab', { altKey: true }))).toBe(true);
  expect(dismissesNotice(key('Tab', { metaKey: true }))).toBe(true);
});

test('a modifier pressed on its own is part of the keystroke it modifies, and dismisses nothing yet', () => {
  for (const modifier of ['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'Fn']) {
    expect(dismissesNotice(key(modifier)), modifier).toBe(false);
  }
  expect(dismissesNotice(key('Shift', { shiftKey: true }))).toBe(false);
});

test("Enter and Space activate the notice's controls; no other key does", () => {
  expect(activatesControl({ key: 'Enter' })).toBe(true);
  expect(activatesControl({ key: ' ' })).toBe(true);
  for (const pressed of ['m', 'Escape', 'ArrowDown', 'Tab', 'Spacebar']) expect(activatesControl({ key: pressed }), pressed).toBe(false);
});

test("while the notice shows, a footer that says Enter does nothing says Enter closes the notice; on the notice's controls, what Enter does there", () => {
  const shown = { shown: true, focused: null };
  expect(footerWithNotice('Enter does nothing · Down selects a row', shown)).toBe('Enter only closes the notice · Down selects a row');
  expect(footerWithNotice('No mappings to list · Enter does nothing', shown)).toBe('No mappings to list · Enter only closes the notice');
  expect(footerWithNotice('Saving · Enter does nothing until it is stored', shown)).toBe('Saving · Enter only closes the notice until it is stored');
  expect(footerWithNotice('Enter does nothing · Line 3 needs a name.', shown)).toBe('Enter only closes the notice · Line 3 needs a name.');
  // Enter that does something still does it.
  expect(footerWithNotice('Enter opens the Name form', shown)).toBe('Enter opens the Name form');
  expect(footerWithNotice('Enter does nothing · Down selects a row', { shown: true, focused: 'open' })).toBe("Enter opens what's new in a new tab");
  expect(footerWithNotice('Enter opens the Name form', { shown: true, focused: 'close' })).toBe('Enter closes the notice');
});

test("without the notice, the footer is the view's own, whatever focus was last reported on it", () => {
  expect(footerWithNotice('Enter does nothing · Down selects a row', { shown: false, focused: null })).toBe('Enter does nothing · Down selects a row');
  expect(footerWithNotice('Enter does nothing · Down selects a row', { shown: false, focused: 'close' })).toBe('Enter does nothing · Down selects a row');
});
