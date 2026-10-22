// The real popup's opener tab and search header: its icon controls stay above the results as the list grows.
import { checkFitAndAccessibility, expect, popupOnNewPage, rowPencils, test } from './extension.ts';

test('the toolbar button opens the real popup, rendered by React, which sees the page it was opened on', async ({ extension, site }) => {
  // A mapping, so the popup shows search rather than the first run.
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
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

test('the titled Name this page plus stays between the chip and the titled gear as one row grows to seven, and opens the Name form', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: Array.from({ length: 7 }, (_, i) => `m${i + 1}  https://m${i + 1}.example/\n`).join('') });
  const { popup } = await popupOnNewPage(extension, site, 'A page to name');
  const header = popup.locator('header.search-bar');
  const plus = header.getByRole('button', { name: 'Name this page', exact: true });
  const gear = header.getByRole('button', { name: 'Settings', exact: true });
  const search = header.getByRole('combobox');
  await checkFitAndAccessibility(popup);

  await search.fill('m1');
  await expect(popup.getByRole('option')).toHaveCount(1);
  await expect(header.locator(':scope > *')).toHaveCount(4);
  expect(await header.locator(':scope > *').evaluateAll((controls) => controls.map((control) => control.className))).toEqual([
    'search-box', 'chip', 'icon-button name-page', 'icon-button settings-gear',
  ]);
  for (const [button, title] of [[plus, 'Name this page'], [gear, 'Settings'], [rowPencils(popup).first(), 'Edit']] as const) {
    await button.hover();
    await expect(button).toHaveAttribute('title', title);
    await expect(button.locator('svg')).toBeVisible();
    await expect(button).toHaveText('');
  }
  const place = await plus.boundingBox();
  expect(place).not.toBeNull();
  const chip = (await header.locator('.chip').boundingBox())!;
  const settings = (await gear.boundingBox())!;
  expect(chip.x + chip.width).toBeLessThanOrEqual(place!.x);
  expect(place!.x + place!.width).toBeLessThanOrEqual(settings.x);
  expect(place!.y + place!.height / 2).toBe(chip.y + chip.height / 2);
  expect(place!.y + place!.height / 2).toBe(settings.y + settings.height / 2);
  await checkFitAndAccessibility(popup);

  await search.fill('m');
  await expect(popup.getByRole('option')).toHaveCount(7);
  expect(await plus.boundingBox()).toEqual(place);
  await expect(popup.locator('.page-bar')).toHaveCount(0);
  await plus.focus();
  await expect(popup.locator('footer')).toHaveText('Enter opens the Name form');
  await checkFitAndAccessibility(popup);

  await plus.click();
  await expect(popup.getByRole('heading', { name: 'Name this page', exact: true })).toBeVisible();
  const name = popup.getByRole('textbox', { name: 'Name', exact: true });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('');
  await expect(popup.locator('.subject-title')).toHaveText('A page to name');
  await checkFitAndAccessibility(popup);
});
