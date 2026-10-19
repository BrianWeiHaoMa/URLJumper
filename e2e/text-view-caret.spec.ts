// Where the Text view puts the caret (G17, G32, L2; Composition, "Settings views"; S14): the options page's
// `#view=text&line=N` names the stored document's line N, which a text area that turned a lone CR into a break
// shows lower down, and applies once, as the page opens; an activated error names a line of the text as it is
// now. The caret is in view, with the focus, and stays where it is when the focus leaves and comes back.
import type { Page } from '@playwright/test';
import { caret, checkAccessibilityInBothSchemes, checkFitAndAccessibility, expect, popupOnNewPage, retypeLine, test, textViewInPopup, textViewOnOptionsPage, type TextView } from './extension.ts';

const crlf = 'a  https://a/\r\nb  https://b/\r\nc  https://c/\r\n';

async function expectCaret(view: TextView, line: number, offset: number) {
  await expect.poll(() => caret(view.area)).toEqual({ focused: true, line, atLineStart: true, inView: true });
  expect(await view.area.evaluate((area: HTMLTextAreaElement) => area.selectionStart)).toBe(offset);
}

async function tabToSaveAndBack(page: Page, view: TextView, line: number, offset: number) {
  await page.keyboard.press('Tab');
  await expect(view.save).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expectCaret(view, line, offset);
}

test('a CRLF fragment places the caret on stored line 3 and preserves it through Tab to Save and back', async ({ extension }) => {
  await extension.seedStorage({ mappings: crlf });
  const view = await textViewOnOptionsPage(extension, '#view=text&line=3');
  await expect(view.area).toHaveValue(crlf.replaceAll('\r\n', '\n'));
  const offset = 'a  https://a/\nb  https://b/\n'.length;
  await expectCaret(view, 3, offset);
  await tabToSaveAndBack(view.page, view, 3, offset);
  await checkAccessibilityInBothSchemes(view.page);
});

for (const host of ['popup', 'options page'] as const) {
  test(`CRLF validation errors focus line 3 by Enter and click in the ${host}, retaining the caret through Tab`, async ({ extension, site }) => {
    const stored = crlf.replace('c  https://c/', 'just-a-name');
    await extension.seedStorage({ mappings: stored });
    let page: Page;
    let view: TextView;
    const check = () => host === 'popup' ? checkFitAndAccessibility(page) : checkAccessibilityInBothSchemes(page);
    if (host === 'popup') {
      const opened = await popupOnNewPage(extension, site);
      page = opened.popup;
      await checkFitAndAccessibility(page);
      view = await textViewInPopup(page);
    } else {
      const opened = await textViewOnOptionsPage(extension);
      page = opened.page;
      view = opened;
    }
    await expect(view.area).toHaveValue(stored.replaceAll('\r\n', '\n'));
    await check();
    await view.save.click();
    await expect(view.status).toHaveText('Not saved');
    await expect(view.errors).toHaveText(['Line 3: expected a name and a URL']);
    await check();
    for (const activation of ['Enter', 'click'] as const) {
      await view.area.focus();
      await page.keyboard.press('Control+Home');
      if (activation === 'Enter') {
        await view.errors.first().focus();
        await page.keyboard.press('Enter');
      } else await view.errors.first().click();
      const offset = 'a  https://a/\nb  https://b/\n'.length;
      await expectCaret(view, 3, offset);
      await tabToSaveAndBack(page, view, 3, offset);
      await expect(view.area).toHaveValue(stored.replaceAll('\r\n', '\n'));
      await check();
    }
    // An existing error follows the text's current offsets after a preceding line is edited.
    await retypeLine(view, 1, 'longer-name  https://a/');
    await view.errors.first().click();
    await expectCaret(view, 3, 'longer-name  https://a/\nb  https://b/\n'.length);
    expect((await extension.readStorage()).mappings).toBe(stored);
    await check();
  });
}

for (const requested of [250, 999]) {
  test(`fragment line ${requested} scrolls to the requested line or clamps to the last line`, async ({ extension }) => {
    const lines = Array.from({ length: 300 }, (_, i) => `m${i + 1}  https://m${i + 1}/`);
    await extension.seedStorage({ mappings: lines.join('\r\n') });
    const view = await textViewOnOptionsPage(extension, `#view=text&line=${requested}`);
    const line = Math.min(requested, 300);
    await expectCaret(view, line, lines.slice(0, line - 1).join('\n').length + 1);
    await checkAccessibilityInBothSchemes(view.page);
  });
}

for (const parameter of ['&line=0', '&line=x', '&line=-3', '&line=', '']) {
  test(`an ignored fragment line (${parameter || 'absent'}) leaves offset zero without focusing the text area`, async ({ extension }) => {
    await extension.seedStorage({ mappings: crlf });
    const view = await textViewOnOptionsPage(extension, `#view=text${parameter}`);
    await expect(view.area).not.toBeFocused();
    expect(await view.area.evaluate((area: HTMLTextAreaElement) => [area.selectionStart, area.selectionEnd])).toEqual([0, 0]);
    await checkAccessibilityInBothSchemes(view.page);
  });
}

test('a lone CR is content of stored line 1, so fragment line 2 starts on textarea line 3', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'x  https://x/\ry  https://y/\nlast  https://l/' });
  const view = await textViewOnOptionsPage(extension, '#view=text&line=2');
  await expect(view.area).toHaveValue('x  https://x/\ny  https://y/\nlast  https://l/');
  await expectCaret(view, 3, 'x  https://x/\ny  https://y/\n'.length);
  await checkAccessibilityInBothSchemes(view.page);
});

test('the fragment applies only when the options page opens, not after Preferences and Text are shown again', async ({ extension }) => {
  await extension.seedStorage({ mappings: crlf });
  const view = await textViewOnOptionsPage(extension, '#view=text&line=3');
  await expectCaret(view, 3, 'a  https://a/\nb  https://b/\n'.length);
  await checkAccessibilityInBothSchemes(view.page);
  const navigation = view.page.getByRole('navigation', { name: 'Settings views' });
  await navigation.getByRole('button', { name: 'Preferences', exact: true }).click();
  await expect(view.area).toHaveCount(0);
  await checkAccessibilityInBothSchemes(view.page);
  await navigation.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(view.area).toBeEditable();
  await expect(view.area).not.toBeFocused();
  expect(await view.area.evaluate((area: HTMLTextAreaElement) => [area.selectionStart, area.selectionEnd])).toEqual([0, 0]);
  await checkAccessibilityInBothSchemes(view.page);
});
