import { expect, test, watchPolicy } from './extension.ts';

test('an extension page renders under the CSP with no violation and no request outside the package', async ({ extension, site }) => {
  const page = await extension.context.newPage();
  const policy = await watchPolicy(page, extension);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(extension.url('popup.html'));
  await expect(page.locator('#root main')).toBeVisible();
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
