// The Text view's file actions in both settings hosts: titled header icons in order, absent from other
// views; Import keeps the file as a draft until Save and asks before replacing typing; Export downloads the
// stored text rather than the draft; browser failures stay in the Text view. The popup says what Enter does.
import type { Page } from '@playwright/test';
import {
  checkAccessibilityInBothSchemes,
  checkFitAndAccessibility,
  draftLanded,
  expect,
  exportFile,
  importFile,
  listView,
  popupOnNewPage,
  refuseFileOperation,
  refuseWorkerStorage,
  SETTINGS_HOSTS,
  test,
  textView,
  textViewIn,
  typeAtEnd,
} from './extension.ts';

const DOC = 'mail  https://mail.example/\n';
const FILE = 'imported  https://imported.example/\n';
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name, exact: true });

for (const host of SETTINGS_HOSTS) {
  test(`in the ${host}, file actions are titled icons at the Text header's right, absent from Preferences and List`, async ({ extension, site }) => {
    await extension.seedStorage({ mappings: DOC });
    const page = host === 'popup' ? (await popupOnNewPage(extension, site)).popup : await extension.context.newPage();
    const check = () => host === 'popup' ? checkFitAndAccessibility(page) : checkAccessibilityInBothSchemes(page);
    if (host === 'popup') {
      await check();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
    } else await page.goto(extension.url('options.html'));

    for (const view of ['Preferences', 'List', 'Text', 'List', 'Preferences', 'Text']) {
      await nav(page, view).click();
      await expect(nav(page, view)).toHaveAttribute('aria-current', 'page');
      if (view === 'Preferences') await expect(page.getByRole('listbox', { name: 'Theme' })).toBeVisible();
      if (view === 'List') await expect(listView(page).names).toHaveText(['mail']);
      if (view !== 'Text') {
        await expect(page.getByRole('button', { name: /^(Import|Export)…$/ })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: /^(Import|Export)$/ })).toHaveCount(0);
        await expect(page.getByRole('region', { name: /^(Import|Export)$/ })).toHaveCount(0);
        await check();
        continue;
      }
      await expect(textView(page).area).toHaveValue(DOC);
      const controls = page.locator(host === 'popup' ? '.settings-bar-view-controls' : '.options-view-controls');
      const bar = page.locator(host === 'popup' ? '.settings-bar' : '.options-bar');
      expect(await controls.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))).toEqual(['Import…', 'Export…']);
      expect(await bar.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent))).toEqual([
        ...(host === 'popup' ? ['Back'] : []), 'Preferences', 'List', 'Text', 'Import…', 'Export…', ...(host === 'popup' ? ['Open in tab'] : []),
      ]);
      expect(await controls.evaluate((element) => element.nextElementSibling?.getAttribute('aria-label') ?? null)).toBe(host === 'popup' ? 'Open in tab' : null);
      const navBox = (await page.getByRole('navigation', { name: 'Settings views' }).boundingBox())!;
      let right = navBox.x + navBox.width;
      for (const [name, title, says] of [
        ['Import…', 'Import a text file to edit, stored when you save', 'Enter chooses a file to import'],
        ['Export…', 'Export your stored mappings', 'Enter downloads URLJumperMappings.txt'],
      ] as const) {
        const button = controls.getByRole('button', { name, exact: true });
        await expect(button).toHaveAttribute('title', title);
        await expect(button).toHaveClass(/icon-button/);
        await expect(button).toHaveText('');
        await expect(button.locator('svg')).toBeVisible();
        const box = (await button.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(right);
        expect(box.y).toBeLessThan(navBox.y + navBox.height);
        expect(box.y + box.height).toBeGreaterThan(navBox.y);
        right = box.x + box.width;
        await button.focus();
        if (host === 'popup') await expect(page.locator('footer')).toHaveText(says);
        await check();
      }
    }
  });

  test(`in the ${host}, Import makes a draft until Save and asks before replacing text just typed here`, async ({ extension, site }) => {
    const { page, view, check } = await textViewIn(host, extension, site, { mappings: DOC });
    await check();
    await importFile(page, 'first.txt', Buffer.from(FILE));
    await expect(view.area).toHaveValue(FILE);
    await expect(view.area).toBeFocused();
    await draftLanded(extension, FILE);
    expect((await extension.readStorage()).mappings).toBe(DOC);
    await check();
    await view.save.click();
    await expect(view.status).toHaveText('Saved');
    expect((await extension.readStorage()).mappings).toBe(FILE);
    await check();

    const typed = `${FILE}typed  https://typed.example/\n`;
    await typeAtEnd(view, 'typed  https://typed.example/\n');
    await check();
    await importFile(page, 'second.txt', Buffer.from(DOC));
    await expect(view.keptOffer).toContainText('Importing second.txt replaces it.');
    await expect(view.area).not.toBeEditable();
    await expect(page.getByRole('button', { name: 'Replace it with the file', exact: true })).toBeFocused();
    await check();
    await page.getByRole('button', { name: 'Keep the unsaved text', exact: true }).click();
    await expect(view.resume).toBeFocused();
    await check();
    await view.resume.click();
    await expect(view.area).toHaveValue(typed);
    await check();
    await importFile(page, 'second.txt', Buffer.from(DOC));
    await expect(view.keptOffer).toContainText('Importing second.txt replaces it.');
    await check();
    await page.getByRole('button', { name: 'Replace it with the file', exact: true }).click();
    await expect(view.area).toHaveValue(DOC);
    await expect(view.area).toBeEditable();
    await draftLanded(extension, DOC);
    expect((await extension.readStorage()).mappings).toBe(FILE);
    await check();
  });

  test(`in the ${host}, Import over text typed here that Chrome does not keep takes nothing and says so, the text still there to save`, async ({ extension, site }) => {
    const { page, view, check } = await textViewIn(host, extension, site, { mappings: DOC });
    await refuseWorkerStorage(extension.worker, 'set', 'Quota exceeded');
    await typeAtEnd(view, 'typed  https://typed.example/\n');
    await expect(view.notKept).toBeVisible();
    await importFile(page, 'second.txt', Buffer.from(FILE));
    await expect(page.getByRole('alert').filter({ hasText: 'Not imported' })).toHaveText(
      'Not imported: Chrome is not keeping your unsaved text, which second.txt would replace. Save it, then import again. Chrome said: Quota exceeded',
    );
    await expect(view.area).toHaveValue(`${DOC}typed  https://typed.example/\n`);
    await expect(view.area).toBeEditable();
    await expect(view.keptOffer).toHaveCount(0);
    expect(await extension.readStorage()).toEqual({ mappings: DOC });
    await check();
  });

  test(`in the ${host}, Export downloads the stored UTF-8 bytes rather than the unsaved Text draft`, async ({ extension, site }) => {
    const stored = 'mail  https://mail.example/\r\n😀  https://example.com/';
    const { page, view, check } = await textViewIn(host, extension, site, { mappings: stored });
    await check();
    await typeAtEnd(view, '\nunsaved  https://unsaved.example/');
    await draftLanded(extension, `${stored.replaceAll('\r\n', '\n')}\nunsaved  https://unsaved.example/`);
    await check();
    const before = await extension.readStorage();
    expect(await exportFile(page)).toEqual({ name: 'URLJumperMappings.txt', bytes: Buffer.from(stored, 'utf8') });
    expect(await extension.readStorage()).toEqual(before);
    await expect(view.area).toHaveValue(`${stored.replaceAll('\r\n', '\n')}\nunsaved  https://unsaved.example/`);
    await check();
  });

  for (const operation of ['import', 'export'] as const) {
    test(`in the ${host}, a refused ${operation} shows its alert in Text and stores nothing`, async ({ extension, site }) => {
      const { page, view, check } = await textViewIn(host, extension, site, { mappings: DOC });
      await check();
      await refuseFileOperation(page, operation, 'File operation refused');
      const downloads: string[] = [];
      page.on('download', (file) => downloads.push(file.suggestedFilename()));
      if (operation === 'import') await importFile(page, 'unreadable.txt', Buffer.from(FILE));
      else await page.getByRole('button', { name: 'Export…', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Text', exact: true }).getByRole('alert')).toHaveText(operation === 'import'
        ? 'Not imported: unreadable.txt could not be read. Chrome said: File operation refused'
        : 'Not exported. Chrome said: File operation refused');
      await expect(nav(page, 'Text')).toHaveAttribute('aria-current', 'page');
      await expect(view.area).toHaveValue(DOC);
      expect(await extension.readStorage()).toEqual({ mappings: DOC });
      await check();
      expect(downloads).toEqual([]);
    });
  }
}
