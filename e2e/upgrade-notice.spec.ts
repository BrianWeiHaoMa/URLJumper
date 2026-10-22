// The notice of what is new after an update from 1.x (In use, "Upgrade from 1.x"; G25; State, `upgradeNotice`):
// shown in the first popup's search, first run, and Name form; dismissed for good by any keystroke but Tab and
// Shift+Tab, which still does what it does, by its close control, or by activating it, which opens the
// bundled what's-new page; left pending by a popup closed without a dismissal; never shown after a new
// install or an update from 2.x. Every state fits and passes the accessibility pass (G7, G32), and the footer
// says what Enter does (L2).
import type { Page } from '@playwright/test';
import {
  checkAccessibilityInBothSchemes,
  checkFitAndAccessibility,
  closingPopup,
  expect,
  expectNoNotice,
  holdPageReads,
  popupOnNewPage,
  selectedRowName,
  shownTheme,
  test,
  upgradeNotice,
  type LoadedExtension,
} from './extension.ts';

const DOC =
  '\\ Mail\n' +
  'mailbox              https://mailbox.example.com/\n' +
  'mail                 https://mail.example.com/\n' +
  '\n' +
  '\\ Other\n' +
  'cal                  https://cal.example.com/\n' +
  'maps                 https://maps.example.com/\n';
/** What 1.x left: the document and the theme. */
const ONE_X = { mappings: DOC, themePref: 'dark' };
const WHATS_NEW = 'whats-new.html';

const searchBox = (popup: Page) => popup.getByRole('combobox');
const names = (popup: Page) => popup.locator('[role=option] .row-name');
const footer = (popup: Page) => popup.locator('footer');
const nameField = (popup: Page) => popup.getByRole('textbox', { name: 'Name' });

/** Storage as 1.x left `stored`, then Chrome's update of the extension from 1.3.0, whose mark has landed. */
async function updateFrom1x(extension: LoadedExtension, stored: Record<string, unknown>) {
  await extension.seedStorage(stored);
  await extension.dispatchEvent('runtime.onInstalled', { reason: 'update', previousVersion: '1.3.0' });
  await expect.poll(() => extension.readStorage()).toEqual({ ...stored, upgradeNotice: 'pending' });
}

/** The open tabs showing the what's-new page. */
async function whatsNewTabs(extension: LoadedExtension) {
  return (await extension.tabUrls()).filter((url) => url === extension.url(WHATS_NEW)).length;
}

/** The open tabs but the extension's own pages, the popup among them. */
async function webPages(extension: LoadedExtension) {
  return (await extension.tabUrls()).filter((url) => !url.startsWith(extension.url('')));
}

test('the first popup after an update from 1.x shows the notice; a typed letter dismisses it for good, lands in the search box, and lists what it lists without the notice', async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const { page, popup } = await popupOnNewPage(extension, site);
  const { notice, open, close } = upgradeNotice(popup);
  await expect(notice).toBeVisible();
  await expect(open).toBeVisible();
  await expect(close).toBeVisible();
  await expect(names(popup)).toHaveText(['mailbox', 'mail', 'cal', 'maps']);
  await expect(searchBox(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter only closes the notice · Down selects a row');
  await checkFitAndAccessibility(popup);

  await popup.keyboard.press('m');
  await expect(notice).toHaveCount(0);
  await expect(searchBox(popup)).toHaveValue('m');
  await expect(names(popup)).toHaveText(['mailbox', 'mail', 'maps', 'cal']);
  await expect(selectedRowName(popup)).toHaveText('mailbox');
  await expect.poll(() => extension.readStorage()).toEqual(ONE_X);
  await popup.close();

  // The next popup has no notice, and lists for the same letter what the first did.
  const next = await extension.clickToolbarButton(page);
  await expectNoNotice(next);
  await expect(footer(next)).toHaveText('Enter does nothing · Down selects a row');
  await next.keyboard.press('m');
  await expect(names(next)).toHaveText(['mailbox', 'mail', 'maps', 'cal']);
  await expect(selectedRowName(next)).toHaveText('mailbox');
  expect(await extension.readStorage()).toEqual(ONE_X);
});

test('Down as the first key dismisses the notice and selects row 1', async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const { popup } = await popupOnNewPage(extension, site);
  await expect(upgradeNotice(popup).notice).toBeVisible();
  await popup.keyboard.press('ArrowDown');
  await expect(upgradeNotice(popup).notice).toHaveCount(0);
  await expect(selectedRowName(popup)).toHaveText('mailbox');
  await expect(footer(popup)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');
  await expect.poll(() => extension.readStorage()).toEqual(ONE_X);
});

test('Escape as the first key closes the popup and dismisses the notice for good', async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const { page, popup } = await popupOnNewPage(extension, site);
  await expect(upgradeNotice(popup).notice).toBeVisible();
  await closingPopup(popup, () => popup.keyboard.press('Escape'));
  await expect.poll(() => extension.readStorage()).toEqual(ONE_X);
  await expectNoNotice(await extension.clickToolbarButton(page));
});

test('Enter on a blank box with the notice shown opens nothing and only dismisses the notice, as the footer says', async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const { popup } = await popupOnNewPage(extension, site);
  await expect(upgradeNotice(popup).notice).toBeVisible();
  await expect(footer(popup)).toHaveText('Enter only closes the notice · Down selects a row');
  const tabs = await extension.tabUrls();
  await popup.keyboard.press('Enter');
  await expect(upgradeNotice(popup).notice).toHaveCount(0);
  await expect(footer(popup)).toHaveText('Enter does nothing · Down selects a row');
  await popup.waitForTimeout(500);
  expect(await extension.tabUrls()).toEqual(tabs);
  expect(await extension.openPopups()).toBe(1);
  // No use was recorded, and the notice is gone for good.
  expect(await extension.readStorage()).toEqual(ONE_X);
});

test('the close control dismisses the notice for good, and the next letter typed lands in the search box', async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const { page, popup } = await popupOnNewPage(extension, site);
  await upgradeNotice(popup).close.click();
  await expect(upgradeNotice(popup).notice).toHaveCount(0);
  await expect(searchBox(popup)).toBeFocused();
  await expect.poll(() => extension.readStorage()).toEqual(ONE_X);
  await popup.keyboard.type('m');
  await expect(searchBox(popup)).toHaveValue('m');
  await expect(names(popup)).toHaveText(['mailbox', 'mail', 'maps', 'cal']);
  await popup.close();
  await expectNoNotice(await extension.clickToolbarButton(page));
});

test("activating the notice by pointer opens the what's-new page in a new tab of the popup's window, closes the popup, and dismisses the notice for good", async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const { page, popup } = await popupOnNewPage(extension, site);
  const opened = extension.context.waitForEvent('page', { predicate: (tab) => tab.url() === extension.url(WHATS_NEW) });
  await closingPopup(popup, () => upgradeNotice(popup).open.click());
  const whatsNew = await opened;
  await expect.poll(() => whatsNewTabs(extension)).toBe(1);
  const tab = await whatsNew.evaluate(() => chrome.tabs.getCurrent());
  expect(tab?.windowId).toBe((await extension.frontTab(page)).windowId);
  await expect.poll(() => extension.readStorage()).toEqual(ONE_X);
  await expectNoNotice(await extension.clickToolbarButton(page));
});

test('Tab and Shift+Tab move the focus to and from the notice without dismissing it, the footer saying what Enter does on each control', async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const { popup } = await popupOnNewPage(extension, site);
  const { notice, open, close } = upgradeNotice(popup);
  await expect(notice).toBeVisible();
  await popup.keyboard.press('Tab');
  await expect(footer(popup)).toHaveText('Enter or Space switches to This tab');
  await popup.keyboard.press('Tab');
  await expect(popup.getByRole('button', { name: 'Name this page' })).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter opens the Name form');
  await popup.keyboard.press('Tab');
  await expect(footer(popup)).toHaveText('Enter opens settings');
  await popup.keyboard.press('Tab');
  await expect(open).toBeFocused();
  await expect(footer(popup)).toHaveText("Enter opens what's new in a new tab");
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter closes the notice');
  await checkFitAndAccessibility(popup);
  for (let i = 0; i < 5; i++) await popup.keyboard.press('Shift+Tab');
  await expect(searchBox(popup)).toBeFocused();
  await expect(notice).toBeVisible();
  await expect(footer(popup)).toHaveText('Enter only closes the notice · Down selects a row');
  expect(await extension.readStorage()).toEqual({ ...ONE_X, upgradeNotice: 'pending' });
});

test("Enter and Space on the notice's control open the what's-new page once and dismiss the notice; on the close control they dismiss it, the focus going to the search box", async ({ extension, site }) => {
  for (const key of ['Enter', 'Space']) {
    await updateFrom1x(extension, ONE_X);
    const { popup } = await popupOnNewPage(extension, site, `Opened with ${JSON.stringify(key)}`);
    const before = await whatsNewTabs(extension);
    for (let i = 0; i < 4; i++) await popup.keyboard.press('Tab');
    await expect(upgradeNotice(popup).open).toBeFocused();
    await closingPopup(popup, () => popup.keyboard.press(key));
    await expect.poll(() => whatsNewTabs(extension), { message: JSON.stringify(key) }).toBe(before + 1);
    await expect.poll(() => extension.readStorage()).toEqual(ONE_X);
  }
  for (const key of ['Enter', 'Space']) {
    await updateFrom1x(extension, ONE_X);
    const { popup } = await popupOnNewPage(extension, site, `Closed with ${JSON.stringify(key)}`);
    const tabs = await extension.tabUrls();
    for (let i = 0; i < 5; i++) await popup.keyboard.press('Tab');
    await expect(upgradeNotice(popup).close).toBeFocused();
    await popup.keyboard.press(key);
    await expect(upgradeNotice(popup).notice).toHaveCount(0);
    await expect(searchBox(popup)).toBeFocused();
    await expect(footer(popup)).toHaveText('Enter does nothing · Down selects a row');
    await expect.poll(() => extension.readStorage()).toEqual(ONE_X);
    await popup.keyboard.type('m');
    await expect(searchBox(popup)).toHaveValue('m');
    expect(await extension.tabUrls()).toEqual(tabs);
    await popup.close();
  }
});

test('a letter typed on the notice dismisses it and lands in the search box', async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const { popup } = await popupOnNewPage(extension, site);
  for (let i = 0; i < 4; i++) await popup.keyboard.press('Tab');
  await expect(upgradeNotice(popup).open).toBeFocused();
  await popup.keyboard.press('m');
  await expect(upgradeNotice(popup).notice).toHaveCount(0);
  await expect(searchBox(popup)).toBeFocused();
  await expect(searchBox(popup)).toHaveValue('m');
  await expect(names(popup)).toHaveText(['mailbox', 'mail', 'maps', 'cal']);
  await expect.poll(() => extension.readStorage()).toEqual(ONE_X);
});

test('with a row selected and no key typed yet, Enter on the notice opens only the what\'s-new page: no mapping, no use', async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const { popup } = await popupOnNewPage(extension, site);
  // Text put in the box without a keystroke, as a paste from the context menu puts it.
  await searchBox(popup).fill('mail');
  await expect(selectedRowName(popup)).toHaveText('mail');
  await expect(upgradeNotice(popup).notice).toBeVisible();
  for (let i = 0; i < 4; i++) await popup.keyboard.press('Tab');
  await expect(upgradeNotice(popup).open).toBeFocused();
  const pages = await webPages(extension);
  await closingPopup(popup, () => popup.keyboard.press('Enter'));
  await expect.poll(() => whatsNewTabs(extension)).toBe(1);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(await whatsNewTabs(extension)).toBe(1);
  expect(await webPages(extension)).toEqual(pages);
  expect(await extension.readStorage()).toEqual(ONE_X);
});

test('a popup closed with no keystroke leaves the notice pending, and the next popup shows it', async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const { page, popup } = await popupOnNewPage(extension, site);
  await expect(upgradeNotice(popup).notice).toBeVisible();
  await popup.close();
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(await extension.readStorage()).toEqual({ ...ONE_X, upgradeNotice: 'pending' });
  const next = await extension.clickToolbarButton(page);
  await expect(upgradeNotice(next).notice).toBeVisible();
});

test('a read made before the dismissal and answered after it does not bring the notice back', async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const { popup } = await popupOnNewPage(extension, site);
  await expect(upgradeNotice(popup).notice).toBeVisible();
  await expect.poll(() => shownTheme(popup)).toBe('dark');
  const reads = await holdPageReads(popup);
  // A change the popup reads: the read holds the notice pending and the light theme.
  await extension.worker.evaluate(() => chrome.storage.local.set({ themePref: 'light' }));
  await expect.poll(() => reads.held()).toBe(1);
  await popup.keyboard.press('m');
  await expect(upgradeNotice(popup).notice).toHaveCount(0);
  await expect.poll(() => extension.readStorage()).toEqual({ ...ONE_X, themePref: 'light' });
  await expect.poll(() => reads.held()).toBe(2);
  // The read made before the removal answers: the theme it holds shows, the notice it holds does not.
  await reads.release();
  await expect.poll(() => shownTheme(popup)).toBe('light');
  await expect(upgradeNotice(popup).notice).toHaveCount(0);
  await reads.release();
  await popup.waitForTimeout(300);
  await expect(upgradeNotice(popup).notice).toHaveCount(0);
  await expect(searchBox(popup)).toHaveValue('m');
});

test('an empty document shows the notice in the first run, Name this page selected; Enter opens the Name form, without the notice', async ({ extension, site }) => {
  await updateFrom1x(extension, {});
  const { popup } = await popupOnNewPage(extension, site);
  await expect(popup.getByRole('heading', { name: 'No mappings yet' })).toBeVisible();
  await expect(upgradeNotice(popup).notice).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Name this page' })).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter opens the Name form');
  await checkFitAndAccessibility(popup);
  // Shift+Tab reaches the notice from where the first run starts, and Tab comes back.
  await popup.keyboard.press('Shift+Tab');
  await expect(upgradeNotice(popup).close).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter closes the notice');
  await popup.keyboard.press('Tab');
  await expect(popup.getByRole('button', { name: 'Name this page' })).toBeFocused();

  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('heading', { name: 'Name this page' })).toBeVisible();
  await expect(nameField(popup)).toBeFocused();
  await expect(upgradeNotice(popup).notice).toHaveCount(0);
  await expect.poll(() => extension.readStorage()).toEqual({});
});

test('the Name form a command opens shows the notice; the first letter of the name dismisses it and is typed in the name', async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Stock prices'));
  const popup = await extension.popupByCommand('name-this-page', page);
  await expect(popup.getByRole('heading', { name: 'Name this page' })).toBeVisible();
  await expect(upgradeNotice(popup).notice).toBeVisible();
  await expect(nameField(popup)).toBeFocused();
  await expect(popup.getByRole('listbox', { name: 'Section' })).toBeVisible();
  // Save is blocked without a name: Enter only dismisses the notice.
  await expect(footer(popup)).toHaveText(/^Enter only closes the notice · Line \d+ needs a name\.$/);
  await checkFitAndAccessibility(popup);
  for (const control of ['close', 'open'] as const) {
    await popup.keyboard.press('Shift+Tab');
    if (await popup.locator('.view:focus').count()) await popup.keyboard.press('Shift+Tab');
    await expect(upgradeNotice(popup)[control]).toBeFocused();
    await checkFitAndAccessibility(popup);
  }
  await nameField(popup).focus();

  await popup.keyboard.type('stocks');
  await expect(nameField(popup)).toHaveValue('stocks');
  await expect(upgradeNotice(popup).notice).toHaveCount(0);
  // Chrome granted no address for the tab, so the URL is still to be typed.
  await expect(footer(popup)).toHaveText(/^Enter does nothing · Line \d+ needs a URL\.$/);
  await expect.poll(() => extension.readStorage()).toEqual(ONE_X);
});

test('settings show no notice, and back in search the notice shows again, still pending; a keystroke in settings dismisses it all the same', async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const { page, popup } = await popupOnNewPage(extension, site);
  await expect(upgradeNotice(popup).notice).toBeVisible();
  await popup.getByRole('button', { name: 'Settings' }).click();
  await expect(popup.getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(upgradeNotice(popup).notice).toHaveCount(0);
  // Tab moves the focus in settings, and dismisses nothing.
  await popup.keyboard.press('Tab');
  await popup.getByRole('button', { name: 'Back' }).click();
  await expect(upgradeNotice(popup).notice).toBeVisible();
  expect(await extension.readStorage()).toEqual({ ...ONE_X, upgradeNotice: 'pending' });

  // Escape in settings closes the popup and dismisses the notice it showed.
  await popup.getByRole('button', { name: 'Settings' }).click();
  await expect(popup.getByRole('button', { name: 'Back' })).toBeVisible();
  await closingPopup(popup, () => popup.keyboard.press('Escape'));
  await expect.poll(() => extension.readStorage()).toEqual(ONE_X);
  const next = await extension.clickToolbarButton(page);
  await expectNoNotice(next);

  // A key that does its work in settings dismisses it too, and Back shows search without it.
  await next.close();
  await updateFrom1x(extension, ONE_X);
  const third = await extension.clickToolbarButton(page);
  await expect(upgradeNotice(third).notice).toBeVisible();
  await third.getByRole('button', { name: 'Settings' }).click();
  await expect(third.getByRole('listbox', { name: 'Search order' })).toBeFocused();
  await third.keyboard.press('ArrowDown');
  await expect(third.getByRole('listbox', { name: 'Search order' }).getByRole('option', { selected: true })).toHaveText('Smart order');
  await expect.poll(() => extension.readStorage()).toEqual({ ...ONE_X, searchOrder: 'smart' });
  await third.getByRole('button', { name: 'Back' }).click();
  await expectNoNotice(third);
});

test('no notice shows after a new install or after an update from 2.x', async ({ extension, site }) => {
  // The fixture's launch is a new install.
  await extension.seedStorage({ ...(await extension.readStorage()), mappings: DOC });
  const { page, popup } = await popupOnNewPage(extension, site);
  await expectNoNotice(popup);
  await popup.close();

  await extension.seedStorage({ mappings: DOC });
  for (const previousVersion of ['2.0.0', '2.1']) {
    await extension.dispatchEvent('runtime.onInstalled', { reason: 'update', previousVersion });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await extension.readStorage()).toEqual({ mappings: DOC });
    const next = await extension.clickToolbarButton(page);
    await expectNoNotice(next);
    await next.close();
  }
});

test("the what's-new page names URLJumper and the five changes, follows the stored theme live, and passes the accessibility pass in both schemes", async ({ extension, site }) => {
  await updateFrom1x(extension, ONE_X);
  const { popup } = await popupOnNewPage(extension, site);
  const opened = extension.context.waitForEvent('page', { predicate: (tab) => tab.url() === extension.url(WHATS_NEW) });
  await closingPopup(popup, () => upgradeNotice(popup).open.click());
  const page = await opened;

  await expect(page).toHaveTitle("What's new in URLJumper 2.0");
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("What's new in URLJumper 2.0");
  const items = page.getByRole('listitem');
  await expect(items).toHaveCount(5);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'A name typed in full comes first',
    'Search through a name with %s',
    'Name this page',
    'The keyword j in the address bar',
    'Smart order',
  ]);
  await expect(items.nth(0)).toContainText('an earlier line');
  await expect(items.nth(1)).toContainText('the text you type after its name goes there');
  await expect(items.nth(2)).toContainText('suggested as Alt+Shift+N');
  await expect(items.nth(2)).toContainText('Name this page in URLJumper');
  await expect(items.nth(2)).toContainText('Name this link in URLJumper');
  await expect(items.nth(2)).toContainText('its last row');
  await expect(items.nth(3)).toContainText('type j, a space, and a name');
  await expect(items.nth(4)).toContainText('It is off for you');
  await expect(items.nth(4)).toContainText('Preferences');
  expect(await page.locator('body').textContent()).not.toMatch(/URL Jumper/);
  // Nothing on the page leads anywhere: it loads nothing and links nowhere.
  await expect(page.locator('a, img, iframe, link[href^="http"], script[src^="http"]')).toHaveCount(0);

  await expect.poll(() => shownTheme(page)).toBe('dark');
  await extension.worker.evaluate(() => chrome.storage.local.set({ themePref: 'light' }));
  await expect.poll(() => shownTheme(page)).toBe('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await shownTheme(page)).toBe('light');
  await extension.worker.evaluate(() => chrome.storage.local.remove('themePref'));
  await expect.poll(() => shownTheme(page)).toBe('dark');
  await checkAccessibilityInBothSchemes(page);
});
