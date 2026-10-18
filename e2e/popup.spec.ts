import { expect, test } from './extension.ts';

test('the toolbar button opens the real popup, rendered by React, which sees the page it was opened on', async ({ extension, site }) => {
  // A popup.html open in an ordinary tab is not the popup: the helper must not return it.
  const popupInTab = await extension.context.newPage();
  await popupInTab.goto(extension.url('popup.html'));
  await expect(popupInTab.locator('#root main').getByRole('combobox')).toBeVisible();

  const pageUrl = site.pageUrl('A page to jump from');
  const page = await extension.context.newPage();
  await page.goto(pageUrl);
  const popup = await extension.clickToolbarButton(page);

  await expect(popup.locator('#root main').getByRole('combobox', { name: 'Search mappings by name or address' })).toBeFocused();
  expect(await popup.evaluate(async () => (await chrome.tabs.getCurrent()) === undefined)).toBe(true);
  // Without the `tabs` permission, the url and title are there only by the click's activeTab grant.
  const opener = await popup.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return [tab?.url, tab?.title];
  });
  expect(opener).toEqual([pageUrl, 'A page to jump from']);
});
