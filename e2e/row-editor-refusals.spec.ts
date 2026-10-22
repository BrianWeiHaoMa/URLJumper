// A row editor's refusals and failures (G8, G13, G14, G21, G31): a line another window changed or removed
// since the editor loaded it is never overwritten, the editor says what became of it, and *Edit again* keeps
// the typed values against the line as it now stands or saves them as a new line; a taken name or a value
// that breaks a rule is refused in place; a failed store keeps the typed values; and while a Save awaits its
// reply nothing else is sent. Every refusal leaves storage unchanged.
import type { Page } from '@playwright/test';
import {
  checkFitAndAccessibility,
  clipboardText,
  editSelectedRow,
  expect,
  lineConfirmation,
  popupOnNewPage,
  refuseWorkerStorage,
  slowWorkerReads,
  test,
  watchRequests,
  type LoadedExtension,
  type RowEditor,
} from './extension.ts';

const ORIGINAL_LINE = 'a https://a.example/ \\ old note';
const DOC = `\\ Daily\n${ORIGINAL_LINE}\nb  https://b.example/\n`;
const searchBox = (popup: Page) => popup.getByRole('combobox');
const footer = (popup: Page) => popup.locator('footer');

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

async function editRow(popup: Page, query = 'a') {
  await searchBox(popup).fill(query);
  return editSelectedRow(popup);
}

async function typeValues(editor: RowEditor) {
  await editor.name.fill('mine');
  await editor.url.fill('https://mine.example/');
  await editor.note.fill('my note');
}

async function expectValues(editor: RowEditor) {
  await expect(editor.name).toHaveValue('mine');
  await expect(editor.url).toHaveValue('https://mine.example/');
  await expect(editor.note).toHaveValue('my note');
}

test('Save follows the exact loaded line past two new comments, leaving the old line number untouched', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  const editor = await editRow(popup);
  await editor.url.fill('https://mine.example/');
  const elsewhere = `\\ first new comment\n\\ second new comment\n${DOC}`;
  await extension.seedStorage({ mappings: elsewhere });
  await editor.save.click();
  await expect(lineConfirmation(popup).text).toHaveText('Changed "a" on line 4');
  expect(await storedDocument(extension)).toBe(elsewhere.replace('https://a.example/', 'https://mine.example/'));
  expect((await storedDocument(extension) as string).split('\n')[1]).toBe('\\ second new comment');
  await checkFitAndAccessibility(popup);
});

test('a changed URL and note refuse Save without overwriting; Edit again keeps the values and anchors on the current line', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const other = await extension.openRequestPage();
  const { popup } = await popupOnNewPage(extension, site);
  const editor = await editRow(popup);
  await typeValues(editor);
  expect(await other.send({ kind: 'rewrite', line: 2, text: ORIGINAL_LINE, name: 'A', url: 'https://other.example/', note: 'other note' })).toMatchObject({ kind: 'applied' });
  const before = await extension.readStorage();
  // The popup's read shows the line changed: Enter sends a change the worker will refuse, and the footer says so (L2).
  await expect(footer(popup)).toHaveText('Enter tries to save line 2 · the line has changed');
  await editor.delete.focus();
  await expect(footer(popup)).toHaveText('Enter tries to delete line 2 · the line has changed');
  await editor.save.click();
  await expect(editor.stale).toHaveText('Not saved: line 2, "a", was changed since this editor opened, and nothing was stored. It is now line 2:');
  await expect(editor.staleLine).toHaveText('A https://other.example/ \\ other note');
  expect(await extension.readStorage()).toEqual(before);
  await checkFitAndAccessibility(popup);
  await editor.editAgain.click();
  await expectValues(editor);
  await editor.save.click();
  await expect(lineConfirmation(popup).text).toHaveText('Changed "mine" on line 2');
  expect(await storedDocument(extension)).toBe(DOC.replace(ORIGINAL_LINE, 'mine https://mine.example/ \\ my note'));
});

for (const change of ['removed', 'renamed'] as const) {
  test(`a line ${change} elsewhere refuses Save; Edit again inserts at the end and Undo restores the other document`, async ({ extension, site }) => {
    await extension.seedStorage({ mappings: DOC });
    const other = await extension.openRequestPage();
    const { popup } = await popupOnNewPage(extension, site);
    const editor = await editRow(popup);
    await typeValues(editor);
    const request = change === 'removed'
      ? { kind: 'remove' as const, line: 2, text: ORIGINAL_LINE }
      : { kind: 'rewrite' as const, line: 2, text: ORIGINAL_LINE, name: 'renamed', url: 'https://a.example/', note: 'old note' };
    expect(await other.send(request)).toMatchObject({ kind: 'applied' });
    const before = await extension.readStorage();
    await editor.save.click();
    await expect(editor.stale).toHaveText('Not saved: line 2, "a", has gone from the document since this editor opened, and nothing was stored.');
    expect(await extension.readStorage()).toEqual(before);
    await checkFitAndAccessibility(popup);
    await editor.editAgain.click();
    await expectValues(editor);
    const newLine = change === 'removed' ? 3 : 4;
    await expect(popup.getByText(`"a" is no longer in the document: Save adds your values as a new line, line ${newLine}.`, { exact: true })).toBeVisible();
    await expect(editor.delete).toHaveCount(0);
    await checkFitAndAccessibility(popup);
    await editor.save.click();
    await expect(lineConfirmation(popup).text).toHaveText(`Saved "mine" as line ${newLine}`);
    expect(await storedDocument(extension)).toBe(`${before.mappings}mine https://mine.example/ \\ my note\n`);
    await lineConfirmation(popup).undo.click();
    await expect(lineConfirmation(popup).text).toHaveText(`Removed "mine" from line ${newLine}`);
    expect(await storedDocument(extension)).toBe(before.mappings);
  });
}

test('Delete of a line removed elsewhere stores nothing and says the line is gone', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const other = await extension.openRequestPage();
  const { popup } = await popupOnNewPage(extension, site);
  const editor = await editRow(popup);
  expect(await other.send({ kind: 'remove', line: 2, text: ORIGINAL_LINE })).toMatchObject({ kind: 'applied' });
  const before = await extension.readStorage();
  await editor.delete.focus();
  await expect(footer(popup)).toHaveText('Enter tries to delete line 2 · the line has changed');
  await editor.delete.click();
  await expect(editor.stale).toHaveText('Not deleted: line 2, "a", has gone from the document since this editor opened, and nothing was stored.');
  expect(await extension.readStorage()).toEqual(before);
  await checkFitAndAccessibility(popup);
});

test('an argument row after stale Save and Edit again copies the new stored URL with the original argument', async ({ extension, site }) => {
  const doc = 'yt https://y.example/?q=%s\n';
  await extension.seedStorage({ mappings: doc });
  const other = await extension.openRequestPage();
  const jumps = await watchRequests(extension.worker, 'jump');
  const { page, popup } = await popupOnNewPage(extension, site);
  const editor = await editRow(popup, 'yt lo-fi beats');
  await editor.note.fill('my note');
  expect(await other.send({ kind: 'rewrite', line: 1, text: doc.trimEnd(), name: 'yt', url: 'https://new.example/search?q=%s', note: '' })).toMatchObject({ kind: 'applied' });
  const before = await extension.readStorage();
  await editor.save.click();
  await expect(editor.stale).toContainText('nothing was stored. It is now line 1:');
  expect(await extension.readStorage()).toEqual(before);
  await editor.editAgain.click();
  await expect(editor.url).toHaveValue('https://y.example/?q=%s');
  const tabs = await extension.tabUrls();
  await editor.copyLink.click();
  await expect(editor.said).toHaveText('Copied the link');
  expect(await clipboardText(page)).toBe('https://new.example/search?q=lo-fi%20beats');
  expect(await extension.tabUrls()).toEqual(tabs);
  expect(await jumps()).toEqual([]);
  expect(await extension.readStorage()).toEqual(before);
});

const TAKEN_DOC = `${DOC}\\ later\ntaken https://taken.example/\n`;

test('a taken name blocks Enter without a rewrite, names line 5, and offers its editor', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: TAKEN_DOC });
  const rewrites = await watchRequests(extension.worker, 'rewrite');
  const { popup } = await popupOnNewPage(extension, site);
  const editor = await editRow(popup);
  await editor.name.fill('TAKEN');
  await popup.keyboard.press('Enter');
  await expect(editor.taken).toHaveText('Line 5 already has the name "taken".');
  await expect(editor.editInstead).toHaveText('Edit "taken" instead');
  expect(await rewrites()).toEqual([]);
  expect(await storedDocument(extension)).toBe(TAKEN_DOC);
  await checkFitAndAccessibility(popup);
  await editor.editInstead.click();
  await expect(editor.name).toHaveValue('taken');
  await expect(editor.url).toHaveValue('https://taken.example/');
  await expect(footer(popup)).toHaveText('Enter saves line 5');
  await expect(editor.taken).toHaveCount(0);
  await checkFitAndAccessibility(popup);
});

test('a taken name and a missing URL show both problems and send no rewrite', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: TAKEN_DOC });
  const rewrites = await watchRequests(extension.worker, 'rewrite');
  const { popup } = await popupOnNewPage(extension, site);
  const editor = await editRow(popup);
  await editor.name.fill('taken');
  await editor.url.fill('');
  await popup.keyboard.press('Enter');
  await expect(editor.problem).toHaveText('Line 2 needs a URL.');
  await expect(editor.taken).toHaveText('Line 5 already has the name "taken".');
  await expect(editor.editInstead).toHaveText('Edit "taken" instead');
  await expect(editor.name).toHaveValue('taken');
  await expect(editor.url).toHaveValue('');
  expect(await rewrites()).toEqual([]);
  expect(await storedDocument(extension)).toBe(TAKEN_DOC);
  await checkFitAndAccessibility(popup);
});

for (const name of ['a', 'A']) {
  test(`the line's own name "${name}" is free to save`, async ({ extension, site }) => {
    await extension.seedStorage({ mappings: DOC });
    const { popup } = await popupOnNewPage(extension, site);
    const editor = await editRow(popup);
    await editor.name.fill(name);
    await editor.note.fill('changed');
    await expect(editor.taken).toHaveCount(0);
    await popup.keyboard.press('Enter');
    await expect(lineConfirmation(popup).text).toHaveText(`Changed "${name}" on line 2`);
    expect(await storedDocument(extension)).toBe(DOC.replace(ORIGINAL_LINE, `${name} https://a.example/ \\ changed`));
  });
}

for (const invalid of [
  { field: 'url' as const, value: 'https://a.example/with space', message: 'Line 2: a URL cannot contain spaces or other whitespace.' },
  { field: 'name' as const, value: '', message: 'Line 2 needs a name.' },
]) {
  test(`invalid ${invalid.field} is refused in place with its value kept and no rewrite`, async ({ extension, site }) => {
    await extension.seedStorage({ mappings: DOC });
    const rewrites = await watchRequests(extension.worker, 'rewrite');
    const { popup } = await popupOnNewPage(extension, site);
    const editor = await editRow(popup);
    await editor[invalid.field].fill(invalid.value);
    await popup.keyboard.press('Enter');
    await expect(editor.problem).toHaveText(invalid.message);
    await expect(editor[invalid.field]).toHaveValue(invalid.value);
    await expect(editor[invalid.field]).toHaveAttribute('aria-invalid', 'true');
    expect(await rewrites()).toEqual([]);
    expect(await storedDocument(extension)).toBe(DOC);
    await checkFitAndAccessibility(popup);
  });
}

test('clearing a note removes its comment and preceding whitespace; Undo restores the exact original bytes', async ({ extension, site }) => {
  const doc = 'a    https://a.example/     \\ old note\r\nb\t https://b.example/  \\ keep this\n';
  await extension.seedStorage({ mappings: doc });
  const { popup } = await popupOnNewPage(extension, site);
  const editor = await editRow(popup);
  await editor.note.fill('');
  await editor.save.click();
  await expect(lineConfirmation(popup).text).toHaveText('Changed "a" on line 1');
  expect(await storedDocument(extension)).toBe(doc.replace('     \\ old note', ''));
  await lineConfirmation(popup).undo.click();
  await expect(lineConfirmation(popup).text).toHaveText('Changed "a" back on line 1');
  expect(await storedDocument(extension)).toBe(doc);
});

test('quota exhaustion refuses a longer Save, stores nothing, and keeps every typed field', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  const editor = await editRow(popup);
  await typeValues(editor);
  await editor.note.fill('my note '.repeat(30));
  await extension.fillStorage(16);
  const before = await extension.readStorage();
  await editor.save.click();
  await expect(editor.said).toHaveText('Not saved: nothing was stored. Chrome said: Resource::kQuotaBytes quota exceeded');
  await expect(editor.name).toHaveValue('mine');
  await expect(editor.url).toHaveValue('https://mine.example/');
  await expect(editor.note).toHaveValue('my note '.repeat(30));
  expect(await extension.readStorage()).toEqual(before);
  await checkFitAndAccessibility(popup);
});

test('Chrome refusing Delete stores nothing and keeps every typed field', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  const editor = await editRow(popup);
  await typeValues(editor);
  const before = await extension.readStorage();
  await refuseWorkerStorage(extension.worker, 'set', 'Disk is unavailable');
  await editor.delete.click();
  await expect(editor.said).toHaveText('Not deleted: nothing was stored. Chrome said: Disk is unavailable');
  await expectValues(editor);
  expect(await extension.readStorage()).toEqual(before);
  await checkFitAndAccessibility(popup);
});

test('closing the popup before Save replies leaves a whole old or new document that the next popup lists', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const other = await extension.openRequestPage();
  const rewrites = await watchRequests(extension.worker, 'rewrite');
  const { page, popup } = await popupOnNewPage(extension, site);
  const editor = await editRow(popup);
  await typeValues(editor);
  await slowWorkerReads(extension.worker, 'mappings', 3000);
  await editor.save.click();
  await expect(footer(popup)).toHaveText('Saving · Enter does nothing until it is stored');
  await expect.poll(rewrites).toHaveLength(1);
  await popup.close();
  // A no-op on the same queue waits for the closed editor's request to settle, without changing the document.
  expect(await other.send({ kind: 'remove-intent', windowId: -1, time: 0 })).toEqual({ kind: 'done' });
  const saved = DOC.replace(ORIGINAL_LINE, 'mine https://mine.example/ \\ my note');
  const document = await storedDocument(extension);
  expect([DOC, saved]).toContain(document);
  const next = await extension.clickToolbarButton(page);
  const name = document === DOC ? 'a' : 'mine';
  const url = document === DOC ? 'https://a.example/' : 'https://mine.example/';
  await expect(searchBox(next)).toHaveValue('');
  await expect(next.locator('[role=option] .row-name')).toHaveText([name, 'b']);
  await expect(next.locator('[role=option] .row-url')).toHaveText([url, 'https://b.example/']);
  expect(await storedDocument(extension)).toBe(document);
  await checkFitAndAccessibility(next);
});

test('while Save awaits its reply, Delete, Cancel, and Enter do nothing; one rewrite confirms over blank search', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const rewrites = await watchRequests(extension.worker, 'rewrite');
  const removals = await watchRequests(extension.worker, 'remove');
  const { popup } = await popupOnNewPage(extension, site);
  const editor = await editRow(popup);
  await typeValues(editor);
  await slowWorkerReads(extension.worker, 'mappings', 3000);
  await editor.save.click();
  await expect(footer(popup)).toHaveText('Saving · Enter does nothing until it is stored');
  // aria-disabled controls remain focusable; force sends the click a user can still attempt while saving.
  await editor.delete.click({ force: true });
  await editor.cancel.click({ force: true });
  await editor.name.focus();
  await popup.keyboard.press('Enter');
  await expect(editor.name).toHaveAttribute('readonly', '');
  expect(await storedDocument(extension)).toBe(DOC);
  await checkFitAndAccessibility(popup);
  await expect(footer(popup)).toHaveText('Saving · Enter does nothing until it is stored');
  expect(await rewrites()).toHaveLength(1);
  expect(await removals()).toEqual([]);
  await expect(lineConfirmation(popup).text).toHaveText('Changed "mine" on line 2', { timeout: 10_000 });
  await expect(searchBox(popup)).toHaveValue('');
  await expect(searchBox(popup)).toBeFocused();
  expect(await rewrites()).toHaveLength(1);
  expect(await removals()).toEqual([]);
  expect(await storedDocument(extension)).toBe(DOC.replace(ORIGINAL_LINE, 'mine https://mine.example/ \\ my note'));
});
