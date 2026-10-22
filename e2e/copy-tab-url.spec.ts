// *Copy tab URL* in the popup's Text view, its List view's *Add mapping* form and row editor, and the row editor
// a search row opens (G7, G31, G32, E5, L2; Composition, "Chrome"; S5, S14): a click or Enter copies exactly the
// address Chrome granted for the tab the popup was opened on; a popup with no grant offers nothing to copy and
// leaves the clipboard alone. The options page offers neither the control nor its note, and the List view's row
// editor offers no *Copy link*, which the search row's keeps.
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
  textViewInPopup,
  textViewOnOptionsPage,
} from './extension.ts';

const noAddress = 'Copy tab URL: Chrome gave no address for the tab this popup was opened on.';

for (const activation of ['click', 'Enter'] as const) {
  test(`Copy tab URL by ${activation} copies exactly the toolbar opener's address; a popup without a grant cannot replace it`, async ({ extension, site }) => {
    await extension.seedStorage({ mappings: 'a  https://a/\n' });
    const { page, popup } = await popupOnNewPage(extension, site);
    await checkFitAndAccessibility(popup);
    const view = await textViewInPopup(popup);
    await expect(view.copyTabUrl).toBeVisible();
    await expect(popup.getByText(noAddress, { exact: true })).toHaveCount(0);
    await checkFitAndAccessibility(popup);
    // Reach the control by keyboard, also pinning its footer before either activation.
    await view.area.focus();
    await popup.keyboard.press('Tab');
    await expect(view.save).toBeFocused();
    await popup.keyboard.press('Tab');
    await expect(view.copyTabUrl).toBeFocused();
    await expect(popup.locator('footer')).toHaveText("Enter copies the tab's address");
    if (activation === 'Enter') await popup.keyboard.press('Enter');
    else await view.copyTabUrl.click();
    await expect(popup.getByRole('status').filter({ hasText: "Copied the tab's address" })).toHaveText("Copied the tab's address");
    expect(await clipboardText(page)).toBe(page.url());
    await checkFitAndAccessibility(popup);
    await popup.close();

    const ungrantedPage = await extension.context.newPage();
    await ungrantedPage.goto(site.pageUrl('Never granted an address'));
    const ungrantedPopup = await extension.popupByCommand('open-new-tab', ungrantedPage);
    await checkFitAndAccessibility(ungrantedPopup);
    const ungrantedView = await textViewInPopup(ungrantedPopup);
    await expect(ungrantedView.copyTabUrl).toHaveCount(0);
    await expect(ungrantedPopup.getByText(noAddress, { exact: true })).toBeVisible();
    expect(await clipboardText(ungrantedPage)).toBe(page.url());
    await checkFitAndAccessibility(ungrantedPopup);
  });
}

test('the options page Text view offers neither Copy tab URL nor the missing-address note', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'a  https://a/\n' });
  const view = await textViewOnOptionsPage(extension);
  await expect(view.copyTabUrl).toHaveCount(0);
  await expect(view.page.getByText(noAddress, { exact: true })).toHaveCount(0);
  await checkAccessibilityInBothSchemes(view.page);
});

for (const activation of ['click', 'Enter'] as const) {
  test(`the popup's Add mapping Copy tab URL by ${activation} copies the opener's address; without a grant it says why and leaves the clipboard alone`, async ({ extension, site }) => {
    await extension.seedStorage({ mappings: 'a  https://a/\n' });
    const { page, popup } = await popupOnNewPage(extension, site);
    await checkFitAndAccessibility(popup);
    const view = await listViewInPopup(popup);
    await checkFitAndAccessibility(popup);
    await view.addMapping.click();
    const form = nameForm(popup);
    await expect(form.name).toBeFocused();
    await expect(view.copyTabUrl).toBeVisible();
    await expect(view.addForm.getByText(noAddress, { exact: true })).toHaveCount(0);
    // The heading precedes Copy tab URL, which precedes the focused Name field.
    const heading = (await view.addForm.getByRole('heading', { name: 'Add mapping', exact: true }).boundingBox())!;
    const copy = (await view.copyTabUrl.boundingBox())!;
    const name = (await form.name.boundingBox())!;
    expect(copy.y).toBeGreaterThanOrEqual(heading.y + heading.height);
    expect(name.y).toBeGreaterThanOrEqual(copy.y + copy.height);
    await popup.keyboard.press('Shift+Tab');
    await expect(view.copyTabUrl).toBeFocused();
    await expect(popup.locator('footer')).toHaveText("Enter copies the tab's address");
    await popup.keyboard.press('Tab');
    await expect(form.name).toBeFocused();
    await popup.keyboard.press('Shift+Tab');
    await checkFitAndAccessibility(popup);
    if (activation === 'Enter') await popup.keyboard.press('Enter');
    else await view.copyTabUrl.click();
    await expect(view.addForm.getByRole('status')).toHaveText("Copied the tab's address");
    expect(await clipboardText(page)).toBe(page.url());
    // Copying supplies the clipboard, leaving the new mapping's fields untouched.
    await expect(form.name).toHaveValue('');
    await expect(form.url).toHaveValue('');
    await checkFitAndAccessibility(popup);
    await popup.close();

    const ungrantedPage = await extension.context.newPage();
    await ungrantedPage.goto(site.pageUrl('No address for Add mapping'));
    const ungrantedPopup = await extension.popupByCommand('open-new-tab', ungrantedPage);
    await checkFitAndAccessibility(ungrantedPopup);
    const ungrantedView = await listViewInPopup(ungrantedPopup);
    await checkFitAndAccessibility(ungrantedPopup);
    await ungrantedView.addMapping.click();
    await expect(nameForm(ungrantedPopup).name).toBeFocused();
    await expect(ungrantedView.copyTabUrl).toHaveCount(0);
    await expect(ungrantedView.addForm.getByText(noAddress, { exact: true })).toBeVisible();
    expect(await clipboardText(ungrantedPage)).toBe(page.url());
    await checkFitAndAccessibility(ungrantedPopup);
  });
}

test('the options page Add mapping form offers neither Copy tab URL nor the missing-address note', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'a  https://a/\n' });
  const view = await listViewOnOptionsPage(extension);
  await checkAccessibilityInBothSchemes(view.page);
  await view.addMapping.click();
  await expect(nameForm(view.page).name).toBeFocused();
  await expect(view.copyTabUrl).toHaveCount(0);
  await expect(view.page.getByText(noAddress, { exact: true })).toHaveCount(0);
  await checkAccessibilityInBothSchemes(view.page);
});

for (const activation of ['click', 'Enter'] as const) {
  test(`the popup's List view row editor offers Copy tab URL above its fields, not Copy link; by ${activation} it copies the opener's address, storing nothing; without a grant it says why`, async ({ extension, site }) => {
    await extension.seedStorage({ mappings: 'a  https://a/\n' });
    const { page, popup } = await popupOnNewPage(extension, site);
    const view = await listViewInPopup(popup);
    await checkFitAndAccessibility(popup);
    const changes = await extension.watchStorage();
    await view.pencil('a').click();
    const editor = rowEditor(popup);
    await expect(editor.name).toBeFocused();
    await expect(editor.copyTabUrl).toBeVisible();
    await expect(editor.copyLink).toHaveCount(0);
    await expect(view.editor.getByText(noAddress, { exact: true })).toHaveCount(0);
    // Copy tab URL precedes the focused Name field.
    const copy = (await editor.copyTabUrl.boundingBox())!;
    const name = (await editor.name.boundingBox())!;
    expect(name.y).toBeGreaterThanOrEqual(copy.y + copy.height);
    await popup.keyboard.press('Shift+Tab');
    await expect(editor.copyTabUrl).toBeFocused();
    await expect(popup.locator('footer')).toHaveText("Enter copies the tab's address");
    await popup.keyboard.press('Tab');
    await expect(editor.name).toBeFocused();
    await popup.keyboard.press('Shift+Tab');
    await checkFitAndAccessibility(popup);
    if (activation === 'Enter') await popup.keyboard.press('Enter');
    else await editor.copyTabUrl.click();
    await expect(view.editor.getByRole('status')).toHaveText("Copied the tab's address");
    expect(await clipboardText(page)).toBe(page.url());
    // Copying supplies the clipboard for the URL field, leaving the field and the line as they were.
    await expect(editor.url).toHaveValue('https://a/');
    expect(await changes()).toEqual([]);
    await checkFitAndAccessibility(popup);
    await popup.close();

    const ungrantedPage = await extension.context.newPage();
    await ungrantedPage.goto(site.pageUrl('No address for the row editor'));
    const ungrantedPopup = await extension.popupByCommand('open-new-tab', ungrantedPage);
    const ungrantedView = await listViewInPopup(ungrantedPopup);
    await checkFitAndAccessibility(ungrantedPopup);
    await ungrantedView.pencil('a').click();
    await expect(rowEditor(ungrantedPopup).name).toBeFocused();
    await expect(rowEditor(ungrantedPopup).copyTabUrl).toHaveCount(0);
    await expect(ungrantedView.editor.getByText(noAddress, { exact: true })).toBeVisible();
    expect(await clipboardText(ungrantedPage)).toBe(page.url());
    await checkFitAndAccessibility(ungrantedPopup);
  });
}

test('the options page List view row editor offers neither Copy tab URL, its note, nor Copy link', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'a  https://a/\n' });
  const view = await listViewOnOptionsPage(extension);
  await view.pencil('a').click();
  const editor = rowEditor(view.page);
  await expect(editor.name).toBeFocused();
  await expect(editor.copyTabUrl).toHaveCount(0);
  await expect(view.page.getByText(noAddress, { exact: true })).toHaveCount(0);
  await expect(editor.copyLink).toHaveCount(0);
  await checkAccessibilityInBothSchemes(view.page);
});

for (const activation of ['click', 'Enter'] as const) {
  test(`the popup's row editor from a search row offers Copy tab URL above its fields, keeping Copy link; by ${activation} it copies the opener's address, storing nothing; without a grant it says why`, async ({ extension, site }) => {
    await extension.seedStorage({ mappings: 'a  https://a/\n' });
    const { page, popup } = await popupOnNewPage(extension, site);
    await popup.getByRole('combobox').fill('a');
    const editor = await editSelectedRow(popup);
    const changes = await extension.watchStorage();
    await expect(editor.copyTabUrl).toBeVisible();
    await expect(editor.copyLink).toBeVisible();
    await expect(popup.getByText(noAddress, { exact: true })).toHaveCount(0);
    // Copy tab URL precedes the focused Name field.
    const copy = (await editor.copyTabUrl.boundingBox())!;
    const name = (await editor.name.boundingBox())!;
    expect(name.y).toBeGreaterThanOrEqual(copy.y + copy.height);
    await popup.keyboard.press('Shift+Tab');
    await expect(editor.copyTabUrl).toBeFocused();
    await expect(popup.locator('footer')).toHaveText("Enter copies the tab's address");
    await popup.keyboard.press('Tab');
    await expect(editor.name).toBeFocused();
    await expect(popup.locator('footer')).toHaveText('Enter saves line 1');
    await popup.keyboard.press('Shift+Tab');
    await checkFitAndAccessibility(popup);
    if (activation === 'Enter') await popup.keyboard.press('Enter');
    else await editor.copyTabUrl.click();
    await expect(popup.getByRole('status').filter({ hasText: "Copied the tab's address" })).toHaveText("Copied the tab's address");
    expect(await clipboardText(page)).toBe(page.url());
    // Copying supplies the clipboard for the URL field, leaving the field and the line as they were.
    await expect(editor.url).toHaveValue('https://a/');
    expect(await changes()).toEqual([]);
    await checkFitAndAccessibility(popup);
    await popup.close();

    const ungrantedPage = await extension.context.newPage();
    await ungrantedPage.goto(site.pageUrl('No address for the search row editor'));
    const ungrantedPopup = await extension.popupByCommand('open-new-tab', ungrantedPage);
    await ungrantedPopup.getByRole('combobox').fill('a');
    const ungrantedEditor = await editSelectedRow(ungrantedPopup);
    await expect(ungrantedEditor.copyTabUrl).toHaveCount(0);
    await expect(ungrantedPopup.getByText(noAddress, { exact: true })).toBeVisible();
    await expect(ungrantedEditor.copyLink).toBeVisible();
    expect(await clipboardText(ungrantedPage)).toBe(page.url());
    await checkFitAndAccessibility(ungrantedPopup);
  });
}
