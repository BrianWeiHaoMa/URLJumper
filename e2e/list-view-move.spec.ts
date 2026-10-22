// Moving a line in the List view, in both settings hosts (In use, "Edit the list"; G12, G13, G15, G21, G26,
// G27, G32, L2, R1, R4): a row's editor in place moves its line directly before the previous mapping line or
// after the next, at once, confirmed by name and line with Undo, which moves it back, itself undoable; the
// editor stays open on the moved line with the focus where it was; a move the document does not admit is
// offered disabled, saying why, and one the document stopped admitting stores nothing and says so; a line
// another page changed offers *Edit again*; a failed store keeps the typed values; and the confirmation ends at
// the user's next action or ten seconds.
import type { Page } from '@playwright/test';
import {
  closingPopup,
  expect,
  holdPageRequests,
  lineConfirmation,
  listViewIn,
  listViewInPopup,
  popupOnNewPage,
  recordWorkerCalls,
  refuseWorkerStorage,
  rowEditor,
  SETTINGS_HOSTS,
  slowWorkerReads,
  test,
  watchRequests,
  type ListView,
  type LoadedExtension,
} from './extension.ts';

const MAIL = 'mail                 https://mail.example/';
const CAL = 'cal\thttps://cal.example/  \\ its note';
const NEWS = 'news                 https://news.example/';
const DOC = ['\\ Daily', MAIL, '', '\\ Later', CAL, NEWS].join('\n');
/** `cal` moved up: directly before `mail`, the previous mapping line, past the heading and the blank line, which keep their order. */
const CAL_UP = ['\\ Daily', CAL, MAIL, '', '\\ Later', NEWS].join('\n');
const USAGE = { 'cal\nhttps://cal.example/': [1_700_000_000_001], 'mail\nhttps://mail.example/': [1_700_000_000_002] };

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

for (const host of SETTINGS_HOSTS) {
  test(`in the ${host}, Move up by Enter moves the line before the previous mapping at once, the editor open on it; Undo moves it back, and that Undo's Undo again`, async ({ extension, site }) => {
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC, usage: USAGE });
    const calls = await recordWorkerCalls(extension.worker);
    const changes = await extension.watchStorage();
    const jumps = await watchRequests(extension.worker, 'jump');
    await view.pencil('cal').click();
    const editor = rowEditor(page);
    await editor.moveUp.focus();
    if (host === 'popup') await expect(footer(page)).toHaveText('Enter moves line 5 up to line 2');
    await page.keyboard.press('Enter');
    const confirmation = lineConfirmation(page);
    await expect(confirmation.text).toHaveText('Moved "cal" to line 2');
    await expect(confirmation.undo).toBeInViewport();
    await expect(confirmation.undo).toHaveAccessibleName('Undo moving "cal"');
    expect(await storedDocument(extension)).toBe(CAL_UP);
    // One write, the document with its usage, whose learning stays (R1, G27).
    expect((await calls()).filter(([method]) => method === 'storage.set').map(([, items]) => Object.keys(items as object).sort())).toEqual([['mappings', 'usage']]);
    expect((await changes()).filter((change) => 'mappings' in change)).toHaveLength(1);
    expect((await extension.readStorage()).usage).toEqual(USAGE);
    // The editor stays open on the moved line, its fields as they were, the focus on the control that moved it.
    await expect.poll(() => items(view)).toEqual(['heading', 'editor', 'confirmation', 'row 3', 'heading', 'row 6']);
    await expect(editor.name).toHaveValue('cal');
    await expect(editor.note).toHaveValue('its note');
    await expect(editor.moveUp).toBeFocused();
    await expect(editor.moveUp).toHaveAttribute('aria-disabled', 'true');
    if (host === 'popup') await expect(footer(page)).toHaveText('Enter does nothing · line 2 is the first mapping');
    await check();

    await confirmation.undo.focus();
    if (host === 'popup') await expect(footer(page)).toHaveText('Enter undoes the move, moving the line back');
    await page.keyboard.press('Enter');
    await expect(confirmation.text).toHaveText('Moved "cal" back to line 5');
    expect(await storedDocument(extension)).toBe(DOC);
    await expect.poll(() => items(view)).toEqual(['heading', 'row 2', 'heading', 'editor', 'confirmation', 'row 6']);
    await expect(confirmation.undo).toBeFocused();
    await expect(confirmation.undo).toHaveAccessibleName('Undo moving back "cal"');
    if (host === 'popup') await expect(footer(page)).toHaveText('Enter undoes moving the line back, moving it again');
    await page.keyboard.press('Enter');
    await expect(confirmation.text).toHaveText('Moved "cal" back to line 2');
    expect(await storedDocument(extension)).toBe(CAL_UP);
    await expect.poll(() => items(view)).toEqual(['heading', 'editor', 'confirmation', 'row 3', 'heading', 'row 6']);
    await page.keyboard.press('Enter');
    await expect(confirmation.text).toHaveText('Moved "cal" back to line 5');
    expect(await storedDocument(extension)).toBe(DOC);
    // The editor followed its line throughout and moves it from where it now stands.
    await expect(editor.moveUp).toHaveAttribute('aria-disabled', 'false');
    await editor.moveDown.click();
    await expect(confirmation.text).toHaveText('Moved "cal" to line 6');
    expect(await storedDocument(extension)).toBe(['\\ Daily', MAIL, '', '\\ Later', NEWS, CAL].join('\n'));
    expect(await jumps()).toEqual([]);
  });

  test(`in the ${host}, Move down by click moves the line after the next mapping, past the blank line and the heading, which keep their order`, async ({ extension, site }) => {
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC });
    await view.pencil('mail').click();
    const editor = rowEditor(page);
    await editor.moveDown.click();
    await expect(lineConfirmation(page).text).toHaveText('Moved "mail" to line 5');
    expect(await storedDocument(extension)).toBe(['\\ Daily', '', '\\ Later', CAL, MAIL, NEWS].join('\n'));
    await expect.poll(() => items(view)).toEqual(['heading', 'heading', 'row 4', 'editor', 'confirmation', 'row 6']);
    await expect(editor.moveDown).toBeFocused();
    if (host === 'popup') await expect(footer(page)).toHaveText('Enter moves line 5 down to line 6');
    await check();
  });

  test(`in the ${host}, the first mapping's Move up and the last's Move down, and a move past a line with its name, are disabled yet reached by Tab, saying why, and store nothing`, async ({ extension, site }) => {
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC });
    const moves = await watchRequests(extension.worker, 'move');
    const editor = rowEditor(page);
    await view.pencil('mail').click();
    await editor.copyLink.focus();
    await page.keyboard.press('Tab');
    await expect(editor.moveUp).toBeFocused();
    await expect(editor.moveUp).toHaveAttribute('aria-disabled', 'true');
    if (host === 'popup') await expect(footer(page)).toHaveText('Enter does nothing · line 2 is the first mapping');
    await page.keyboard.press('Enter');
    await editor.moveUp.click({ force: true });
    await page.keyboard.press('Tab');
    await expect(editor.moveDown).toBeFocused();
    await expect(editor.moveDown).toHaveAttribute('aria-disabled', 'false');
    await check();

    await editor.cancel.click();
    await view.pencil('news').click();
    await expect(editor.moveDown).toHaveAttribute('aria-disabled', 'true');
    await editor.moveDown.focus();
    if (host === 'popup') await expect(footer(page)).toHaveText('Enter does nothing · line 6 is the last mapping');
    await page.keyboard.press('Enter');
    await editor.moveDown.click({ force: true });
    await expect(editor.moveUp).toHaveAttribute('aria-disabled', 'false');

    // Line 2 repeats a's name: a moved past it would leave that line the mapping and itself unreadable (G12, G13).
    await extension.seedStorage({ mappings: 'a  https://a.example/\na  https://other.example/\nb  https://b.example/' });
    await expect(view.unreadableRows).toHaveCount(1);
    await view.pencil('a').click();
    await expect(editor.moveDown).toHaveAttribute('aria-disabled', 'true');
    await editor.moveDown.focus();
    if (host === 'popup') await expect(footer(page)).toHaveText('Enter does nothing · line 2, which has this name, is in the way');
    await page.keyboard.press('Enter');
    await editor.moveDown.click({ force: true });
    expect(await moves()).toEqual([]);
    expect(await storedDocument(extension)).toBe('a  https://a.example/\na  https://other.example/\nb  https://b.example/');
    await expect(lineConfirmation(page).text).toHaveCount(0);
  });
}

test("in the popup, a move down at the foot of a scrolled list brings its Undo into view below the editor, the focus kept on Move down", async ({ extension, site }) => {
  const twenty = Array.from({ length: 20 }, (_, i) => `m${i + 1}  https://m${i + 1}.example/`).join('\n');
  const { page, view, check } = await listViewIn('popup', extension, site, { mappings: twenty });
  await view.pencil('m17').click();
  const editor = rowEditor(page);
  // Move down at the very foot of the view, as Tab leaves a control below it.
  await editor.moveDown.evaluate((button: HTMLElement) => {
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: 'end' });
  });
  await page.keyboard.press('Enter');
  await expect(lineConfirmation(page).text).toHaveText('Moved "m17" to line 18');
  await expect(lineConfirmation(page).undo).toBeInViewport();
  await expect(editor.moveDown).toBeFocused();
  await expect(editor.moveDown).toBeInViewport();
  await check();
});

test('in the popup, a move held while another page moves the line to the top: the controls follow, and the move is refused, saying why, the typed values kept', async ({ extension, site }) => {
  const other = await extension.openRequestPage();
  const { page, view, check } = await listViewIn('popup', extension, site, { mappings: DOC });
  await view.pencil('cal').click();
  const editor = rowEditor(page);
  await editor.note.fill('typed');
  const held = await holdPageRequests(page, 'move');
  await editor.moveUp.click();
  await expect.poll(held.held).toBe(1);
  await expect(footer(page)).toHaveText('Moving · Enter does nothing until it is stored');
  for (const control of [view.pencil('mail'), view.pencil('news')]) await expect(control).toHaveAttribute('aria-disabled', 'true');
  await expect(editor.note).not.toBeEditable();
  expect(await other.send({ kind: 'move', line: 5, text: CAL, direction: 'up' })).toMatchObject({ kind: 'applied', line: 2 });
  // The editor follows its line to the top.
  await expect.poll(() => items(view)).toEqual(['heading', 'editor', 'row 3', 'heading', 'row 6']);
  await held.release();
  await expect(editor.said).toHaveText('Not moved: line 2 is the first mapping now, and nothing was stored.');
  // Its controls follow the document as now read: there Move up is not admitted.
  await expect(editor.moveUp).toHaveAttribute('aria-disabled', 'true');
  await expect(editor.moveDown).toHaveAttribute('aria-disabled', 'false');
  await editor.moveUp.focus();
  await expect(footer(page)).toHaveText('Enter does nothing · line 2 is the first mapping');
  await expect(editor.editAgain).toHaveCount(0);
  await expect(lineConfirmation(page).text).toHaveCount(0);
  expect(await storedDocument(extension)).toBe(CAL_UP);
  await expect(editor.note).toHaveValue('typed');
  await expect(editor.note).toBeEditable();
  for (const control of [view.pencil('mail'), view.pencil('news')]) await expect(control).toHaveAttribute('aria-disabled', 'false');
  await check();
});

test("in the popup, a move's Undo that lands after another row's editor opened moves its own line back and leaves that editor on its row", async ({ extension, site }) => {
  const { page, view } = await listViewIn('popup', extension, site, { mappings: DOC });
  await view.pencil('cal').click();
  const editor = rowEditor(page);
  await editor.moveUp.click();
  const confirmation = lineConfirmation(page);
  await expect(confirmation.text).toHaveText('Moved "cal" to line 2');
  const held = await holdPageRequests(page, 'undo');
  await confirmation.undo.click();
  await expect.poll(held.held).toBe(1);
  await view.pencil('news').click();
  await expect(editor.name).toHaveValue('news');
  await held.release();
  await expect(confirmation.text).toHaveText('Moved "cal" back to line 5');
  expect(await storedDocument(extension)).toBe(DOC);
  await expect.poll(() => items(view)).toEqual(['heading', 'row 2', 'heading', 'row 5', 'confirmation', 'editor']);
  await expect(editor.name).toHaveValue('news');
  await editor.delete.click();
  await expect(confirmation.text).toHaveText('Removed "news" from line 6');
  expect(await storedDocument(extension)).toBe(['\\ Daily', MAIL, '', '\\ Later', CAL].join('\n'));
});

test('in the popup, a line another page rewrote refuses a move, saying what it now is; Edit again moves it from where it stands', async ({ extension, site }) => {
  const other = await extension.openRequestPage();
  const { page, view, check } = await listViewIn('popup', extension, site, { mappings: DOC });
  await view.pencil('cal').click();
  const editor = rowEditor(page);
  expect(await other.send({ kind: 'rewrite', line: 5, text: CAL, name: 'cal', url: 'https://other.example/', note: '' })).toMatchObject({ kind: 'applied' });
  const theirs = (await storedDocument(extension)) as string;
  const theirLine = theirs.split('\n')[4]!;
  await expect(view.urls).toHaveText(['https://mail.example/', 'https://news.example/']);
  await editor.moveDown.focus();
  await expect(footer(page)).toHaveText('Enter tries to move line 5 down · the line has changed');
  await page.keyboard.press('Enter');
  await expect(editor.stale).toHaveText('Not moved: line 5, "cal", was changed since this editor opened, and nothing was stored. It is now line 5:');
  expect(await editor.staleLine.textContent()).toBe(theirLine);
  await expect(editor.moveDown).toHaveAttribute('aria-disabled', 'true');
  await expect(footer(page)).toHaveText('Enter does nothing · Edit again first');
  expect(await storedDocument(extension)).toBe(theirs);
  await check();
  await editor.editAgain.click();
  await editor.moveDown.click();
  await expect(lineConfirmation(page).text).toHaveText('Moved "cal" to line 6');
  expect(await storedDocument(extension)).toBe(['\\ Daily', MAIL, '', '\\ Later', NEWS, theirLine].join('\n'));
});

test("in the popup, after a move, typing into a field ends its confirmation; a second move replaces it; untouched, it ends at ten seconds", async ({ extension, site }) => {
  const { page, view } = await listViewIn('popup', extension, site, { mappings: DOC });
  await view.pencil('mail').click();
  const editor = rowEditor(page);
  const confirmation = lineConfirmation(page);
  await editor.moveDown.click();
  await expect(confirmation.text).toHaveText('Moved "mail" to line 5');
  await editor.moveDown.click();
  await expect(confirmation.text).toHaveText('Moved "mail" to line 6');
  expect(await storedDocument(extension)).toBe(['\\ Daily', '', '\\ Later', CAL, NEWS, MAIL].join('\n'));
  await editor.name.focus();
  await page.keyboard.type('s');
  await expect(confirmation.text).toHaveCount(0);
  await expect(editor.name).toHaveValue('mails');
  // The typed name stays unsaved across a move, which moves the stored line.
  await editor.moveUp.click();
  await expect(confirmation.text).toHaveText('Moved "mail" to line 5');
  await expect(editor.name).toHaveValue('mails');
  expect(await storedDocument(extension)).toBe(['\\ Daily', '', '\\ Later', CAL, MAIL, NEWS].join('\n'));
  await page.waitForTimeout(8_500);
  await expect(confirmation.text).toHaveText('Moved "mail" to line 5');
  await expect(confirmation.text).toHaveCount(0, { timeout: 2_500 });
  await expect(editor.moveUp).toBeFocused();
});

test('in the popup, a move Chrome refuses to store says so and keeps the editor open with its typed values', async ({ extension, site }) => {
  const { page, view, check } = await listViewIn('popup', extension, site, { mappings: DOC });
  await view.pencil('cal').click();
  const editor = rowEditor(page);
  await editor.url.fill('https://mine.example/');
  await refuseWorkerStorage(extension.worker, 'set', 'Quota exceeded');
  await editor.moveUp.click();
  await expect(editor.said).toHaveText('Not moved: nothing was stored. Chrome said: Quota exceeded');
  await expect(editor.url).toHaveValue('https://mine.example/');
  await expect(editor.name).toHaveValue('cal');
  await expect(lineConfirmation(page).text).toHaveCount(0);
  expect(await storedDocument(extension)).toBe(DOC);
  await expect(editor.moveUp).toBeFocused();
  await check();
});

test('in the popup, Escape in the editor after a move closes the popup, opening nothing', async ({ extension, site }) => {
  const jumps = await watchRequests(extension.worker, 'jump');
  const { page, view } = await listViewIn('popup', extension, site, { mappings: DOC });
  const tabs = await extension.tabUrls();
  await view.pencil('cal').click();
  const editor = rowEditor(page);
  await editor.moveUp.click();
  await expect(lineConfirmation(page).text).toHaveText('Moved "cal" to line 2');
  await closingPopup(page, () => page.keyboard.press('Escape'));
  expect(await jumps()).toEqual([]);
  expect((await extension.tabUrls()).filter((url) => !tabs.includes(url))).toEqual([]);
  expect(await storedDocument(extension)).toBe(CAL_UP);
});

test('a popup closed before its move replies leaves the move stored, and the next popup lists it', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const other = await extension.openRequestPage();
  const moves = await watchRequests(extension.worker, 'move');
  const { page, popup } = await popupOnNewPage(extension, site);
  const view = await listViewInPopup(popup);
  await view.pencil('cal').click();
  await slowWorkerReads(extension.worker, 'mappings', 3_000);
  await rowEditor(popup).moveUp.click();
  await expect(footer(popup)).toHaveText('Moving · Enter does nothing until it is stored');
  await expect.poll(moves).toHaveLength(1);
  await popup.close();
  // A no-op on the same queue waits for the closed editor's request to settle.
  expect(await other.send({ kind: 'remove-intent', windowId: -1, time: 0 })).toEqual({ kind: 'done' });
  expect(await storedDocument(extension)).toBe(CAL_UP);
  const next = await extension.clickToolbarButton(page);
  const listed = await listViewInPopup(next);
  await expect(listed.names).toHaveText(['cal', 'mail', 'news']);
  await expect(listed.numbers).toHaveText(['2', '3', '6']);
});

for (const host of SETTINGS_HOSTS) {
  test(`in the ${host}, named and titled move arrows share a line with Cancel below Save, Delete, and Copy link, in keyboard order`, async ({ extension, site }) => {
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC });
    await check();
    await view.pencil('cal').click();
    const editor = rowEditor(page);
    for (const [arrow, name, control] of [[editor.moveUp, 'Move up', 'move-up'], [editor.moveDown, 'Move down', 'move-down']] as const) {
      await expect(arrow).toHaveAccessibleName(name);
      await expect(arrow).toHaveAttribute('title', name);
      await expect(arrow).toHaveAttribute('data-control', control);
      await expect(arrow).toHaveClass('form-button row-editor-move');
      await expect(arrow).toHaveText('');
      await expect(arrow.locator('svg')).toHaveCount(1);
    }
    expect(await editor.moves.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent))).toEqual(['Move up', 'Move down', 'Cancel']);
    const upper = await Promise.all([editor.save, editor.delete, editor.copyLink].map(async (button) => (await button.boundingBox())!));
    const lower = await Promise.all([editor.moveUp, editor.moveDown, editor.cancel].map(async (button) => (await button.boundingBox())!));
    for (const box of upper) expect(box.y).toBe(upper[0]!.y);
    for (const box of lower) {
      expect(box.y).toBe(lower[0]!.y);
      expect(box.y).toBeGreaterThanOrEqual(Math.max(...upper.map((box) => box.y + box.height)));
    }
    await editor.save.focus();
    for (const button of [editor.delete, editor.copyLink, editor.moveUp, editor.moveDown, editor.cancel]) {
      await page.keyboard.press('Tab');
      await expect(button).toBeFocused();
    }
    await check();
  });
}
