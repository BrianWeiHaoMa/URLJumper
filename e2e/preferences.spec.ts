// Preferences, as the popup's settings and the options page both show them (In use, "Preferences"): the search
// order (G2, G27) with *Reset learned order* through the worker (R1), the theme (F3, F15), the keyword (F6,
// N10), and the shortcuts as Chrome has assigned them (E6). Nothing is stored until the user chooses.
import type { Page } from '@playwright/test';
import {
  assignShortcut,
  checkFitAndAccessibility,
  closingPopup,
  expect,
  popupOnNewPage,
  recordWorkerCalls,
  refuseWorkerStorage,
  shownTheme,
  slowWorkerReads,
  test,
  type LoadedExtension,
} from './extension.ts';

const DOC = 'a  https://a.example/\nb  https://b.example/\nc  https://c.example/\n';
const KEY = { a: 'a\nhttps://a.example/', b: 'b\nhttps://b.example/', c: 'c\nhttps://c.example/' };
const SHORTCUTS_PAGE = 'chrome://extensions/shortcuts';

const footer = (popup: Page) => popup.locator('footer');
const order = (page: Page) => page.getByRole('listbox', { name: 'Search order' });
const theme = (page: Page) => page.getByRole('listbox', { name: 'Theme' });
const chosen = (choice: ReturnType<typeof order>) => choice.getByRole('option', { selected: true });
const reset = (page: Page) => page.getByRole('button', { name: 'Reset learned order' });
const listed = (popup: Page) => popup.locator('[role=option] .row-name');

async function settingsInPopup(extension: LoadedExtension, site: Parameters<typeof popupOnNewPage>[1], title?: string) {
  const { page, popup } = await popupOnNewPage(extension, site, title);
  await popup.getByRole('button', { name: 'Settings' }).click();
  await expect(order(popup)).toBeFocused();
  return { page, popup };
}

async function optionsPage(extension: LoadedExtension) {
  const page = await extension.context.newPage();
  await page.goto(extension.url('options.html'));
  await expect(order(page)).toBeVisible();
  return page;
}

test('with no order or theme stored, both hosts show Document order and System, and opening either stores nothing', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  // The options page opens first, so it takes no focus from the popup.
  const changes = await extension.watchStorage();
  const options = await optionsPage(extension);
  const { popup } = await settingsInPopup(extension, site);
  for (const page of [popup, options]) {
    await expect(chosen(order(page))).toHaveText('Document order');
    await expect(chosen(theme(page))).toHaveText('System');
  }
  await checkFitAndAccessibility(popup);
  await popup.waitForTimeout(500);
  expect(await changes()).toEqual([]);
  expect(await extension.readStorage()).toEqual({ mappings: DOC });
});

test('the order chosen in the popup is stored and the list back in search follows it; one chosen on the options page shows in the next popup', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC, searchOrder: 'smart', usage: { [KEY.c]: [Date.now() - 60_000] } });
  const options = await optionsPage(extension);
  const { page, popup } = await settingsInPopup(extension, site);
  await expect(chosen(order(popup))).toHaveText('Smart order');
  // The arrow keys choose; past either end nothing changes.
  await popup.keyboard.press('ArrowRight');
  await popup.keyboard.press('ArrowLeft');
  await expect(chosen(order(popup))).toHaveText('Document order');
  expect((await extension.readStorage()).searchOrder).toBe('document');
  await popup.keyboard.press('ArrowLeft');
  await expect(chosen(order(options))).toHaveText('Document order');
  expect((await extension.readStorage()).searchOrder).toBe('document');
  await checkFitAndAccessibility(popup);

  await popup.getByRole('button', { name: 'Back' }).click();
  await expect(listed(popup)).toHaveText(['a', 'b', 'c']);
  await popup.close();

  await order(options).getByRole('option', { name: 'Smart order' }).click();
  expect((await extension.readStorage()).searchOrder).toBe('smart');
  const next = await extension.clickToolbarButton(page);
  await expect(listed(next)).toHaveText(['c', 'a', 'b']);
});

test('Reset learned order has the worker remove the usage: the view says so, the Smart-order list is in line order, and a jump then records its use alone', async ({ extension, site }) => {
  const now = Date.now();
  await extension.seedStorage({ mappings: DOC, searchOrder: 'smart', usage: { [KEY.b]: [now - 120_000], [KEY.c]: [now - 60_000] } });
  const { popup } = await settingsInPopup(extension, site);
  const calls = await recordWorkerCalls(extension.worker);
  await reset(popup).focus();
  await expect(footer(popup)).toHaveText('Enter removes the learned order');
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('status')).toHaveText('Learned order removed: Smart order starts learning again.');
  expect(await extension.readStorage()).toEqual({ mappings: DOC, searchOrder: 'smart' });
  expect(await calls()).toEqual([['storage.remove', 'usage']]);
  await expect(chosen(order(popup))).toHaveText('Smart order');
  await checkFitAndAccessibility(popup);

  await popup.getByRole('button', { name: 'Back' }).click();
  await expect(listed(popup)).toHaveText(['a', 'b', 'c']);
  await popup.keyboard.press('ArrowDown');
  await closingPopup(popup, () => popup.keyboard.press('Enter'));
  await expect.poll(async () => Object.keys(((await extension.readStorage()).usage ?? {}) as object)).toEqual([KEY.a]);
});

test('a reset made while a jump awaits the worker runs after it, and no learned usage is left of either', async ({ extension, site }) => {
  const now = Date.now();
  await extension.seedStorage({ mappings: DOC, searchOrder: 'smart', usage: { [KEY.a]: [now - 120_000], [KEY.b]: [now - 60_000] } });
  // The other page opens first, so it takes no focus from the popup.
  const other = await extension.openRequestPage();
  const { popup } = await settingsInPopup(extension, site);
  const calls = await recordWorkerCalls(extension.worker);
  // The jump reads the usage first; held there, it keeps the worker's queue until it is answered.
  await slowWorkerReads(extension.worker, 'usage', 1_500);
  const jumped = other.send({ kind: 'jump', name: 'a', url: 'https://a.example/', argument: null, mode: 'new-tab', active: false });
  await popup.waitForTimeout(200);
  await reset(popup).click();
  await expect(footer(popup)).toHaveText('Resetting · Enter does nothing until it is done');
  await expect(reset(popup)).toHaveAttribute('aria-disabled', 'true');
  await checkFitAndAccessibility(popup);
  expect(await jumped).toEqual({ kind: 'opened' });
  await expect(popup.getByRole('status')).toHaveText('Learned order removed: Smart order starts learning again.');
  await expect(footer(popup)).toHaveText('Enter removes the learned order');
  expect('usage' in (await extension.readStorage())).toBe(false);
  expect((await calls()).map(([call]) => call)).toEqual(['storage.set', 'storage.remove']);
});

test('a reset the worker cannot carry out says so with Chrome\'s message and leaves the usage', async ({ extension, site }) => {
  const usage = { [KEY.b]: [Date.now() - 60_000] };
  await extension.seedStorage({ mappings: DOC, searchOrder: 'smart', usage });
  const { popup } = await settingsInPopup(extension, site);
  await refuseWorkerStorage(extension.worker, 'remove', 'IO error: the disk is full.');
  await reset(popup).click();
  await expect(popup.getByRole('alert')).toHaveText('The learned order was not reset. Chrome said: IO error: the disk is full.');
  await expect(popup.getByRole('status')).toHaveCount(0);
  expect((await extension.readStorage()).usage).toEqual(usage);
  await checkFitAndAccessibility(popup);
});

test('Light, Dark, and System chosen in the popup store light, dark, and no key, and the popup and an open options page show each at once', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const options = await optionsPage(extension);
  const { popup } = await settingsInPopup(extension, site);
  const changes = await extension.watchStorage();
  const both = [popup, options];

  for (const [label, stored, shown] of [
    ['Dark', 'dark', 'dark'],
    ['Light', 'light', 'light'],
  ] as const) {
    await theme(popup).getByRole('option', { name: label }).click();
    for (const page of both) {
      await expect(chosen(theme(page))).toHaveText(label);
      await expect.poll(() => shownTheme(page)).toBe(shown);
    }
    expect((await extension.readStorage()).themePref).toBe(stored);
  }
  await checkFitAndAccessibility(popup);

  // System is no key, and follows the system's scheme.
  await theme(popup).getByRole('option', { name: 'System' }).click();
  for (const page of both) await expect(chosen(theme(page))).toHaveText('System');
  expect('themePref' in (await extension.readStorage())).toBe(false);
  for (const colorScheme of ['dark', 'light'] as const) {
    for (const page of both) {
      await page.emulateMedia({ colorScheme });
      await expect.poll(() => shownTheme(page)).toBe(colorScheme);
    }
  }
  for (const page of both) await page.emulateMedia({ colorScheme: null });
  expect((await changes()).map((change) => change.themePref)).toEqual([{ newValue: 'dark' }, { oldValue: 'dark', newValue: 'light' }, { oldValue: 'light' }]);

  // A theme chosen on the options page shows in the next popup.
  await closingPopup(popup, () => popup.keyboard.press('Escape'));
  await theme(options).getByRole('option', { name: 'Dark' }).click();
  await expect.poll(() => shownTheme(options)).toBe('dark');
  const next = await settingsInPopup(extension, site, 'After the theme changed');
  expect(await shownTheme(next.popup)).toBe('dark');
  await expect(chosen(theme(next.popup))).toHaveText('Dark');
});

test("a choice Chrome refuses to store leaves the stored one shown and says so with Chrome's message", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await settingsInPopup(extension, site);
  await extension.fillStorage(10);
  await theme(popup).getByRole('option', { name: 'Dark' }).click();
  await expect(popup.getByRole('alert')).toHaveText(/^The Dark theme was not stored\. Chrome said: \S/);
  await expect(chosen(theme(popup))).toHaveText('System');
  await order(popup).focus();
  await popup.keyboard.press('ArrowRight');
  await expect(popup.getByRole('alert')).toHaveText(/^Smart order was not stored\. Chrome said: \S/);
  await expect(chosen(order(popup))).toHaveText('Document order');
  const stored = await extension.readStorage();
  expect('themePref' in stored || 'searchOrder' in stored).toBe(false);
  await checkFitAndAccessibility(popup);
});

test('the keyword shows as j, as text in both hosts and in no field', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const options = await optionsPage(extension);
  const { popup } = await settingsInPopup(extension, site);
  for (const page of [popup, options]) {
    const section = page.getByRole('region', { name: 'Address bar' });
    await expect(section).toContainText("In Chrome's address bar, type j and a space, then a name.");
    await expect(section.locator('kbd')).toHaveText('j');
    await expect(page.getByRole('textbox')).toHaveCount(0);
  }
});

test("both hosts show the shortcuts Chrome has assigned, a reassigned one included and an unassigned one as not set, and open Chrome's shortcuts page", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  await assignShortcut(extension.context, extension.id, 'open-new-tab', 'Alt+J');
  const options = await optionsPage(extension);
  const { popup } = await settingsInPopup(extension, site);
  const expected = [
    ['Open URLJumper; Enter opens in a new tab', 'Alt+J'],
    ['Open URLJumper; Enter opens in this tab', 'Alt+M'],
    // Chrome keeps Alt+Shift+N for itself here, so it assigned none (E6).
    ['Name this page in URLJumper', 'Not set'],
  ];
  for (const page of [popup, options]) {
    await expect
      .poll(() => page.locator('.shortcut').evaluateAll((rows) => rows.map((row) => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent])))
      .toEqual(expected);
  }
  await checkFitAndAccessibility(popup);

  const button = popup.getByRole('button', { name: 'Change shortcuts in Chrome' });
  await button.focus();
  await expect(footer(popup)).toHaveText("Enter opens Chrome's shortcuts page");
  await closingPopup(popup, () => popup.keyboard.press('Enter'));
  await expect.poll(async () => (await extension.tabUrls()).filter((url) => url === SHORTCUTS_PAGE)).toHaveLength(1);
  await options.getByRole('button', { name: 'Change shortcuts in Chrome' }).click();
  await expect.poll(async () => (await extension.tabUrls()).filter((url) => url === SHORTCUTS_PAGE)).toHaveLength(2);
});
