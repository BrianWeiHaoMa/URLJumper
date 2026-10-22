// Saving from the Name form (G9, G12, G13, G15, G21): the line the preview shows is the line stored, in
// the section chosen when it was chosen, or at the end when its heading is gone; another window's write is
// followed; a refusal keeps every value, and Cancel waits for the reply, so a refusal is said in the form; and
// the confirmation names the name and the line from the worker's reply, until the user's next action or ten
// seconds.
import type { Page } from '@playwright/test';
import type { InsertRequest } from '../src/requests.ts';
import { checkFitAndAccessibility, closingPopup, expect, holdPageRequests, popupOnNewPage, selectedRow, slowWorkerReads, test, type LoadedExtension, type LocalSite } from './extension.ts';

const footer = (popup: Page) => popup.locator('footer');
const nameField = (popup: Page) => popup.getByRole('textbox', { name: 'Name' });
const urlField = (popup: Page) => popup.getByRole('textbox', { name: 'URL' });
const noteField = (popup: Page) => popup.getByRole('textbox', { name: 'Note', exact: true });
const sectionChoice = (popup: Page) => popup.getByRole('listbox', { name: 'Section' });
const problem = (popup: Page) => popup.locator('#name-form-problem');
const where = (popup: Page) => popup.locator('.preview-where');
const confirmation = (popup: Page) => popup.getByRole('status');
/** The preview's line as drawn, its spaces kept. */
const previewShown = (popup: Page) => popup.locator('.preview-line').evaluate((line) => (line as HTMLElement).innerText);

const insertOf = (name: string, url: string, heading: InsertRequest['heading'] = null): InsertRequest => ({ kind: 'insert', name, url, note: '', heading });

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

// The open tabs but the extension's own pages.
async function pageTabs(extension: LoadedExtension) {
  return (await extension.tabUrls()).filter((url) => !url.startsWith(extension.url('')));
}

/** The form opened from the *Name this page* button of a popup on a new page, with `name` typed. */
async function formOnNewPage(extension: LoadedExtension, site: LocalSite, name: string) {
  const opened = await popupOnNewPage(extension, site);
  await opened.popup.getByRole('button', { name: 'Name this page' }).click();
  await nameField(opened.popup).fill(name);
  return opened;
}

test('typed zz, Enter on the Name row, Enter again: one line after the last, per F12, confirmed from search; zz then opens the page', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  const { page, popup } = await popupOnNewPage(extension, site, 'Named zz');
  const address = page.url();
  const tabs = await pageTabs(extension);
  await popup.keyboard.type('zz');
  await popup.keyboard.press('Enter');
  await expect(nameField(popup)).toHaveValue('zz');
  await popup.keyboard.press('Enter');
  await expect(confirmation(popup)).toHaveText('Saved "zz" as line 2');
  expect(await storedDocument(extension)).toBe(`a  https://a.example/\nzz ${page.url()}\n`);
  // Back in search with a blank box, where nothing is selected.
  await expect(popup.getByRole('combobox')).toBeFocused();
  await expect(popup.getByRole('combobox')).toHaveValue('');
  await expect(selectedRow(popup)).toHaveCount(0);
  await expect(footer(popup)).toHaveText('Enter does nothing · Down selects a row');
  expect(await pageTabs(extension)).toEqual(tabs);
  expect(page.url()).toBe(address);
  await checkFitAndAccessibility(popup);

  // The name now opens the page in a new tab.
  await popup.keyboard.type('zz');
  const before = new Set(extension.context.pages());
  await closingPopup(popup, () => popup.keyboard.press('Enter'));
  await expect.poll(() => extension.context.pages().filter((tab) => !before.has(tab)).map((tab) => tab.url())).toEqual([address]);
});

test('the button, a name, and Enter save; the preview of a CRLF document is the line stored, which keeps CRLF', async ({ extension, site }) => {
  const doc = 'mail                 https://mail.example.com/\r\nnews                 https://news.example.com/\r\n';
  await extension.seedStorage({ mappings: doc });
  const { page, popup } = await formOnNewPage(extension, site, 'stocks');
  const line = `stocks               ${page.url()}`;
  expect(await previewShown(popup)).toBe(line);
  await expect(where(popup)).toHaveText('Line 3, at the end of the document');
  await popup.keyboard.press('Enter');
  await expect(confirmation(popup)).toHaveText('Saved "stocks" as line 3');
  expect(await storedDocument(extension)).toBe(`${doc}${line}\r\n`);
});

test("a note typed in the form is the line's trailing comment, trimmed, as the preview shows; a backslash in it blocks Save and stays in its field", async ({ extension, site }) => {
  const doc = 'mail                 https://mail.example.com/\n';
  await extension.seedStorage({ mappings: doc });
  const { page, popup } = await formOnNewPage(extension, site, 'stocks');
  await expect(noteField(popup)).toHaveValue('');
  await noteField(popup).fill('a \\ b');
  const refused = 'Line 2: a note cannot contain a backslash (\\).';
  await expect(problem(popup)).toHaveText(refused);
  await expect(noteField(popup)).toHaveAttribute('aria-invalid', 'true');
  await expect(footer(popup)).toHaveText(`Enter does nothing · ${refused}`);
  await popup.keyboard.press('Enter');
  await expect(noteField(popup)).toHaveValue('a \\ b');
  expect(await storedDocument(extension)).toBe(doc);
  await checkFitAndAccessibility(popup);

  await noteField(popup).fill('  daily prices  ');
  // F12: a new line's note follows the URL after one space and a backslash.
  const line = `stocks               ${page.url()} \\ daily prices`;
  expect(await previewShown(popup)).toBe(line);
  await expect(noteField(popup)).toHaveAttribute('aria-invalid', 'false');
  await expect(footer(popup)).toHaveText('Enter saves it as line 2');
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Enter');
  await expect(confirmation(popup)).toHaveText('Saved "stocks" as line 2');
  expect(await storedDocument(extension)).toBe(`${doc}${line}\n`);
});

test('while it saves the footer says Enter does nothing; a long name is confirmed whole, the footer in view', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  const name = `n${'y'.repeat(299)}`;
  const { popup } = await formOnNewPage(extension, site, name);
  await expect(footer(popup)).toHaveText('Enter saves it as line 2');
  // Every text the footer shows from here on, in order.
  await popup.evaluate(() => {
    const seen: string[] = [];
    Object.defineProperty(window, 'footers', { value: seen });
    new MutationObserver(() => {
      const text = document.querySelector('footer')?.textContent ?? '';
      if (seen.at(-1) !== text) seen.push(text);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await popup.keyboard.press('Enter');
  await expect(confirmation(popup)).toHaveText(`Saved "${name}" as line 2`);
  expect(await popup.evaluate(() => (window as { footers?: string[] }).footers)).toEqual([
    'Saving · Enter does nothing until it is stored',
    'Enter does nothing · Down selects a row',
  ]);
  const shown = await popup.evaluate(() => {
    const box = document.querySelector<HTMLElement>('.confirmation')!;
    return {
      whole: box.scrollWidth <= box.clientWidth,
      footerInView: document.querySelector('footer')!.getBoundingClientRect().bottom <= innerHeight,
      noPageOverflow: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
    };
  });
  expect(shown).toEqual({ whole: true, footerInView: true, noPageOverflow: true });
  await checkFitAndAccessibility(popup);
});

test('while the save awaits the worker, the form fits and passes the accessibility pass', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  const { popup } = await formOnNewPage(extension, site, 'pending');
  // The insert reads the document first; held there, the save stays in flight for the rest of the check.
  await slowWorkerReads(extension.worker, 'mappings', 60_000);
  await popup.keyboard.press('Enter');
  await expect(footer(popup)).toHaveText('Saving · Enter does nothing until it is stored');
  await expect(popup.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
  await checkFitAndAccessibility(popup);
  await expect(footer(popup)).toHaveText('Saving · Enter does nothing until it is stored');
});

test('while the save awaits the worker, Cancel waits, its footer saying so, and the reply confirms the line in search', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  const { popup } = await formOnNewPage(extension, site, 'pending');
  const held = await holdPageRequests(popup, 'insert');
  await popup.keyboard.press('Enter');
  await expect.poll(held.held).toBe(1);
  const cancel = popup.getByRole('button', { name: 'Cancel' });
  await expect(cancel).toHaveAttribute('aria-disabled', 'true');
  await cancel.focus();
  await expect(footer(popup)).toHaveText('Saving · Enter does nothing until it is stored');
  await popup.keyboard.press('Enter');
  await expect(nameField(popup)).toHaveValue('pending');
  await held.release();
  await expect(confirmation(popup)).toHaveText('Saved "pending" as line 2');
  await expect(nameField(popup)).toHaveCount(0);
});

test('the chosen heading is found again by its identity: a heading and a line added above it leave the line in its section', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: '\\ Work\nw  https://w.example/\n\n\\ Home\nh  https://h.example/\n\n\\ Later\nl  https://l.example/\n' });
  const { page, popup } = await formOnNewPage(extension, site, 'tv');
  await sectionChoice(popup).focus();
  await popup.keyboard.press('ArrowDown');
  await popup.keyboard.press('ArrowDown');
  await expect(popup.getByRole('option', { selected: true })).toHaveText('Home');
  // Home is now the third heading, and the end of the document lies past the section after it.
  const moved =
    '\\ Zeta\nz  https://z.example/\n\\ Work\nx  https://x.example/\nw  https://w.example/\n\n\\ Home\nh  https://h.example/\n\n\\ Later\nl  https://l.example/\n';
  await extension.seedStorage({ mappings: moved });
  await expect(where(popup)).toHaveText('Line 9, at the end of the section "Home"');
  await expect(popup.getByRole('option', { selected: true })).toHaveText('Home');
  await popup.keyboard.press('Enter');
  await expect(confirmation(popup)).toHaveText('Saved "tv" as line 9');
  expect(await storedDocument(extension)).toBe(moved.replace('h  https://h.example/\n', `h  https://h.example/\ntv ${page.url()}\n`));
});

test('a chosen heading no longer found sends the line to the end, and the preview and the confirmation say so', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: '\\ Work\na  https://a.example/\n\\ Work\nb  https://b.example/\n' });
  const { page, popup } = await formOnNewPage(extension, site, 'gone');
  await sectionChoice(popup).focus();
  await popup.keyboard.press('End');
  await expect(where(popup)).toHaveText('Line 5, at the end of the section "Work"');
  const shorter = 'a  https://a.example/\n\\ Work\nb  https://b.example/\n';
  await extension.seedStorage({ mappings: shorter });
  await expect(where(popup)).toHaveText('Line 4, at the end of the document: the heading you chose is no longer there');
  await expect(popup.getByRole('option', { selected: true })).toHaveCount(0);
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Enter');
  await expect(confirmation(popup)).toHaveText('Saved "gone" as line 4, at the end of the document: the heading you chose was not found');
  expect(await storedDocument(extension)).toBe(`${shorter}gone ${page.url()}\n`);
});

test("another window's insert of the typed name makes it taken with its line; one elsewhere moves the preview's line, the typing kept", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: '\\ Work\nw  https://w.example/\n\n\\ Home\nh  https://h.example/\n' });
  const other = await extension.openRequestPage();
  const { popup } = await formOnNewPage(extension, site, 'shared');
  await expect(where(popup)).toHaveText('Line 6, at the end of the document');
  await other.send(insertOf('x', 'https://x.example/', { texts: ['\\ Work'], before: 0 }));
  await expect(where(popup)).toHaveText('Line 7, at the end of the document');
  await expect(nameField(popup)).toHaveValue('shared');
  await other.send(insertOf('Shared', 'https://s.example/'));
  await expect(problem(popup)).toHaveText('Line 7 already has the name "Shared".');
  await expect(footer(popup)).toHaveText('Enter does nothing · Line 7 already has this name.');
  await checkFitAndAccessibility(popup);
  await expect(nameField(popup)).toHaveValue('shared');
});

test("an insert of the same name from another window as Enter is pressed: one line has the name, and the popup says which", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  const other = await extension.openRequestPage();
  const { page, popup } = await formOnNewPage(extension, site, 'race');
  await Promise.all([other.send(insertOf('race', 'https://other.example/')), popup.keyboard.press('Enter')]);
  await expect.poll(async () => ((await storedDocument(extension)) as string).split('\n').filter((line) => line.startsWith('race ')).length).toBe(1);
  const stored = (await storedDocument(extension)) as string;
  const raceLine = stored.split('\n').findIndex((line) => line.startsWith('race ')) + 1;
  if (stored.includes(page.url())) {
    await expect(confirmation(popup)).toHaveText(`Saved "race" as line ${raceLine}`);
  } else {
    await expect(problem(popup)).toHaveText(new RegExp(`^(Not saved: line ${raceLine} already has this name\\.|Line ${raceLine} already has the name "race"\\.)$`));
    await expect(nameField(popup)).toHaveValue('race');
    await expect(urlField(popup)).toHaveValue(page.url());
  }
});

test("a save Chrome refuses to store says so with Chrome's message and keeps every value; the document is unchanged", async ({ extension, site }) => {
  const doc = '\\ Work\nw  https://w.example/\n';
  await extension.seedStorage({ mappings: doc });
  await extension.fillStorage(16);
  const { page, popup } = await formOnNewPage(extension, site, 'full');
  await sectionChoice(popup).focus();
  await popup.keyboard.press('ArrowDown');
  await popup.keyboard.press('Enter');
  await expect(problem(popup)).toHaveText('Not saved. Chrome said: Resource::kQuotaBytes quota exceeded');
  await expect(nameField(popup)).toHaveValue('full');
  await expect(urlField(popup)).toHaveValue(page.url());
  await expect(popup.getByRole('option', { selected: true })).toHaveText('Work');
  expect(await storedDocument(extension)).toBe(doc);
  await checkFitAndAccessibility(popup);
});

test('Enter pressed twice at once stores one line and shows one confirmation and no refusal', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  const { page, popup } = await formOnNewPage(extension, site, 'twice');
  await popup.keyboard.press('Enter');
  await popup.keyboard.press('Enter');
  await expect.poll(() => storedDocument(extension)).toBe(`a  https://a.example/\ntwice ${page.url()}\n`);
  await expect(popup.getByRole('combobox')).toBeVisible();
  await popup.waitForTimeout(300);
  expect(await storedDocument(extension)).toBe(`a  https://a.example/\ntwice ${page.url()}\n`);
  expect(await confirmation(popup).count()).toBeLessThanOrEqual(1);
  await expect(popup.locator('[role=alert], #name-form-problem')).toHaveCount(0);
});

test('a popup closed as Enter saves leaves the old document or the old document and the line, and the next popup lists it', async ({ extension, site }) => {
  const doc = 'a  https://a.example/\n';
  await extension.seedStorage({ mappings: doc });
  const { page, popup } = await formOnNewPage(extension, site, 'closed');
  await popup.keyboard.press('Enter');
  await popup.close();
  await page.waitForTimeout(500);
  const stored = await storedDocument(extension);
  expect([doc, `${doc}closed ${page.url()}\n`]).toContain(stored);
  const next = await extension.clickToolbarButton(page);
  await expect.poll(() => next.locator('[role=option] .row-name').allTextContents()).toEqual(stored === doc ? ['a'] : ['a', 'closed']);
});

test('the confirmation stays across Tab, Shift+Tab, and the accessibility pass, goes at the next typed key or move, and after ten seconds', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: Array.from({ length: 9 }, (_, i) => `m${i + 1}  https://m${i + 1}.example/\n`).join('') });
  const { popup } = await formOnNewPage(extension, site, 'one');
  await popup.keyboard.press('Enter');
  await expect(confirmation(popup)).toHaveText('Saved "one" as line 10');
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Shift+Tab');
  await popup.keyboard.press('Shift');
  await checkFitAndAccessibility(popup);
  await expect(confirmation(popup)).toHaveText('Saved "one" as line 10');
  await popup.keyboard.type('o');
  await expect(confirmation(popup)).toHaveCount(0);

  await popup.getByRole('button', { name: 'Name this page' }).click();
  await nameField(popup).fill('two');
  await popup.keyboard.press('Enter');
  await expect(confirmation(popup)).toHaveText('Saved "two" as line 11');
  await popup.keyboard.press('ArrowDown');
  await expect(confirmation(popup)).toHaveCount(0);

  // The pointer moving is not an action; the wheel moving the list's window is.
  await popup.getByRole('button', { name: 'Name this page' }).click();
  await nameField(popup).fill('three');
  await popup.keyboard.press('Enter');
  await expect(confirmation(popup)).toHaveText('Saved "three" as line 12');
  await popup.getByRole('listbox').hover();
  await expect(confirmation(popup)).toHaveCount(1);
  await popup.mouse.wheel(0, 100);
  await expect(popup.locator('.cue')).toHaveText(/more above/);
  await expect(confirmation(popup)).toHaveCount(0);

  await popup.getByRole('button', { name: 'Name this page' }).click();
  await nameField(popup).fill('four');
  await popup.keyboard.press('Enter');
  await expect(confirmation(popup)).toHaveText('Saved "four" as line 13');
  await popup.waitForTimeout(8_500);
  await expect(confirmation(popup)).toHaveText('Saved "four" as line 13');
  await expect(confirmation(popup)).toHaveCount(0, { timeout: 2_500 });
});
