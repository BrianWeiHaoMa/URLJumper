// Undo of a save from the Name form, and of that Undo (G12, G15, G21, L2): the confirmation's Undo takes the
// saved line away, its outcome offers Undo that puts it back byte for byte, and so on; each offer lasts until
// the user's next action or ten seconds from its own appearance; a refused Undo stores nothing and says why;
// and every outcome fits the popup (G7) and passes the accessibility pass (G32).
import type { Page } from '@playwright/test';
import type { InsertRequest } from '../src/requests.ts';
import { checkFitAndAccessibility, expect, popupOnNewPage, rowPencils, slowWorkerReads, test, thisPagePencil, type LoadedExtension, type LocalSite } from './extension.ts';

const footer = (popup: Page) => popup.locator('footer');
const searchBox = (popup: Page) => popup.getByRole('combobox');
const nameField = (popup: Page) => popup.getByRole('textbox', { name: 'Name' });
const confirmation = (popup: Page) => popup.getByRole('status');
const undo = (popup: Page) => popup.locator('.confirmation').getByRole('button');

const insertOf = (name: string, url: string): InsertRequest => ({ kind: 'insert', name, url, note: '', heading: null });

const DOC = '\\ Daily\nmail                 https://mail.example.com/\n';

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

/** A popup on a new page whose Name form saved `name` from the *Name this page* button; the document as the save left it. */
async function savedOnNewPage(extension: LoadedExtension, site: LocalSite, name: string) {
  const opened = await popupOnNewPage(extension, site);
  await opened.popup.getByRole('button', { name: 'Name this page' }).click();
  await nameField(opened.popup).fill(name);
  await opened.popup.keyboard.press('Enter');
  await expect(confirmation(opened.popup)).toHaveText(/^Saved /);
  return { ...opened, saved: (await storedDocument(extension)) as string };
}

test('keyboard alone: Undo of a save, its Undo, and Undo again leave the document as before, after, and before the save', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { page, popup } = await popupOnNewPage(extension, site, 'Stocks today');
  await popup.keyboard.type('stocks');
  await popup.keyboard.press('Enter');
  await expect(nameField(popup)).toHaveValue('stocks');
  await popup.keyboard.press('Enter');
  await expect(confirmation(popup)).toHaveText('Saved "stocks" as line 3');
  const saved = `${DOC}stocks               ${page.url()}\n`;
  expect(await storedDocument(extension)).toBe(saved);
  // Elsewhere in the popup, the footer says what Enter does there.
  await expect(searchBox(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter does nothing · Down selects a row');

  // Past the chip, Name this page, and the gear.
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await expect(undo(popup)).toBeFocused();
  await expect(undo(popup)).toHaveAccessibleName('Undo saving "stocks"');
  await expect(footer(popup)).toHaveText('Enter undoes the save, removing its line');
  await checkFitAndAccessibility(popup);

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
  await expect(confirmation(popup)).toHaveText('Removed "stocks" from line 3');
  expect(await popup.evaluate(() => (window as { footers?: string[] }).footers)).toEqual([
    'Undoing · Enter does nothing until it is stored',
    'Enter undoes the removal, putting the line back',
  ]);
  expect(await storedDocument(extension)).toBe(DOC);
  await expect(undo(popup)).toBeFocused();
  await expect(undo(popup)).toHaveAccessibleName('Undo removing "stocks"');
  await expect(footer(popup)).toHaveText('Enter undoes the removal, putting the line back');
  await checkFitAndAccessibility(popup);

  await popup.keyboard.press('Enter');
  await expect(confirmation(popup)).toHaveText('Put "stocks" back as line 3');
  expect(await storedDocument(extension)).toBe(saved);
  await expect(undo(popup)).toHaveAccessibleName('Undo putting back "stocks"');
  await expect(footer(popup)).toHaveText('Enter undoes putting the line back, removing it again');
  await checkFitAndAccessibility(popup);

  await popup.keyboard.press('Enter');
  await expect(confirmation(popup)).toHaveText('Removed "stocks" from line 3');
  expect(await storedDocument(extension)).toBe(DOC);
  expect(await extension.tabUrls()).toContain(page.url());
});

test('the offer stays across Shift+Tab round to Undo; a key typed there goes to the search box and ends it, undoing nothing', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup, saved } = await savedOnNewPage(extension, site, 'one');
  await expect(searchBox(popup)).toBeFocused();
  // Back from the search box, round through This page is's pencil and the listed rows' pencils, to Undo. From
  // the first control the focus wraps through Chrome's own frame and lands after the key has come up: a key sent
  // before it lands starts from no control, so the next waits for it, as a user sees it land.
  // The page now has the name just saved, which *This page is* says with its pencil.
  await popup.keyboard.press('Shift+Tab');
  await expect(thisPagePencil(popup)).toBeFocused();
  await expect(confirmation(popup)).toHaveText('Saved "one" as line 3');
  await expect(rowPencils(popup)).toHaveCount(2);
  for (const pencil of [1, 0]) {
    await popup.keyboard.press('Shift+Tab');
    await expect(rowPencils(popup).nth(pencil)).toBeFocused();
    await expect(confirmation(popup)).toHaveText('Saved "one" as line 3');
  }
  await popup.keyboard.press('Shift+Tab');
  await expect(undo(popup)).toBeFocused();
  await popup.keyboard.press('Shift');
  await expect(confirmation(popup)).toHaveText('Saved "one" as line 3');

  await popup.keyboard.type('m');
  await expect(confirmation(popup)).toHaveCount(0);
  await expect(searchBox(popup)).toBeFocused();
  await expect(searchBox(popup)).toHaveValue('m');
  await expect(popup.locator('[role=option] .row-name')).toHaveText(['mail']);
  expect(await storedDocument(extension)).toBe(saved);
});

test('while an Undo awaits the worker, the popup fits and passes the accessibility pass', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await savedOnNewPage(extension, site, 'pending');
  // The Undo reads the document first; held there, it stays in flight for the rest of the check.
  await slowWorkerReads(extension.worker, 'mappings', 60_000);
  await undo(popup).focus();
  await popup.keyboard.press('Enter');
  await expect(footer(popup)).toHaveText('Undoing · Enter does nothing until it is stored');
  await expect(undo(popup)).toHaveAttribute('aria-disabled', 'true');
  await checkFitAndAccessibility(popup);
  await expect(footer(popup)).toHaveText('Undoing · Enter does nothing until it is stored');
});

test('a held Enter on Undo undoes once', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await savedOnNewPage(extension, site, 'held');
  await undo(popup).focus();
  await popup.keyboard.down('Enter');
  await expect(confirmation(popup)).toHaveText('Removed "held" from line 3');
  // Repeats of the key still held.
  await popup.keyboard.down('Enter');
  await popup.keyboard.down('Enter');
  await popup.keyboard.up('Enter');
  await popup.waitForTimeout(300);
  await expect(confirmation(popup)).toHaveText('Removed "held" from line 3');
  expect(await storedDocument(extension)).toBe(DOC);
});

test('Undo activated twice at once stores one removal and shows no refusal', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await savedOnNewPage(extension, site, 'twice');
  const changes = await extension.watchStorage();
  await undo(popup).evaluate((button: HTMLElement) => {
    button.click();
    button.click();
  });
  await expect(confirmation(popup)).toHaveText('Removed "twice" from line 3');
  await popup.waitForTimeout(300);
  await expect(confirmation(popup)).toHaveText('Removed "twice" from line 3');
  expect(await storedDocument(extension)).toBe(DOC);
  expect(await changes()).toHaveLength(1);
});

test('untouched, Undo is gone ten seconds after its confirmation appeared, and the focus it had goes back to the search box', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup, saved } = await savedOnNewPage(extension, site, 'wait');
  await undo(popup).focus();
  await popup.waitForTimeout(8_500);
  await expect(confirmation(popup)).toHaveText('Saved "wait" as line 3');
  await expect(confirmation(popup)).toHaveCount(0, { timeout: 2_500 });
  await expect(searchBox(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter does nothing · Down selects a row');
  expect(await storedDocument(extension)).toBe(saved);
});

test("an Undo's outcome has its own ten seconds, from when it appeared", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await savedOnNewPage(extension, site, 'later');
  await popup.waitForTimeout(6_000);
  await undo(popup).click();
  await expect(confirmation(popup)).toHaveText('Removed "later" from line 3');
  // Past the save's ten seconds.
  await popup.waitForTimeout(8_500);
  await expect(confirmation(popup)).toHaveText('Removed "later" from line 3');
  await expect(confirmation(popup)).toHaveCount(0, { timeout: 2_500 });
  expect(await storedDocument(extension)).toBe(DOC);
});

test('an Undo whose line another window changed stores nothing and says it was not undone', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { page, popup } = await savedOnNewPage(extension, site, 'stocks');
  const changed = `${DOC}stocks               ${page.url()}#changed\n`;
  await extension.seedStorage({ mappings: changed });
  const before = await extension.readStorage();
  await undo(popup).click();
  await expect(confirmation(popup)).toHaveText('Not undone: line 3, "stocks", was changed or removed since. Nothing was stored.');
  await expect(undo(popup)).toHaveCount(0);
  await expect(searchBox(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter does nothing · Down selects a row');
  expect(await extension.readStorage()).toEqual(before);
  await checkFitAndAccessibility(popup);
});

test("an Undo's Undo after another window took the name stores nothing and names the line that has it", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const other = await extension.openRequestPage();
  const { popup } = await savedOnNewPage(extension, site, 'stocks');
  await undo(popup).click();
  await expect(confirmation(popup)).toHaveText('Removed "stocks" from line 3');
  expect(await other.send(insertOf('Stocks', 'https://other.example/'))).toMatchObject({ kind: 'applied', line: 3 });
  const before = await extension.readStorage();
  await undo(popup).click();
  await expect(confirmation(popup)).toHaveText('Not undone: line 3 already has the name "stocks". Nothing was stored.');
  await expect(undo(popup)).toHaveCount(0);
  expect(await extension.readStorage()).toEqual(before);
  await checkFitAndAccessibility(popup);
});

test("an Undo's Undo Chrome refuses to store says so with Chrome's message, and the document stays as the Undo left it", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await savedOnNewPage(extension, site, 'full');
  await undo(popup).click();
  await expect(confirmation(popup)).toHaveText('Removed "full" from line 3');
  await extension.fillStorage(16);
  await undo(popup).click();
  await expect(confirmation(popup)).toHaveText('Not undone: nothing was stored. Chrome said: Resource::kQuotaBytes quota exceeded');
  await expect(undo(popup)).toHaveCount(0);
  expect(await storedDocument(extension)).toBe(DOC);
  await checkFitAndAccessibility(popup);
});

test('a long name: every outcome and refusal is shown whole beside Undo, the footer in view', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const other = await extension.openRequestPage();
  const name = `n${'y'.repeat(299)}`;
  const { popup } = await savedOnNewPage(extension, site, name);
  const fits = () =>
    popup.evaluate(() => {
      const box = document.querySelector<HTMLElement>('.confirmation')!;
      return {
        whole: box.scrollWidth <= box.clientWidth,
        footerInView: document.querySelector('footer')!.getBoundingClientRect().bottom <= innerHeight,
        noPageOverflow: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
      };
    });
  const whole = { whole: true, footerInView: true, noPageOverflow: true };
  expect(await fits()).toEqual(whole);
  await undo(popup).click();
  await expect(confirmation(popup)).toHaveText(`Removed "${name}" from line 3`);
  expect(await fits()).toEqual(whole);
  await checkFitAndAccessibility(popup);
  expect(await other.send(insertOf(name.toUpperCase(), 'https://other.example/'))).toMatchObject({ kind: 'applied', line: 3 });
  await undo(popup).click();
  await expect(confirmation(popup)).toHaveText(`Not undone: line 3 already has the name "${name}". Nothing was stored.`);
  expect(await fits()).toEqual(whole);
  await checkFitAndAccessibility(popup);
});

test("an Undo of a save after the last line gives that line back as it was, though another window removed a CRLF first line since", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'first first:1\r\nsecond second:1\nlast last:1' });
  const other = await extension.openRequestPage();
  const { popup } = await savedOnNewPage(extension, site, 'new');
  await expect(confirmation(popup)).toHaveText('Saved "new" as line 4');
  expect(await other.send({ kind: 'remove', line: 1, text: 'first first:1' })).toMatchObject({ kind: 'applied' });
  await expect(popup.getByRole('option')).toHaveCount(3);
  await undo(popup).click();
  await expect(confirmation(popup)).toHaveText('Removed "new" from line 3');
  expect(await storedDocument(extension)).toBe('second second:1\nlast last:1');
  await checkFitAndAccessibility(popup);
});

test('a last line ending in a lone CR comes back from the Undo of a save after it, and from the Undo of putting that save back', async ({ extension, site }) => {
  const doc = 'first first:1\nlast last:1\r';
  await extension.seedStorage({ mappings: doc });
  const { popup, saved } = await savedOnNewPage(extension, site, 'new');
  expect(saved).toMatch(/^first first:1\nlast last:1\r\nnew +\S+$/);
  await undo(popup).click();
  await expect(confirmation(popup)).toHaveText('Removed "new" from line 3');
  expect(await storedDocument(extension)).toBe(doc);
  await undo(popup).click();
  await expect(confirmation(popup)).toHaveText('Put "new" back as line 3');
  expect(await storedDocument(extension)).toBe(saved);
  await undo(popup).click();
  await expect(confirmation(popup)).toHaveText('Removed "new" from line 3');
  expect(await storedDocument(extension)).toBe(doc);
});
