// The pencils of the popup's rows (In use, "Edit from a suggestion"; G3, G4, G7, G32, F13, R4): every mapping
// and argument row of the seven-row window has one, drawn on its row and reached by Tab from the search box
// after the window's rows, in row order; its click, Enter, or Space opens that row's editor and never jumps;
// the pencils follow the window as Down and the wheel move it; the Name row has none; Tab and Shift+Tab across
// them keep a confirmation (G15) and the notice of what is new (G25); a pencil that goes while it has the focus
// gives the focus to the search box (G32); and every state fits and passes the accessibility pass (G7, G32).
import type { Page } from '@playwright/test';
import {
  checkFitAndAccessibility,
  expect,
  lineConfirmation,
  popupOnNewPage,
  rowEditor,
  rowPencils,
  selectedRow,
  selectedRowName,
  test,
  thisPagePencil,
  upgradeNotice,
  watchRequests,
  type LoadedExtension,
} from './extension.ts';

const footer = (popup: Page) => popup.locator('footer');
const searchBox = (popup: Page) => popup.getByRole('combobox');
const namePage = (popup: Page) => popup.getByRole('button', { name: 'Name this page' });
const pencilNames = (popup: Page) => rowPencils(popup).evaluateAll((pencils) => pencils.map((pencil) => pencil.getAttribute('aria-label')));

const pad = (n: number) => String(n).padStart(2, '0');
/** Twenty mappings, `m01` to `m20`, one per line. */
const TWENTY = Array.from({ length: 20 }, (_, i) => `m${pad(i + 1)}                  https://m${pad(i + 1)}.example/`).join('\n') + '\n';
const edits = (from: number, count: number) => Array.from({ length: count }, (_, i) => `Edit "m${pad(from + i)}"`);

const STOCKS = [
  '\\ Money',
  'mail                 https://mail.example.com/',
  'stocks               https://stocks.example.com/        \\ markets',
  'stock fund           https://fund.example.com/',
  'stockpile            https://pile.example.com/',
  '',
].join('\n');

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

/** Whether every pencil stands on the row in the same place of the window, inside it, beside its name's line and above its URL's. */
function pencilsOnTheirRows(popup: Page) {
  return popup.evaluate(() => {
    const rows = [...document.querySelectorAll('[role=option]')];
    const slots = [...document.querySelectorAll('.row-pencil-slot')];
    return (
      rows.length === slots.length &&
      rows.every((row, i) => {
        const pencil = slots[i]!.querySelector('button');
        if (pencil === null) return row.querySelector('.row-name') === null;
        const [r, p] = [row.getBoundingClientRect(), pencil.getBoundingClientRect()];
        const [name, url] = [...row.querySelectorAll('.row-line')];
        const nameEnds = [...name!.children].every((part) => part.getBoundingClientRect().right <= p.left);
        return p.top >= r.top && p.bottom <= r.bottom && p.right <= r.right && nameEnds && name!.getBoundingClientRect().bottom > p.top && url!.getBoundingClientRect().top >= p.bottom - 0.5;
      })
    );
  });
}

test("each row of the seven-row window has its pencil, which follows the window; a click on one opens that row's editor and opens nothing", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: TWENTY });
  const jumps = await watchRequests(extension.worker, 'jump');
  const { popup } = await popupOnNewPage(extension, site);
  const tabs = await extension.tabUrls();
  await popup.keyboard.type('m');
  await expect(rowPencils(popup)).toHaveCount(7);
  expect(await pencilNames(popup)).toEqual(edits(1, 7));
  expect(await pencilsOnTheirRows(popup)).toBe(true);

  // Down past the seventh row moves the window by one, and the pencils with it.
  for (let i = 0; i < 7; i++) await popup.keyboard.press('ArrowDown');
  await expect(selectedRowName(popup)).toHaveText('m08');
  await expect.poll(() => pencilNames(popup)).toEqual(edits(2, 7));
  // The wheel over a pencil moves the window as over its row: three rows for 120 pixels.
  await rowPencils(popup).nth(1).hover();
  await popup.mouse.wheel(0, 120);
  await expect.poll(() => pencilNames(popup)).toEqual(edits(5, 7));
  expect(await pencilsOnTheirRows(popup)).toBe(true);

  await rowPencils(popup).nth(2).click();
  const editor = rowEditor(popup);
  await expect(editor.name).toBeFocused();
  await expect(editor.name).toHaveValue('m07');
  await expect(editor.url).toHaveValue('https://m07.example/');
  await expect(footer(popup)).toHaveText('Enter saves line 7');
  expect(await jumps()).toEqual([]);
  expect(await extension.tabUrls()).toEqual(tabs);
  expect('usage' in (await extension.readStorage())).toBe(false);
});

test('the Name row has no pencil; address matches and the argument row each have one', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: `${TWENTY}yt                   https://www.youtube.com/results?search_query=%s\n` });
  const { popup } = await popupOnNewPage(extension, site);
  // Address matches, then the Name row last: up from the first row wraps to it.
  await popup.keyboard.type('example');
  await popup.keyboard.press('ArrowUp');
  await expect(selectedRow(popup)).toHaveAccessibleName('Name "example" for this page');
  await expect.poll(() => pencilNames(popup)).toEqual(edits(15, 6));
  expect(await pencilsOnTheirRows(popup)).toBe(true);
  await checkFitAndAccessibility(popup);

  await searchBox(popup).fill('nothing like it');
  await expect(popup.getByRole('option')).toHaveCount(1);
  await expect(rowPencils(popup)).toHaveCount(0);

  await searchBox(popup).fill('yt lo-fi beats');
  await expect(popup.getByRole('option')).toHaveCount(1);
  expect(await pencilNames(popup)).toEqual(['Edit "yt"']);
  await rowPencils(popup).click();
  // Opened from the argument row, the editor copies its filled URL (G31).
  await expect(rowEditor(popup).header).toHaveText('ythttps://www.youtube.com/results?search_query=lo-fi%20beats');
});

test('Tab from the search box reaches the chip, Name this page, the gear, then the pencils in row order; Enter and Space on the second open its row, not the selected one', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: STOCKS });
  const jumps = await watchRequests(extension.worker, 'jump');
  const { popup } = await popupOnNewPage(extension, site);
  const tabs = await extension.tabUrls();
  await popup.keyboard.type('stock');
  await expect(popup.locator('[role=option] .row-name')).toHaveText(['stocks', 'stock fund', 'stockpile']);
  await popup.keyboard.press('Tab');
  await expect(popup.locator('.chip')).toBeFocused();
  await popup.keyboard.press('Tab');
  await expect(namePage(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter opens the Name form');
  await popup.keyboard.press('Tab');
  await expect(popup.getByRole('button', { name: 'Settings' })).toBeFocused();
  for (const [i, line] of [3, 4, 5].entries()) {
    await popup.keyboard.press('Tab');
    await expect(rowPencils(popup).nth(i)).toBeFocused();
    await expect(footer(popup)).toHaveText(`Enter edits line ${line}`);
  }
  await checkFitAndAccessibility(popup);

  for (const key of ['Enter', 'Space']) {
    await popup.keyboard.press('Shift+Tab');
    await expect(rowPencils(popup).nth(1)).toHaveAccessibleName('Edit "stock fund"');
    await expect(rowPencils(popup).nth(1)).toBeFocused();
    await popup.keyboard.press(key);
    const editor = rowEditor(popup);
    await expect(editor.name, key).toBeFocused();
    await expect(editor.name, key).toHaveValue('stock fund');
    await editor.cancel.click();
    await expect(searchBox(popup)).toHaveValue('stock');
    await expect(selectedRowName(popup)).toHaveText('stocks');
    await popup.keyboard.press('Tab');
    await popup.keyboard.press('Tab');
    await popup.keyboard.press('Tab');
    await popup.keyboard.press('Tab');
    await popup.keyboard.press('Tab');
    await popup.keyboard.press('Tab');
    await expect(rowPencils(popup).last()).toBeFocused();
  }
  expect(await jumps()).toEqual([]);
  expect(await extension.tabUrls()).toEqual(tabs);
  expect(await storedDocument(extension)).toBe(STOCKS);
});

test('with a results region that scrolls, Tab reaches the region before the pencils, then the pencil of what the page is called', async ({ extension, site }) => {
  const { page, popup } = await popupOnNewPage(extension, site, 'Long');
  const longName = `n${'x'.repeat(2_999)}`;
  await extension.seedStorage({ mappings: `${STOCKS}${longName}  ${page.url()}\n` });
  await popup.keyboard.type('stock');
  await expect(rowPencils(popup)).toHaveCount(3);
  await expect(popup.locator('.this-page')).toHaveText(`This page is "${longName}"`);
  for (let i = 0; i < 4; i++) await popup.keyboard.press('Tab');
  expect(await popup.evaluate(() => document.activeElement?.className)).toBe('view');
  for (let i = 0; i < 3; i++) {
    await popup.keyboard.press('Tab');
    await expect(rowPencils(popup).nth(i)).toBeFocused();
  }
  await popup.keyboard.press('Tab');
  await expect(thisPagePencil(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter edits line 6');
  await popup.keyboard.press('Tab');
  await expect(searchBox(popup)).toBeFocused();
});

test('seven rows of 300-character names and URLs with an address match, and with the argument row, fit with every pencil whole', async ({ extension, site }) => {
  const long = (start: string, fill: string) => `${start}${fill.repeat(300 - start.length)}`;
  const addresses = [
    ...Array.from({ length: 6 }, (_, i) => `${long(`zz${i}`, 'n')}  ${long(`https://zz${i}.example/`, 'u')}`),
    `${long('other', 'o')}  ${long('https://zz.example/', 'u')}`,
  ];
  const argument = [
    ...Array.from({ length: 6 }, (_, i) => `${long(`yt lo-fi ${i}`, 'n')}  ${long(`https://yt${i}.example/`, 'u')}`),
    `yt  ${long('https://www.youtube.com/results?search_query=%s&', 'p')}`,
  ];
  await extension.seedStorage({ mappings: `${[...addresses, ...argument].join('\n')}\n` });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('zz');
  await expect(popup.getByRole('option')).toHaveCount(7);
  await expect(popup.locator('.row-tag', { hasText: 'address match' })).toHaveCount(1);
  expect(await pencilsOnTheirRows(popup)).toBe(true);
  await checkFitAndAccessibility(popup);

  await searchBox(popup).fill('yt lo-fi');
  await expect(popup.getByRole('option')).toHaveCount(7);
  await expect(rowPencils(popup).last()).toHaveAccessibleName('Edit "yt"');
  expect(await pencilsOnTheirRows(popup)).toBe(true);
  await checkFitAndAccessibility(popup);
});

test("a change's confirmation stays while Tab and Shift+Tab cross the pencils, and its Undo still works", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: STOCKS });
  const { popup } = await popupOnNewPage(extension, site);
  // A pencil's editor deletes its line at once and returns to a blank box with the confirmation.
  await popup.keyboard.type('stock');
  await rowPencils(popup).nth(2).click();
  await rowEditor(popup).delete.click();
  const { text, undo } = lineConfirmation(popup);
  await expect(text).toHaveText('Removed "stockpile" from line 5');
  await expect(rowPencils(popup)).toHaveCount(3);
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await expect(undo).toBeFocused();
  for (let i = 0; i < 3; i++) {
    await popup.keyboard.press('Tab');
    await expect(rowPencils(popup).nth(i)).toBeFocused();
    await expect(text).toHaveText('Removed "stockpile" from line 5');
  }
  // (Inside the confirmation's ten seconds: the pencils' states pass the accessibility pass in the checks above.)
  for (let i = 0; i < 3; i++) await popup.keyboard.press('Shift+Tab');
  await expect(undo).toBeFocused();
  await expect(text).toHaveText('Removed "stockpile" from line 5');
  await popup.keyboard.press('Enter');
  await expect(text).toHaveText('Put "stockpile" back as line 5');
  expect(await storedDocument(extension)).toBe(STOCKS);
});

test('after an update from 1.x, Tab reaches the notice before any pencil, and Shift+Tab back leaves it shown', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: STOCKS });
  await extension.dispatchEvent('runtime.onInstalled', { reason: 'update', previousVersion: '1.3.0' });
  await expect.poll(async () => (await extension.readStorage()).upgradeNotice).toBe('pending');
  const { popup } = await popupOnNewPage(extension, site);
  const { notice, open, close } = upgradeNotice(popup);
  await expect(notice).toBeVisible();
  await expect(rowPencils(popup)).toHaveCount(4);
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await expect(open).toBeFocused();
  await popup.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await popup.keyboard.press('Tab');
  await expect(rowPencils(popup).first()).toBeFocused();
  await popup.keyboard.press('Tab');
  await expect(rowPencils(popup).nth(1)).toBeFocused();
  for (let i = 0; i < 7; i++) await popup.keyboard.press('Shift+Tab');
  await expect(searchBox(popup)).toBeFocused();
  await expect(notice).toBeVisible();
  expect((await extension.readStorage()).upgradeNotice).toBe('pending');
});

test("after an update from 1.x, a pencil's click opens the editor with the notice, which Tab and Shift+Tab keep and a key typed in a field dismisses", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: STOCKS });
  await extension.dispatchEvent('runtime.onInstalled', { reason: 'update', previousVersion: '1.3.0' });
  await expect.poll(async () => (await extension.readStorage()).upgradeNotice).toBe('pending');
  const { popup } = await popupOnNewPage(extension, site);
  const { notice, close } = upgradeNotice(popup);
  await expect(notice).toBeVisible();
  await rowPencils(popup).nth(1).click();
  const editor = rowEditor(popup);
  await expect(editor.name).toBeFocused();
  await expect(editor.name).toHaveValue('stocks');
  await expect(notice).toBeVisible();
  await checkFitAndAccessibility(popup);
  // Copy tab URL, above the fields, stands between the notice and the name field.
  await popup.keyboard.press('Shift+Tab');
  await expect(editor.copyTabUrl).toBeFocused();
  await popup.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter closes the notice');
  await popup.keyboard.press('Tab');
  await expect(editor.copyTabUrl).toBeFocused();
  await popup.keyboard.press('Tab');
  await expect(editor.name).toBeFocused();
  await expect(notice).toBeVisible();
  expect((await extension.readStorage()).upgradeNotice).toBe('pending');
  // Tab into the field selected its text, which the typed key replaces.
  await popup.keyboard.type('!');
  await expect(notice).toHaveCount(0);
  await expect(editor.name).toHaveValue('!');
  await expect.poll(async () => 'upgradeNotice' in (await extension.readStorage())).toBe(false);
});

test('a pencil that goes while it has the focus, its mapping removed or the window moved, gives the focus to the search box', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: STOCKS });
  // Another page's changes, each one write of the worker's, as another window makes them (E1).
  const other = await extension.openRequestPage();
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('stock');
  for (let i = 0; i < 5; i++) await popup.keyboard.press('Tab');
  await expect(rowPencils(popup).nth(1)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter edits line 4');
  expect(await other.send({ kind: 'remove', line: 4, text: 'stock fund           https://fund.example.com/' })).toMatchObject({ kind: 'applied' });
  await expect.poll(() => pencilNames(popup)).toEqual(['Edit "stocks"', 'Edit "stockpile"']);
  await expect(searchBox(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');

  // A line removed above moves the focused pencil's line, and what its footer says, with it.
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await expect(rowPencils(popup).first()).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter edits line 3');
  expect(await other.send({ kind: 'remove', line: 2, text: 'mail                 https://mail.example.com/' })).toMatchObject({ kind: 'applied' });
  await expect(footer(popup)).toHaveText('Enter edits line 2');
  await expect(rowPencils(popup).first()).toBeFocused();

  await extension.seedStorage({ mappings: TWENTY });
  await searchBox(popup).fill('m');
  for (let i = 0; i < 4; i++) await popup.keyboard.press('Tab');
  await expect(rowPencils(popup).first()).toHaveAccessibleName('Edit "m01"');
  await expect(rowPencils(popup).first()).toBeFocused();
  await rowPencils(popup).nth(3).hover();
  await popup.mouse.wheel(0, 40);
  await expect.poll(() => pencilNames(popup)).toEqual(edits(2, 7));
  await expect(searchBox(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');
});
