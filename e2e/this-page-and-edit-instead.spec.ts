// The row editor reached from outside the list (In use, "Name this page"; G8, G10, G11, G13, G21, G32):
// *This page is "‹name›"*, in search and in the Name form, names the first line in document order whose URL
// is the tab's address, and its pencil opens that line's editor; a name the Name form finds taken names the
// line that has it, whatever else the form refuses, and offers *Edit "‹name›" instead*, which opens the editor
// on that line and stores nothing; the editor so opened holds the line as the popup last read it, so a line
// changed since is refused, never overwritten; neither leaves the form while its Save awaits the worker, whose
// reply would close the editor opened meanwhile; and one that goes while it has the focus gives it to a
// control that stays. Every state fits and passes the accessibility pass (G7, G32).
import type { Page } from '@playwright/test';
import { checkFitAndAccessibility, expect, popupOnNewPage, rowEditor, slowWorkerReads, test, thisPagePencil, type LoadedExtension, type LocalSite } from './extension.ts';

const footer = (popup: Page) => popup.locator('footer');
const searchBox = (popup: Page) => popup.getByRole('combobox');
const nameField = (popup: Page) => popup.getByRole('textbox', { name: 'Name', exact: true });
const urlField = (popup: Page) => popup.getByRole('textbox', { name: 'URL', exact: true });
const problem = (popup: Page) => popup.locator('#name-form-problem');
const editInstead = (popup: Page) => popup.getByRole('button', { name: /^Edit ".*" instead$/s });
const namePage = (popup: Page) => popup.getByRole('button', { name: 'Name this page' });
const formHeading = (popup: Page) => popup.getByRole('heading', { name: /^Name this (page|link)$/ });

const linkClick = (linkUrl: string, pageUrl: string) => ({ menuItemId: 'name-this-link', linkUrl, pageUrl, editable: false, frameId: 0 });

/** A document whose lines 4 and 9 have the URL `address`. */
function twice(address: string) {
  return [
    '\\ Pages',
    'mail                 https://mail.example.com/',
    'stocks               https://stocks.example.com/',
    `here                 ${address}`,
    'news                 https://news.example.com/',
    '',
    '\\ Again',
    'wiki                 https://wiki.example.com/',
    `there                ${address}`,
    '',
  ].join('\n');
}

const STOCKS_LINE = 'stocks               https://stocks.example.com/        \\ markets';
const TAKEN = ['\\ Money', 'mail                 https://mail.example.com/', STOCKS_LINE, ''].join('\n');

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

/** A popup on a new page whose document is `document(page address)`, once search shows that document. */
async function popupWith(extension: LoadedExtension, site: LocalSite, document: (address: string) => string) {
  const opened = await popupOnNewPage(extension, site);
  await extension.seedStorage({ mappings: document(opened.page.url()) });
  // Opened on an empty document, the popup shows the first run until it has read the seeded one: a key sent
  // sooner lands there.
  await expect(opened.popup.getByRole('option').first()).toBeVisible();
  return opened;
}

/** The Name form's link popup for a link on `page`, the toolbar's popup on it closed first. */
async function linkForm(extension: LoadedExtension, page: Page, popup: Page) {
  await popup.close();
  await expect.poll(() => extension.openPopups()).toBe(0);
  const tab = await extension.frontTab(page);
  const linkPopup = await extension.popupOpenedBy(() => extension.dispatchEvent('contextMenus.onClicked', linkClick('https://link.example/a', page.url()), tab));
  await expect(formHeading(linkPopup)).toHaveText('Name this link');
  return linkPopup;
}

test("This page is names the first line with the tab's address, and its pencil, by Tab and Enter and by click, opens that line's editor, in search and in the Name form", async ({ extension, site }) => {
  const { page, popup } = await popupWith(extension, site, twice);
  const doc = twice(page.url());
  await expect(popup.locator('.view-content > .this-page')).toHaveText('This page is "here"');
  await expect(thisPagePencil(popup)).toHaveAccessibleName('Edit "here"');
  // Back from the search box, round through the page bar's button: the focus wraps through Chrome's own frame
  // and lands after the key has come up, so the next key waits for it.
  await popup.keyboard.press('Shift+Tab');
  await expect(namePage(popup)).toBeFocused();
  await popup.keyboard.press('Shift+Tab');
  await expect(thisPagePencil(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter edits line 4');
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Enter');
  const editor = rowEditor(popup);
  await expect(editor.name).toBeFocused();
  await expect(editor.name).toHaveValue('here');
  await expect(editor.url).toHaveValue(page.url());
  await expect(footer(popup)).toHaveText('Enter saves line 4');
  await editor.cancel.click();
  await thisPagePencil(popup).click();
  await expect(editor.name).toHaveValue('here');
  await editor.cancel.click();

  await namePage(popup).click();
  await expect(popup.locator('.subject .this-page')).toHaveText('This page is "here"');
  await expect(nameField(popup)).toBeFocused();
  await popup.keyboard.press('Shift+Tab');
  await expect(thisPagePencil(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter edits line 4 instead');
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Enter');
  await expect(formHeading(popup)).toHaveCount(0);
  await expect(editor.name).toHaveValue('here');
  await expect(editor.header).toHaveText(`here${page.url()}`);
  await editor.cancel.click();
  await namePage(popup).click();
  await thisPagePencil(popup).click();
  await expect(editor.name).toHaveValue('here');

  // A link's form says what the tab the popup was opened on is called (G11).
  const linkPopup = await linkForm(extension, page, popup);
  await expect(linkPopup.locator('.subject .this-page')).toHaveText('This page is "here"');
  await thisPagePencil(linkPopup).click();
  await expect(rowEditor(linkPopup).name).toHaveValue('here');
  await expect(rowEditor(linkPopup).url).toHaveValue(page.url());
  expect(await storedDocument(extension)).toBe(doc);
});

test("after Tab to a long This page is's pencil, which scrolls the view past the selected row, no row is selected until the focus comes back to the search box, which shows that row again", async ({ extension, site }) => {
  const longName = `n${'x'.repeat(2_999)}`;
  const { popup } = await popupWith(extension, site, (address) => `mail                 https://mail.example.com/\n${longName}  ${address}\n`);
  const selectedInView = () =>
    popup.evaluate(() => {
      const view = document.querySelector('.view')!.getBoundingClientRect();
      const row = document.querySelector('[role=option][aria-selected=true]')!.getBoundingClientRect();
      return row.top >= view.top - 0.5 && row.bottom <= view.bottom + 0.5;
    });
  await popup.keyboard.type('mail');
  await expect(popup.locator('[role=option][aria-selected=true] .row-name')).toHaveText('mail');
  for (let i = 0; i < 5; i++) await popup.keyboard.press('Tab');
  await expect(thisPagePencil(popup)).toBeFocused();
  // The row the view scrolled away from is held back: neither drawn nor named as selected (G3).
  await expect(popup.locator('[role=option][aria-selected=true]')).toHaveCount(0);
  await expect(searchBox(popup)).not.toHaveAttribute('aria-activedescendant');
  await expect(footer(popup)).toHaveText('Enter edits line 2');
  await popup.keyboard.press('Tab');
  await expect(namePage(popup)).toBeFocused();
  // Tab from the last control wraps through Chrome's own frame and lands after the key has come up.
  await popup.keyboard.press('Tab');
  await expect(searchBox(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');
  await expect.poll(selectedInView).toBe(true);
});

test('a taken name in the Name form names its line and offers to edit it instead, also beside a missing URL; the offer opens that line, storing nothing', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: TAKEN });
  const { page, popup } = await popupOnNewPage(extension, site);
  const changes = await extension.watchStorage();
  await namePage(popup).click();
  await nameField(popup).fill('STOCKS');
  await expect(problem(popup)).toHaveText('Line 3 already has the name "stocks".');
  await expect(editInstead(popup)).toHaveText('Edit "stocks" instead');
  await expect(popup.getByRole('button', { name: 'Save', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await expect(footer(popup)).toHaveText('Enter does nothing · Line 3 already has this name.');
  await popup.keyboard.press('Enter');
  await expect(nameField(popup)).toHaveValue('STOCKS');
  await editInstead(popup).focus();
  await expect(footer(popup)).toHaveText('Enter edits line 3 instead');
  await checkFitAndAccessibility(popup);

  // Beside the URL the form also refuses.
  await urlField(popup).fill('');
  await expect(problem(popup)).toHaveText('Line 4 needs a URL. Line 3 already has the name "stocks".');
  await expect(editInstead(popup)).toHaveText('Edit "stocks" instead');
  await expect(footer(popup)).toHaveText('Enter does nothing · Line 4 needs a URL.');
  await checkFitAndAccessibility(popup);
  await editInstead(popup).focus();
  await popup.keyboard.press('Enter');
  const editor = rowEditor(popup);
  await expect(editor.name).toBeFocused();
  await expect(editor.name).toHaveValue('stocks');
  await expect(editor.url).toHaveValue('https://stocks.example.com/');
  await expect(editor.note).toHaveValue('markets');
  await expect(footer(popup)).toHaveText('Enter saves line 3');

  // In a link's form, by pointer.
  const linkPopup = await linkForm(extension, page, popup);
  await nameField(linkPopup).fill('Stocks');
  await expect(problem(linkPopup)).toHaveText('Line 3 already has the name "stocks".');
  await editInstead(linkPopup).click();
  await expect(rowEditor(linkPopup).name).toHaveValue('stocks');
  await expect(rowEditor(linkPopup).note).toHaveValue('markets');
  expect((await changes()).filter((change) => 'mappings' in change || 'usage' in change)).toEqual([]);
  expect(await storedDocument(extension)).toBe(TAKEN);
});

test('the editor opened from Edit instead holds the line as the form read it: a line rewritten since stores nothing and says so', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: TAKEN });
  const { popup } = await popupOnNewPage(extension, site);
  await namePage(popup).click();
  await nameField(popup).fill('stocks');
  await editInstead(popup).click();
  const editor = rowEditor(popup);
  await expect(editor.name).toHaveValue('stocks');
  const rewritten = TAKEN.replace(STOCKS_LINE, 'stocks               https://shares.example.com/');
  await extension.seedStorage({ mappings: rewritten });
  await editor.note.fill('markets and more');
  await editor.save.click();
  await expect(editor.stale).toHaveText('Not saved: line 3, "stocks", was changed since this editor opened, and nothing was stored. It is now line 3:');
  await expect(editor.staleLine).toHaveText('stocks               https://shares.example.com/');
  await expect(editor.note).toHaveValue('markets and more');
  await expect(editor.editAgain).toBeVisible();
  expect(await storedDocument(extension)).toBe(rewritten);
});

test("This page is's pencil and Edit instead that go while they have the focus give it to the search box and the name field", async ({ extension, site }) => {
  // Another page's changes, each one write of the worker's, as another window makes them (E1).
  const other = await extension.openRequestPage();
  const { page, popup } = await popupWith(extension, site, twice);
  await popup.keyboard.press('Shift+Tab');
  await expect(namePage(popup)).toBeFocused();
  await popup.keyboard.press('Shift+Tab');
  await expect(thisPagePencil(popup)).toBeFocused();
  // Another page changes line 4's URL: the page is now line 9's.
  const here = { kind: 'rewrite', line: 4, text: `here                 ${page.url()}`, name: 'here', url: 'https://here.example/', note: '' } as const;
  expect(await other.send(here)).toMatchObject({ kind: 'applied' });
  await expect(popup.locator('.this-page')).toHaveText('This page is "there"');
  await expect(searchBox(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter does nothing · Down selects a row');

  await extension.seedStorage({ mappings: TAKEN });
  await namePage(popup).click();
  await nameField(popup).fill('stocks');
  await editInstead(popup).focus();
  await expect(footer(popup)).toHaveText('Enter edits line 3 instead');
  // Another page renames line 3: the name is free, and the offer goes.
  const rename = { kind: 'rewrite', line: 3, text: STOCKS_LINE, name: 'shares', url: 'https://stocks.example.com/', note: 'markets' } as const;
  expect(await other.send(rename)).toMatchObject({ kind: 'applied' });
  await expect(editInstead(popup)).toHaveCount(0);
  await expect(nameField(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter saves it as line 4');
});

test("while the Name form's Save awaits the worker, This page is's pencil and Edit instead wait, so the reply closes no editor opened meanwhile", async ({ extension, site }) => {
  const { page, popup } = await popupWith(extension, site, twice);
  await namePage(popup).click();
  await nameField(popup).fill('fresh');
  // Every editor that ever shows from here on.
  await popup.evaluate(() => {
    const seen: string[] = [];
    Object.defineProperty(window, 'editors', { value: seen });
    new MutationObserver(() => {
      if (document.querySelector('.row-editor')) seen.push('editor');
    }).observe(document.body, { childList: true, subtree: true });
  });
  // The insert reads the document first; held there, it stays in flight for three seconds.
  await slowWorkerReads(extension.worker, 'mappings', 3_000);
  await popup.keyboard.press('Enter');
  await expect(footer(popup)).toHaveText('Saving · Enter does nothing until it is stored');
  await expect(thisPagePencil(popup)).toHaveAttribute('aria-disabled', 'true');
  // Forced: Playwright waits for a control that says it is disabled to say otherwise before it clicks it.
  await thisPagePencil(popup).click({ force: true });
  await thisPagePencil(popup).press('Enter');
  // A name typed meanwhile that another line has: its offer waits too.
  await nameField(popup).fill('here');
  await expect(editInstead(popup)).toHaveAttribute('aria-disabled', 'true');
  await editInstead(popup).click({ force: true });
  await expect(popup.getByRole('status')).toHaveText('Saved "fresh" as line 10');
  expect(await popup.evaluate(() => (window as unknown as { editors: string[] }).editors)).toEqual([]);
  expect(await storedDocument(extension)).toBe(`${twice(page.url())}${'fresh'.padEnd(21)}${page.url()}\n`);
});
