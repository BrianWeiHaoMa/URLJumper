import type { Page } from '@playwright/test';
import { expect, test } from './extension.ts';

// The window a popup belongs to, as the popup itself sees it.
const windowOf = (popup: Page) => popup.evaluate(async () => (await chrome.windows.getCurrent()).id);

// A listener that would act runs within milliseconds of its dispatch; this waits long past it.
const settle = () => new Promise((resolve) => setTimeout(resolve, 1_000));

for (const [command, kind] of [
  ['open-same-tab', 'this-tab'],
  ['open-new-tab', 'new-tab'],
] as const) {
  test(`${command} records a ${kind} intent for the window in front, then opens the popup there`, async ({ extension, site }) => {
    const page = await extension.context.newPage();
    await page.goto(site.pageUrl('In front'));
    const changes = await extension.watchStorage();
    const before = Date.now();
    const { windowId } = await extension.frontTab(page);

    const popup = await extension.popupByCommand(command, page);
    expect(await windowOf(popup)).toBe(windowId);
    const [written] = await changes();
    expect(written).toEqual({ openIntent: { newValue: { kind, windowId, time: expect.any(Number) } } });
    const { time } = written!.openIntent!.newValue as { time: number };
    expect(time).toBeGreaterThanOrEqual(before);
    expect(time).toBeLessThanOrEqual(Date.now());
  });
}

test('a command Chrome passes without a tab opens the popup for the focused window', async ({ extension, site }) => {
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Focused'));
  const { windowId } = await extension.frontTab(page);
  const changes = await extension.watchStorage();
  const popup = await extension.popupOpenedBy(() => extension.dispatchEvent('commands.onCommand', 'open-new-tab'));
  expect(await windowOf(popup)).toBe(windowId);
  expect((await changes())[0]).toEqual({ openIntent: { newValue: { kind: 'new-tab', windowId, time: expect.any(Number) } } });
});

test('name-this-page records nothing and opens no popup', async ({ extension, site }) => {
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('To be named'));
  const changes = await extension.watchStorage();
  await extension.dispatchEvent('commands.onCommand', 'name-this-page', await extension.frontTab(page));
  await settle();
  expect(await changes()).toEqual([]);
  expect(await extension.openPopups()).toBe(0);
});

test('a command in a window without a toolbar removes its intent and opens nothing', async ({ extension, site }) => {
  const opened = extension.context.waitForEvent('page');
  await extension.worker.evaluate((url) => chrome.windows.create({ url, type: 'popup', focused: true }), site.pageUrl('No toolbar'));
  const page = await opened;
  const changes = await extension.watchStorage();
  const tab = await extension.frontTab(page);

  await extension.dispatchEvent('commands.onCommand', 'open-same-tab', tab);
  await expect.poll(async () => (await changes()).length).toBe(2);
  const [written, removed] = await changes();
  expect(written).toEqual({ openIntent: { newValue: { kind: 'this-tab', windowId: tab.windowId, time: expect.any(Number) } } });
  expect(removed).toEqual({ openIntent: { oldValue: written!.openIntent!.newValue } });
  expect(await extension.openPopups()).toBe(0);
});

test('refused for an inactive window, the intent waits and opens the popup when that window next takes focus', async ({ extension, site }) => {
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Popup already open'));
  const tab = await extension.frontTab(page);
  const shown = await extension.clickToolbarButton(page);

  // Chrome refuses openPopup while the window's popup is open.
  const changes = await extension.watchStorage();
  await extension.dispatchEvent('commands.onCommand', 'open-same-tab', tab);
  await expect.poll(async () => (await changes()).length).toBe(1);
  await settle();
  expect(await changes()).toHaveLength(1);
  expect(await extension.openPopups()).toBe(1);
  const { openIntent } = await extension.readStorage();
  expect(openIntent).toMatchObject({ kind: 'this-tab', windowId: tab.windowId });

  await shown.close();
  await expect.poll(() => extension.openPopups()).toBe(0);
  const popup = await extension.popupOpenedBy(() => extension.dispatchEvent('windows.onFocusChanged', tab.windowId));
  expect(await windowOf(popup)).toBe(tab.windowId);
});

test('focus opens no popup for an intent older than ten seconds, or for another window', async ({ extension, site }) => {
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Waiting'));
  const { windowId } = await extension.frontTab(page);

  // As a refused command leaves it, written eleven seconds ago.
  await extension.seedStorage({ openIntent: { kind: 'this-tab', windowId, time: Date.now() - 11_000 } });
  await extension.dispatchEvent('windows.onFocusChanged', windowId);
  await settle();
  expect(await extension.openPopups()).toBe(0);

  await extension.seedStorage({ openIntent: { kind: 'this-tab', windowId: windowId + 1, time: Date.now() } });
  await extension.dispatchEvent('windows.onFocusChanged', windowId);
  await extension.dispatchEvent('windows.onFocusChanged', -1);
  await settle();
  expect(await extension.openPopups()).toBe(0);
});

test("a refused command's cleanup never removes the intent a later command wrote", async ({ extension, site }) => {
  // The ordinary page first: a page opened later would open in the toolbar-less window.
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Normal window'));
  const later = await extension.frontTab(page);
  const opened = extension.context.waitForEvent('page');
  await extension.worker.evaluate((url) => chrome.windows.create({ url, type: 'popup', focused: true }), site.pageUrl('No toolbar'));
  const refused = await extension.frontTab(await opened);

  // Chrome's storage answers a read of the intent 300 ms late, as it may under load, so the later command's
  // record lands between the refused command's read of its own record and its removal.
  await extension.worker.evaluate(() => {
    const local = chrome.storage.local;
    const get = local.get.bind(local) as (keys: unknown) => Promise<Record<string, unknown>>;
    (local as unknown as { get: unknown }).get = async (keys: unknown) => {
      const items = await get(keys);
      if (keys === 'openIntent') await new Promise((resolve) => setTimeout(resolve, 300));
      return items;
    };
  });
  await extension.dispatchEvent('commands.onCommand', 'open-new-tab', refused);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await extension.popupOpenedBy(() => extension.dispatchEvent('commands.onCommand', 'open-same-tab', later));
  await settle();
  expect((await extension.readStorage()).openIntent).toMatchObject({ kind: 'this-tab', windowId: later.windowId });
});
