// Each row editor's and Name form's field copies (G31, G32, L2): loaded and unsaved values, including invalid
// text, copied exactly by click or Enter, with field-specific status and focus guidance, without storing or
// opening.
import {
  checkAccessibilityInBothSchemes,
  checkFitAndAccessibility,
  clipboardText,
  editSelectedRow,
  expect,
  listViewInPopup,
  listViewOnOptionsPage,
  nameForm,
  popupOnNewPage,
  rowEditor,
  test,
  type RowEditor,
} from './extension.ts';

const mappings = 'mail  https://mail.example/  \\ original note\n';

function fields(editor: RowEditor) {
  return [
    { input: editor.name, copy: editor.copyName, word: 'name', loaded: 'mail', edited: '  invalid \\ name  ' },
    { input: editor.url, copy: editor.copyUrl, word: 'URL', loaded: 'https://mail.example/', edited: '  not a URL /?x=é&y=%20  ' },
    { input: editor.note, copy: editor.copyNote, word: 'note', loaded: 'original note', edited: '  café  \\ keep spaces & symbols  ' },
  ] as const;
}

for (const activation of ['click', 'Enter'] as const) {
  test(`options List editor copies all three loaded and unsaved fields exactly by ${activation}, with Tab order and cleared status, storing and opening nothing`, async ({ extension, site }) => {
    await extension.seedStorage({ mappings });
    const clipboardPage = await extension.context.newPage();
    await clipboardPage.goto(site.pageUrl('Read field copies'));
    const view = await listViewOnOptionsPage(extension);
    const page = view.page;
    await page.bringToFront();
    await checkAccessibilityInBothSchemes(page);
    const changes = await extension.watchStorage();
    const stored = await extension.readStorage();
    const pages = extension.context.pages();
    const addresses = pages.map((tab) => tab.url());
    await view.pencil('mail').click();
    const editor = rowEditor(page);
    await expect(editor.name).toBeFocused();
    await checkAccessibilityInBothSchemes(page);

    // Every copy is immediately after its field in Tab order and drawn to that field's right.
    for (const { input, copy, word } of fields(editor)) {
      await expect(input).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(copy).toBeFocused();
      await expect(copy).toHaveAccessibleName(`Copy ${word}`);
      await expect(copy).toHaveAttribute('title', `Copy ${word}`);
      const fieldBox = (await input.boundingBox())!;
      const copyBox = (await copy.boundingBox())!;
      expect(copyBox.x).toBeGreaterThanOrEqual(fieldBox.x + fieldBox.width);
      expect(copyBox.y).toBeLessThan(fieldBox.y + fieldBox.height);
      expect(copyBox.y + copyBox.height).toBeGreaterThan(fieldBox.y);
      // OptionsPage supplies no footer callback to ListView and renders no footer.
      await expect(page.locator('footer')).toHaveCount(0);
      await page.keyboard.press('Tab');
    }
    await expect(editor.save).toBeFocused();

    for (const { input, copy, word, loaded, edited } of fields(editor)) {
      for (const value of [loaded, edited]) {
        if (value === edited) await input.fill(value);
        await expect(input).toHaveValue(value);
        if (value === edited && word !== 'note') await expect(input).toHaveAttribute('aria-invalid', 'true');
        await copy.focus();
        await expect(page.locator('footer')).toHaveCount(0);
        if (activation === 'Enter') await page.keyboard.press('Enter');
        else await copy.click();
        await expect(editor.said).toHaveAttribute('role', 'status');
        await expect(editor.said).toHaveText(`Copied the ${word}`);
        // The status is one state whatever the field and value, judged once: each pass takes seconds.
        if (word === 'name' && value === loaded) await checkAccessibilityInBothSchemes(page);
        await clipboardPage.bringToFront();
        expect(await clipboardText(clipboardPage)).toBe(value);
        await page.bringToFront();
        await expect(input).toHaveValue(value);
        expect(await changes()).toEqual([]);
        expect(await extension.readStorage()).toEqual(stored);
        expect(extension.context.pages()).toEqual(pages);
        expect(pages.map((tab) => tab.url())).toEqual(addresses);
      }
      // A real keystroke, rather than a replacement fill, must clear the copy status.
      await input.focus();
      await page.keyboard.press('End');
      await page.keyboard.type('x');
      await expect(editor.said).toHaveCount(0);
      await input.fill(loaded);
    }
    expect(await changes()).toEqual([]);
    expect(await extension.readStorage()).toEqual(stored);
  });
}

test('popup search editor copies each unsaved field and names its Enter action, storing and opening nothing', async ({ extension, site }) => {
  await extension.seedStorage({ mappings });
  const { page, popup } = await popupOnNewPage(extension, site);
  await checkFitAndAccessibility(popup);
  await popup.getByRole('combobox').fill('mail');
  await checkFitAndAccessibility(popup);
  const editor = await editSelectedRow(popup);
  await checkFitAndAccessibility(popup);
  const changes = await extension.watchStorage();
  const stored = await extension.readStorage();
  const pages = extension.context.pages();
  const addresses = pages.map((tab) => tab.url());
  for (const { input, copy, word, edited } of fields(editor)) {
    await input.fill(edited);
    await copy.focus();
    await expect(copy).toHaveAttribute('title', `Copy ${word}`);
    await expect(popup.locator('footer')).toHaveText(`Enter copies the ${word}`);
    // A copy's focus and its status are each one state whatever the field, judged once: each pass takes seconds.
    if (word === 'name') await checkFitAndAccessibility(popup);
    await popup.keyboard.press('Enter');
    await expect(editor.said).toHaveAttribute('role', 'status');
    await expect(editor.said).toHaveText(`Copied the ${word}`);
    expect(await clipboardText(page)).toBe(edited);
    await expect(input).toHaveValue(edited);
    expect(await changes()).toEqual([]);
    expect(await extension.readStorage()).toEqual(stored);
    expect(extension.context.pages()).toEqual(pages);
    expect(pages.map((tab) => tab.url())).toEqual(addresses);
    if (word === 'name') await checkFitAndAccessibility(popup);
  }
});

test('popup List editor copies the unsaved note by click, storing and opening nothing', async ({ extension, site }) => {
  await extension.seedStorage({ mappings });
  const { page, popup } = await popupOnNewPage(extension, site);
  await checkFitAndAccessibility(popup);
  const view = await listViewInPopup(popup);
  await checkFitAndAccessibility(popup);
  await view.pencil('mail').click();
  const editor = rowEditor(popup);
  await expect(editor.name).toBeFocused();
  await checkFitAndAccessibility(popup);
  const changes = await extension.watchStorage();
  const stored = await extension.readStorage();
  const pages = extension.context.pages();
  const addresses = pages.map((tab) => tab.url());
  const note = '  unsaved note \\ é  ';
  await editor.note.fill(note);
  await editor.copyNote.focus();
  await expect(popup.locator('footer')).toHaveText('Enter copies the note');
  await checkFitAndAccessibility(popup);
  await editor.copyNote.click();
  await expect(editor.said).toHaveAttribute('role', 'status');
  await expect(editor.said).toHaveText('Copied the note');
  expect(await clipboardText(page)).toBe(note);
  await expect(editor.note).toHaveValue(note);
  expect(await changes()).toEqual([]);
  expect(await extension.readStorage()).toEqual(stored);
  expect(extension.context.pages()).toEqual(pages);
  expect(pages.map((tab) => tab.url())).toEqual(addresses);
  await checkFitAndAccessibility(popup);
});

for (const activation of ['click', 'Enter'] as const) {
  test(`Name this page copies all three fields exactly by ${activation}, including the prefilled URL and invalid text, with Tab order and cleared status, storing and opening nothing`, async ({ extension, site }) => {
    await extension.seedStorage({ mappings });
    const { page, popup } = await popupOnNewPage(extension, site);
    await checkFitAndAccessibility(popup);
    await popup.getByRole('button', { name: 'Name this page', exact: true }).click();
    const form = nameForm(popup);
    await expect(form.name).toBeFocused();
    await expect(form.url).toHaveValue(page.url());
    await checkFitAndAccessibility(popup);
    const changes = await extension.watchStorage();
    const stored = await extension.readStorage();
    const pages = extension.context.pages();
    const addresses = pages.map((tab) => tab.url());
    const name = '  new café & name  ';
    const note = '  unsaved café \\ keep spaces & symbols  ';
    await form.name.fill(name);
    await form.note.fill(note);
    await expect(form.save).toHaveAttribute('aria-disabled', 'false');
    const fields = [
      { input: form.name, copy: form.copyName, word: 'name', values: [name, '  invalid \\ name  '] },
      { input: form.url, copy: form.copyUrl, word: 'URL', values: [page.url(), '  not a URL /?x=é&y=%20  '] },
      { input: form.note, copy: form.copyNote, word: 'note', values: [note] },
    ];
    await form.name.focus();
    for (const { input, copy, word } of fields) {
      await expect(input).toBeFocused();
      await popup.keyboard.press('Tab');
      await expect(copy).toBeFocused();
      await expect(copy).toHaveAccessibleName(`Copy ${word}`);
      await expect(copy).toHaveAttribute('title', `Copy ${word}`);
      await expect(popup.locator('footer')).toHaveText(`Enter copies the ${word}`);
      const fieldBox = (await input.boundingBox())!;
      const copyBox = (await copy.boundingBox())!;
      expect(copyBox.x).toBeGreaterThanOrEqual(fieldBox.x + fieldBox.width);
      expect(copyBox.y).toBeLessThan(fieldBox.y + fieldBox.height);
      expect(copyBox.y + copyBox.height).toBeGreaterThan(fieldBox.y);
      if (word === 'name') await checkFitAndAccessibility(popup);
      await popup.keyboard.press('Tab');
    }
    await expect(form.save).toBeFocused();
    for (const { input, copy, word, values } of fields) {
      for (const [index, value] of values.entries()) {
        if (index > 0) await input.fill(value);
        await expect(input).toHaveValue(value);
        if (index > 0) await expect(input).toHaveAttribute('aria-invalid', 'true');
        await copy.focus();
        await expect(popup.locator('footer')).toHaveText(`Enter copies the ${word}`);
        if (activation === 'Enter') await popup.keyboard.press('Enter');
        else await copy.click();
        await expect(form.said).toHaveAttribute('role', 'status');
        await expect(form.said).toHaveText(`Copied the ${word}`);
        if (word === 'name') await checkFitAndAccessibility(popup);
        expect(await clipboardText(page)).toBe(value);
        await expect(input).toHaveValue(value);
        expect(await changes()).toEqual([]);
        expect(await extension.readStorage()).toEqual(stored);
        expect(extension.context.pages()).toEqual(pages);
        expect(pages.map((tab) => tab.url())).toEqual(addresses);
        await input.focus();
        await popup.keyboard.press('End');
        await popup.keyboard.type('x');
        await expect(form.said).toHaveCount(0);
        await input.fill(values[0]!);
      }
    }
    expect(await changes()).toEqual([]);
    expect(await extension.readStorage()).toEqual(stored);
  });
}

test('popup Add mapping copies its typed name by Enter with the copy footer, storing and opening nothing', async ({ extension, site }) => {
  await extension.seedStorage({ mappings });
  const { page, popup } = await popupOnNewPage(extension, site);
  await checkFitAndAccessibility(popup);
  const view = await listViewInPopup(popup);
  await checkFitAndAccessibility(popup);
  await view.addMapping.click();
  const form = nameForm(popup);
  await expect(form.name).toBeFocused();
  await checkFitAndAccessibility(popup);
  const changes = await extension.watchStorage();
  const stored = await extension.readStorage();
  const pages = extension.context.pages();
  const addresses = pages.map((tab) => tab.url());
  const name = '  new café & name  ';
  await form.name.fill(name);
  await form.url.fill('https://new.example/');
  await expect(form.save).toHaveAttribute('aria-disabled', 'false');
  await form.copyName.focus();
  await expect(popup.locator('footer')).toHaveText('Enter copies the name');
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Enter');
  await expect(form.said).toHaveAttribute('role', 'status');
  await expect(form.said).toHaveText('Copied the name');
  expect(await clipboardText(page)).toBe(name);
  await expect(form.name).toHaveValue(name);
  expect(await changes()).toEqual([]);
  expect(await extension.readStorage()).toEqual(stored);
  expect(extension.context.pages()).toEqual(pages);
  expect(pages.map((tab) => tab.url())).toEqual(addresses);
  await checkFitAndAccessibility(popup);
});

test('options Add mapping copies its invalid URL by click, storing and opening nothing', async ({ extension, site }) => {
  await extension.seedStorage({ mappings });
  const clipboardPage = await extension.context.newPage();
  await clipboardPage.goto(site.pageUrl('Read Name form copies'));
  const view = await listViewOnOptionsPage(extension);
  const page = view.page;
  await page.bringToFront();
  await checkAccessibilityInBothSchemes(page);
  await view.addMapping.click();
  const form = nameForm(page);
  await expect(form.name).toBeFocused();
  await checkAccessibilityInBothSchemes(page);
  const changes = await extension.watchStorage();
  const stored = await extension.readStorage();
  const pages = extension.context.pages();
  const addresses = pages.map((tab) => tab.url());
  const url = '  not a URL /?x=é&y=%20  ';
  await form.name.fill('new name');
  await form.url.fill(url);
  await expect(form.url).toHaveAttribute('aria-invalid', 'true');
  await form.copyUrl.focus();
  await expect(page.locator('footer')).toHaveCount(0);
  await checkAccessibilityInBothSchemes(page);
  await form.copyUrl.click();
  await expect(form.said).toHaveAttribute('role', 'status');
  await expect(form.said).toHaveText('Copied the URL');
  await checkAccessibilityInBothSchemes(page);
  await clipboardPage.bringToFront();
  expect(await clipboardText(clipboardPage)).toBe(url);
  await page.bringToFront();
  await expect(form.url).toHaveValue(url);
  expect(await changes()).toEqual([]);
  expect(await extension.readStorage()).toEqual(stored);
  expect(extension.context.pages()).toEqual(pages);
  expect(pages.map((tab) => tab.url())).toEqual(addresses);
});
