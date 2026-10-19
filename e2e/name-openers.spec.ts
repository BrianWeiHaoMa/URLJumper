// The Name form opened from outside the popup (In use, "Name this page", "Name a link"): `name-this-page`
// (F5) and the two right-click menu items (F7, G29) open the popup on the form through the worker's record,
// for the page or for a link with the page it was on (G11), the chip at New tab (G5), with the keys typed from
// the moment the popup has the keyboard in its name field; the menu items exist after an install, an update,
// and every start (S13), after the install's storage write (G24, R5).
import type { Page } from '@playwright/test';
import {
  checkFitAndAccessibility,
  closingPopup,
  createMenuItemAgain,
  expect,
  menuItemExists,
  recordWorkerCalls,
  removeMenuItems,
  selectedRowName,
  slowWorkerReads,
  test,
  type LoadedExtension,
  type LocalSite,
} from './extension.ts';

const footer = (popup: Page) => popup.locator('footer');
const nameField = (popup: Page) => popup.getByRole('textbox', { name: 'Name' });
const urlField = (popup: Page) => popup.getByRole('textbox', { name: 'URL' });
const windowOf = (popup: Page) => popup.evaluate(async () => (await chrome.windows.getCurrent()).id);

// What a click on each menu item passes the worker, but the tab.
const PAGE_CLICK = { menuItemId: 'name-this-page', editable: false, frameId: 0 };
const linkClick = (linkUrl: string, pageUrl: string) => ({ menuItemId: 'name-this-link', linkUrl, pageUrl, editable: false, frameId: 0 });

// A heading, aligned columns, a note, and whitespace after the last line that holds more.
const DOCUMENT = '\\ Daily\n' + 'mail                 https://mail.example.com/\n' + 'news                 https://news.example.com/    \\ a note\n' + '\n' + '  \n';

/** A page of the local site the toolbar button was clicked on, so it has Chrome's grant, its popup closed again. */
async function grantedPage(extension: LoadedExtension, site: LocalSite, title: string) {
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl(title));
  await (await extension.clickToolbarButton(page)).close();
  await expect.poll(() => extension.openPopups()).toBe(0);
  return page;
}

// The open tabs but the extension's own pages.
async function pageTabs(extension: LoadedExtension) {
  return (await extension.tabUrls()).filter((url) => !url.startsWith(extension.url('')));
}

// How many open tabs are at `url`.
async function tabsAt(extension: LoadedExtension, url: string) {
  return (await extension.tabUrls()).filter((tabUrl) => tabUrl === url).length;
}

test('name-this-page on a granted page opens the form for it with the keys typed at once; Enter saves one line after the last that holds more than whitespace, and the name then opens the page', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOCUMENT });
  const page = await grantedPage(extension, site, 'Stock prices');
  const popup = await extension.popupByCommand('name-this-page', page);
  await popup.keyboard.type('stocks');

  await expect(nameField(popup)).toHaveValue('stocks');
  await expect(nameField(popup)).toBeFocused();
  await expect(popup.getByRole('combobox')).toHaveCount(0);
  await expect(urlField(popup)).toHaveValue(page.url());
  await expect(popup.getByRole('heading', { name: 'Name this page' })).toBeVisible();
  await expect(popup.locator('.subject-title')).toHaveText('Stock prices');
  await expect(popup.locator('.subject-host')).toHaveText(new URL(page.url()).host);
  expect('openIntent' in (await extension.readStorage())).toBe(false);
  await expect(footer(popup)).toHaveText('Enter saves it as line 4');

  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('status')).toHaveText('Saved "stocks" as line 4');
  await expect(popup.locator('.confirmation').getByRole('button', { name: 'Undo saving "stocks"' })).toBeVisible();
  await expect(popup.locator('.chip')).toHaveText('New tab');
  expect((await extension.readStorage()).mappings).toBe(DOCUMENT.replace('\\ a note\n', `\\ a note\nstocks${' '.repeat(15)}${page.url()}\n`));
  await popup.close();

  const before = await tabsAt(extension, page.url());
  const next = await extension.clickToolbarButton(page);
  await next.keyboard.type('stocks');
  await expect(selectedRowName(next)).toHaveText('stocks');
  await expect(footer(next)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');
  await closingPopup(next, () => next.keyboard.press('Enter'));
  await expect.poll(() => tabsAt(extension, page.url())).toBe(before + 1);
});

test('Undo of the save name-this-page opened leaves the document byte for byte as before', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOCUMENT });
  const page = await grantedPage(extension, site, 'To be named and taken back');
  const popup = await extension.popupByCommand('name-this-page', page);
  await popup.keyboard.type('stocks');
  await expect(nameField(popup)).toHaveValue('stocks');
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('status')).toHaveText('Saved "stocks" as line 4');
  await popup.locator('.confirmation').getByRole('button', { name: 'Undo saving "stocks"' }).click();
  await expect(popup.getByRole('status')).toHaveText('Removed "stocks" from line 4');
  expect((await extension.readStorage()).mappings).toBe(DOCUMENT);
});

test('keys typed before the popup knows it opened for naming go to the name field, and an Enter among them opens nothing', async ({ extension, site }) => {
  // The popup learns why it opened only once the worker has removed the record, here a second late.
  await slowWorkerReads(extension.worker, 'openIntent', 1_000);
  for (const mappings of ['st  https://st.example/\n', '']) {
    await extension.seedStorage({ mappings });
    const page = await grantedPage(extension, site, `Typed into at once, ${mappings === '' ? 'empty' : 'with st'}`);
    const tabs = await pageTabs(extension);
    const popup = await extension.popupByCommand('name-this-page', page);
    await popup.keyboard.type('st');
    await popup.keyboard.press('Enter');
    await popup.keyboard.type('ocks');
    // Typed while the popup did not know yet: they went to its search box, and the Enter did nothing.
    await expect(popup.getByRole('combobox')).toHaveValue('stocks');
    await expect(nameField(popup)).toHaveValue('stocks');
    await expect(nameField(popup)).toBeFocused();
    await expect(popup.getByRole('combobox')).toHaveCount(0);
    expect(await pageTabs(extension)).toEqual(tabs);
    expect((await extension.readStorage()).mappings).toBe(mappings);
    await popup.close();
    await expect.poll(() => extension.openPopups()).toBe(0);
  }
});

test('until the popup knows why it opened, it lists the mappings, says Enter does nothing, fits, and passes the accessibility pass', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'st  https://st.example/\n' });
  // The popup knows only once the worker has removed the record, which reads it first; held there, for the rest of the check.
  await slowWorkerReads(extension.worker, 'openIntent', 60_000);
  const page = await grantedPage(extension, site, 'Not known yet');
  const popup = await extension.popupByCommand('name-this-page', page);
  await expect(footer(popup)).toHaveText('Enter does nothing until the popup is ready');
  await expect(popup.locator('[role=option] .row-name')).toHaveText(['st']);
  await checkFitAndAccessibility(popup);
  await expect(footer(popup)).toHaveText('Enter does nothing until the popup is ready');
});

test('name-this-page on a page Chrome granted nothing opens the form without an address; Cancel shows the first run of an empty document', async ({ extension, site }) => {
  await extension.seedStorage({});
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Never clicked'));
  const popup = await extension.popupByCommand('name-this-page', page);
  await expect(nameField(popup)).toBeFocused();
  await expect(popup.locator('.subject-missing')).toHaveText('Chrome gave no address for this tab: type or paste the URL.');
  await expect(popup.locator('.subject-title, .subject-host')).toHaveCount(0);
  await expect(urlField(popup)).toHaveValue('');
  await expect(footer(popup)).toHaveText(/^Enter does nothing · /);
  await checkFitAndAccessibility(popup);

  await popup.getByRole('button', { name: 'Cancel' }).click();
  await expect(popup.getByRole('heading', { name: 'No mappings yet' })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Name this page' })).toBeFocused();
});

test('Name this page in URLJumper opens the form for the page; Name this link opens it for the link, naming the page it is on, and saves the link', async ({ extension, site }) => {
  const page = await grantedPage(extension, site, 'Where the link is');
  await extension.seedStorage({ mappings: `home  ${page.url()}\n` });
  const tab = await extension.frontTab(page);
  const changes = await extension.watchStorage();

  const pagePopup = await extension.popupOpenedBy(() => extension.dispatchEvent('contextMenus.onClicked', { ...PAGE_CLICK, pageUrl: page.url() }, tab));
  expect(await windowOf(pagePopup)).toBe(tab.windowId);
  await expect(pagePopup.getByRole('heading', { name: 'Name this page' })).toBeVisible();
  await expect(nameField(pagePopup)).toBeFocused();
  await expect(urlField(pagePopup)).toHaveValue(page.url());
  await expect(pagePopup.locator('.subject-title')).toHaveText('Where the link is');
  await expect(pagePopup.locator('.this-page')).toHaveText('This page is "home"');
  const [written] = await changes();
  expect(written).toEqual({ openIntent: { newValue: { kind: 'name-page', windowId: tab.windowId, time: expect.any(Number) } } });
  expect('openIntent' in (await extension.readStorage())).toBe(false);
  await pagePopup.close();
  await expect.poll(() => extension.openPopups()).toBe(0);

  const link = 'https://link.example/article?id=7';
  const seen = (await changes()).length;
  const linkPopup = await extension.popupOpenedBy(() => extension.dispatchEvent('contextMenus.onClicked', linkClick(link, page.url()), tab));
  await expect(linkPopup.getByRole('heading', { name: 'Name this link' })).toBeVisible();
  await expect(nameField(linkPopup)).toBeFocused();
  await expect(nameField(linkPopup)).toHaveValue('');
  await expect(urlField(linkPopup)).toHaveValue(link);
  await expect(linkPopup.locator('.subject-page')).toHaveText('A link on the page "Where the link is"');
  await expect(linkPopup.locator('.this-page')).toHaveText('This page is "home"');
  expect((await changes())[seen]).toEqual({
    openIntent: { newValue: { kind: 'name-link', windowId: tab.windowId, time: expect.any(Number), linkUrl: link, pageUrl: page.url(), pageTitle: 'Where the link is' } },
  });
  await checkFitAndAccessibility(linkPopup);

  await linkPopup.keyboard.type('article');
  await linkPopup.keyboard.press('Enter');
  await expect(linkPopup.getByRole('status')).toHaveText('Saved "article" as line 2');
  await expect(linkPopup.locator('.chip')).toHaveText('New tab');
  // The URL column of the line above is 7, which "article" fills: one space separates them (F12).
  expect((await extension.readStorage()).mappings).toBe(`home  ${page.url()}\narticle ${link}\n`);
});

test('a link click Chrome passes without a tab, or without its title, opens in the focused window and names the page by its address', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  const page = await grantedPage(extension, site, 'Focused page');
  const tab = await extension.frontTab(page);
  const link = 'https://link.example/elsewhere';
  for (const passed of [undefined, { ...tab, title: undefined }]) {
    const popup = await extension.popupOpenedBy(() =>
      passed === undefined
        ? extension.dispatchEvent('contextMenus.onClicked', linkClick(link, page.url()))
        : extension.dispatchEvent('contextMenus.onClicked', linkClick(link, page.url()), passed),
    );
    expect(await windowOf(popup)).toBe(tab.windowId);
    await expect(urlField(popup)).toHaveValue(link);
    await expect(popup.locator('.subject-page')).toHaveText(`A link on ${page.url()}`);
    await popup.close();
    await expect.poll(() => extension.openPopups()).toBe(0);
  }
});

test('a menu click in a window without a toolbar removes its record and opens nothing', async ({ extension, site }) => {
  const opened = extension.context.waitForEvent('page');
  await extension.worker.evaluate((url) => chrome.windows.create({ url, type: 'popup', focused: true }), site.pageUrl('No toolbar'));
  const page = await opened;
  const tab = await extension.frontTab(page);
  for (const click of [{ ...PAGE_CLICK, pageUrl: page.url() }, linkClick('https://link.example/', page.url())]) {
    const changes = await extension.watchStorage();
    await extension.dispatchEvent('contextMenus.onClicked', click, tab);
    await expect.poll(async () => (await changes()).length).toBe(2);
    const [written, removed] = await changes();
    expect(written!.openIntent!.newValue).toMatchObject({ windowId: tab.windowId });
    expect(removed).toEqual({ openIntent: { oldValue: written!.openIntent!.newValue } });
    expect(await extension.openPopups()).toBe(0);
  }
});

test('the menu items are made again on every start, install, and update, after the install writes its storage, and only once each', async ({ extension }) => {
  const ids = ['name-this-page', 'name-this-link'];
  const exist = () => Promise.all(ids.map((id) => menuItemExists(extension.worker, id)));
  const MADE = [
    ['contextMenus.removeAll', null],
    ['contextMenus.create', { id: 'name-this-page', title: 'Name this page in URLJumper', contexts: ['page'] }],
    ['contextMenus.create', { id: 'name-this-link', title: 'Name this link in URLJumper', contexts: ['link'] }],
  ];
  // The launch's install made them.
  expect(await exist()).toEqual([true, true]);
  const calls = await recordWorkerCalls(extension.worker);

  for (const [event, details, first] of [
    ['runtime.onStartup', undefined, []],
    ['runtime.onInstalled', { reason: 'install' }, [['storage.set', { searchOrder: 'smart' }]]],
    ['runtime.onInstalled', { reason: 'update', previousVersion: '1.3.0' }, [['storage.set', { upgradeNotice: 'pending' }]]],
  ] as const) {
    await removeMenuItems(extension.worker);
    expect(await exist(), `removed before ${event}`).toEqual([false, false]);
    const seen = (await calls()).length;
    await (details === undefined ? extension.dispatchEvent(event) : extension.dispatchEvent(event, details));
    await expect.poll(exist, { message: `made on ${event}` }).toEqual([true, true]);
    expect((await calls()).slice(seen)).toEqual([...first, ...MADE]);
    for (const id of ids) expect(await createMenuItemAgain(extension.worker, id)).toBe(`Cannot create item with duplicate id ${id}`);
  }
  expect(await extension.readStorage()).toEqual({ searchOrder: 'smart', upgradeNotice: 'pending' });
});

test('a long page title and link address wrap in the link form: nothing of its own is cut and the footer stays in view', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  const title = `A page with a long title ${'w'.repeat(300)}`;
  const page = await grantedPage(extension, site, title);
  const link = `https://link.example/${'x'.repeat(400)}`;
  const tab = await extension.frontTab(page);
  const popup = await extension.popupOpenedBy(() => extension.dispatchEvent('contextMenus.onClicked', linkClick(link, page.url()), tab));
  await expect(popup.locator('.subject-page')).toContainText('A link on the page "A page with a long title www');
  await expect(urlField(popup)).toHaveValue(link);
  const fits = await popup.evaluate(() => ({
    footerInView: document.querySelector('footer')!.getBoundingClientRect().bottom <= innerHeight,
    noPageOverflow: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
    uncut: [...document.querySelectorAll<HTMLElement>('.form-title, .subject p, .preview-where, .preview-line, footer')].every((element) => element.scrollWidth <= element.clientWidth),
  }));
  expect(fits).toEqual({ footerInView: true, noPageOverflow: true, uncut: true });
});
