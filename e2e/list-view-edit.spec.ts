// Editing in the List view, in both settings hosts (In use, "Edit the list"; G12 to G15, G21, G22, G31, G32,
// L2, R1, R4): a row's editor in place rewrites its line alone or removes it at once, each confirmed by name
// and line beside the line, with Undo, itself undoable, and the focus on a visible control; *Copy link* copies
// the destination and stores nothing; a line another page changed or removed is never overwritten and the
// editor stays where the line now stands; a failed store keeps the typed values; while a change awaits its
// reply every other edit waits; and the confirmation ends at the user's next action or ten seconds.
import type { Page } from '@playwright/test';
import {
  clipboardText,
  expect,
  holdPageRequests,
  lineConfirmation,
  listViewIn,
  recordWorkerCalls,
  refuseWorkerStorage,
  rowEditor,
  SETTINGS_HOSTS,
  test,
  watchRequests,
  type ListView,
  type LoadedExtension,
} from './extension.ts';

const MAIL = 'mail  https://mail.example/  \\ its note';
const CAL = 'cal\thttps://cal.example/';
const DOC = ['\\ Daily', '\\ second heading line', MAIL, '', CAL, 'just-a-name', '\\', 'last  https://l.example/'].join('\n');

const footer = (page: Page) => page.locator('footer');

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

/** The list's items in order, each as `row N`, `editor`, `confirmation`, or `heading`. */
function items(view: ListView) {
  return view.list.locator(':scope > li').evaluateAll((lis) =>
    lis.map((li) =>
      li.classList.contains('list-row') ? `row ${li.querySelector('.list-number')!.textContent}` : li.classList.contains('list-editor') ? 'editor' : li.classList.contains('list-heading') ? 'heading' : 'confirmation',
    ),
  );
}

/** Whether the focus is on a control the user can see: never the page's body. */
function focusOnVisibleControl(page: Page) {
  return page.evaluate(() => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || focused === document.body) return false;
    const box = focused.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  });
}

for (const host of SETTINGS_HOSTS) {
  test(`in the ${host}, Save with the note cleared rewrites that line alone, confirmed with Undo, whose own Undo works`, async ({ extension, site }) => {
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC });
    const calls = await recordWorkerCalls(extension.worker);
    const changes = await extension.watchStorage();
    await view.pencil('mail').click();
    const editor = rowEditor(page);
    await editor.note.fill('');
    await editor.save.click();
    const rewritten = DOC.replace(MAIL, 'mail  https://mail.example/');
    const confirmation = lineConfirmation(page);
    await expect(confirmation.text).toHaveText('Changed "mail" on line 3');
    await expect(confirmation.undo).toBeInViewport();
    expect(await storedDocument(extension)).toBe(rewritten);
    // One write, holding the document and its usage together (R1).
    expect((await calls()).filter(([method]) => method === 'storage.set').map(([, items]) => Object.keys(items as object).sort())).toEqual([['mappings', 'usage']]);
    expect((await changes()).filter((change) => 'mappings' in change)).toHaveLength(1);
    await expect(editor.name).toHaveCount(0);
    await expect(view.pencil('mail')).toBeFocused();
    await expect(view.notes).toHaveCount(0);
    expect(await items(view)).toEqual(['heading', 'row 3', 'confirmation', 'row 5', 'row 6', 'heading', 'row 8']);
    if (host === 'popup') await expect(footer(page)).toHaveText('Enter edits line 3');
    await check();

    await confirmation.undo.focus();
    if (host === 'popup') await expect(footer(page)).toHaveText('Enter undoes the change, restoring the line as it was');
    await page.keyboard.press('Enter');
    await expect(confirmation.text).toHaveText('Changed "mail" back on line 3');
    expect(await storedDocument(extension)).toBe(DOC);
    await expect(confirmation.undo).toBeFocused();
    await expect(view.notes).toHaveText(['its note']);
    await confirmation.undo.click();
    // Undoing the restore restores the line it replaced.
    await expect(confirmation.text).toHaveText('Changed "mail" back on line 3');
    await expect(view.notes).toHaveCount(0);
    expect(await storedDocument(extension)).toBe(rewritten);
  });

  test(`in the ${host}, Save with a backslash in the note writes it as typed, and the row shows it as its note`, async ({ extension, site }) => {
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC });
    await view.pencil('mail').click();
    const editor = rowEditor(page);
    await editor.note.fill('see \\ docs');
    await expect(editor.note).toHaveAttribute('aria-invalid', 'false');
    await editor.save.click();
    await expect(lineConfirmation(page).text).toHaveText('Changed "mail" on line 3');
    expect(await storedDocument(extension)).toBe(DOC.replace(MAIL, 'mail  https://mail.example/  \\ see \\ docs'));
    await expect(view.notes).toHaveText(['see \\ docs']);
    await check();
  });

  test(`in the ${host}, Delete removes the line at once, the focus on Undo, which puts it back`, async ({ extension, site }) => {
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC });
    await view.pencil('cal').click();
    const editor = rowEditor(page);
    await editor.delete.focus();
    if (host === 'popup') await expect(footer(page)).toHaveText('Enter deletes line 5');
    await page.keyboard.press('Enter');
    const confirmation = lineConfirmation(page);
    await expect(confirmation.text).toHaveText('Removed "cal" from line 5');
    expect(await storedDocument(extension)).toBe(DOC.replace(`${CAL}\n`, ''));
    await expect(view.names).toHaveText(['mail', 'last']);
    await expect(confirmation.undo).toBeFocused();
    expect(await focusOnVisibleControl(page)).toBe(true);
    expect(await items(view)).toEqual(['heading', 'row 3', 'confirmation', 'row 5', 'heading', 'row 7']);
    await check();
    await page.keyboard.press('Enter');
    await expect(confirmation.text).toHaveText('Put "cal" back as line 5');
    expect(await storedDocument(extension)).toBe(DOC);
    await expect(view.names).toHaveText(['mail', 'cal', 'last']);
  });

  test(`in the ${host}, Copy link copies the destination with every %s removed, storing nothing and opening nothing`, async ({ extension, site }) => {
    const doc = `${DOC}\nyt  https://www.youtube.com/results?search_query=%s`;
    const jumps = await watchRequests(extension.worker, 'jump');
    const { page, view } = await listViewIn(host, extension, site, { mappings: doc });
    const changes = await extension.watchStorage();
    const tabs = await extension.tabUrls();
    await view.pencil('yt').click();
    await rowEditor(page).copyLink.click();
    await expect(rowEditor(page).said).toHaveText('Copied the link');
    const web = await extension.context.newPage();
    await web.goto(site.pageUrl('Reads the clipboard'));
    expect(await clipboardText(web)).toBe('https://www.youtube.com/results?search_query=');
    expect(await changes()).toEqual([]);
    expect(await jumps()).toEqual([]);
    expect((await extension.tabUrls()).filter((url) => !tabs.includes(url))).toEqual([web.url()]);
    expect(await storedDocument(extension)).toBe(doc);
  });

  test(`in the ${host}, a line another page removed refuses Save with the editor where it was; Edit again saves the values as a new line at the end`, async ({ extension, site }) => {
    const other = await extension.openRequestPage();
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC });
    await view.pencil('mail').click();
    const editor = rowEditor(page);
    await editor.name.fill('mine');
    await editor.url.fill('https://mine.example/');
    await editor.note.fill('');
    expect(await other.send({ kind: 'remove', line: 3, text: MAIL })).toMatchObject({ kind: 'applied' });
    const removed = DOC.replace(`${MAIL}\n`, '');
    // The rows around it renumbered, the editor standing where the line was.
    await expect(view.numbers).toHaveText(['4', '5', '7']);
    expect(await items(view)).toEqual(['heading', 'editor', 'row 4', 'row 5', 'heading', 'row 7']);
    await expect(editor.name).toHaveValue('mine');
    // The read shows the line gone: Enter sends a Save the worker will refuse, and the footer says so (L2).
    if (host === 'popup') await expect(footer(page)).toHaveText('Enter tries to save line 3 · the line has changed');
    await editor.save.click();
    await expect(editor.stale).toHaveText('Not saved: line 3, "mail", has gone from the document since this editor opened, and nothing was stored.');
    expect(await storedDocument(extension)).toBe(removed);
    await check();
    await editor.editAgain.click();
    await editor.save.click();
    await expect(lineConfirmation(page).text).toHaveText('Saved "mine" as line 8');
    expect(await storedDocument(extension)).toBe(`${removed}\nmine  https://mine.example/`);
    await expect(lineConfirmation(page).undo).toBeVisible();
    await expect(view.pencil('mine')).toBeFocused();
  });

  test(`in the ${host}, a line another page rewrote refuses Save, saying what it now is; Edit again keeps the typed URL against the line as stored`, async ({ extension, site }) => {
    const other = await extension.openRequestPage();
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC });
    await view.pencil('mail').click();
    const editor = rowEditor(page);
    await editor.url.fill('https://mine.example/');
    expect(await other.send({ kind: 'rewrite', line: 3, text: MAIL, name: 'mail', url: 'https://other.example/', note: 'theirs' })).toMatchObject({ kind: 'applied' });
    expect(await other.send({ kind: 'insert', name: 'news', url: 'https://news.example/', note: '', heading: null })).toMatchObject({ kind: 'applied', line: 9 });
    const theirs = (await storedDocument(extension)) as string;
    const theirLine = theirs.split('\n')[2]!;
    expect(theirLine).toMatch(/^mail +https:\/\/other\.example\/ +\\ theirs$/);
    // The list around the editor follows the other page.
    await expect(view.names).toHaveText(['cal', 'last', 'news']);
    expect(await items(view)).toEqual(['heading', 'editor', 'row 5', 'row 6', 'heading', 'row 8', 'row 9']);
    if (host === 'popup') {
      // The read shows the line changed: Enter on Save or Delete sends a change the worker will refuse (L2).
      await editor.save.focus();
      await expect(footer(page)).toHaveText('Enter tries to save line 3 · the line has changed');
      await editor.delete.focus();
      await expect(footer(page)).toHaveText('Enter tries to delete line 3 · the line has changed');
    }
    await editor.save.click();
    await expect(editor.stale).toHaveText('Not saved: line 3, "mail", was changed since this editor opened, and nothing was stored. It is now line 3:');
    expect(await editor.staleLine.textContent()).toBe(theirLine);
    expect(await storedDocument(extension)).toBe(theirs);
    await check();
    await editor.editAgain.click();
    await expect(editor.url).toHaveValue('https://mine.example/');
    await editor.save.click();
    await expect(lineConfirmation(page).text).toHaveText('Changed "mail" on line 3');
    // The typed values, the note as loaded among them, over their line in its columns (F12).
    expect(await storedDocument(extension)).toBe(theirs.replace(theirLine, 'mail  https://mine.example/  \\ its note'));
  });
}

test("in the popup, the editor stands where the line with its name now stands, and an open editor stays anchored as another page inserts above it", async ({ extension, site }) => {
  const { page, view } = await listViewIn('popup', extension, site, { mappings: DOC });
  await view.pencil('cal').click();
  const editor = rowEditor(page);
  await editor.note.fill('typed');
  // Another page adds a line above it: the editor stays open, anchored on its line, now line 6.
  await extension.seedStorage({ mappings: `\\ above\n${DOC}` });
  await expect(view.numbers).toHaveText(['4', '7', '9']);
  expect(await items(view)).toEqual(['heading', 'row 4', 'editor', 'row 7', 'heading', 'row 9']);
  await expect(editor.note).toHaveValue('typed');
  // Another page moves the line with its name to the end, with another URL: the editor stands there.
  const moved = `\\ above\n${DOC.replace(`${CAL}\n`, '')}\ncal  https://moved.example/`;
  await extension.seedStorage({ mappings: moved });
  await expect(view.numbers).toHaveText(['4', '6', '8']);
  expect(await items(view)).toEqual(['heading', 'row 4', 'row 6', 'heading', 'row 8', 'editor']);
  await expect(editor.note).toHaveValue('typed');
  await editor.save.click();
  await expect(editor.stale).toHaveText('Not saved: line 5, "cal", was changed since this editor opened, and nothing was stored. It is now line 9:');
  await editor.editAgain.click();
  await editor.save.click();
  await expect(lineConfirmation(page).text).toHaveText('Changed "cal" on line 9');
  // Over the line as it now stands, in its columns (F12).
  expect(await storedDocument(extension)).toBe(moved.replace('cal  https://moved.example/', 'cal  https://cal.example/ \\ typed'));
});

test('in the popup, while a Save awaits its reply the other pencils and Fix in text wait, the footer saying so; the reply closes the editor and they act again', async ({ extension, site }) => {
  const { page, view, check } = await listViewIn('popup', extension, site, { mappings: DOC });
  const held = await holdPageRequests(page, 'rewrite');
  await view.pencil('mail').click();
  const editor = rowEditor(page);
  await editor.url.fill('https://mine.example/');
  await editor.save.click();
  await expect.poll(held.held).toBe(1);
  for (const control of [view.pencil('cal'), view.pencil('last'), view.fixInText]) await expect(control).toHaveAttribute('aria-disabled', 'true');
  await view.pencil('cal').focus();
  await expect(footer(page)).toHaveText('Enter does nothing until the change is stored');
  await page.keyboard.press('Enter');
  // Pressed though it waits, as Playwright would not.
  await view.fixInText.click({ force: true });
  await expect(editor.name).toHaveValue('mail');
  await expect(view.fixInText).toBeVisible();
  await check();
  await held.release();
  await expect(lineConfirmation(page).text).toHaveText('Changed "mail" on line 3');
  await expect(editor.name).toHaveCount(0);
  for (const control of [view.pencil('mail'), view.pencil('cal'), view.pencil('last'), view.fixInText]) await expect(control).toHaveAttribute('aria-disabled', 'false');
  await view.pencil('cal').click();
  await expect(editor.name).toHaveValue('cal');
});

test('in the popup, a store Chrome refuses says so and keeps the typed values in the open editor', async ({ extension, site }) => {
  const { page, view, check } = await listViewIn('popup', extension, site, { mappings: DOC });
  await view.pencil('mail').click();
  const editor = rowEditor(page);
  await editor.name.fill('mine');
  await refuseWorkerStorage(extension.worker, 'set', 'Quota exceeded');
  await editor.save.click();
  await expect(editor.said).toHaveText('Not saved: nothing was stored. Chrome said: Quota exceeded');
  await expect(editor.name).toHaveValue('mine');
  await expect(editor.note).toHaveValue('its note');
  await expect(lineConfirmation(page).text).toHaveCount(0);
  expect(await storedDocument(extension)).toBe(DOC);
  await check();
});

test("in the popup, Tab to another pencil leaves the confirmation; Enter there ends it and opens that editor; another pencil's Enter closes the first editor, storing nothing", async ({ extension, site }) => {
  const { page, view } = await listViewIn('popup', extension, site, { mappings: DOC });
  await view.pencil('mail').click();
  const editor = rowEditor(page);
  await editor.note.fill('');
  await editor.save.click();
  const confirmation = lineConfirmation(page);
  await expect(confirmation.text).toHaveText('Changed "mail" on line 3');
  const saved = await storedDocument(extension);
  // Once the rewritten row is drawn: the redraw replaces the row the focus was on.
  await expect(view.notes).toHaveCount(0);
  await expect(view.pencil('mail')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(confirmation.undo).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(view.pencil('cal')).toBeFocused();
  await expect(confirmation.text).toHaveText('Changed "mail" on line 3');
  await page.keyboard.press('Enter');
  await expect(confirmation.text).toHaveCount(0);
  await expect(editor.name).toHaveValue('cal');
  await editor.note.fill('typed');
  await view.pencil('last').focus();
  await page.keyboard.press('Enter');
  await expect(editor.name).toHaveValue('last');
  await expect(editor.note).toHaveValue('');
  expect(await storedDocument(extension)).toBe(saved);
});

test('in the popup, untouched, Undo goes after ten seconds and the focus it had goes to a visible control, the footer true', async ({ extension, site }) => {
  const { page, view } = await listViewIn('popup', extension, site, { mappings: DOC });
  await view.pencil('mail').click();
  await rowEditor(page).note.fill('');
  await rowEditor(page).save.click();
  const confirmation = lineConfirmation(page);
  await expect(confirmation.text).toHaveText('Changed "mail" on line 3');
  await confirmation.undo.focus();
  await page.waitForTimeout(8_500);
  await expect(confirmation.text).toHaveText('Changed "mail" on line 3');
  await expect(confirmation.text).toHaveCount(0, { timeout: 2_500 });
  await expect(view.pencil('mail')).toBeFocused();
  await expect(footer(page)).toHaveText('Enter edits line 3');
});

test("in the popup, an Undo another page's change refuses says so, offers nothing, and leaves the focus on a visible control", async ({ extension, site }) => {
  const { page, view } = await listViewIn('popup', extension, site, { mappings: DOC });
  await view.pencil('mail').click();
  await rowEditor(page).note.fill('');
  await rowEditor(page).save.click();
  const confirmation = lineConfirmation(page);
  await expect(confirmation.text).toHaveText('Changed "mail" on line 3');
  const changed = DOC.replace(MAIL, 'mail  https://other.example/');
  await extension.seedStorage({ mappings: changed });
  await expect(view.urls.first()).toHaveText('https://other.example/');
  await confirmation.undo.focus();
  await page.keyboard.press('Enter');
  await expect(confirmation.text).toHaveText('Not undone: line 3, "mail", was changed or removed since. Nothing was stored.');
  await expect(confirmation.undo).toHaveCount(0);
  expect(await storedDocument(extension)).toBe(changed);
  await expect(view.pencil('mail')).toBeFocused();
  await expect(footer(page)).toHaveText('Enter edits line 3');
});
