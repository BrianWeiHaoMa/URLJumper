// The Name form from inside the popup (In use, "Name this page", "Name from a search"): the Name row and the
// *Name this page* button open it (G1 (f), G4), it shows the page or says Chrome gave no address (E5, N6),
// what the page is already called (G10), the Section choice (G9, P2), a preview of the exact line, and why
// Save is blocked (G8, L2), and it fits the popup (G7) and passes the accessibility pass (G32).
import type { Page } from '@playwright/test';
import { checkFitAndAccessibility, closingPopup, expect, popupOnNewPage, test, type LoadedExtension, type LocalSite } from './extension.ts';

const footer = (popup: Page) => popup.locator('footer');
const selected = (popup: Page) => popup.locator('[role=option][aria-selected=true]');
const nameField = (popup: Page) => popup.getByRole('textbox', { name: 'Name' });
const urlField = (popup: Page) => popup.getByRole('textbox', { name: 'URL' });
const sectionChoice = (popup: Page) => popup.getByRole('listbox', { name: 'Section' });
const problem = (popup: Page) => popup.locator('#name-form-problem');
const where = (popup: Page) => popup.locator('.preview-where');
const previewLine = (popup: Page) => popup.locator('.preview-line');

// The open tabs but the extension's own pages.
async function pageTabs(extension: LoadedExtension) {
  return (await extension.tabUrls()).filter((url) => !url.startsWith(extension.url('')));
}

/** A page of the local site at `url`, and the popup the toolbar button opens on it. */
async function popupOn(extension: LoadedExtension, url: string) {
  const page = await extension.context.newPage();
  await page.goto(url);
  return { page, popup: await extension.clickToolbarButton(page) };
}

/** The form opened from the *Name this page* button of a popup on a new page titled `title`. */
async function formOnNewPage(extension: LoadedExtension, site: LocalSite, title = 'A page to name') {
  const opened = await popupOnNewPage(extension, site, title);
  await opened.popup.getByRole('button', { name: 'Name this page' }).click();
  await expect(nameField(opened.popup)).toBeFocused();
  return opened;
}

test('text that matches no name lists the Name row, selected; Enter opens the form with that name, the page shown and nothing opened', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  const { page, popup } = await popupOnNewPage(extension, site, 'The page for zz');
  await popup.keyboard.type('zz');
  await expect(popup.getByRole('option')).toHaveCount(1);
  await expect(selected(popup)).toHaveAccessibleName('Name "zz" for this page');
  await expect(footer(popup)).toHaveText('Enter opens the Name form');
  await checkFitAndAccessibility(popup);

  const tabs = await pageTabs(extension);
  await popup.keyboard.press('Enter');
  await expect(nameField(popup)).toHaveValue('zz');
  await expect(nameField(popup)).toBeFocused();
  await expect(urlField(popup)).toHaveValue(page.url());
  await expect(popup.locator('.subject-title')).toHaveText('The page for zz');
  await expect(popup.locator('.subject-host')).toHaveText(new URL(page.url()).host);
  // One row, two lines, no headings: no Section choice; the line it previews goes after line 1.
  await expect(sectionChoice(popup)).toHaveCount(0);
  await expect(where(popup)).toHaveText('Line 2, at the end of the document');
  await expect(previewLine(popup)).toHaveText(`zz ${page.url()}`);
  await expect(footer(popup)).toHaveText('Enter saves it as line 2');
  expect(await pageTabs(extension)).toEqual(tabs);
  await checkFitAndAccessibility(popup);
});

test('address matches come first and the Name row last, reached with Down and counted in the cue; text that starts a name lists none', async ({ extension, site }) => {
  const lines = Array.from({ length: 7 }, (_, i) => `m${i + 1}  https://shared.example/${i + 1}\n`).join('');
  await extension.seedStorage({ mappings: lines });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('shared');
  await expect(selected(popup).locator('.row-name')).toHaveText('m1');
  await expect(popup.locator('.cue')).toHaveText('1 more below');
  for (let i = 0; i < 7; i++) await popup.keyboard.press('ArrowDown');
  await expect(selected(popup)).toHaveAccessibleName('Name "shared" for this page');
  await expect(selected(popup)).toHaveAttribute('aria-posinset', '8');
  await expect(selected(popup)).toBeInViewport({ ratio: 1 });
  await expect(popup.locator('.cue')).toHaveText('1 more above');
  await expect(footer(popup)).toHaveText('Enter opens the Name form');

  await popup.getByRole('combobox').fill('m');
  await expect(popup.getByRole('option')).toHaveCount(7);
  await expect(popup.getByRole('option', { name: /^Name / })).toHaveCount(0);
});

test('Shift+Enter and a click on the Name row open the form as Enter does, and open no page', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  for (const open of [(popup: Page) => popup.keyboard.press('Shift+Enter'), (popup: Page) => selected(popup).click({ modifiers: ['Shift'] }), (popup: Page) => selected(popup).click()]) {
    const { popup } = await popupOnNewPage(extension, site);
    await popup.keyboard.type('new name');
    const tabs = await pageTabs(extension);
    await open(popup);
    await expect(nameField(popup)).toHaveValue('new name');
    await popup.waitForTimeout(300);
    expect(await pageTabs(extension)).toEqual(tabs);
    await popup.close();
  }
});

test('the Name this page button opens the form with an empty, focused name field and the title shown, never put in the name', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  const { popup } = await popupOnNewPage(extension, site, 'Stock prices');
  await popup.keyboard.type('typed in search');
  await popup.getByRole('button', { name: 'Name this page' }).focus();
  await expect(footer(popup)).toHaveText('Enter opens the Name form');
  await popup.keyboard.press('Enter');
  await expect(nameField(popup)).toBeFocused();
  await expect(nameField(popup)).toHaveValue('');
  await expect(popup.locator('.subject-title')).toHaveText('Stock prices');
  await expect(problem(popup)).toHaveText('Line 2 needs a name.');
  await expect(footer(popup)).toHaveText('Enter does nothing · Line 2 needs a name.');
  await checkFitAndAccessibility(popup);
  // Cancel goes back to search as it was.
  await popup.getByRole('button', { name: 'Cancel' }).focus();
  await expect(footer(popup)).toHaveText('Enter returns to search');
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('combobox')).toBeFocused();
  await expect(popup.getByRole('combobox')).toHaveValue('typed in search');
  await expect(selected(popup)).toHaveAccessibleName('Name "typed in search" for this page');
});

test('a name another line holds, in any case, is refused with that line, and Save stores nothing by Enter or click', async ({ extension, site }) => {
  const doc = '\\ Work\nw  https://w.example/\nCal  https://c.example/\n';
  await extension.seedStorage({ mappings: doc });
  const { popup } = await formOnNewPage(extension, site);
  for (const typed of ['cal', 'CAL', ' Cal ']) {
    await nameField(popup).fill(typed);
    await expect(problem(popup)).toHaveText('Line 3 already has the name "Cal".');
    await expect(footer(popup)).toHaveText('Enter does nothing · Line 3 already has this name.');
    await expect(nameField(popup)).toHaveAttribute('aria-invalid', 'true');
    await popup.keyboard.press('Enter');
    // A blocked Save is still there to click; Playwright waits forever for a control marked disabled to enable.
    await expect(popup.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
    await popup.getByRole('button', { name: 'Save' }).click({ force: true });
    await popup.waitForTimeout(200);
    expect((await extension.readStorage()).mappings).toBe(doc);
    await expect(nameField(popup)).toHaveValue(typed);
  }
  await checkFitAndAccessibility(popup);
  // Escape closes the popup from the form too, storing nothing.
  await closingPopup(popup, () => popup.keyboard.press('Escape'));
  expect((await extension.readStorage()).mappings).toBe(doc);
});

test('a long name another line holds is named whole in the refusal, and the form still fits', async ({ extension, site }) => {
  const taken = `taken ${'n'.repeat(300)}`;
  await extension.seedStorage({ mappings: `${taken}  https://t.example/\n` });
  const { popup } = await formOnNewPage(extension, site);
  // Typed in another case: the refusal names the line's own name.
  await nameField(popup).fill(taken.toUpperCase());
  await expect(problem(popup)).toHaveText(`Line 1 already has the name "${taken}".`);
  await expect(footer(popup)).toHaveText('Enter does nothing · Line 1 already has this name.');
  await checkFitAndAccessibility(popup);
});

test('a backslash in the name, a URL without a scheme or with whitespace are refused naming the line, and kept as typed; any other URL saves', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  const { page, popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('a\\b');
  await popup.keyboard.press('Enter');
  await expect(nameField(popup)).toHaveValue('a\\b');
  await expect(problem(popup)).toHaveText('Line 2: a name cannot contain a backslash (\\), which starts a comment.');
  await expect(footer(popup)).toHaveText('Enter does nothing · Line 2: a name cannot contain a backslash (\\), which starts a comment.');

  await nameField(popup).fill('ab');
  for (const [url, says] of [
    ['example.com', 'Line 2: a URL must begin with a scheme, such as https:'],
    ['https://a b', 'Line 2: a URL cannot contain spaces or other whitespace.'],
    ['https://a\\b', 'Line 2: a URL cannot contain a backslash (\\), which starts a comment.'],
    ['', 'Line 2 needs a URL.'],
  ] as const) {
    await urlField(popup).fill(url);
    await expect(problem(popup)).toHaveText(says);
    await expect(urlField(popup)).toHaveAttribute('aria-invalid', 'true');
    await popup.keyboard.press('Enter');
    await popup.waitForTimeout(100);
    await expect(urlField(popup)).toHaveValue(url);
  }
  expect((await extension.readStorage()).mappings).toBe('a  https://a.example/\n');

  // G8 asks a scheme and no whitespace, backslash, or line break, and nothing more.
  await urlField(popup).fill('https://[');
  await expect(problem(popup)).toHaveCount(1);
  await expect(problem(popup)).toHaveText('');
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('status')).toHaveText('Saved "ab" as line 2');
  expect((await extension.readStorage()).mappings).toBe('a  https://a.example/\nab https://[\n');
  expect(await pageTabs(extension)).toContain(page.url());
});

test('a page whose address a mapping has says what it is called, in search and in the form, and naming it again adds a second line', async ({ extension, site }) => {
  const address = site.pageUrl('Stocks');
  const doc = `news  https://n.example/\nstocks  ${address}\nshares  ${address}\n`;
  await extension.seedStorage({ mappings: doc });
  let { page, popup } = await popupOn(extension, address);
  await expect(popup.locator('.view-content > .this-page')).toHaveText('This page is "stocks"');
  await checkFitAndAccessibility(popup);
  await popup.getByRole('button', { name: 'Name this page' }).click();
  await expect(popup.locator('.subject .this-page')).toHaveText('This page is "stocks"');
  await checkFitAndAccessibility(popup);
  await nameField(popup).fill('portfolio');
  await expect(problem(popup)).toHaveText('');
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('status')).toHaveText('Saved "portfolio" as line 4');
  const stored = (await extension.readStorage()).mappings as string;
  expect(stored).toBe(`${doc}portfolio ${address}\n`);

  // An address that differs by a final slash is another address.
  await extension.seedStorage({ mappings: `stocks  ${address}/\n` });
  await page.close();
  ({ page, popup } = await popupOn(extension, address));
  await expect(popup.getByRole('button', { name: 'Name this page' })).toBeVisible();
  await expect(popup.locator('.this-page')).toHaveCount(0);
});

test('a long typed name is cut in the Name row with the words around it whole; a long name of the page wraps whole', async ({ extension, site }) => {
  const address = site.pageUrl('Long');
  await extension.seedStorage({ mappings: `n${'x'.repeat(299)}  ${address}\n` });
  const { popup } = await popupOn(extension, address);
  const typed = 'q'.repeat(300);
  await popup.getByRole('combobox').fill(typed);
  await expect(selected(popup)).toHaveAccessibleName(`Name "${typed}" for this page`);
  const shown = () =>
    popup.evaluate(() => {
      const whole = (element: HTMLElement) => element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().width > 0;
      const name = document.querySelector<HTMLElement>('.name-row-name')!;
      return {
        nameCut: name.scrollWidth > name.clientWidth && getComputedStyle(name).textOverflow === 'ellipsis' && name.scrollLeft === 0,
        wordsWhole: [...document.querySelectorAll<HTMLElement>('.name-row-words, .this-page, .name-page, footer')].every(whole),
        footerInView: document.querySelector('footer')!.getBoundingClientRect().bottom <= innerHeight,
        noPageOverflow: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
        viewScrolls: document.querySelector('.view')!.scrollHeight > document.querySelector('.view')!.clientHeight,
      };
    });
  expect(await shown()).toEqual({ nameCut: true, wordsWhole: true, footerInView: true, noPageOverflow: true, viewScrolls: false });
  await checkFitAndAccessibility(popup);

  // A name nearly as long as a document can be: the view scrolls to it, the footer and button stay in view.
  // (Text partly scrolled out of the view is where axe cannot judge contrast, so the pass ran above.)
  const longName = `n${'x'.repeat(9_999)}`;
  await extension.seedStorage({ mappings: `${longName}  ${address}\n` });
  await expect(popup.locator('.this-page')).toHaveText(`This page is "${longName}"`);
  expect(await shown()).toEqual({ nameCut: true, wordsWhole: true, footerInView: true, noPageOverflow: true, viewScrolls: true });
  await expect(popup.getByRole('button', { name: 'Name this page' })).toBeInViewport({ ratio: 1 });
});

test('without the toolbar grant the form shows no title or host, says Chrome gave no address, and saves once a URL is pasted', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Never granted'));
  const popup = await extension.popupByCommand('open-new-tab', page);
  await expect(popup.locator('.this-page')).toHaveCount(0);
  await popup.getByRole('button', { name: 'Name this page' }).click();
  await expect(popup.locator('.subject-missing')).toHaveText('Chrome gave no address for this tab: type or paste the URL.');
  await expect(popup.locator('.subject-title, .subject-host')).toHaveCount(0);
  await expect(urlField(popup)).toHaveValue('');
  await popup.keyboard.type('later');
  await expect(footer(popup)).toHaveText('Enter does nothing · Line 2 needs a URL.');
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Enter');
  await popup.waitForTimeout(200);
  expect((await extension.readStorage()).mappings).toBe('a  https://a.example/\n');

  await urlField(popup).focus();
  await popup.keyboard.insertText(page.url());
  await nameField(popup).focus();
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('status')).toHaveText('Saved "later" as line 2');
  expect((await extension.readStorage()).mappings).toBe(`a  https://a.example/\nlater ${page.url()}\n`);
});

test('the Section choice is offered only with headings, starts at End of document, and shows each heading by its comment text', async ({ extension, site }) => {
  const doc = '\\ Work\n\\   more  \nw  w:1\n\n\\\n\\ \nh  h:1\n';
  await extension.seedStorage({ mappings: doc });
  const { page, popup } = await formOnNewPage(extension, site);
  await expect(popup.getByRole('option')).toHaveText(['End of document', 'Work more', 'Heading at line 5']);
  await expect(popup.getByRole('option', { selected: true })).toHaveText('End of document');
  await nameField(popup).fill('new');
  await expect(where(popup)).toHaveText('Line 8, at the end of the document');

  await sectionChoice(popup).focus();
  await popup.keyboard.press('ArrowDown');
  await expect(popup.getByRole('option', { selected: true })).toHaveText('Work more');
  await expect(where(popup)).toHaveText('Line 4, at the end of the section "Work more"');
  await expect(previewLine(popup)).toHaveText(`new ${page.url()}`);
  await expect(footer(popup)).toHaveText('Enter saves it as line 4');
  await checkFitAndAccessibility(popup);
  // A click chooses too.
  await popup.getByRole('option', { name: 'Heading at line 5' }).click();
  await expect(where(popup)).toHaveText('Line 8, at the end of the section "Heading at line 5"');

  // A heading of 300 characters is shown whole, wrapped, in the choice and in the preview.
  const long = `${'Long heading '.repeat(23)}end`;
  await extension.seedStorage({ mappings: `${doc}\\ ${long}\nl  l:1\n` });
  await expect(popup.getByRole('option')).toHaveText(['End of document', 'Work more', 'Heading at line 5', long]);
  await sectionChoice(popup).focus();
  await popup.keyboard.press('End');
  await expect(where(popup)).toHaveText(`Line 10, at the end of the section "${long}"`);
  const whole = await popup.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[role=option], .preview-where')].every((element) => element.scrollWidth <= element.clientWidth),
  );
  expect(whole).toBe(true);
  expect(await popup.getByRole('option').last().evaluate((option) => option.getBoundingClientRect().height)).toBeGreaterThan(40);

  await extension.seedStorage({ mappings: 'a  a:1\n' });
  await expect(sectionChoice(popup)).toHaveCount(0);
});

test('a long title and URL wrap: the form keeps its footer in view, nothing of its own is cut, and the view scrolls', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: '\\ Work\nw  https://w.example/\n' });
  const title = `T${'itle words '.repeat(27)}end`;
  const { popup } = await formOnNewPage(extension, site, title);
  const url = `https://example.com/${'p'.repeat(1980)}`;
  const name = 'n'.repeat(300);
  await nameField(popup).fill(name);
  await urlField(popup).fill(url);
  await expect(previewLine(popup)).toHaveText(`${name} ${url}`);
  await expect(footer(popup)).toHaveText('Enter saves it as line 3');
  const shown = await popup.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const view = document.querySelector('.view')!;
    return {
      footerInView: box('footer').bottom <= innerHeight && box('footer').top >= 0,
      headerInView: box('header').top >= 0,
      noPageOverflow: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
      viewScrolls: view.scrollHeight > view.clientHeight && getComputedStyle(view).overflowY === 'auto',
      uncut: [...document.querySelectorAll<HTMLElement>('.subject p, .preview-where, .preview-line, [role=option], footer, .form-problem, button')].every(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
      titleWhole: document.querySelector('.subject-title')!.textContent,
    };
  });
  expect(shown).toEqual({ footerInView: true, headerInView: true, noPageOverflow: true, viewScrolls: true, uncut: true, titleWhole: title });
  await checkFitAndAccessibility(popup);
});
