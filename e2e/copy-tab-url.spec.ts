// *Copy tab URL* in the popup's Text view (G7, G31, G32, E5, L2; Composition, "Chrome"; S5, S14): a click or
// Enter copies exactly the address Chrome granted for the tab the popup was opened on; a popup with no grant
// offers nothing to copy and leaves the clipboard alone. The options page offers neither the control nor its
// note.
import { checkAccessibilityInBothSchemes, checkFitAndAccessibility, clipboardText, expect, popupOnNewPage, test, textViewInPopup, textViewOnOptionsPage } from './extension.ts';

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
