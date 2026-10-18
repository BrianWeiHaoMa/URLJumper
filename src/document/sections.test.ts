import { expect, test } from 'vitest';
import { readDocument } from './grammar';
import { findSections } from './sections';

const sectionsOf = (...lines: string[]) => findSections(readDocument(lines.join('\n')).lines);

test('a heading is a maximal run of comment-only lines; a blank line ends it, and its section runs to the next', () => {
  expect(sectionsOf('\\ Daily', '  \\ more', '', '\\ Search', 'news https://n  \\  a \\ b ')).toEqual([
    { heading: { first: 1, last: 2 }, last: 3 },
    { heading: { first: 4, last: 4 }, last: 5 },
  ]);
});

test('lines before the first heading are in no section, and the last section runs to the last line', () => {
  expect(sectionsOf('x https://x', '\\ Work', 'w https://w', '')).toEqual([{ heading: { first: 2, last: 2 }, last: 4 }]);
});

test('a mapping or unreadable line with a comment is not a heading line and splits a run', () => {
  expect(sectionsOf('\\ one', 'a https://a \\ note', '\\ two', 'bad \\ comment', '\\ three')).toEqual([
    { heading: { first: 1, last: 1 }, last: 2 },
    { heading: { first: 3, last: 3 }, last: 4 },
    { heading: { first: 5, last: 5 }, last: 5 },
  ]);
});

test('a document without comment lines has no sections', () => {
  expect(sectionsOf('a https://a', '', 'b https://b')).toEqual([]);
  expect(sectionsOf('')).toEqual([]);
});
