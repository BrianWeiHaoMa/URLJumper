// The full settings page, `options.html` (G31; Composition, "Settings views"): declared to open in its own tab,
// it shows the same views as the popup's settings, opens on the view its fragment names, offers Export beside
// Preferences and no way back to search or *Open in tab*, and passes the accessibility pass in both schemes
// (G32). Export downloads the stored document, read when activated, as `URLJumperMappings.txt` (F10, G20).
import type { Download, Page } from '@playwright/test';
import fs from 'node:fs';
import { checkAccessibilityInBothSchemes, expect, test, type LoadedExtension } from './extension.ts';

const exportButton = (page: Page) => page.getByRole('button', { name: 'Export…' });

async function optionsPage(extension: LoadedExtension, fragment = '') {
  const page = await extension.context.newPage();
  await page.goto(extension.url(`options.html${fragment}`));
  await expect(page.getByRole('listbox', { name: 'Search order' })).toBeVisible();
  return page;
}

async function exported(page: Page): Promise<{ name: string; bytes: Buffer }> {
  const download: Promise<Download> = page.waitForEvent('download');
  await exportButton(page).click();
  const file = await download;
  return { name: file.suggestedFilename(), bytes: fs.readFileSync(await file.path()) };
}

test('Chrome opens the options page in a tab of its own, with Preferences and Export and no way back or Open in tab, passing the accessibility pass in both schemes', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  await extension.worker.evaluate(() => chrome.runtime.openOptionsPage());
  const opened = () => extension.context.pages().find((tab) => tab.url() === extension.url('options.html'));
  await expect.poll(() => opened() !== undefined).toBe(true);
  const page = opened()!;
  await expect(page).toHaveTitle('URLJumper settings');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('URLJumper settings');
  await expect(page.getByRole('navigation', { name: 'Settings views' }).getByRole('button')).toHaveText(['Preferences']);
  await expect(page.getByRole('region', { name: 'Preferences' })).toBeVisible();
  for (const heading of ['Search order', 'Theme', 'Address bar', 'Shortcuts', 'Export']) await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
  await expect(exportButton(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /Open in tab|Back|Settings/ })).toHaveCount(0);
  await expect(page.locator('footer')).toHaveCount(0);
  expect(await page.evaluate(async () => (await chrome.tabs.getCurrent()) !== undefined)).toBe(true);
  await checkAccessibilityInBothSchemes(page);
});

test('the fragment names the view the page opens on; none, or one that does not exist, opens the first', async ({ extension }) => {
  for (const fragment of ['#view=preferences', '#view=preferences&line=3', '', '#view=nothing']) {
    const page = await optionsPage(extension, fragment);
    await expect(page.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name: 'Preferences' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('region', { name: 'Preferences' })).toBeVisible();
    await page.close();
  }
});

test('Export downloads the stored document as URLJumperMappings.txt, its UTF-8 bytes exactly, read each time it is activated', async ({ extension }) => {
  // CRLF endings, a character outside the Basic Multilingual Plane, and no final line break.
  const stored = 'a  https://a.example/\r\n\u{1F600}  https://b.example/\r\nc https://c.example/';
  await extension.seedStorage({ mappings: stored });
  const page = await optionsPage(extension);
  expect(await exported(page)).toEqual({ name: 'URLJumperMappings.txt', bytes: Buffer.from(stored, 'utf8') });

  // Another page changes the document while this one stays open: Export gives the document as it is now.
  expect(await extension.sendRequest({ kind: 'insert', name: 'd', url: 'https://d.example/', note: '', heading: null })).toMatchObject({ kind: 'applied', line: 4 });
  const now = (await extension.readStorage()).mappings as string;
  expect(now).not.toBe(stored);
  expect(await exported(page)).toEqual({ name: 'URLJumperMappings.txt', bytes: Buffer.from(now, 'utf8') });

  await extension.seedStorage({});
  expect(await exported(page)).toEqual({ name: 'URLJumperMappings.txt', bytes: Buffer.alloc(0) });
  // Exporting stores nothing.
  expect(await extension.readStorage()).toEqual({});
});
