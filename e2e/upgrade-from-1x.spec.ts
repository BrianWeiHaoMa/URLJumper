// An upgrade from 1.3.0 as Chrome makes it, on a real 1.3.0 built from the project's history (product *Done
// when*, its first bullet; In use, "Upgrade from 1.x"; G23, G24, G25, S12, R5): the document byte for byte as
// 1.3.0 stored it, the dark theme, the shortcut the user reassigned, Document order, 1.x's order for a shared
// prefix with a name typed in full first, and the notice of what is new in the first popup only. Every request
// from the extension's origin, 1.3.0's and 2.0's, is checked at teardown (G33).
import type { Page } from '@playwright/test';
import {
  assignedShortcuts,
  assignShortcut,
  checkFitAndAccessibility,
  closingPopup,
  expect,
  expectNoNotice,
  shownTheme,
  test,
  upgradeNotice,
  type LoadedExtension,
  type LocalSite,
  type Release1x,
} from './extension.ts';

// Aligned columns, a comment heading, a mapping with a trailing comment, a blank line, and a tab; two names
// sharing a prefix in an order neither alphabetical nor by length (mailing, mail); and a later line's name (st)
// that an earlier line's name (stocks) starts with.
const DOC = [
  '\\ Daily',
  'stocks               https://stocks.example/portfolio',
  'mailing              https://groups.example/',
  'mail                 https://mail.example/            \\ the inbox',
  '',
  'st\thttps://stocks.example/quote',
  '',
].join('\n');

const searchBox = (popup: Page) => popup.getByRole('combobox');
const names = (popup: Page) => popup.locator('[role=option] .row-name');

/**
 * What a 1.3.0 user leaves: DOC saved and the theme set to dark on 1.3.0's own settings page. Returns the whole of
 * storage as 1.3.0 then holds it.
 */
async function saveIn1x(release: Release1x): Promise<Record<string, unknown>> {
  const settings = await release.context.newPage();
  await settings.goto(release.url(release.manifest.options_page!));
  expect(await settings.evaluate(() => chrome.runtime.getManifest().version)).toBe('1.3.0');
  // 1.3.0's editor takes typing before its read of the stored document lands, which then replaces the typing:
  // the text is typed again until 1.3.0 shows it as an unsaved change, which it does only once that read landed.
  await expect(async () => {
    await settings.getByLabel('URL mappings').fill(DOC);
    await expect(settings.getByText('Unsaved Changes')).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await settings.getByRole('button', { name: 'Save Changes' }).click();
  await expect(settings.getByText('Saved.')).toBeVisible();
  // Headless Chrome's scheme is light, so one toggle chooses dark.
  await settings.getByRole('button', { name: 'Toggle Theme' }).click();
  const stored = () => settings.evaluate(() => chrome.storage.local.get(null));
  await expect.poll(async () => (await stored()).themePref).toBe('dark');
  const items = await stored();
  await settings.close();
  return items;
}

/** A page of `site` in front, for a popup to open on. */
async function webPage(extension: LoadedExtension, site: LocalSite) {
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl('Where the popup opens'));
  return page;
}

test('a real update from 1.3.0 keeps the document byte for byte, the dark theme, Alt+J, and Document order; the first popup shows the notice, which its first letter dismisses, and lists as 1.x did with a name typed in full first', async ({ release1x, site }) => {
  expect(release1x.manifest).toMatchObject({ name: 'URL Jumper', version: '1.3.0' });
  const before = await saveIn1x(release1x);
  expect(before).toEqual({ mappings: DOC, themePref: 'dark' });
  await assignShortcut(release1x.context, release1x.id, 'open-new-tab', 'Alt+J');

  const extension = await release1x.update();
  expect(await extension.worker.evaluate(() => chrome.management.getSelf())).toMatchObject({ name: 'URLJumper', version: '2.1.0', enabled: true });
  // Nothing migrated: 1.3.0's keys as it left them, and the mark of the update.
  expect(await extension.readStorage()).toEqual({ ...before, upgradeNotice: 'pending' });
  expect((await assignedShortcuts(extension.worker))['open-new-tab']).toBe('Alt+J');

  const page = await webPage(extension, site);
  // Headless, a pressed key never reaches Chrome's shortcuts: Alt+J is open-new-tab's as Chrome reports above,
  // and the command is dispatched with the tab Chrome passes.
  const popup = await extension.popupByCommand('open-new-tab', page);
  const { notice } = upgradeNotice(popup);
  await expect(notice).toBeVisible();
  expect(await shownTheme(popup)).toBe('dark');
  await checkFitAndAccessibility(popup);
  await expect(notice).toBeVisible();
  await expect(searchBox(popup)).toBeFocused();

  await popup.keyboard.press('m');
  await expect(notice).toHaveCount(0);
  await expect(searchBox(popup)).toHaveValue('m');
  await expect.poll(async () => 'upgradeNotice' in (await extension.readStorage())).toBe(false);
  await popup.keyboard.type('ai');
  await expect(names(popup)).toHaveText(['mailing', 'mail']);
  for (let typed = 3; typed > 0; typed--) await popup.keyboard.press('Backspace');
  await popup.keyboard.type('st');
  await expect(names(popup)).toHaveText(['st', 'stocks']);
  await popup.close();

  const next = await extension.popupByCommand('open-new-tab', page);
  await expectNoNotice(next);
  await next.getByRole('button', { name: 'Settings' }).click();
  await expect(next.getByRole('listbox', { name: 'Search order' }).getByRole('option', { selected: true })).toHaveText('Document order');
  await next.close();
  // Nothing the user did not ask for is left written: no search order, no usage, no notice.
  await expect.poll(() => extension.readStorage()).toEqual(before);
});

test("after a real update from 1.3.0, the first popup's close control dismisses the notice for good", async ({ release1x, site }) => {
  const before = await saveIn1x(release1x);
  const extension = await release1x.update();
  const page = await webPage(extension, site);
  const popup = await extension.clickToolbarButton(page);
  await upgradeNotice(popup).close.click();
  await expect(upgradeNotice(popup).notice).toHaveCount(0);
  await expect(searchBox(popup)).toBeFocused();
  await expect.poll(() => extension.readStorage()).toEqual(before);
  await popup.close();
  await expectNoNotice(await extension.clickToolbarButton(page));
});

test("after a real update from 1.3.0, activating the first popup's notice opens the what's-new page in the package and dismisses the notice for good", async ({ release1x, site }) => {
  const before = await saveIn1x(release1x);
  const extension = await release1x.update();
  const page = await webPage(extension, site);
  const popup = await extension.clickToolbarButton(page);
  const opened = extension.context.waitForEvent('page', { predicate: (tab) => tab.url() === extension.url('whats-new.html') });
  await closingPopup(popup, () => upgradeNotice(popup).open.click());
  const whatsNew = await opened;
  await expect(whatsNew).toHaveTitle("What's new in URLJumper 2.0");
  await expect(whatsNew.getByRole('listitem')).toHaveCount(5);
  await expect.poll(() => extension.readStorage()).toEqual(before);
  await expectNoNotice(await extension.clickToolbarButton(page));
});

test("a request 1.3.0 made before the update is among those checked with 2.0's at teardown: both share the extension's origin", async ({ release1x, site }) => {
  const planted = site.pageUrl('Planted by 1.3.0');
  const settings = await release1x.context.newPage();
  await settings.goto(release1x.url(release1x.manifest.options_page!));
  await Promise.all([settings.waitForURL(planted), settings.evaluate((url) => location.assign(url), planted)]);
  // Declared through 2.0: the run fails unless the request reached the log the teardown reads.
  (await release1x.update()).expectExtensionRequest(planted);
});
