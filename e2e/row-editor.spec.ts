// A popup row's editor, opened by Ctrl+E on the selected row (In use, "Edit from a suggestion"; P1, L4): it
// takes the popup's list, filled from the line as loaded; Save rewrites that line alone and Delete removes it
// at once, each back to a blank search box with a confirmation naming the name and the line, whose Undo, and
// each Undo's own Undo, work (G12, G15); a rename starts the mapping's learning afresh (G27); Copy link copies
// the row's destination (G31); Open in text opens the Text view on the line; Cancel returns to search as it
// was left; nothing in it opens a URL (G4, R4); and every state fits and passes the accessibility pass (G7,
// G32). Its refusals, a line changed meanwhile, and failures are `row-editor-refusals.spec.ts`'s.
import type { Page } from '@playwright/test';
import {
  caret,
  checkFitAndAccessibility,
  clipboardText,
  closingPopup,
  editSelectedRow,
  expect,
  lineConfirmation,
  popupOnNewPage,
  rowEditor,
  test,
  textView,
  upgradeNotice,
  watchRequests,
  type LoadedExtension,
} from './extension.ts';

const footer = (popup: Page) => popup.locator('footer');
const searchBox = (popup: Page) => popup.getByRole('combobox');
const rowNames = (popup: Page) => popup.locator('[role=option] .row-name');
const selectedName = (popup: Page) => popup.locator('[role=option][aria-selected=true] .row-name');

const STOCKS = 'stocks               https://stocks.example.com/        \\ markets';
const DOC = [
  '\\ Daily',
  'mail                 https://mail.example.com/',
  STOCKS,
  'stack                https://stack.example.com/',
  '',
  'yt                   https://www.youtube.com/results?search_query=%s',
  '',
].join('\n');
const STACK_GONE = DOC.replace('stack                https://stack.example.com/\n', '');

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

test('Ctrl+E on the selected row opens its editor, filled from its line, from the search box or the chip; nothing opens', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const jumps = await watchRequests(extension.worker, 'jump');
  const { popup } = await popupOnNewPage(extension, site);
  const tabs = await extension.tabUrls();
  await popup.keyboard.type('st');
  await expect(rowNames(popup)).toHaveText(['stocks', 'stack']);
  await popup.keyboard.press('ArrowDown');
  const editor = await editSelectedRow(popup);
  await expect(editor.name).toHaveValue('stack');
  await expect(editor.url).toHaveValue('https://stack.example.com/');
  await expect(editor.note).toHaveValue('');
  await expect(editor.header).toHaveText('stackhttps://stack.example.com/');
  // The editor takes the popup's list while it is open.
  await expect(popup.getByRole('listbox')).toHaveCount(0);
  await expect(footer(popup)).toHaveText('Enter saves line 4');
  await checkFitAndAccessibility(popup);

  await editor.cancel.click();
  await expect(searchBox(popup)).toHaveValue('st');
  await popup.keyboard.press('Tab');
  await expect(popup.locator('.chip')).toBeFocused();
  await popup.keyboard.press('Control+e');
  await expect(rowEditor(popup).name).toHaveValue('stack');
  await expect(rowEditor(popup).note).toHaveValue('');

  await rowEditor(popup).cancel.click();
  await popup.keyboard.press('ArrowUp');
  await expect(selectedName(popup)).toHaveText('stocks');
  await editSelectedRow(popup);
  await expect(rowEditor(popup).note).toHaveValue('markets');
  expect(await jumps()).toEqual([]);
  expect(await extension.tabUrls()).toEqual(tabs);
});

test("Ctrl+E on the argument row edits its alias's line; on the Name row, or with nothing selected, it changes nothing", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const jumps = await watchRequests(extension.worker, 'jump');
  const { popup } = await popupOnNewPage(extension, site);
  const tabs = await extension.tabUrls();
  await popup.keyboard.type('yt lo-fi beats');
  await expect(rowNames(popup)).toHaveText(['yt']);
  const editor = await editSelectedRow(popup);
  await expect(editor.name).toHaveValue('yt');
  await expect(editor.url).toHaveValue('https://www.youtube.com/results?search_query=%s');
  await expect(editor.header).toHaveText('ythttps://www.youtube.com/results?search_query=lo-fi%20beats');
  await expect(footer(popup)).toHaveText('Enter saves line 6');
  await checkFitAndAccessibility(popup);
  await editor.cancel.click();

  await searchBox(popup).fill('zzz');
  await expect(popup.getByRole('option')).toHaveText(['Name "zzz" for this page']);
  await popup.keyboard.press('Control+e');
  await popup.waitForTimeout(300);
  await expect(searchBox(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter opens the Name form');

  await searchBox(popup).fill('');
  await expect(rowNames(popup)).toHaveCount(4);
  await popup.keyboard.press('Control+e');
  await popup.waitForTimeout(300);
  await expect(searchBox(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter does nothing · Down selects a row');
  expect(await jumps()).toEqual([]);
  expect(await extension.tabUrls()).toEqual(tabs);
  expect(await storedDocument(extension)).toBe(DOC);
});

test('rename by typing and Enter: the line alone rewritten in its columns, one change with usage, a blank search box with the confirmation; Undo and its Undo', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const changes = await extension.watchStorage();
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('stocks');
  await editSelectedRow(popup);
  await popup.keyboard.type('2');
  await popup.keyboard.press('Enter');
  await expect(lineConfirmation(popup).text).toHaveText('Changed "stocks2" on line 3');
  const renamed = DOC.replace(STOCKS, 'stocks2              https://stocks.example.com/        \\ markets');
  expect(await storedDocument(extension)).toBe(renamed);
  await expect(searchBox(popup)).toHaveValue('');
  await expect(searchBox(popup)).toBeFocused();
  await expect(popup.locator('[role=option][aria-selected=true]')).toHaveCount(0);
  const stored = await changes();
  expect(stored).toHaveLength(1);
  expect(Object.keys(stored[0]!).sort()).toEqual(['mappings', 'usage']);
  await expect(lineConfirmation(popup).undo).toHaveAccessibleName('Undo changing "stocks2"');
  await lineConfirmation(popup).undo.focus();
  await expect(footer(popup)).toHaveText('Enter undoes the change, restoring the line as it was');
  await checkFitAndAccessibility(popup);

  await popup.keyboard.press('Enter');
  await expect(lineConfirmation(popup).text).toHaveText('Changed "stocks" back on line 3');
  expect(await storedDocument(extension)).toBe(DOC);
  await expect(lineConfirmation(popup).undo).toHaveAccessibleName('Undo changing back "stocks"');
  await expect(footer(popup)).toHaveText('Enter undoes changing the line back, changing it again');
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Enter');
  await expect(lineConfirmation(popup).text).toHaveText('Changed "stocks2" back on line 3');
  expect(await storedDocument(extension)).toBe(renamed);
});

test('an Enter held through the Save opens nothing', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const jumps = await watchRequests(extension.worker, 'jump');
  const { popup } = await popupOnNewPage(extension, site);
  const tabs = await extension.tabUrls();
  await popup.keyboard.type('mail');
  const editor = await editSelectedRow(popup);
  await editor.name.fill('post');
  await popup.keyboard.down('Enter');
  await expect(searchBox(popup)).toBeVisible();
  // Repeats of the key still held, landing in a blank search box.
  await popup.keyboard.down('Enter');
  await popup.keyboard.down('Enter');
  await popup.keyboard.up('Enter');
  await popup.waitForTimeout(300);
  expect(await storedDocument(extension)).toBe(DOC.replace('mail                 https', 'post                 https'));
  expect(await jumps()).toEqual([]);
  expect(await extension.tabUrls()).toEqual(tabs);
});

test("a rename starts the mapping's learning afresh, and a note-only Save keeps it (G26, G27)", async ({ extension, site }) => {
  const usage = { 'stocks\nhttps://stocks.example.com/': [1_700_000_000_000, 1_700_000_100_000], 'mail\nhttps://mail.example.com/': [1_700_000_200_000] };
  await extension.seedStorage({ mappings: DOC, usage });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('stocks');
  const editor = await editSelectedRow(popup);
  await editor.note.fill('weekly');
  await editor.note.press('Enter');
  await expect(lineConfirmation(popup).text).toHaveText('Changed "stocks" on line 3');
  expect(await storedDocument(extension)).toBe(DOC.replace('\\ markets', '\\ weekly'));
  expect((await extension.readStorage()).usage).toEqual(usage);

  await popup.keyboard.type('stocks');
  await editSelectedRow(popup);
  await rowEditor(popup).name.fill('shares');
  const before = Date.now();
  await popup.keyboard.press('Enter');
  await expect(lineConfirmation(popup).text).toHaveText('Changed "shares" on line 3');
  const learned = (await extension.readStorage()).usage as Record<string, number[]>;
  expect(Object.keys(learned).sort()).toEqual(['mail\nhttps://mail.example.com/', 'shares\nhttps://stocks.example.com/']);
  expect(learned['mail\nhttps://mail.example.com/']).toEqual(usage['mail\nhttps://mail.example.com/']);
  expect(learned['shares\nhttps://stocks.example.com/']).toHaveLength(1);
  expect(learned['shares\nhttps://stocks.example.com/']![0]).toBeGreaterThanOrEqual(before);
});

test("Delete removes the line at once, asking nothing; its Undo puts it back, and that Undo's Undo removes it again", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('stack');
  const editor = await editSelectedRow(popup);
  await editor.delete.focus();
  await expect(footer(popup)).toHaveText('Enter deletes line 4');
  await popup.keyboard.press('Enter');
  await expect(lineConfirmation(popup).text).toHaveText('Removed "stack" from line 4');
  expect(await storedDocument(extension)).toBe(STACK_GONE);
  await expect(searchBox(popup)).toHaveValue('');
  await expect(rowNames(popup)).toHaveText(['mail', 'stocks', 'yt']);
  await expect(lineConfirmation(popup).undo).toHaveAccessibleName('Undo removing "stack"');
  await checkFitAndAccessibility(popup);

  await lineConfirmation(popup).undo.click();
  await expect(lineConfirmation(popup).text).toHaveText('Put "stack" back as line 4');
  expect(await storedDocument(extension)).toBe(DOC);
  await checkFitAndAccessibility(popup);
  await lineConfirmation(popup).undo.click();
  await expect(lineConfirmation(popup).text).toHaveText('Removed "stack" from line 4');
  expect(await storedDocument(extension)).toBe(STACK_GONE);
});

test('the keyboard reaches every control of the editor, the footer saying what Enter does on each; Delete and Backspace edit a field and remove no line', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const removes = await watchRequests(extension.worker, 'remove');
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('stack');
  const editor = await editSelectedRow(popup);
  await popup.keyboard.press('Backspace');
  await popup.keyboard.press('Home');
  await popup.keyboard.press('Delete');
  await expect(editor.name).toHaveValue('tac');
  await expect(footer(popup)).toHaveText('Enter saves line 4');
  const walk: [ReturnType<typeof rowEditor>[keyof ReturnType<typeof rowEditor>], string][] = [
    [editor.url, 'Enter saves line 4'],
    [editor.note, 'Enter saves line 4'],
    [editor.save, 'Enter saves line 4'],
    [editor.delete, 'Enter deletes line 4'],
    [editor.copyLink, 'Enter copies the link'],
    [editor.openInText, 'Enter opens the Text view in a new tab at line 4'],
    [editor.cancel, 'Enter closes the editor, storing nothing'],
  ];
  for (const [control, says] of walk) {
    await popup.keyboard.press('Tab');
    await expect(control).toBeFocused();
    await expect(footer(popup)).toHaveText(says);
  }
  await popup.keyboard.press('Enter');
  await expect(searchBox(popup)).toHaveValue('stack');
  expect(await removes()).toEqual([]);
  expect(await storedDocument(extension)).toBe(DOC);
});

test("Copy link copies the row's destination, never the unsaved fields, and opens nothing: %s removed, or the argument row's filled URL", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const jumps = await watchRequests(extension.worker, 'jump');
  const { page, popup } = await popupOnNewPage(extension, site);
  const tabs = await extension.tabUrls();
  const before = await extension.readStorage();
  await popup.keyboard.type('yt');
  const editor = await editSelectedRow(popup);
  await editor.copyLink.click();
  await expect(editor.said).toHaveText('Copied the link');
  expect(await clipboardText(page)).toBe('https://www.youtube.com/results?search_query=');
  await checkFitAndAccessibility(popup);
  await editor.url.fill('https://unsaved.example/');
  await editor.copyLink.click();
  await expect(editor.said).toHaveText('Copied the link');
  expect(await clipboardText(page)).toBe('https://www.youtube.com/results?search_query=');
  await editor.cancel.click();

  await searchBox(popup).fill('yt lo-fi beats');
  await editSelectedRow(popup);
  await rowEditor(popup).copyLink.focus();
  await expect(footer(popup)).toHaveText('Enter copies the link');
  await popup.keyboard.press('Enter');
  await expect(rowEditor(popup).said).toHaveText('Copied the link');
  expect(await clipboardText(page)).toBe('https://www.youtube.com/results?search_query=lo-fi%20beats');
  expect(popup.isClosed()).toBe(false);
  expect(await jumps()).toEqual([]);
  expect(await extension.tabUrls()).toEqual(tabs);
  expect(await extension.readStorage()).toEqual(before);
});

test('Open in text opens the Text view in a tab with the caret on the line where it now stands, and the popup closes', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('stack');
  const editor = await editSelectedRow(popup);
  await expect(footer(popup)).toHaveText('Enter saves line 4');
  // Another window adds two lines above it while the editor is open.
  await extension.seedStorage({ mappings: `\\ Added\n\\ elsewhere\n${DOC}` });
  await expect(footer(popup)).toHaveText('Enter saves line 6');
  await editor.openInText.focus();
  await expect(footer(popup)).toHaveText('Enter opens the Text view in a new tab at line 6');
  const opened = extension.context.waitForEvent('page', { predicate: (page) => page.url().startsWith(extension.url('options.html')) });
  await closingPopup(popup, () => popup.keyboard.press('Enter'));
  const options = await opened;
  await expect.poll(() => extension.tabUrls()).toContain(extension.url('options.html#view=text&line=6'));
  const view = textView(options);
  await expect(view.area).toBeEditable();
  await expect.poll(() => caret(view.area)).toMatchObject({ focused: true, line: 6, atLineStart: true });
});

test("Cancel returns to search as it was left: the typed text, the window, the selection, and the chip's mode; nothing is stored", async ({ extension, site }) => {
  const many = Array.from({ length: 12 }, (_, i) => `m${i + 1}  https://m${i + 1}.example/\n`).join('');
  await extension.seedStorage({ mappings: many });
  const { popup } = await popupOnNewPage(extension, site);
  const before = await extension.readStorage();
  await popup.keyboard.type('m');
  await popup.keyboard.press('ArrowUp');
  await expect(selectedName(popup)).toHaveText('m12');
  await expect(popup.locator('.cue')).toHaveText('5 more above');
  await popup.locator('.chip').click();
  await expect(popup.locator('.chip')).toHaveText('This tab');
  const editor = await editSelectedRow(popup);
  await expect(editor.name).toHaveValue('m12');
  await editor.name.fill('changed but not saved');
  await editor.cancel.focus();
  await expect(footer(popup)).toHaveText('Enter closes the editor, storing nothing');
  await popup.keyboard.press('Enter');
  await expect(searchBox(popup)).toHaveValue('m');
  await expect(searchBox(popup)).toBeFocused();
  await expect(selectedName(popup)).toHaveText('m12');
  await expect(rowNames(popup)).toHaveText(['m6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12']);
  await expect(popup.locator('.cue')).toHaveText('5 more above');
  await expect(popup.locator('.chip')).toHaveText('This tab');
  await expect(footer(popup)).toHaveText('Enter opens it in this tab · Shift+Enter in a new tab');
  expect(await extension.readStorage()).toEqual(before);
});

test('Escape closes the popup from the editor, storing nothing', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('mail');
  const editor = await editSelectedRow(popup);
  await editor.name.fill('not saved');
  await closingPopup(popup, () => popup.keyboard.press('Escape'));
  expect(await storedDocument(extension)).toBe(DOC);
});

test("a rewrite's confirmation goes at the next typed key, and lasts ten seconds untouched; its Undo's starts its own ten seconds", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('mail');
  await editSelectedRow(popup);
  await popup.keyboard.type('2');
  await popup.keyboard.press('Enter');
  await expect(lineConfirmation(popup).text).toHaveText('Changed "mail2" on line 2');
  await popup.keyboard.type('m');
  await expect(lineConfirmation(popup).text).toHaveCount(0);

  await editSelectedRow(popup);
  await popup.keyboard.type('3');
  await popup.keyboard.press('Enter');
  await expect(lineConfirmation(popup).text).toHaveText('Changed "mail23" on line 2');
  await popup.waitForTimeout(6_000);
  await lineConfirmation(popup).undo.click();
  await expect(lineConfirmation(popup).text).toHaveText('Changed "mail2" back on line 2');
  // Past the rewrite's ten seconds.
  await popup.waitForTimeout(8_500);
  await expect(lineConfirmation(popup).text).toHaveText('Changed "mail2" back on line 2');
  await expect(lineConfirmation(popup).text).toHaveCount(0, { timeout: 2_500 });
  expect(await storedDocument(extension)).toBe(DOC.replace('mail                 https', 'mail2                https'));
});

test('Delete of the only line leaves the document empty: the first run shows with the confirmation, and its Undo brings the line and search back', async ({ extension, site }) => {
  const only = 'only    https://o.example/\n';
  await extension.seedStorage({ mappings: only });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('only');
  const editor = await editSelectedRow(popup);
  await editor.delete.click();
  await expect(popup.getByRole('heading', { name: 'No mappings yet' })).toBeVisible();
  await expect(lineConfirmation(popup).text).toHaveText('Removed "only" from line 1');
  expect(await storedDocument(extension)).toBe('');
  await checkFitAndAccessibility(popup);
  await lineConfirmation(popup).undo.focus();
  await expect(footer(popup)).toHaveText('Enter undoes the removal, putting the line back');
  await popup.keyboard.press('Enter');
  await expect(lineConfirmation(popup).text).toHaveText('Put "only" back as line 1');
  expect(await storedDocument(extension)).toBe(only);
  await expect(rowNames(popup)).toHaveText(['only']);
  // Search in the first run's place, the Undo that had the focus keeps it, and the footer says what Enter does there.
  await expect(lineConfirmation(popup).undo).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter undoes putting the line back, removing it again');
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Enter');
  await expect(lineConfirmation(popup).text).toHaveText('Removed "only" from line 1');
  expect(await storedDocument(extension)).toBe('');
  await expect(lineConfirmation(popup).undo).toBeFocused();
});

test('Delete of the one mapping under a heading leaves search with no rows, and the confirmation', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: '\\ Work\nonly    https://o.example/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('only');
  const editor = await editSelectedRow(popup);
  await editor.delete.click();
  await expect(lineConfirmation(popup).text).toHaveText('Removed "only" from line 2');
  expect(await storedDocument(extension)).toBe('\\ Work\n');
  await expect(searchBox(popup)).toBeFocused();
  await expect(popup.getByRole('option')).toHaveCount(0);
  await expect(footer(popup)).toHaveText('No mappings to list · Enter does nothing');
  await checkFitAndAccessibility(popup);
});

test('with the notice of what is new showing and a row selected, Ctrl+E dismisses the notice for good and opens the editor (G25)', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('mail');
  await expect(selectedName(popup)).toHaveText('mail');
  // Chrome updates the extension from 1.x while this popup is open.
  await extension.dispatchEvent('runtime.onInstalled', { reason: 'update', previousVersion: '1.3.0' });
  await expect(upgradeNotice(popup).notice).toBeVisible();
  const editor = await editSelectedRow(popup);
  await expect(editor.name).toHaveValue('mail');
  await expect(upgradeNotice(popup).notice).toHaveCount(0);
  await expect.poll(async () => (await extension.readStorage()).upgradeNotice).toBeUndefined();
  await checkFitAndAccessibility(popup);
});

test('a 300-character name and URL: the editor and its confirmation fit, the row above cut with an ellipsis', async ({ extension, site }) => {
  const name = `n${'y'.repeat(299)}`;
  const url = `https://${'u'.repeat(292)}`;
  await extension.seedStorage({ mappings: `${name} ${url}\n` });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('n');
  const editor = await editSelectedRow(popup);
  await expect(editor.name).toHaveValue(name);
  await expect(editor.url).toHaveValue(url);
  await checkFitAndAccessibility(popup);
  await editor.note.fill('a note');
  await popup.keyboard.press('Enter');
  await expect(lineConfirmation(popup).text).toHaveText(`Changed "${name}" on line 1`);
  expect(await storedDocument(extension)).toBe(`${name} ${url} \\ a note\n`);
  await checkFitAndAccessibility(popup);
});

test("a rewrite's Undo stores nothing and says so when another window changed the line since, or took its former name", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const other = await extension.openRequestPage();
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('stocks');
  await editSelectedRow(popup);
  await rowEditor(popup).name.fill('shares');
  await popup.keyboard.press('Enter');
  await expect(lineConfirmation(popup).text).toHaveText('Changed "shares" on line 3');
  const shares = 'shares               https://stocks.example.com/        \\ markets';
  expect(await other.send({ kind: 'rewrite', line: 3, text: shares, name: 'shares', url: 'https://shares.example.com/', note: '' })).toMatchObject({ kind: 'applied' });
  const changed = await extension.readStorage();
  await lineConfirmation(popup).undo.click();
  await expect(lineConfirmation(popup).text).toHaveText('Not undone: line 3, "shares", was changed or removed since. Nothing was stored.');
  await expect(lineConfirmation(popup).undo).toHaveCount(0);
  expect(await extension.readStorage()).toEqual(changed);
  await checkFitAndAccessibility(popup);

  await extension.seedStorage({ mappings: DOC });
  await popup.keyboard.type('stocks');
  await editSelectedRow(popup);
  await rowEditor(popup).name.fill('shares');
  await popup.keyboard.press('Enter');
  await expect(lineConfirmation(popup).text).toHaveText('Changed "shares" on line 3');
  expect(await other.send({ kind: 'insert', name: 'Stocks', url: 'https://other.example/', note: '', heading: null })).toMatchObject({ kind: 'applied', line: 7 });
  const taken = await extension.readStorage();
  await lineConfirmation(popup).undo.click();
  await expect(lineConfirmation(popup).text).toHaveText('Not undone: line 7 already has the name "stocks". Nothing was stored.');
  expect(await extension.readStorage()).toEqual(taken);
});
