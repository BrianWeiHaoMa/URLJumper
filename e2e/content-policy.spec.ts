import { checkAccessibilityInBothSchemes, expect, shownTheme, test, watchPolicy, type LoadedExtension } from './extension.ts';

test('an extension page renders under the CSP with no violation and no request outside the package', async ({ extension, site }) => {
  const page = await extension.context.newPage();
  const policy = await watchPolicy(page, extension);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\nyt  https://www.youtube.com/results?search_query=%s\n' });
  await page.goto(extension.url('popup.html'));
  // A blank list, then a typed search with an argument row.
  await expect(page.locator('#root main').getByRole('option')).toHaveCount(2);
  await page.getByRole('combobox').fill('yt lo-fi');
  await expect(page.getByRole('option')).toHaveCount(1);
  expect(await policy.violations()).toEqual([]);
  expect(policy.offPackage).toEqual([]);
  expect(errors).toEqual([]);

  // The detector is not vacuous: an image from outside the package, added here, is blocked and seen.
  const outside = site.pageUrl('Not an image');
  await page.evaluate((src) => {
    const image = document.createElement('img');
    image.src = src;
    document.body.append(image);
  }, outside);
  await expect.poll(() => policy.violations()).toEqual([`img-src ${outside}`]);
  expect(policy.offPackage).toEqual([outside]);
});

test('the options page renders, follows a theme, and exports under the CSP with no violation and no request outside the package', async ({ extension }) => {
  const page = await extension.context.newPage();
  const policy = await watchPolicy(page, extension);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  await page.goto(extension.url('options.html'));
  await page.getByRole('listbox', { name: 'Theme' }).getByRole('option', { name: 'Dark' }).click();
  await expect(page.getByRole('listbox', { name: 'Theme' }).getByRole('option', { selected: true })).toHaveText('Dark');
  await checkAccessibilityInBothSchemes(page);
  await page.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name: 'Text', exact: true }).click();
  await checkAccessibilityInBothSchemes(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export…' }).click();
  await download;
  expect(await policy.violations()).toEqual([]);
  expect(policy.offPackage).toEqual([]);
  expect(errors).toEqual([]);
});

test("the what's-new page renders and follows the stored theme under the CSP with no violation and no request outside the package", async ({ extension }) => {
  const page = await extension.context.newPage();
  const policy = await watchPolicy(page, extension);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await extension.seedStorage({ themePref: 'dark' });
  await page.goto(extension.url('whats-new.html'));
  await expect(page.getByRole('listitem')).toHaveCount(5);
  // Its script ran: the stored theme shows.
  await expect.poll(() => shownTheme(page)).toBe('dark');
  expect(await policy.violations()).toEqual([]);
  expect(policy.offPackage).toEqual([]);
  expect(errors).toEqual([]);
});

// The CSP does not govern an extension page's own navigation, so this plant reaches the network.
async function plantNavigation(extension: LoadedExtension, url: string) {
  const page = await extension.context.newPage();
  await page.goto(extension.url('popup.html'));
  await Promise.all([page.waitForURL(url), page.evaluate((url) => location.assign(url), url)]);
}

test("a request from the extension's origin that reaches the network is recorded, wherever it was made", async ({ extension, site }) => {
  const planted = site.pageUrl('Planted');
  extension.expectExtensionRequest(planted);
  await plantNavigation(extension, planted);
});

test.fail('a check fails when a request from the extension reached the network and the check did not declare it', async ({ extension, site }) => {
  await plantNavigation(extension, site.pageUrl('Planted, undeclared'));
});
