import { expect, test } from 'vitest';
import { readDocument } from './grammar';
import { findSection, findSections, headingName, headingText, namedSections } from './sections';

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

test("a heading's identity is its lines' exact texts and how many headings with exactly those texts came before", () => {
  const { lines } = readDocument('\\ Work\na     a:1\n\\ Work\n\\ more\nb     b:2\n\\ Work\nc     c:3\n');
  expect(namedSections(lines).map(({ heading, identity }) => [heading.first, identity])).toEqual([
    [1, { texts: ['\\ Work'], before: 0 }],
    [3, { texts: ['\\ Work', '\\ more'], before: 0 }],
    [6, { texts: ['\\ Work'], before: 1 }],
  ]);
  expect(findSection(lines, { texts: ['\\ Work'], before: 1 })).toMatchObject({ heading: { first: 6, last: 6 }, last: 8 });
  expect(findSection(lines, { texts: ['\\ Work', '\\ more'], before: 0 })).toMatchObject({ heading: { first: 3, last: 4 }, last: 5 });
  expect(findSection(lines, { texts: ['\\ Work'], before: 2 })).toBeUndefined();
  expect(findSection(lines, { texts: ['\\ more'], before: 0 })).toBeUndefined();
});

test('a heading is found again by its texts after lines were added above it', () => {
  const { lines } = readDocument('\\ new\n\nx  x:1\n\\ Work\nw  w:1\n');
  expect(findSection(lines, { texts: ['\\ Work'], before: 0 })).toMatchObject({ heading: { first: 4, last: 4 }, last: 6 });
});

// What the Section choice shows for each heading of the document whose lines are `lines`.
const headingTexts = (...lines: string[]) => {
  const read = readDocument(lines.join('\n')).lines;
  return findSections(read).map(({ heading }) => headingText(read, heading));
};

test("a heading is shown as its lines' comment texts, trimmed, joined by single spaces", () => {
  expect(headingTexts('\\ Work', '\\   more  ', 'a  https://a')).toEqual(['Work more']);
  expect(headingTexts('  \\Daily', '\t\\\tnews\u3000', '', '\\ Search')).toEqual(['Daily news', 'Search']);
  // Spaces inside a line's text are its own.
  expect(headingTexts('\\ To  read   later')).toEqual(['To  read   later']);
});

test("only a line's first backslash starts its comment; a later one is text", () => {
  expect(headingTexts('\\ a \\ b', '\\\\')).toEqual(['a \\ b \\']);
});

test('a line with no comment text adds nothing, and a heading with none on any line has no text', () => {
  expect(headingTexts('\\', '\\ Work', '  \\   ', '\\ more', '\\')).toEqual(['Work more']);
  expect(headingTexts('\\', ' \\ ', '', '\\ Home')).toEqual(['', 'Home']);
});

test('a heading is named by its text, or, with none, by its first line', () => {
  const read = readDocument(['\\', ' \\ ', '', '\\ Home', '\\ more'].join('\n')).lines;
  expect(findSections(read).map(({ heading }) => headingName(read, heading))).toEqual(['Heading at line 1', 'Home more']);
});
