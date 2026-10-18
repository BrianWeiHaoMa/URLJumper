// The first run (In use, "First run"; G30): while the document is absent or holds only whitespace the popup
// shows *Name this page*, selected so Enter starts it, *Load example mappings*, which stores F11's text and
// is offered only then (G21 when it cannot), and the shortcuts as Chrome reports them with the way to
// Chrome's page for changing them (E6); it fits the popup (G7) and passes the accessibility pass (G32).
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  assignedShortcuts,
  assignShortcut,
  checkFitAndAccessibility,
  closingPopup,
  distDir,
  exampleFromSpecification,
  expect,
  popupOnNewPage,
  slowWorkerReads,
  test,
} from './extension.ts';

const footer = (popup: Page) => popup.locator('footer');
const firstRun = (popup: Page) => popup.getByRole('heading', { name: 'No mappings yet' });
const namePage = (popup: Page) => popup.getByRole('button', { name: 'Name this page' });
const loadExample = (popup: Page) => popup.getByRole('button', { name: 'Load example mappings' });
const nameField = (popup: Page) => popup.getByRole('textbox', { name: 'Name' });

const SHORTCUTS_PAGE = 'chrome://extensions/shortcuts';
const INSERT = { kind: 'insert', name: 'elsewhere', url: 'https://elsewhere.example/', note: '', heading: null } as const;

test('an absent, empty, or blank document shows the first run in place of the list, Name this page selected: Enter opens the form, and the name saved is listed', async ({ extension, site }) => {
  for (const stored of [{}, { mappings: '' }, { mappings: '  \n\t' }]) {
    await extension.seedStorage(stored);
    const { page, popup } = await popupOnNewPage(extension, site, `First page ${JSON.stringify(stored)}`);
    await expect(firstRun(popup)).toBeVisible();
    await expect(namePage(popup)).toBeFocused();
    await expect(footer(popup)).toHaveText('Enter opens the Name form');
    await expect(popup.getByRole('combobox')).toHaveCount(0);
    // Typing lists nothing: the first run stays in place of the list.
    await popup.keyboard.type('zz');
    await expect(popup.getByRole('option')).toHaveCount(0);
    await expect(firstRun(popup)).toBeVisible();

    await popup.keyboard.press('Enter');
    await expect(nameField(popup)).toBeFocused();
    await expect(nameField(popup)).toHaveValue('');
    await expect(popup.getByRole('textbox', { name: 'URL' })).toHaveValue(page.url());
    await popup.keyboard.type('first');
    await popup.keyboard.press('Enter');
    await expect(popup.getByRole('status')).toHaveText('Saved "first" as line 1');
    await expect(popup.locator('[role=option] .row-name')).toHaveText(['first']);
    await expect(firstRun(popup)).toHaveCount(0);
    await expect(loadExample(popup)).toHaveCount(0);
    await popup.close();
  }
});

test('with the focus on nothing, Enter still starts Name this page', async ({ extension, site }) => {
  await extension.seedStorage({});
  const { popup } = await popupOnNewPage(extension, site);
  await popup.locator('.first-run-intro').click();
  await expect(namePage(popup)).not.toBeFocused();
  await expect(footer(popup)).toHaveText('Enter opens the Name form');
  await popup.keyboard.press('Enter');
  await expect(nameField(popup)).toBeFocused();
});

test("Load example mappings stores F11's text, and search lists its mappings in place of the first run, which is not offered again", async ({ extension, site }) => {
  await extension.seedStorage({});
  const { popup } = await popupOnNewPage(extension, site);
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Tab');
  await expect(loadExample(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter loads the example mappings');
  await popup.keyboard.press('Enter');

  await expect(popup.locator('[role=option] .row-name')).toHaveText(['mail', 'cal', 'news', 'g', 'yt', 'wiki', 'team calendar']);
  expect((await extension.readStorage()).mappings).toBe(exampleFromSpecification());
  await expect(firstRun(popup)).toHaveCount(0);
  await expect(loadExample(popup)).toHaveCount(0);
  await expect(popup.getByRole('combobox')).toBeFocused();
  await popup.close();

  const next = await popupOnNewPage(extension, site, 'With the example');
  await expect(next.popup.getByRole('option')).toHaveCount(7);
  await expect(loadExample(next.popup)).toHaveCount(0);
});

test('while the load awaits the worker, the first run fits and passes the accessibility pass', async ({ extension, site }) => {
  await extension.seedStorage({});
  const { popup } = await popupOnNewPage(extension, site);
  // The load reads the document first; held there, it stays in flight for the rest of the check.
  await slowWorkerReads(extension.worker, 'mappings', 60_000);
  await loadExample(popup).focus();
  await popup.keyboard.press('Enter');
  await expect(footer(popup)).toHaveText('Loading · Enter does nothing until it is stored');
  await expect(loadExample(popup)).toHaveAttribute('aria-disabled', 'true');
  await checkFitAndAccessibility(popup);
  await expect(footer(popup)).toHaveText('Loading · Enter does nothing until it is stored');
});

test("another window's line replaces the first run with the list without a keystroke; a load it beat says nothing was loaded", async ({ extension, site }) => {
  await extension.seedStorage({});
  // The other window opens first, so it takes no focus from the popup later.
  const other = await extension.openRequestPage();
  const { popup } = await popupOnNewPage(extension, site);
  await expect(firstRun(popup)).toBeVisible();
  expect(await other.send(INSERT)).toMatchObject({ kind: 'applied', line: 1 });
  await expect(popup.locator('[role=option] .row-name')).toHaveText(['elsewhere']);
  await expect(loadExample(popup)).toHaveCount(0);
  await expect(popup.getByRole('combobox')).toBeFocused();
  await popup.close();

  // The other window's insert reaches the worker first and is stored while the load waits behind it.
  await extension.seedStorage({});
  const late = await popupOnNewPage(extension, site, 'Beaten to it');
  await expect(firstRun(late.popup)).toBeVisible();
  await slowWorkerReads(extension.worker, 'mappings', 500);
  const inserted = other.send(INSERT);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await loadExample(late.popup).click();
  expect(await inserted).toMatchObject({ kind: 'applied', line: 1 });
  const stored = (await extension.readStorage()).mappings;
  await expect(late.popup.getByRole('alert')).toHaveText('The example mappings were not loaded: the document is no longer empty.');
  await expect(late.popup.locator('[role=option] .row-name')).toHaveText(['elsewhere']);
  expect((await extension.readStorage()).mappings).toBe(stored);
});

test("a load Chrome refuses to store says so with Chrome's message; the document stays absent and the first run stays", async ({ extension, site }) => {
  await extension.seedStorage({});
  const { popup } = await popupOnNewPage(extension, site);
  await extension.fillStorage(10);
  await loadExample(popup).click();
  await expect(popup.getByRole('alert')).toHaveText(/^The example mappings were not loaded: nothing was stored\. Chrome said: \S/);
  expect('mappings' in (await extension.readStorage())).toBe(false);
  await expect(firstRun(popup)).toBeVisible();
  await expect(loadExample(popup)).toBeVisible();
  await checkFitAndAccessibility(popup);
});

test('Undo of the first save brings the first run back with the Undo confirmed and its own Undo still offered, which puts the line back', async ({ extension, site }) => {
  await extension.seedStorage({});
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.press('Enter');
  await popup.keyboard.type('first');
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('status')).toHaveText('Saved "first" as line 1');
  const saved = (await extension.readStorage()).mappings;

  await popup.locator('.confirmation').getByRole('button', { name: 'Undo saving "first"' }).click();
  await expect(firstRun(popup)).toBeVisible();
  await expect(popup.getByRole('status')).toHaveText('Removed "first" from line 1');
  const undo = popup.locator('.confirmation').getByRole('button', { name: 'Undo removing "first"' });
  await expect(undo).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter undoes the removal, putting the line back');
  expect((await extension.readStorage()).mappings).toBe('');
  await checkFitAndAccessibility(popup);
  await expect(undo).toBeVisible();

  await undo.focus();
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('status')).toHaveText('Put "first" back as line 1');
  await expect(popup.locator('[role=option] .row-name')).toHaveText(['first']);
  expect((await extension.readStorage()).mappings).toBe(saved);
});

test("the shortcuts shown are those Chrome has assigned now, a reassigned one included, and the button opens Chrome's shortcuts page", async ({ extension, site }) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8')) as { commands: Record<string, { description: string }> };
  const commands = ['open-new-tab', 'open-same-tab', 'name-this-page'];
  const shown = (popup: Page) =>
    popup.locator('.shortcut').evaluateAll((rows) => rows.map((row) => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent]));
  const expected = async () => {
    const assigned = await assignedShortcuts(extension.worker);
    return commands.map((name) => [manifest.commands[name]!.description, assigned[name] || 'Not set']);
  };

  await extension.seedStorage({});
  const { popup } = await popupOnNewPage(extension, site);
  // Chrome keeps Alt+Shift+N for itself here, so it assigned none (E6).
  expect((await assignedShortcuts(extension.worker))['name-this-page']).toBe('');
  await expect.poll(() => shown(popup)).toEqual(await expected());
  expect((await shown(popup))[2]).toEqual(['Name this page in URLJumper', 'Not set']);
  await popup.close();

  await assignShortcut(extension.context, extension.id, 'open-new-tab', 'Alt+J');
  const next = await popupOnNewPage(extension, site, 'After the shortcut changed');
  await expect.poll(() => shown(next.popup)).toEqual(await expected());
  expect((await shown(next.popup))[0]).toEqual(['Open URLJumper; Enter opens in a new tab', 'Alt+J']);

  const button = next.popup.getByRole('button', { name: 'Change shortcuts in Chrome' });
  await button.focus();
  await expect(footer(next.popup)).toHaveText("Enter opens Chrome's shortcuts page");
  expect((await extension.tabUrls()).filter((url) => url === SHORTCUTS_PAGE)).toHaveLength(0);
  // The tab it opens takes the focus, so Chrome closes the popup.
  await closingPopup(next.popup, () => next.popup.keyboard.press('Enter'));
  await expect.poll(async () => (await extension.tabUrls()).filter((url) => url === SHORTCUTS_PAGE)).toHaveLength(1);
});

test('the first run fits the popup with a long confirmation, and with a message, nothing of its own cut off', async ({ extension, site }) => {
  await extension.seedStorage({});
  const { popup } = await popupOnNewPage(extension, site);
  const fits = () =>
    popup.evaluate(() => ({
      footerInView: document.querySelector('footer')!.getBoundingClientRect().bottom <= innerHeight,
      noPageOverflow: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
      uncut: [...document.querySelectorAll<HTMLElement>('.form-title, .view p, .view h2, .view dt, .view dd, .view button, footer')].every(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    }));
  const whole = { footerInView: true, noPageOverflow: true, uncut: true };

  await popup.keyboard.press('Enter');
  await popup.keyboard.type(`a long name ${'n'.repeat(300)}`);
  await popup.keyboard.press('Enter');
  await popup.locator('.confirmation').getByRole('button').click();
  await expect(firstRun(popup)).toBeVisible();
  await expect(popup.getByRole('status')).toContainText('Removed "a long name');
  expect(await fits()).toEqual(whole);

  // Activating another control ends the confirmation; the refusal's message takes its place.
  await extension.fillStorage(10);
  await loadExample(popup).click();
  await expect(popup.getByRole('alert')).toBeVisible();
  await expect(popup.locator('.confirmation')).toHaveCount(0);
  expect(await fits()).toEqual(whole);
});
