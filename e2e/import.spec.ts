// Import in the Text view (G20, G19, F10, G31, G32; In use, "Edit the text"; Composition, "Chrome"):
// any chosen file is read as UTF-8, its byte-order mark dropped and an invalid byte read as U+FFFD (S14), and
// its text becomes the Text view's draft, as the text area holds it, against the stored document as its base;
// nothing is stored until Save. Over a kept draft with unsaved changes the Text view asks first, also over one
// still on its way to the worker, and keeping the draft imports nothing; a file read that ends after the Text
// view is shown still arrives. Both hosts offer Import only in the Text view.
import type { Page } from '@playwright/test';
import type { Draft } from '../src/draft.ts';
import {
  checkAccessibilityInBothSchemes,
  expect,
  holdFileReads,
  holdPageReads,
  importFile,
  slowWorkerReads,
  storedDraft,
  test,
  textView,
  textViewOnOptionsPage,
  typeAtEnd,
  watchRequests,
  type LoadedExtension,
} from './extension.ts';

const DOC = 'a  https://a/\nb  https://b/\n';
// EF BB BF is the byte-order mark; FF is never valid in UTF-8; the endings are CRLF, a lone CR, and LF.
const FILE = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('x  https://x.example/\r\ny'), Buffer.from([0xff]), Buffer.from('  https://y.example/\rz  https://z.example/\n')]);
const SHOWN = 'x  https://x.example/\ny�  https://y.example/\nz  https://z.example/\n';

/** A draft a Text view kept, as a check seeds it. */
function kept(text: string, base: string): Draft {
  return { text, base, time: 1_700_000_000_000, view: 'earlier-view', number: 4 };
}

async function optionsPage(extension: LoadedExtension): Promise<Page> {
  const page = await extension.context.newPage();
  await page.goto(extension.url('options.html#view=text'));
  await expect(page.getByRole('button', { name: 'Import…' })).toBeVisible();
  await expect(textView(page).area).toHaveValue(DOC);
  await checkAccessibilityInBothSchemes(page);
  return page;
}

/** The Text view's question over a kept draft before it takes Import's file. */
const question = (page: Page) => textView(page).keptOffer.filter({ hasText: 'replaces it.' });
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name, exact: true });
const replaceWithFile = (page: Page) => page.getByRole('button', { name: 'Replace it with the file' });
const keepDraft = (page: Page) => page.getByRole('button', { name: 'Keep the unsaved text' });

test('a file with a byte-order mark, an invalid byte, and CRLF endings becomes the draft as the text area holds it, against the stored document, and only Save stores it', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  const page = await optionsPage(extension);
  await importFile(page, 'mappings.txt', FILE);
  const view = textView(page);
  await expect(view.area).toHaveValue(SHOWN);
  await expect(view.area).toBeEditable();
  await expect(view.area).toBeFocused();
  await expect(question(page)).toHaveCount(0);
  await expect(nav(page, 'Text')).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => storedDraft(extension.worker)).toMatchObject({ text: SHOWN, base: DOC });
  expect((await extension.readStorage()).mappings).toBe(DOC);
  await checkAccessibilityInBothSchemes(page);
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect((await extension.readStorage()).mappings).toBe(SHOWN);
  await expect.poll(() => storedDraft(extension.worker)).toBeUndefined();
  await checkAccessibilityInBothSchemes(page);
});

test('over a kept draft with unsaved changes the Text view asks before it takes the file: keeping the draft imports nothing and offers it, replacing it makes the file the draft', async ({ extension }) => {
  const draft = kept(`${DOC}mine  https://mine/\n`, DOC);
  await extension.seedStorage({ mappings: DOC, draft });
  const page = await optionsPage(extension);
  await importFile(page, 'mappings.txt', FILE);
  const view = textView(page);
  await expect(question(page)).toContainText('Importing mappings.txt replaces it.');
  await expect(replaceWithFile(page)).toBeFocused();
  await expect(view.area).toHaveValue(DOC);
  await expect(view.area).not.toBeEditable();
  await checkAccessibilityInBothSchemes(page);
  await keepDraft(page).click();
  await expect(question(page)).toHaveCount(0);
  await expect(view.resume).toBeFocused();
  await expect(view.area).not.toBeEditable();
  expect(await extension.readStorage()).toEqual({ mappings: DOC, draft });
  await checkAccessibilityInBothSchemes(page);
  await view.resume.click();
  await expect(view.area).toHaveValue(draft.text);
  await checkAccessibilityInBothSchemes(page);
  await page.close();

  const again = await optionsPage(extension);
  await importFile(again, 'mappings.txt', FILE);
  await expect(question(again)).toBeVisible();
  await checkAccessibilityInBothSchemes(again);
  await replaceWithFile(again).click();
  const replaced = textView(again);
  await expect(replaced.area).toHaveValue(SHOWN);
  await expect(replaced.area).toBeEditable();
  await expect(replaced.keptOffer).toHaveCount(0);
  await expect.poll(() => storedDraft(extension.worker)).toMatchObject({ text: SHOWN, base: DOC });
  expect((await extension.readStorage()).mappings).toBe(DOC);
  await checkAccessibilityInBothSchemes(again);
});

test('Import asks over text just typed in this Text view whose draft has not yet landed', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  const view = await textViewOnOptionsPage(extension);
  await slowWorkerReads(extension.worker, 'draft', 2_000);
  const sets = await watchRequests(extension.worker, 'draft-set');
  await typeAtEnd(view, 'mine  https://mine/\n');
  // Import remounts the editor, flushing the draft still waiting on its debounce.
  await importFile(view.page, 'mappings.txt', FILE);
  await expect.poll(sets).toHaveLength(1);
  await expect(question(view.page)).toBeVisible({ timeout: 10_000 });
  expect(await storedDraft(extension.worker)).toMatchObject({ text: `${DOC}mine  https://mine/\n`, base: DOC });
  await checkAccessibilityInBothSchemes(view.page);
  await keepDraft(view.page).click();
  await checkAccessibilityInBothSchemes(view.page);
  await view.resume.click();
  await expect(view.area).toHaveValue(`${DOC}mine  https://mine/\n`);
  await checkAccessibilityInBothSchemes(view.page);
});

test("Import asks over a draft another view stored while the Text view's first read was answered late", async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  const writer = await textViewOnOptionsPage(extension);
  const page = await optionsPage(extension);
  const reads = await holdPageReads(page);
  await importFile(page, 'mappings.txt', FILE);
  await expect.poll(reads.held).toBe(1);
  const unsaved = `${DOC}unsaved  https://unsaved/\n`;
  await writer.area.fill(unsaved);
  await expect.poll(async () => (await storedDraft(extension.worker))?.text).toBe(unsaved);
  await expect.poll(reads.held).toBe(2);
  while ((await reads.held()) > 0) await reads.release();
  await expect(question(page)).toBeVisible();
  expect((await storedDraft(extension.worker))?.text).toBe(unsaved);
  await checkAccessibilityInBothSchemes(page);
  await replaceWithFile(page).click();
  await expect(textView(page).area).toHaveValue(SHOWN);
  await expect.poll(async () => (await storedDraft(extension.worker))?.text).toBe(SHOWN);
  await checkAccessibilityInBothSchemes(page);
});

test('a file read late in Text still becomes the draft, asked about over the edit made meanwhile', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  const page = await optionsPage(extension);
  const finishRead = await holdFileReads(page);
  await importFile(page, 'mappings.txt', FILE);
  const view = textView(page);
  await expect(view.area).toBeEditable();
  await finishRead();
  await expect(view.area).toHaveValue(SHOWN);
  await expect.poll(() => storedDraft(extension.worker)).toMatchObject({ text: SHOWN, base: DOC });

  // Read late over an edit typed meanwhile, the file waits for the answer.
  await nav(page, 'Preferences').click();
  await checkAccessibilityInBothSchemes(page);
  await nav(page, 'Text').click();
  await checkAccessibilityInBothSchemes(page);
  await view.discard.click();
  await importFile(page, 'second.txt', FILE);
  await typeAtEnd(view, 'meanwhile  https://meanwhile/\n');
  await finishRead();
  await expect(question(page)).toContainText('Importing second.txt replaces it.');
  await checkAccessibilityInBothSchemes(page);
  await keepDraft(page).click();
  await checkAccessibilityInBothSchemes(page);
  await view.resume.click();
  await expect(view.area).toHaveValue(`${DOC}meanwhile  https://meanwhile/\n`);
  await checkAccessibilityInBothSchemes(page);
});

test('with no kept draft, or one the stored document holds, Import asks nothing', async ({ extension }) => {
  for (const draft of [undefined, kept(DOC, 'a  https://a/\n')]) {
    await extension.seedStorage(draft === undefined ? { mappings: DOC } : { mappings: DOC, draft });
    const page = await optionsPage(extension);
    await importFile(page, 'mappings.txt', FILE);
    await expect(textView(page).area).toHaveValue(SHOWN);
    await expect(question(page)).toHaveCount(0);
    await expect.poll(() => storedDraft(extension.worker)).toMatchObject({ text: SHOWN, base: DOC });
    await checkAccessibilityInBothSchemes(page);
    await page.close();
  }
});

test('a kept draft replaced by a file whose text the stored document holds is gone, not kept', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC, draft: kept(`${DOC}mine  https://mine/\n`, DOC) });
  const page = await optionsPage(extension);
  await importFile(page, 'same.txt', Buffer.from(DOC));
  await checkAccessibilityInBothSchemes(page);
  await replaceWithFile(page).click();
  await expect(textView(page).area).toHaveValue(DOC);
  await expect.poll(() => storedDraft(extension.worker)).toBeUndefined();
  expect((await extension.readStorage()).mappings).toBe(DOC);
  await checkAccessibilityInBothSchemes(page);
});

test("a file imported before another window names a page is not saved over that line: Save stores nothing and offers the change; brought in, Save stores both", async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  // Stands for the other window, whose Name form saves.
  const other = await extension.openRequestPage();
  const page = await optionsPage(extension);
  const file = `${DOC}x  https://x.example/\n`;
  await importFile(page, 'mappings.txt', Buffer.from(file));
  const view = textView(page);
  await expect(view.area).toHaveValue(file);
  await expect.poll(() => storedDraft(extension.worker)).toMatchObject({ text: file, base: DOC });
  expect(await other.send({ kind: 'insert', name: 'named', url: 'https://named.example/', note: '', heading: null })).toMatchObject({ kind: 'applied' });
  const named = (await extension.readStorage()).mappings as string;

  await checkAccessibilityInBothSchemes(page);
  await view.save.click();
  await expect(view.status).toHaveText(/^Not saved: the stored document changed/);
  expect((await extension.readStorage()).mappings).toBe(named);
  await expect(view.conflicts).toHaveCount(0);
  await checkAccessibilityInBothSchemes(page);
  await view.bringIn.click();
  const merged = `${named}x  https://x.example/\n`;
  await expect(view.area).toHaveValue(merged);
  await checkAccessibilityInBothSchemes(page);
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect((await extension.readStorage()).mappings).toBe(merged);
  await checkAccessibilityInBothSchemes(page);
});

test("Import's text is taken once: edited and left for Preferences, the Text view shown again offers the edit, and resumes it", async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  const page = await optionsPage(extension);
  await importFile(page, 'mappings.txt', FILE);
  const view = textView(page);
  await expect(view.area).toHaveValue(SHOWN);
  await typeAtEnd(view, 'more  https://more/\n');
  await nav(page, 'Preferences').click();
  await checkAccessibilityInBothSchemes(page);
  await nav(page, 'Text').click();
  await checkAccessibilityInBothSchemes(page);
  await expect(view.keptOffer).toBeVisible();
  await expect(view.area).toHaveValue(DOC);
  await checkAccessibilityInBothSchemes(page);
  await view.resume.click();
  await expect(view.area).toHaveValue(`${SHOWN}more  https://more/\n`);
  expect((await extension.readStorage()).mappings).toBe(DOC);
  await checkAccessibilityInBothSchemes(page);
});

test('the keyboard alone goes from Import… through the file chooser and the question to the Text view, and every state passes the accessibility pass', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC, draft: kept(`${DOC}mine  https://mine/\n`, DOC) });
  const page = await optionsPage(extension);
  await checkAccessibilityInBothSchemes(page);
  const importButton = page.getByRole('button', { name: 'Import…' });
  for (let presses = 0; presses < 30 && !(await importButton.evaluate((button) => button === document.activeElement)); presses++) await page.keyboard.press('Tab');
  await expect(importButton).toBeFocused();
  await importFile(page, 'mappings.txt', FILE, () => page.keyboard.press('Enter'));
  await expect(replaceWithFile(page)).toBeFocused();
  await checkAccessibilityInBothSchemes(page);
  await page.keyboard.press('Enter');
  const view = textView(page);
  await expect(view.area).toBeFocused();
  await expect(view.area).toHaveValue(SHOWN);
  await checkAccessibilityInBothSchemes(page);
});
