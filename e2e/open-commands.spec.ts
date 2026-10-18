import type { Page } from '@playwright/test';
import { expect, slowWorkerReads, test } from './extension.ts';

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

test('name-this-page records a name-page intent for the window in front, then opens the popup there on the Name form', async ({ extension, site }) => {
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('To be named'));
  const changes = await extension.watchStorage();
  const { windowId } = await extension.frontTab(page);
  const popup = await extension.popupByCommand('name-this-page', page);
  expect(await windowOf(popup)).toBe(windowId);
  await expect(popup.getByRole('textbox', { name: 'Name' })).toBeFocused();
  const [written, removed] = await changes();
  expect(written).toEqual({ openIntent: { newValue: { kind: 'name-page', windowId, time: expect.any(Number) } } });
  expect(removed).toEqual({ openIntent: { oldValue: written!.openIntent!.newValue } });
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
  // Its opening read of the intent is done: a record written during it would be honored, as for any fresh
  // record naming its window, and removed.
  await expect(shown.locator('footer')).not.toHaveText(/until the popup is ready/);

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
  // A mapping, so the popup shows search and its chip rather than the first run.
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  // The ordinary page first: a page opened later would open in the toolbar-less window.
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Normal window'));
  const later = await extension.frontTab(page);
  const opened = extension.context.waitForEvent('page');
  await extension.worker.evaluate((url) => chrome.windows.create({ url, type: 'popup', focused: true }), site.pageUrl('No toolbar'));
  const refused = await extension.frontTab(await opened);

  // Chrome's storage answers a read of the intent 300 ms late, as it may under load, so the later command's
  // record lands between the refused command's read of its own record and its removal. Each removal the
  // worker makes is recorded with the record it removed: the refused command's, then, for the popup that
  // honored it, the later command's.
  await extension.worker.evaluate(() => {
    const local = chrome.storage.local;
    const get = local.get.bind(local) as (keys: unknown) => Promise<Record<string, unknown>>;
    const remove = local.remove.bind(local) as (keys: unknown) => Promise<void>;
    const removed: unknown[] = [];
    (globalThis as Record<string, unknown>).intentsRemoved = removed;
    (local as unknown as { get: unknown }).get = async (keys: unknown) => {
      const items = await get(keys);
      if (keys === 'openIntent') await new Promise((resolve) => setTimeout(resolve, 300));
      return items;
    };
    (local as unknown as { remove: unknown }).remove = async (keys: unknown) => {
      if (keys === 'openIntent') removed.push((await get('openIntent')).openIntent);
      return remove(keys);
    };
  });
  await extension.dispatchEvent('commands.onCommand', 'open-new-tab', refused);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const popup = await extension.popupOpenedBy(() => extension.dispatchEvent('commands.onCommand', 'open-same-tab', later));
  await settle();
  const removed = await extension.worker.evaluate(() => (globalThis as Record<string, unknown>).intentsRemoved);
  expect(removed).toEqual([
    { kind: 'new-tab', windowId: refused.windowId, time: expect.any(Number) },
    { kind: 'this-tab', windowId: later.windowId, time: expect.any(Number) },
  ]);
  // The later command's popup found its record and starts in its mode.
  await expect(popup.locator('.chip')).toHaveText('This tab');
});

test('the record a popup honored is removed only while it is still that record', async ({ extension, site }) => {
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Honored'));
  const { windowId } = await extension.frontTab(page);
  const honored = { kind: 'this-tab', windowId: windowId!, time: Date.now() };
  // Written since the popup read it: for another window, or for the same one by a later command.
  for (const since of [
    { ...honored, windowId: windowId! + 1 },
    { ...honored, time: honored.time + 1 },
  ]) {
    await extension.seedStorage({ openIntent: since });
    expect(await extension.sendRequest({ kind: 'remove-intent', windowId: honored.windowId, time: honored.time })).toEqual({ kind: 'done' });
    expect((await extension.readStorage()).openIntent).toEqual(since);
  }
  await extension.seedStorage({ openIntent: honored });
  expect(await extension.sendRequest({ kind: 'remove-intent', windowId: honored.windowId, time: honored.time })).toEqual({ kind: 'done' });
  expect(await extension.readStorage()).toEqual({});
});

test('a record a command writes while a popup is having its own removed stays', async ({ extension, site }) => {
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Popup open while a removal runs'));
  // The tab requests are sent from opens first, so it takes no focus from the popup later.
  await extension.sendRequest({ kind: 'remove-intent', windowId: 0, time: 0 });
  const tab = await extension.frontTab(page);
  const shown = await extension.clickToolbarButton(page);
  await expect(shown.locator('footer')).not.toHaveText(/until the popup is ready/);

  const honored = { kind: 'this-tab', windowId: tab.windowId! + 1, time: Date.now() };
  await extension.seedStorage({ openIntent: honored });
  await slowWorkerReads(extension.worker, 'openIntent', 300);
  const removal = extension.sendRequest({ kind: 'remove-intent', windowId: honored.windowId, time: honored.time });
  await new Promise((resolve) => setTimeout(resolve, 100));
  // Refused, since the window's popup is open: its record stays for that window.
  await extension.dispatchEvent('commands.onCommand', 'open-same-tab', tab);
  expect(await removal).toEqual({ kind: 'done' });
  await settle();
  expect((await extension.readStorage()).openIntent).toEqual({ kind: 'this-tab', windowId: tab.windowId, time: expect.any(Number) });
});

test('a popup shows the mode it honored only once its record is gone, so the toolbar opens the next one in New tab', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Slow storage'));
  await slowWorkerReads(extension.worker, 'openIntent', 300);
  const first = await extension.popupByCommand('open-same-tab', page);
  await expect(first.locator('.chip')).toHaveText('This tab');
  expect('openIntent' in (await extension.readStorage())).toBe(false);
  await first.close();
  const second = await extension.clickToolbarButton(page);
  await expect(second.locator('footer')).not.toHaveText(/until the popup is ready/);
  await expect(second.locator('.chip')).toHaveText('New tab');
});
