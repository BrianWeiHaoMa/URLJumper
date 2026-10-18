// Opening a mapping from the popup (G4, G5, G6, G26, R4): Enter and a click open in the chip's mode and
// Shift in the other, the chip starts as the popup's opening asked, and when nothing opens the popup stays
// and says why.
import type { Page } from '@playwright/test';
import { checkAccessibilityInBothSchemes, expect, popupOnNewPage, shownTheme, test, type LoadedExtension } from './extension.ts';

const chip = (popup: Page) => popup.locator('.chip');
const footer = (popup: Page) => popup.locator('footer');
const names = (popup: Page) => popup.locator('[role=option] .row-name').allTextContents();

// The tabs opened since `before`, not counting the extension's own pages.
const tabsSince = (extension: LoadedExtension, before: ReadonlySet<Page>) =>
  extension.context.pages().filter((page) => !before.has(page) && !page.url().startsWith(extension.url('')));

// Presses `key` in the popup and waits for the popup to close, as it does once the jump opened.
async function jumpWith(popup: Page, key: string) {
  const closed = popup.waitForEvent('close');
  await popup.keyboard.press(key);
  await closed;
}

test('whichever way the popup opens, typing goes straight into its search box', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Typing'));
  for (const open of [
    () => extension.clickToolbarButton(page),
    () => extension.popupByCommand('open-new-tab', page),
    () => extension.popupByCommand('open-same-tab', page),
  ]) {
    const popup = await open();
    await expect(popup.getByRole('combobox')).toBeFocused();
    await popup.keyboard.type('mai');
    await expect(popup.getByRole('combobox')).toHaveValue('mai');
    await popup.close();
    await expect.poll(() => extension.openPopups()).toBe(0);
  }
});

test('from the toolbar the chip reads New tab: Enter and a click open a new tab, Shift+Enter and Shift+click the page', async ({ extension, site }) => {
  const target = site.pageUrl('Target');
  await extension.seedStorage({ mappings: `go                   ${target}\n` });

  let { page, popup } = await popupOnNewPage(extension, site, 'Opener for Enter');
  await expect(chip(popup)).toHaveText('New tab');
  await popup.keyboard.type('go');
  let before = new Set(extension.context.pages());
  await jumpWith(popup, 'Enter');
  await expect.poll(() => tabsSince(extension, before).map((tab) => tab.url())).toEqual([target]);
  expect(await tabsSince(extension, before)[0]!.evaluate(() => document.visibilityState)).toBe('visible');
  expect(page.url()).not.toBe(target);
  expect(Object.keys((await extension.readStorage()).usage as object)).toEqual([`go\n${target}`]);

  extension.expectExtensionRequest(target);
  ({ page, popup } = await popupOnNewPage(extension, site, 'Opener for Shift+Enter'));
  await popup.keyboard.type('go');
  before = new Set(extension.context.pages());
  await jumpWith(popup, 'Shift+Enter');
  await expect(page).toHaveURL(target);
  expect(tabsSince(extension, before)).toEqual([]);

  ({ page, popup } = await popupOnNewPage(extension, site, 'Opener for a click'));
  await popup.keyboard.type('go');
  before = new Set(extension.context.pages());
  let closed = popup.waitForEvent('close');
  await popup.getByRole('option').click();
  await closed;
  await expect.poll(() => tabsSince(extension, before).map((tab) => tab.url())).toEqual([target]);
  expect(page.url()).not.toBe(target);

  ({ page, popup } = await popupOnNewPage(extension, site, 'Opener for Shift+click'));
  await popup.keyboard.type('go');
  before = new Set(extension.context.pages());
  closed = popup.waitForEvent('close');
  await popup.getByRole('option').click({ modifiers: ['Shift'] });
  await closed;
  await expect(page).toHaveURL(target);
  expect(tabsSince(extension, before)).toEqual([]);
  expect(((await extension.readStorage()).usage as Record<string, number[]>)[`go\n${target}`]).toHaveLength(4);
});

test('opened by open-same-tab the chip reads This tab and the record is removed; Enter opens in the page, Shift+Enter in a new tab', async ({ extension, site }) => {
  const target = site.pageUrl('Target');
  await extension.seedStorage({ mappings: `go                   ${target}\n` });
  extension.expectExtensionRequest(target);

  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Alt+M here'));
  let popup = await extension.popupByCommand('open-same-tab', page);
  await expect(chip(popup)).toHaveText('This tab');
  await expect.poll(async () => 'openIntent' in (await extension.readStorage())).toBe(false);
  await popup.keyboard.type('go');
  await expect(footer(popup)).toHaveText('Enter opens it in this tab · Shift+Enter in a new tab');
  await checkAccessibilityInBothSchemes(popup);
  let before = new Set(extension.context.pages());
  await jumpWith(popup, 'Enter');
  await expect(page).toHaveURL(target);
  expect(tabsSince(extension, before)).toEqual([]);

  const second = await extension.context.newPage();
  const secondUrl = site.pageUrl('Alt+M, then Shift+Enter');
  await second.goto(secondUrl);
  popup = await extension.popupByCommand('open-same-tab', second);
  await popup.keyboard.type('go');
  before = new Set(extension.context.pages());
  await jumpWith(popup, 'Shift+Enter');
  await expect.poll(() => tabsSince(extension, before).map((tab) => tab.url())).toEqual([target]);
  expect(second.url()).toBe(secondUrl);
});

test('opened by open-new-tab the chip reads New tab; a chip click flips it for that popup only', async ({ extension, site }) => {
  const target = site.pageUrl('Target');
  await extension.seedStorage({ mappings: `go                   ${target}\n` });
  const page = await extension.context.newPage();
  const pageUrl = site.pageUrl('Alt+N here');
  await page.goto(pageUrl);

  let popup = await extension.popupByCommand('open-new-tab', page);
  await expect(chip(popup)).toHaveText('New tab');
  await popup.keyboard.type('go');
  let before = new Set(extension.context.pages());
  await jumpWith(popup, 'Enter');
  await expect.poll(() => tabsSince(extension, before).map((tab) => tab.url())).toEqual([target]);

  // Alt+M, then a click on the chip: New tab, and the typing stays in the search box.
  popup = await extension.popupByCommand('open-same-tab', page);
  await expect(chip(popup)).toHaveText('This tab');
  await chip(popup).click();
  await expect(chip(popup)).toHaveText('New tab');
  await expect(popup.getByRole('combobox')).toBeFocused();
  await popup.keyboard.type('go');
  await expect(footer(popup)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');
  before = new Set(extension.context.pages());
  await jumpWith(popup, 'Enter');
  await expect.poll(() => tabsSince(extension, before).map((tab) => tab.url())).toEqual([target]);
  expect(page.url()).toBe(pageUrl);

  // The next popup starts in its own opening's mode again.
  popup = await extension.popupByCommand('open-same-tab', page);
  await expect(chip(popup)).toHaveText('This tab');
});

test('a record for another window, or one written over ten seconds ago, is not honored, and one for another window stays', async ({ extension, site }) => {
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Toolbar'));
  const { windowId } = await extension.frontTab(page);
  const elsewhere = { kind: 'this-tab', windowId: windowId! + 1, time: Date.now() };
  await extension.seedStorage({ mappings: 'go  https://go.example/\n', openIntent: elsewhere });
  let popup = await extension.clickToolbarButton(page);
  await popup.keyboard.type('go');
  await expect(footer(popup)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');
  await expect(chip(popup)).toHaveText('New tab');
  expect((await extension.readStorage()).openIntent).toEqual(elsewhere);
  await popup.close();

  await extension.seedStorage({ mappings: 'go  https://go.example/\n', openIntent: { kind: 'this-tab', windowId, time: Date.now() - 11_000 } });
  popup = await extension.clickToolbarButton(page);
  await popup.keyboard.type('go');
  await expect(footer(popup)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');
  await expect(chip(popup)).toHaveText('New tab');
});

for (const order of ['document', 'smart'] as const) {
  test(`under ${order} order a navigation Chrome refuses keeps the popup open with Chrome's message, also after the use redraws the list`, async ({ extension, site }) => {
    const cat = site.pageUrl('Cat');
    await extension.seedStorage({ mappings: `cat  ${cat}\ncrash  chrome://crash/\n`, ...(order === 'smart' ? { searchOrder: 'smart' } : {}) });
    const { popup } = await popupOnNewPage(extension, site);
    await popup.keyboard.type('c');
    await expect.poll(() => names(popup)).toEqual(['cat', 'crash']);
    await popup.keyboard.press('ArrowDown');
    const tabs = await extension.tabUrls();
    await popup.keyboard.press('Enter');
    const message = popup.getByRole('alert');
    await expect(message).toHaveText("Not opened. Chrome said: I'm sorry. I'm afraid I can't do that.");
    // The use was recorded before Chrome refused; under Smart order it moves crash first, a new list.
    await expect.poll(async () => ((await extension.readStorage()).usage as Record<string, number[]> | undefined)?.['crash\nchrome://crash/']?.length).toBe(1);
    await expect.poll(() => names(popup)).toEqual(order === 'smart' ? ['crash', 'cat'] : ['cat', 'crash']);
    await expect(message).toHaveText("Not opened. Chrome said: I'm sorry. I'm afraid I can't do that.");
    await expect(popup.getByRole('combobox')).toHaveValue('c');
    // A later change of storage redraws the list again, and the message stays.
    const stored = await extension.readStorage();
    await extension.seedStorage({ ...stored, mappings: `${stored.mappings}dog  ${site.pageUrl('Dog')}\n` });
    await expect.poll(() => names(popup)).toEqual(order === 'smart' ? ['crash', 'cat'] : ['cat', 'crash']);
    await expect(popup.getByRole('option')).toHaveCount(2);
    await popup.waitForTimeout(300);
    await expect(message).toHaveText("Not opened. Chrome said: I'm sorry. I'm afraid I can't do that.");
    expect(await extension.tabUrls()).toEqual(tabs);
    expect(await extension.openPopups()).toBe(1);
    await checkAccessibilityInBothSchemes(popup);

    // Typing again clears the message.
    await popup.keyboard.type('a');
    await expect(message).toHaveCount(0);
  });
}

test('a long refusal never hides the selected row, and Enter opens the selected row wherever the focus is', async ({ extension, site }) => {
  const urls = Array.from({ length: 6 }, (_, i) => site.pageUrl(`Mapping ${i + 1}`));
  const broken = `http://[${'w'.repeat(1800)}`;
  await extension.seedStorage({ mappings: `${urls.map((url, i) => `m${i + 1}  ${url}\n`).join('')}m7  ${broken}\n` });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('m');
  for (let i = 0; i < 6; i++) await popup.keyboard.press('ArrowDown');
  await expect(popup.locator('[role=option][aria-selected=true] .row-name')).toHaveText('m7');
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('alert')).toContainText('Not opened. Chrome said: ');
  const selectedInView = () =>
    popup.evaluate(() => {
      const view = document.querySelector('.view')!.getBoundingClientRect();
      const row = document.querySelector('[role=option][aria-selected=true]')!.getBoundingClientRect();
      return row.top >= view.top - 0.5 && row.bottom <= view.bottom + 0.5;
    });
  expect(await selectedInView()).toBe(true);
  await checkAccessibilityInBothSchemes(popup);

  // Tab past the chip reaches the view, which Chrome lets take focus to scroll; Enter there still opens.
  await popup.keyboard.press('ArrowUp');
  expect(await selectedInView()).toBe(true);
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  expect(await popup.evaluate(() => document.activeElement?.className)).toBe('view');
  await expect(footer(popup)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');
  let before = new Set(extension.context.pages());
  await jumpWith(popup, 'Enter');
  await expect.poll(() => tabsSince(extension, before).map((tab) => tab.url())).toEqual([urls[5]]);

  // A click on text leaves nothing focused; the footer still says what Enter does, and Enter does it.
  const again = await popupOnNewPage(extension, site, 'Clicked away');
  await again.popup.keyboard.type('m2');
  await again.popup.locator('footer').click();
  expect(await again.popup.evaluate(() => document.activeElement === document.body)).toBe(true);
  await expect(footer(again.popup)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');
  before = new Set(extension.context.pages());
  await jumpWith(again.popup, 'Enter');
  await expect.poll(() => tabsSince(extension, before).map((tab) => tab.url())).toEqual([urls[1]]);
});

test('a jump whose use Chrome refuses to store keeps the popup open, says why, and opens nothing', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: `full  ${site.pageUrl('Never opened')}\n` });
  await extension.fillStorage(16);
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('full');
  await expect(footer(popup)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');
  const tabs = await extension.tabUrls();
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('alert')).toHaveText(
    'Not opened, because URLJumper could not save this use of it. Chrome said: Resource::kQuotaBytes quota exceeded',
  );
  await expect(popup.getByRole('combobox')).toHaveValue('full');
  expect(await extension.tabUrls()).toEqual(tabs);
  expect('usage' in (await extension.readStorage())).toBe(false);
});

test('yt with text opens the filled address, and yt alone the address with %s removed', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'yt                   https://www.youtube.com/results?search_query=%s\n' });
  for (const [typed, opened] of [
    ['yt lo-fi beats', 'https://www.youtube.com/results?search_query=lo-fi%20beats'],
    ['yt', 'https://www.youtube.com/results?search_query='],
    ['  yt   lo-fi beats  ', 'https://www.youtube.com/results?search_query=lo-fi%20beats'],
  ] as const) {
    const { popup } = await popupOnNewPage(extension, site, `Before ${typed}`);
    await popup.keyboard.type(typed);
    await expect(popup.getByRole('option')).toHaveCount(1);
    const tabsAt = async (url: string) => (await extension.tabUrls()).filter((tab) => tab === url).length;
    const before = await tabsAt(opened);
    await jumpWith(popup, 'Enter');
    await expect.poll(() => tabsAt(opened), typed).toBe(before + 1);
  }
  // Each was a use of the alias, under its URL as written.
  expect(((await extension.readStorage()).usage as Record<string, number[]>)['yt\nhttps://www.youtube.com/results?search_query=%s']).toHaveLength(3);
});

test('after a new install the popup is in Smart order: a mapping just jumped to comes first in the blank list', async ({ extension, site }) => {
  expect(await extension.readStorage()).toEqual({ searchOrder: 'smart' });
  const lines = Array.from({ length: 20 }, (_, i) => `m${i + 1}  https://m${i + 1}.example/\n`).join('');
  await extension.seedStorage({ searchOrder: 'smart', mappings: lines });
  let { page, popup } = await popupOnNewPage(extension, site);
  await popup.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => shownTheme(popup)).toBe('dark');
  await popup.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => shownTheme(popup)).toBe('light');
  await expect.poll(() => names(popup)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']);
  await popup.keyboard.type('m18');
  await jumpWith(popup, 'Enter');
  await expect.poll(() => extension.tabUrls()).toContain('https://m18.example/');

  popup = await extension.clickToolbarButton(page);
  await expect.poll(() => names(popup)).toEqual(['m18', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  await expect(popup.locator('[role=option][aria-selected=true]')).toHaveCount(0);
});

test('nothing opens without Enter or a click, and Escape closes the popup', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: `go  ${site.pageUrl('Never opened')}\n` });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('go');
  const tabs = await extension.tabUrls();
  await popup.getByRole('option').hover();
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Shift+Tab');
  await extension.seedStorage({ mappings: `go  ${site.pageUrl('Still never opened')}\n` });
  await popup.waitForTimeout(500);
  expect(await extension.tabUrls()).toEqual(tabs);
  expect('usage' in (await extension.readStorage())).toBe(false);

  // The popup closes on the key going down, before a key up could be sent.
  const closed = popup.waitForEvent('close');
  await popup.keyboard.down('Escape').catch(() => {});
  await closed;
  expect(await extension.openPopups()).toBe(0);
  // The popup itself was among Chrome's tab targets until it closed.
  expect(await extension.tabUrls()).toEqual(tabs.filter((url) => !url.startsWith(extension.url(''))));
});
