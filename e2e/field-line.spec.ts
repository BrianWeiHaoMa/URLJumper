// A single-line field's line (G7, E8): every field of the popup (the search box, the Name form's name and URL,
// the row editor's name, URL, and note, from a search row and in the List view) keeps its stylesheet's line for
// Latin and its placeholder, raises its own line when its value's marks, as the machine's fonts draw them,
// reach past that line's room, and draws the value whole; it stops at four times its font size, where marks
// stacked past any script's writing are cut and the popup still fits (G7); and it returns to its base when its
// value no longer needs more. A field that appears already holding a value is sized as it appears. The values
// are drawn by the fonts Playwright's Chromium needs on Linux: Thai marks stacked by its fallback font, and
// acute accents stacked by the sans-serif face.
import type { Locator, Page } from '@playwright/test';
import { checkFitAndAccessibility, expect, fieldDrawnWhole, listViewIn, popupOnNewPage, rowEditor, rowPencils, selectedRow, test } from './extension.ts';

// A Thai consonant under a vowel and three tone marks, and the same consonant over three vowels: marks past the
// room of every field's base line, above and below, short of its cap.
const MARKS_ABOVE = 'ปั้้้';
const MARKS_BELOW = 'ปุุุ';
// Runs of one repeated mark, stacked past any script's writing: acute accents, which the monospace URL field
// draws on top of one another, and Thai tone marks, which every field stacks.
const PAST_ANY_WRITING = `a${'́'.repeat(40)}`;
const PAST_ANY_WRITING_IN_URL = `https://m.example/ป${'้'.repeat(20)}`;

// The fields' stylesheet lines and their caps: 16 px text in the search box, 14 px in the forms, 12 px in a URL field.
const SEARCH = { base: 30, cap: 64 };
const FORM = { base: 26, cap: 56 };
const URL_FIELD = { base: 26, cap: 48 };

/** The line `field` is drawn with, whether the field carries a line of its own, and its height. */
function lineOf(field: Locator) {
  return field.evaluate((input: HTMLInputElement) => ({
    line: parseFloat(getComputedStyle(input).lineHeight),
    own: input.style.lineHeight !== '',
    height: input.getBoundingClientRect().height,
  }));
}

/** Fails unless `field` keeps its base line, set by the stylesheet alone. */
async function expectBase(field: Locator, { base }: { base: number }) {
  expect(await lineOf(field)).toMatchObject({ line: base, own: false });
}

/** Fails unless `field` has raised its line, in whole pixels, short of its cap, and draws its value whole. */
async function expectRaisedAndWhole(page: Page, field: Locator, { base, cap }: { base: number; cap: number }) {
  const { line } = await lineOf(field);
  expect(line).toBeGreaterThan(base);
  expect(line).toBeLessThan(cap);
  expect(Number.isInteger(line)).toBe(true);
  expect(await fieldDrawnWhole(page, field)).toBe(true);
}

/** Fails unless `field`'s line is its cap and the field holds it. */
async function expectCap(field: Locator, { cap }: { cap: number }) {
  expect(await lineOf(field)).toMatchObject({ line: cap, own: true, height: cap + 4 });
}

/** Everything in the popup's header, and whether anything drew on a canvas: the rule adds no element. */
function elementsAdded(popup: Page) {
  return popup.evaluate(() => ({ header: document.querySelectorAll('main > header *').length, canvases: document.querySelectorAll('canvas').length }));
}

test('the search box keeps its base for Latin and its placeholder, raises its line for marks above or below, stops at its cap with the popup whole, and returns to its base', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  const box = popup.getByRole('combobox');
  await expectBase(box, SEARCH);
  await checkFitAndAccessibility(popup);
  const before = await elementsAdded(popup);

  await box.fill('stocks');
  await expectBase(box, SEARCH);
  for (const marks of [MARKS_ABOVE, MARKS_BELOW]) {
    await box.fill(marks);
    await expectRaisedAndWhole(popup, box, SEARCH);
    await checkFitAndAccessibility(popup);
    // Whole-pixel lines keep the popup's content a whole number of pixels tall.
    expect(Number.isInteger(await popup.evaluate(() => document.querySelector('main')!.getBoundingClientRect().height))).toBe(true);
  }
  expect(await elementsAdded(popup)).toEqual(before);

  await box.fill(PAST_ANY_WRITING);
  await expectCap(box, SEARCH);
  await checkFitAndAccessibility(popup);

  await box.fill('stocks');
  await expectBase(box, SEARCH);
});

test("a grown search box keeps search's selection whole: Down to the seventh row, then marks that grow the box, selects the first row (G3)", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: Array.from({ length: 9 }, (_, i) => `${MARKS_ABOVE} ${i + 1}  https://m${i + 1}.example/\n`).join('') });
  const { popup } = await popupOnNewPage(extension, site);
  const box = popup.getByRole('combobox');
  await box.pressSequentially('ป');
  for (let i = 0; i < 6; i++) await popup.keyboard.press('ArrowDown');
  await expect(selectedRow(popup)).toContainText(`${MARKS_ABOVE} 7`);
  await expectBase(box, SEARCH);

  await popup.keyboard.insertText(MARKS_ABOVE.slice(1));
  await expect(box).toHaveValue(MARKS_ABOVE);
  await expect(selectedRow(popup)).toContainText(`${MARKS_ABOVE} 1`);
  await expectRaisedAndWhole(popup, box, SEARCH);
  const [row, view] = await Promise.all([selectedRow(popup).boundingBox(), popup.locator('.view').boundingBox()]);
  expect(row!.y).toBeGreaterThanOrEqual(view!.y);
  expect(row!.y + row!.height).toBeLessThanOrEqual(view!.y + view!.height);
  await checkFitAndAccessibility(popup);
});

test("the Name form's name, prefilled from the Name row, is sized as the form appears; its name and URL fields each raise their own line, stop at their caps, and return", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.getByRole('combobox').fill(MARKS_ABOVE);
  await popup.keyboard.press('Enter');
  const name = popup.getByRole('textbox', { name: 'Name', exact: true });
  const url = popup.getByRole('textbox', { name: 'URL', exact: true });
  await expect(name).toHaveValue(MARKS_ABOVE);
  await expectRaisedAndWhole(popup, name, FORM);
  await expectBase(url, URL_FIELD);
  await checkFitAndAccessibility(popup);

  await url.fill(`https://m.example/${MARKS_BELOW}`);
  await expectRaisedAndWhole(popup, url, URL_FIELD);
  await checkFitAndAccessibility(popup);

  await name.fill(PAST_ANY_WRITING);
  await url.fill(PAST_ANY_WRITING_IN_URL);
  await expectCap(name, FORM);
  await expectCap(url, URL_FIELD);
  await checkFitAndAccessibility(popup);

  await name.fill('stocks');
  await url.fill('https://m.example/');
  await expectBase(name, FORM);
  await expectBase(url, URL_FIELD);
});

test("the List view's row editor in the popup raises each field's line alone, stops at the caps, and returns to the base", async ({ extension, site }) => {
  const { page, view, check } = await listViewIn('popup', extension, site, { mappings: 'm  https://m.example/\n' });
  await view.pencil('m').click();
  const editor = rowEditor(page);
  await expectBase(editor.name, FORM);
  await expectBase(editor.url, URL_FIELD);
  await expectBase(editor.note, FORM);

  await editor.name.fill(MARKS_ABOVE);
  await expectRaisedAndWhole(page, editor.name, FORM);
  await expectBase(editor.url, URL_FIELD);
  await expectBase(editor.note, FORM);
  await editor.url.fill(`https://m.example/${MARKS_ABOVE}`);
  await editor.note.fill(MARKS_BELOW);
  await expectRaisedAndWhole(page, editor.url, URL_FIELD);
  await expectRaisedAndWhole(page, editor.note, FORM);
  await check();

  await editor.name.fill(PAST_ANY_WRITING);
  await editor.url.fill(PAST_ANY_WRITING_IN_URL);
  await editor.note.fill(PAST_ANY_WRITING);
  await expectCap(editor.name, FORM);
  await expectCap(editor.url, URL_FIELD);
  await expectCap(editor.note, FORM);
  await check();

  await editor.name.fill('m');
  await expectBase(editor.name, FORM);
});

test("a search row's editor opens with its name's line raised, and the search box is back holding its marks, sized, after Cancel", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: `${MARKS_BELOW}  https://m.example/\n` });
  const { popup } = await popupOnNewPage(extension, site);
  const box = popup.getByRole('combobox');
  await box.fill(MARKS_BELOW);
  await expectRaisedAndWhole(popup, box, SEARCH);

  await rowPencils(popup).first().click();
  const editor = rowEditor(popup);
  await expect(editor.name).toHaveValue(MARKS_BELOW);
  await expectRaisedAndWhole(popup, editor.name, FORM);
  await checkFitAndAccessibility(popup);

  await editor.cancel.click();
  await expect(box).toHaveValue(MARKS_BELOW);
  await expectRaisedAndWhole(popup, box, SEARCH);
  await checkFitAndAccessibility(popup);
});

test("the options page's row editor raises its fields' lines as the popup's does", async ({ extension, site }) => {
  const { page, view, check } = await listViewIn('options page', extension, site, { mappings: 'm  https://m.example/\n' });
  await view.pencil('m').click();
  const editor = rowEditor(page);
  await editor.name.fill(MARKS_BELOW);
  await expectRaisedAndWhole(page, editor.name, FORM);
  await check();
});
